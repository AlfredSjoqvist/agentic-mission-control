/**
 * FireSight — Spatial Grounding Engine
 *
 * Solves Problem #4 (Spatial Grounding of Agent Reasoning).
 *
 * Every agent action is anchored to physical terrain coordinates.
 * Instead of "fire is spreading north," the system says:
 *   "Fire reaches cell (12,8) — Sunset Ridge — in 28 minutes"
 *   and that cell LIGHTS UP on the 3D world model.
 *
 * This is what ties agent reasoning to the world model.
 * Ian Curtis (World Labs) and Hugo Hernandez will specifically evaluate this.
 *
 * Three capabilities:
 * 1. Action→Coordinate mapping: every tool call resolves to grid cells
 * 2. Focus tracking: each agent's "attention" highlighted on terrain
 * 3. Overlap detection: when multiple agents focus on same area, blend
 */

import { bus, worldState } from './world-state.js';

// ============================================================
// NAMED LOCATIONS — Human-readable names for terrain regions
// ============================================================

const NAMED_LOCATIONS = {
  'sunset-ridge':    { center: { row: 20, col: 35 }, radius: 8, label: 'Sunset Ridge', population: 800 },
  'topanga-heights': { center: { row: 40, col: 20 }, radius: 10, label: 'Topanga Heights', population: 1200 },
  'canyon-view':     { center: { row: 55, col: 45 }, radius: 6, label: 'Canyon View', population: 500 },
  'coastal-bluffs':  { center: { row: 70, col: 60 }, radius: 7, label: 'Coastal Bluffs', population: 600 },
  'topanga-canyon-rd': { path: [{ row: 35, col: 15 }, { row: 40, col: 18 }, { row: 45, col: 22 }, { row: 50, col: 25 }], label: 'Topanga Canyon Rd' },
  'sunset-blvd':     { path: [{ row: 18, col: 30 }, { row: 20, col: 35 }, { row: 22, col: 40 }, { row: 25, col: 45 }], label: 'Sunset Blvd' },
  'pch':             { path: [{ row: 75, col: 10 }, { row: 75, col: 30 }, { row: 75, col: 50 }, { row: 75, col: 70 }], label: 'Pacific Coast Highway' },
  'fire-origin':     { center: { row: 10, col: 25 }, radius: 5, label: 'Fire Origin Point' },
  'staging-area':    { center: { row: 80, col: 40 }, radius: 4, label: 'Resource Staging Area' },
};

/**
 * Resolve a location name to grid coordinates.
 */
export function resolveLocation(nameOrCoords) {
  if (typeof nameOrCoords === 'string') {
    const key = nameOrCoords.toLowerCase().replace(/\s+/g, '-');
    return NAMED_LOCATIONS[key] || null;
  }
  return nameOrCoords; // already coordinates
}

// ============================================================
// SPATIAL ACTION REGISTRY — Every agent action with coordinates
// ============================================================

const spatialActions = [];

/**
 * Register a spatially-grounded action.
 * This is what makes agent reasoning VISIBLE on the terrain.
 */
export function registerSpatialAction({
  agent,
  action,
  cells,          // [{ row, col }] — the terrain cells this action affects
  region,         // named region (e.g., 'sunset-ridge')
  type,           // 'fire-projection' | 'evacuation' | 'deployment' | 'surveillance' | 'suppression'
  intensity,      // 0-1, how strongly this action affects these cells
  label,          // human-readable description
  duration_ms,    // how long the spatial highlight persists
  cascadeId,      // link to cascade tracker
}) {
  const entry = {
    id: `spatial-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    agent,
    action,
    cells: cells || [],
    region: region ? resolveLocation(region) : null,
    type,
    intensity: intensity || 0.5,
    label,
    duration_ms: duration_ms || 10000,
    cascadeId,
    timestamp: Date.now(),
    expired: false,
  };

  spatialActions.push(entry);

  // Auto-expire
  setTimeout(() => {
    entry.expired = true;
    bus.emit('spatial_action_expired', entry.id);
  }, entry.duration_ms);

  bus.emit('spatial_action_registered', entry);
  return entry;
}

/**
 * Get all active (non-expired) spatial actions.
 */
export function getActiveSpatialActions() {
  return spatialActions.filter(a => !a.expired);
}

/**
 * Get spatial actions grouped by agent — for rendering attention overlays.
 */
export function getSpatialFocusByAgent() {
  const active = getActiveSpatialActions();
  const focus = {};

  for (const action of active) {
    if (!focus[action.agent]) {
      focus[action.agent] = {
        cells: new Set(),
        actions: [],
        primaryType: null,
      };
    }
    action.cells.forEach(c => focus[action.agent].cells.add(`${c.row},${c.col}`));
    focus[action.agent].actions.push(action);
  }

  // Convert Sets to arrays and determine primary action type
  for (const [agent, data] of Object.entries(focus)) {
    data.cells = [...data.cells].map(s => {
      const [row, col] = s.split(',').map(Number);
      return { row, col };
    });
    data.primaryType = data.actions[data.actions.length - 1]?.type;
  }

  return focus;
}

/**
 * Detect spatial overlap — when multiple agents focus on the same area.
 * This is visually represented as blended colors on the terrain.
 */
export function detectSpatialOverlap() {
  const focus = getSpatialFocusByAgent();
  const cellAgents = {};
  const overlaps = [];

  // Build cell→agents map
  for (const [agent, data] of Object.entries(focus)) {
    for (const cell of data.cells) {
      const key = `${cell.row},${cell.col}`;
      if (!cellAgents[key]) cellAgents[key] = [];
      cellAgents[key].push(agent);
    }
  }

  // Find cells with multiple agents
  for (const [cellKey, agents] of Object.entries(cellAgents)) {
    if (agents.length > 1) {
      const [row, col] = cellKey.split(',').map(Number);
      overlaps.push({
        cell: { row, col },
        agents,
        count: agents.length,
        nearLocation: findNearestLocation({ row, col }),
      });
    }
  }

  return overlaps;
}

/**
 * Find the nearest named location to a cell.
 */
function findNearestLocation(cell) {
  let nearest = null;
  let minDist = Infinity;

  for (const [key, loc] of Object.entries(NAMED_LOCATIONS)) {
    if (loc.center) {
      const dist = Math.sqrt(
        Math.pow(cell.row - loc.center.row, 2) + Math.pow(cell.col - loc.center.col, 2)
      );
      if (dist < minDist && dist <= (loc.radius || 10)) {
        nearest = loc.label;
        minDist = dist;
      }
    }
  }

  return nearest;
}

// ============================================================
// TERRAIN HEAT MAP — Aggregate spatial activity for visualization
// ============================================================

/**
 * Generate a heat map of agent activity across the terrain.
 * Higher values = more agent attention on that cell.
 */
export function getActivityHeatMap(gridRows = 100, gridCols = 100) {
  const heatMap = Array.from({ length: gridRows }, () => Array(gridCols).fill(0));
  const active = getActiveSpatialActions();

  for (const action of active) {
    for (const cell of action.cells) {
      if (cell.row >= 0 && cell.row < gridRows && cell.col >= 0 && cell.col < gridCols) {
        heatMap[cell.row][cell.col] += action.intensity;
      }
    }

    // Also add region area
    if (action.region?.center) {
      const r = action.region.radius || 5;
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          const row = action.region.center.row + dr;
          const col = action.region.center.col + dc;
          if (row >= 0 && row < gridRows && col >= 0 && col < gridCols) {
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist <= r) {
              heatMap[row][col] += action.intensity * (1 - dist / r) * 0.5;
            }
          }
        }
      }
    }
  }

  return heatMap;
}

/**
 * Get named locations for the terrain grid display.
 */
export function getNamedLocations() {
  return NAMED_LOCATIONS;
}
