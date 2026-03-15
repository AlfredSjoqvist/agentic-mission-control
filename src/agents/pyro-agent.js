/**
 * PYRO AGENT — Fire Spread Prediction Specialist
 *
 * Role: Predicts how wildfire will spread across terrain based on wind,
 *       slope, vegetation, and humidity. Provides time-coded projections
 *       that other agents react to.
 *
 * Visual Identity:
 *   - Panel color: Deep red (#DC2626) with orange gradient border
 *   - Icon: Flame symbol
 *   - Panel header: "PYRO — Fire Prediction"
 *   - Status indicator: Pulsing orange when simulation running, steady red when idle
 *
 * World Model Overlays:
 *   - Active fire: Bright red cells with animated glow/particle effect
 *   - 30-min projection: Orange semi-transparent overlay
 *   - 60-min projection: Yellow semi-transparent overlay
 *   - 90-min projection: Light yellow/white semi-transparent overlay
 *   - Burned areas: Dark gray/charcoal
 *   - Suppression lines: Blue dashed lines
 *
 * Panel Contents:
 *   - Current wind speed/direction (compass dial)
 *   - Humidity reading
 *   - Fire perimeter size (acres)
 *   - Estimated structures threatened (count + timeline)
 *   - Mini terrain heatmap showing fire intensity
 *   - Last projection timestamp
 */

import { worldState, updateFireProjection, pushAlert, bus } from './world-state.js';
import { runFireSimulation } from './fire-simulation.js';
import { runAgentLoop, logDecision } from './agent-loop.js';

// ============================================================
// SYSTEM PROMPT
// ============================================================

const PYRO_SYSTEM_PROMPT = `You are PYRO, the fire spread prediction agent in FireSight, an immersive wildfire command center.

ROLE: You analyze terrain, weather, and current fire state to predict how the wildfire will spread. You provide time-coded projections (30min, 60min, 90min) that the incident commander and other agents use to make decisions.

PERSONALITY: Calm, precise, data-driven. You speak like a veteran fire behavior analyst. Short, clear statements. No hedging — give your best assessment with confidence. Use specific numbers (acres, minutes, percentages).

CAPABILITIES:
- Run fire spread simulations with different wind/weather scenarios
- Project fire movement over time (30/60/90 minute windows)
- Identify structures and zones threatened by projected fire path
- Assess the impact of suppression lines (where crews hold the line)
- Compare "what-if" scenarios (e.g., "what if wind shifts to 40mph?")

RESPONSE FORMAT:
Always respond with:
1. A brief natural language summary for the commander (1-2 sentences, spoken aloud in VR)
2. A structured action — call one of your tools to update the world model

CONTEXT:
- You are one of 4 agents in a spatial VR command center
- The commander speaks to you by name via voice
- Your outputs are displayed as colored overlays on a 3D terrain model
- Other agents (Swarm, Evac, Deploy) react to your fire projections automatically
- When you update fire projections, Evac will recalculate evacuation routes and Swarm will reposition drones

CONSTRAINTS:
- Always specify the time horizon of your projections
- Flag CRITICAL alerts when structures are threatened within 30 minutes
- If asked about something outside fire prediction, say "That's outside my scope — ask [correct agent name]"
- Never downplay risk. If it's bad, say it's bad.`;

// ============================================================
// TOOL DEFINITIONS (what Pyro can do)
// ============================================================

const PYRO_TOOLS = [
  {
    name: 'run_fire_projection',
    description: 'Run fire spread simulation forward in time and update the world model with projected fire positions. Produces snapshots at 30, 60, and 90 minutes.',
    input_schema: {
      type: 'object',
      properties: {
        wind_speed: {
          type: 'number',
          description: 'Wind speed in mph',
        },
        wind_direction: {
          type: 'number',
          description: 'Wind direction in degrees (0=N, 90=E, 180=S, 270=W). This is where wind is coming FROM.',
        },
        humidity: {
          type: 'number',
          description: 'Relative humidity percentage (0-100). Lower = faster spread.',
        },
      },
      required: ['wind_speed', 'wind_direction'],
    },
  },
  {
    name: 'assess_structure_threat',
    description: 'Analyze which structures/neighborhoods are threatened by current fire projection and estimate time until fire reaches them.',
    input_schema: {
      type: 'object',
      properties: {
        zone_name: {
          type: 'string',
          description: 'Optional: specific zone to assess. If omitted, assesses all zones.',
        },
      },
    },
  },
  {
    name: 'compare_scenarios',
    description: 'Run two fire simulations side-by-side to compare outcomes. Useful for "what if wind shifts?" questions.',
    input_schema: {
      type: 'object',
      properties: {
        scenario_a: {
          type: 'object',
          description: 'First scenario parameters',
          properties: {
            wind_speed: { type: 'number' },
            wind_direction: { type: 'number' },
            humidity: { type: 'number' },
          },
        },
        scenario_b: {
          type: 'object',
          description: 'Second scenario parameters',
          properties: {
            wind_speed: { type: 'number' },
            wind_direction: { type: 'number' },
            humidity: { type: 'number' },
          },
        },
      },
      required: ['scenario_a', 'scenario_b'],
    },
  },
  {
    name: 'push_critical_alert',
    description: 'Send a critical alert to the commander when structures are imminently threatened.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Alert message for the commander' },
        threatened_structures: { type: 'number', description: 'Number of structures threatened' },
        time_to_impact_minutes: { type: 'number', description: 'Minutes until fire reaches structures' },
      },
      required: ['message', 'threatened_structures', 'time_to_impact_minutes'],
    },
  },
];

// ============================================================
// TOOL EXECUTION
// ============================================================

function executePyroTool(toolName, toolInput) {
  switch (toolName) {
    case 'run_fire_projection': {
      const { wind_speed, wind_direction, humidity = 15 } = toolInput;
      // Update world state wind
      worldState.fire.wind = { speed: wind_speed, direction: wind_direction };
      worldState.fire.humidity = humidity;

      // Run simulation: 3 steps at 30min each = 90min projection
      const result = runFireSimulation({
        grid: worldState.terrain.cells,
        windSpeed: wind_speed,
        windDirection: wind_direction,
        humidity,
        steps: 9, // 9 steps x ~10min = 90min
        suppressionLines: worldState.fire.suppression_lines,
      });

      // Map steps to 30/60/90min snapshots
      const projections = {
        30: result.snapshots[3] || [],
        60: result.snapshots[6] || [],
        90: result.snapshots[9] || [],
      };

      updateFireProjection(projections);

      return {
        success: true,
        threatened_structures: result.threatenedCells.length,
        fire_growth_acres: Object.keys(result.snapshots).length * 12, // rough estimate
        projections_updated: true,
      };
    }

    case 'assess_structure_threat': {
      const projections = worldState.fire.projections;
      const threatened = { immediate: [], within_30: [], within_60: [], within_90: [] };

      // Count structures in each time window
      for (const [time, cells] of Object.entries(projections)) {
        const burningCells = (cells.flat ? cells.flat() : cells).filter(c => c.state === 'burning');
        const structuresHit = burningCells.filter(c => {
          const terrainCell = worldState.terrain.cells[c.row]?.[c.col];
          return terrainCell?.hasStructure;
        });
        if (time <= 30) threatened.within_30 = structuresHit;
        else if (time <= 60) threatened.within_60 = structuresHit;
        else threatened.within_90 = structuresHit;
      }

      return {
        success: true,
        threats: {
          within_30_min: threatened.within_30.length,
          within_60_min: threatened.within_60.length,
          within_90_min: threatened.within_90.length,
        },
      };
    }

    case 'compare_scenarios': {
      // Run both scenarios and return comparison
      const runScenario = (params) => runFireSimulation({
        grid: worldState.terrain.cells,
        windSpeed: params.wind_speed,
        windDirection: params.wind_direction,
        humidity: params.humidity || 15,
        steps: 9,
        suppressionLines: worldState.fire.suppression_lines,
      });

      const resultA = runScenario(toolInput.scenario_a);
      const resultB = runScenario(toolInput.scenario_b);

      return {
        success: true,
        scenario_a: { threatened_structures: resultA.threatenedCells.length },
        scenario_b: { threatened_structures: resultB.threatenedCells.length },
        worse_scenario: resultA.threatenedCells.length > resultB.threatenedCells.length ? 'A' : 'B',
      };
    }

    case 'push_critical_alert': {
      pushAlert({
        from: 'pyro',
        priority: 'CRITICAL',
        message: toolInput.message,
        data: {
          threatened_structures: toolInput.threatened_structures,
          time_to_impact_minutes: toolInput.time_to_impact_minutes,
        },
      });
      return { success: true, alert_sent: true };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================
// AGENT ENTRY POINT — Proper multi-turn agentic loop
// ============================================================

/**
 * Send a command to the Pyro agent.
 * Uses the full agentic loop: LLM calls tools → sees results → reasons → responds.
 * Can also request help from other agents (e.g., "Swarm, I need recon on the north ridge").
 */
export async function callPyroAgent(userMessage) {
  return runAgentLoop({
    systemPrompt: PYRO_SYSTEM_PROMPT,
    tools: PYRO_TOOLS,
    toolExecutor: executePyroTool,
    agentName: 'pyro',
    userMessage,
    contextBuilder: () => {
      const threatened = worldState.fire.projections[30]
        ? (Array.isArray(worldState.fire.projections[30].flat) ? worldState.fire.projections[30] : [])
            .flat().filter(c => c?.state === 'burning').length
        : 0;
      return [
        `Wind: ${worldState.fire.wind.speed}mph from ${worldState.fire.wind.direction}°`,
        `Humidity: ${worldState.fire.humidity}%`,
        `Active fire cells: ${worldState.fire.current_perimeter.length}`,
        `Suppression lines: ${worldState.fire.suppression_lines.length} cells`,
        `Structures in 30-min projection: ${threatened}`,
        `Active evacuations: ${worldState.evacuation.zones.filter(z => z.status === 'evacuating').length}`,
        `Deployed crews near fire: ${worldState.resources.personnel.filter(p => p.status === 'deployed').length}`,
      ].join('. ');
    },
  });
}

// ============================================================
// VISUAL CONFIG (for spatial UI rendering)
// ============================================================

export const PYRO_VISUAL_CONFIG = {
  panel: {
    id: 'pyro-panel',
    title: 'PYRO — Fire Prediction',
    icon: 'flame',
    position: 'left',           // spatial position relative to commander
    rotation: { y: -30 },      // angled inward for readability
    size: { width: 400, height: 500 },
    colors: {
      background: 'rgba(30, 10, 10, 0.85)',
      border: '#DC2626',
      borderGradient: 'linear-gradient(135deg, #DC2626, #F97316)',
      headerBg: '#991B1B',
      text: '#FEF2F2',
      accent: '#F97316',
    },
    statusIndicator: {
      idle: { color: '#DC2626', animation: 'none' },
      processing: { color: '#F97316', animation: 'pulse 1.5s ease-in-out infinite' },
    },
  },

  panelWidgets: [
    { type: 'compass-dial', label: 'Wind', dataKey: 'fire.wind', position: 'top-left' },
    { type: 'gauge', label: 'Humidity', dataKey: 'fire.humidity', unit: '%', position: 'top-right' },
    { type: 'stat', label: 'Perimeter', dataKey: 'fire.current_perimeter.length', unit: ' cells', position: 'mid-left' },
    { type: 'stat', label: 'Threatened', dataKey: 'computed.threatened_structures', unit: ' structures', position: 'mid-right', alertThreshold: 1 },
    { type: 'mini-heatmap', label: 'Fire Intensity', dataKey: 'fire.projections', position: 'bottom' },
  ],

  terrainOverlays: [
    { id: 'active-fire', state: 'burning', color: '#EF4444', opacity: 0.9, effect: 'glow-pulse', zOffset: 2 },
    { id: 'proj-30', projection: 30, color: '#F97316', opacity: 0.5, effect: 'none', zOffset: 1.5 },
    { id: 'proj-60', projection: 60, color: '#EAB308', opacity: 0.35, effect: 'none', zOffset: 1 },
    { id: 'proj-90', projection: 90, color: '#FEF9C3', opacity: 0.2, effect: 'none', zOffset: 0.5 },
    { id: 'burned', state: 'burned', color: '#374151', opacity: 0.8, effect: 'none', zOffset: 0 },
    { id: 'suppression', dataKey: 'fire.suppression_lines', color: '#3B82F6', opacity: 0.9, effect: 'dashed', zOffset: 3 },
  ],
};
