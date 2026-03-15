/**
 * FireSight — Cellular Automata Fire Simulation
 *
 * This is the TOOL that the Pyro agent calls — not an LLM,
 * just math on a grid. Produces visually plausible fire spread
 * based on wind, slope, and fuel.
 */

/**
 * Run fire spread simulation on terrain grid
 * @param {Object} params
 * @param {Array} params.grid - 2D array of cells with { elevation, fuel, state, row, col }
 * @param {number} params.windSpeed - mph
 * @param {number} params.windDirection - degrees (0=N, 90=E, 180=S, 270=W)
 * @param {number} params.humidity - percent (0-100)
 * @param {number} params.steps - number of time steps to simulate (each step ~10 minutes)
 * @param {Array} params.suppressionLines - [{row, col}] cells where crews hold the line
 * @returns {Object} { snapshots: { [step]: grid }, threatened_zones: [] }
 */
export function runFireSimulation({ grid, windSpeed, windDirection, humidity, steps, suppressionLines = [] }) {
  const suppressionSet = new Set(suppressionLines.map(c => `${c.row},${c.col}`));
  const snapshots = {};

  // Deep copy grid for simulation
  let currentGrid = grid.map(row => row.map(cell => ({ ...cell })));

  for (let step = 1; step <= steps; step++) {
    const nextGrid = currentGrid.map(row => row.map(cell => ({ ...cell })));

    for (let r = 0; r < currentGrid.length; r++) {
      for (let c = 0; c < currentGrid[0].length; c++) {
        const cell = currentGrid[r][c];
        if (cell.state !== 'burning') continue;

        // Burning cells eventually burn out
        cell.burnTimer = (cell.burnTimer || 0) + 1;
        if (cell.burnTimer > 3) {
          nextGrid[r][c].state = 'burned';
          continue;
        }

        // Try to spread to 8 neighbors
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= currentGrid.length || nc < 0 || nc >= currentGrid[0].length) continue;

          const neighbor = currentGrid[nr][nc];
          if (neighbor.state !== 'unburned') continue;
          if (neighbor.fuel <= 0) continue; // roads, water, cleared = no spread
          if (suppressionSet.has(`${nr},${nc}`)) continue; // crew holding the line

          let spreadProb = 0.15 * neighbor.fuel; // base probability scaled by fuel

          // Wind factor: spreading in wind direction is much more likely
          spreadProb *= calcWindFactor(dr, dc, windDirection, windSpeed);

          // Slope factor: fire spreads faster uphill
          spreadProb *= calcSlopeFactor(cell.elevation, neighbor.elevation);

          // Humidity dampens everything
          spreadProb *= Math.max(0.2, 1 - (humidity / 100));

          // Ember spotting: small chance of jumping further in high wind
          if (windSpeed > 30 && Math.random() < 0.05) {
            spreadProb *= 2;
          }

          if (Math.random() < Math.min(spreadProb, 0.95)) {
            nextGrid[nr][nc].state = 'burning';
            nextGrid[nr][nc].burnTimer = 0;
            nextGrid[nr][nc].ignitionStep = step;
          }
        }
      }
    }

    currentGrid = nextGrid;
    snapshots[step] = currentGrid.map(row => row.map(cell => ({
      row: cell.row,
      col: cell.col,
      state: cell.state,
      ignitionStep: cell.ignitionStep || null,
    })));
  }

  // Identify threatened zones: unburned cells adjacent to projected fire
  const threatenedCells = findThreatenedCells(currentGrid);

  return { snapshots, threatenedCells };
}

/**
 * Wind factor: how much wind accelerates spread in a given direction
 * Returns multiplier 0.3 (against wind) to 5.0 (with wind)
 */
function calcWindFactor(dr, dc, windDirection, windSpeed) {
  if (windSpeed < 5) return 1.0; // calm winds, no directional bias

  // Convert wind direction to grid vector
  // Wind direction = where wind comes FROM, so fire spreads in opposite direction
  const windRad = ((windDirection + 180) % 360) * (Math.PI / 180);
  const windDr = -Math.cos(windRad); // north = negative row
  const windDc = Math.sin(windRad);  // east = positive col

  // Dot product: how aligned is the spread direction with wind?
  const mag = Math.sqrt(dr * dr + dc * dc);
  const dot = (dr * windDr + dc * windDc) / mag;

  // Scale: -1 (against) to +1 (with wind)
  const speedFactor = Math.min(windSpeed / 20, 2.5); // caps at 50mph
  return 1.0 + dot * speedFactor; // range: 0.3 to 3.5 at 50mph
}

/**
 * Slope factor: fire spreads ~2-4x faster uphill
 * For every 10m elevation gain, double the spread rate
 */
function calcSlopeFactor(sourceElevation, targetElevation) {
  const elevDiff = targetElevation - sourceElevation;
  if (elevDiff > 0) {
    return 1.0 + Math.min(elevDiff / 10, 3.0); // up to 4x uphill
  } else {
    return Math.max(0.3, 1.0 + elevDiff / 30); // slower downhill, min 0.3x
  }
}

/**
 * Find cells that are unburned but near projected fire
 */
function findThreatenedCells(grid) {
  const threatened = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c].state !== 'unburned') continue;
      if (!grid[r][c].hasStructure) continue; // only care about structures

      // Check if any neighbor is burning
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) continue;
        if (grid[nr][nc].state === 'burning') {
          threatened.push({ row: r, col: c, urgency: 'immediate' });
          break;
        }
      }
    }
  }
  return threatened;
}

/**
 * Generate initial terrain grid from Marble API terrain data
 * For hackathon: creates a plausible grid with varied elevation, fuel, structures, roads
 */
export function generateDemoGrid(rows = 100, cols = 100) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      // Elevation: ridge running NW-SE with canyons
      const ridgeFactor = Math.sin((r + c) * 0.05) * 200 + Math.sin(r * 0.03) * 150;
      const elevation = 100 + ridgeFactor + (Math.random() * 20);

      // Fuel: mostly brush (0.6-1.0), cleared near roads (0), structures (0.3)
      let fuel = 0.6 + Math.random() * 0.4;
      let hasStructure = false;
      let roadType = null;

      // Roads: a few corridors
      if (Math.abs(c - 50) < 2 || Math.abs(r - 30) < 1 || Math.abs(r - 70) < 1) {
        fuel = 0;
        roadType = Math.abs(c - 50) < 2 ? 'major' : 'minor';
      }

      // Residential zones: clusters of structures
      if ((r > 20 && r < 40 && c > 55 && c < 75) ||
          (r > 50 && r < 65 && c > 60 && c < 80)) {
        hasStructure = Math.random() > 0.4;
        fuel = hasStructure ? 0.3 : fuel;
      }

      row.push({
        row: r,
        col: c,
        elevation: Math.round(elevation),
        fuel: Math.round(fuel * 100) / 100,
        vegetation: fuel > 0.5 ? 'brush' : fuel > 0.2 ? 'grass' : 'cleared',
        hasStructure,
        roadType,
        state: 'unburned',
        burnTimer: 0,
        ignitionStep: null,
      });
    }
    grid.push(row);
  }
  return grid;
}
