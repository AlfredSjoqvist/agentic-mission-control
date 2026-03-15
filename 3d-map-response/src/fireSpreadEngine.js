// ============================================================
// FireSight — Wildfire Spread Simulation Engine
// Cellular automata with Rothermel-simplified spread model
// ============================================================

export const CELL_STATES = {
  UNBURNED: 0,
  BURNING: 1,
  BURNED: 2,
};

// Fuel types: rate = relative spread speed, burnDuration = ticks to burn out
export const FUEL_TYPES = {
  WATER:  { id: 'WATER',  rate: 0.00, burnDuration: 0,  color: '#004466' },
  ROAD:   { id: 'ROAD',   rate: 0.03, burnDuration: 2,  color: '#555555' },
  URBAN:  { id: 'URBAN',  rate: 0.22, burnDuration: 14, color: '#999999' },
  GRASS:  { id: 'GRASS',  rate: 1.00, burnDuration: 5,  color: '#6ab04c' },
  BRUSH:  { id: 'BRUSH',  rate: 0.75, burnDuration: 9,  color: '#3a7d2c' },
  TIMBER: { id: 'TIMBER', rate: 0.45, burnDuration: 18, color: '#1e5128' },
};

export class FireSpreadEngine {
  constructor(options = {}) {
    const {
      minLat = 33.990,
      maxLat = 34.110,
      minLng = -118.600,
      maxLng = -118.440,
      cellSize = 80,          // meters per cell
      windSpeed = 30,         // km/h — Santa Ana winds
      windDirection = 315,    // degrees — NW (blowing from NW toward SE)
    } = options;

    this.bounds = { minLat, maxLat, minLng, maxLng };
    this.cellSize = cellSize;

    // Grid dimensions
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    const midLat = (minLat + maxLat) / 2;
    const latMeters = latRange * 111320;
    const lngMeters = lngRange * 111320 * Math.cos(midLat * Math.PI / 180);

    this.rows = Math.ceil(latMeters / cellSize);
    this.cols = Math.ceil(lngMeters / cellSize);
    this.latStep = latRange / this.rows;
    this.lngStep = lngRange / this.cols;

    // Wind: direction = where wind comes FROM
    this.wind = {
      speed: windSpeed,
      direction: windDirection,
      dirRad: (windDirection * Math.PI) / 180,
    };

    this.tickCount = 0;
    this.baseSpreadRate = 0.05;
    this.spotProbability = 0.002; // ember spotting (rare)

    // Build grid
    this.grid = new Array(this.rows);
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = new Array(this.cols);
      for (let c = 0; c < this.cols; c++) {
        const lat = minLat + (r + 0.5) * this.latStep;
        const lng = minLng + (c + 0.5) * this.lngStep;
        const elevation = this._estimateElevation(lat, lng);
        const fuelType = this._classifyTerrain(lat, lng, elevation);

        this.grid[r][c] = {
          state: CELL_STATES.UNBURNED,
          fuelType,
          elevation,
          burnTick: -1,
          intensity: 0,
        };
      }
    }

    // Canvas for fire overlay rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    this.ctx = this.canvas.getContext('2d');
    this._renderCanvas();

    // Fuel map canvas (for debug/display)
    this.fuelCanvas = document.createElement('canvas');
    this.fuelCanvas.width = this.cols;
    this.fuelCanvas.height = this.rows;
    this._renderFuelMap();

    // Debug: log grid info and fuel distribution
    const fuelCounts = {};
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ft = this.grid[r][c].fuelType;
        fuelCounts[ft] = (fuelCounts[ft] || 0) + 1;
      }
    }
    console.log(`%c[FireEngine] Grid: ${this.rows}x${this.cols} = ${this.rows * this.cols} cells @ ${cellSize}m`, 'color: #ff8800; font-weight: bold');
    console.log(`%c[FireEngine] Bounds: lat [${minLat}, ${maxLat}] lng [${minLng}, ${maxLng}]`, 'color: #ff8800');
    console.log(`%c[FireEngine] Fuel distribution:`, 'color: #ff8800', fuelCounts);
    console.log(`%c[FireEngine] Wind: ${windSpeed} km/h from ${windDirection}°`, 'color: #ff8800');
    console.log(`%c[FireEngine] Canvas: ${this.canvas.width}x${this.canvas.height}`, 'color: #ff8800');
  }

  // ---- Procedural elevation for Palisades area ----
  _estimateElevation(lat, lng) {
    const latNorm = (lat - this.bounds.minLat) / (this.bounds.maxLat - this.bounds.minLat);
    const lngNorm = (lng - this.bounds.minLng) / (this.bounds.maxLng - this.bounds.minLng);

    // Base: rises south→north (coast to mountains)
    let elev = latNorm * 380;

    // Main ridge east-west
    const ridgeDist = Math.abs(latNorm - 0.6);
    elev += Math.max(0, 0.15 - ridgeDist) * 700;

    // Topanga Canyon (north-south)
    const canyonDist = Math.abs(lngNorm - 0.28);
    if (canyonDist < 0.08) elev -= (0.08 - canyonDist) * 1200;

    // Temescal Canyon
    const canyon2Dist = Math.abs(lngNorm - 0.65);
    if (canyon2Dist < 0.06) elev -= (0.06 - canyon2Dist) * 800;

    // Coastal bluffs
    if (latNorm < 0.15 && lngNorm > 0.4) elev = Math.max(elev, 30);

    // Noise for natural variation
    const n1 = Math.sin(lat * 800) * Math.cos(lng * 800) * 20;
    const n2 = Math.sin(lat * 400 + 1.5) * Math.cos(lng * 600 + 0.7) * 15;
    elev += n1 + n2;

    return Math.max(0, elev);
  }

  // ---- Terrain classification ----
  _classifyTerrain(lat, lng, elevation) {
    const latNorm = (lat - this.bounds.minLat) / (this.bounds.maxLat - this.bounds.minLat);
    const lngNorm = (lng - this.bounds.minLng) / (this.bounds.maxLng - this.bounds.minLng);

    // Ocean — any cell at or below sea level is water
    if (elevation <= 2) return 'WATER';
    // Coastal strip — south edge
    if (latNorm < 0.04) return 'WATER';
    // Santa Monica Bay — below the coastal bluff line
    if (elevation < 15 && latNorm < 0.42) return 'WATER';

    // Roads — PCH, Sunset Blvd, Topanga Canyon Rd
    if (latNorm > 0.07 && latNorm < 0.10 && lngNorm < 0.55) return 'ROAD';
    if (latNorm > 0.42 && latNorm < 0.45 && lngNorm > 0.25 && lngNorm < 0.85) return 'ROAD';
    if (Math.abs(lngNorm - 0.28) < 0.015 && latNorm > 0.15 && latNorm < 0.8) return 'ROAD';
    if (Math.abs(lngNorm - 0.65) < 0.015 && latNorm > 0.1 && latNorm < 0.5) return 'ROAD';

    // Urban — Pacific Palisades residential
    if (latNorm > 0.10 && latNorm < 0.40 && lngNorm > 0.30 && lngNorm < 0.80 && elevation < 160) return 'URBAN';
    // Malibu coastal
    if (latNorm > 0.05 && latNorm < 0.12 && lngNorm < 0.35 && elevation < 60) return 'URBAN';

    // Grassland — low, open areas
    if (elevation < 70 && latNorm > 0.08) return 'GRASS';

    // Timber — high elevation, north
    if (elevation > 280) return 'TIMBER';
    if (latNorm > 0.75 && elevation > 200) return 'TIMBER';

    // Default: chaparral (dominant hillside vegetation in Santa Monica Mountains)
    return 'BRUSH';
  }

  // ---- Convert lat/lng to grid cell ----
  latLngToCell(lat, lng) {
    const r = Math.floor((lat - this.bounds.minLat) / this.latStep);
    const c = Math.floor((lng - this.bounds.minLng) / this.lngStep);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return { r, c };
  }

  // ---- Ignite at a point with radius ----
  ignite(lat, lng, radiusCells = 2) {
    console.log(`%c[FireEngine] ignite() called: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}, radius=${radiusCells}`, 'color: #ff4400; font-weight: bold');

    const center = this.latLngToCell(lat, lng);
    if (!center) {
      console.error(`[FireEngine] ignite FAILED: lat/lng outside grid bounds!`, {
        lat, lng,
        bounds: this.bounds,
        inLatRange: lat >= this.bounds.minLat && lat <= this.bounds.maxLat,
        inLngRange: lng >= this.bounds.minLng && lng <= this.bounds.maxLng,
      });
      return false;
    }

    console.log(`%c[FireEngine] Grid cell: row=${center.r}, col=${center.c}`, 'color: #ff4400');
    const centerCell = this.grid[center.r][center.c];
    console.log(`%c[FireEngine] Center cell fuel: ${centerCell.fuelType}, rate: ${FUEL_TYPES[centerCell.fuelType].rate}, state: ${centerCell.state}`, 'color: #ff4400');

    let ignited = false;
    let ignitedCount = 0;
    let skippedWater = 0;
    let skippedAlreadyBurning = 0;

    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        if (dr * dr + dc * dc > radiusCells * radiusCells) continue;
        const r = center.r + dr;
        const c = center.c + dc;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
        const cell = this.grid[r][c];
        if (cell.state !== CELL_STATES.UNBURNED) { skippedAlreadyBurning++; continue; }
        if (cell.fuelType === 'WATER') { skippedWater++; continue; }
        cell.state = CELL_STATES.BURNING;
        cell.burnTick = this.tickCount;
        cell.intensity = 0.3 + Math.random() * 0.3;
        ignited = true;
        ignitedCount++;
      }
    }

    this._renderCanvas();
    console.log(`%c[FireEngine] Ignition result: ${ignitedCount} cells ignited, ${skippedWater} skipped (water/road), ${skippedAlreadyBurning} already burning`, 'color: #ff4400; font-weight: bold');

    // Debug: check canvas has non-transparent pixels
    const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    let nonTransparent = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) nonTransparent++;
    }
    console.log(`%c[FireEngine] Canvas pixels with alpha > 0: ${nonTransparent} / ${this.canvas.width * this.canvas.height}`, 'color: #ff4400');

    return ignited;
  }

  // ---- Main simulation tick ----
  tick() {
    this.tickCount++;
    const tickStart = performance.now();
    const newIgnitions = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.state !== CELL_STATES.BURNING) continue;

        const fuel = FUEL_TYPES[cell.fuelType];
        const age = this.tickCount - cell.burnTick;

        // Intensity curve: ramp up → peak → decay
        if (age <= 2) {
          cell.intensity = Math.min(1, cell.intensity + 0.2 + Math.random() * 0.1);
        } else if (age > fuel.burnDuration * 0.5) {
          cell.intensity = Math.max(0.03, cell.intensity - 0.06 - Math.random() * 0.03);
        }

        // Burn out
        if (age >= fuel.burnDuration) {
          cell.state = CELL_STATES.BURNED;
          cell.intensity = 0;
          continue;
        }

        // Spread to 8 neighbors
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
            if (this.grid[nr][nc].state !== CELL_STATES.UNBURNED) continue;

            const prob = this._spreadProb(cell, this.grid[nr][nc], dr, dc);
            if (Math.random() < prob) {
              newIgnitions.push({ r: nr, c: nc });
            }
          }
        }

        // Ember spotting — long-range downwind ignition
        if (cell.intensity > 0.5 && Math.random() < this.spotProbability * cell.intensity) {
          const dist = 4 + Math.floor(Math.random() * 10);
          // Wind blows FROM windDirection, so fire moves in opposite direction
          const pushDir = this.wind.dirRad + Math.PI;
          const sr = r + Math.round(Math.cos(pushDir) * dist);
          const sc = c + Math.round(Math.sin(pushDir) * dist);
          if (sr >= 0 && sr < this.rows && sc >= 0 && sc < this.cols) {
            const spot = this.grid[sr][sc];
            if (spot.state === CELL_STATES.UNBURNED && FUEL_TYPES[spot.fuelType].rate > 0.1) {
              newIgnitions.push({ r: sr, c: sc });
            }
          }
        }
      }
    }

    // Apply ignitions
    for (const { r, c } of newIgnitions) {
      const cell = this.grid[r][c];
      if (cell.state === CELL_STATES.UNBURNED && FUEL_TYPES[cell.fuelType].rate > 0) {
        cell.state = CELL_STATES.BURNING;
        cell.burnTick = this.tickCount;
        cell.intensity = 0.15 + Math.random() * 0.2;
      }
    }

    this._renderCanvas();

    // Debug every 5 ticks
    if (this.tickCount % 5 === 0 || this.tickCount <= 3) {
      const stats = this.getStats();
      const elapsed = (performance.now() - tickStart).toFixed(1);
      console.log(
        `%c[FireEngine] Tick ${this.tickCount} (${elapsed}ms): ` +
        `burning=${stats.burning} cells (${stats.burningAreaKm2} km²), ` +
        `burned=${stats.burned}, ` +
        `new ignitions this tick=${newIgnitions.length}, ` +
        `sim time=${stats.simMinutes} min`,
        'color: #ff8800'
      );
    }

    return this.tickCount;
  }

  // ---- Spread probability (Rothermel-simplified) ----
  _spreadProb(src, dst, dr, dc) {
    const fuelDst = FUEL_TYPES[dst.fuelType];
    if (fuelDst.rate === 0) return 0;

    // 1. Slope: uphill = faster (preheats fuel above), downhill = slower
    const elevDiff = dst.elevation - src.elevation;
    const slopeFactor = Math.max(0.2, 1 + (elevDiff / this.cellSize) * 3.5);

    // 2. Wind: elliptical spread — head fire (downwind) fast, backing fire slow
    const spreadAngle = Math.atan2(dc, -dr);
    const windPushDir = this.wind.dirRad + Math.PI; // direction wind pushes fire
    const angleDiff = spreadAngle - windPushDir;
    const windFactor = Math.max(0.15, 1 + Math.cos(angleDiff) * this.wind.speed * 0.045);

    // 3. Fuel flammability
    const fuelFactor = fuelDst.rate;

    // 4. Source intensity
    const intensityFactor = 0.4 + src.intensity * 0.6;

    // 5. Diagonal penalty
    const isDiag = Math.abs(dr) + Math.abs(dc) > 1;
    const diagFactor = isDiag ? 0.72 : 1.0;

    const prob = this.baseSpreadRate * slopeFactor * windFactor * fuelFactor * intensityFactor * diagFactor;
    return Math.max(0, Math.min(0.92, prob));
  }

  // ---- Render fire state to canvas ----
  _renderCanvas() {
    const imgData = this.ctx.createImageData(this.cols, this.rows);
    const d = imgData.data;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        const pr = this.rows - 1 - r; // flip Y (lat increases upward)
        const idx = (pr * this.cols + c) * 4;

        if (cell.state === CELL_STATES.BURNING) {
          const t = cell.intensity;
          // Hot core → orange → yellow → smoldering
          if (t > 0.75) {
            // Bright white-red core
            d[idx]     = 255;
            d[idx + 1] = Math.floor(60 + (1 - t) * 120);
            d[idx + 2] = Math.floor((1 - t) * 40);
            d[idx + 3] = Math.floor(200 + t * 55);
          } else if (t > 0.4) {
            // Orange flames
            d[idx]     = 255;
            d[idx + 1] = Math.floor(80 + (0.75 - t) * 280);
            d[idx + 2] = 0;
            d[idx + 3] = Math.floor(160 + t * 60);
          } else if (t > 0.15) {
            // Yellow-orange
            d[idx]     = 255;
            d[idx + 1] = Math.floor(180 + (0.4 - t) * 120);
            d[idx + 2] = Math.floor((0.4 - t) * 80);
            d[idx + 3] = Math.floor(100 + t * 120);
          } else {
            // Smoldering embers
            d[idx]     = 180;
            d[idx + 1] = 80;
            d[idx + 2] = 20;
            d[idx + 3] = Math.floor(60 + t * 200);
          }

          // Flicker effect
          const flicker = (Math.random() - 0.5) * 30;
          d[idx]     = Math.min(255, Math.max(0, d[idx] + flicker));
          d[idx + 1] = Math.min(255, Math.max(0, d[idx + 1] + flicker * 0.5));
        } else if (cell.state === CELL_STATES.BURNED) {
          // Charred ground
          d[idx]     = 35;
          d[idx + 1] = 28;
          d[idx + 2] = 22;
          d[idx + 3] = 170;
        } else {
          // Transparent
          d[idx + 3] = 0;
        }
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
  }

  // ---- Render fuel type map ----
  _renderFuelMap() {
    const ctx = this.fuelCanvas.getContext('2d');
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        const pr = this.rows - 1 - r;
        ctx.fillStyle = FUEL_TYPES[cell.fuelType].color;
        ctx.fillRect(c, pr, 1, 1);
      }
    }
  }

  // ---- Statistics ----
  getStats() {
    let burning = 0, burned = 0, unburned = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const s = this.grid[r][c].state;
        if (s === CELL_STATES.BURNING) burning++;
        else if (s === CELL_STATES.BURNED) burned++;
        else unburned++;
      }
    }
    const areaKm2 = (this.cellSize * this.cellSize) / 1_000_000;
    return {
      burning,
      burned,
      unburned,
      totalCells: this.rows * this.cols,
      burningAreaKm2: (burning * areaKm2).toFixed(2),
      burnedAreaKm2: (burned * areaKm2).toFixed(2),
      totalFireAreaKm2: ((burning + burned) * areaKm2).toFixed(2),
      containmentPct: burning + burned > 0
        ? ((burned / (burning + burned)) * 100).toFixed(0)
        : '0',
      simMinutes: this.tickCount, // each tick = 1 sim minute
    };
  }

  // ---- Get all burning/burned cells with positions ----
  getBurningCells() {
    const cells = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.state === CELL_STATES.BURNING || cell.state === CELL_STATES.BURNED) {
          cells.push({
            lat: this.bounds.minLat + (r + 0.5) * this.latStep,
            lng: this.bounds.minLng + (c + 0.5) * this.lngStep,
            elevation: cell.elevation,
            state: cell.state,
            intensity: cell.intensity,
          });
        }
      }
    }
    return cells;
  }

  // ---- Wind control ----
  setWind(speed, direction) {
    this.wind.speed = speed;
    this.wind.direction = direction;
    this.wind.dirRad = (direction * Math.PI) / 180;
  }

  // ---- Reset ----
  reset() {
    this.tickCount = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        cell.state = CELL_STATES.UNBURNED;
        cell.burnTick = -1;
        cell.intensity = 0;
      }
    }
    this._renderCanvas();
  }
}
