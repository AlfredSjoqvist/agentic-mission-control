// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fireEngine.js — Cellular Automata Fire Spread (Rothermel-simplified)
// Grid: 100m cells over greater LA basin (Malibu → Downtown)
// Each tick = 1 simulated minute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GRID_ROWS = 400;
export const GRID_COLS = 500;
export const CELL_SIZE = 100; // meters

// Expanded bounds: Malibu to Pasadena, coast to mountains
export const LAT_MIN = 33.85;
export const LAT_MAX = 34.21;
export const LNG_MIN = -118.80;
export const LNG_MAX = -118.25;

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
        // Use real-world lat/lng for terrain classification
        const lat = LAT_MIN + (r / GRID_ROWS) * (LAT_MAX - LAT_MIN);
        const lng = LNG_MIN + (c / GRID_COLS) * (LNG_MAX - LNG_MIN);
        const latNorm = r / GRID_ROWS;
        const lngNorm = c / GRID_COLS;

        // Procedural elevation model
        let elev = latNorm * 400;
        // Santa Monica Mountains ridge
        elev += Math.exp(-Math.pow((latNorm - 0.55) * 4, 2)) * 600;
        // Canyon cuts
        elev -= Math.exp(-Math.pow((lngNorm - 0.35) * 8, 2)) * 900 * Math.max(0, latNorm - 0.3);
        elev -= Math.exp(-Math.pow((lngNorm - 0.55) * 10, 2)) * 700 * Math.max(0, latNorm - 0.25);
        elev -= Math.exp(-Math.pow((lngNorm - 0.75) * 8, 2)) * 500 * Math.max(0, latNorm - 0.2);
        // Coastal bluffs
        if (latNorm < 0.2 && lngNorm > 0.4) elev = Math.max(elev, 25);
        // Noise
        elev += Math.sin(latNorm * 12.5 + lngNorm * 8.3) * 35;
        elev += fbm(latNorm * 6, lngNorm * 6, 42) * 70 - 35;

        this.elevation[idx] = Math.max(0, elev);

        // Terrain classification → fuel type
        let fuel;

        // Ocean: LA coastline runs NW→SE
        // Malibu (lng -118.75): coast at ~34.03
        // Pacific Palisades (lng -118.53): coast at ~34.02
        // Santa Monica (lng -118.50): coast at ~34.01
        // Venice/LAX (lng -118.40): coast at ~33.96
        const coastLat = 34.035 - (lng + 118.75) * 0.15;
        if (lat < coastLat || elev <= 2) {
          fuel = FUEL.WATER;
        }
        // Major roads (approximate)
        else if (
          // PCH
          (Math.abs(lat - coastLat - 0.005) < 0.003 && lat > coastLat) ||
          // Sunset Blvd (roughly lat 34.04-34.06)
          (Math.abs(lat - 34.05) < 0.003 && lng > -118.65 && lng < -118.35) ||
          // I-405
          (Math.abs(lng - (-118.47)) < 0.003 && lat > 33.95 && lat < 34.10) ||
          // I-10
          (Math.abs(lat - 34.02) < 0.003 && lng > -118.55 && lng < -118.25)
        ) {
          fuel = FUEL.ROAD;
        }
        // Urban: LA basin lowlands
        else if (elev < 120 && lat > coastLat && lat < 34.08) {
          fuel = FUEL.URBAN;
        }
        // Grass: low coastal areas
        else if (elev < 60) {
          fuel = FUEL.GRASS;
        }
        // Timber: high mountain areas
        else if (elev > 350 || (elev > 250 && latNorm > 0.65)) {
          fuel = FUEL.TIMBER;
        }
        // Brush (chaparral): hillsides — most common in fire zone
        else {
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
        } else if (this.age[idx] > srcFuel.burnDur * 0.7) {
          this.intensity[idx] = Math.max(0.05, this.intensity[idx] - 0.03 - Math.random() * 0.02);
        }

        if (this.age[idx] >= srcFuel.burnDur) {
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
            0.035 * slopeFactor * windFactor * dstFuel.rate * intensityFactor * diagFactor
          );

          if (Math.random() < prob) {
            toIgnite.push({ idx: nIdx, intensity: 0.15 + Math.random() * 0.2 });
          }
        }

        if (this.intensity[idx] > 0.5 && Math.random() < 0.004 * this.intensity[idx]) {
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
      }
    }

    return this.tick;
  }
}
