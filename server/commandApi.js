// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMAND API — receives strategy commands from OpenClaw (Telegram) or any client
//
// Mount in server/index.js:
//   import { mountCommandApi } from './commandApi.js';
//   mountCommandApi(app, getEngine);
//
// getEngine() should return the shared ICSEngine instance (or its state).
// For now, we store state locally and broadcast via SSE so the frontend can pick it up.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { DEFAULT_STRATEGY, PHONE_COMMANDS } from '../firesight/src/strategyBehaviors.js';

// ── Shared strategy state ────────────────────────────────────────────────────
// This is the single source of truth for the current strategy.
// The frontend polls or subscribes via SSE to stay in sync.
let currentStrategy = { ...DEFAULT_STRATEGY };
let commandLog = [];       // last 100 commands
let sseClients = [];       // connected SSE clients

// Commands that require explicit confirmation before execution
const CONFIRM_REQUIRED = new Set([
  'fire backfire',
  'evac order',
  'evac rescue',
  'safety stop all',
]);

// ── SSE broadcast ────────────────────────────────────────────────────────────
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(msg); return true; } catch { return false; }
  });
}

// ── Parse a command string into strategy state changes ───────────────────────
function parseCommand(raw) {
  const cmd = raw.trim().toLowerCase();

  // Exact match first
  if (PHONE_COMMANDS[cmd] && typeof PHONE_COMMANDS[cmd] !== 'function') {
    return { match: cmd, changes: PHONE_COMMANDS[cmd], args: null };
  }

  // Commands with arguments (zone, division, hours, location)
  // Try prefix match
  const prefixes = Object.keys(PHONE_COMMANDS).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (cmd.startsWith(prefix + ' ') || cmd === prefix) {
      const arg = cmd.slice(prefix.length).trim() || null;
      const handler = PHONE_COMMANDS[prefix];
      if (typeof handler === 'function') {
        return { match: prefix, changes: handler(arg), args: arg };
      }
      return { match: prefix, changes: handler, args: arg };
    }
  }

  // Fuzzy match — find closest command
  const candidates = Object.keys(PHONE_COMMANDS);
  const scored = candidates.map(c => ({
    cmd: c,
    score: fuzzyScore(cmd, c),
  })).filter(x => x.score > 0.3).sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return { match: null, suggestions: scored.slice(0, 3).map(s => s.cmd), error: 'no_exact_match' };
  }

  return { match: null, error: 'unknown_command' };
}

// Simple fuzzy scoring — word overlap
function fuzzyScore(input, candidate) {
  const iWords = new Set(input.split(/\s+/));
  const cWords = candidate.split(/\s+/);
  let hits = 0;
  for (const w of cWords) {
    if (iWords.has(w)) hits++;
    // Partial match
    for (const iw of iWords) {
      if (iw.length > 2 && w.startsWith(iw)) hits += 0.5;
      if (iw.length > 2 && w.includes(iw)) hits += 0.3;
    }
  }
  return hits / Math.max(cWords.length, iWords.size);
}

// ── Apply strategy changes ───────────────────────────────────────────────────
function applyChanges(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'evacZones' || key === 'structZones' || key === 'crewExtensions' || key === 'stagedResources') {
      // Merge objects instead of replacing
      currentStrategy[key] = { ...currentStrategy[key], ...value };
    } else if (key === 'contraflowRoads' || key === 'mutualAidTypes') {
      // Merge arrays
      currentStrategy[key] = [...new Set([...currentStrategy[key], ...value])];
    } else {
      currentStrategy[key] = value;
    }
  }
}

// ── Mount routes ─────────────────────────────────────────────────────────────
export function mountCommandApi(app, getEngineState) {

  // SSE endpoint — frontend subscribes for real-time strategy updates
  app.get('/api/strategy/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'init', strategy: currentStrategy })}\n\n`);
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
  });

  // Get current strategy state
  app.get('/api/strategy', (req, res) => {
    res.json({ strategy: currentStrategy });
  });

  // ── Main command endpoint — OpenClaw posts here ────────────────────────────
  app.post('/api/command', (req, res) => {
    const { command, source, commander, confirmed, timestamp } = req.body;
    if (!command) return res.status(400).json({ status: 'error', message: 'command required' });

    const parsed = parseCommand(command);

    // Unknown command
    if (parsed.error === 'unknown_command') {
      return res.json({
        status: 'error',
        message: `Unknown command: "${command}". No close matches found.`,
        availableCategories: [
          'strategy [offensive|defensive|confine|transition]',
          'attack [direct|parallel|indirect]',
          'fire [burnout|backfire|cancel]',
          'struct [triage|protect|abandon|bump-and-run]',
          'evac [advisory|warning|order|rescue|lift] [zone]',
          'air [priority head|priority structures|priority flanks|hold|medevac]',
          'drone [recon|safety]',
          'crew [rotate|extend] [resource]',
          'safety [stop all|stop [div]|resume]',
          'lces check',
          'iap approve',
          'night ops [approve|cancel]',
          'mutual aid',
        ],
      });
    }

    // Fuzzy match — suggest closest commands
    if (parsed.error === 'no_exact_match') {
      return res.json({
        status: 'clarify',
        message: `Did you mean one of these?`,
        suggestions: parsed.suggestions,
        original: command,
      });
    }

    // Safety-critical — require confirmation
    const needsConfirm = [...CONFIRM_REQUIRED].some(prefix => parsed.match.startsWith(prefix));
    if (needsConfirm && !confirmed) {
      return res.json({
        status: 'confirm_required',
        command: parsed.match + (parsed.args ? ' ' + parsed.args : ''),
        message: `This is a safety-critical command. Please confirm.`,
        warning: getConfirmWarning(parsed.match),
      });
    }

    // Execute command
    applyChanges(parsed.changes);

    const logEntry = {
      command: parsed.match + (parsed.args ? ' ' + parsed.args : ''),
      source: source || 'api',
      commander: commander || 'unknown',
      timestamp: timestamp || new Date().toISOString(),
      confirmed: !!confirmed,
    };
    commandLog.push(logEntry);
    if (commandLog.length > 100) commandLog.shift();

    // Broadcast to all connected frontends
    broadcast('command', {
      ...logEntry,
      strategy: currentStrategy,
    });

    console.log(`[CMD] ${logEntry.source}: ${logEntry.command}${confirmed ? ' (CONFIRMED)' : ''}`);

    res.json({
      status: 'ok',
      command: logEntry.command,
      strategy: currentStrategy,
      message: getCommandAck(parsed.match, parsed.args),
    });
  });

  // ── Status endpoint — OpenClaw reads this ──────────────────────────────────
  app.get('/api/status', (req, res) => {
    const engine = getEngineState?.() || {};
    res.json({
      fire: {
        acres: engine.fireArea || 0,
        containment: engine.fireContainment || 0,
        ros: engine.fireRos || 0,
        windDir: engine.windDir || 225,
        windSpeed: engine.windSpeed || 18,
        windShifted: engine.windShifted || false,
        threatenedStructures: engine.threatenedStructures || 0,
        spotFires: engine.spotFires || 0,
      },
      phase: engine.icsPhase || 'standby',
      activeAgents: engine.activeAgentCount || 0,
      totalAgents: 45,
      simTime: engine.simTime || 0,
      strategy: currentStrategy,
    });
  });

  app.get('/api/status/:agentId', (req, res) => {
    const engine = getEngineState?.() || {};
    const agentId = req.params.agentId;
    const agentState = engine.agents?.[agentId];
    if (!agentState) return res.status(404).json({ error: `Agent "${agentId}" not found` });
    res.json({
      id: agentId,
      active: agentState.active,
      state: agentState.state,
      inboxCount: agentState.inbox?.length || 0,
      lastMessage: agentState.inbox?.[agentState.inbox.length - 1] || null,
    });
  });

  app.get('/api/predict/:minutes', (req, res) => {
    const engine = getEngineState?.() || {};
    const minutes = parseInt(req.params.minutes) || 30;
    // Simple linear projection from current ROS
    const currentAcres = engine.fireArea || 0;
    const ros = engine.fireRos || 0; // chains per hour
    const projectedGrowth = (ros * 0.0247105) * (minutes / 60); // chains/hr → acres/hr (rough)
    res.json({
      currentAcres,
      predictedAcres: Math.round(currentAcres + projectedGrowth),
      minutes,
      ros,
      confidence: minutes <= 15 ? 'high' : minutes <= 60 ? 'medium' : 'low',
      windShiftExpected: engine.windShiftEta || null,
    });
  });

  app.get('/api/evac-status', (req, res) => {
    res.json({
      zones: currentStrategy.evacZones,
      contraflowRoads: currentStrategy.contraflowRoads,
    });
  });

  app.get('/api/wind', (req, res) => {
    const engine = getEngineState?.() || {};
    res.json({
      direction: engine.windDir || 225,
      speed: engine.windSpeed || 18,
      gustSpeed: engine.gustSpeed || 28,
      windShifted: engine.windShifted || false,
      windShiftDir: 315,
      windShiftSpeed: 22,
    });
  });

  app.get('/api/crews', (req, res) => {
    const engine = getEngineState?.() || {};
    const crewIds = ['engines', 'hotshots', 'hand_crew', 'dozer', 'heli', 'vlat', 'seat', 'struct_eng'];
    const crews = {};
    for (const id of crewIds) {
      const a = engine.agents?.[id];
      crews[id] = {
        active: a?.active || false,
        hoursWorked: a?.state?.workHours || 0,
        fatigueLevel: getFatigueLevel(a?.state?.workHours || 0),
        assignment: a?.state?.assignment || 'unassigned',
        enRoute: a?.state?.enRoute || false,
        eta: a?.state?.eta || null,
        extension: currentStrategy.crewExtensions?.[id] || null,
      };
    }
    res.json({ crews });
  });

  // Command log
  app.get('/api/commands', (req, res) => {
    res.json({ commands: commandLog.slice(-50) });
  });

  // Reset strategy to defaults
  app.post('/api/strategy/reset', (req, res) => {
    currentStrategy = { ...DEFAULT_STRATEGY };
    broadcast('reset', { strategy: currentStrategy });
    res.json({ status: 'ok', strategy: currentStrategy });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFatigueLevel(hours) {
  if (hours >= 16) return 'CRITICAL — MANDATORY REST';
  if (hours >= 14) return 'HIGH — rotation needed';
  if (hours >= 10) return 'MODERATE';
  return 'GOOD';
}

function getConfirmWarning(command) {
  if (command.startsWith('fire backfire')) return 'Backfire operations intentionally increase fire size. Requires IC written approval. If wind shifts during firing, consequences are severe.';
  if (command.startsWith('evac order')) return 'Mandatory evacuation displaces all residents. Law enforcement will enforce. Traffic impacts are massive.';
  if (command.startsWith('evac rescue')) return 'Rescue mode means orderly evacuation has failed. Only rescue teams enter. Remaining residents shelter in place.';
  if (command.startsWith('safety stop all')) return 'Full safety stop halts ALL operations. Every crew ceases work and moves to safety zones. Use only for imminent danger.';
  return 'This is a safety-critical command. Please confirm you want to proceed.';
}

function getCommandAck(command, args) {
  const zone = args || '';
  const acks = {
    'strategy offensive': 'Strategy set to OFFENSIVE. All resources attack the fire.',
    'strategy defensive': 'Strategy set to DEFENSIVE. Hold lines, protect structures.',
    'strategy confine': 'Strategy set to CONFINE. Fire burns to containment box.',
    'strategy transition': 'Strategy set to TRANSITION. All crews repositioning safely.',
    'attack direct': 'Attack mode: DIRECT. Crews at fire edge.',
    'attack parallel': 'Attack mode: PARALLEL. Line 30-100ft from fire, burnout between.',
    'attack indirect': 'Attack mode: INDIRECT. Line at natural barriers, backfire to meet main fire.',
    'fire burnout': `Burnout AUTHORIZED for ${zone || 'designated division'}.`,
    'fire backfire': `Backfire AUTHORIZED at ${zone || 'designated location'}. IC approval recorded.`,
    'fire cancel': 'All firing operations CANCELLED.',
    'struct triage': `Structure triage ordered for ${zone || 'all zones'}.`,
    'struct protect': `Structure protection activated for ${zone || 'all defensible structures'}.`,
    'struct abandon': `Zone ${zone || 'designated'} ABANDONED. All resources withdrawing.`,
    'struct bump-and-run': 'Bump-and-run activated. Engines rapid-prepping structures.',
    'evac advisory': `Evacuation ADVISORY issued for Zone ${zone}.`,
    'evac warning': `Evacuation WARNING issued for Zone ${zone}. Vulnerable populations leaving.`,
    'evac order': `MANDATORY evacuation ordered for Zone ${zone}. LE going door-to-door.`,
    'evac rescue': `Zone ${zone} in RESCUE mode. Shelter in place for remaining residents.`,
    'evac lift': `Evacuation LIFTED for Zone ${zone}. Residents may return.`,
    'air priority head': 'Air ops priority: FIRE HEAD. VLAT + heli on the head.',
    'air priority structures': 'Air ops priority: STRUCTURES. Retardant lines around buildings.',
    'air priority flanks': 'Air ops priority: FLANKS. Split force.',
    'air hold': 'All aircraft GROUNDED.',
    'air medevac': 'Helicopter diverted to MEDEVAC.',
    'drone recon': 'Drone fleet: distributed recon grid.',
    'drone safety': 'Drone fleet: crew safety overwatch mode.',
    'crew rotate': `${zone || 'Resource'} ordered to rotate. Replacement requested.`,
    'crew extend': `${zone || 'Resource'} extension AUTHORIZED.`,
    'mutual aid': 'Mutual aid request submitted to IROC.',
    'iap approve': 'Incident Action Plan APPROVED.',
    'night ops approve': 'Night operations AUTHORIZED.',
    'night ops cancel': 'Night operations CANCELLED. All crews to camp at sunset.',
    'safety stop all': 'FULL SAFETY STOP. All crews ceasing operations.',
    'safety stop': `Safety stop for ${zone || 'division'}. LCES recheck required.`,
    'safety resume': 'Safety stop CLEARED. Operations resuming.',
    'lces check': 'LCES check ordered. All crews verifying escape routes.',
  };
  return acks[command] || `Command "${command}" executed.`;
}
