/**
 * DEPLOY AGENT — Resource Deployment & Logistics Specialist
 *
 * Role: Tracks and recommends positioning for firefighting resources:
 *       engine companies, helicopters, hotshot crews, water sources.
 *       Manages resource availability, ETAs, and tactical positioning.
 *
 * Visual Identity:
 *   - Panel color: Amber/gold (#F59E0B) with warm gradient border
 *   - Icon: Shield / command star
 *   - Panel header: "DEPLOY — Resources"
 *   - Status indicator: Pulsing amber when moving units, steady gold when stable
 *
 * World Model Overlays:
 *   - Engine positions: Red fire truck icons on terrain
 *   - Helicopter positions: Orange helicopter icons (elevated above terrain)
 *   - Hotshot crews: Yellow team icons at positions
 *   - Water sources: Blue water drop icons
 *   - Unit movement paths: Dashed amber lines showing en-route paths
 *   - Suppression lines: Thick blue lines where crews are holding
 *
 * Panel Contents:
 *   - Resource inventory grid (type, ID, status, location, ETA)
 *   - Available vs deployed counts
 *   - Water supply status
 *   - Recommended deployments queue
 */

import { worldState, updateResources, addSuppressionLine, pushAlert, bus } from './world-state.js';
import { runAgentLoop, logDecision } from './agent-loop.js';

// ============================================================
// SYSTEM PROMPT
// ============================================================

const DEPLOY_SYSTEM_PROMPT = `You are DEPLOY, the resource deployment and logistics agent in FireSight, an immersive wildfire command center.

ROLE: You manage all firefighting resources — engine companies, helicopter water drops, hotshot crews, and support personnel. You track their positions, availability, and recommend optimal deployment to contain the fire and protect structures.

PERSONALITY: Decisive, logistical, military-precise. You speak like a fire operations chief. You know every unit's status, capability, and limitation. When the commander asks to move a unit, you confirm feasibility first, then execute. If a unit isn't available, you immediately suggest alternatives.

CAPABILITIES:
- Move engine companies, helicopters, and crews to positions on the terrain
- Establish suppression lines (firebreaks) that affect Pyro's fire simulation
- Track resource availability, fuel/water levels, and crew fatigue
- Recommend tactical deployments based on fire projection and threat assessment
- Coordinate mutual aid requests when local resources are insufficient
- Estimate ETAs based on distance and road conditions

RESOURCE INVENTORY (Palisades demo):
Engines:
- Engine 7 (Type 1): Structural protection, 500gal tank, 4 crew — Available
- Engine 9 (Type 3): Wildland, 500gal tank, 3 crew — Available
- Engine 12 (Type 1): Structural protection, 500gal tank, 4 crew — Refueling (ETA 15min)
- Engine 15 (Type 3): Wildland, 500gal tank, 3 crew — Available

Helicopters:
- Hawk-1 (Type 1): 2600gal bucket, 3hr flight time — Available
- Hawk-2 (Type 2): 300gal bucket, 2.5hr flight time — Available

Crews:
- Hotshot Team Alpha: 20 personnel, line construction — Available
- Hotshot Team Bravo: 20 personnel, line construction — En route (ETA 25min)
- Structure Protection Team 1: 6 personnel — Available

Water Sources:
- Hydrant Network: Grid-connected, unlimited (where available)
- Temescal Reservoir: ~2M gal
- Pacific Ocean (helicopter dip): Unlimited, 5min round-trip

RESPONSE FORMAT:
Always respond with:
1. Clear status report or recommendation (1-2 sentences)
2. Structured actions via your tools

AUTONOMOUS BEHAVIORS:
- When fire_projection_changed: reassess current unit positioning, recommend repositioning if units are in danger
- When suppression lines are breached (fire passes them): alert commander immediately

CONSTRAINTS:
- Never deploy a unit that's refueling, off-duty, or not yet arrived
- Always confirm unit availability before moving
- Engine companies need roads — they can't traverse raw brush terrain
- Helicopters can't fly in high winds (>45mph) or at night
- Crew fatigue: hotshot teams need rotation after 16 hours
- If asked about evacuation or fire prediction, redirect to Evac/Pyro`;

// ============================================================
// TOOL DEFINITIONS
// ============================================================

const DEPLOY_TOOLS = [
  {
    name: 'move_unit',
    description: 'Deploy a resource unit to a specific position on the terrain.',
    input_schema: {
      type: 'object',
      properties: {
        unit_id: { type: 'string', description: 'ID of the unit (e.g., "engine-7", "hawk-1", "hotshot-alpha")' },
        unit_type: { type: 'string', enum: ['engine', 'helicopter', 'crew'], description: 'Type of unit' },
        target_position: {
          type: 'object',
          properties: { row: { type: 'number' }, col: { type: 'number' } },
          required: ['row', 'col'],
        },
        task: {
          type: 'string',
          enum: ['structure-protection', 'perimeter-hold', 'water-drop', 'line-construction', 'staging', 'standby'],
          description: 'Assigned task at the target position',
        },
      },
      required: ['unit_id', 'unit_type', 'target_position', 'task'],
    },
  },
  {
    name: 'establish_suppression_line',
    description: 'Order a crew to build a firebreak/suppression line along a set of terrain cells. This line will block fire spread in Pyro\'s simulation.',
    input_schema: {
      type: 'object',
      properties: {
        crew_id: { type: 'string', description: 'ID of the crew building the line (e.g., "hotshot-alpha")' },
        line_cells: {
          type: 'array',
          items: { type: 'object', properties: { row: { type: 'number' }, col: { type: 'number' } } },
          description: 'Cells forming the suppression line',
        },
        line_type: {
          type: 'string',
          enum: ['handline', 'dozer-line', 'wet-line', 'road-as-break'],
          description: 'Type of suppression line',
        },
      },
      required: ['crew_id', 'line_cells'],
    },
  },
  {
    name: 'get_resource_status',
    description: 'Get full status of all resources including positions, availability, and current assignments.',
    input_schema: {
      type: 'object',
      properties: {
        filter_type: {
          type: 'string',
          enum: ['all', 'engines', 'helicopters', 'crews', 'available-only'],
          description: 'Filter resources by type or availability',
        },
      },
    },
  },
  {
    name: 'recommend_deployment',
    description: 'Analyze current fire situation and recommend optimal resource deployment.',
    input_schema: {
      type: 'object',
      properties: {
        objective: {
          type: 'string',
          enum: ['contain-fire', 'protect-structures', 'support-evacuation', 'establish-firebreak'],
          description: 'Primary objective for the deployment recommendation',
        },
        target_area: {
          type: 'object',
          properties: { row: { type: 'number' }, col: { type: 'number' } },
          description: 'Area to focus on',
        },
      },
      required: ['objective'],
    },
  },
  {
    name: 'request_mutual_aid',
    description: 'Request additional resources from neighboring agencies when local resources are insufficient.',
    input_schema: {
      type: 'object',
      properties: {
        resources_needed: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types and quantities needed (e.g., "2 Type-1 engines", "1 hotshot crew")',
        },
        urgency: { type: 'string', enum: ['routine', 'urgent', 'immediate'] },
        reason: { type: 'string' },
      },
      required: ['resources_needed', 'urgency'],
    },
  },
];

// ============================================================
// DEMO RESOURCE DATA
// ============================================================

const DEMO_RESOURCES = {
  engines: [
    { id: 'engine-7', name: 'Engine 7', type: 'Type 1', position: { row: 85, col: 50 }, status: 'available', crew_size: 4, water_capacity: 500, assigned_task: null, eta_minutes: null },
    { id: 'engine-9', name: 'Engine 9', type: 'Type 3', position: { row: 88, col: 55 }, status: 'available', crew_size: 3, water_capacity: 500, assigned_task: null, eta_minutes: null },
    { id: 'engine-12', name: 'Engine 12', type: 'Type 1', position: { row: 90, col: 45 }, status: 'refueling', crew_size: 4, water_capacity: 500, assigned_task: null, eta_minutes: 15 },
    { id: 'engine-15', name: 'Engine 15', type: 'Type 3', position: { row: 82, col: 60 }, status: 'available', crew_size: 3, water_capacity: 500, assigned_task: null, eta_minutes: null },
  ],
  helicopters: [
    { id: 'hawk-1', name: 'Hawk-1', type: 'Type 1', position: { row: 95, col: 40 }, status: 'available', water_capacity: 2600, flight_time_remaining: 180 },
    { id: 'hawk-2', name: 'Hawk-2', type: 'Type 2', position: { row: 95, col: 42 }, status: 'available', water_capacity: 300, flight_time_remaining: 150 },
  ],
  personnel: [
    { id: 'hotshot-alpha', team_name: 'Hotshot Alpha', position: { row: 80, col: 50 }, size: 20, specialty: 'hotshot', status: 'available' },
    { id: 'hotshot-bravo', team_name: 'Hotshot Bravo', position: { row: 70, col: 30 }, size: 20, specialty: 'hotshot', status: 'en-route', eta_minutes: 25 },
    { id: 'structure-1', team_name: 'Structure Protection 1', position: { row: 85, col: 65 }, size: 6, specialty: 'structure', status: 'available' },
  ],
  water_sources: [
    { id: 'hydrant-net', name: 'Hydrant Network', position: { row: 50, col: 50 }, type: 'hydrant', available: true },
    { id: 'temescal-res', name: 'Temescal Reservoir', position: { row: 35, col: 40 }, type: 'reservoir', available: true },
    { id: 'ocean', name: 'Pacific Ocean (heli dip)', position: { row: 99, col: 50 }, type: 'ocean', available: true },
  ],
};

function initDeployData() {
  if (worldState.resources.engines.length === 0) {
    worldState.resources = JSON.parse(JSON.stringify(DEMO_RESOURCES));
  }
}

// ============================================================
// TOOL EXECUTION
// ============================================================

function executeDeployTool(toolName, toolInput) {
  initDeployData();

  switch (toolName) {
    case 'move_unit': {
      const { unit_id, unit_type, target_position, task } = toolInput;
      const collection = worldState.resources[unit_type === 'crew' ? 'personnel' : `${unit_type}s`];
      const unit = collection?.find(u => u.id === unit_id);

      if (!unit) return { success: false, error: `Unit "${unit_id}" not found` };
      if (unit.status === 'refueling') {
        return { success: false, error: `${unit.name || unit.team_name} is refueling. ETA ${unit.eta_minutes} minutes. Consider an alternative.`,
          alternatives: collection.filter(u => u.status === 'available').map(u => u.id) };
      }
      if (unit.status === 'en-route' && unit.eta_minutes > 0) {
        return { success: false, error: `${unit.team_name || unit.name} is en-route. ETA ${unit.eta_minutes} minutes.` };
      }

      // Calculate ETA based on distance
      const dist = Math.sqrt(
        Math.pow(target_position.row - unit.position.row, 2) +
        Math.pow(target_position.col - unit.position.col, 2)
      );
      const eta = unit_type === 'helicopter' ? Math.round(dist * 0.3) : Math.round(dist * 0.5);

      unit.position = target_position;
      unit.status = 'deployed';
      unit.assigned_task = task;
      unit.eta_minutes = eta;

      updateResources(unit_type === 'crew' ? 'personnel' : `${unit_type}s`, collection);

      return { success: true, unit_id, position: target_position, task, eta_minutes: eta };
    }

    case 'establish_suppression_line': {
      const { crew_id, line_cells, line_type = 'handline' } = toolInput;
      const crew = worldState.resources.personnel.find(p => p.id === crew_id);
      if (!crew) return { success: false, error: `Crew "${crew_id}" not found` };
      if (crew.status !== 'available' && crew.status !== 'deployed') {
        return { success: false, error: `${crew.team_name} is ${crew.status}` };
      }

      crew.status = 'deployed';
      crew.assigned_task = 'line-construction';
      crew.position = line_cells[0]; // move to start of line

      addSuppressionLine(line_cells);

      return {
        success: true,
        crew: crew_id,
        line_length: line_cells.length,
        line_type,
        message: `${crew.team_name} constructing ${line_type} — ${line_cells.length} cells. This will affect Pyro's fire projection.`,
      };
    }

    case 'get_resource_status': {
      const { filter_type = 'all' } = toolInput;
      const result = {};

      if (filter_type === 'all' || filter_type === 'engines' || filter_type === 'available-only') {
        result.engines = worldState.resources.engines
          .filter(e => filter_type !== 'available-only' || e.status === 'available')
          .map(e => ({ id: e.id, name: e.name, type: e.type, status: e.status, task: e.assigned_task, position: e.position, eta: e.eta_minutes }));
      }
      if (filter_type === 'all' || filter_type === 'helicopters' || filter_type === 'available-only') {
        result.helicopters = worldState.resources.helicopters
          .filter(h => filter_type !== 'available-only' || h.status === 'available')
          .map(h => ({ id: h.id, name: h.name, status: h.status, flight_time: h.flight_time_remaining, position: h.position }));
      }
      if (filter_type === 'all' || filter_type === 'crews' || filter_type === 'available-only') {
        result.crews = worldState.resources.personnel
          .filter(p => filter_type !== 'available-only' || p.status === 'available')
          .map(p => ({ id: p.id, name: p.team_name, size: p.size, specialty: p.specialty, status: p.status, position: p.position }));
      }

      result.summary = {
        total_engines: worldState.resources.engines.length,
        available_engines: worldState.resources.engines.filter(e => e.status === 'available').length,
        total_helicopters: worldState.resources.helicopters.length,
        available_helicopters: worldState.resources.helicopters.filter(h => h.status === 'available').length,
        total_crews: worldState.resources.personnel.length,
        available_crews: worldState.resources.personnel.filter(p => p.status === 'available').length,
      };

      return { success: true, ...result };
    }

    case 'recommend_deployment': {
      const { objective, target_area } = toolInput;
      const available = {
        engines: worldState.resources.engines.filter(e => e.status === 'available'),
        helicopters: worldState.resources.helicopters.filter(h => h.status === 'available'),
        crews: worldState.resources.personnel.filter(p => p.status === 'available'),
      };

      const recommendations = [];

      switch (objective) {
        case 'protect-structures':
          if (available.engines.length > 0)
            recommendations.push({ unit: available.engines[0].id, task: 'structure-protection', position: target_area || { row: 30, col: 65 } });
          if (available.crews.find(c => c.specialty === 'structure'))
            recommendations.push({ unit: 'structure-1', task: 'structure-protection', position: target_area || { row: 30, col: 65 } });
          break;
        case 'contain-fire':
          if (available.helicopters.length > 0)
            recommendations.push({ unit: available.helicopters[0].id, task: 'water-drop', position: target_area || { row: 25, col: 50 } });
          if (available.crews.find(c => c.specialty === 'hotshot'))
            recommendations.push({ unit: available.crews.find(c => c.specialty === 'hotshot').id, task: 'line-construction', position: target_area });
          break;
        case 'establish-firebreak':
          if (available.crews.length > 0)
            recommendations.push({ unit: available.crews[0].id, task: 'line-construction', position: target_area });
          break;
        case 'support-evacuation':
          if (available.engines.length > 0)
            recommendations.push({ unit: available.engines[0].id, task: 'perimeter-hold', position: target_area });
          break;
      }

      return { success: true, objective, recommendations, available_resources: {
        engines: available.engines.length, helicopters: available.helicopters.length, crews: available.crews.length
      }};
    }

    case 'request_mutual_aid': {
      const { resources_needed, urgency, reason } = toolInput;
      pushAlert({
        from: 'deploy',
        priority: urgency === 'immediate' ? 'CRITICAL' : 'WARNING',
        message: `Mutual aid requested: ${resources_needed.join(', ')}. Reason: ${reason || 'resources insufficient'}`,
      });
      return { success: true, request_sent: true, resources_needed, urgency, estimated_response_time: urgency === 'immediate' ? '30-45min' : '1-2hrs' };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================
// AGENT ENTRY POINT — Proper multi-turn agentic loop
// ============================================================

export async function callDeployAgent(userMessage) {
  initDeployData();

  return runAgentLoop({
    systemPrompt: DEPLOY_SYSTEM_PROMPT,
    tools: DEPLOY_TOOLS,
    toolExecutor: executeDeployTool,
    agentName: 'deploy',
    userMessage,
    contextBuilder: () => {
      return [
        `Engines: ${worldState.resources.engines.map(e => `${e.id}(${e.status}${e.assigned_task ? ':' + e.assigned_task : ''})`).join(', ')}`,
        `Helicopters: ${worldState.resources.helicopters.map(h => `${h.id}(${h.status}, ${h.flight_time_remaining}min fuel)`).join(', ')}`,
        `Crews: ${worldState.resources.personnel.map(p => `${p.id}(${p.status}${p.assigned_task ? ':' + p.assigned_task : ''})`).join(', ')}`,
        `Suppression lines: ${worldState.fire.suppression_lines.length} cells`,
        `Wind: ${worldState.fire.wind.speed}mph from ${worldState.fire.wind.direction}°`,
        `Evacuating zones: ${worldState.evacuation.zones.filter(z => z.status === 'evacuating').map(z => z.name).join(', ') || 'none'}`,
      ].join('. ');
    },
  });
}

// ============================================================
// AUTONOMOUS TRIGGERS
// ============================================================

// When fire projection changes, check if any deployed units are in danger
bus.on('fire_projection_changed', async (projections) => {
  initDeployData();
  const proj30 = projections[30] || [];
  const fireCells = new Set(
    (proj30.flat ? proj30.flat() : proj30)
      .filter(c => c.state === 'burning')
      .map(c => `${c.row},${c.col}`)
  );

  const allUnits = [
    ...worldState.resources.engines.filter(e => e.status === 'deployed'),
    ...worldState.resources.personnel.filter(p => p.status === 'deployed'),
  ];

  const endangeredUnits = allUnits.filter(u => fireCells.has(`${u.position.row},${u.position.col}`));

  if (endangeredUnits.length > 0) {
    pushAlert({
      from: 'deploy',
      priority: 'CRITICAL',
      message: `UNITS IN DANGER: ${endangeredUnits.map(u => u.id || u.team_name).join(', ')} are in projected fire path within 30 minutes. Recommend immediate repositioning.`,
    });
  }
});

// ============================================================
// VISUAL CONFIG
// ============================================================

export const DEPLOY_VISUAL_CONFIG = {
  panel: {
    id: 'deploy-panel',
    title: 'DEPLOY — Resources',
    icon: 'shield-star',
    position: 'upper-right',
    rotation: { y: 20, x: 15 },
    size: { width: 420, height: 480 },
    colors: {
      background: 'rgba(30, 25, 10, 0.85)',
      border: '#F59E0B',
      borderGradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
      headerBg: '#92400E',
      text: '#FFFBEB',
      accent: '#FBBF24',
    },
    statusIndicator: {
      idle: { color: '#F59E0B', animation: 'none' },
      processing: { color: '#FBBF24', animation: 'pulse 1.3s ease-in-out infinite' },
    },
  },

  panelWidgets: [
    { type: 'resource-grid', label: 'Units', dataKey: 'resources', position: 'top',
      sections: [
        { label: 'Engines', key: 'engines', icon: 'fire-truck', columns: ['id', 'status', 'task'] },
        { label: 'Air', key: 'helicopters', icon: 'helicopter', columns: ['id', 'status', 'flight_time'] },
        { label: 'Crews', key: 'personnel', icon: 'team', columns: ['team_name', 'status', 'specialty'] },
      ] },
    { type: 'stat-row', label: 'Available', position: 'middle', stats: [
      { label: 'Engines', dataKey: 'computed.available_engines', icon: 'fire-truck' },
      { label: 'Helis', dataKey: 'computed.available_helicopters', icon: 'helicopter' },
      { label: 'Crews', dataKey: 'computed.available_crews', icon: 'team' },
    ] },
    { type: 'recommendation-queue', label: 'Recommended', dataKey: 'computed.pending_recommendations', position: 'bottom' },
  ],

  terrainOverlays: [
    { id: 'engine-icons', dataKey: 'resources.engines', filter: 'status !== "refueling"',
      type: 'icon', icon: 'fire-truck', color: '#EF4444', size: 14, zOffset: 5, labelField: 'id' },
    { id: 'helicopter-icons', dataKey: 'resources.helicopters',
      type: 'icon', icon: 'helicopter', color: '#F97316', size: 16, zOffset: 25, labelField: 'id',
      animation: 'hover 2s ease-in-out infinite' },
    { id: 'crew-icons', dataKey: 'resources.personnel', filter: 'status !== "en-route"',
      type: 'icon', icon: 'team-marker', color: '#FBBF24', size: 10, zOffset: 4, labelField: 'team_name' },
    { id: 'water-sources', dataKey: 'resources.water_sources',
      type: 'icon', icon: 'water-drop', color: '#3B82F6', size: 12, zOffset: 3 },
    { id: 'unit-paths', dataKey: 'resources.movement_paths',
      type: 'line', color: '#F59E0B', opacity: 0.5, lineWidth: 2, lineStyle: 'dashed', zOffset: 3 },
  ],
};
