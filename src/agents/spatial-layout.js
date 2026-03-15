/**
 * FireSight — Spatial Layout Configuration
 *
 * Defines how agent panels and the world model viewport are
 * arranged in 3D space around the commander in VR.
 *
 * Coordinate system (PICO/WebSpatial):
 *   - Commander stands at origin (0, 0, 0), facing negative Z
 *   - X = right, Y = up, Z = toward commander
 *   - All distances in meters
 */

import { PYRO_VISUAL_CONFIG } from './pyro-agent.js';
import { SWARM_VISUAL_CONFIG } from './swarm-agent.js';
import { EVAC_VISUAL_CONFIG } from './evac-agent.js';
import { DEPLOY_VISUAL_CONFIG } from './deploy-agent.js';
import { INTERPRETABILITY_VISUAL_CONFIG } from './interpretability.js';

// ============================================================
// SPATIAL POSITIONS (where panels float in 3D space)
// ============================================================

export const SPATIAL_LAYOUT = {
  // The main 3D terrain viewport — center of the commander's view
  worldModelViewport: {
    position: { x: 0, y: 0.9, z: -2.5 },   // centered, slightly below eye level, 2.5m away
    rotation: { x: -30, y: 0, z: 0 },       // tilted toward commander like a table
    size: { width: 2.0, height: 1.5 },       // 2m wide terrain display
    type: 'world-model',
    renderer: 'sparkjs-gaussian-splat',
    interactable: true,                       // gaze + point to select terrain cells
    selectionHighlight: { color: '#FFFFFF', opacity: 0.3, shape: 'circle', radius: 0.05 },
  },

  // Agent panels arranged in an arc around the commander
  panels: {
    pyro: {
      ...PYRO_VISUAL_CONFIG.panel,
      spatial: {
        position: { x: -1.8, y: 1.2, z: -2.0 },   // left side
        rotation: { x: 0, y: 25, z: 0 },            // angled toward commander
        scale: 1.0,
      },
    },
    swarm: {
      ...SWARM_VISUAL_CONFIG.panel,
      spatial: {
        position: { x: 1.8, y: 1.2, z: -2.0 },     // right side
        rotation: { x: 0, y: -25, z: 0 },
        scale: 1.0,
      },
    },
    evac: {
      ...EVAC_VISUAL_CONFIG.panel,
      spatial: {
        position: { x: -1.4, y: 1.8, z: -2.2 },    // upper left
        rotation: { x: -10, y: 20, z: 0 },
        scale: 0.9,
      },
    },
    deploy: {
      ...DEPLOY_VISUAL_CONFIG.panel,
      spatial: {
        position: { x: 1.4, y: 1.8, z: -2.2 },     // upper right
        rotation: { x: -10, y: -20, z: 0 },
        scale: 0.9,
      },
    },
  },

  // Alert bar — bottom of view, stretches across
  alertBar: {
    position: { x: 0, y: 0.3, z: -1.8 },
    rotation: { x: 0, y: 0, z: 0 },
    size: { width: 2.5, height: 0.15 },
    maxAlerts: 3,
    scrollDirection: 'right-to-left',
    colors: {
      CRITICAL: { bg: '#7F1D1D', text: '#FEF2F2', border: '#EF4444', animation: 'flash 0.5s' },
      WARNING: { bg: '#78350F', text: '#FFFBEB', border: '#F59E0B', animation: 'none' },
      INFO: { bg: '#1E3A5F', text: '#EFF6FF', border: '#3B82F6', animation: 'none' },
    },
  },

  // Timeline scrubber — below the world model
  timelineScrubber: {
    position: { x: 0, y: 0.5, z: -2.3 },
    rotation: { x: -20, y: 0, z: 0 },
    size: { width: 1.5, height: 0.08 },
    steps: [
      { label: 'NOW', value: 0, color: '#EF4444' },
      { label: '+30m', value: 30, color: '#F97316' },
      { label: '+1h', value: 60, color: '#EAB308' },
      { label: '+1.5h', value: 90, color: '#FEF9C3' },
    ],
    scrubberColor: '#FFFFFF',
    trackColor: 'rgba(255,255,255,0.2)',
    interactable: true,   // commander can grab and slide
  },

  // Voice input indicator — near commander
  voiceIndicator: {
    position: { x: 0, y: 0.1, z: -1.2 },
    size: { width: 0.3, height: 0.05 },
    states: {
      idle: { color: '#6B7280', label: 'Voice Ready' },
      listening: { color: '#22C55E', label: 'Listening...', animation: 'waveform' },
      processing: { color: '#3B82F6', label: 'Processing...', animation: 'pulse' },
      error: { color: '#EF4444', label: 'Retry', animation: 'none' },
    },
  },

  // Mini-map — small overhead view in peripheral
  miniMap: {
    position: { x: -2.2, y: 0.6, z: -1.5 },
    rotation: { x: -45, y: 30, z: 0 },
    size: { width: 0.4, height: 0.4 },
    showLayers: ['fire', 'drones', 'units', 'evacRoutes'],
    opacity: 0.7,
  },

  // --- INTERPRETABILITY LAYER (from interpretability.js) ---
  // Decision feed, coordination graph, attention overlays
  ...INTERPRETABILITY_VISUAL_CONFIG,
};

// ============================================================
// TERRAIN OVERLAY REGISTRY (all overlays from all agents)
// ============================================================

export const ALL_TERRAIN_OVERLAYS = [
  ...PYRO_VISUAL_CONFIG.terrainOverlays,
  ...SWARM_VISUAL_CONFIG.terrainOverlays,
  ...EVAC_VISUAL_CONFIG.terrainOverlays,
  ...DEPLOY_VISUAL_CONFIG.terrainOverlays,
];

// ============================================================
// INTERACTION MODES
// ============================================================

export const INTERACTION_MODES = {
  // Default: gaze at terrain to see info, gaze at panels to read
  observe: {
    terrainAction: 'show-tooltip',  // hover shows cell info (elevation, fuel, status)
    panelAction: 'scroll',          // gaze at panel scrolls content
  },

  // Command mode: activated by trigger press or "command mode" voice
  command: {
    terrainAction: 'select-cell',   // click/trigger selects a terrain cell
    panelAction: 'interact',        // click elements in panels
    contextMenu: {                  // what appears when you select a terrain cell
      options: [
        { label: 'Send Scout Drone', agent: 'swarm', action: 'reposition_drone', icon: 'drone' },
        { label: 'Check Evacuation Route', agent: 'evac', action: 'calculate_evacuation_route', icon: 'route' },
        { label: 'Deploy Crew Here', agent: 'deploy', action: 'move_unit', icon: 'team' },
        { label: 'Project Fire From Here', agent: 'pyro', action: 'run_fire_projection', icon: 'flame' },
      ],
      appearance: {
        background: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#FFFFFF',
        itemHoverColor: 'rgba(255, 255, 255, 0.15)',
        fontSize: '14px',
      },
    },
  },
};

// ============================================================
// ANIMATION DEFINITIONS (for terrain overlays)
// ============================================================

export const ANIMATIONS = {
  'glow-pulse': {
    keyframes: [
      { opacity: 0.7, boxShadow: '0 0 5px currentColor' },
      { opacity: 1.0, boxShadow: '0 0 20px currentColor' },
      { opacity: 0.7, boxShadow: '0 0 5px currentColor' },
    ],
    duration: '2s',
    timing: 'ease-in-out',
    iteration: 'infinite',
  },
  'flow': {
    keyframes: [
      { backgroundPosition: '0% 0%' },
      { backgroundPosition: '100% 0%' },
    ],
    duration: '2s',
    timing: 'linear',
    iteration: 'infinite',
    description: 'Animated dashes moving along evacuation routes',
  },
  'hover': {
    keyframes: [
      { transform: 'translateY(0px)' },
      { transform: 'translateY(-5px)' },
      { transform: 'translateY(0px)' },
    ],
    duration: '2s',
    timing: 'ease-in-out',
    iteration: 'infinite',
    description: 'Helicopter icons gently bobbing',
  },
  'flash': {
    keyframes: [
      { opacity: 1 },
      { opacity: 0.3 },
      { opacity: 1 },
    ],
    duration: '0.5s',
    timing: 'ease-in-out',
    iteration: 'infinite',
  },
  'pulse': {
    keyframes: [
      { transform: 'scale(1)', opacity: 0.8 },
      { transform: 'scale(1.1)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.8 },
    ],
    duration: '1.5s',
    timing: 'ease-in-out',
    iteration: 'infinite',
  },
};

// ============================================================
// COLOR THEME
// ============================================================

export const THEME = {
  // Global VR environment
  environment: {
    skyColor: '#0A0A1A',            // dark sky — makes panels pop
    ambientLight: 0.15,             // dim ambient — world model provides its own lighting
    fogColor: '#1A1A2E',
    fogDensity: 0.002,
  },

  // Shared text styles
  typography: {
    fontFamily: '"JetBrains Mono", "SF Mono", monospace',
    headerSize: '16px',
    bodySize: '13px',
    statSize: '24px',
    alertSize: '14px',
  },

  // Agent color assignments (consistent across all views)
  agentColors: {
    pyro: '#DC2626',
    swarm: '#06B6D4',
    evac: '#22C55E',
    deploy: '#F59E0B',
  },
};
