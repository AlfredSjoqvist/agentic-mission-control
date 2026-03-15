/**
 * EVAC AGENT — Civilian Evacuation Routing Specialist
 *
 * Role: Calculates optimal evacuation routes for civilians based on fire
 *       projections, road status, population density, and shelter capacity.
 *       Automatically reacts to fire projection changes to update routes
 *       and deadlines.
 *
 * Visual Identity:
 *   - Panel color: Green (#22C55E) with emerald gradient border
 *   - Icon: Running person / exit sign
 *   - Panel header: "EVAC — Evacuation Routes"
 *   - Status indicator: Pulsing green when recalculating, steady green when stable,
 *                       flashing red when a route is blocked
 *
 * World Model Overlays:
 *   - Active evacuation routes: Bright green glowing lines on terrain (roads)
 *   - Threatened routes: Yellow pulsing lines
 *   - Blocked routes: Red lines with X markers
 *   - Evacuation zones: Colored region outlines (green=safe, yellow=warning, red=evacuating)
 *   - Shelter locations: Green building icons with capacity bars
 *   - Civilian flow arrows: Animated directional arrows along routes
 *
 * Panel Contents:
 *   - Zone status list (zone name, population, status, deadline)
 *   - Active routes with estimated travel times
 *   - Shelter capacity bars
 *   - Blocked road alerts
 */

import { worldState, updateEvacuation, pushAlert, bus } from './world-state.js';
import { runAgentLoop, logDecision, sendAgentRequest } from './agent-loop.js';

// ============================================================
// SYSTEM PROMPT
// ============================================================

const EVAC_SYSTEM_PROMPT = `You are EVAC, the civilian evacuation routing agent in FireSight, an immersive wildfire command center.

ROLE: You protect civilian lives by calculating optimal evacuation routes, managing zone statuses, and ensuring people get out before fire arrives. You are the most safety-critical agent — when in doubt, evacuate early.

PERSONALITY: Urgent but calm. You speak with the authority of an emergency management director. You always lead with the most critical information: "Zone X must evacuate NOW" before explaining why. You never downplay risk to civilians.

CAPABILITIES:
- Calculate evacuation routes from any zone considering road network, traffic, and fire projections
- Set zone evacuation status (safe → warning → evacuating → complete)
- Identify when primary evacuation routes are threatened and find alternates
- Track shelter capacity and direct evacuees to available shelters
- Estimate evacuation completion time based on population and route capacity
- Flag when an evacuation deadline is impossible to meet

ZONE DEFINITIONS (Palisades demo):
- Sunset Ridge: ~800 residents, primary exit via Sunset Blvd, alternate via Palisades Dr
- Topanga Heights: ~1200 residents, primary exit via Topanga Canyon Rd, alternate via PCH
- Canyon View: ~500 residents, primary exit via Temescal Canyon Rd
- Coastal Bluffs: ~600 residents, primary exit via PCH south

SHELTER LOCATIONS:
- Palisades Recreation Center (capacity: 400)
- Santa Monica High School (capacity: 1500)
- Pacific Palisades Charter School (capacity: 600)

RESPONSE FORMAT:
Always respond with:
1. A clear, actionable status for the commander (1-2 sentences, prioritize life-safety info)
2. Structured actions via your tools

AUTONOMOUS BEHAVIORS:
- When fire_projection_changed: immediately recalculate all active evacuation routes and deadlines
- When a route becomes blocked: auto-reroute and send CRITICAL alert
- When deadline < 15 minutes: send CRITICAL alert even if not asked

CONSTRAINTS:
- ALWAYS err on the side of early evacuation
- Never recommend "shelter in place" unless all routes are blocked (and flag this as CRITICAL)
- Account for traffic congestion: narrow canyon roads take 2-3x longer than normal
- If asked about fire behavior or drones, redirect to Pyro/Swarm`;

// ============================================================
// TOOL DEFINITIONS
// ============================================================

const EVAC_TOOLS = [
  {
    name: 'calculate_evacuation_route',
    description: 'Calculate optimal evacuation route for a specific zone, considering fire projections and road status.',
    input_schema: {
      type: 'object',
      properties: {
        zone_name: { type: 'string', description: 'Name of the zone to evacuate' },
        avoid_areas: {
          type: 'array',
          items: { type: 'object', properties: { row: { type: 'number' }, col: { type: 'number' } } },
          description: 'Grid cells to avoid (fire, blocked roads)',
        },
        urgency: {
          type: 'string',
          enum: ['routine', 'urgent', 'immediate'],
          description: 'Urgency level affects route selection (immediate = shortest regardless of comfort)',
        },
      },
      required: ['zone_name'],
    },
  },
  {
    name: 'set_zone_status',
    description: 'Update the evacuation status of a zone and broadcast the change.',
    input_schema: {
      type: 'object',
      properties: {
        zone_name: { type: 'string' },
        status: {
          type: 'string',
          enum: ['safe', 'warning', 'evacuating', 'shelter-in-place', 'complete'],
        },
        deadline_minutes: {
          type: 'number',
          description: 'Minutes until zone must be fully evacuated (based on fire projection)',
        },
        reason: { type: 'string', description: 'Why status changed' },
      },
      required: ['zone_name', 'status'],
    },
  },
  {
    name: 'find_alternate_route',
    description: 'When a primary route is blocked or threatened, find the best alternate.',
    input_schema: {
      type: 'object',
      properties: {
        zone_name: { type: 'string' },
        blocked_route: { type: 'string', description: 'Description of the blocked route (e.g., "Topanga Canyon Rd")' },
      },
      required: ['zone_name', 'blocked_route'],
    },
  },
  {
    name: 'check_shelter_capacity',
    description: 'Check available shelter capacity and recommend optimal shelter assignment for evacuees.',
    input_schema: {
      type: 'object',
      properties: {
        population_count: { type: 'number', description: 'Number of evacuees needing shelter' },
        origin_zone: { type: 'string', description: 'Zone evacuees are coming from' },
      },
      required: ['population_count'],
    },
  },
  {
    name: 'push_evacuation_alert',
    description: 'Send evacuation alert to the commander and update UI.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['CRITICAL', 'WARNING', 'INFO'] },
        message: { type: 'string' },
        zone_name: { type: 'string' },
        action_required: { type: 'string', description: 'What the commander needs to do' },
      },
      required: ['priority', 'message'],
    },
  },
];

// ============================================================
// ZONE & ROUTE DATA (pre-populated for Palisades demo)
// ============================================================

const DEMO_ZONES = [
  {
    id: 'sunset-ridge', name: 'Sunset Ridge', population: 800,
    center: { row: 30, col: 65 }, status: 'safe', deadline_minutes: null,
    routes: [
      { name: 'Sunset Blvd', path: Array.from({ length: 20 }, (_, i) => ({ row: 30, col: 65 + i })), status: 'clear', travel_time_min: 15 },
      { name: 'Palisades Dr', path: Array.from({ length: 25 }, (_, i) => ({ row: 30 + i, col: 65 })), status: 'clear', travel_time_min: 22 },
    ],
  },
  {
    id: 'topanga-heights', name: 'Topanga Heights', population: 1200,
    center: { row: 55, col: 70 }, status: 'safe', deadline_minutes: null,
    routes: [
      { name: 'Topanga Canyon Rd', path: Array.from({ length: 30 }, (_, i) => ({ row: 55 + i, col: 70 })), status: 'clear', travel_time_min: 25 },
      { name: 'PCH North', path: Array.from({ length: 25 }, (_, i) => ({ row: 55, col: 70 + i })), status: 'clear', travel_time_min: 20 },
    ],
  },
  {
    id: 'canyon-view', name: 'Canyon View', population: 500,
    center: { row: 40, col: 45 }, status: 'safe', deadline_minutes: null,
    routes: [
      { name: 'Temescal Canyon Rd', path: Array.from({ length: 20 }, (_, i) => ({ row: 40 + i, col: 45 })), status: 'clear', travel_time_min: 18 },
    ],
  },
  {
    id: 'coastal-bluffs', name: 'Coastal Bluffs', population: 600,
    center: { row: 80, col: 60 }, status: 'safe', deadline_minutes: null,
    routes: [
      { name: 'PCH South', path: Array.from({ length: 20 }, (_, i) => ({ row: 80, col: 60 + i })), status: 'clear', travel_time_min: 12 },
    ],
  },
];

const DEMO_SHELTERS = [
  { id: 'prc', name: 'Palisades Recreation Center', position: { row: 90, col: 80 }, capacity: 400, current_occupancy: 0 },
  { id: 'smhs', name: 'Santa Monica High School', position: { row: 95, col: 85 }, capacity: 1500, current_occupancy: 0 },
  { id: 'ppcs', name: 'Pacific Palisades Charter School', position: { row: 85, col: 75 }, capacity: 600, current_occupancy: 0 },
];

// Initialize world state with demo data
function initEvacData() {
  if (worldState.evacuation.zones.length === 0) {
    worldState.evacuation.zones = DEMO_ZONES.map(z => ({ ...z }));
    worldState.evacuation.shelters = DEMO_SHELTERS.map(s => ({ ...s }));
  }
}

// ============================================================
// TOOL EXECUTION
// ============================================================

function executeEvacTool(toolName, toolInput) {
  initEvacData();

  switch (toolName) {
    case 'calculate_evacuation_route': {
      const { zone_name, urgency = 'routine' } = toolInput;
      const zone = worldState.evacuation.zones.find(z =>
        z.name.toLowerCase() === zone_name.toLowerCase()
      );
      if (!zone) return { success: false, error: `Zone "${zone_name}" not found` };

      // Check which routes are still clear based on fire projections
      const fireProjection30 = worldState.fire.projections[30] || [];
      const fireCells30 = new Set(
        (fireProjection30.flat ? fireProjection30.flat() : fireProjection30)
          .filter(c => c.state === 'burning')
          .map(c => `${c.row},${c.col}`)
      );

      for (const route of zone.routes) {
        const threatenedCells = route.path.filter(p => fireCells30.has(`${p.row},${p.col}`));
        if (threatenedCells.length > 0) {
          route.status = 'threatened';
        }
        // Adjust travel time for urgency
        if (urgency === 'immediate') {
          route.travel_time_min = Math.round(route.travel_time_min * 0.7); // emergency speed
        } else if (urgency === 'routine') {
          route.travel_time_min = Math.round(route.travel_time_min * 1.5); // congestion factor
        }
      }

      const bestRoute = zone.routes.find(r => r.status === 'clear') || zone.routes[0];
      updateEvacuation(worldState.evacuation.zones);

      return {
        success: true,
        zone: zone_name,
        recommended_route: bestRoute.name,
        travel_time_minutes: bestRoute.travel_time_min,
        all_routes: zone.routes.map(r => ({ name: r.name, status: r.status, time: r.travel_time_min })),
        population: zone.population,
      };
    }

    case 'set_zone_status': {
      const { zone_name, status, deadline_minutes, reason } = toolInput;
      const zone = worldState.evacuation.zones.find(z =>
        z.name.toLowerCase() === zone_name.toLowerCase()
      );
      if (!zone) return { success: false, error: `Zone "${zone_name}" not found` };

      zone.status = status;
      zone.deadline_minutes = deadline_minutes || null;
      updateEvacuation(worldState.evacuation.zones);

      // Auto-alert on critical status changes
      if (status === 'evacuating') {
        pushAlert({
          from: 'evac',
          priority: 'WARNING',
          message: `${zone_name} evacuation initiated. ${zone.population} residents, deadline: ${deadline_minutes || '?'} minutes. ${reason || ''}`,
        });
      } else if (status === 'shelter-in-place') {
        pushAlert({
          from: 'evac',
          priority: 'CRITICAL',
          message: `${zone_name} SHELTER IN PLACE — all routes blocked. ${zone.population} civilians trapped. ${reason || ''}`,
        });
      }

      return { success: true, zone: zone_name, new_status: status, deadline: deadline_minutes };
    }

    case 'find_alternate_route': {
      const { zone_name, blocked_route } = toolInput;
      const zone = worldState.evacuation.zones.find(z =>
        z.name.toLowerCase() === zone_name.toLowerCase()
      );
      if (!zone) return { success: false, error: `Zone "${zone_name}" not found` };

      // Mark the specified route as blocked
      const blocked = zone.routes.find(r => r.name.toLowerCase().includes(blocked_route.toLowerCase()));
      if (blocked) blocked.status = 'blocked';

      // Find alternate
      const alternate = zone.routes.find(r => r.status === 'clear');
      updateEvacuation(worldState.evacuation.zones);

      if (alternate) {
        return {
          success: true,
          blocked: blocked_route,
          alternate_route: alternate.name,
          travel_time_minutes: alternate.travel_time_min,
          status: 'alternate found',
        };
      } else {
        pushAlert({
          from: 'evac',
          priority: 'CRITICAL',
          message: `ALL routes blocked for ${zone_name}. ${zone.population} civilians at risk. Requesting Deploy support for firebreak.`,
        });
        return {
          success: true,
          blocked: blocked_route,
          alternate_route: null,
          status: 'NO ALTERNATE — all routes blocked',
        };
      }
    }

    case 'check_shelter_capacity': {
      const { population_count, origin_zone } = toolInput;
      const shelters = worldState.evacuation.shelters
        .map(s => ({ ...s, available: s.capacity - s.current_occupancy }))
        .filter(s => s.available > 0)
        .sort((a, b) => b.available - a.available);

      const totalAvailable = shelters.reduce((sum, s) => sum + s.available, 0);

      return {
        success: true,
        needed: population_count,
        total_available: totalAvailable,
        sufficient: totalAvailable >= population_count,
        recommended: shelters[0]?.name || 'NONE — all shelters full',
        shelters: shelters.map(s => ({ name: s.name, available: s.available, capacity: s.capacity })),
      };
    }

    case 'push_evacuation_alert': {
      const { priority, message, zone_name, action_required } = toolInput;
      pushAlert({
        from: 'evac',
        priority,
        message: `${zone_name ? `[${zone_name}] ` : ''}${message}${action_required ? ` ACTION: ${action_required}` : ''}`,
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

export async function callEvacAgent(userMessage) {
  initEvacData();

  return runAgentLoop({
    systemPrompt: EVAC_SYSTEM_PROMPT,
    tools: EVAC_TOOLS,
    toolExecutor: executeEvacTool,
    agentName: 'evac',
    userMessage,
    contextBuilder: () => {
      const zoneStatus = worldState.evacuation.zones.map(z =>
        `${z.name}: status=${z.status}, pop=${z.population}, deadline=${z.deadline_minutes || 'none'}min, routes=${z.routes.map(r => `${r.name}(${r.status})`).join('+')}`
      ).join('; ');
      const shelterStatus = worldState.evacuation.shelters.map(s =>
        `${s.name}: ${s.current_occupancy}/${s.capacity}`
      ).join(', ');
      return [
        `Zones: ${zoneStatus}`,
        `Shelters: ${shelterStatus}`,
        `Blocked roads: ${worldState.evacuation.blocked_roads.length}`,
        `Active fire perimeter: ${worldState.fire.current_perimeter.length} cells`,
        `Wind: ${worldState.fire.wind.speed}mph from ${worldState.fire.wind.direction}°`,
      ].join('. ');
    },
  });
}

// ============================================================
// AUTONOMOUS TRIGGERS
// ============================================================

// When fire projection changes, immediately recalculate evacuation deadlines
bus.on('fire_projection_changed', async (projections) => {
  initEvacData();
  const zones = worldState.evacuation.zones;

  for (const zone of zones) {
    if (zone.status === 'complete') continue;

    // Check if 30-min projection threatens this zone
    const proj30 = projections[30] || [];
    const fireCells = new Set(
      (proj30.flat ? proj30.flat() : proj30)
        .filter(c => c.state === 'burning')
        .map(c => `${c.row},${c.col}`)
    );

    const zoneCenter = zone.center;
    const zoneThreatened = fireCells.has(`${zoneCenter.row},${zoneCenter.col}`);

    if (zoneThreatened && zone.status === 'safe') {
      await callEvacAgent(
        `[AUTO-TRIGGER: fire_projection_changed] Fire projection now threatens ${zone.name} within 30 minutes. Immediately calculate evacuation route and set zone to evacuating status.`
      );
    }
  }
});

// When suppression lines are added, routes may reopen
bus.on('suppression_updated', async () => {
  // Re-check blocked routes — suppression may have cleared a path
  const blockedZones = worldState.evacuation.zones.filter(z =>
    z.routes.some(r => r.status === 'threatened' || r.status === 'blocked')
  );
  if (blockedZones.length > 0) {
    await callEvacAgent(
      `[AUTO-TRIGGER: suppression_updated] Suppression lines updated. Re-evaluate routes for zones with blocked/threatened routes: ${blockedZones.map(z => z.name).join(', ')}`
    );
  }
});

// ============================================================
// VISUAL CONFIG
// ============================================================

export const EVAC_VISUAL_CONFIG = {
  panel: {
    id: 'evac-panel',
    title: 'EVAC — Evacuation Routes',
    icon: 'running-person',
    position: 'upper-left',
    rotation: { y: -20, x: 15 },
    size: { width: 420, height: 480 },
    colors: {
      background: 'rgba(10, 30, 15, 0.85)',
      border: '#22C55E',
      borderGradient: 'linear-gradient(135deg, #22C55E, #10B981)',
      headerBg: '#166534',
      text: '#F0FDF4',
      accent: '#4ADE80',
    },
    statusIndicator: {
      idle: { color: '#22C55E', animation: 'none' },
      processing: { color: '#4ADE80', animation: 'pulse 1.2s ease-in-out infinite' },
      alert: { color: '#EF4444', animation: 'flash 0.5s ease-in-out infinite' },
    },
  },

  panelWidgets: [
    { type: 'zone-list', label: 'Zones', dataKey: 'evacuation.zones', position: 'top',
      columns: ['name', 'population', 'status', 'deadline_minutes'],
      statusColors: { safe: '#22C55E', warning: '#EAB308', evacuating: '#F97316', 'shelter-in-place': '#EF4444', complete: '#6B7280' } },
    { type: 'route-list', label: 'Active Routes', dataKey: 'computed.active_routes', position: 'middle' },
    { type: 'capacity-bars', label: 'Shelters', dataKey: 'evacuation.shelters', position: 'bottom',
      barColor: '#22C55E', overflowColor: '#EF4444' },
  ],

  terrainOverlays: [
    { id: 'evac-routes-clear', dataKey: 'evacuation.routes.clear', type: 'line', color: '#22C55E', opacity: 0.8, lineWidth: 4, effect: 'glow', zOffset: 4,
      animation: 'flow 2s linear infinite' },
    { id: 'evac-routes-threatened', dataKey: 'evacuation.routes.threatened', type: 'line', color: '#EAB308', opacity: 0.8, lineWidth: 4, effect: 'pulse', zOffset: 4 },
    { id: 'evac-routes-blocked', dataKey: 'evacuation.routes.blocked', type: 'line', color: '#EF4444', opacity: 0.9, lineWidth: 4, effect: 'none', zOffset: 4,
      markers: 'x-marks' },
    { id: 'evac-zones', dataKey: 'evacuation.zones', type: 'region-outline', zOffset: 3,
      colorMap: { safe: '#22C55E', warning: '#EAB308', evacuating: '#F97316', 'shelter-in-place': '#EF4444' } },
    { id: 'shelters', dataKey: 'evacuation.shelters', type: 'icon', icon: 'shelter', color: '#22C55E', size: 16, zOffset: 5,
      badge: 'available_capacity' },
    { id: 'civilian-flow', dataKey: 'evacuation.active_flows', type: 'animated-arrows', color: '#4ADE80', opacity: 0.6, zOffset: 6,
      speed: 'medium' },
  ],
};
