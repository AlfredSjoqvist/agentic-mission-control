/**
 * FireSight — Conflict Resolution Engine
 *
 * Solves Problem #2 (Inter-Agent Conflict Detection).
 *
 * When two agents want contradictory things, this engine:
 * 1. Detects the conflict before either action executes
 * 2. Classifies severity (critical / warning / advisory)
 * 3. Proposes resolution strategies
 * 4. Escalates to commander if needed, with clear options
 * 5. Tracks resolution history for learning
 *
 * Examples:
 *   - Deploy sends engine down a road Evac is using → CRITICAL
 *   - Swarm wants to fly over active suppression area → WARNING
 *   - Pyro projects fire into area Deploy is staging equipment → ADVISORY
 */

import { bus, worldState } from './world-state.js';

// ============================================================
// CONFLICT REGISTRY
// ============================================================

const conflictHistory = [];
let conflictCounter = 0;

/**
 * Full conflict detection — checks spatial, temporal, and resource conflicts.
 * Returns an array of conflicts with resolution options.
 */
export function detectConflicts(agentName, action, params) {
  const conflicts = [];

  // 1. Spatial conflicts — same terrain cells, different purposes
  const spatialConflicts = checkSpatialConflicts(agentName, action, params);
  conflicts.push(...spatialConflicts);

  // 2. Resource conflicts — same unit/asset, different tasks
  const resourceConflicts = checkResourceConflicts(agentName, action, params);
  conflicts.push(...resourceConflicts);

  // 3. Temporal conflicts — timing clashes
  const temporalConflicts = checkTemporalConflicts(agentName, action, params);
  conflicts.push(...temporalConflicts);

  // 4. Priority conflicts — contradictory objectives
  const priorityConflicts = checkPriorityConflicts(agentName, action, params);
  conflicts.push(...priorityConflicts);

  // Register and emit
  for (const conflict of conflicts) {
    conflict.id = `CONFLICT-${String(++conflictCounter).padStart(3, '0')}`;
    conflict.timestamp = Date.now();
    conflict.status = 'unresolved';
    conflict.resolution = null;

    conflictHistory.push(conflict);
    bus.emit('conflict_detected', conflict);

    if (conflict.severity === 'critical') {
      bus.emit('commander_escalation', {
        type: 'conflict',
        conflict,
        message: `CONFLICT: ${conflict.description}`,
        options: conflict.resolutionOptions,
      });
    }
  }

  return conflicts;
}

// ── SPATIAL: Two agents acting on overlapping terrain ──
function checkSpatialConflicts(agentName, action, params) {
  const conflicts = [];
  const targetCells = extractCells(params);
  if (targetCells.length === 0) return conflicts;

  const targetSet = new Set(targetCells.map(c => `${c.row},${c.col}`));

  // Check evacuation route overlap
  if (agentName !== 'evac') {
    for (const zone of worldState.evacuation.zones) {
      if (zone.status !== 'evacuating' && zone.status !== 'warning') continue;
      for (const route of zone.routes) {
        if (route.status !== 'clear') continue;
        const overlap = route.path?.filter(p => targetSet.has(`${p.row},${p.col}`)) || [];
        if (overlap.length > 0) {
          conflicts.push({
            type: 'route-blockage',
            severity: zone.status === 'evacuating' ? 'critical' : 'warning',
            agents: [agentName, 'evac'],
            description: `${agentName.toUpperCase()} action "${action}" would block evacuation route "${route.name}" used by ${zone.population} civilians in ${zone.name}`,
            affected_cells: overlap,
            affected_zone: zone.name,
            affected_population: zone.population,
            resolutionOptions: [
              { id: 'block', label: 'Block action — protect evacuation route', recommended: zone.status === 'evacuating' },
              { id: 'reroute', label: `Reroute evacuation via alternate route`, recommended: false },
              { id: 'allow', label: 'Allow action — commander override', recommended: false },
              { id: 'delay', label: `Delay action until evacuation completes (~${zone.deadline_minutes || '?'} min)`, recommended: zone.status === 'warning' },
            ],
          });
        }
      }
    }
  }

  // Check deployed unit overlap
  if (agentName !== 'deploy') {
    const units = [
      ...worldState.resources.engines.filter(e => e.status === 'deployed'),
      ...worldState.resources.personnel.filter(p => p.status === 'deployed'),
    ];
    for (const unit of units) {
      if (unit.position && targetSet.has(`${unit.position.row},${unit.position.col}`)) {
        conflicts.push({
          type: 'unit-endangerment',
          severity: 'warning',
          agents: [agentName, 'deploy'],
          description: `${agentName.toUpperCase()} action "${action}" affects area where ${unit.id || unit.team_name} is deployed`,
          affected_unit: unit.id || unit.team_name,
          resolutionOptions: [
            { id: 'relocate', label: `Relocate ${unit.id || unit.team_name} first`, recommended: true },
            { id: 'allow', label: 'Allow — unit will self-evacuate', recommended: false },
            { id: 'block', label: 'Block action', recommended: false },
          ],
        });
      }
    }
  }

  // Check drone airspace
  if (agentName !== 'swarm') {
    for (const drone of worldState.drones.units) {
      if (drone.status !== 'active') continue;
      if (targetSet.has(`${drone.position.row},${drone.position.col}`)) {
        conflicts.push({
          type: 'airspace-conflict',
          severity: 'advisory',
          agents: [agentName, 'swarm'],
          description: `${agentName.toUpperCase()} action in airspace used by ${drone.id}`,
          affected_drone: drone.id,
          resolutionOptions: [
            { id: 'altitude', label: `Adjust ${drone.id} altitude`, recommended: true },
            { id: 'reroute-drone', label: `Reroute ${drone.id}`, recommended: false },
            { id: 'allow', label: 'Allow — minor conflict', recommended: false },
          ],
        });
      }
    }
  }

  return conflicts;
}

// ── RESOURCE: Same asset claimed by two agents ──
function checkResourceConflicts(agentName, action, params) {
  const conflicts = [];
  const unitId = params.unit_id || params.crew_id || params.drone_id;
  if (!unitId) return conflicts;

  // Check if this unit is already tasked by another agent
  const allUnits = [
    ...worldState.resources.engines,
    ...worldState.resources.helicopters,
    ...worldState.resources.personnel,
    ...worldState.drones.units,
  ];

  const unit = allUnits.find(u => (u.id || u.team_name) === unitId);
  if (unit && unit.status === 'deployed' && unit.assigned_by && unit.assigned_by !== agentName) {
    conflicts.push({
      type: 'resource-contention',
      severity: 'warning',
      agents: [agentName, unit.assigned_by],
      description: `${unitId} is already deployed by ${unit.assigned_by.toUpperCase()} for "${unit.current_task || 'active mission'}"`,
      affected_unit: unitId,
      current_assignment: { agent: unit.assigned_by, task: unit.current_task },
      requested_assignment: { agent: agentName, task: action },
      resolutionOptions: [
        { id: 'queue', label: `Queue — execute after current task`, recommended: true },
        { id: 'preempt', label: `Preempt — override ${unit.assigned_by.toUpperCase()}'s assignment`, recommended: false },
        { id: 'alternate', label: `Use alternate unit`, recommended: false },
      ],
    });
  }

  return conflicts;
}

// ── TEMPORAL: Timing clashes between actions ──
function checkTemporalConflicts(agentName, action, params) {
  const conflicts = [];

  // Check if an evacuation deadline would be violated
  if (agentName === 'deploy' && (action === 'establish_suppression_line' || action === 'move_unit')) {
    for (const zone of worldState.evacuation.zones) {
      if (zone.status !== 'evacuating') continue;
      const eta = params.eta_minutes || 30;
      if (zone.deadline_minutes && eta > zone.deadline_minutes * 0.8) {
        conflicts.push({
          type: 'deadline-risk',
          severity: 'warning',
          agents: [agentName, 'evac'],
          description: `Action ETA (${eta} min) may conflict with ${zone.name} evacuation deadline (${zone.deadline_minutes} min)`,
          deadline: zone.deadline_minutes,
          action_eta: eta,
          resolutionOptions: [
            { id: 'expedite', label: 'Expedite — allocate additional resources', recommended: true },
            { id: 'accept-risk', label: 'Accept timing risk', recommended: false },
            { id: 'defer', label: 'Defer until after evacuation', recommended: false },
          ],
        });
      }
    }
  }

  return conflicts;
}

// ── PRIORITY: Contradictory strategic objectives ──
function checkPriorityConflicts(agentName, action, params) {
  const conflicts = [];

  // Pyro projecting fire into an area Deploy is building suppression
  if (agentName === 'pyro' && action === 'run_fire_projection') {
    const activeSuppressionLines = worldState.fire.suppressionLines || [];
    if (activeSuppressionLines.length > 0) {
      // Not a real conflict — just an advisory that suppression is active
      conflicts.push({
        type: 'projection-with-active-suppression',
        severity: 'advisory',
        agents: ['pyro', 'deploy'],
        description: `Fire projection running while ${activeSuppressionLines.length} suppression line(s) active — ensure model includes firebreaks`,
        resolutionOptions: [
          { id: 'include', label: 'Include suppression lines in projection (default)', recommended: true },
          { id: 'exclude', label: 'Project without suppression lines (worst case)', recommended: false },
        ],
      });
    }
  }

  return conflicts;
}

// ── RESOLUTION ──

/**
 * Resolve a conflict. Called when commander makes a choice
 * or when auto-resolution kicks in.
 */
export function resolveConflict(conflictId, { resolution, resolvedBy }) {
  const conflict = conflictHistory.find(c => c.id === conflictId);
  if (!conflict) return null;

  conflict.status = 'resolved';
  conflict.resolution = {
    chosen: resolution,  // the resolution option ID
    resolvedBy,          // 'commander' | 'auto' | agent name
    timestamp: Date.now(),
  };

  bus.emit('conflict_resolved', conflict);
  return conflict;
}

/**
 * Get unresolved conflicts.
 */
export function getUnresolvedConflicts() {
  return conflictHistory.filter(c => c.status === 'unresolved');
}

/**
 * Get full conflict history for analysis.
 */
export function getConflictHistory() {
  return conflictHistory;
}

/**
 * Get conflict stats for dashboard display.
 */
export function getConflictStats() {
  return {
    total: conflictHistory.length,
    unresolved: conflictHistory.filter(c => c.status === 'unresolved').length,
    critical: conflictHistory.filter(c => c.severity === 'critical').length,
    by_type: conflictHistory.reduce((acc, c) => {
      acc[c.type] = (acc[c.type] || 0) + 1;
      return acc;
    }, {}),
    by_agent_pair: conflictHistory.reduce((acc, c) => {
      const pair = c.agents.sort().join('↔');
      acc[pair] = (acc[pair] || 0) + 1;
      return acc;
    }, {}),
  };
}

// ── HELPERS ──

function extractCells(params) {
  const cells = [];
  if (params.target_position) cells.push(params.target_position);
  if (params.line_cells) cells.push(...params.line_cells);
  if (params.target_area?.center) cells.push(params.target_area.center);
  if (params.cells) cells.push(...params.cells);
  return cells;
}
