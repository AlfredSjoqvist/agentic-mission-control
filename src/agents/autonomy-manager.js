/**
 * FireSight — Autonomy Manager
 *
 * Solves Problem #3 (Human-at-the-Right-Level).
 *
 * Not all agent actions are equal. The autonomy manager decides:
 *
 *   AUTO      — Agent executes immediately, commander sees in feed
 *   SURFACE   — Agent executes but prominently notifies commander
 *   ESCALATE  — Agent proposes but waits for commander approval
 *
 * The level depends on:
 *   - Action risk (moving civilians > repositioning a drone)
 *   - Confidence score (low confidence → escalate)
 *   - Conflict presence (any conflict → escalate critical ones)
 *   - Commander preference (can override autonomy per agent)
 *   - Historical trust (past overrides reduce future autonomy)
 *
 * This is the RIGHT pattern: humans don't approve everything,
 * but they decide the hard stuff.
 */

import { bus } from './world-state.js';

// ============================================================
// AUTONOMY LEVELS
// ============================================================

export const AUTONOMY_LEVELS = {
  AUTO: {
    id: 'auto',
    label: 'Auto-Execute',
    description: 'Agent executes without waiting. Commander sees result in feed.',
    color: '#22C55E',
    icon: 'play-circle',
  },
  SURFACE: {
    id: 'surface',
    label: 'Execute & Notify',
    description: 'Agent executes but prominently alerts commander.',
    color: '#F59E0B',
    icon: 'bell',
  },
  ESCALATE: {
    id: 'escalate',
    label: 'Await Approval',
    description: 'Agent proposes action and waits for commander decision.',
    color: '#EF4444',
    icon: 'hand-stop',
  },
};

// ============================================================
// ACTION RISK CLASSIFICATION
// ============================================================

const ACTION_RISK = {
  // Pyro actions — informational, low risk
  'run_fire_projection': 'low',
  'assess_structure_threat': 'low',
  'compare_scenarios': 'low',

  // Swarm actions — moderate (costs battery, changes coverage)
  'reposition_drone': 'low',
  'deploy_fleet_formation': 'moderate',
  'identify_coverage_gaps': 'low',
  'route_live_feed': 'low',

  // Evac actions — HIGH (affects civilian lives)
  'calculate_evacuation_route': 'low',
  'set_zone_status': 'high',           // changing zone status triggers real evacuations
  'find_alternate_route': 'moderate',
  'check_shelter_capacity': 'low',
  'push_evacuation_alert': 'high',     // alerts go to civilians

  // Deploy actions — moderate to high (moves real assets)
  'move_unit': 'moderate',
  'establish_suppression_line': 'high', // commits crew for extended period
  'get_resource_status': 'low',
  'recommend_deployment': 'low',
  'request_mutual_aid': 'high',         // requests external resources

  // Inter-agent
  'request_agent_help': 'moderate',

  // Critical alerts
  'push_critical_alert': 'high',
};

// ============================================================
// AUTONOMY DECISION
// ============================================================

const overrideHistory = [];
const commanderPreferences = {
  // Commander can set per-agent autonomy floor
  pyro: 'auto',     // trust Pyro to run projections freely
  swarm: 'auto',    // trust Swarm to reposition drones freely
  evac: 'surface',  // want to know about evacuation changes
  deploy: 'surface', // want to know about resource movements
};

/**
 * Determine the autonomy level for a proposed action.
 *
 * @returns { level, reason, confidence_factor, risk_factor }
 */
export function getAutonomyLevel({
  agent,
  action,
  confidence,     // composite confidence score (0-1)
  hasConflicts,   // whether conflicts were detected
  conflictSeverity, // 'critical' | 'warning' | 'advisory'
  isCascade,      // is this part of an auto-trigger cascade?
  triggerType,     // 'commander' | 'auto-trigger' | 'inter-agent' | 'cascade'
}) {
  const risk = ACTION_RISK[action] || 'moderate';
  const commanderFloor = commanderPreferences[agent] || 'auto';

  // Start with risk-based level
  let level;
  let reasons = [];

  if (risk === 'low') {
    level = 'auto';
    reasons.push('Low-risk action');
  } else if (risk === 'moderate') {
    level = 'surface';
    reasons.push('Moderate-risk action');
  } else {
    level = 'escalate';
    reasons.push('High-risk action');
  }

  // Confidence adjustment
  if (confidence !== undefined) {
    if (confidence < 0.4) {
      level = 'escalate';
      reasons.push(`Low confidence (${Math.round(confidence * 100)}%)`);
    } else if (confidence < 0.6 && level === 'auto') {
      level = 'surface';
      reasons.push(`Moderate confidence (${Math.round(confidence * 100)}%)`);
    }
  }

  // Conflict escalation
  if (hasConflicts) {
    if (conflictSeverity === 'critical') {
      level = 'escalate';
      reasons.push('Critical conflict detected');
    } else if (conflictSeverity === 'warning' && level === 'auto') {
      level = 'surface';
      reasons.push('Warning-level conflict');
    }
  }

  // Cascade actions get more autonomy (they're reactions to approved actions)
  if (isCascade && triggerType === 'auto-trigger' && level === 'escalate' && risk !== 'high') {
    level = 'surface';
    reasons.push('Downgraded — cascade from approved action');
  }

  // Commander preference floor
  const levels = ['auto', 'surface', 'escalate'];
  const floorIndex = levels.indexOf(commanderFloor);
  const currentIndex = levels.indexOf(level);
  if (floorIndex > currentIndex) {
    level = commanderFloor;
    reasons.push(`Commander preference: min ${commanderFloor} for ${agent}`);
  }

  // Historical trust — if commander has overridden this agent recently, increase scrutiny
  const recentOverrides = overrideHistory.filter(
    o => o.agent === agent && Date.now() - o.timestamp < 10 * 60 * 1000
  );
  if (recentOverrides.length >= 2 && level === 'auto') {
    level = 'surface';
    reasons.push(`Trust adjustment: ${recentOverrides.length} recent overrides`);
  }

  const result = {
    level,
    levelConfig: AUTONOMY_LEVELS[level.toUpperCase()],
    reasons,
    risk,
    agent,
    action,
  };

  bus.emit('autonomy_decision', result);
  return result;
}

/**
 * Record a commander override (they changed what the agent was going to do).
 * This feeds back into future autonomy decisions.
 */
export function recordOverride({ agent, action, originalLevel, commanderDecision }) {
  overrideHistory.push({
    agent,
    action,
    originalLevel,
    commanderDecision,
    timestamp: Date.now(),
  });

  bus.emit('commander_override', { agent, action, originalLevel, commanderDecision });
}

/**
 * Commander sets autonomy preference for an agent.
 */
export function setAutonomyPreference(agent, level) {
  commanderPreferences[agent] = level;
  bus.emit('autonomy_preference_changed', { agent, level });
}

/**
 * Get current autonomy state for dashboard display.
 */
export function getAutonomyState() {
  return {
    preferences: { ...commanderPreferences },
    recentOverrides: overrideHistory.slice(-10),
    pendingEscalations: [], // populated by the UI layer
  };
}
