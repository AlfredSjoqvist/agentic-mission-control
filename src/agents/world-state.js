/**
 * FireSight — Shared World State
 *
 * Single source of truth that all agents read from and write to.
 * The spatial UI subscribes to changes via the event bus.
 */

import { EventEmitter } from 'events';

export const bus = new EventEmitter();

export const worldState = {
  // --- Terrain (populated from Marble API export) ---
  terrain: {
    bounds: { lat: [34.03, 34.07], lng: [-118.55, -118.50] }, // Palisades area
    gridSize: { rows: 100, cols: 100 },
    cells: [], // populated at init: { row, col, elevation, fuel, vegetation, hasStructure, roadType }
  },

  // --- Fire State (Pyro agent domain) ---
  fire: {
    current_perimeter: [],       // [{ row, col, intensity }] — actively burning cells
    projections: {               // keyed by minutes-from-now
      30: [],                    // [{ row, col, probability }]
      60: [],
      90: [],
    },
    wind: { speed: 0, direction: 0 },  // mph, degrees (0=N, 90=E, 180=S, 270=W)
    humidity: 15,                       // percent
    ignition_points: [],                // where fire started
    suppression_lines: [],              // where crews are holding — blocks spread
  },

  // --- Drone Fleet (Swarm agent domain) ---
  drones: {
    units: [
      // { id, position: {row, col, altitude}, task: 'recon'|'evac-monitor'|'fire-track'|'idle',
      //   feed_url: null, battery: 100, status: 'active'|'returning'|'charging' }
    ],
    coverage_map: [],    // cells currently under drone surveillance
    coverage_gaps: [],   // cells with no drone visibility
  },

  // --- Evacuation (Evac agent domain) ---
  evacuation: {
    zones: [
      // { id, name, population, status: 'safe'|'warning'|'evacuating'|'complete',
      //   deadline_minutes: null, routes: [{ path: [{row,col}], status: 'clear'|'threatened'|'blocked' }] }
    ],
    shelters: [
      // { id, name, position: {row, col}, capacity, current_occupancy }
    ],
    blocked_roads: [],   // [{row, col}] — roads cut off by fire
  },

  // --- Resources (Deploy agent domain) ---
  resources: {
    engines: [
      // { id, name, position: {row, col}, status: 'available'|'en-route'|'deployed'|'refueling',
      //   crew_size, water_capacity, eta_minutes: null, assigned_task: null }
    ],
    helicopters: [
      // { id, name, position: {row, col}, status, water_capacity, flight_time_remaining }
    ],
    personnel: [
      // { id, team_name, position: {row, col}, size, specialty: 'hotshot'|'structure'|'medical', status }
    ],
    water_sources: [
      // { id, name, position: {row, col}, type: 'hydrant'|'reservoir'|'lake', available: true }
    ],
  },

  // --- Commander Alerts (all agents write here) ---
  alerts: [
    // { id, timestamp, from: 'pyro'|'swarm'|'evac'|'deploy',
    //   priority: 'CRITICAL'|'WARNING'|'INFO',
    //   message: string, acknowledged: false, data: {} }
  ],

  // --- Timeline (for scrubber UI) ---
  timeline: {
    current_step: 0,          // 0 = now
    steps: [0, 30, 60, 90],   // minutes
    snapshots: {},             // keyed by step: full fire state at that time
  },
};

// --- State update helpers ---

export function updateFireProjection(projections) {
  worldState.fire.projections = projections;
  bus.emit('fire_projection_changed', projections);
}

export function updateDrones(units) {
  worldState.drones.units = units;
  bus.emit('drones_updated', units);
}

export function updateEvacuation(zones) {
  worldState.evacuation.zones = zones;
  bus.emit('evacuation_updated', zones);
}

export function updateResources(type, units) {
  worldState.resources[type] = units;
  bus.emit('resources_updated', { type, units });
}

export function pushAlert(alert) {
  const fullAlert = {
    id: `alert-${Date.now()}`,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    ...alert,
  };
  worldState.alerts.unshift(fullAlert);
  bus.emit('alert', fullAlert);
  if (fullAlert.priority === 'CRITICAL') {
    bus.emit('critical_alert', fullAlert);
  }
}

export function updateWind(speed, direction) {
  worldState.fire.wind = { speed, direction };
  bus.emit('wind_changed', worldState.fire.wind);
}

export function addSuppressionLine(cells) {
  worldState.fire.suppression_lines.push(...cells);
  bus.emit('suppression_updated', worldState.fire.suppression_lines);
}
