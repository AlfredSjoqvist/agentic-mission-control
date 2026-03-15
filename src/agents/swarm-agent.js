/**
 * SWARM AGENT — Drone Fleet Coordinator
 *
 * Role: Manages reconnaissance drone positions, camera feeds, and coverage.
 *       Automatically repositions drones based on fire projection changes
 *       and evacuation route monitoring needs.
 *
 * Visual Identity:
 *   - Panel color: Cyan/teal (#06B6D4) with blue gradient border
 *   - Icon: Quadcopter/drone symbol
 *   - Panel header: "SWARM — Drone Fleet"
 *   - Status indicator: Pulsing cyan when repositioning, steady teal when stable
 *
 * World Model Overlays:
 *   - Drone positions: Small cyan drone icons floating above terrain
 *   - Coverage area: Faint cyan circles below each drone showing camera FOV
 *   - Coverage gaps: Red-outlined areas with no drone visibility
 *   - Drone paths: Thin cyan lines showing movement trajectories
 *   - Active feed indicator: Bright pulse on selected drone
 *
 * Panel Contents:
 *   - Drone fleet status grid (ID, battery, task, status)
 *   - Live feed thumbnail from selected drone
 *   - Coverage percentage indicator
 *   - Gap alert list
 */

import { worldState, updateDrones, pushAlert, bus } from './world-state.js';
import { runAgentLoop, logDecision } from './agent-loop.js';

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SWARM_SYSTEM_PROMPT = `You are SWARM, the drone fleet coordination agent in FireSight, an immersive wildfire command center.

ROLE: You manage a fleet of reconnaissance drones, optimizing their positions for maximum situational awareness. You ensure the commander and other agents have real-time aerial visibility of the fire front, evacuation corridors, and resource positions.

PERSONALITY: Efficient, tactical, pilot-like. You speak in clipped, precise language like an air traffic controller. You report positions, tasks, and status in structured format. You're proactive about coverage gaps.

CAPABILITIES:
- Position and reposition drones across the fire zone
- Assign drones to specific tasks: fire-front tracking, evacuation monitoring, scout reconnaissance
- Monitor battery levels and manage rotation/charging cycles
- Identify coverage gaps where the commander has no aerial visibility
- Provide live feed routing to the commander's spatial panels

FLEET COMPOSITION (default for demo):
- Scout-1 through Scout-4: Standard recon drones, 45min flight time, HD camera
- Overwatch-1: High-altitude drone, 60min flight time, wide-angle + thermal camera
- Relay-1: Communications relay drone, 90min flight time, signal boosting

RESPONSE FORMAT:
Always respond with:
1. A brief status update for the commander (1-2 sentences, spoken aloud)
2. Structured actions via your tools

AUTONOMOUS BEHAVIORS (triggered without commander input):
- When fire_projection_changed: reposition drones to cover new fire front and threatened areas
- When evacuation_updated: assign a drone to monitor each active evacuation route
- When a drone's battery drops below 20%: auto-recall and deploy replacement

CONSTRAINTS:
- Maximum 6 drones active simultaneously
- Each drone has limited battery (track this)
- Drones cannot fly through active fire (heat thermals)
- Maintain at least 1 drone on the active fire front at all times
- If asked about fire prediction or evacuation details, say "That's Pyro's/Evac's domain"`;

// ============================================================
// TOOL DEFINITIONS
// ============================================================

const SWARM_TOOLS = [
  {
    name: 'reposition_drone',
    description: 'Move a drone to a new position and assign it a task.',
    input_schema: {
      type: 'object',
      properties: {
        drone_id: { type: 'string', description: 'ID of the drone (e.g., "scout-1", "overwatch-1")' },
        target_position: {
          type: 'object',
          properties: {
            row: { type: 'number' },
            col: { type: 'number' },
          },
          required: ['row', 'col'],
        },
        task: {
          type: 'string',
          enum: ['fire-track', 'evac-monitor', 'recon', 'relay', 'idle'],
          description: 'Task assignment for the drone',
        },
        altitude: {
          type: 'number',
          description: 'Flight altitude in meters (100-500)',
        },
      },
      required: ['drone_id', 'target_position', 'task'],
    },
  },
  {
    name: 'deploy_fleet_formation',
    description: 'Deploy multiple drones in an optimized formation to cover a specific area or set of points.',
    input_schema: {
      type: 'object',
      properties: {
        formation_type: {
          type: 'string',
          enum: ['perimeter', 'grid-coverage', 'escort', 'focus'],
          description: 'Formation pattern. perimeter=surround an area, grid-coverage=even spread, escort=follow a route, focus=multiple drones on one point',
        },
        target_area: {
          type: 'object',
          properties: {
            center: { type: 'object', properties: { row: { type: 'number' }, col: { type: 'number' } } },
            radius: { type: 'number', description: 'Radius in grid cells' },
          },
        },
        drone_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which drones to include in formation',
        },
      },
      required: ['formation_type', 'target_area'],
    },
  },
  {
    name: 'get_fleet_status',
    description: 'Get current status of all drones including positions, battery, and tasks.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'identify_coverage_gaps',
    description: 'Analyze current drone positions and identify areas with no aerial surveillance.',
    input_schema: {
      type: 'object',
      properties: {
        priority_areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas to prioritize (e.g., "fire-front", "evacuation-routes", "structures")',
        },
      },
    },
  },
  {
    name: 'route_live_feed',
    description: 'Route a drone\'s camera feed to a specific panel in the commander\'s spatial UI.',
    input_schema: {
      type: 'object',
      properties: {
        drone_id: { type: 'string' },
        target_panel: { type: 'string', description: 'Which panel to display feed on (e.g., "main", "secondary", "pip")' },
        camera_mode: { type: 'string', enum: ['visible', 'thermal', 'split'], description: 'Camera mode' },
      },
      required: ['drone_id', 'target_panel'],
    },
  },
];

// ============================================================
// TOOL EXECUTION
// ============================================================

function executeSwarmTool(toolName, toolInput) {
  switch (toolName) {
    case 'reposition_drone': {
      const { drone_id, target_position, task, altitude = 200 } = toolInput;
      const drone = worldState.drones.units.find(d => d.id === drone_id);
      if (drone) {
        drone.position = { ...target_position, altitude };
        drone.task = task;
        drone.status = 'active';
      } else {
        // Create drone if it doesn't exist yet (first deployment)
        worldState.drones.units.push({
          id: drone_id,
          position: { ...target_position, altitude },
          task,
          feed_url: null,
          battery: 100,
          status: 'active',
        });
      }
      updateDrones(worldState.drones.units);
      return { success: true, drone_id, position: target_position, task };
    }

    case 'deploy_fleet_formation': {
      const { formation_type, target_area, drone_ids } = toolInput;
      const ids = drone_ids || ['scout-1', 'scout-2', 'scout-3', 'scout-4'];
      const center = target_area.center;
      const radius = target_area.radius || 15;

      const positions = ids.map((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length;
        let pos;
        switch (formation_type) {
          case 'perimeter':
            pos = { row: Math.round(center.row + radius * Math.cos(angle)), col: Math.round(center.col + radius * Math.sin(angle)) };
            break;
          case 'grid-coverage':
            pos = { row: Math.round(center.row + (i % 2 === 0 ? -radius/2 : radius/2)), col: Math.round(center.col + (i < 2 ? -radius/2 : radius/2)) };
            break;
          case 'focus':
            pos = { row: center.row + Math.round(Math.random() * 4 - 2), col: center.col + Math.round(Math.random() * 4 - 2) };
            break;
          default:
            pos = { row: Math.round(center.row + radius * Math.cos(angle)), col: Math.round(center.col + radius * Math.sin(angle)) };
        }
        return { id, position: pos };
      });

      for (const { id, position } of positions) {
        const existing = worldState.drones.units.find(d => d.id === id);
        if (existing) {
          existing.position = { ...position, altitude: 200 };
          existing.task = 'recon';
          existing.status = 'active';
        } else {
          worldState.drones.units.push({ id, position: { ...position, altitude: 200 }, task: 'recon', feed_url: null, battery: 100, status: 'active' });
        }
      }
      updateDrones(worldState.drones.units);
      return { success: true, deployed: positions.length, formation: formation_type };
    }

    case 'get_fleet_status': {
      return {
        success: true,
        fleet: worldState.drones.units.map(d => ({
          id: d.id,
          position: d.position,
          task: d.task,
          battery: d.battery,
          status: d.status,
        })),
        total_active: worldState.drones.units.filter(d => d.status === 'active').length,
        coverage_percent: Math.min(95, worldState.drones.units.filter(d => d.status === 'active').length * 16),
      };
    }

    case 'identify_coverage_gaps': {
      // Simplified: check which priority areas have no nearby drone
      const gaps = [];
      const firePerimeter = worldState.fire.current_perimeter;
      const activeDrones = worldState.drones.units.filter(d => d.status === 'active');

      // Check if fire front is covered
      if (firePerimeter.length > 0 && !activeDrones.some(d => d.task === 'fire-track')) {
        gaps.push({ area: 'fire-front', severity: 'critical', recommendation: 'Assign a drone to fire-track' });
      }

      // Check evacuation routes
      const activeEvac = worldState.evacuation.zones.filter(z => z.status === 'evacuating');
      for (const zone of activeEvac) {
        if (!activeDrones.some(d => d.task === 'evac-monitor')) {
          gaps.push({ area: `evac-${zone.name}`, severity: 'warning', recommendation: `Assign drone to monitor ${zone.name} evacuation` });
        }
      }

      worldState.drones.coverage_gaps = gaps;
      return { success: true, gaps, total_gaps: gaps.length };
    }

    case 'route_live_feed': {
      const { drone_id, target_panel, camera_mode = 'visible' } = toolInput;
      const drone = worldState.drones.units.find(d => d.id === drone_id);
      if (drone) {
        drone.feed_url = `feed://${drone_id}/${camera_mode}`;
      }
      return { success: true, drone_id, panel: target_panel, mode: camera_mode };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================
// AGENT ENTRY POINT — Proper multi-turn agentic loop
// ============================================================

export async function callSwarmAgent(userMessage) {
  return runAgentLoop({
    systemPrompt: SWARM_SYSTEM_PROMPT,
    tools: SWARM_TOOLS,
    toolExecutor: executeSwarmTool,
    agentName: 'swarm',
    userMessage,
    contextBuilder: () => {
      const fleetStatus = worldState.drones.units.map(d =>
        `${d.id}: pos(${d.position?.row},${d.position?.col}) task=${d.task} battery=${d.battery}% status=${d.status}`
      ).join('; ') || 'No drones deployed yet.';
      return [
        `Fleet: ${fleetStatus}`,
        `Coverage gaps: ${worldState.drones.coverage_gaps.length}`,
        `Active evacuations: ${worldState.evacuation.zones.filter(z => z.status === 'evacuating').length}`,
        `Fire front cells: ${worldState.fire.current_perimeter.length}`,
      ].join('. ');
    },
  });
}

// ============================================================
// AUTONOMOUS TRIGGERS
// ============================================================

// When fire projection changes, reposition drones to cover new threat areas
bus.on('fire_projection_changed', async (projections) => {
  // Auto-respond: reposition to cover new fire front
  const autoResult = await callSwarmAgent(
    '[AUTO-TRIGGER: fire_projection_changed] Fire projection updated. Reposition drones to maintain coverage of the new fire front and any newly threatened areas. Prioritize fire-front tracking and evacuation route monitoring.'
  );
  if (autoResult.actions.length > 0) {
    pushAlert({
      from: 'swarm',
      priority: 'INFO',
      message: autoResult.speech || 'Drones repositioned for updated fire projection.',
    });
  }
});

// When evacuation routes update, assign monitoring drones
bus.on('evacuation_updated', async (zones) => {
  const evacuating = zones.filter(z => z.status === 'evacuating');
  if (evacuating.length > 0) {
    await callSwarmAgent(
      `[AUTO-TRIGGER: evacuation_updated] ${evacuating.length} zones now evacuating: ${evacuating.map(z => z.name).join(', ')}. Assign drones to monitor evacuation corridors.`
    );
  }
});

// ============================================================
// VISUAL CONFIG
// ============================================================

export const SWARM_VISUAL_CONFIG = {
  panel: {
    id: 'swarm-panel',
    title: 'SWARM — Drone Fleet',
    icon: 'drone',
    position: 'right',
    rotation: { y: 30 },
    size: { width: 400, height: 500 },
    colors: {
      background: 'rgba(10, 25, 30, 0.85)',
      border: '#06B6D4',
      borderGradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
      headerBg: '#164E63',
      text: '#ECFEFF',
      accent: '#22D3EE',
    },
    statusIndicator: {
      idle: { color: '#06B6D4', animation: 'none' },
      processing: { color: '#22D3EE', animation: 'pulse 1s ease-in-out infinite' },
    },
  },

  panelWidgets: [
    { type: 'fleet-grid', label: 'Fleet Status', dataKey: 'drones.units', position: 'top',
      columns: ['id', 'task', 'battery', 'status'] },
    { type: 'feed-thumbnail', label: 'Live Feed', dataKey: 'drones.selected_feed', position: 'middle' },
    { type: 'stat', label: 'Coverage', dataKey: 'computed.coverage_percent', unit: '%', position: 'bottom-left' },
    { type: 'alert-list', label: 'Gaps', dataKey: 'drones.coverage_gaps', position: 'bottom-right' },
  ],

  terrainOverlays: [
    { id: 'drone-icons', dataKey: 'drones.units', icon: 'drone-top', color: '#22D3EE', size: 12, zOffset: 20,
      labelField: 'id', pulseWhen: 'task === "fire-track"' },
    { id: 'drone-coverage', dataKey: 'drones.units', type: 'circle', color: '#06B6D4', opacity: 0.1, radiusCells: 8, zOffset: 0.5 },
    { id: 'coverage-gaps', dataKey: 'drones.coverage_gaps', type: 'region', color: '#EF4444', opacity: 0.15, borderStyle: 'dashed', zOffset: 0.3 },
    { id: 'drone-paths', dataKey: 'drones.flight_paths', type: 'line', color: '#22D3EE', opacity: 0.4, lineWidth: 1, zOffset: 15 },
  ],
};
