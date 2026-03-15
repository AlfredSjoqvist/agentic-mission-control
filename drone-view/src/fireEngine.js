// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fireEngine.js — Cellular Automata Fire Spread (Rothermel-simplified)
// Grid: 80m cells, 167 rows × 185 cols over Pacific Palisades / Malibu
// Each tick = 1 simulated minute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GRID_ROWS = 167;
export const GRID_COLS = 185;
export const CELL_SIZE = 80; // meters

export const LAT_MIN = 33.99;
export const LAT_MAX = 34.11;
export const LNG_MIN = -118.60;
export const LNG_MAX = -118.44;

// Cell states (one-way: UNBURNED → BURNING → BURNED)
export const UNBURNED = 0;
export const BURNING  = 1;
export const BURNED   = 2;

// Fuel types
const FUEL = {
  WATER:  { id: 0, rate: 0.00, burnDur: 0  },
  ROAD:   { id: 1, rate: 0.04, burnDur: 3  },
  URBAN:  { id: 2, rate: 0.28, burnDur: 20 },
  TIMBER: { id: 3, rate: 0.50, burnDur: 25 },
  BRUSH:  { id: 4, rate: 0.80, burnDur: 15 },
  GRASS:  { id: 5, rate: 1.00, burnDur: 8  },
};
const FUEL_BY_ID = Object.values(FUEL);

// 8-connected neighbor offsets
const DR = [-1, -1, 0, 1, 1, 1, 0, -1];
const DC = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_ANGLES_RAD = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];

// Noise
function hash(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}
function fbm(x, y, s, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * hash(x * f, y * f, s + i * 17); a *= 0.5; f *= 2; }
  return v;
}

export class FireEngine {
  constructor() {
    const N = GRID_ROWS * GRID_COLS;
    this.cells     = new Uint8Array(N);
    this.fuelType  = new Uint8Array(N);
    this.elevation = new Float32Array(N);
    this.intensity = new Float32Array(N);
    this.age       = new Uint16Array(N);

    this.windSpeed = 30;       // km/h
    this.windDir   = 315;      // degrees, blowing FROM (NW Santa Ana)
    this.tick      = 0;

    this._buildTerrain();
  }

  _buildTerrain() {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        const latNorm = r / GRID_ROWS;   // 0 = south, 1 = north
        const lngNorm = c / GRID_COLS;   // 0 = west, 1 = east

        // Procedural elevation model
        let elev = latNorm * 380; // base: south=0, north=380m
        // Main east-west ridge at latNorm=0.6
        elev += Math.exp(-Math.pow((latNorm - 0.6) * 5, 2)) * 700;
        // Topanga Canyon (lngNorm≈0.28)
        elev -= Math.exp(-Math.pow((lngNorm - 0.28) * 8, 2)) * 1200 * Math.max(0, latNorm - 0.3);
        // Temescal Canyon (lngNorm≈0.65)
        elev -= Math.exp(-Math.pow((lngNorm - 0.65) * 10, 2)) * 800 * Math.max(0, latNorm - 0.25);
        // Coastal bluffs
        if (latNorm < 0.15 && lngNorm > 0.5) elev = Math.max(elev, 30);
        // Sinusoidal noise
        elev += Math.sin(latNorm * 12.5 + lngNorm * 8.3) * 35;
        elev += fbm(latNorm * 6, lngNorm * 6, 42) * 70 - 35;

        this.elevation[idx] = Math.max(0, elev);

        // Terrain classification → fuel type
        let fuel;
        // Ocean: coastline runs NW→SE across the grid
        // At lngNorm=0 (west/Malibu): coast at latNorm≈0.42
        // At lngNorm=0.5 (Palisades): coast at latNorm≈0.29
        // At lngNorm=1.0 (east/Santa Monica): coast at latNorm≈0.17
        const coastLine = 0.42 - 0.25 * lngNorm;
        if (latNorm < coastLine || elev <= 2) {
          fuel = FUEL.WATER;
        }
        // Roads: PCH (latNorm≈0.08), Sunset (latNorm≈0.35), Topanga Cyn Rd, Temescal Cyn Rd
        else if (
          (Math.abs(latNorm - 0.08) < 0.008) ||
          (Math.abs(latNorm - 0.35) < 0.006 && lngNorm > 0.2 && lngNorm < 0.8) ||
          (Math.abs(lngNorm - 0.28) < 0.008 && latNorm > 0.1 && latNorm < 0.7) ||
          (Math.abs(lngNorm - 0.65) < 0.008 && latNorm > 0.1 && latNorm < 0.5)
        ) {
          fuel = FUEL.ROAD;
        }
        // Urban: Pacific Palisades residential
        else if (elev < 160 && latNorm > 0.15 && latNorm < 0.45 && lngNorm > 0.35 && lngNorm < 0.75) {
          fuel = FUEL.URBAN;
        }
        // Urban: Malibu coastal
        else if (elev < 80 && latNorm < 0.2 && lngNorm < 0.35) {
          fuel = FUEL.URBAN;
        }
        // Grass: low elevation open areas
        else if (elev < 70) {
          fuel = FUEL.GRASS;
        }
        // Timber: high elevation
        else if (elev > 280 || (elev > 200 && latNorm > 0.7)) {
          fuel = FUEL.TIMBER;
        }
        // Brush (chaparral): everything else
        else {
          fuel = FUEL.BRUSH;
        }
        this.fuelType[idx] = fuel.id;
      }
    }
  }

  // Convert lat/lng to grid cell
  latLngToCell(lat, lng) {
    // latNorm 0=south, row 0=south → row = latNorm * ROWS
    const latNorm = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
    const lngNorm = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN);
    return {
      row: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(latNorm * GRID_ROWS))),
      col: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(lngNorm * GRID_COLS))),
    };
  }

  cellToLatLng(row, col) {
    return {
      lat: LAT_MIN + (row / GRID_ROWS) * (LAT_MAX - LAT_MIN),
      lng: LNG_MIN + (col / GRID_COLS) * (LNG_MAX - LNG_MIN),
    };
  }

  // Ignite a circular area (radius in cells)
  ignite(row, col, radius = 2) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr * dr + dc * dc > radius * radius) continue;
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
        const idx = r * GRID_COLS + c;
        if (this.cells[idx] !== UNBURNED) continue;
        if (FUEL_BY_ID[this.fuelType[idx]].rate === 0) continue; // skip water
        this.cells[idx] = BURNING;
        this.intensity[idx] = 0.3 + Math.random() * 0.3;
        this.age[idx] = 0;
      }
    }
  }

  igniteAtLatLng(lat, lng, radius = 2) {
    const { row, col } = this.latLngToCell(lat, lng);
    this.ignite(row, col, radius);
  }

  // One simulation tick (= 1 minute)
  step() {
    this.tick++;
    const toIgnite = [];

    // Wind: "blowing FROM" windDir, fire pushes opposite
    const windToRad = ((this.windDir + 180) % 360) * Math.PI / 180;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        if (this.cells[idx] !== BURNING) continue;

        const srcFuel = FUEL_BY_ID[this.fuelType[idx]];
        this.age[idx]++;

        // Intensity lifecycle — ramp up fast, decay slowly
        if (this.age[idx] <= 3) {
          this.intensity[idx] = Math.min(1.0, this.intensity[idx] + 0.25 + Math.random() * 0.15);
        } else if (this.age[idx] > srcFuel.burnDur * 0.7) {
          this.intensity[idx] = Math.max(0.05, this.intensity[idx] - 0.03 - Math.random() * 0.02);
        }

        // Burnout
        if (this.age[idx] >= srcFuel.burnDur) {
          this.cells[idx] = BURNED;
          this.intensity[idx] = 0;
          continue;
        }

        // Spread to 8 neighbors
        for (let d = 0; d < 8; d++) {
          const nr = r + DR[d], nc = c + DC[d];
          if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
          const nIdx = nr * GRID_COLS + nc;
          if (this.cells[nIdx] !== UNBURNED) continue;

          const dstFuel = FUEL_BY_ID[this.fuelType[nIdx]];
          if (dstFuel.rate === 0) continue; // water/non-burnable

          // Rothermel-simplified spread probability
          const elevDiff = this.elevation[nIdx] - this.elevation[idx];
          const slopeFactor = Math.max(0.2, 1 + (elevDiff / CELL_SIZE) * 3.5);

          const angleDiff = DIR_ANGLES_RAD[d] - windToRad;
          const windFactor = Math.max(0.15, 1 + Math.cos(angleDiff) * this.windSpeed * 0.045);

          const intensityFactor = 0.4 + this.intensity[idx] * 0.6;
          const diagFactor = (d % 2 === 1) ? 0.72 : 1.0;

          const prob = Math.min(0.85,
            0.035 * slopeFactor * windFactor * dstFuel.rate * intensityFactor * diagFactor
          );

          if (Math.random() < prob) {
            toIgnite.push({ idx: nIdx, intensity: 0.15 + Math.random() * 0.2 });
          }
        }

        // Ember spotting
        if (this.intensity[idx] > 0.5 && Math.random() < 0.004 * this.intensity[idx]) {
          const dist = 4 + Math.floor(Math.random() * 10); // 4-13 cells
          const sr = r + Math.round(Math.cos(windToRad) * dist);
          const sc = c + Math.round(Math.sin(windToRad) * dist);
          if (sr >= 0 && sr < GRID_ROWS && sc >= 0 && sc < GRID_COLS) {
            const sIdx = sr * GRID_COLS + sc;
            if (this.cells[sIdx] === UNBURNED && FUEL_BY_ID[this.fuelType[sIdx]].rate > 0.1) {
              toIgnite.push({ idx: sIdx, intensity: 0.15 + Math.random() * 0.2 });
            }
          }
        }
      }
    }

    // Apply ignitions
    for (const { idx, intensity } of toIgnite) {
      if (this.cells[idx] === UNBURNED) {
        this.cells[idx] = BURNING;
        this.intensity[idx] = intensity;
        this.age[idx] = 0;
      }
    }

    return this.tick;
  }
}
