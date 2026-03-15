// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fireEngine.js — Cellular Automata Fire Spread (Rothermel-simplified)
// Grid: 100m cells over greater LA basin (Malibu → Downtown)
// Each tick = 1 simulated minute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GRID_ROWS = 400;
export const GRID_COLS = 500;
export const CELL_SIZE = 100; // meters

// Expanded bounds: Malibu to Pasadena, coast to mountains
export const LAT_MIN = 33.70;
export const LAT_MAX = 34.45;
export const LNG_MIN = -119.00;
export const LNG_MAX = -117.90;

// Cell states (one-way: UNBURNED → BURNING → BURNED)
export const UNBURNED = 0;
export const BURNING  = 1;
export const BURNED   = 2;

// Fuel types
const FUEL = {
  WATER:  { id: 0, rate: 0.00, burnDur: 0   },
  ROAD:   { id: 1, rate: 0.04, burnDur: 10  },
  URBAN:  { id: 2, rate: 0.28, burnDur: 55  },
  TIMBER: { id: 3, rate: 0.50, burnDur: 75  },
  BRUSH:  { id: 4, rate: 0.80, burnDur: 45  },
  GRASS:  { id: 5, rate: 1.00, burnDur: 25  },
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
    this.burnDur   = new Uint16Array(N);  // per-cell individual burn duration

    this.windSpeed = 30;       // km/h
    this.windDir   = 315;      // degrees, blowing FROM (NW Santa Ana)
    this.tick      = 0;

    this._buildTerrain();
  }

  _buildTerrain() {
    // Pass 1: compute elevation using procedural model
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        const lat = LAT_MIN + (r / GRID_ROWS) * (LAT_MAX - LAT_MIN);
        const lng = LNG_MIN + (c / GRID_COLS) * (LNG_MAX - LNG_MIN);
        const latNorm = r / GRID_ROWS;
        const lngNorm = c / GRID_COLS;

        let elev = latNorm * 400;
        elev += Math.exp(-Math.pow((latNorm - 0.55) * 4, 2)) * 600;
        elev -= Math.exp(-Math.pow((lngNorm - 0.35) * 8, 2)) * 900 * Math.max(0, latNorm - 0.3);
        elev -= Math.exp(-Math.pow((lngNorm - 0.55) * 10, 2)) * 700 * Math.max(0, latNorm - 0.25);
        elev -= Math.exp(-Math.pow((lngNorm - 0.75) * 8, 2)) * 500 * Math.max(0, latNorm - 0.2);
        if (latNorm < 0.2 && lngNorm > 0.4) elev = Math.max(elev, 25);
        elev += Math.sin(latNorm * 12.5 + lngNorm * 8.3) * 35;
        elev += fbm(latNorm * 6, lngNorm * 6, 42) * 70 - 35;

        // Ocean cells get negative elevation — noisy coastline for organic shape
        // Expanded coastline covering Ventura to Long Beach
        // Approximate Southern California coastline (lat as function of lng)
        let coastBase;
        if (lng < -118.95) {
          // Ventura coast — runs roughly east-west at ~34.27
          coastBase = 34.27;
        } else if (lng < -118.75) {
          // Malibu west — coast curves south from 34.27 to 34.04
          coastBase = 34.27 + (lng + 118.95) * 1.15;
        } else if (lng < -118.53) {
          // Malibu to Palisades — coast ~34.04 to 34.03
          coastBase = 34.04 + (lng + 118.75) * 0.05;
        } else if (lng < -118.49) {
          // Palisades to Santa Monica — 34.03 to 34.015
          coastBase = 34.03 + (lng + 118.53) * 0.375;
        } else if (lng < -118.40) {
          // Santa Monica to Marina/LAX — 34.015 to 33.96
          coastBase = 34.015 + (lng + 118.49) * 0.61;
        } else if (lng < -118.25) {
          // LAX to Palos Verdes — coast dips to ~33.75 then curves
          coastBase = 33.96 + (lng + 118.40) * 1.4;
        } else if (lng < -118.10) {
          // San Pedro / Long Beach — coast ~33.72 to 33.76
          coastBase = 33.75 + (lng + 118.25) * (-0.27);
        } else {
          // East of Long Beach — coast ~33.76
          coastBase = 33.76;
        }
        const coastNoise = fbm(lat * 40, lng * 40, 7) * 0.005 - 0.0025;
        if (lat < coastBase + coastNoise) {
          elev = -10;
        }

        this.elevation[idx] = elev;
      }
    }

    // Pass 2: classify fuel type based purely on elevation and noise
    // No bounding boxes — each cell is classified individually
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        const elev = this.elevation[idx];
        const lat = LAT_MIN + (r / GRID_ROWS) * (LAT_MAX - LAT_MIN);
        const lng = LNG_MIN + (c / GRID_COLS) * (LNG_MAX - LNG_MIN);

        // Noise fields for organic, non-grid-aligned fuel boundaries
        const n1 = fbm(lat * 30, lng * 30, 99);
        const n2 = fbm(lat * 15, lng * 15, 55);

        let fuel;

        if (elev <= 0) {
          // Below sea level = water. Not burnable.
          fuel = FUEL.WATER;
        } else if (n1 > 0.92 && elev < 300) {
          // Sparse road-like firebreaks (~8% of land cells)
          fuel = FUEL.ROAD;
        } else if (elev < 100 + n2 * 60) {
          // Low elevation flats — urban/developed. Burns slowly.
          fuel = FUEL.URBAN;
        } else if (elev < 150 + n1 * 50) {
          // Low-mid elevation — grass/open. Burns fast but short.
          fuel = FUEL.GRASS;
        } else if (elev > 350 - n2 * 80) {
          // High elevation — timber/forest. Burns slow and long.
          fuel = FUEL.TIMBER;
        } else {
          // Mid elevation hillsides — brush/chaparral. Burns very fast.
          fuel = FUEL.BRUSH;
        }

        this.fuelType[idx] = fuel.id;
      }
    }
  }

  latLngToCell(lat, lng) {
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

  ignite(row, col, radius = 2) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr * dr + dc * dc > radius * radius) continue;
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
        const idx = r * GRID_COLS + c;
        if (this.cells[idx] !== UNBURNED) continue;
        if (FUEL_BY_ID[this.fuelType[idx]].rate === 0) continue;
        this.cells[idx] = BURNING;
        this.intensity[idx] = 0.3 + Math.random() * 0.3;
        this.age[idx] = 0;
        // Individual burn duration: 1x to 2.5x the fuel's base duration
        const baseDur = FUEL_BY_ID[this.fuelType[idx]].burnDur;
        this.burnDur[idx] = Math.round(baseDur * (1 + Math.random() * 1.5));
      }
    }
  }

  igniteAtLatLng(lat, lng, radius = 2) {
    const { row, col } = this.latLngToCell(lat, lng);
    this.ignite(row, col, radius);
  }

  step() {
    this.tick++;
    const toIgnite = [];

    const windToRad = ((this.windDir + 180) % 360) * Math.PI / 180;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        if (this.cells[idx] !== BURNING) continue;

        const srcFuel = FUEL_BY_ID[this.fuelType[idx]];
        this.age[idx]++;

        if (this.age[idx] <= 3) {
          this.intensity[idx] = Math.min(1.0, this.intensity[idx] + 0.25 + Math.random() * 0.15);
        } else if (this.age[idx] > this.burnDur[idx] * 0.8) {
          this.intensity[idx] = Math.max(0.05, this.intensity[idx] - 0.015 - Math.random() * 0.01);
        }

        if (this.age[idx] >= this.burnDur[idx]) {
          this.cells[idx] = BURNED;
          this.intensity[idx] = 0;
          continue;
        }

        for (let d = 0; d < 8; d++) {
          const nr = r + DR[d], nc = c + DC[d];
          if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
          const nIdx = nr * GRID_COLS + nc;
          if (this.cells[nIdx] !== UNBURNED) continue;

          const dstFuel = FUEL_BY_ID[this.fuelType[nIdx]];
          if (dstFuel.rate === 0) continue;

          const elevDiff = this.elevation[nIdx] - this.elevation[idx];
          const slopeFactor = Math.max(0.2, 1 + (elevDiff / CELL_SIZE) * 3.5);

          const angleDiff = DIR_ANGLES_RAD[d] - windToRad;
          const windFactor = Math.max(0.15, 1 + Math.cos(angleDiff) * this.windSpeed * 0.045);

          const intensityFactor = 0.4 + this.intensity[idx] * 0.6;
          const diagFactor = (d % 2 === 1) ? 0.72 : 1.0;

          const prob = Math.min(0.85,
            0.025 * slopeFactor * windFactor * dstFuel.rate * intensityFactor * diagFactor
          );

          if (Math.random() < prob) {
            toIgnite.push({ idx: nIdx, intensity: 0.15 + Math.random() * 0.2 });
          }
        }

        if (this.intensity[idx] > 0.5 && Math.random() < 0.001 * this.intensity[idx]) {
          const dist = 4 + Math.floor(Math.random() * 10);
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

    for (const { idx, intensity } of toIgnite) {
      if (this.cells[idx] === UNBURNED) {
        this.cells[idx] = BURNING;
        this.intensity[idx] = intensity;
        this.age[idx] = 0;
        // Individual burn duration: 1x to 2.5x the fuel's base duration
        const baseDur = FUEL_BY_ID[this.fuelType[idx]].burnDur;
        this.burnDur[idx] = Math.round(baseDur * (1 + Math.random() * 1.5));
      }
    }

    return this.tick;
  }
}
