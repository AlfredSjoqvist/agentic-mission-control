// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fireSpreadEngine.js — Cellular Automata Fire Spread with Rothermel Factors
//
// Implements physically-based fire spread on a grid using:
//   - Wind direction and speed influence (Rothermel wind coefficient)
//   - Slope influence (fire spreads faster uphill, Rothermel slope coefficient)
//   - Fuel type and moisture (chaparral, grass, timber)
//   - Ember/spot fire generation (probabilistic long-range transport)
//   - Retardant effect zones (temporary ROS reduction)
//
// Grid coordinates map to the Palisades Fire area (~34.02-34.07°N, ~118.56-118.49°W)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Grid Configuration ──────────────────────────────────────────────────────
export const GRID_ROWS = 256;
export const GRID_COLS = 256;

// Map extent (degrees) — synced with 3D drone-view fire engine
const LAT_MIN = 33.70;
const LAT_MAX = 34.45;
const LNG_MIN = -119.00;
const LNG_MAX = -117.90;

const CELL_SIZE_M = 100; // ~100m per cell (synced with 3D engine)

// ─── Cell States ─────────────────────────────────────────────────────────────
export const UNBURNED = 0;
export const BURNING = 1;
export const BURNED = 2;
export const RETARDANT = 3; // retardant-treated, greatly reduced spread probability

// ─── NFFL Fuel Models (Anderson 13 + Scott & Burgan) ─────────────────────────
// Rothermel (1972) surface fire spread model. Reference: Anderson 1982, GTR INT-122
// extinctionMoisture = Mx: fuel moisture % above which fire cannot spread
// fuelLoad = tons/acre, SAV = surface-area-to-volume ratio (1/ft)
const FUEL_MODELS = {
  // NFFL 4: Chaparral (6ft) — dominant Palisades hillside fuel
  // Base rates tuned for ~95m cells — aggressive but containable with full response
  chaparral:    { baseRate: 0.12, intensity: 1.0,  moistureSensitivity: 1.2, extinctionMoisture: 20, fuelLoad: 13.0, SAV: 2000 },
  // NFFL 1: Short grass — coastal bluffs, cleared areas
  grass:        { baseRate: 0.16, intensity: 0.6,  moistureSensitivity: 1.5, extinctionMoisture: 12, fuelLoad: 0.74, SAV: 3500 },
  // NFFL 10: Timber litter (heavy) — canyon riparian, oak woodland
  timber:       { baseRate: 0.07, intensity: 0.8,  moistureSensitivity: 0.8, extinctionMoisture: 25, fuelLoad: 12.0, SAV: 2000 },
  // SB NB-U: Urban/developed — structure-to-structure via embers & radiant heat
  urban:        { baseRate: 0.04, intensity: 0.4,  moistureSensitivity: 0.5, extinctionMoisture: 40, fuelLoad: 2.0,  SAV: 1500 },
  // NB1: Non-burnable — ocean, rock, roads, water
  rock_bare:    { baseRate: 0.0,  intensity: 0.0,  moistureSensitivity: 0.0, extinctionMoisture: 0,  fuelLoad: 0.0,  SAV: 0 },
};

// ─── Direction Vectors (8-connected neighbors) ───────────────────────────────
// Index: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
const DIR_DR = [-1, -1, 0, 1, 1, 1, 0, -1];
const DIR_DC = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees from N
const DIAG_FACTOR = 1 / Math.SQRT2; // diagonal cells are farther apart

// ─── Perlin-ish Noise for Terrain/Fuel Generation ────────────────────────────
function pseudoNoise(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function fbmNoise(x, y, seed, octaves = 4) {
  let val = 0, amp = 0.5, freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * pseudoNoise(x * freq, y * freq, seed + i * 17.3);
    amp *= 0.5;
    freq *= 2.0;
  }
  return val;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FireSpreadEngine Class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class FireSpreadEngine {
  constructor(options = {}) {
    this.rows = options.rows || GRID_ROWS;
    this.cols = options.cols || GRID_COLS;

    // ── Grid arrays (flat for performance) ──
    this.cells = new Uint8Array(this.rows * this.cols);       // cell state
    this.burnTime = new Float32Array(this.rows * this.cols);   // when cell started burning
    this.elevation = new Float32Array(this.rows * this.cols);  // meters
    this.slope = new Float32Array(this.rows * this.cols);      // degrees
    this.aspect = new Float32Array(this.rows * this.cols);     // degrees from N
    this.fuelType = new Uint8Array(this.rows * this.cols);     // fuel model index
    this.fuelMoisture = new Float32Array(this.rows * this.cols); // % (0-30)
    this.retardantTimer = new Float32Array(this.rows * this.cols); // minutes remaining

    // ── Weather state ──
    this.windSpeed = options.windSpeed || 25;        // mph
    this.windDirection = options.windDirection || 315; // degrees from N (315 = NW)
    this.humidity = options.humidity || 12;            // %
    this.temperature = options.temperature || 94;      // °F

    // ── Simulation state ──
    this.timestep = 0;
    this.totalAcres = 0;
    this.spotFires = []; // { row, col, age }

    // ── Fuel model lookup ──
    this.fuelModels = ['chaparral', 'grass', 'timber', 'urban', 'rock_bare'];

    // ── Generate terrain ──
    this._generateTerrain();
  }

  // ─── Terrain Generation ────────────────────────────────────────────────────
  _generateTerrain() {
    const { rows, cols } = this;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const nx = c / cols;
        const ny = r / rows;

        // Elevation: canyon terrain with ridges (Palisades topography)
        // Base elevation rises from coast (south) to mountains (north)
        const baseElev = 200 + (1 - ny) * 800; // 200-1000m, higher to north
        const ridge = Math.sin(nx * Math.PI * 3) * 150; // ridge/canyon pattern
        const noise = fbmNoise(nx * 6, ny * 6, 42.0) * 200;
        this.elevation[idx] = baseElev + ridge + noise;

        // Ocean detection — Southern California coastline
        // ny = 1 - (lat - LAT_MIN)/(LAT_MAX - LAT_MIN), nx = (lng - LNG_MIN)/(LNG_MAX - LNG_MIN)
        // Convert lat/lng to grid coords for coastline check
        const cellLat = LAT_MAX - ny * (LAT_MAX - LAT_MIN);
        const cellLng = LNG_MIN + nx * (LNG_MAX - LNG_MIN);
        // Coastline approximation — Malibu to Santa Monica to Palos Verdes
        // Accurate enough to block ocean, but not eat into burnable land
        let coastLat;
        if (cellLng < -118.95) {
          // Far west past Point Dume — coast curves north along PCH
          coastLat = 34.04 + (cellLng + 119.00) * 1.0;
        } else if (cellLng < -118.80) {
          // Point Dume to Malibu — coast runs ~ENE around 34.03-34.04
          coastLat = 34.03 + (cellLng + 118.95) * 0.1;
        } else if (cellLng < -118.65) {
          // Malibu Colony to Pepperdine — coast at ~34.03
          coastLat = 34.035 + (cellLng + 118.80) * 0.03;
        } else if (cellLng < -118.53) {
          // Pepperdine to Pacific Palisades — coast drops to ~34.02
          coastLat = 34.04 + (cellLng + 118.65) * 0.08;
        } else if (cellLng < -118.49) {
          // Pacific Palisades bluffs — coast at ~34.03
          coastLat = 34.03 + (cellLng + 118.53) * 0.25;
        } else if (cellLng < -118.40) {
          // Santa Monica to Venice — coast drops south to ~34.01
          coastLat = 34.015 + (cellLng + 118.49) * 0.5;
        } else if (cellLng < -118.25) {
          // Marina del Rey to LAX — coast at ~33.96
          coastLat = 33.96 + (cellLng + 118.40) * 0.6;
        } else if (cellLng < -118.10) {
          // South Bay — Redondo, Hermosa
          coastLat = 33.86 + (cellLng + 118.25) * 0.1;
        } else {
          coastLat = 33.76;
        }
        if (cellLat < coastLat) {
          this.fuelType[idx] = 4; // rock_bare (ocean — non-combustible)
          this.elevation[idx] = 0;
          this.fuelMoisture[idx] = 100;
          continue; // skip fuel assignment below
        }

        // Fuel type: mostly chaparral with some grass in valleys, timber on ridges
        const fuelNoise = fbmNoise(nx * 4, ny * 4, 137.0);
        if (fuelNoise < 0.2) {
          this.fuelType[idx] = 1; // grass (valleys)
        } else if (fuelNoise > 0.85) {
          this.fuelType[idx] = 2; // timber (high elevation)
        } else if (this.elevation[idx] < 220 && fuelNoise > 0.6) {
          this.fuelType[idx] = 3; // urban (low elevation near coast)
        } else {
          this.fuelType[idx] = 0; // chaparral (dominant)
        }

        // Fuel moisture: lower on south-facing slopes and in chaparral
        const baseMoisture = 3 + this.humidity * 0.2;
        const moistureNoise = fbmNoise(nx * 8, ny * 8, 99.0) * 4;
        this.fuelMoisture[idx] = Math.max(1, baseMoisture + moistureNoise);
      }
    }

    // Compute slope and aspect from elevation
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c;
        const dzdx = (this.elevation[idx + 1] - this.elevation[idx - 1]) / (2 * CELL_SIZE_M);
        const dzdy = (this.elevation[(r + 1) * cols + c] - this.elevation[(r - 1) * cols + c]) / (2 * CELL_SIZE_M);
        this.slope[idx] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI;
        this.aspect[idx] = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
      }
    }
  }

  // ─── Ignite cells (initial fire) ───────────────────────────────────────────
  ignite(centerRow, centerCol, radius = 3) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr * dr + dc * dc > radius * radius) continue;
        const r = centerRow + dr;
        const c = centerCol + dc;
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          const idx = r * this.cols + c;
          // Skip ocean tiles (fuelType 4 with 100% moisture = ocean)
          if (this.fuelType[idx] === 4 && this.fuelMoisture[idx] >= 100) continue;
          if (this.cells[idx] === UNBURNED) {
            this.cells[idx] = BURNING;
            this.burnTime[idx] = this.timestep;
          }
        }
      }
    }
  }

  // ─── Ignite at lat/lng coordinates ─────────────────────────────────────────
  igniteAtLatLng(lat, lng, radius = 3) {
    const { row, col } = this.latLngToCell(lat, lng);
    this.ignite(row, col, radius);
  }

  // ─── Apply retardant line (realistic strip, not circle) ────────────────────
  applyRetardant(centerRow, centerCol, radius = 5, durationMinutes = 45) {
    // Draw a line perpendicular to wind direction (width=2 cells)
    const windRad = ((this.windDirection + 180) % 360) * Math.PI / 180;
    const perpR = Math.sin(windRad);
    const perpC = Math.cos(windRad);
    const length = radius;
    const width = 2;
    for (let l = -length; l <= length; l++) {
      for (let w = -width; w <= width; w++) {
        const r = Math.round(centerRow + perpR * l + Math.cos(windRad) * w * 0.5);
        const c = Math.round(centerCol + perpC * l - Math.sin(windRad) * w * 0.5);
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          const idx = r * this.cols + c;
          if (this.cells[idx] === UNBURNED) {
            this.cells[idx] = RETARDANT;
            this.retardantTimer[idx] = durationMinutes;
          }
        }
      }
    }
  }

  // ─── Suppress burning cells (water/foam from engines, heli) ────────────
  // Returns number of cells actually suppressed
  suppressCell(row, col, radius = 1) {
    let count = 0;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr * dr + dc * dc > radius * radius) continue;
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          const idx = r * this.cols + c;
          if (this.cells[idx] === BURNING) {
            this.cells[idx] = BURNED;
            count++;
          }
        }
      }
    }
    return count;
  }

  // ─── Build fireline (hand crew, dozer, hotshot) ───────────────────────
  // Bresenham line of RETARDANT cells between two points
  buildFireline(r1, c1, r2, c2, width = 1, durationMinutes = 60) {
    const dr = Math.abs(r2 - r1), dc = Math.abs(c2 - c1);
    const sr = r1 < r2 ? 1 : -1, sc = c1 < c2 ? 1 : -1;
    let err = dr - dc, cr = r1, cc = c1;
    const maxSteps = dr + dc + 2;
    for (let step = 0; step <= maxSteps; step++) {
      for (let w = -width; w <= width; w++) {
        const wr = cr + (dc > dr ? 0 : w), wc = cc + (dc > dr ? w : 0);
        if (wr >= 0 && wr < this.rows && wc >= 0 && wc < this.cols) {
          const idx = wr * this.cols + wc;
          if (this.cells[idx] === UNBURNED) {
            this.cells[idx] = RETARDANT;
            this.retardantTimer[idx] = durationMinutes;
          }
        }
      }
      if (cr === r2 && cc === c2) break;
      const e2 = 2 * err;
      if (e2 > -dc) { err -= dc; cr += sr; }
      if (e2 < dr) { err += dr; cc += sc; }
    }
  }

  // ─── Ignition Probability Map ──────────────────────────────────────────
  // Returns Float32Array[rows×cols] with 0-1 ignition likelihood per cell.
  // Based on Rothermel factors: fuel type, moisture vs extinction moisture,
  // wind exposure, slope, and proximity to active fire.
  // This is what fire behavior analysts compute for "probability of ignition" (PIG).
  getIgnitionProbabilityMap() {
    const { rows, cols } = this;
    const prob = new Float32Array(rows * cols);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (this.cells[idx] === BURNING || this.cells[idx] === BURNED) {
          prob[idx] = this.cells[idx] === BURNING ? 1.0 : 0.0;
          continue;
        }

        const fuelName = this.fuelModels[this.fuelType[idx]];
        const fuel = FUEL_MODELS[fuelName];
        if (fuel.baseRate === 0) { prob[idx] = 0; continue; }

        // Base ignition from fuel receptivity (SAV: fine fuels catch easier)
        let p = fuel.baseRate * (fuel.SAV / 2000);

        // Moisture damping (Rothermel ηM polynomial)
        const moisture = this.fuelMoisture[idx];
        const Mx = fuel.extinctionMoisture || 20;
        if (moisture >= Mx) { prob[idx] = 0; continue; }
        const ratio = moisture / Mx;
        const nM = 1 - 2.59 * ratio + 5.11 * ratio * ratio - 3.52 * ratio * ratio * ratio;
        p *= Math.max(0, nM);

        // Wind exposure: cells downwind are more vulnerable
        const windBoost = 1.0 + (this.windSpeed / 25) * 0.5;
        p *= windBoost;

        // Slope: uphill cells more vulnerable
        if (this.slope[idx] > 5) {
          p *= 1.0 + (this.slope[idx] / 30) * 0.5;
        }

        // Temperature/humidity (Byram 1959): PIG increases with temp, decreases with RH
        const tempFactor = 1.0 + (this.temperature - 70) * 0.01;
        const humidFactor = Math.max(0.3, 1.0 - (this.humidity - 5) * 0.02);
        p *= tempFactor * humidFactor;

        prob[idx] = Math.min(1.0, Math.max(0, p));
      }
    }
    return prob;
  }

  // ─── Set weather (for wind shift events) ───────────────────────────────────
  setWeather({ windSpeed, windDirection, humidity, temperature }) {
    if (windSpeed !== undefined) this.windSpeed = windSpeed;
    if (windDirection !== undefined) this.windDirection = windDirection;
    if (humidity !== undefined) this.humidity = humidity;
    if (temperature !== undefined) this.temperature = temperature;
  }

  // ─── Coordinate Conversion ─────────────────────────────────────────────────
  latLngToCell(lat, lng) {
    const row = Math.floor((1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * this.rows);
    const col = Math.floor((lng - LNG_MIN) / (LNG_MAX - LNG_MIN) * this.cols);
    return {
      row: Math.max(0, Math.min(this.rows - 1, row)),
      col: Math.max(0, Math.min(this.cols - 1, col)),
    };
  }

  cellToLatLng(row, col) {
    return {
      lat: LAT_MAX - (row / this.rows) * (LAT_MAX - LAT_MIN),
      lng: LNG_MIN + (col / this.cols) * (LNG_MAX - LNG_MIN),
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CORE: Calculate spread probability from burning cell to neighbor
  //
  // Based on Rothermel factors:
  //   P(spread) = base_rate × wind_factor × slope_factor × moisture_factor × fuel_factor
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  _spreadProbability(fromRow, fromCol, dirIndex) {
    const toRow = fromRow + DIR_DR[dirIndex];
    const toCol = fromCol + DIR_DC[dirIndex];

    // Bounds check
    if (toRow < 0 || toRow >= this.rows || toCol < 0 || toCol >= this.cols) return 0;

    const toIdx = toRow * this.cols + toCol;
    const toState = this.cells[toIdx];

    // Can only spread to unburned or retardant-treated cells
    if (toState === BURNING || toState === BURNED) return 0;

    // ── Fuel factor ──
    const fuelName = this.fuelModels[this.fuelType[toIdx]];
    const fuel = FUEL_MODELS[fuelName];
    if (fuel.baseRate === 0) return 0; // non-combustible

    let P = fuel.baseRate;

    // ── Wind factor (Rothermel wind coefficient φ_w) ──
    // Fire spreads faster downwind. Factor ranges from 0.3 (headwind) to 3.0 (tailwind)
    const spreadAngle = DIR_ANGLES[dirIndex]; // direction fire is spreading
    const windAngle = (this.windDirection + 180) % 360; // direction wind is blowing TO
    const angleDiff = Math.abs(spreadAngle - windAngle);
    const cosAngle = Math.cos((Math.min(angleDiff, 360 - angleDiff)) * Math.PI / 180);

    // Wind factor: exponential increase with wind speed (Rothermel approximation)
    // At 25 mph: tailwind = ~3x, crosswind = ~1x, headwind = ~0.3x
    const windMagnitude = 1.0 + (this.windSpeed / 15) * 0.8;
    const windFactor = Math.pow(windMagnitude, cosAngle);
    P *= windFactor;

    // ── Slope factor (Rothermel slope coefficient φ_s) ──
    // Fire spreads faster UPHILL. Slope doubles spread per 20° of upslope.
    const fromIdx = fromRow * this.cols + fromCol;
    const elevDiff = this.elevation[toIdx] - this.elevation[fromIdx];
    const slopeDeg = Math.atan2(elevDiff, CELL_SIZE_M) * 180 / Math.PI;

    if (slopeDeg > 0) {
      // Uphill: exponential increase (Rothermel: φ_s = 5.275 × β^-0.3 × tan²(slope))
      // Simplified: double per 20°
      P *= Math.pow(2, slopeDeg / 20);
    } else {
      // Downhill: reduced but not zero (fire can still spread downhill slowly)
      P *= Math.max(0.15, 1 + slopeDeg / 60);
    }

    // ── Moisture factor (Rothermel moisture damping coefficient ηM) ──
    // Fire CANNOT spread when fuel moisture ≥ extinction moisture (Mx).
    // ηM = 1 − 2.59·(M/Mx) + 5.11·(M/Mx)² − 3.52·(M/Mx)³  [Rothermel 1972]
    const moisture = this.fuelMoisture[toIdx];
    const Mx = fuel.extinctionMoisture || 20;
    if (moisture >= Mx) return 0; // physically impossible to ignite
    const ratio = moisture / Mx;
    const moistureDamping = 1 - 2.59 * ratio + 5.11 * ratio * ratio - 3.52 * ratio * ratio * ratio;
    P *= Math.max(0, moistureDamping);

    // ── Retardant effect ──
    if (toState === RETARDANT) {
      P *= 0.05; // 95% reduction in spread probability
    }

    // ── Diagonal cells are farther apart ──
    if (dirIndex % 2 === 1) {
      P *= DIAG_FACTOR;
    }

    // ── Clamp ──
    return Math.min(0.95, Math.max(0, P));
  }

  // ─── Ember/Spot Fire Generation ────────────────────────────────────────────
  // High-intensity burning cells can loft embers downwind
  _generateSpotFires() {
    const newSpots = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (this.cells[idx] !== BURNING) continue;

        const fuelName = this.fuelModels[this.fuelType[idx]];
        const fuel = FUEL_MODELS[fuelName];

        // Only high-intensity fires generate spot fires
        if (fuel.intensity < 0.7) continue;

        // Probability of ember generation per burning cell per timestep
        // Higher wind = more embers. Higher intensity = more embers.
        const emberProb = 0.0004 * fuel.intensity * (this.windSpeed / 20); // reduced for 95m cells

        if (Math.random() < emberProb) {
          // Ember transport: travel downwind, distance proportional to wind speed
          const windRad = ((this.windDirection + 180) % 360) * Math.PI / 180;
          const dist = 5 + Math.random() * (this.windSpeed / 5) * 8; // 5-40+ cells
          const spotR = Math.round(r - Math.cos(windRad) * dist); // N = -row
          const spotC = Math.round(c + Math.sin(windRad) * dist);

          if (spotR >= 0 && spotR < this.rows && spotC >= 0 && spotC < this.cols) {
            const spotIdx = spotR * this.cols + spotC;
            if (this.cells[spotIdx] === UNBURNED) {
              // Spot fire ignition probability based on fuel receptivity
              const spotFuel = FUEL_MODELS[this.fuelModels[this.fuelType[spotIdx]]];
              if (spotFuel.baseRate > 0 && Math.random() < 0.4) {
                newSpots.push({ row: spotR, col: spotC });
              }
            }
          }
        }
      }
    }

    // Ignite spot fires
    for (const spot of newSpots) {
      const idx = spot.row * this.cols + spot.col;
      this.cells[idx] = BURNING;
      this.burnTime[idx] = this.timestep;
      this.spotFires.push({ ...spot, age: 0 });
    }

    return newSpots;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP: Advance simulation by one timestep (~1 minute of real time)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  step() {
    this.timestep++;
    const { rows, cols } = this;
    const toIgnite = [];
    const toBurnOut = [];

    // ── Phase 1: Check spread from each burning cell ──
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (this.cells[idx] !== BURNING) continue;

        // Burn duration: cells burn for 8-20 timesteps depending on fuel
        const fuelName = this.fuelModels[this.fuelType[idx]];
        const burnDuration = fuelName === 'grass' ? 8 : fuelName === 'chaparral' ? 15 : 20;
        if (this.timestep - this.burnTime[idx] > burnDuration) {
          toBurnOut.push(idx);
          continue;
        }

        // Try to spread to each neighbor
        for (let d = 0; d < 8; d++) {
          const nr = r + DIR_DR[d];
          const nc = c + DIR_DC[d];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nIdx = nr * cols + nc;
          if (this.cells[nIdx] === BURNING || this.cells[nIdx] === BURNED) continue;

          const prob = this._spreadProbability(r, c, d);
          if (Math.random() < prob) {
            toIgnite.push(nIdx);
          }
        }
      }
    }

    // ── Phase 2: Apply state changes ──
    for (const idx of toBurnOut) {
      this.cells[idx] = BURNED;
    }
    for (const idx of toIgnite) {
      if (this.cells[idx] !== BURNING && this.cells[idx] !== BURNED) {
        this.cells[idx] = BURNING;
        this.burnTime[idx] = this.timestep;
      }
    }

    // ── Phase 3: Spot fires ──
    const newSpots = this._generateSpotFires();

    // ── Phase 4: Decay retardant timers ──
    for (let i = 0; i < rows * cols; i++) {
      if (this.cells[i] === RETARDANT) {
        this.retardantTimer[i] -= 1; // 1 min per timestep
        if (this.retardantTimer[i] <= 0) {
          this.cells[i] = UNBURNED; // retardant expired
        }
      }
    }

    // ── Phase 5: Update statistics ──
    let burningCount = 0;
    let burnedCount = 0;
    for (let i = 0; i < rows * cols; i++) {
      if (this.cells[i] === BURNING) burningCount++;
      if (this.cells[i] === BURNED || this.cells[i] === BURNING) burnedCount++;
    }
    // Each cell is ~50m × 50m = 2500 m² = 0.000617 acres
    this.totalAcres = burnedCount * CELL_SIZE_M * CELL_SIZE_M / 4047;

    return {
      timestep: this.timestep,
      newIgnitions: toIgnite.length,
      newSpotFires: newSpots.length,
      burningCells: burningCount,
      burnedCells: burnedCount,
      totalAcres: this.totalAcres,
    };
  }

  // ─── Run multiple steps (for time projection) ─────────────────────────────
  runSteps(n) {
    const results = [];
    for (let i = 0; i < n; i++) {
      results.push(this.step());
    }
    return results;
  }

  // ─── Snapshot: capture current grid state for rendering ────────────────────
  snapshot() {
    return {
      cells: new Uint8Array(this.cells),
      burnTime: new Float32Array(this.burnTime),
      timestep: this.timestep,
      totalAcres: this.totalAcres,
      spotFires: [...this.spotFires],
      windDirection: this.windDirection,
      windSpeed: this.windSpeed,
    };
  }

  // ─── Fork: create a copy for running "what-if" projections ─────────────────
  fork() {
    const copy = new FireSpreadEngine({
      rows: this.rows,
      cols: this.cols,
      windSpeed: this.windSpeed,
      windDirection: this.windDirection,
      humidity: this.humidity,
      temperature: this.temperature,
    });
    copy.cells.set(this.cells);
    copy.burnTime.set(this.burnTime);
    copy.elevation.set(this.elevation);
    copy.slope.set(this.slope);
    copy.aspect.set(this.aspect);
    copy.fuelType.set(this.fuelType);
    copy.fuelMoisture.set(this.fuelMoisture);
    copy.retardantTimer.set(this.retardantTimer);
    copy.timestep = this.timestep;
    copy.totalAcres = this.totalAcres;
    copy.spotFires = [...this.spotFires];
    return copy;
  }

  // ─── Generate time projections (now, +1h, +3h) ────────────────────────────
  // Returns 3 snapshots: current state, +60 steps, +180 steps
  generateProjections() {
    const now = this.snapshot();

    const fork1h = this.fork();
    fork1h.runSteps(60); // 60 min
    const oneHour = fork1h.snapshot();

    const fork3h = this.fork();
    fork3h.runSteps(180); // 180 min
    const threeHour = fork3h.snapshot();

    return { now, oneHour, threeHour };
  }

  // ─── Get fire perimeter as array of {row, col} points ──────────────────────
  getPerimeter() {
    const perimeter = [];
    const { rows, cols } = this;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (this.cells[idx] !== BURNING && this.cells[idx] !== BURNED) continue;

        // Check if this cell borders an unburned cell
        let isEdge = false;
        for (let d = 0; d < 8; d++) {
          const nr = r + DIR_DR[d];
          const nc = c + DIR_DC[d];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) { isEdge = true; break; }
          const nState = this.cells[nr * cols + nc];
          if (nState === UNBURNED || nState === RETARDANT) { isEdge = true; break; }
        }
        if (isEdge) perimeter.push({ row: r, col: c });
      }
    }

    return perimeter;
  }

  // ─── Get active front cells (burning + on perimeter) ───────────────────────
  getActiveFronts() {
    const fronts = [];
    const { rows, cols } = this;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.cells[r * cols + c] !== BURNING) continue;

        // Check if any neighbor is unburned (this is an active front)
        for (let d = 0; d < 8; d++) {
          const nr = r + DIR_DR[d];
          const nc = c + DIR_DC[d];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nState = this.cells[nr * cols + nc];
          if (nState === UNBURNED || nState === RETARDANT) {
            fronts.push({ row: r, col: c });
            break;
          }
        }
      }
    }

    return fronts;
  }

  // ─── Get statistics ────────────────────────────────────────────────────────
  getStats() {
    let burning = 0, burned = 0, retardant = 0;
    for (let i = 0; i < this.rows * this.cols; i++) {
      if (this.cells[i] === BURNING) burning++;
      else if (this.cells[i] === BURNED) burned++;
      else if (this.cells[i] === RETARDANT) retardant++;
    }

    // Rate of spread: approximate from burning cells at perimeter
    const fronts = this.getActiveFronts();
    const rosChHr = fronts.length > 0
      ? (fronts.length * CELL_SIZE_M / 20.1168) / Math.max(1, this.timestep) * 60 // chains/hour
      : 0;

    return {
      timestep: this.timestep,
      burning,
      burned,
      retardant,
      totalAffected: burning + burned,
      totalAcres: (burning + burned) * CELL_SIZE_M * CELL_SIZE_M / 4047,
      activeFrontCells: fronts.length,
      rosChainPerHour: Math.round(rosChHr * 10) / 10,
      spotFireCount: this.spotFires.length,
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Create a pre-configured engine for the Palisades Fire scenario
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createPalisadesScenario() {
  const engine = new FireSpreadEngine({
    windSpeed: 25,       // 25 mph NW wind (Santa Ana conditions)
    windDirection: 315,  // NW (blowing from NW to SE)
    humidity: 12,        // 12% — very dry
    temperature: 94,     // 94°F
  });

  // Ignite at Palisades fire origin point
  engine.igniteAtLatLng(34.045, -118.529);

  // Run initial 10 steps to establish the fire
  engine.runSteps(10);

  return engine;
}
