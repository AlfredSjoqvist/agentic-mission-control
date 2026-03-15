# ICS Wildfire Command Chain — Autonomous Agent Simulation

## Overview

A fully autonomous agent-based simulation of the real Incident Command System (ICS) wildfire response chain. Every ICS actor is an independent agent that makes decisions based on what it observes and the messages it receives. The only hardcoded data is the fire physics (ignition point, spread model, wind, terrain). Everything else — detection, dispatch, command chain, resource deployment, evacuations — emerges from agent decisions.

Hosted at: `http://localhost:4445` (via `npx serve ics-graph`)

---

## Architecture

### Fire Physics Model (hardcoded)

```javascript
const FIRE = {
  origin: {x: 0.62, y: 0.38},        // Normalized 0-1 coordinates (canyon NE of community)
  wind: {dir: 225, speed: 18, gustSpeed: 28},  // SW wind, 18mph sustained, 28mph gusts
  slope: 15,                            // degrees
  fuelMoisture: 3,                      // 10-hr fuel moisture % (critically dry)
  temp: 94, rh: 8,                      // Fahrenheit, relative humidity %
  community: {x: 0.42, y: 0.22, name: 'Oak Ridge', pop: 1200, structures: 180},
  windShiftTime: 70*60,                 // Wind shifts to NW at T+70 min
  windShiftDir: 315, windShiftSpeed: 22, windShiftGust: 35
}
```

**Spread model:** Simplified Rothermel equation with Huygens wavelet elliptical propagation:
- `ROS = R0 * (1 + phiWind + phiSlope) * moistureDamping`
- Head moves at full ROS, flanks at 30%, rear at 5%
- 16-point perimeter grows each tick
- Spot fires generated probabilistically when ROS > 25 ch/hr
- Area calculated via shoelace formula, converted to acres
- Containment factor reduces spread where crews are working

---

### Agent System

Each of the ~45 ICS nodes is an autonomous agent with:

```javascript
agents[id] = {
  active: false,           // Whether this agent is in the simulation
  cooldown: 0,             // Seconds until next decision tick
  tickInterval: 5-30,      // How often this agent "thinks" (varies by role)
  inbox: [],               // Messages received from other agents
  state: {},               // Agent-specific state (lastReport, workStart, eta, etc.)
  sent: {}                 // Deduplication — tracks what this agent already reported
}
```

**Message passing:**
```javascript
agentSend(fromId, toId, messageText, type)
// type: 'command' | 'intel' | 'coord' | 'ai' | 'safety'
// - Activates receiver if not already active
// - Adds to receiver's inbox
// - Spawns visual particle on the graph
// - Logs to message feed with timestamp
```

---

### ICS Phase Transitions (emergent, not scripted)

Phases transition based on fire conditions, not timers:

| Phase | Trigger | Incident Type | What Activates |
|-------|---------|---------------|----------------|
| **Standby** | Start | — | External sensors only |
| **Initial Attack** | Dispatch sends IC assignment | Type 4 | IC, Safety, Engines, Heli, Tender (with ETAs) |
| **Extended Attack** | Fire > 10 acres | Type 3 | Ops Chief (separate person), Plan Chief, FBAN, Fire Branch, Air Ops, Div Alpha, ATGS, AI agents, Drones, Hotshots/Dozer/VLAT/SEAT/Hand Crew (with ETAs) |
| **Crisis / Type 1** | Structures threatened > 20 OR wind shift | Type 2 | PIO, LE Branch, Struct Group, Struct Engines, AI EVAC, Genasys, Traffic, Div Bravo |
| **Full ICS** | Fire > 40 acres | Type 1 | Log Chief, Fin Chief, IROC, Comms, Medical, Liaison, Resources Unit, NWS |

---

### Node Definitions (45 agents)

#### Command Tier (4)
| ID | Label | Role |
|----|-------|------|
| `ic` | Incident Commander | Overall authority. Sets objectives. Approves IAP and evacuation. In IA, also acts as Ops Chief. |
| `safety` | Safety Officer | IMMEDIATE STOP AUTHORITY. Checks 10 Standard Firefighting Orders + 18 Watch Out Situations. Can bypass chain of command for life safety. |
| `pio` | Public Info Officer | Media coordination. Community alerts. Press briefings. |
| `liaison` | Liaison Officer | Multi-agency coordination. County OES, Red Cross, utilities. |

#### General Staff (4)
| ID | Label | Role |
|----|-------|------|
| `ops_chief` | Operations Section Chief | Manages ALL tactical ops. Only activates as separate person in EA+. Delegates to Fire Branch → Divisions → Tactical. |
| `plan_chief` | Planning Section Chief | Runs P-meeting. Drafts IAP (12-24hr periods). Tasks FBAN + Sit Unit. |
| `log_chief` | Logistics Section Chief | Comms infrastructure, medical, supply chain, IROC ordering. |
| `fin_chief` | Finance/Admin Chief | Cost tracking. Projects burn rate at $X/hr. |

#### Branches/Divisions (11)
| ID | Label | Role |
|----|-------|------|
| `fire_branch` | Fire Suppression Branch | Directs ground/air suppression. Relays division sitreps UP to Ops Chief. |
| `air_ops` | Air Operations Branch | Coordinates all aircraft. Relays SWARM deconfliction to ATGS. |
| `div_alpha` | Division Alpha (Head) | Assigns hotshots for burnout, engines for direct attack. Reports to Fire Branch. |
| `div_bravo` | Division Bravo (Flanks) | Hand crew fireline, dozer firebreak on east flank. Tracks containment progress. |
| `struct_group` | Structure Protection Group | Triage: defensible/marginal/non-defensible. Assigns struct engines. |
| `sit_unit` | Situation Unit | Maintains situation display. Maps, perimeter data compilation. |
| `fban` | Fire Behavior Analyst | Runs spread models. Reports ROS, flame length, crown fire risk. Requests NWS spot forecast. |
| `res_unit` | Resources Unit | Tracks status of all assigned resources. |
| `le_branch` | Law Enforcement Branch | Door-to-door evacuation. Traffic control. Zone enforcement. |
| `comms` | Communications Unit | P25 gateway bridging CAL FIRE VHF, county UHF, federal 800MHz. |
| `medical` | Medical Unit | ALS ambulance at staging. Medevac standby. |

#### Tactical Resources (14)
| ID | Label | Role | ETA |
|----|-------|------|-----|
| `engines` | Type 3 Engines (×3) | Direct attack with hose lines. Pump-and-roll. | 8 min |
| `hotshots` | Hotshot Crew (IHC) | 20-person elite. Burnout/backfire. Tracks work hours (NWCG 16hr max). | 10-30 min |
| `hand_crew` | Type 2 Hand Crew | 20-person. Manual fireline, mop-up. | 10-30 min |
| `dozer` | Dozer (Cat D8) | 10-20ft firebreak. 6 chains/hour. | 10-30 min |
| `vlat` | VLAT DC-10 | 11,600gal Phos-Chek. Drops AHEAD of fire. 35min turnaround. | 10-30 min |
| `seat` | SEAT Air Tractor | 800gal retardant. Fast turnaround. Flanks. | 10-30 min |
| `lead_plane` | Lead Plane | Scouts drop zone, marks with smoke, guides tanker approach. | 10-30 min |
| `heli` | Helitack (Chinook) | 2,600gal Bambi Bucket. Cools hot spots. | 12 min |
| `tender` | Water Tender | 4,000gal. Shuttles water to engines. | 6 min |
| `struct_eng` | Structure Engine | Gel coating, foam, sprinklers. Bump-and-run. | with crisis |
| `atgs` | Air Tactical (OV-10A) | Flies at 2000ft. Directs all air ops. Override on drones. | with EA |
| `drones` | UAS Fleet (×12) | ISR, ember spotters, comms relay, safety overwatch. | with EA |
| `traffic` | Traffic Control | Contraflow, intersection management. | with crisis |

#### External Sensors (8 — always on or auto-activated)
| ID | Label | Role | Tick Interval |
|----|-------|------|---------------|
| `alert_cam` | ALERTCalifornia | AI cameras. 360° sweep every 2min. Detects smoke at >0.15 acres + 2min delay. | 2s |
| `satellite` | GOES/VIIRS | Geostationary + polar-orbiting. Confirms hot spots, FRP. | 8s |
| `raws` | RAWS Weather | Auto-broadcasting. Wind, temp, RH, fuel moisture every 10min. Detects wind shift. | 10s |
| `dispatch` | CAD / Dispatch | Receives detections → dispatches IA resources with ETAs. | 3s |
| `iroc` | IROC Ordering | Interagency resource ordering. Confirms ETAs for mutual aid. | 20s |
| `genasys` | Genasys Protect | Zone-based WEA alerts, reverse-911. Reports delivery coverage. | 20s |
| `firis` | FIRIS Aerial IR | Maps fire perimeters from air. Reports to Sit Unit. | 25s |
| `nws` | NWS Spot Forecast | Responds to FBAN requests. Wind shift timing, red flag warnings. | 30s |

#### AI Agents (5 — FireSight augmentation)
| ID | Label | Augments | Key Behavior |
|----|-------|----------|--------------|
| `ai_overwatch` | OVERWATCH | Planning Section | Synthesizes all agent inputs. Generates Decision Points for IC. Living IAP. Conflict detection. 10 Orders verification. |
| `ai_predict` | PREDICT | FBAN | Continuous Rothermel ensemble (50 scenarios). 15min/1hr/3hr predictions. Confidence decay. Auto-calibrates from drone IR. |
| `ai_swarm` | SWARM | Air Ops / ATGS | K-means drone fleet management. TFR deconfliction. Crew safety overwatch. BYPASSES OVERWATCH for life safety. |
| `ai_evac` | EVAC | LE Branch | Zone threat classification (CLEAR→ADVISORY→WARNING→ORDER→RESCUE). Vulnerable population tracking. Route bottleneck detection. |
| `ai_deploy` | DEPLOY | Ops Chief + Logistics | Resource optimization. Pre-positioning based on predictions. 10 Orders check (alerts Safety, doesn't block). Crew fatigue tracking. Mutual aid triggers. |

---

### Information Flow Rules (ICS-compliant)

**Command flows DOWN:**
```
IC → Ops Chief → Fire Branch → Division Alpha → Hotshots
IC → Ops Chief → Air Ops → ATGS → VLAT
IC → Plan Chief → FBAN
IC → Log Chief → Comms
IC → LE Branch → Traffic
```

**Intel flows UP:**
```
Engines → Div Alpha → Fire Branch → Ops Chief → IC
Drones → AI SWARM → AI OVERWATCH → IC
RAWS → FBAN → Plan Chief → IC
Satellite → Sit Unit → Plan Chief → IC
```

**Safety bypasses chain:**
```
Safety Officer → [ANY crew directly] (STOP ORDERS)
AI SWARM → Safety Officer (crew safety overwatch — bypasses OVERWATCH)
Drones → Safety Officer (escape route verification)
```

**AI augmentation (parallel, not replacement):**
```
AI PREDICT → FBAN (augments, doesn't replace human analyst)
AI PREDICT → AI EVAC (fire prediction feeds zone threat calc)
AI PREDICT → AI DEPLOY (fire prediction feeds resource positioning)
AI DEPLOY → Safety Officer (10 Orders alerts — Safety decides to stop or not)
AI DEPLOY → Ops Chief (recommendations — Ops Chief approves/denies)
AI OVERWATCH → IC (Decision Points — IC makes final call)
```

---

### Key Realism Features

1. **IC/Ops Chief Role Merge in IA** — In Initial Attack, the IC directly commands tactical resources. A separate Ops Chief is only assigned when transitioning to Extended Attack.

2. **Resource ETAs** — Resources are dispatched but must travel. Engines (8min), Heli (12min), Tender (6min), Hotshots/VLAT (10-30min). They can't operate until ETA passes.

3. **Safety Officer Stop Authority** — Safety can issue STOP ORDERS directly to any crew, bypassing the entire chain of command. This is ICS protocol — Safety is the only position with this authority.

4. **Crew Fatigue (NWCG)** — Hotshots track actual work hours. At 14h: escalate to IC for rotation. At 16h: MANDATORY rest (2:1 work-rest ratio per NWCG standards).

5. **Detection Delay** — Fire must burn 2+ minutes and reach >0.15 acres before ALERTCalifornia cameras detect smoke. Realistic per 38% pre-911 detection rate.

6. **Wind Shift Cascade** — RAWS detects wind shift → alerts FBAN + AI PREDICT → Safety issues STOP ORDERS → all crews recheck LCES → AI PREDICT recalculates predictions → AI EVAC recalculates zone threats → OVERWATCH generates Decision Point for IC.

7. **Intel Chain Relay** — Tactical units report to Division Supervisors, who report to Branch Directors, who relay to Ops Chief, who briefs IC. Fire Branch explicitly relays division sitreps upward.

8. **10 Standard Firefighting Orders** — AI DEPLOY checks orders for every assignment. Failures are routed to Safety Officer (who has stop authority), not directly blocking operations.

9. **Planning Cycle** — Plan Chief drafts IAP for IC approval, not continuous informal briefs. Tasks FBAN and Sit Unit on activation.

10. **Spot Fire Detection by Drones** — Drones autonomously detect spot fires via IR and report to AI SWARM, who alerts AI OVERWATCH and AI PREDICT for model recalibration.

---

### Visual Rendering

- **Force-directed graph layout** with tier-based gravity bands (command at top, external at bottom, AI on right)
- **Nodes** start dimmed, light up when first message activates them
- **Edges** appear between nodes that have communicated
- **Particles** flow along edges showing message direction and type (color-coded)
- **Fire map** (bottom-center) shows fire perimeter, community location, spot fires
- **Message log** (bottom-right) shows timestamped messages with sender/receiver
- **Stats panel** (top-right) shows fire acres, ROS, containment, active agents, ICS phase, wind, structures at risk
- **Banner** announces major events (detection, dispatch, escalation, wind shift)
- **Controls**: Play/Pause, Reset, Speed slider (0.1x–10x)
- **Tooltips** on hover show agent role, status, and recent inbox messages
- **Draggable nodes**

---

### File Structure

```
ics-graph/
  index.html          — Complete self-contained simulation (HTML + CSS + JS, ~1400 lines)
  ARCHITECTURE.md     — This file
```

### How to Merge with Map Interface

The key data structures to extract for a map overlay:

1. **FIRE object** — Has `perimeter[]` (array of {x,y} normalized coords), `origin`, `community`, `spots[]`, `area`, `ros`, `containment`, `windShifted`

2. **agents object** — `agents[id].active`, `agents[id].inbox`, `agents[id].state` for each ICS actor

3. **litNodes Set** — Which agents are currently active in the simulation

4. **AGENT_TICK object** — The decision logic for each agent type. Each function takes `(agentState, dt)` and calls `agentSend()` to communicate.

5. **agentSend(from, to, msg, type)** — The message passing function. Hook into this to show messages on the map.

6. **FIRE.tick(dt, simTime)** — Call this each frame to advance fire physics.

7. **icsPhase** — Current phase: 'standby' | 'initial' | 'extended' | 'crisis' | 'full'

To integrate: extract the `FIRE`, `NODES`, `agents`, `AGENT_TICK`, `agentSend`, and simulation loop into a shared JS module. The map interface renders the geographic view while the graph interface renders the organizational view. Both share the same agent state.
