// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ICS Engine — 45 Autonomous Agents following real ICS Wildfire Protocol
//
// Extracted from ics-graph standalone app and adapted as a shared module.
// Used by both the map view (TerrainScene) and the ICS graph view (ICSGraph).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── NODE DEFINITIONS — ICS organizational chart ─────────────────────────────
export const NODES = {
  // COMMAND
  ic:       { label:'Incident Commander',           short:'IC',     tier:'command',  color:'#EF4444', size:28, role:'Overall authority. Sets objectives, strategies, priorities. Approves IAP and evacuation orders.' },
  safety:   { label:'Safety Officer',               short:'SAFETY', tier:'command',  color:'#EF4444', size:18, role:'Monitors safety. Authority to STOP any unsafe operation immediately. Checks 10 Orders + 18 Watch Outs.' },
  pio:      { label:'Public Info Officer',           short:'PIO',    tier:'command',  color:'#EF4444', size:16, role:'Media coordination. Community alerts. Single point of contact for press.' },
  liaison:  { label:'Liaison Officer',               short:'LIAS',   tier:'command',  color:'#EF4444', size:16, role:'Multi-agency coordination. Mutual aid agreements.' },
  // GENERAL STAFF
  ops_chief:  { label:'Operations Section Chief',    short:'OPS',    tier:'staff',    color:'#A78BFA', size:24, role:'Manages ALL tactical operations. Develops ops portion of IAP. Most resources work under Ops.' },
  plan_chief: { label:'Planning Section Chief',      short:'PLAN',   tier:'staff',    color:'#A78BFA', size:22, role:'Situation assessment, fire behavior analysis, resource tracking. Runs P-meeting. Drafts IAP.' },
  log_chief:  { label:'Logistics Section Chief',     short:'LOG',    tier:'staff',    color:'#A78BFA', size:20, role:'Facilities, services, supplies. Communications infrastructure, medical, food.' },
  fin_chief:  { label:'Finance/Admin Chief',         short:'FIN',    tier:'staff',    color:'#A78BFA', size:16, role:'Cost tracking, contracts, compensation. Critical for Type 1/2 incidents.' },
  // BRANCHES
  fire_branch:  { label:'Fire Suppression Branch',   short:'FIRE BR', tier:'branch',  color:'#FBBF24', size:18, role:'Directs all ground and air suppression operations under Ops Chief.' },
  air_ops:      { label:'Air Operations Branch',     short:'AIR OPS', tier:'branch',  color:'#FBBF24', size:18, role:'Coordinates all aircraft: tankers, helicopters, lead planes, drones.' },
  div_alpha:    { label:'Division Alpha (Head)',      short:'DIV-A',   tier:'branch',  color:'#FBBF24', size:14, role:'Supervises resources attacking the fire head — most aggressive front.' },
  div_bravo:    { label:'Division Bravo (Flanks)',    short:'DIV-B',   tier:'branch',  color:'#FBBF24', size:14, role:'Fireline construction and holding on flanks.' },
  struct_group: { label:'Structure Protection Group', short:'STRUCT',  tier:'branch',  color:'#FBBF24', size:14, role:'Triage structures. Deploy engines for protection. Bump-and-run.' },
  sit_unit:     { label:'Situation Unit',             short:'SIT',     tier:'branch',  color:'#FBBF24', size:14, role:'Maintains situation display. Maps, projections, forecasts.' },
  fban:         { label:'Fire Behavior Analyst',      short:'FBAN',    tier:'branch',  color:'#FBBF24', size:16, role:'Runs fire spread models. Predicts ROS, flame length, spotting. 30-60 min cycle.' },
  res_unit:     { label:'Resources Unit',             short:'RESU',    tier:'branch',  color:'#FBBF24', size:12, role:'Tracks status and location of all assigned resources.' },
  le_branch:    { label:'Law Enforcement Branch',     short:'LE BR',   tier:'branch',  color:'#FBBF24', size:14, role:'Executes evacuation orders. Door-to-door. Traffic control.' },
  comms:        { label:'Communications Unit',        short:'COMMS',   tier:'branch',  color:'#FBBF24', size:14, role:'P25 radio. Manages frequencies, repeaters, interop gateways.' },
  medical:      { label:'Medical Unit',               short:'MED',     tier:'branch',  color:'#FBBF24', size:12, role:'EMS along fireline and evacuation routes.' },
  // TACTICAL
  engines:      { label:'Type 3 Engines (×3)',        short:'ENG×3',   tier:'tactical', color:'#22D3EE', size:14, role:'3-person crew, 500gal. Direct attack with hose lines. Pump-and-roll.' },
  hotshots:     { label:'Hotshot Crew (IHC)',          short:'IHC',     tier:'tactical', color:'#22D3EE', size:14, role:'20-person elite. Hand line construction, burnout/backfire with drip torches.' },
  hand_crew:    { label:'Type 2 Hand Crew',           short:'T2 HC',   tier:'tactical', color:'#22D3EE', size:12, role:'20-person crew. Manual fireline, mop-up, cold trailing.' },
  dozer:        { label:'Dozer (Cat D8)',              short:'DZR',     tier:'tactical', color:'#22D3EE', size:12, role:'Cuts 10-20ft firebreak. Fast but needs road access.' },
  vlat:         { label:'VLAT DC-10',                  short:'VLAT',    tier:'tactical', color:'#22D3EE', size:16, role:'11,600gal Phos-Chek. Drops AHEAD of fire. 35min turnaround.' },
  seat:         { label:'SEAT Air Tractor',            short:'SEAT',    tier:'tactical', color:'#22D3EE', size:12, role:'800gal retardant. Fast turnaround. Flanks and initial attack.' },
  lead_plane:   { label:'Lead Plane',                  short:'LEAD',    tier:'tactical', color:'#22D3EE', size:12, role:'Scouts drop zone, marks with smoke, guides tanker approach.' },
  heli:         { label:'Helitack (Chinook)',           short:'HELI',    tier:'tactical', color:'#22D3EE', size:14, role:'2,600gal Bambi Bucket. Cools hot spots. Crew transport.' },
  tender:       { label:'Water Tender',                short:'WTR',     tier:'tactical', color:'#22D3EE', size:10, role:'4,000gal. Shuttles water to engines on fireline.' },
  struct_eng:   { label:'Structure Engine',            short:'STRC',    tier:'tactical', color:'#22D3EE', size:12, role:'Structure protection: triage, sprinklers, gel, foam.' },
  atgs:         { label:'Air Tactical (OV-10A)',       short:'ATGS',    tier:'tactical', color:'#22D3EE', size:14, role:'Flies at 2000ft. Directs all air ops. Override authority on drones.' },
  drones:       { label:'UAS Fleet (×12)',             short:'UAS',     tier:'tactical', color:'#22D3EE', size:14, role:'ISR, ember spotters, comms relay, safety overwatch, dragon eggs.' },
  traffic:      { label:'Traffic Control',             short:'TRAF',    tier:'tactical', color:'#22D3EE', size:10, role:'Law enforcement at intersections. Contraflow. Route management.' },
  // EXTERNAL SENSORS
  raws:         { label:'RAWS Weather',                short:'RAWS',    tier:'external', color:'#34D399', size:12, role:'Wind, temp, RH, fuel moisture every 10 min.' },
  satellite:    { label:'GOES/VIIRS',                  short:'SAT',     tier:'external', color:'#34D399', size:14, role:'Geostationary (5-15min) + polar-orbiting. Fire detection.' },
  alert_cam:    { label:'ALERTCalifornia',             short:'CAMS',    tier:'external', color:'#34D399', size:12, role:'1,200+ AI cameras. 360° sweep every 2min. AI smoke detection.' },
  dispatch:     { label:'CAD / Dispatch',              short:'DISP',    tier:'external', color:'#34D399', size:14, role:'Computer-Aided Dispatch. Routes equipment. 911 calls.' },
  iroc:         { label:'IROC Ordering',               short:'IROC',    tier:'external', color:'#34D399', size:12, role:'Interagency resource ordering. 10,000+ personnel peak season.' },
  genasys:      { label:'Genasys Protect',             short:'GNSY',    tier:'external', color:'#34D399', size:12, role:'Zone-based evacuation. WEA alerts, reverse-911, app push.' },
  firis:        { label:'FIRIS Aerial IR',             short:'FIRIS',   tier:'external', color:'#34D399', size:12, role:'IR-equipped aircraft. Maps fire perimeters from air.' },
  nws:          { label:'NWS Spot Forecast',           short:'NWS',     tier:'external', color:'#34D399', size:10, role:'Spot weather forecasts on request. Red flag warnings.' },
  // AI AGENTS
  ai_overwatch: { label:'OVERWATCH',                   short:'OW-AI',   tier:'ai',       color:'#F472B6', size:18, role:'AI orchestrator. Living COP. Conflict detection. Decision Points.' },
  ai_predict:   { label:'PREDICT',                     short:'PR-AI',   tier:'ai',       color:'#F472B6', size:16, role:'Continuous fire behavior. 50-scenario ensemble. Auto-calibrates from drone IR.' },
  ai_swarm:     { label:'SWARM',                       short:'SW-AI',   tier:'ai',       color:'#F472B6', size:16, role:'Drone fleet coordinator. K-means. TFR deconfliction. Crew safety overwatch.' },
  ai_evac:      { label:'EVAC',                        short:'EV-AI',   tier:'ai',       color:'#F472B6', size:16, role:'Zone threat classification. Route optimization. Vulnerable population tracking.' },
  ai_deploy:    { label:'DEPLOY',                      short:'DP-AI',   tier:'ai',       color:'#F472B6', size:16, role:'Resource optimizer. Pre-positions. LCES verification. 10 Orders check.' },
};

export const TYPE_COLORS = { command:'#FBBF24', intel:'#22D3EE', coord:'#34D399', ai:'#F472B6', safety:'#EF4444' };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ICS ENGINE CLASS — encapsulates all agent state
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export class ICSEngine {
  constructor() {
    this.agents = {};
    this.messageLog = [];    // all messages ever sent (for graph + event log)
    this.litNodes = new Set();
    this.icsPhase = 'standby';
    this.simTime = 0;
    this.banners = [];       // event banners [{text, detail, time}]
    this.pendingDecisions = []; // AI decision queue for commander approval
    this._decisionId = 0;

    // Fire state — updated externally from FireSpreadEngine stats
    this.fire = {
      area: 0, ros: 0, intensity: 0, containment: 0,
      spots: [], threatenedStructures: 0, windShifted: false,
      windDir: 225, windSpeed: 18, gustSpeed: 28,
      windShiftTime: 70 * 60, windShiftDir: 315, windShiftSpeed: 22, windShiftGust: 35,
      temp: 94, rh: 8, fuelMoisture: 3,
      community: { x: 0.42, y: 0.22, name: 'Pacific Palisades', pop: 2847, structures: 180 },
      origin: { x: 0.62, y: 0.38 },
    };

    // Initialize all agents
    for (const id of Object.keys(NODES)) {
      this.agents[id] = {
        active: false,
        lastTick: 0,
        cooldown: 0,
        tickInterval: 5,
        inbox: [],
        state: {},
        sent: {},
      };
    }
  }

  // ── Update fire state from external source (FireSpreadEngine stats) ──
  updateFireState(stats) {
    if (!stats) return;
    this.fire.area = stats.totalAcres || 0;
    this.fire.ros = stats.rosChainPerHour || 0;
    this.fire.intensity = Math.min(10, this.fire.ros * 0.08 * (stats.windSpeed || 18));
    this.fire.spots = stats.spotFires || this.fire.spots;
    // containment is managed by agents (they increase it)
    // windSpeed/windDir come from engine
    if (stats.windSpeed !== undefined) this.fire.windSpeed = stats.windSpeed;
    if (stats.windDirection !== undefined) this.fire.windDir = stats.windDirection;
  }

  // ── Send a message between agents ──────────────────────────────────────
  agentSend(from, to, msg, type) {
    const a = this.agents;
    if (!a[from] || !a[to]) return;
    if (!a[to].active) { a[to].active = true; this.litNodes.add(to); }
    if (!a[from].active) { a[from].active = true; this.litNodes.add(from); }
    const t = this.simTime;
    a[to].inbox.push({ from, msg, t, type: type || 'intel' });
    this.messageLog.push({ from, to, msg, type: type || 'intel', t });
    // Trim log
    if (this.messageLog.length > 200) this.messageLog.splice(0, this.messageLog.length - 200);
  }

  showBanner(text, detail) {
    this.banners.push({ text, detail, t: this.simTime });
    if (this.banners.length > 20) this.banners.shift();
  }

  // ── Decision Queue — AI agents propose, commander approves/overrides ──
  proposeDecision(agentId, actionKey, reasoning, urgency, onApprove) {
    const existing = this.pendingDecisions.find(d => d.actionKey === actionKey && d.status === 'pending');
    if (existing) return existing; // don't duplicate
    const decision = {
      id: ++this._decisionId,
      agentId,
      actionKey,
      reasoning,
      urgency: urgency || 'medium', // low | medium | high | critical
      status: 'pending', // pending | approved | overridden | auto
      createdAt: this.simTime,
      timeout: urgency === 'critical' ? 20 : urgency === 'high' ? 40 : 60, // seconds to auto-approve
      onApprove: onApprove || null,
    };
    this.pendingDecisions.push(decision);
    return decision;
  }

  approveDecision(decisionId) {
    const d = this.pendingDecisions.find(x => x.id === decisionId);
    if (!d || d.status !== 'pending') return;
    d.status = 'approved';
    if (d.onApprove) d.onApprove();
  }

  overrideDecision(decisionId) {
    const d = this.pendingDecisions.find(x => x.id === decisionId);
    if (!d || d.status !== 'pending') return;
    d.status = 'overridden';
  }

  // Auto-approve timed-out critical decisions (real ICS: safety-critical items default to action)
  tickDecisions() {
    for (const d of this.pendingDecisions) {
      if (d.status !== 'pending') continue;
      if (this.simTime - d.createdAt > d.timeout) {
        d.status = 'auto';
        if (d.onApprove) d.onApprove();
      }
    }
    // Prune old resolved decisions (keep last 20)
    const resolved = this.pendingDecisions.filter(d => d.status !== 'pending');
    if (resolved.length > 20) {
      this.pendingDecisions = this.pendingDecisions.filter(d => d.status === 'pending' || this.simTime - d.createdAt < 120);
    }
  }

  getPendingDecisions() { return this.pendingDecisions.filter(d => d.status === 'pending'); }
  getResolvedDecisions() { return this.pendingDecisions.filter(d => d.status !== 'pending').slice(-10); }

  hasSent(id, key) { return this.agents[id]?.sent[key] === true; }
  markSent(id, key) { if (this.agents[id]) this.agents[id].sent[key] = true; }
  lastFrom(id, fromId) {
    const msgs = this.agents[id]?.inbox.filter(m => m.from === fromId);
    return msgs?.length ? msgs[msgs.length - 1] : null;
  }

  formatSimTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `T+${m}:${String(s).padStart(2, '0')}`;
  }

  getWindDir() { return this.simTime >= this.fire.windShiftTime ? this.fire.windShiftDir : this.fire.windDir; }
  getWindSpeed() {
    const ws = this.simTime >= this.fire.windShiftTime ? this.fire.windShiftSpeed : this.fire.windSpeed;
    const gs = this.simTime >= this.fire.windShiftTime ? this.fire.windShiftGust : this.fire.gustSpeed;
    return ws + Math.sin(this.simTime * 0.3) * (gs - ws) * 0.5;
  }

  etaMins(x, y) {
    const ox = this.fire.origin.x, oy = this.fire.origin.y;
    const d = Math.hypot(ox - x, oy - y);
    const r = this.fire.ros * 0.0003;
    return r > 0 ? d / r / 60 : Infinity;
  }

  // ── Activate external sensors (always on) ──────────────────────────────
  activateSensors() {
    ['alert_cam', 'satellite', 'raws'].forEach(id => {
      this.agents[id].active = true;
      this.litNodes.add(id);
    });
  }

  // ── Reset all state ────────────────────────────────────────────────────
  reset() {
    for (const id of Object.keys(NODES)) {
      this.agents[id] = {
        active: false, lastTick: 0, cooldown: 0, tickInterval: 5,
        inbox: [], state: {}, sent: {},
      };
    }
    this.litNodes = new Set();
    this.icsPhase = 'standby';
    this.simTime = 0;
    this.messageLog = [];
    this.banners = [];
    this.pendingDecisions = [];
    this._decisionId = 0;
    this.fire.area = 0;
    this.fire.ros = 0;
    this.fire.intensity = 0;
    this.fire.containment = 0;
    this.fire.spots = [];
    this.fire.threatenedStructures = 0;
    this.fire.windShifted = false;
  }

  // ── Main tick — call every frame with dt (seconds) ─────────────────────
  tick(dt) {
    if (dt <= 0) return;
    this.simTime += dt;
    this.fire.windShifted = this.simTime >= this.fire.windShiftTime;

    // Auto-approve timed-out decisions
    this.tickDecisions();

    // Tick all active agents
    for (const [id, a] of Object.entries(this.agents)) {
      if (!a.active) continue;
      a.cooldown -= dt;
      if (a.cooldown <= 0) {
        a.cooldown = a.tickInterval;
        if (AGENT_TICK[id]) AGENT_TICK[id](this, a, dt);
      }
    }
  }

  // ── Get active edges for graph rendering ───────────────────────────────
  getActiveEdges() {
    const edges = new Set();
    for (const [id, a] of Object.entries(this.agents)) {
      if (!a.active) continue;
      for (const m of a.inbox) {
        if (this.litNodes.has(m.from) && this.litNodes.has(id)) {
          edges.add(m.from + '→' + id);
        }
      }
    }
    return edges;
  }

  // ── Get recent messages (for event feed) ───────────────────────────────
  getRecentMessages(count = 30) {
    return this.messageLog.slice(-count);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENT DECISION LOGIC — each agent thinks independently
// `e` is the ICSEngine instance, `a` is the agent state
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const AGENT_TICK = {

  // ── EXTERNAL SENSORS ──
  alert_cam(e, a, dt) {
    a.tickInterval = 2;
    if (e.fire.area > 0.15 && e.simTime > 120 && !e.hasSent('alert_cam', 'detect')) {
      e.markSent('alert_cam', 'detect');
      const bearing = Math.round(Math.atan2(e.fire.origin.x - 0.5, 0.5 - e.fire.origin.y) * 180 / Math.PI + 360) % 360;
      e.agentSend('alert_cam', 'dispatch', `SMOKE DETECTED: Camera CAM-1247, bearing ${bearing}°, confidence 94%, AI-confirmed multiple frames`, 'intel');
      e.showBanner('WILDFIRE DETECTED', 'ALERTCalifornia AI camera detects smoke plume');
    }
  },

  satellite(e, a, dt) {
    a.tickInterval = 8;
    if (e.fire.area > 0.5 && !e.hasSent('satellite', 'detect')) {
      e.markSent('satellite', 'detect');
      e.agentSend('satellite', 'dispatch', `GOES-18 hot spot confirmed: 34.41°N 118.59°W, FRP ${Math.round(e.fire.intensity * 5)} MW`, 'intel');
    }
    if (e.fire.area > 5 && e.simTime - (a.state.lastReport || 0) > 30) {
      a.state.lastReport = e.simTime;
      e.agentSend('satellite', 'sit_unit', `VIIRS perimeter update: ${Math.round(e.fire.area)} acres, FRP ${Math.round(e.fire.intensity * 8)} MW`, 'intel');
      if (e.agents.ai_predict.active) e.agentSend('satellite', 'ai_predict', `Perimeter data: ${Math.round(e.fire.area)} acres, growth rate ${e.fire.area > 20 ? 'RAPID' : 'moderate'}`, 'intel');
    }
  },

  raws(e, a, dt) {
    a.tickInterval = 10;
    if (!a.active) { a.active = true; e.litNodes.add('raws'); return; }
    const ws = Math.round(e.getWindSpeed());
    const wdNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const wdn = wdNames[Math.round(e.getWindDir() / 45) % 8];
    const msg = `RAWS #042: Wind ${wdn} ${ws}mph, Temp ${e.fire.temp}°F, RH ${e.fire.rh}%, 10hr FM ${e.fire.fuelMoisture}%`;
    if (e.agents.fban.active) e.agentSend('raws', 'fban', msg, 'intel');
    if (e.agents.ai_predict.active) e.agentSend('raws', 'ai_predict', msg, 'intel');
    if (e.agents.dispatch.active && !e.agents.fban.active) e.agentSend('raws', 'dispatch', msg, 'intel');
    if (e.fire.windShifted && !e.hasSent('raws', 'windshift')) {
      e.markSent('raws', 'windshift');
      e.agentSend('raws', 'fban', `CRITICAL: Wind shift detected! Now ${wdn} ${ws}mph gusting ${e.fire.windShiftGust}mph`, 'safety');
      if (e.agents.ai_predict.active) e.agentSend('raws', 'ai_predict', `WIND SHIFT: ${wdn} ${ws}mph gusting ${e.fire.windShiftGust}mph — recalculate all predictions`, 'safety');
      e.showBanner('WIND SHIFT DETECTED', `Wind now from ${wdn} at ${ws}mph gusting ${e.fire.windShiftGust}mph`);
    }
  },

  nws(e, a, dt) {
    a.tickInterval = 30;
    const req = e.lastFrom('nws', 'fban');
    if (req && !e.hasSent('nws', 'forecast1')) {
      e.markSent('nws', 'forecast1');
      const etaShift = Math.max(0, Math.round((e.fire.windShiftTime - e.simTime) / 60));
      e.agentSend('nws', 'fban', `SPOT FORECAST: Wind shift to NW expected in ${etaShift} min. Gusts to ${e.fire.windShiftGust}mph. RH recovery to 15% overnight. Red Flag Warning in effect.`, 'intel');
    }
  },

  firis(e, a, dt) {
    a.tickInterval = 25;
    if (!a.active || e.fire.area < 10) return;
    if (e.agents.sit_unit.active) {
      e.agentSend('firis', 'sit_unit', `Aerial IR map: fire perimeter ${Math.round(e.fire.area)} acres, hot spots concentrated at head, ${e.fire.spots.length} spot fires detected`, 'intel');
    }
  },

  // ── DISPATCH ──
  dispatch(e, a, dt) {
    a.tickInterval = 3;
    const camAlert = e.lastFrom('dispatch', 'alert_cam');
    const satAlert = e.lastFrom('dispatch', 'satellite');
    if ((camAlert || satAlert) && !e.hasSent('dispatch', 'ia_dispatch')) {
      e.markSent('dispatch', 'ia_dispatch');
      e.showBanner('911 DISPATCH ACTIVATED', 'CAD auto-generates Initial Attack assignment');
      e.agentSend('dispatch', 'ic', `INITIAL DISPATCH: Vegetation fire, est. ${Math.round(Math.max(0.25, e.fire.area))} acre, fast-moving. Dispatching: 3 Type 3 engines (ETA 8min), 1 helitack (ETA 12min), 1 water tender (ETA 6min).`, 'command');
      e.agents.engines.active = true; e.litNodes.add('engines'); e.agents.engines.state.eta = e.simTime + 8 * 60; e.agents.engines.state.enRoute = true;
      e.agents.heli.active = true; e.litNodes.add('heli'); e.agents.heli.state.eta = e.simTime + 12 * 60; e.agents.heli.state.enRoute = true;
      e.agents.tender.active = true; e.litNodes.add('tender'); e.agents.tender.state.eta = e.simTime + 6 * 60; e.agents.tender.state.enRoute = true;
      e.icsPhase = 'initial';
    }
    if (e.agents.ops_chief.active && !e.hasSent('dispatch', 'ops_status')) {
      e.markSent('dispatch', 'ops_status');
      e.agentSend('dispatch', 'ops_chief', `Resource dispatch: 3 engines en route (ETA 8min), heli airborne (ETA 12min), tender staged`, 'intel');
    }
  },

  // ── INCIDENT COMMANDER ──
  ic(e, a, dt) {
    a.tickInterval = 5;
    const dispatchMsg = e.lastFrom('ic', 'dispatch');
    if (dispatchMsg && !e.hasSent('ic', 'assume_command')) {
      e.markSent('ic', 'assume_command');
      e.showBanner('INCIDENT COMMANDER ASSIGNED', 'Engine 51 Captain assumes command — establishes ICS');
      e.agents.safety.active = true; e.litNodes.add('safety');
      e.agentSend('ic', 'safety', `SIZE-UP: Wind-driven brush fire, running uphill. ROS HIGH. Verify LCES for all incoming crews.`, 'command');
      e.agentSend('ic', 'engines', `IC/OPS DIRECT: E51+E52 direct attack right flank. E53 structure standby Oak Ridge Dr.`, 'command');
      if (e.agents.heli.active) e.agentSend('ic', 'heli', `IC/OPS DIRECT: Bucket drops on fire head. Dip site: lake 2.1mi south.`, 'command');
    }

    // IA → EA transition
    if (e.icsPhase === 'initial' && e.fire.area > 10 && !e.hasSent('ic', 'ea_order')) {
      e.markSent('ic', 'ea_order');
      e.icsPhase = 'extended';
      e.showBanner('EXTENDED ATTACK ORDERED', 'Fire exceeding IA capability — additional resources requested');
      ['ops_chief', 'plan_chief', 'fire_branch', 'air_ops', 'div_alpha', 'fban', 'sit_unit', 'atgs'].forEach(id => { e.agents[id].active = true; e.litNodes.add(id); });
      ['hotshots', 'dozer', 'seat', 'lead_plane', 'vlat', 'hand_crew'].forEach(id => {
        e.agents[id].active = true; e.litNodes.add(id);
        e.agents[id].state.eta = e.simTime + Math.round((10 + Math.random() * 20) * 60);
        e.agents[id].state.enRoute = true;
      });
      ['ai_overwatch', 'ai_predict', 'ai_swarm', 'ai_deploy'].forEach(id => { e.agents[id].active = true; e.litNodes.add(id); });
      e.agentSend('ic', 'ops_chief', `YOU ARE NOW OPS SECTION CHIEF. Establish Fire Branch + Air Ops. IC retains strategic authority.`, 'command');
      e.agentSend('ic', 'plan_chief', `PLANNING: Extended Attack authorized. Situation assessment and fire behavior prediction needed immediately.`, 'command');
      e.agents.drones.active = true; e.litNodes.add('drones');
      e.showBanner('FIRESIGHT AI AGENTS ONLINE', 'OVERWATCH, PREDICT, SWARM, DEPLOY agents initializing');
    }

    // EA → Crisis
    if (e.icsPhase === 'extended' && (e.fire.threatenedStructures > 20 || e.fire.windShifted) && !e.hasSent('ic', 'crisis_order')) {
      e.markSent('ic', 'crisis_order');
      e.icsPhase = 'crisis';
      e.showBanner('TYPE 1 ESCALATION', 'Structures threatened — evacuation ordered');
      ['pio', 'le_branch', 'struct_group', 'struct_eng', 'ai_evac', 'genasys', 'traffic', 'div_bravo'].forEach(id => { e.agents[id].active = true; e.litNodes.add(id); });
      e.agentSend('ic', 'pio', `ISSUE EVACUATION WARNING: Zones OR-1, OR-2, OR-3. Press briefing in 30 min.`, 'command');
      e.agentSend('ic', 'le_branch', `EVACUATION ORDER: Zones OR-1, OR-2 MANDATORY. Zone OR-3 WARNING. Door-to-door.`, 'command');
      e.agentSend('ic', 'ops_chief', `STRUCTURE PROTECTION: Activate Struct Group. Triage all structures in threat zone.`, 'command');
    }

    // Crisis → Full ICS
    if (e.icsPhase === 'crisis' && e.fire.area > 40 && !e.hasSent('ic', 'full_ics')) {
      e.markSent('ic', 'full_ics');
      e.icsPhase = 'full';
      e.showBanner('FULL ICS — TYPE 1 INCIDENT', 'All sections staffed — mutual aid requested');
      ['log_chief', 'fin_chief', 'iroc', 'comms', 'medical', 'liaison', 'res_unit', 'nws'].forEach(id => { e.agents[id].active = true; e.litNodes.add(id); });
      e.agentSend('ic', 'log_chief', `FULL ACTIVATION: Comms unit needed. Medical standby. Supply chain for 200+ personnel.`, 'command');
      e.agentSend('ic', 'liaison', `COORDINATE: County OES, Red Cross, utility companies, school district.`, 'command');
    }

    // Process OVERWATCH decision points
    const owMsg = e.agents.ic.inbox.filter(m => m.from === 'ai_overwatch' && m.msg.includes('DECISION POINT'));
    if (owMsg.length > 0 && !e.hasSent('ic', 'dp_' + Math.floor(e.simTime / 30))) {
      e.markSent('ic', 'dp_' + Math.floor(e.simTime / 30));
      e.agentSend('ic', 'ops_chief', `IC DECISION: Approved OVERWATCH recommendation. Execute tactical adjustment.`, 'command');
    }
  },

  // ── SAFETY OFFICER ──
  safety(e, a, dt) {
    a.tickInterval = 6;
    if (!a.active) return;
    const watchOuts = [];
    if (e.fire.windShifted) watchOuts.push('#15: Wind increase/change');
    if (e.fire.spots.length > 0) watchOuts.push('#16: Frequent spot fires');
    if (e.fire.intensity > 7) watchOuts.push('#14: Weather hotter/drier');
    if (e.fire.threatenedStructures > 0) watchOuts.push('#10: Attempt structure protection');

    if (watchOuts.length > 0 && e.simTime - (a.state.lastSafetyCheck || 0) > 15) {
      a.state.lastSafetyCheck = e.simTime;
      const isCritical = e.fire.windShifted || e.fire.intensity > 8;
      if (isCritical) {
        if (e.agents.hotshots.active) e.agentSend('safety', 'hotshots', `SAFETY STOP ORDER: Verify escape routes NOW. Wind shift active.`, 'safety');
        if (e.agents.hand_crew.active) e.agentSend('safety', 'hand_crew', `SAFETY STOP ORDER: Halt operations until LCES reconfirmed.`, 'safety');
        if (e.agents.engines.active) e.agentSend('safety', 'engines', `SAFETY: All engines verify escape routes. Watch Out #15 active.`, 'safety');
      }
      e.agentSend('safety', 'ops_chief', `WATCH OUT: ${watchOuts.join(', ')}. ${isCritical ? 'STOP ORDERS ISSUED.' : 'ALL crews verify LCES.'}`, 'safety');
      e.agentSend('safety', 'ic', `SAFETY STATUS: ${watchOuts.length} Watch Out situations active.`, 'safety');
    }

    if (e.fire.windShifted && e.agents.hotshots.active && !e.hasSent('safety', 'lces_wind')) {
      e.markSent('safety', 'lces_wind');
      e.agentSend('safety', 'hotshots', `MANDATORY LCES CHECK: Wind shift active. Confirm escape route and safety zone NOW.`, 'safety');
      if (e.agents.hand_crew.active) e.agentSend('safety', 'hand_crew', `LCES RECHECK: Wind shift — verify escape routes immediately.`, 'safety');
    }
  },

  // ── OPS CHIEF ──
  ops_chief(e, a, dt) {
    a.tickInterval = 5;
    if (!a.active || e.icsPhase === 'initial') return;
    if (e.agents.fire_branch.active && !e.hasSent('ops_chief', 'ea_branches')) {
      e.markSent('ops_chief', 'ea_branches');
      e.agentSend('ops_chief', 'fire_branch', `BRANCH ORDER: Assume ground suppression. Division Alpha on head.`, 'command');
      e.agentSend('ops_chief', 'air_ops', `AIR OPS: Coordinate all aircraft. VLAT inbound. Deconflict with drones.`, 'command');
    }
    const fbanBrief = e.lastFrom('ops_chief', 'fban');
    if (fbanBrief && fbanBrief.t > e.simTime - 20 && !e.hasSent('ops_chief', 'fban_resp_' + Math.floor(e.simTime / 30))) {
      e.markSent('ops_chief', 'fban_resp_' + Math.floor(e.simTime / 30));
      if (e.fire.windShifted) {
        e.agentSend('ops_chief', 'div_alpha', `FBAN ADVISORY: Wind shift redirecting head. Reposition for east flank defense.`, 'command');
        if (e.agents.div_bravo.active) e.agentSend('ops_chief', 'div_bravo', `URGENT: East flank now primary threat.`, 'command');
      }
    }
    if (e.simTime - (a.state.lastSitrep || 0) > 20) {
      a.state.lastSitrep = e.simTime;
      e.agentSend('ops_chief', 'ic', `OPS SITREP: ${Math.round(e.fire.area)} acres, ${Math.round(e.fire.containment)}% contained. ROS ${Math.round(e.fire.ros)} ch/hr. ${e.fire.spots.length} spot fires.`, 'intel');
      if (e.agents.plan_chief.active) e.agentSend('ops_chief', 'plan_chief', `Ops situation: ${Math.round(e.fire.area)} acres, ${Math.round(e.fire.containment)}% contained.`, 'intel');
    }
    const deployRec = e.lastFrom('ops_chief', 'ai_deploy');
    if (deployRec && deployRec.t > e.simTime - 15 && !e.hasSent('ops_chief', 'deploy_act_' + Math.floor(e.simTime / 25))) {
      e.markSent('ops_chief', 'deploy_act_' + Math.floor(e.simTime / 25));
      if (e.agents.engines.active) e.agentSend('ops_chief', 'engines', `REPOSITION per fire prediction: adjust to current fire behavior.`, 'command');
    }
  },

  // ── FIRE BRANCH ──
  fire_branch(e, a, dt) {
    a.tickInterval = 7;
    if (!a.active) return;
    if (e.agents.div_alpha.active && !e.hasSent('fire_branch', 'div_orders')) {
      e.markSent('fire_branch', 'div_orders');
      e.agentSend('fire_branch', 'div_alpha', `DIV-A: You have the head. Hotshots for burnout from anchor point.`, 'command');
    }
    if (e.agents.div_bravo.active && !e.hasSent('fire_branch', 'divb_orders')) {
      e.markSent('fire_branch', 'divb_orders');
      e.agentSend('fire_branch', 'div_bravo', `DIV-B: East flank fireline construction. Hand crew + dozer support.`, 'command');
    }
    if (e.agents.struct_group.active && !e.hasSent('fire_branch', 'struct_orders')) {
      e.markSent('fire_branch', 'struct_orders');
      e.agentSend('fire_branch', 'struct_group', `STRUCT: Triage all structures within 1mi of fire. Deploy engines.`, 'command');
    }
    if (e.simTime - (a.state.lastRelay || 0) > 18) {
      a.state.lastRelay = e.simTime;
      const divA = e.agents.div_alpha.active ? 'Div-A: advancing on head' : '';
      const divB = e.agents.div_bravo.active ? 'Div-B: east flank fireline' : '';
      const struct = e.agents.struct_group.active ? `Struct: ${e.fire.threatenedStructures} threatened` : '';
      e.agentSend('fire_branch', 'ops_chief', `BRANCH SITREP: ${[divA, divB, struct].filter(Boolean).join('. ')}. Containment ${Math.round(e.fire.containment)}%.`, 'intel');
    }
  },

  // ── AIR OPS ──
  air_ops(e, a, dt) {
    a.tickInterval = 6;
    if (!a.active) return;
    if (e.agents.atgs.active && !e.hasSent('air_ops', 'atgs_mission')) {
      e.markSent('air_ops', 'atgs_mission');
      e.agentSend('air_ops', 'atgs', `AIR MISSION: ATGS take control. VLAT inbound. SEAT ready. DRONES DOWN in TFR.`, 'command');
    }
    const swarmMsg = e.lastFrom('air_ops', 'ai_swarm');
    if (swarmMsg && swarmMsg.t > e.simTime - 10 && !e.hasSent('air_ops', 'deconf_' + Math.floor(e.simTime / 20))) {
      e.markSent('air_ops', 'deconf_' + Math.floor(e.simTime / 20));
      e.agentSend('air_ops', 'atgs', `DRONE STATUS: All drones holding at 400ft AGL. TFR clear for tanker ops.`, 'coord');
    }
  },

  // ── DIVISIONS ──
  div_alpha(e, a, dt) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (e.agents.hotshots.active && !e.hasSent('div_alpha', 'ihc_assign')) {
      e.markSent('div_alpha', 'ihc_assign');
      e.agentSend('div_alpha', 'hotshots', `IHC: Burnout operation from anchor point. Drip torch authorized.`, 'command');
    }
    if (e.agents.engines.active) e.agentSend('div_alpha', 'engines', `E51, E52: Hold burnout line.`, 'command');
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      e.agentSend('div_alpha', 'fire_branch', `DIV-A SITREP: ${Math.round(e.fire.containment)}% containment on head. ROS ${Math.round(e.fire.ros)} ch/hr.`, 'intel');
    }
  },

  div_bravo(e, a, dt) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (e.agents.hand_crew.active && !e.hasSent('div_bravo', 'hc_assign')) {
      e.markSent('div_bravo', 'hc_assign');
      e.agentSend('div_bravo', 'hand_crew', `HAND CREW: Begin fireline east flank from road anchor. 2ft wide to mineral soil.`, 'command');
    }
    if (e.agents.dozer.active && !e.hasSent('div_bravo', 'dzr_assign')) {
      e.markSent('div_bravo', 'dzr_assign');
      e.agentSend('div_bravo', 'dozer', `DOZER: Firebreak east ridge. 15ft wide. Support hand crew fireline.`, 'command');
    }
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      e.fire.containment = Math.min(95, e.fire.containment + 0.3);
      e.agentSend('div_bravo', 'fire_branch', `DIV-B SITREP: East flank fireline progressing. ${e.fire.windShifted ? 'WIND SHIFT increasing urgency.' : ''}`, 'intel');
    }
    if (!a.state.activatedAt) a.state.activatedAt = e.simTime;
  },

  struct_group(e, a, dt) {
    a.tickInterval = 10;
    if (!a.active) return;
    if (e.agents.struct_eng.active && !e.hasSent('struct_group', 'assign')) {
      e.markSent('struct_group', 'assign');
      const def = Math.round(e.fire.community.structures * 0.6);
      e.agentSend('struct_group', 'struct_eng', `TRIAGE: ${def} defensible. Priority: Sunset View. Gel+foam.`, 'command');
    }
  },

  // ── TACTICAL RESOURCES ──
  engines(e, a, dt) {
    a.tickInterval = 10;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) {
      if (!e.hasSent('engines', 'enroute')) { e.markSent('engines', 'enroute'); e.agentSend('engines', e.agents.ops_chief.active ? 'ops_chief' : 'ic', `E51 STATUS: En route. ETA ${Math.ceil((a.state.eta - e.simTime) / 60)} min.`, 'intel'); }
      return;
    }
    if (a.state.enRoute) { a.state.enRoute = false; e.agentSend('engines', e.agents.ops_chief.active ? 'ops_chief' : 'ic', `E51+E52+E53 ON SCENE. Ready for assignment.`, 'intel'); }
    e.fire.containment = Math.min(95, e.fire.containment + 0.15);
    const reportTo = e.agents.div_alpha.active ? 'div_alpha' : 'ops_chief';
    if (e.simTime - (a.state.lastReport || 0) > 12) {
      a.state.lastReport = e.simTime;
      const waterPct = Math.max(10, 100 - e.simTime * 0.5);
      e.agentSend('engines', reportTo, `E51 PROGRESS: Direct attack holding flank. Water at ${Math.round(waterPct)}%.`, 'intel');
      if (waterPct < 30 && e.agents.tender.active) e.agentSend('engines', 'tender', `REQUEST: Water resupply needed.`, 'coord');
    }
  },

  hotshots(e, a, dt) {
    a.tickInterval = 10;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) {
      if (!e.hasSent('hotshots', 'enroute')) { e.markSent('hotshots', 'enroute'); e.agentSend('hotshots', 'div_alpha', `IHC: En route. ETA ${Math.ceil((a.state.eta - e.simTime) / 60)} min.`, 'intel'); }
      return;
    }
    if (a.state.enRoute) { a.state.enRoute = false; e.showBanner('HOTSHOT CREW ON SCENE', 'IHC-1 (20 personnel) reporting for burnout operations'); e.agentSend('hotshots', 'div_alpha', `IHC ON SCENE. 20 personnel.`, 'intel'); }
    e.fire.containment = Math.min(95, e.fire.containment + 0.25);
    if (!a.state.workStart) a.state.workStart = e.simTime;
    const workHrs = (e.simTime - a.state.workStart) / 3600;
    const fatigue = workHrs > 14 ? 'MANDATORY REST' : workHrs > 12 ? 'Level 3' : workHrs > 8 ? 'Level 2' : 'Level 1';
    if (e.simTime - (a.state.lastReport || 0) > 12) {
      a.state.lastReport = e.simTime;
      e.agentSend('hotshots', 'div_alpha', `IHC REPORT: Burnout ${Math.min(100, Math.round((e.simTime - a.state.workStart) * 0.3))}% complete. Fatigue: ${fatigue}.`, 'intel');
      if (workHrs > 14 && !e.hasSent('hotshots', 'fatigue_alert')) {
        e.markSent('hotshots', 'fatigue_alert');
        e.agentSend('hotshots', 'ic', `CREW FATIGUE CRITICAL: IHC at ${workHrs.toFixed(1)}h work. Rotation needed.`, 'safety');
      }
    }
  },

  hand_crew(e, a, dt) {
    a.tickInterval = 12;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) return;
    if (a.state.enRoute) { a.state.enRoute = false; e.agentSend('hand_crew', 'div_bravo', `T2 HAND CREW ON SCENE. 20 personnel.`, 'intel'); }
    e.fire.containment = Math.min(95, e.fire.containment + 0.1);
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      e.agentSend('hand_crew', 'div_bravo', `T2 CREW: Fireline progress, difficult terrain.`, 'intel');
    }
  },

  dozer(e, a, dt) {
    a.tickInterval = 12;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) return;
    if (a.state.enRoute) { a.state.enRoute = false; e.agentSend('dozer', 'div_bravo', `DOZER ON SCENE. Cat D8 ready.`, 'intel'); }
    e.fire.containment = Math.min(95, e.fire.containment + 0.2);
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      e.agentSend('dozer', 'div_bravo', `DOZER: Firebreak progress 6 chains/hour.`, 'intel');
    }
  },

  heli(e, a, dt) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) return;
    if (a.state.enRoute) { a.state.enRoute = false; e.agentSend('heli', e.agents.atgs.active ? 'atgs' : 'ops_chief', `HELI ON STATION. Bambi Bucket ready.`, 'intel'); }
    e.fire.containment = Math.min(95, e.fire.containment + 0.1);
    if (e.simTime - (a.state.lastReport || 0) > 12) {
      a.state.lastReport = e.simTime;
      e.agentSend('heli', e.agents.atgs.active ? 'atgs' : 'ops_chief', `HELI: Bucket drop on head. ${e.fire.spots.length > 0 ? 'Spotting ahead.' : ''}`, 'intel');
    }
  },

  tender(e, a, dt) {
    a.tickInterval = 15;
    if (!a.active) return;
    const req = e.agents.tender.inbox.find(m => m.from === 'engines' && m.msg.includes('resupply'));
    if (req && e.simTime - (a.state.lastDeliver || 0) > 20) {
      a.state.lastDeliver = e.simTime;
      e.agentSend('tender', 'engines', `WATER DELIVERY: 4000gal. Resupply complete.`, 'coord');
    }
  },

  atgs(e, a, dt) {
    a.tickInterval = 6;
    if (!a.active) return;
    if (e.agents.lead_plane.active && !e.hasSent('atgs', 'lead_scout')) {
      e.markSent('atgs', 'lead_scout');
      e.agentSend('atgs', 'lead_plane', `LEAD: Scout drop zone north flank. Mark approach for VLAT.`, 'command');
    }
    if (e.agents.vlat.active && e.lastFrom('atgs', 'lead_plane') && !e.hasSent('atgs', 'vlat_run')) {
      e.markSent('atgs', 'vlat_run');
      e.agentSend('atgs', 'vlat', `VLAT: North ridge, heading 045, 200ft AGL. Drop AHEAD of fire.`, 'command');
      e.agentSend('atgs', 'drones', `DRONES DOWN: TFR active for tanker ops.`, 'command');
    }
    if (e.agents.seat.active && !e.hasSent('atgs', 'seat_drop')) {
      e.markSent('atgs', 'seat_drop');
      e.agentSend('atgs', 'seat', `SEAT: Retardant on east flank. Protect structure corridor.`, 'command');
    }
  },

  lead_plane(e, a, dt) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) return;
    if (a.state.enRoute) { a.state.enRoute = false; e.agentSend('lead_plane', 'atgs', `LEAD PLANE ON STATION. Scouting drop zone.`, 'intel'); }
    if (!e.hasSent('lead_plane', 'scout_report') && !a.state.enRoute) {
      e.markSent('lead_plane', 'scout_report');
      e.agentSend('lead_plane', 'atgs', `DROP ZONE CLEAR: North flank ridgeline. Marking with smoke.`, 'intel');
    }
  },

  vlat(e, a, dt) {
    a.tickInterval = 15;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) {
      if (!e.hasSent('vlat', 'enroute')) { e.markSent('vlat', 'enroute'); e.agentSend('vlat', 'atgs', `VLAT DC-10: Inbound. 11,600gal Phos-Chek loaded.`, 'intel'); }
      return;
    }
    if (a.state.enRoute) { a.state.enRoute = false; e.showBanner('VLAT DC-10 ON STATION', '11,600gal Phos-Chek'); e.agentSend('vlat', 'atgs', `VLAT ON STATION. Awaiting drop zone.`, 'intel'); }
    const dropOrder = e.lastFrom('vlat', 'atgs');
    if (dropOrder && !e.hasSent('vlat', 'drop1')) {
      e.markSent('vlat', 'drop1');
      e.fire.containment = Math.min(95, e.fire.containment + 3);
      e.agentSend('vlat', 'atgs', `VLAT DROP COMPLETE: Full load, good coverage. RTB — 35min turnaround.`, 'intel');
    }
  },

  seat(e, a, dt) {
    a.tickInterval = 10;
    if (!a.active) return;
    if (a.state.enRoute && e.simTime < a.state.eta) return;
    if (a.state.enRoute) { a.state.enRoute = false; e.agentSend('seat', 'atgs', `SEAT ON STATION. 800gal retardant loaded.`, 'intel'); }
    const order = e.lastFrom('seat', 'atgs');
    if (order && !e.hasSent('seat', 'drop1')) {
      e.markSent('seat', 'drop1');
      e.fire.containment = Math.min(95, e.fire.containment + 1.5);
      e.agentSend('seat', 'atgs', `SEAT drop complete. Good coverage on east flank.`, 'intel');
    }
  },

  struct_eng(e, a, dt) {
    a.tickInterval = 12;
    if (!a.active) return;
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      const done = Math.min(e.fire.community.structures, Math.round(e.simTime * 0.3));
      e.agentSend('struct_eng', 'struct_group', `STRUCTURE REPORT: ${done}/${Math.round(e.fire.community.structures * 0.6)} gel-coated.`, 'intel');
    }
  },

  drones(e, a, dt) {
    a.tickInterval = 5;
    if (!a.active) return;
    for (const s of e.fire.spots) {
      if (!s.confirmed) {
        s.confirmed = true;
        e.agentSend('drones', 'ai_swarm', `SPOT FIRE DETECTED: IR confirms active fire at (${s.x?.toFixed?.(2) || '?'},${s.y?.toFixed?.(2) || '?'}).`, 'intel');
        e.agentSend('drones', 'ai_predict', `IR calibration: New spot fire. Update perimeter model.`, 'intel');
      }
    }
    if (e.agents.safety.active && e.simTime - (a.state.lastSafety || 0) > 15) {
      a.state.lastSafety = e.simTime;
      e.agentSend('drones', 'safety', `OVERWATCH: All ground crews visible on IR. Escape routes ${e.fire.windShifted ? 'NEED REVERIFICATION' : 'clear'}.`, 'intel');
    }
    if (e.agents.ai_swarm.active && e.simTime - (a.state.lastTelem || 0) > 8) {
      a.state.lastTelem = e.simTime;
      e.agentSend('drones', 'ai_swarm', `TELEMETRY: UAS airborne. IR perimeter update. Battery avg ${Math.max(20, 100 - e.simTime * 0.3)}%.`, 'intel');
    }
  },

  traffic(e, a, dt) {
    a.tickInterval = 12;
    if (!a.active) return;
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      e.agentSend('traffic', 'le_branch', `TRAFFIC: Contraflow active. Clearance rate ~200 veh/hr.`, 'intel');
    }
  },

  // ── PLANNING SECTION ──
  plan_chief(e, a, dt) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (e.agents.fban.active && !e.hasSent('plan_chief', 'fban_task')) {
      e.markSent('plan_chief', 'fban_task');
      e.agentSend('plan_chief', 'fban', `FBAN TASKING: Run Wildfire Analyst. Need 1hr/3hr/6hr predictions.`, 'command');
      e.agentSend('plan_chief', 'sit_unit', `SIT UNIT: Establish situation display. Compile perimeter data.`, 'command');
    }
    if (e.simTime - (a.state.lastBrief || 0) > 25) {
      a.state.lastBrief = e.simTime;
      e.agentSend('plan_chief', 'ic', `PLANNING BRIEF: ${Math.round(e.fire.area)} acres, ${Math.round(e.fire.containment)}% contained. ${e.fire.windShifted ? 'Wind shift active.' : ''}`, 'intel');
    }
  },

  fban(e, a, dt) {
    a.tickInterval = 12;
    if (!a.active) return;
    if (!e.hasSent('fban', 'nws_req') && e.agents.nws.active) {
      e.markSent('fban', 'nws_req');
      e.agentSend('fban', 'nws', `SPOT FORECAST REQUEST: Location 34.41°N 118.59°W. Need wind shift timing.`, 'intel');
    }
    if (e.simTime - (a.state.lastBrief || 0) > 15) {
      a.state.lastBrief = e.simTime;
      const flamLen = Math.round(e.fire.ros * 0.12);
      e.agentSend('fban', 'plan_chief', `FIRE BEHAVIOR: ROS ${Math.round(e.fire.ros)} ch/hr. Flame length ${flamLen}ft. ${flamLen > 11 ? 'CROWN FIRE RISK HIGH.' : ''}`, 'intel');
      e.agentSend('fban', 'ops_chief', `FBAN TO OPS: ${e.fire.windShifted ? 'Wind shift pushing fire EAST toward community.' : 'Fire behavior ' + (e.fire.intensity > 6 ? 'EXTREME' : 'moderate') + ' at head.'}`, 'intel');
    }
  },

  sit_unit(e, a, dt) {
    a.tickInterval = 15;
    if (!a.active) return;
    if (e.simTime - (a.state.lastMap || 0) > 20) {
      a.state.lastMap = e.simTime;
      e.agentSend('sit_unit', 'plan_chief', `SITUATION MAP: ${Math.round(e.fire.area)} acres. ${Math.round(e.fire.containment)}% contained. ${e.fire.spots.length} spot fires.`, 'intel');
    }
  },

  res_unit(e, a, dt) {
    a.tickInterval = 20;
    if (!a.active) return;
    if (e.simTime - (a.state.lastReport || 0) > 20) {
      a.state.lastReport = e.simTime;
      const activeCount = Object.values(e.agents).filter(x => x.active).length;
      e.agentSend('res_unit', 'plan_chief', `RESOURCE STATUS: ${activeCount} active units.`, 'intel');
    }
  },

  // ── LOGISTICS ──
  log_chief(e, a, dt) {
    a.tickInterval = 12;
    if (!a.active) return;
    if (e.agents.comms.active && !e.hasSent('log_chief', 'comms_task')) {
      e.markSent('log_chief', 'comms_task');
      e.agentSend('log_chief', 'comms', `COMMS: Deploy P25 gateway — bridge CAL FIRE VHF, county UHF, federal 800MHz.`, 'command');
    }
    if (e.agents.medical.active && !e.hasSent('log_chief', 'med_task')) {
      e.markSent('log_chief', 'med_task');
      e.agentSend('log_chief', 'medical', `MEDICAL: Position ambulance at staging area. ALS capability.`, 'command');
    }
    if (e.agents.iroc.active && !e.hasSent('log_chief', 'iroc_order')) {
      e.markSent('log_chief', 'iroc_order');
      e.agentSend('log_chief', 'iroc', `RESOURCE ORDER: 4 engines, 2 hand crews, 1 IHC, 2 dozers, medical unit.`, 'command');
    }
    if (e.simTime - (a.state.lastReport || 0) > 25) {
      a.state.lastReport = e.simTime;
      e.agentSend('log_chief', 'ic', `LOGISTICS STATUS: Comms ${e.agents.comms.active ? 'deployed' : 'pending'}. Medical ${e.agents.medical.active ? 'positioned' : 'pending'}.`, 'intel');
    }
  },

  comms(e, a) { a.tickInterval = 20; if (!a.active) return; if (e.simTime - (a.state.lastReport || 0) > 25) { a.state.lastReport = e.simTime; e.agentSend('comms', 'log_chief', `COMMS: P25 gateway operational. 3 freq systems bridged.`, 'intel'); } },
  medical(e, a) { a.tickInterval = 20; if (!a.active) return; if (!e.hasSent('medical', 'positioned')) { e.markSent('medical', 'positioned'); e.agentSend('medical', 'log_chief', `MEDICAL: ALS ambulance staged. Medevac standby.`, 'intel'); } },
  iroc(e, a) { a.tickInterval = 20; if (!a.active) return; if (!e.hasSent('iroc', 'confirm')) { e.markSent('iroc', 'confirm'); e.agentSend('iroc', 'log_chief', `IROC CONFIRM: 4 engines ETA 2hr. Hand crews ETA 4hr. Type 1 team ETA 0600.`, 'intel'); } },
  fin_chief(e, a) { a.tickInterval = 30; if (!a.active) return; if (!e.hasSent('fin_chief', 'cost')) { e.markSent('fin_chief', 'cost'); e.agentSend('fin_chief', 'ic', `COST PROJECTION: Current burn rate $${Math.round(e.fire.area * 2000)}/hr. Retardant: $${Math.round(e.fire.area * 800)}.`, 'intel'); } },

  // ── PIO ──
  pio(e, a) {
    a.tickInterval = 15;
    if (!a.active) return;
    if (!e.hasSent('pio', 'first_release')) {
      e.markSent('pio', 'first_release');
      e.agentSend('pio', 'ic', `MEDIA: Press release issued. ${Math.round(e.fire.area)} acre wildfire. Evacuation zones active.`, 'intel');
    }
  },

  liaison(e, a) {
    a.tickInterval = 20;
    if (!a.active) return;
    if (!e.hasSent('liaison', 'coord')) {
      e.markSent('liaison', 'coord');
      e.agentSend('liaison', 'ic', `LIAISON: County OES activated. Red Cross shelter at high school. PG&E notified.`, 'intel');
    }
  },

  // ── EVACUATION ──
  le_branch(e, a) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (e.agents.genasys.active && !e.hasSent('le_branch', 'genasys_order')) {
      e.markSent('le_branch', 'genasys_order');
      e.agentSend('le_branch', 'genasys', `ZONE UPDATE: OR-1=MANDATORY, OR-2=MANDATORY, OR-3=WARNING. Trigger WEA + reverse-911.`, 'command');
      e.agentSend('le_branch', 'traffic', `TRAFFIC CONTROL: Contraflow on Pine Ridge Rd.`, 'command');
    }
    if (e.simTime - (a.state.lastReport || 0) > 15) {
      a.state.lastReport = e.simTime;
      const pct = Math.min(100, Math.round((e.simTime - (a.state.startTime || e.simTime)) * 0.8));
      e.agentSend('le_branch', 'ic', `EVACUATION: OR-1 ${Math.min(100, pct + 10)}% cleared. OR-2 ${pct}%.`, 'intel');
    }
    if (!a.state.startTime) a.state.startTime = e.simTime;
  },

  genasys(e, a) {
    a.tickInterval = 20;
    if (!a.active) return;
    if (!e.hasSent('genasys', 'alerts_sent')) {
      e.markSent('genasys', 'alerts_sent');
      e.agentSend('genasys', 'le_branch', `ALERTS SENT: WEA delivered to ${Math.round(e.fire.community.pop * 0.85)} of ${e.fire.community.pop} residents.`, 'intel');
    }
  },

  // ── AI AGENTS ──
  ai_overwatch(e, a) {
    a.tickInterval = 5;
    if (!a.active) return;
    if (e.simTime - (a.state.lastDP || 0) > 20) {
      a.state.lastDP = e.simTime;
      const threats = [];
      if (e.fire.windShifted) threats.push('wind shift active');
      if (e.fire.spots.length > 0) threats.push(`${e.fire.spots.length} spot fires`);
      if (e.fire.threatenedStructures > 50) threats.push(`${e.fire.threatenedStructures} structures at risk`);
      if (e.fire.containment < 20 && e.fire.area > 20) threats.push('low containment');
      if (threats.length > 0) {
        e.agentSend('ai_overwatch', 'ic', `DECISION POINT: ${threats.join(', ')}. Confidence: ${Math.max(40, 90 - e.fire.area * 0.5).toFixed(0)}%.`, 'ai');
      }
      e.agentSend('ai_overwatch', 'plan_chief', `LIVING IAP: 10 Orders verified. All agent outputs integrated.`, 'ai');
    }
  },

  ai_predict(e, a) {
    a.tickInterval = 6;
    if (!a.active) return;
    if (e.simTime - (a.state.lastPred || 0) > 12) {
      a.state.lastPred = e.simTime;
      const ros = Math.round(e.fire.ros);
      const area1h = Math.round(e.fire.area * 2.5);
      const area3h = Math.round(e.fire.area * 6);
      const conf = Math.max(40, 90 - e.fire.area * 0.3 - (e.fire.windShifted ? 15 : 0));
      e.agentSend('ai_predict', 'ai_overwatch', `PREDICTION: 1hr→${area1h}ac, 3hr→${area3h}ac. ROS ${ros} ch/hr. Confidence ${conf.toFixed(0)}%.`, 'ai');
      if (e.agents.fban.active) e.agentSend('ai_predict', 'fban', `AI AUGMENT: Ensemble (50 scenarios) ${e.fire.windShifted ? 'confirms wind shift impact' : 'stable'}.`, 'ai');
      if (e.agents.ai_evac.active) e.agentSend('ai_predict', 'ai_evac', `Fire prediction → ETA to community ${Math.round(e.etaMins(e.fire.community.x, e.fire.community.y))} min.`, 'ai');
      if (e.agents.ai_deploy.active) e.agentSend('ai_predict', 'ai_deploy', `Fire prediction → head moving ${e.fire.windShifted ? 'EAST' : 'NE'} at ${ros} ch/hr.`, 'ai');
    }
  },

  ai_swarm(e, a) {
    a.tickInterval = 5;
    if (!a.active) return;
    if (e.agents.drones.active && e.simTime - (a.state.lastCmd || 0) > 10) {
      a.state.lastCmd = e.simTime;
      const priorities = [];
      if (e.fire.spots.filter(s => !s.confirmed).length > 0) priorities.push('spot fire investigation');
      priorities.push('perimeter mapping', 'crew safety overwatch');
      e.agentSend('ai_swarm', 'drones', `DEPLOY: Priority ${priorities[0]}. K-means clustering to ${priorities.length} zones.`, 'ai');
    }
    if (e.fire.windShifted && !e.hasSent('ai_swarm', 'crew_safety_alert')) {
      e.markSent('ai_swarm', 'crew_safety_alert');
      e.agentSend('ai_swarm', 'safety', `CREW SAFETY: Wind shift — drone IR verifying all escape routes.`, 'ai');
      e.agentSend('ai_swarm', 'ai_overwatch', `Coverage update: All fronts monitored.`, 'ai');
    }
    if (e.agents.air_ops.active && e.simTime - (a.state.lastDeconf || 0) > 15) {
      a.state.lastDeconf = e.simTime;
      e.agentSend('ai_swarm', 'air_ops', `DECONFLICTION: All drones at 400ft AGL. Manned aircraft corridor clear.`, 'ai');
    }
  },

  ai_evac(e, a) {
    a.tickInterval = 8;
    if (!a.active) return;
    if (e.simTime - (a.state.lastAnalysis || 0) > 15) {
      a.state.lastAnalysis = e.simTime;
      const eta = Math.round(e.etaMins(e.fire.community.x, e.fire.community.y));
      e.agentSend('ai_evac', 'ai_overwatch', `ZONE ANALYSIS: OR-1 (450 res, 2 exits), OR-2 (320 res, 1 exit — BOTTLENECK). Fire ETA ${eta} min.`, 'ai');
      if (e.agents.le_branch.active) e.agentSend('ai_evac', 'le_branch', `ROUTE: OR-2 single exit — recommend contraflow. Clearance ETA: 45 min.`, 'ai');
      if (e.agents.genasys.active) e.agentSend('ai_evac', 'genasys', `ZONE THREAT: OR-1=ORDER, OR-2=ORDER, OR-3=${eta < 60 ? 'ORDER' : 'WARNING'}.`, 'ai');
    }
  },

  ai_deploy(e, a) {
    a.tickInterval = 6;
    if (!a.active) return;
    if (e.simTime - (a.state.lastRec || 0) > 12) {
      a.state.lastRec = e.simTime;
      const failed = e.fire.windShifted && !e.hasSent('ai_deploy', 'orders_recheck') ? ['#3: Update for wind shift'] : [];
      if (failed.length) {
        e.markSent('ai_deploy', 'orders_recheck');
        e.agentSend('ai_deploy', 'safety', `10 ORDERS ALERT: ${failed.join(', ')}. Safety Officer review required.`, 'safety');
        e.agentSend('ai_deploy', 'ops_chief', `10 ORDERS UPDATE NEEDED: ${failed.join(', ')}.`, 'intel');
      }
      e.agentSend('ai_deploy', 'ops_chief', `RESOURCE RECOMMENDATION: Pre-stage on ${e.fire.windShifted ? 'east' : 'north'} flank. ${e.fire.area > 50 ? 'Mutual aid RECOMMENDED.' : ''}`, 'ai');
      e.agentSend('ai_deploy', 'ai_overwatch', `Resource status: ${Object.values(e.agents).filter(x => x.active).length} active. Containment ${Math.round(e.fire.containment)}%.`, 'ai');
      if (e.agents.log_chief.active && e.fire.area > 40) {
        e.agentSend('ai_deploy', 'log_chief', `SUPPLY FORECAST: Water resupply needed. Foam critical.`, 'ai');
      }
    }
  },
};
