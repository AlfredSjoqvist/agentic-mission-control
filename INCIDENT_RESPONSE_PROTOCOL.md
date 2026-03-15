# FireSight — Incident Response Protocol & Agentic Architecture

## Complete Documentation of How the System Works

This document describes the full incident response protocol implemented in FireSight, how the 5 AI agents operate, what was learned during development, and exactly how every piece fits together.

---

## 1. System Architecture Overview

FireSight has 4 interconnected layers:

| Layer | File | Purpose |
|-------|------|---------|
| **Fire Physics** | `fireSpreadEngine.js` | Rothermel cellular automata on 256x256 grid (~95m/cell). Fuel models, wind/slope, ember generation, retardant, suppression. |
| **ICS Protocol Engine** | `icsEngine.js` | 45 autonomous agents following NWCG ICS protocol. Message bus, phase cascade, decision queue. |
| **Tactical Simulation** | `TerrainScene.jsx` | Google Maps overlay. 24 drones, 12+ ground units, road pathfinding, fire ops visualization, suppression feedback loop. |
| **Command Interface** | `App.jsx` + `AgentPanel.jsx` | 4 AI agent panels (Pyro/Swarm/Evac/Deploy), decision approval queue, live metrics. |
| **ICS Visualization** | `ics-graph.html` | Force-directed graph of 75 ICS nodes with message particles, connected via postMessage bridge. |

---

## 2. The Incident Response Protocol (Step by Step)

### Phase 0: PATROL (Pre-Incident)
- **6 drones** patrol autonomously from ICP (Pepperdine University staging area)
- Scout drones (Skydio X10, DJI M30T) fly figure-8 scan patterns
- Mapper drone (senseFly eBee X) flies systematic lawnmower grid
- Comms relay holds station at altitude
- MQ-9 Reaper orbits at 25,000ft for wide-area surveillance
- All 12 ground units staged at real LAFD/LACoFD stations
- **User clicks map to ignite fire** → fire begins spreading via Rothermel physics

### Phase 1: DETECTION
- Every frame, each launched drone with thermal capability checks its sensor range (18 cells / ~1.7km)
- When ANY drone sees a BURNING cell:
  - `fireDetected = true`
  - Event: "D-XX (dtype) THERMAL ALERT — fire detected!"
  - Event: "INCIDENT DECLARED. 5 AI agents online."
  - ICS Engine activates: sensors come online (ALERTCalifornia, GOES/VIIRS, RAWS)
  - Dispatch (CAD) receives alert and begins initial dispatch

### Phase 2: INITIAL ATTACK (Response Level 2)
**Trigger**: `getResponseLevel() >= 2` — fire confirmed, acres >= 2, actively spreading

**What happens**:
- **ICS Engine**: IC assumes command, activates Safety Officer
- **3 Fire Engines** (E-69A/B from LAFD Stn 69, E-23 from LAFD Stn 23) dispatch via road pathfinding
  - Event: "DECISION: Fire confirmed X acres, ROS Y ch/hr → dispatching 3 engines"
  - Engines navigate road waypoint network (Sunset Blvd, Topanga Canyon, PCH)
  - At destination: engines scan 5-cell radius for burning cells, suppress probabilistically
- **Water Tender** (WT-71 from LACoFD Stn 71) dispatches when acres >= 5
- **Helicopter** (H-1 CH-47D Chinook from SMO) scrambles when fronts > 20 OR ROS > 2.0
  - Orbits fire, drops 2,600gal Bambi Bucket on leading edge every 6 seconds
  - Actually suppresses 3x3 grid of burning cells on each drop
- **Additional drones** launch from stash: formula = `6 + ceil(acres/15) + ceil(fronts/25) + spots*2`
- **AI_PREDICT**: Publishes ROS, wind analysis, spotting risk, 50-scenario ensemble forecast

### Phase 3: EXTENDED ATTACK (Response Level 3)
**Trigger**: `getResponseLevel() >= 3` — composite score > 25 (typically 15+ acres, ROS > 1.5)

**What happens**:
- **ICS Engine**: Ops Chief, Planning Chief, Fire Branch, Air Ops, FBAN activated
- **AI agents come online**: OVERWATCH, PREDICT, SWARM, EVAC, DEPLOY
  - Banner: "FIRESIGHT AI AGENTS ONLINE"
- **Lead Plane** (LP-1 OV-10A Bronco) for aerial coordination
- **Hand Crews** (HC-2, HC-5 — 20 personnel each) hike to flanks at 2.5mph
  - Build fireline: `buildFireline()` creates RETARDANT cells perpendicular to wind
- **SEAT** (SE-1 AT-802, 800gal) retardant drops on flanks
  - `applyRetardant()` creates retardant cells that reduce spread by 95%
- **Dozer** (DZ-1 Cat D8T) cuts 15ft firebreak ahead of fire
  - `buildFireline()` with width=2 creates wide retardant barrier
- **Hotshot Crew** (IHC-8, 20 elite) for indirect burnout when ROS > 1.0
- **Mutual aid**: Extra engines and helicopters scale with fire size

### Phase 3.5: AI DECISION PROPOSALS (Human-in-the-Loop)
**This is the key "Agentic Mission Control" feature.**

When conditions warrant, AI agents propose decisions that appear in the **Decision Queue** overlay:

1. **AI_DEPLOY: Pre-stage engines** — When wind > 18mph, proposes repositioning engines to protect threatened community
   - Urgency: HIGH (auto-approve in 40s)
   - Commander clicks APPROVE → engines reposition to east flank

2. **AI_EVAC: Mandatory evacuation** — When fire ETA < 25min to warning zone
   - Urgency: CRITICAL (auto-approve in 20s)
   - Commander clicks APPROVE → Genasys WEA + reverse-911 sent

3. **AI_OVERWATCH: VLAT request** — When ground suppression insufficient
   - Urgency: HIGH (auto-approve in 40s)
   - Commander clicks APPROVE → DC-10 VLAT (11,600gal) dispatched, retardant line established

4. **AI_SWARM: Spot fire recon** — When new spot fires detected
   - Urgency: MEDIUM/HIGH based on count
   - Commander clicks APPROVE → 3 scout drones vectored to investigate

**Auto-approve**: If commander doesn't respond within timeout, safety-critical decisions execute automatically (real ICS pattern).

### Phase 4: CRISIS (Response Level 4)
**Trigger**: `getResponseLevel() >= 4` — composite score > 60 (typically 40+ acres, structures threatened)

**What happens**:
- **ICS Engine**: PIO, Law Enforcement, Structure Protection, Evacuation activated
- **Structure Engine** (SP-19) dispatches to nearest threatened population zone
  - Event: "DECISION: Fire X cells from Pacific Palisades (2,847 residents) → SP-19 for structure triage"
- **Evacuation cascade** (AI_EVAC driven):
  - Distance < 50 cells: ADVISORY issued (green)
  - Distance < 35 cells: WARNING — prepare to evacuate (yellow). 3 routes activated.
  - Distance < 20 cells: MANDATORY EVACUATION (red). Genasys WEA + reverse-911.
  - Route monitoring: R3 Topanga Canyon BLOCKED when fire < 15 cells. R2 PCH congested.
  - Evacuation progress: 0.5%/sec warning, 1.5%/sec mandatory

### Phase 5: FULL ICS (Response Level 5)
**Trigger**: `getResponseLevel() >= 5` — composite score > 120 (typically 100+ acres)

**What happens**:
- **ICS Engine**: Logistics, Finance, IROC, Communications, Medical activated
- **Full mutual aid** requested via IROC
- **Escalation event**: "ESCALATED to Type 1 Incident. X acres, Level 5 threat."
- **Crew safety**: If hotshots within 10 cells of fire at 100+ acres → automatic withdrawal
  - "SAFETY OVERRIDE: IHC-8 WITHDRAWING — fire overrun risk. LCES compromised."

---

## 3. The 5 AI Agents

### AI_OVERWATCH (Orchestrator)
- **Role**: Living Common Operating Picture. Synthesizes all threats, generates decision points.
- **Actions**: Proposes VLAT requests, escalation recommendations, validates AI_DEPLOY positioning.
- **ICS Node**: `ai_overwatch` (pink, tier: ai)

### AI_PREDICT (Fire Behavior)
- **Role**: Continuous fire behavior analysis. 50-scenario ensemble predictions.
- **Actions**: Publishes ROS, wind analysis, spotting risk. 1h/3h growth projections. Periodic updates at 30-acre intervals.
- **Output format**: "ANALYSIS: ROS 2.4 ch/hr, Wind 25mph @ 315°, 42 active fronts. Threat Level 4/5."
- **ICS Node**: `ai_predict` (pink, tier: ai)

### AI_SWARM (Drone Fleet)
- **Role**: K-means drone clustering, fleet scaling, spot fire investigation.
- **Actions**: Launches drones from reserve based on fire size. Reassigns to clusters every 4 seconds. Proposes spot fire recon missions.
- **Scaling formula**: `min(24, 6 + ceil(acres/15) + ceil(fronts/25) + spots*2)`
- **ICS Node**: `ai_swarm` (pink, tier: ai)

### AI_EVAC (Evacuation)
- **Role**: Zone threat classification, route optimization, vulnerable population tracking.
- **Actions**: Distance-based zone escalation (advisory → warning → order). ETA calculation. Route blocking detection. Contraflow recommendations.
- **Proposes**: Mandatory evacuation decisions for commander approval.
- **ICS Node**: `ai_evac` (pink, tier: ai)

### AI_DEPLOY (Resource Optimizer)
- **Role**: Condition-driven resource dispatch, LCES verification, pre-staging.
- **Actions**: Deploys units based on `getResponseLevel()` composite score. Pre-stages on threatened flanks. 10 Orders check.
- **Proposes**: Engine pre-staging decisions for commander approval.
- **ICS Node**: `ai_deploy` (pink, tier: ai)

---

## 4. The Response Level System

All dispatch decisions are driven by a composite fire behavior score:

```javascript
function getResponseLevel(acres, ros, fronts, spots, windSpeed) {
  const score = (acres * 0.3) + (ros * 10) + (fronts * 0.1) + (windSpeed * 0.5) + (spots * 5);
  if (score > 120) return 5;  // Type 1 Incident — all resources
  if (score > 60)  return 4;  // Crisis — VLAT, structure protection, evacuation
  if (score > 25)  return 3;  // Extended Attack — heavy resources, hotshots, dozers
  if (score > 8)   return 2;  // Initial Attack — engines, heli, tender
  return 1;                    // Size-up — observation only
}
```

**Unit deployment gates by level**:
| Level | Units Available |
|-------|----------------|
| 2 | Engines, Water Tender, Helicopter |
| 3 | + Lead Plane, Hand Crews, SEAT, Dozer, Hotshots, Mutual Aid |
| 4 | + VLAT (via decision queue), Structure Engine |
| 5 | + Full mutual aid scaling, IROC ordering |

---

## 5. Containment Feedback Loop

Units actually affect fire spread (not just visual):

- **Engines**: Scan 5-cell radius for burning cells. Suppress probabilistically: `P = 0.3 * suppRos * simSpeed`
  - `suppressCell(row, col, 0)` converts BURNING → BURNED
- **Hand Crews / Hotshots**: Build fireline perpendicular to wind direction
  - `buildFireline(r1, c1, r2, c2, width, duration)` creates RETARDANT cells via Bresenham line
  - Hotshots: width=1, Hand crews: width=0
- **Dozers**: Cut wide firebreaks (width=2)
- **Helicopters**: 3x3 suppression around leading edge on each water drop
- **SEAT / VLAT**: `applyRetardant()` creates retardant line perpendicular to wind

**Effectiveness scaling**: `suppRos = 1 / (1 + ros * 0.3)` — at high ROS, ground suppression is less effective, reflecting reality.

---

## 6. Communication Architecture

### Map → ICS Graph (postMessage)
Every 30 frames, TerrainScene sends fire state to the ICS graph iframe:
```json
{
  "type": "firesight_fire_state",
  "fireDetected": true,
  "area": 45.2,
  "ros": 2.4,
  "intensity": 6.8,
  "containment": 23,
  "windSpeed": 25,
  "windDirection": 315,
  "threatenedStructures": 1203,
  "spots": [...],
  "windShifted": false,
  "icsPhase": "extended",
  "secSinceDetection": 120
}
```

### ICS Engine → Event Log
ICS agents send messages via `agentSend(from, to, msg, type)`. Recent messages sync to the event log in TerrainScene.

### TerrainScene → AgentPanels (onLiveData)
Every 400ms, live metrics pushed to parent:
```json
{
  "swarm": { "launched": 14, "total": 24, "coverage": 70 },
  "evac": { "totalPop": 8607, "evacuated": 1203, "blocked": 1 },
  "deploy": { "crews": 8, "aircraft": 4 },
  "reasoning": { "swarm": "...", "evac": "...", "deploy": "..." }
}
```

---

## 7. What Was Learned (5 Iterations)

### Iteration 1: Condition-Driven Dispatch
**Problem**: Units deployed on fixed wall-clock timers (5s, 10s, 15s after detection) regardless of fire behavior.

**Solution**: Replaced all timer-based dispatch with `getResponseLevel()` composite score. Units deploy when fire conditions warrant them, not on a schedule.

**Key Learning**: Event messages that explain "DECISION: Fire ROS exceeds 2.0 ch/hr → dispatching engines" are far more compelling to judges than "Dispatching engines" alone. Visible reasoning is what makes it feel agentic.

### Iteration 2: Decision Queue with Human-in-the-Loop
**Problem**: AI agents sent recommendations into the void. No approval/override loop. The "Agentic Mission Control" track specifically requires visible autonomous decisions with commander control.

**Solution**: Added `pendingDecisions` system to ICSEngine with `proposeDecision()`, `approveDecision()`, `overrideDecision()`. DecisionQueue UI overlay shows pending decisions with APPROVE/DENY buttons and auto-approve countdown.

**Key Learning**: The auto-approve timeout for critical decisions (20s) is a real ICS pattern — if the IC doesn't respond, safety-critical items execute automatically. This detail will impress judges who know ICS. The decision queue is the single most important feature for the hackathon track.

### Iteration 3: Containment Feedback Loop
**Problem**: Units fighting fire were visual-only. Engines with hose lines, hand crews building fireline — none actually reduced fire spread.

**Solution**: Added `suppressCell()` and `buildFireline()` to the fire engine. Connected unit positions to suppression actions in the animation loop.

**Key Learning**: Effectiveness must scale with fire intensity. At high ROS, engines barely make a dent (realistic). The `suppRos = 1/(1 + ros * 0.3)` formula creates a natural feedback: small fires get contained by engines, large fires require aerial attack. This creates a compelling narrative arc in the demo.

### Iteration 4: Live Agent Panel Metrics
**Problem**: Side panels showed hardcoded strings ("12/14 drones", "2,847 civilians"). Never updated.

**Solution**: Added `liveData` prop pipeline: TerrainScene → onLiveData callback → App state → AgentPanel. Each panel now shows real-time drone count, civilian count, crew count, aircraft count. Agent reasoning feed shows latest decision text.

**Key Learning**: Live-updating metrics make the difference between a mockup and a real system. Judges will notice if numbers don't change. The reasoning feed ("K-means: 3 clusters detected") makes AI agents feel alive.

### Iteration 5: Polish & Documentation
**Problem**: ICS phase not synced between views. No documentation of how the system works.

**Solution**: Added `icsPhase` to postMessage payload. Removed duplicate VLAT dispatch (now gated by decision queue). Wrote this comprehensive documentation.

**Key Learning**: For the hackathon demo, the narrative matters as much as the tech. Walk judges through: "Fire starts → drones detect it → AI agents come online → they propose decisions → commander approves → units deploy → fire gets contained. All of this is condition-driven, not scripted."

---

## 8. File Map

| File | Lines | What It Does |
|------|-------|-------------|
| `firesight/src/fireSpreadEngine.js` | ~700 | Rothermel fire physics, fuel models, `suppressCell()`, `buildFireline()`, `applyRetardant()` |
| `firesight/src/icsEngine.js` | ~950 | 45 ICS agents, phase cascade, message bus, decision queue (`proposeDecision/approveDecision`) |
| `firesight/src/components/TerrainScene.jsx` | ~1450 | Google Maps overlay, 24 drones, 12+ units, `agentTick()`, `getResponseLevel()`, suppression loop |
| `firesight/src/components/AgentPanel.jsx` | ~730 | 4 AI panels with live data, reasoning feed, action buttons |
| `firesight/src/App.jsx` | ~520 | Layout, DecisionQueue component, state wiring |
| `firesight/public/ics-graph.html` | ~1700 | Force-directed ICS graph with 75 nodes, message particles, postMessage bridge |
| `server/index.js` | ~390 | Express backend, Marble API proxy, grid cache, `/api/log` relay |

---

## 9. Demo Script (3 minutes)

1. **0:00** — Show the map. "FireSight is an AI-powered wildfire command center. 6 drones are patrolling the Palisades fire zone autonomously."
2. **0:15** — Click to ignite fire. "A fire starts. Watch — the drones detect it through thermal sensors."
3. **0:30** — Detection event fires. "5 AI agents come online. They analyze fire behavior: ROS, wind speed, spotting risk."
4. **0:45** — Engines start moving on roads. "AI_DEPLOY has dispatched 3 engines based on fire behavior score, not a timer. The reasoning is visible: 'Fire ROS exceeds 2.0 ch/hr.'"
5. **1:00** — Switch to ICS Command Chain tab. "Here's the full ICS hierarchy. 75 nodes. Watch the information flow — command decisions flow down, intel flows up, AI augments both."
6. **1:15** — Switch back to map. Show Decision Queue. "AI_OVERWATCH proposes a VLAT request. The commander can approve or deny. If they don't respond in 40 seconds, it auto-approves — just like real ICS."
7. **1:30** — Click APPROVE. "DC-10 VLAT inbound. 11,600 gallons of Phos-Chek ahead of the fire."
8. **1:45** — Show side panels updating. "Every metric is live. Drone count, evacuation progress, crew positions — all from the simulation."
9. **2:00** — Speed up to 50x. Show fire growing and containment. "Watch the containment percentage — it reflects real suppression. Engines suppress burning cells, hand crews build fireline, dozers cut firebreaks."
10. **2:15** — Show evacuation events. "AI_EVAC proposes mandatory evacuation based on fire ETA. Genasys alerts sent. Routes monitored for blockage."
11. **2:30** — Zoom out. "This is agentic mission control. 5 AI agents making autonomous decisions. Human-in-the-loop approval. Real ICS protocol. Condition-driven, not scripted."
12. **2:45** — End. "FireSight. Built for the Worlds in Action hackathon."
