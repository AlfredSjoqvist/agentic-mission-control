// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRATEGY BEHAVIOR DEFINITIONS
//
// Each strategy mode defines how every agent's tick behavior changes.
// The ICSEngine applies these by setting `engine.strategy.*` fields,
// and AGENT_TICK functions read them to adjust decisions.
//
// This file does NOT modify icsEngine.js — it's a standalone reference
// that can be imported and wired in later.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── STRATEGY STATE SCHEMA ────────────────────────────────────────────────────
// This object lives on the ICSEngine instance as `engine.strategy`
// Every field has a default. Phone commands change these values.
export const DEFAULT_STRATEGY = {
  // 1. Overall posture
  posture: 'offensive',          // 'offensive' | 'defensive' | 'confine' | 'transition'

  // 2. Attack mode
  attackMode: 'direct',          // 'direct' | 'parallel' | 'indirect'
  anchorPoint: null,             // { x, y } normalized coords or null

  // 3. Firing operations
  firingAuth: 'none',            // 'none' | 'burnout' | 'backfire'
  firingTarget: null,            // division id or location
  firingApprovedBy: null,        // 'ic' required for backfire

  // 4. Structure protection mode
  structMode: 'triage',          // 'triage' | 'protect' | 'abandon' | 'bump-and-run'
  structZones: {},               // { zoneId: 'defensible'|'marginal'|'non-defensible' }

  // 5. Evacuation levels per zone
  evacZones: {},                 // { zoneId: 'none'|'advisory'|'warning'|'order'|'rescue'|'lifted' }
  contraflowRoads: [],           // road ids with contraflow active

  // 6. Air operations priority
  airPriority: 'head',           // 'head' | 'structures' | 'flanks' | 'hold'
  medevacActive: false,
  droneMode: 'recon',            // 'recon' | 'safety' | 'targeted'
  droneTarget: null,             // location for targeted recon

  // 7. Resource management
  crewExtensions: {},            // { resourceId: { authorized: true, hours: 2 } }
  mutualAidRequested: false,
  mutualAidTypes: [],            // ['hotshots', 'engines', 'helicopters', ...]
  stagedResources: {},           // { resourceId: { x, y } }

  // 8. Planning cycle
  iapStatus: 'draft',            // 'draft' | 'approved' | 'expired'
  opsNight: false,               // night operations authorized
  opsPeriodExtended: false,

  // 9. Safety
  safetyStop: 'none',            // 'none' | 'all' | division id
  lcesRequired: false,           // true = all crews must reconfirm LCES
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. OVERALL STRATEGY — POSTURE BEHAVIORS
//
// These define how each agent group behaves under each strategic posture.
// The posture is the single most important variable — it cascades everywhere.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const POSTURE_BEHAVIORS = {

  offensive: {
    // ── Command ──
    ic: {
      objectives: ['Contain fire at current perimeter', 'Prevent structure loss', 'Full suppression'],
      decisionBias: 'aggressive',       // approve offensive proposals quickly
      escalationThreshold: 'high',      // wait longer before escalating incident type
    },
    safety: {
      alertLevel: 'normal',
      stopThreshold: 'standard',        // issue stops per standard 10 Orders / 18 Watch Outs
      lcesCheckInterval: 30,            // seconds between LCES reminders (sim time)
    },

    // ── Operations ──
    ops_chief: {
      resourceCommitment: 'full',       // commit all available resources to fireline
      reservePercentage: 0.1,           // keep 10% in reserve
      divisionPressure: 'push',         // divisions push toward fire
    },
    fire_branch: {
      lineConstructionRate: 1.0,        // full speed line building
      mopUpPriority: 'low',            // don't mop up yet, still attacking
      anchorRequired: true,             // always build from anchor point (Fire Order #8)
    },
    div_alpha: {
      posture: 'attack',               // actively engaging fire head
      crewPlacement: 'at_fire_edge',   // crews working right at perimeter
      retreatTrigger: 'flame_length_8ft', // pull back if flames > 8ft
    },
    div_bravo: {
      posture: 'attack',
      crewPlacement: 'at_fire_edge',
      focus: 'flank_containment',
    },

    // ── Tactical Resources ──
    engines: {
      mode: 'direct_attack',           // hose lines on fire edge, pump-and-roll
      spacing: 'close',                // engines close together for mutual support
      waterConservation: false,         // use water freely
    },
    hotshots: {
      mode: 'line_construction',        // cutting handline at fire edge
      burnoutAuth: 'single_resource',   // crew boss can authorize small burnouts
      workIntensity: 'high',            // fast cutting pace
      fatigueWarning: 14 * 3600,        // warn at 14 hours (sim seconds)
      fatigueMax: 16 * 3600,            // mandatory stop at 16 hours
    },
    hand_crew: {
      mode: 'line_construction',
      section: 'flanks',                // hand crew typically on flanks, hotshots on head
      workIntensity: 'moderate',
    },
    dozer: {
      mode: 'line_cutting',
      lineWidth: 20,                    // feet — aggressive wide line
      priority: 'ahead_of_fire',        // cut line in fire's projected path
    },
    heli: {
      mode: 'bucket_drops',
      target: 'fire_head',             // cool the head to slow spread
      dipFrequency: 'continuous',       // constant rotation to water source
    },
    vlat: {
      mode: 'retardant_line',
      target: 'ahead_of_head',         // drop AHEAD of fire, not on it
      turnaroundMin: 35,                // minutes between drops
    },
    seat: {
      mode: 'retardant_line',
      target: 'flanks',                // SEATs work flanks while VLAT hits head
      turnaroundMin: 15,
    },

    // ── AI Agents ──
    ai_predict: {
      scenarioFocus: 'containment',     // model scenarios where containment succeeds
      updateInterval: 5,                // frequent updates during active attack
      confidenceThreshold: 0.7,         // report predictions above 70% confidence
    },
    ai_swarm: {
      droneFormation: 'perimeter_track', // drones follow fire perimeter
      coverageGaps: 'flag',             // alert if any perimeter section unmonitored
      safetyOverwatch: true,            // always monitor crew positions
    },
    ai_deploy: {
      optimization: 'suppress',          // optimize for maximum suppression effect
      preposition: false,               // everything committed, nothing to preposition
      fatigueTracking: true,
    },
    ai_evac: {
      mode: 'monitor',                  // monitoring but not recommending evac yet
      zoneScanInterval: 15,             // check zone threats every 15s
    },
    ai_overwatch: {
      decisionPointThreshold: 'high',   // only flag major decision points
      conflictDetection: true,
      tenOrdersCheck: true,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────

  defensive: {
    // ── Command ──
    ic: {
      objectives: ['Protect life safety', 'Hold existing containment lines', 'Structure protection priority'],
      decisionBias: 'conservative',     // favor safety over aggression
      escalationThreshold: 'low',       // escalate incident type quickly
    },
    safety: {
      alertLevel: 'elevated',
      stopThreshold: 'sensitive',       // lower threshold for stop orders
      lcesCheckInterval: 15,            // more frequent LCES checks
    },

    // ── Operations ──
    ops_chief: {
      resourceCommitment: 'selective',   // only commit to defensible positions
      reservePercentage: 0.25,           // keep 25% in reserve for emergencies
      divisionPressure: 'hold',          // divisions hold their lines, don't push
    },
    fire_branch: {
      lineConstructionRate: 0.5,         // slower, more deliberate line building
      mopUpPriority: 'medium',           // mop up contained sections to prevent rekindle
      anchorRequired: true,
    },
    div_alpha: {
      posture: 'hold',                   // holding existing line at fire head
      crewPlacement: 'behind_line',      // crews behind completed fireline
      retreatTrigger: 'any_breach',      // retreat immediately if line is breached
    },
    div_bravo: {
      posture: 'hold',
      crewPlacement: 'behind_line',
      focus: 'prevent_flanking',
    },

    // ── Tactical Resources ──
    engines: {
      mode: 'structure_protection',      // engines assigned to structures, not fireline
      spacing: 'spread',                 // spread to cover more structures
      waterConservation: true,           // conserve water — resupply is uncertain
    },
    hotshots: {
      mode: 'hold_line',                 // holding completed fireline, not building new
      burnoutAuth: 'ops_chief',          // no freelance burnouts in defensive mode
      workIntensity: 'moderate',         // pace for endurance, not speed
      fatigueWarning: 12 * 3600,         // warn earlier in defensive (may need them longer)
      fatigueMax: 16 * 3600,
    },
    hand_crew: {
      mode: 'mop_up',                    // cold trailing and mop-up on held lines
      section: 'contained_perimeter',
      workIntensity: 'moderate',
    },
    dozer: {
      mode: 'safety_line',              // cutting escape routes and safety zones, not attack lines
      lineWidth: 30,                     // wider lines for safety margin
      priority: 'escape_routes',
    },
    heli: {
      mode: 'bucket_drops',
      target: 'hot_spots',              // cool spots threatening the line, not chasing the head
      dipFrequency: 'as_needed',
    },
    vlat: {
      mode: 'retardant_line',
      target: 'structure_perimeter',     // retardant lines around structures
      turnaroundMin: 35,
    },
    seat: {
      mode: 'retardant_line',
      target: 'spot_fires',             // quick response to spots threatening held lines
      turnaroundMin: 15,
    },

    // ── AI Agents ──
    ai_predict: {
      scenarioFocus: 'threat_assessment', // model where fire will go if lines fail
      updateInterval: 8,
      confidenceThreshold: 0.5,          // report lower-confidence threats too
    },
    ai_swarm: {
      droneFormation: 'structure_grid',   // drones over threatened structures
      coverageGaps: 'critical',           // coverage gaps near structures are critical alerts
      safetyOverwatch: true,
    },
    ai_deploy: {
      optimization: 'protect',            // optimize for structure protection coverage
      preposition: true,                  // pre-stage resources at predicted threat points
      fatigueTracking: true,
    },
    ai_evac: {
      mode: 'active',                     // actively recommending evacuation zones
      zoneScanInterval: 8,                // frequent zone threat assessment
    },
    ai_overwatch: {
      decisionPointThreshold: 'medium',   // flag more decision points — IC needs options
      conflictDetection: true,
      tenOrdersCheck: true,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────

  confine: {
    // ── Command ──
    ic: {
      objectives: ['Confine fire to containment box', 'Protect values at risk only', 'Minimize resource expenditure'],
      decisionBias: 'minimal_engagement',
      escalationThreshold: 'medium',
    },
    safety: {
      alertLevel: 'normal',
      stopThreshold: 'standard',
      lcesCheckInterval: 30,
    },

    // ── Operations ──
    ops_chief: {
      resourceCommitment: 'minimal',     // only commit to box boundaries
      reservePercentage: 0.4,            // keep 40% in reserve — fire is burning freely inside box
      divisionPressure: 'none',          // no one pushes toward fire
    },
    fire_branch: {
      lineConstructionRate: 0.3,         // only building line at box boundaries
      mopUpPriority: 'none',             // fire is burning freely inside containment box
      anchorRequired: true,
    },
    div_alpha: {
      posture: 'monitor',                // watching fire head, not engaging
      crewPlacement: 'at_box_boundary',  // positioned at containment box edge
      retreatTrigger: 'fire_at_boundary', // retreat if fire reaches the box edge
    },
    div_bravo: {
      posture: 'monitor',
      crewPlacement: 'at_box_boundary',
      focus: 'box_integrity',
    },

    // ── Tactical Resources ──
    engines: {
      mode: 'standby',                   // staged at values at risk, not on fireline
      spacing: 'spread',
      waterConservation: true,
    },
    hotshots: {
      mode: 'box_boundary',              // holding line only at containment box edges
      burnoutAuth: 'ops_chief',
      workIntensity: 'low',              // conservation pace — could be here for days
      fatigueWarning: 12 * 3600,
      fatigueMax: 16 * 3600,
    },
    hand_crew: {
      mode: 'standby',
      section: 'values_at_risk',
      workIntensity: 'low',
    },
    dozer: {
      mode: 'box_boundary',             // cutting containment box perimeter only
      lineWidth: 30,
      priority: 'natural_barriers',      // tie line into roads, ridges, rivers
    },
    heli: {
      mode: 'standby',
      target: 'on_call',                // only flies if fire threatens box boundary
      dipFrequency: 'on_call',
    },
    vlat: {
      mode: 'standby',                  // on call, not dropping unless box is breached
      target: 'none',
      turnaroundMin: 35,
    },
    seat: {
      mode: 'standby',
      target: 'spot_fires_outside_box', // only engage spots that escape the box
      turnaroundMin: 15,
    },

    // ── AI Agents ──
    ai_predict: {
      scenarioFocus: 'box_breach',       // model probability of fire escaping containment box
      updateInterval: 15,                // less frequent — fire behavior inside box is less critical
      confidenceThreshold: 0.6,
    },
    ai_swarm: {
      droneFormation: 'box_perimeter',   // drones patrol the containment box boundary
      coverageGaps: 'box_only',
      safetyOverwatch: true,
    },
    ai_deploy: {
      optimization: 'efficiency',         // minimize resource usage, maximize rest
      preposition: true,                  // stage at predicted breach points
      fatigueTracking: true,
    },
    ai_evac: {
      mode: 'monitor',                    // monitor but fire is in the box, not near structures
      zoneScanInterval: 30,
    },
    ai_overwatch: {
      decisionPointThreshold: 'low',      // flag if anything threatens the box
      conflictDetection: true,
      tenOrdersCheck: true,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────

  transition: {
    // Transition = changing from one posture to another.
    // Everything slows down, safety increases, crews reposition.
    ic: {
      objectives: ['Safe repositioning of all resources', 'Verify LCES at new positions', 'Brief all divisions on new strategy'],
      decisionBias: 'cautious',
      escalationThreshold: 'low',
    },
    safety: {
      alertLevel: 'high',
      stopThreshold: 'sensitive',
      lcesCheckInterval: 10,             // very frequent — crews are moving
    },
    ops_chief: {
      resourceCommitment: 'pause',       // all units pause, wait for new orders
      reservePercentage: 0.3,
      divisionPressure: 'none',
    },
    fire_branch: {
      lineConstructionRate: 0.0,         // no line construction during transition
      mopUpPriority: 'none',
      anchorRequired: true,
    },
    div_alpha: {
      posture: 'reposition',
      crewPlacement: 'moving_to_new_assignment',
      retreatTrigger: 'any_threat',
    },
    div_bravo: {
      posture: 'reposition',
      crewPlacement: 'moving_to_new_assignment',
      focus: 'safe_movement',
    },
    engines: { mode: 'reposition', spacing: 'convoy', waterConservation: true },
    hotshots: { mode: 'reposition', burnoutAuth: 'none', workIntensity: 'low', fatigueWarning: 14 * 3600, fatigueMax: 16 * 3600 },
    hand_crew: { mode: 'reposition', section: 'moving', workIntensity: 'low' },
    dozer: { mode: 'reposition', lineWidth: 0, priority: 'travel_to_new_assignment' },
    heli: { mode: 'standby', target: 'crew_transport', dipFrequency: 'none' },
    vlat: { mode: 'standby', target: 'none', turnaroundMin: 35 },
    seat: { mode: 'standby', target: 'none', turnaroundMin: 15 },
    ai_predict: { scenarioFocus: 'reposition_safety', updateInterval: 5, confidenceThreshold: 0.5 },
    ai_swarm: { droneFormation: 'crew_tracking', coverageGaps: 'crew_routes', safetyOverwatch: true },
    ai_deploy: { optimization: 'reposition', preposition: true, fatigueTracking: true },
    ai_evac: { mode: 'active', zoneScanInterval: 8 },
    ai_overwatch: { decisionPointThreshold: 'low', conflictDetection: true, tenOrdersCheck: true },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. ATTACK MODE BEHAVIORS
//
// These modify tactical agent behavior based on the chosen attack method.
// Attack mode is independent of posture — you can do indirect attack
// while in offensive posture (e.g., fire is too intense for direct but
// you're still trying to contain it aggressively).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ATTACK_MODE_BEHAVIORS = {

  direct: {
    // Crews work right at the fire's edge
    // Used when: flame length < 4ft, adequate resources, good escape routes
    applicableWhen: { maxFlameLength: 4, minResources: 'adequate' },
    hotshots: {
      placement: 'fire_edge',
      lineDistance: 0,                   // line built right at fire perimeter
      escapeRoute: 'into_black',         // escape into already-burned area
      toolsUsed: ['pulaski', 'mcleod', 'drip_torch'],
    },
    engines: {
      placement: 'fire_edge',
      tactic: 'pump_and_roll',           // drive along fire edge spraying
      hoseLength: 'short',               // 100-200ft progressive hoselay
    },
    hand_crew: {
      placement: 'fire_edge',
      lineDistance: 0,
      toolsUsed: ['pulaski', 'mcleod', 'shovel'],
    },
    dozer: {
      placement: 'fire_edge',
      lineDistance: 0,
      passesRequired: 1,                 // single pass at fire edge
    },
    containmentRate: 1.0,                // fastest containment per hour of work
    riskLevel: 'moderate',               // crews near fire but can escape to black
  },

  parallel: {
    // Line built 30-100ft from fire edge, then burn out fuel between
    // Used when: flame length 4-8ft, terrain allows offset, anchor available
    applicableWhen: { maxFlameLength: 8, minResources: 'moderate' },
    hotshots: {
      placement: 'offset_30_100ft',
      lineDistance: 50,                  // average 50ft from fire edge
      escapeRoute: 'pre_planned',
      toolsUsed: ['pulaski', 'mcleod', 'drip_torch', 'fusee'],
      burnoutRequired: true,             // must burn out between line and fire
    },
    engines: {
      placement: 'offset_30_100ft',
      tactic: 'progressive_hoselay',
      hoseLength: 'medium',             // 300-500ft progressive hoselay
    },
    hand_crew: {
      placement: 'offset_30_100ft',
      lineDistance: 50,
      toolsUsed: ['pulaski', 'mcleod', 'shovel'],
    },
    dozer: {
      placement: 'offset_50ft',
      lineDistance: 50,
      passesRequired: 2,                // wider line needed at offset
    },
    containmentRate: 0.7,               // slower — line is longer, requires burnout
    riskLevel: 'moderate',
  },

  indirect: {
    // Line built far from fire using natural barriers, then backfire
    // Used when: flame length > 8ft, high ROS, terrain/fuel too dangerous
    applicableWhen: { maxFlameLength: 999, minResources: 'any' },
    hotshots: {
      placement: 'natural_barrier',      // roads, ridges, rivers, dozer lines
      lineDistance: 200,                 // 200+ ft from fire, sometimes miles
      escapeRoute: 'pre_planned_vehicular',
      toolsUsed: ['drip_torch', 'fusee', 'terra_torch'],
      backfireRequired: true,            // must backfire from line to consume fuel
    },
    engines: {
      placement: 'natural_barrier',
      tactic: 'holding_line',            // engines hold the line, not attacking fire
      hoseLength: 'long',               // 1000ft+ for structure protection
    },
    hand_crew: {
      placement: 'natural_barrier',
      lineDistance: 200,
      toolsUsed: ['pulaski', 'shovel'],  // clearing line at barrier
    },
    dozer: {
      placement: 'ahead_of_fire',
      lineDistance: 500,                 // far ahead of fire's projected path
      passesRequired: 3,                // very wide line (30ft+)
    },
    containmentRate: 0.4,               // slowest — sacrificing acres to gain control
    riskLevel: 'low',                   // crews far from fire
    acresSacrificed: true,              // everything between line and fire will burn
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. FIRING OPERATION BEHAVIORS
//
// Burnout = small, near the line. Backfire = large, far from fire.
// Authorization levels differ. IC must approve backfire.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const FIRING_BEHAVIORS = {

  none: {
    // No firing operations authorized
    hotshots: { firingAllowed: false },
    hand_crew: { firingAllowed: false },
    div_alpha: { firingOps: false },
    div_bravo: { firingOps: false },
    safety: { firingMonitoring: false },
  },

  burnout: {
    // Small-scale: burn fuel between completed fireline and fire edge
    // Authorization: single resource boss (crew boss) can decide
    authorization: 'single_resource_boss',
    scope: 'between_line_and_fire',
    maxWidth: 100,                       // feet — max distance to burn
    hotshots: {
      firingAllowed: true,
      tools: ['drip_torch', 'fusee'],
      crewBossDecides: true,             // crew boss doesn't need IC approval
      triggerCondition: 'line_complete_in_section',
    },
    hand_crew: {
      firingAllowed: true,
      tools: ['fusee'],                  // less experienced, simpler tools
      crewBossDecides: true,
    },
    div_alpha: {
      firingOps: true,
      reportTo: 'fire_branch',           // report firing progress up chain
      holdUntilComplete: true,           // don't advance until burnout complete
    },
    safety: {
      firingMonitoring: true,
      windCheck: true,                   // verify wind won't carry fire over line
      escapeRouteVerified: true,
    },
    ai_swarm: {
      droneMode: 'firing_overwatch',     // drones watch the burnout for slopovers
      alertOn: 'fire_crossing_line',
    },
  },

  backfire: {
    // Large-scale: intentionally set fire far from main fire to consume fuel
    // Authorization: IC MUST approve. Ops Chief plans. Most consequential decision.
    authorization: 'incident_commander',
    scope: 'ahead_of_main_fire',
    maxWidth: null,                      // no limit — can be miles
    requiresWrittenPlan: true,
    hotshots: {
      firingAllowed: true,
      tools: ['drip_torch', 'fusee', 'terra_torch', 'heli_torch'],
      crewBossDecides: false,            // IC approval required
      triggerCondition: 'ic_authorization_received',
      patternType: 'strip_head',         // fire set in strips perpendicular to wind
    },
    hand_crew: {
      firingAllowed: true,
      tools: ['fusee'],
      crewBossDecides: false,
      supportRole: true,                 // support hotshots, don't lead firing
    },
    div_alpha: {
      firingOps: true,
      reportTo: 'ops_chief',             // backfire reports go to Ops Chief directly
      holdUntilComplete: false,          // active fire management required throughout
      contingencyPlan: 'required',       // what if backfire escapes?
    },
    heli: {
      mode: 'heli_torch',               // helicopter drops incendiary balls (PSD)
      target: 'firing_pattern',
      requiresATGS: true,               // ATGS must coordinate
    },
    vlat: {
      mode: 'retardant_boundary',       // retardant lines define backfire boundary
      target: 'backfire_perimeter',
    },
    safety: {
      firingMonitoring: true,
      windCheck: true,
      escapeRouteVerified: true,
      contingencyBriefing: true,         // safety briefs all crews on abort plan
      stopTrigger: 'wind_shift_during_firing',
    },
    ai_predict: {
      scenarioFocus: 'backfire_success', // model: will backfire reach main fire before wind shifts?
      updateInterval: 3,                 // very frequent during firing
    },
    ai_swarm: {
      droneMode: 'firing_perimeter',     // drones define and monitor entire backfire boundary
      alertOn: 'escape_or_slopover',
    },
    ai_overwatch: {
      decisionPointThreshold: 'any',     // flag ANY anomaly during backfire
      conflictDetection: true,
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. STRUCTURE PROTECTION BEHAVIORS
//
// Based on CAL FIRE structure triage protocol.
// Three categories: Defensible, Marginal, Non-defensible.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const STRUCTURE_BEHAVIORS = {

  triage: {
    // Assessment phase — categorize structures before committing resources
    struct_group: {
      action: 'assess',
      criteria: {
        defensible: [
          'Defensible space > 100ft',
          'Non-combustible roof',
          'Enclosed eaves',
          'Access road passable by engine',
          'Water supply available',
          'Two escape routes for engine',
        ],
        marginal: [
          'Defensible space 30-100ft',
          'Combustible roof but fire-resistant',
          'Access possible but tight',
          'May need prep work (close windows, move combustibles)',
        ],
        non_defensible: [
          'Defensible space < 30ft',
          'Wood shake roof',
          'Single narrow access road',
          'Heavy vegetation touching structure',
          'No water supply',
          'Crews cannot safely escape',
        ],
      },
      reportTo: 'ops_chief',
    },
    struct_eng: {
      mode: 'standby',                  // wait for triage results before deploying
    },
    ai_deploy: {
      mode: 'structure_assessment',      // AI assists triage using drone imagery
      droneRequest: true,                // request drone flyovers of structures
    },
  },

  protect: {
    // Active protection — commit engines to defensible structures
    struct_group: {
      action: 'protect',
      priorityOrder: ['life_safety', 'critical_infrastructure', 'defensible_structures'],
      abandonNonDefensible: true,        // don't waste resources on hopeless structures
    },
    struct_eng: {
      mode: 'active_protection',
      tactics: {
        defensible: 'stand_and_defend',  // engine stays, fights fire at structure
        marginal: 'prep_and_leave',      // gel, foam, sprinklers, then move on
      },
      gelApplication: true,              // Phos-Chek gel on exposed surfaces
      foamApplication: true,             // CAFS on vegetation near structure
      sprinklerDeploy: true,             // portable sprinklers on roof
      waterUsage: 'heavy',
    },
    engines: {
      mode: 'structure_support',         // some fire engines reassigned to structures
      waterConservation: false,
    },
    ai_deploy: {
      mode: 'structure_optimization',    // optimal engine-to-structure assignment
      fatigueTracking: true,
    },
    ai_swarm: {
      droneMode: 'structure_overwatch',  // drones over defended structures
      alertOn: 'ember_shower',           // alert if embers landing on structures
    },
  },

  abandon: {
    // Write-off — pull all resources from a zone
    struct_group: {
      action: 'withdraw',
      documentLosses: true,              // record which structures lost for ICS-209
    },
    struct_eng: {
      mode: 'withdraw',
      tactics: { all: 'retreat_to_safety_zone' },
    },
    safety: {
      verifyAllCrewsOut: true,           // headcount before zone is abandoned
      escapeRouteMonitoring: true,
    },
    ai_evac: {
      mode: 'verify_civilian_clearance', // confirm no civilians remain in abandoned zone
    },
  },

  'bump-and-run': {
    // Rapid triage — engines move ahead of fire, quick-prep each structure, move on
    // 5-10 minutes per structure maximum
    struct_group: {
      action: 'bump_and_run',
      maxTimePerStructure: 10 * 60,      // 10 min max (sim seconds)
      sequence: 'fire_approach_order',   // start with structures fire will hit first
    },
    struct_eng: {
      mode: 'bump_and_run',
      tactics: {
        each_structure: [
          'Close windows and doors',
          'Move combustibles away from structure',
          'Apply gel to exposed wood surfaces',
          'Deploy portable sprinkler if available',
          'Move to next structure',
        ],
      },
      maxTimePerStructure: 10 * 60,
      waterUsage: 'minimal',             // conserve for maximum structure coverage
    },
    engines: {
      mode: 'bump_and_run_support',
      waterConservation: true,           // critical — water must last for many structures
    },
    safety: {
      timeTracking: true,                // enforce max time per structure
      retreatTrigger: 'fire_within_200ft',
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. EVACUATION LEVEL BEHAVIORS
//
// Based on California Ready-Set-Go and Genasys zone-based alerting.
// Each level changes behavior of LE Branch, AI EVAC, PIO, Traffic.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const EVACUATION_BEHAVIORS = {

  none: {
    le_branch: { mode: 'standby' },
    ai_evac: { zoneStatus: 'clear', alertType: 'none' },
    pio: { publicMessage: 'none' },
    traffic: { mode: 'normal' },
    genasys: { alertLevel: 'none' },
  },

  advisory: {
    // "Be ready to leave" — voluntary
    le_branch: {
      mode: 'patrol',                    // patrol zone, visible presence
      doorToDoor: false,
      checkpoints: false,
    },
    ai_evac: {
      zoneStatus: 'advisory',
      alertType: 'WEA_advisory',
      vulnerablePopTracking: true,       // track elderly, disabled, hospitals, schools
      routePreCalc: true,                // pre-calculate evacuation routes
    },
    pio: {
      publicMessage: 'advisory',
      channels: ['social_media', 'local_news', 'community_alert_app'],
      message: 'Wildfire in area. Prepare to evacuate. Gather essentials, secure animals, plan your route.',
    },
    traffic: {
      mode: 'monitor',                   // monitor traffic flow, no intervention yet
    },
    genasys: {
      alertLevel: 'advisory',
      deliveryMethod: ['app_push', 'email'],
      coverage: 'zone_residents',
    },
  },

  warning: {
    // "Leave now if you are vulnerable" — strongly urged
    le_branch: {
      mode: 'active_notification',
      doorToDoor: true,                  // deputies knock on doors
      checkpoints: false,
      priorityTargets: ['elderly', 'disabled', 'schools', 'hospitals', 'animal_facilities'],
    },
    ai_evac: {
      zoneStatus: 'warning',
      alertType: 'WEA_warning',
      vulnerablePopTracking: true,
      routeOptimization: true,           // optimize routes based on current traffic
      bottleneckDetection: true,         // flag road bottlenecks
      estimatedClearanceTime: true,      // calculate how long to evacuate zone
    },
    pio: {
      publicMessage: 'warning',
      channels: ['social_media', 'local_news', 'community_alert_app', 'radio', 'tv_crawler'],
      message: 'Evacuation WARNING. Leave now if elderly, disabled, or have animals. Others prepare to leave immediately.',
      pressBriefing: 'schedule',
    },
    traffic: {
      mode: 'signal_priority',           // traffic signals favor outbound lanes
      intersectionControl: false,        // not yet manning intersections
    },
    genasys: {
      alertLevel: 'warning',
      deliveryMethod: ['app_push', 'email', 'sms', 'reverse_911'],
      coverage: 'zone_plus_adjacent',
    },
  },

  order: {
    // MANDATORY evacuation — law enforcement enforced
    le_branch: {
      mode: 'mandatory_enforcement',
      doorToDoor: true,                  // every door
      checkpoints: true,                 // prevent re-entry
      forceAvailable: true,              // can compel evacuation (CA law)
      documentRefusals: true,            // record who refuses to leave (for rescue planning)
    },
    ai_evac: {
      zoneStatus: 'order',
      alertType: 'WEA_emergency',
      vulnerablePopTracking: true,
      routeOptimization: true,
      bottleneckDetection: true,
      estimatedClearanceTime: true,
      shelterAssignment: true,           // assign evacuees to specific shelters
      capacityTracking: true,            // track shelter capacity
    },
    pio: {
      publicMessage: 'order',
      channels: ['WEA_blast', 'all_media', 'sirens', 'loudspeaker'],
      message: 'MANDATORY EVACUATION ORDER. Leave immediately. Do not delay. Follow posted evacuation routes.',
      pressBriefing: 'immediate',
    },
    traffic: {
      mode: 'full_control',
      intersectionControl: true,         // officers at key intersections
      contraflow: 'authorized',          // IC can authorize contraflow
      routeEnforcement: true,            // force traffic onto designated routes
    },
    genasys: {
      alertLevel: 'order',
      deliveryMethod: ['WEA', 'sms', 'reverse_911', 'app_push', 'sirens'],
      coverage: 'all_devices_in_zone',
      repeatInterval: 5 * 60,            // repeat alert every 5 min
    },
    liaison: {
      coordinate: ['red_cross', 'school_district', 'hospital_transport', 'animal_control', 'utility_shutoff'],
    },
  },

  rescue: {
    // Zone being overrun — rescue only, no orderly evacuation possible
    le_branch: {
      mode: 'rescue_operations',
      doorToDoor: false,                 // too dangerous for door-to-door
      checkpoints: true,
      rescueTeams: true,                 // dedicated rescue teams with engines
    },
    ai_evac: {
      zoneStatus: 'rescue',
      alertType: 'imminent_threat',
      shelterInPlace: true,              // advise remaining residents to shelter
      rescuePrioritization: true,        // AI prioritizes rescue targets by vulnerability
    },
    heli: {
      mode: 'rescue',                    // helicopter diverted from suppression to rescue
      target: 'civilian_extraction',
      suppressionSuspended: true,
    },
    engines: {
      mode: 'rescue_escort',             // engines escort civilians out
      waterForSelfProtection: true,      // water used for engine/civilian protection only
    },
    safety: {
      crewRiskAssessment: 'continuous',  // constant assessment of rescue crew safety
      abortTrigger: 'crew_lives_at_risk',
    },
    pio: {
      publicMessage: 'shelter_in_place',
      channels: ['WEA_blast', 'sirens', 'loudspeaker', 'all_media'],
      message: 'SHELTER IN PLACE if you cannot evacuate. Close all windows. Fill bathtubs. Call 911.',
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. AIR OPERATIONS PRIORITY BEHAVIORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AIR_PRIORITY_BEHAVIORS = {

  head: {
    vlat:  { target: 'fire_head', dropType: 'retardant_ahead', priority: 1 },
    seat:  { target: 'flanks', dropType: 'retardant_flank', priority: 2 },
    heli:  { target: 'fire_head_hotspots', dropType: 'water', priority: 1 },
    lead_plane: { target: 'fire_head', role: 'scout_and_mark' },
    atgs:  { airspaceConfig: 'tanker_priority', altitudeSeparation: { vlat: 'high', seat: 'low', heli: 'lowest' } },
    drones: { mode: 'perimeter_deconflict', yieldTo: 'all_manned_aircraft' },
  },

  structures: {
    vlat:  { target: 'structure_perimeter', dropType: 'retardant_line_around_structures', priority: 1 },
    seat:  { target: 'spot_fires_near_structures', dropType: 'retardant_spot', priority: 1 },
    heli:  { target: 'structure_hotspots', dropType: 'water', priority: 1 },
    lead_plane: { target: 'structure_zones', role: 'scout_defensibility' },
    atgs:  { airspaceConfig: 'structure_defense', altitudeSeparation: { vlat: 'high', seat: 'medium', heli: 'low' } },
    drones: { mode: 'structure_assessment', task: 'assess_defensibility_from_air' },
  },

  flanks: {
    vlat:  { target: 'right_flank', dropType: 'retardant_line', priority: 1 },
    seat:  { target: 'left_flank', dropType: 'retardant_line', priority: 1 },
    heli:  { target: 'flank_hotspots', dropType: 'water', priority: 2 },
    lead_plane: { target: 'flanks', role: 'scout_both_flanks' },
    atgs:  { airspaceConfig: 'split_force', altitudeSeparation: { vlat: 'high_right', seat: 'high_left', heli: 'low' } },
    drones: { mode: 'flank_tracking', task: 'monitor_flank_progression' },
  },

  hold: {
    // All aircraft grounded — wind, visibility, TFR, or night
    vlat:  { target: 'none', grounded: true, reason: 'hold_order' },
    seat:  { target: 'none', grounded: true, reason: 'hold_order' },
    heli:  { target: 'none', grounded: true, reason: 'hold_order' },
    lead_plane: { target: 'none', grounded: true },
    atgs:  { airspaceConfig: 'closed', reason: 'hold_order' },
    drones: { mode: 'ground_ops_only', note: 'drones may continue if below TFR altitude and ATGS approves' },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. DRONE MODE BEHAVIORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DRONE_MODE_BEHAVIORS = {

  recon: {
    drones: {
      formation: 'distributed_grid',     // spread across fire area for maximum coverage
      altitude: 400,                     // feet AGL
      sensorMode: 'IR_and_visual',
      reportTo: 'ai_swarm',
      tasks: ['perimeter_mapping', 'spot_fire_detection', 'smoke_column_analysis'],
    },
    ai_swarm: {
      algorithm: 'k_means_coverage',     // K-means clustering for optimal coverage
      rebalanceInterval: 60,             // rebalance fleet every 60s
      priorityZones: 'fire_perimeter',
    },
  },

  safety: {
    drones: {
      formation: 'crew_assigned',        // each drone assigned to a crew/division
      altitude: 200,                     // lower for better crew visibility
      sensorMode: 'IR_thermal',          // thermal to detect heat near crews
      reportTo: 'ai_swarm',
      tasks: ['escape_route_verification', 'heat_detection_near_crews', 'entrapment_warning'],
    },
    ai_swarm: {
      algorithm: 'crew_proximity',
      rebalanceInterval: 15,             // very frequent — following crew movements
      priorityZones: 'crew_positions',
      bypassOverwatch: true,             // SWARM → Safety directly for life safety (per ICS)
    },
  },

  targeted: {
    drones: {
      formation: 'concentrated',          // all drones focused on one area
      altitude: 300,
      sensorMode: 'high_res_IR',
      reportTo: 'ai_swarm',
      tasks: ['detailed_reconnaissance', 'damage_assessment', 'search_for_civilians'],
    },
    ai_swarm: {
      algorithm: 'area_saturation',
      rebalanceInterval: 30,
      priorityZones: 'target_location',
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. NIGHT OPERATIONS BEHAVIORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const NIGHT_OPS_BEHAVIORS = {

  authorized: {
    // Night ops approved — reduced tempo, higher safety
    safety: {
      alertLevel: 'high',
      lcesCheckInterval: 10,
      additionalRisks: ['reduced_visibility', 'fatigue', 'terrain_hazards', 'falling_trees'],
      mandatoryBriefing: true,           // all crews briefed on night-specific risks
    },
    ops_chief: {
      resourceCommitment: 'reduced',     // fewer crews on line at night
      reservePercentage: 0.35,
    },
    hotshots: {
      workIntensity: 'low',
      mode: 'mop_up_and_hold',          // hold line, mop up, don't extend
      lightingRequired: true,            // headlamps, vehicle lights
    },
    engines: {
      mode: 'patrol_and_hold',          // patrol fireline, hit flare-ups
      spacing: 'close',                  // stay close for mutual support
    },
    heli: { mode: 'grounded', note: 'most helicopter ops cease at night unless equipped for NVG' },
    vlat: { mode: 'grounded', note: 'fixed-wing tankers do not fly at night' },
    seat: { mode: 'grounded' },
    drones: {
      mode: 'IR_overwatch',             // drones with IR are MORE useful at night
      formation: 'perimeter_track',
      sensorMode: 'IR_only',            // thermal contrast is better at night
    },
    ai_predict: {
      note: 'fire behavior often changes at night — lower temp, higher RH, wind dies, inversion layers',
      scenarioFocus: 'overnight_recovery_vs_persistence',
    },
  },

  cancelled: {
    // No night ops — all crews pulled to safety zones
    safety: { mandatoryWithdrawal: true },
    ops_chief: { resourceCommitment: 'none' },
    hotshots: { mode: 'rest', location: 'fire_camp' },
    hand_crew: { mode: 'rest', location: 'fire_camp' },
    engines: { mode: 'staged', location: 'staging_area' },
    dozer: { mode: 'staged' },
    drones: {
      mode: 'autonomous_patrol',         // drones can fly all night uncrewed
      formation: 'perimeter_track',
      sensorMode: 'IR_only',
      alertOn: 'breakout_or_slopover',   // alert IC if fire escapes line overnight
    },
    ai_predict: {
      mode: 'continuous',                // prediction doesn't sleep
      alertOn: 'unexpected_fire_growth',
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. SAFETY STOP BEHAVIORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SAFETY_STOP_BEHAVIORS = {

  none: {
    // Normal operations
    allAgents: { stopped: false },
  },

  all: {
    // FULL STOP — every crew ceases operations immediately
    // Only Safety Officer or IC can issue
    trigger: 'safety_officer_or_ic',
    allTactical: {
      action: 'CEASE_ALL_OPERATIONS',
      movement: 'TO_SAFETY_ZONE',
      toolsDown: true,
      radioCheck: true,                  // all crews check in on radio
      headcount: true,                   // division supervisors verify headcount
    },
    engines: { action: 'STOP', enginesIdling: true, crewInCab: true },
    hotshots: { action: 'STOP', moveToSafetyZone: true, headcount: true },
    hand_crew: { action: 'STOP', moveToSafetyZone: true, headcount: true },
    dozer: { action: 'STOP', engineOff: false, operatorInCab: true },
    heli: { action: 'ORBIT_SAFE_ALTITUDE', doNotLand: true },
    firingOps: { action: 'CEASE_ALL_FIRING', noExceptions: true },
    resumeCondition: {
      lcesReconfirmed: true,             // every crew reconfirms LCES
      safetyOfficerApproval: true,       // Safety Officer must clear
      icApproval: true,                  // IC must approve resumption
    },
  },

  // Division-specific stop (e.g., wind shift only affects Div Alpha)
  division: {
    trigger: 'safety_officer',
    affectedDivision: null,              // set to 'div_alpha' or 'div_bravo'
    affectedResources: {
      action: 'CEASE_OPERATIONS_IN_DIVISION',
      movement: 'TO_DIVISION_SAFETY_ZONE',
    },
    unaffectedResources: {
      action: 'CONTINUE_WITH_CAUTION',
      alertLevel: 'elevated',
    },
    resumeCondition: {
      lcesReconfirmed: true,
      safetyOfficerApproval: true,
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. RESOURCE MANAGEMENT BEHAVIORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const RESOURCE_BEHAVIORS = {

  crewRotation: {
    // NWCG work-rest standards
    thresholds: {
      warningHours: 14,                  // hours — alert IC, plan rotation
      maxHours: 16,                      // hours — MANDATORY rest
      restRatio: 2,                      // 2:1 work-to-rest (8 hrs work = 4 hrs rest min)
      mandatoryRestHours: 8,             // minimum rest period
    },
    hotshots: {
      atWarning: {
        safety: 'ALERT_IC',
        ai_deploy: 'FIND_REPLACEMENT',
        ops_chief: 'PLAN_HANDOFF',
      },
      atMax: {
        safety: 'MANDATORY_STOP',
        action: 'RETREAT_TO_CAMP',
        noExtensionUnless: 'life_safety_emergency',
      },
    },
    hand_crew: {
      // Same thresholds, same protocol
      atWarning: { safety: 'ALERT_IC', ai_deploy: 'FIND_REPLACEMENT' },
      atMax: { safety: 'MANDATORY_STOP', action: 'RETREAT_TO_CAMP' },
    },
    engines: {
      // Engine crews can swap drivers but truck stays on line
      atWarning: { action: 'CREW_SWAP_IF_AVAILABLE' },
      atMax: { action: 'RETURN_TO_STAGING' },
    },
  },

  crewExtension: {
    // IC authorizes extension beyond 14hr guideline (NOT beyond 16hr)
    authorization: 'incident_commander',
    maxExtensionHours: 2,                // can extend from 14 to 16
    conditions: [
      'No replacement crew available',
      'Crew is on critical assignment (holding line, protecting structures)',
      'Conditions are expected to improve within extension period',
    ],
    safetyOfficerCanOverride: true,      // Safety can cancel extension if conditions worsen
    ai_deploy: {
      action: 'TRACK_EXTENSION',
      alertAt: 'extension_end',
      findReplacementParallel: true,     // keep looking for replacement during extension
    },
  },

  mutualAid: {
    // Formal request through IROC for additional resources
    authorization: 'incident_commander',
    triggers: [
      'Resources insufficient for current objectives',
      'Incident type escalation',
      'Predicted conditions exceed current capability',
      'Crew fatigue requiring mass rotation',
    ],
    iroc: {
      action: 'PROCESS_REQUEST',
      trackETA: true,
      confirmAvailability: true,
      costEstimate: true,
    },
    fin_chief: {
      action: 'PROJECT_COST',
      reportTo: 'ic',
    },
    log_chief: {
      action: 'PREPARE_STAGING',
      tasks: ['staging_area', 'comms_frequencies', 'food_water', 'sleeping_areas'],
    },
    liaison: {
      action: 'COORDINATE_AGENCIES',
      tasks: ['mutual_aid_agreements', 'jurisdiction_briefings', 'frequency_sharing'],
    },
  },

  staging: {
    // Pre-position resources at strategic locations
    ai_deploy: {
      algorithm: 'predictive_staging',   // stage based on AI PREDICT fire projection
      factors: ['predicted_fire_spread', 'structure_density', 'road_access', 'water_supply'],
      restageInterval: 15 * 60,          // re-evaluate staging every 15 min
    },
    ops_chief: {
      approve: true,                     // Ops Chief approves staging locations
    },
    res_unit: {
      track: true,                       // Resources Unit tracks all staged resources
      statusBoard: 'update_continuously',
    },
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHONE COMMAND → STRATEGY STATE MAPPING
//
// This maps OpenClaw text commands to strategy state changes.
// Each command returns the state changes to apply to engine.strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PHONE_COMMANDS = {
  // ── Overall Strategy ──
  'strategy offensive':   { posture: 'offensive' },
  'strategy defensive':   { posture: 'defensive' },
  'strategy confine':     { posture: 'confine' },
  'strategy transition':  { posture: 'transition' },

  // ── Attack Mode ──
  'attack direct':        { attackMode: 'direct' },
  'attack parallel':      { attackMode: 'parallel' },
  'attack indirect':      { attackMode: 'indirect' },
  // 'attack anchor [loc]' handled dynamically

  // ── Firing Ops ──
  'fire burnout':         { firingAuth: 'burnout' },
  'fire backfire':        { firingAuth: 'backfire', firingApprovedBy: 'ic' },
  'fire cancel':          { firingAuth: 'none', firingTarget: null },

  // ── Structure Protection ──
  'struct triage':        { structMode: 'triage' },
  'struct protect':       { structMode: 'protect' },
  'struct abandon':       { structMode: 'abandon' },
  'struct bump-and-run':  { structMode: 'bump-and-run' },

  // ── Evacuation (zone is appended dynamically) ──
  'evac advisory':        (zone) => ({ evacZones: { [zone]: 'advisory' } }),
  'evac warning':         (zone) => ({ evacZones: { [zone]: 'warning' } }),
  'evac order':           (zone) => ({ evacZones: { [zone]: 'order' } }),
  'evac rescue':          (zone) => ({ evacZones: { [zone]: 'rescue' } }),
  'evac lift':            (zone) => ({ evacZones: { [zone]: 'lifted' } }),

  // ── Air Ops ──
  'air priority head':        { airPriority: 'head' },
  'air priority structures':  { airPriority: 'structures' },
  'air priority flanks':      { airPriority: 'flanks' },
  'air hold':                 { airPriority: 'hold' },
  'air medevac':              { medevacActive: true },

  // ── Drone Mode ──
  'drone recon':          { droneMode: 'recon' },
  'drone safety':         { droneMode: 'safety' },
  // 'drone recon [loc]' handled dynamically

  // ── Resource Management ──
  'crew rotate hotshots':     (hrs) => ({ crewExtensions: { hotshots: null } }),
  'crew extend hotshots':     (hrs) => ({ crewExtensions: { hotshots: { authorized: true, hours: hrs || 2 } } }),
  'mutual aid':               { mutualAidRequested: true },

  // ── Planning ──
  'iap approve':          { iapStatus: 'approved' },
  'night ops approve':    { opsNight: true },
  'night ops cancel':     { opsNight: false },

  // ── Safety ──
  'safety stop all':      { safetyStop: 'all', lcesRequired: true },
  'safety stop':          (div) => ({ safetyStop: div, lcesRequired: true }),
  'safety resume':        { safetyStop: 'none', lcesRequired: false },
  'lces check':           { lcesRequired: true },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRATEGY RESOLVER
//
// Given the current engine.strategy state, resolves the complete behavior
// set for any agent by merging posture + attack + firing + struct + evac + air + drone
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function resolveAgentBehavior(agentId, strategy) {
  const s = strategy || DEFAULT_STRATEGY;
  const behavior = {};

  // Layer 1: Posture (base behavior)
  const postureBehavior = POSTURE_BEHAVIORS[s.posture];
  if (postureBehavior?.[agentId]) {
    Object.assign(behavior, postureBehavior[agentId]);
  }

  // Layer 2: Attack mode (overrides placement and tactics for tactical agents)
  const attackBehavior = ATTACK_MODE_BEHAVIORS[s.attackMode];
  if (attackBehavior?.[agentId]) {
    Object.assign(behavior, attackBehavior[agentId]);
  }

  // Layer 3: Firing operations (overrides firing-related fields)
  const firingBehavior = FIRING_BEHAVIORS[s.firingAuth];
  if (firingBehavior?.[agentId]) {
    Object.assign(behavior, firingBehavior[agentId]);
  }

  // Layer 4: Structure protection mode
  const structBehavior = STRUCTURE_BEHAVIORS[s.structMode];
  if (structBehavior?.[agentId]) {
    Object.assign(behavior, structBehavior[agentId]);
  }

  // Layer 5: Air priority
  const airBehavior = AIR_PRIORITY_BEHAVIORS[s.airPriority];
  if (airBehavior?.[agentId]) {
    Object.assign(behavior, airBehavior[agentId]);
  }

  // Layer 6: Drone mode
  const droneBehavior = DRONE_MODE_BEHAVIORS[s.droneMode];
  if (droneBehavior?.[agentId]) {
    Object.assign(behavior, droneBehavior[agentId]);
  }

  // Layer 7: Night ops
  if (s.opsNight) {
    const nightBehavior = NIGHT_OPS_BEHAVIORS.authorized;
    if (nightBehavior?.[agentId]) {
      Object.assign(behavior, nightBehavior[agentId]);
    }
  }

  // Layer 8: Safety stop (highest priority — overrides everything)
  if (s.safetyStop === 'all') {
    const stopBehavior = SAFETY_STOP_BEHAVIORS.all;
    if (stopBehavior?.[agentId]) {
      Object.assign(behavior, stopBehavior[agentId]);
    }
    // Apply allTactical to tactical agents
    const tier = agentId && ['engines','hotshots','hand_crew','dozer','vlat','seat','heli','tender','struct_eng','atgs','drones','traffic','lead_plane'].includes(agentId);
    if (tier && stopBehavior.allTactical) {
      Object.assign(behavior, stopBehavior.allTactical);
    }
  }

  // Layer 9: LCES check flag
  if (s.lcesRequired) {
    behavior.lcesRequired = true;
  }

  return behavior;
}
