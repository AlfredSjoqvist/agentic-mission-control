/**
 * FireSight — Agentic Tool Use Loop
 *
 * Implements proper multi-turn tool use: LLM calls tools, sees results,
 * reasons about them, optionally calls more tools, then delivers a final
 * spoken response with full awareness of what happened.
 *
 * This is the core differentiator judges will scrutinize —
 * it's the difference between "4 chatbots" and "4 agents."
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus, pushAlert, worldState } from './world-state.js';

const client = new Anthropic();

// Max tool-use turns before forcing a final response
const MAX_TOOL_TURNS = 3;

// ============================================================
// DECISION LOG — Visible reasoning for the commander
// ============================================================

const decisionLog = [];

/**
 * Every agent action is logged with reasoning, visible in the spatial UI.
 * This is what makes the agents transparent, not black boxes.
 */
export function logDecision(entry) {
  const full = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  decisionLog.push(full);
  if (decisionLog.length > 100) decisionLog.shift();
  bus.emit('decision_logged', full);
  return full;
}

export function getDecisionLog() {
  return decisionLog;
}

// ============================================================
// INTER-AGENT MESSAGING — Agents requesting help from each other
// ============================================================

/**
 * When an agent needs another agent to act, it sends a formal request.
 * This is VISIBLE in the UI — the commander sees agents collaborating.
 *
 * Example: Evac detects all routes blocked → sends request to Deploy
 * to establish a firebreak. Deploy responds. Commander sees the exchange.
 */
const pendingRequests = [];

export function sendAgentRequest({ from, to, action, params, reason, priority = 'normal' }) {
  const request = {
    id: `req-${Date.now()}`,
    timestamp: new Date().toISOString(),
    from,
    to,
    action,
    params,
    reason,
    priority,
    status: 'pending',
    response: null,
  };
  pendingRequests.push(request);
  bus.emit('agent_request', request);

  logDecision({
    agent: from,
    type: 'inter-agent-request',
    action: `Requested ${to.toUpperCase()} to ${action}`,
    reason,
    data: { to, action, params },
  });

  return request;
}

export function resolveAgentRequest(requestId, response) {
  const req = pendingRequests.find(r => r.id === requestId);
  if (req) {
    req.status = 'resolved';
    req.response = response;
    bus.emit('agent_request_resolved', req);

    logDecision({
      agent: req.to,
      type: 'inter-agent-response',
      action: `Responded to ${req.from.toUpperCase()}: ${req.action}`,
      reason: response.summary || 'Request fulfilled',
      data: response,
    });
  }
  return req;
}

export function getPendingRequests(agentName) {
  return pendingRequests.filter(r => r.to === agentName && r.status === 'pending');
}

// ============================================================
// CONFLICT DETECTION — When agents have competing needs
// ============================================================

/**
 * Detects when two agents want to use the same resource or area
 * for different purposes. Surfaces the conflict to the commander.
 *
 * Example: Evac needs Topanga Canyon Rd open for evacuation,
 * but Deploy wants to use it as a firebreak.
 */
export function checkConflicts(agentName, action, targetCells) {
  const conflicts = [];
  const targetSet = new Set(targetCells.map(c => `${c.row},${c.col}`));

  // Check if target cells overlap with evacuation routes
  if (agentName !== 'evac') {
    for (const zone of worldState.evacuation.zones) {
      if (zone.status === 'evacuating' || zone.status === 'warning') {
        for (const route of zone.routes) {
          if (route.status === 'clear') {
            const overlap = route.path.filter(p => targetSet.has(`${p.row},${p.col}`));
            if (overlap.length > 0) {
              conflicts.push({
                type: 'route-conflict',
                agents: [agentName, 'evac'],
                description: `${action} would block evacuation route "${route.name}" for ${zone.name} (${zone.population} civilians)`,
                severity: zone.status === 'evacuating' ? 'critical' : 'warning',
                affected_cells: overlap,
              });
            }
          }
        }
      }
    }
  }

  // Check if target cells overlap with deployed units
  if (agentName !== 'deploy') {
    const deployedUnits = [
      ...worldState.resources.engines.filter(e => e.status === 'deployed'),
      ...worldState.resources.personnel.filter(p => p.status === 'deployed'),
    ];
    for (const unit of deployedUnits) {
      if (targetSet.has(`${unit.position.row},${unit.position.col}`)) {
        conflicts.push({
          type: 'unit-conflict',
          agents: [agentName, 'deploy'],
          description: `${action} affects area where ${unit.id || unit.team_name} is deployed`,
          severity: 'warning',
          affected_unit: unit.id || unit.team_name,
        });
      }
    }
  }

  // Check if target cells overlap with drone positions
  if (agentName !== 'swarm') {
    for (const drone of worldState.drones.units) {
      if (drone.status === 'active' && targetSet.has(`${drone.position.row},${drone.position.col}`)) {
        conflicts.push({
          type: 'airspace-conflict',
          agents: [agentName, 'swarm'],
          description: `${action} in airspace used by ${drone.id}`,
          severity: 'info',
        });
      }
    }
  }

  if (conflicts.length > 0) {
    bus.emit('conflict_detected', conflicts);
    for (const conflict of conflicts) {
      if (conflict.severity === 'critical') {
        pushAlert({
          from: 'system',
          priority: 'CRITICAL',
          message: `CONFLICT: ${conflict.description}. Commander decision required.`,
          data: conflict,
        });
      }
    }
  }

  return conflicts;
}

// ============================================================
// CORE AGENTIC LOOP — Multi-turn tool use with reasoning
// ============================================================

/**
 * The proper agentic loop:
 *   1. Send command + context to LLM
 *   2. LLM may return text (speech) and/or tool calls
 *   3. Execute tools, collect results
 *   4. Send results back to LLM
 *   5. LLM reasons about results, may call more tools or give final speech
 *   6. Repeat until LLM gives final text response (stop_reason === 'end_turn')
 *
 * This is what makes it a REAL agent — it sees outcomes and adapts.
 */
export async function runAgentLoop({
  systemPrompt,
  tools,
  toolExecutor,
  agentName,
  userMessage,
  contextBuilder,
}) {
  const context = contextBuilder();
  const messages = [
    { role: 'user', content: `[WORLD STATE] ${context}\n\n[COMMANDER] ${userMessage}` },
  ];

  // Check for pending inter-agent requests
  const pending = getPendingRequests(agentName);
  if (pending.length > 0) {
    const requestSummary = pending.map(r =>
      `[REQUEST FROM ${r.from.toUpperCase()}] Action: ${r.action}. Reason: ${r.reason}. Params: ${JSON.stringify(r.params)}`
    ).join('\n');
    messages[0].content += `\n\n[PENDING REQUESTS FROM OTHER AGENTS]\n${requestSummary}`;
  }

  const result = {
    speech: '',
    actions: [],
    toolResults: [],
    reasoning: [],      // NEW: visible chain of thought
    interAgentRequests: [],
  };

  let turns = 0;

  while (turns < MAX_TOOL_TURNS) {
    turns++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [
        ...tools,
        // Every agent can request help from other agents
        {
          name: 'request_agent_help',
          description: 'Request another agent to take an action. Use this when you need coordination — e.g., Evac requesting Deploy to create a firebreak, or Pyro requesting Swarm to recon an area. The request will be visible to the commander.',
          input_schema: {
            type: 'object',
            properties: {
              target_agent: { type: 'string', enum: ['pyro', 'swarm', 'evac', 'deploy'], description: 'Agent to request help from' },
              action: { type: 'string', description: 'What you need them to do' },
              reason: { type: 'string', description: 'Why you need this — visible to the commander' },
              params: { type: 'object', description: 'Parameters for the request' },
              priority: { type: 'string', enum: ['normal', 'urgent', 'critical'] },
            },
            required: ['target_agent', 'action', 'reason'],
          },
        },
      ],
      messages,
    });

    // Process response blocks
    const toolUseBlocks = [];
    const toolResultMessages = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        result.speech += block.text;
        result.reasoning.push({ turn: turns, type: 'speech', content: block.text });
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    // If no tool calls, we're done — agent gave its final response
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    // Execute each tool call and collect results
    for (const block of toolUseBlocks) {
      let toolResult;

      if (block.name === 'request_agent_help') {
        // Inter-agent request — route it
        const req = sendAgentRequest({
          from: agentName,
          to: block.input.target_agent,
          action: block.input.action,
          params: block.input.params || {},
          reason: block.input.reason,
          priority: block.input.priority || 'normal',
        });
        result.interAgentRequests.push(req);
        toolResult = { success: true, request_id: req.id, status: 'Request sent. Will be handled by the orchestrator.' };
      } else {
        // Check for conflicts before executing
        const targetCells = extractTargetCells(block.input);
        if (targetCells.length > 0) {
          const conflicts = checkConflicts(agentName, block.name, targetCells);
          if (conflicts.some(c => c.severity === 'critical')) {
            toolResult = {
              success: false,
              blocked_by_conflict: true,
              conflicts: conflicts.filter(c => c.severity === 'critical'),
              message: 'Action blocked due to critical conflict. Commander decision required.',
            };
          } else {
            toolResult = toolExecutor(block.name, block.input);
          }
        } else {
          toolResult = toolExecutor(block.name, block.input);
        }
      }

      // Log the decision
      logDecision({
        agent: agentName,
        type: 'tool-call',
        action: block.name,
        input: block.input,
        result: toolResult,
        reason: result.speech, // use the agent's last speech as reasoning context
      });

      result.actions.push({ tool: block.name, input: block.input });
      result.toolResults.push(toolResult);

      toolResultMessages.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(toolResult),
      });
    }

    // Send tool results back to LLM for next turn
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResultMessages });
  }

  // Emit response for UI
  const fullResponse = {
    agent: agentName,
    ...result,
    timestamp: new Date().toISOString(),
  };
  bus.emit('agent_response', fullResponse);

  return result;
}

/**
 * Extract target cells from tool input for conflict checking
 */
function extractTargetCells(input) {
  const cells = [];
  if (input.target_position) cells.push(input.target_position);
  if (input.line_cells) cells.push(...input.line_cells);
  if (input.target_area?.center) cells.push(input.target_area.center);
  return cells;
}

// ============================================================
// VISUAL CONFIG FOR ORCHESTRATION UI
// ============================================================

/**
 * Decision log panel — shows agent reasoning in the spatial UI.
 * Positioned below the main viewport so the commander can glance down
 * to see WHY agents are doing things.
 */
export const ORCHESTRATION_VISUAL_CONFIG = {
  decisionLogPanel: {
    id: 'decision-log',
    title: 'Agent Decisions',
    position: { x: 0, y: 0.15, z: -2.0 },
    rotation: { x: -25, y: 0, z: 0 },
    size: { width: 600, height: 150 },
    maxVisible: 4,
    scrollDirection: 'bottom-to-top',
    entryFormat: {
      // Each entry: [AGENT_COLOR_DOT] AGENT: action — reason
      showTimestamp: false,
      showAgent: true,
      showAction: true,
      showReason: true,
      agentColors: {
        pyro: '#DC2626',
        swarm: '#06B6D4',
        evac: '#22C55E',
        deploy: '#F59E0B',
        system: '#9CA3AF',
      },
    },
    colors: {
      background: 'rgba(10, 10, 20, 0.7)',
      border: 'rgba(255, 255, 255, 0.1)',
      text: 'rgba(255, 255, 255, 0.8)',
    },
  },

  interAgentPanel: {
    id: 'inter-agent-comms',
    title: 'Agent Coordination',
    position: { x: 2.0, y: 0.5, z: -1.5 },
    rotation: { x: 0, y: -30, z: 0 },
    size: { width: 350, height: 200 },
    maxVisible: 3,
    entryFormat: {
      // [FROM] → [TO]: action (reason)
      // Status: pending | resolved
      showArrow: true,    // animated arrow between agent dots
      showStatus: true,
    },
    colors: {
      background: 'rgba(10, 10, 30, 0.8)',
      border: 'rgba(100, 100, 255, 0.2)',
      pendingBg: 'rgba(234, 179, 8, 0.1)',
      resolvedBg: 'rgba(34, 197, 94, 0.1)',
    },
  },

  conflictOverlay: {
    // When conflicts are detected, affected terrain cells get a pulsing outline
    terrainHighlight: {
      color: '#F59E0B',
      opacity: 0.6,
      effect: 'pulse-fast',
      zOffset: 10,
      icon: 'warning-triangle',
    },
    // Conflict banner appears between the two conflicting agent panels
    banner: {
      background: 'rgba(127, 29, 29, 0.9)',
      border: '#EF4444',
      text: '#FEF2F2',
      animation: 'flash 1s ease-in-out 3',  // flash 3 times then steady
    },
  },
};
