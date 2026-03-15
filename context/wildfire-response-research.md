# Wildfire Response Research: Deep Technical Reference for Agentic AI Mission Control

**Compiled: March 14, 2026 | For FireSight Hackathon Project**

---

## 1. Incident Command System (ICS)

### Structure
ICS divides emergency response into **five functional areas**: Command, Operations, Planning, Logistics, and Finance/Administration. The Chiefs of Operations, Planning, Logistics, and Finance/Administration are the **General Staff** positions.

### Key Roles

| Role | Responsibility |
|------|---------------|
| **Incident Commander (IC)** | Overall authority. Sets objectives, strategies, priorities. On first-arriving engine, the captain/supervisor becomes IC until relieved by a higher-qualified officer. |
| **Operations Section Chief** | Manages ALL tactical operations. Directly supervises Branch Directors, Division/Group Supervisors, and Air Operations. Develops the operations portion of the Incident Action Plan (IAP). The majority of incident personnel work under Operations. |
| **Planning Section Chief** | Collects, evaluates, and disseminates resource/situation information. Forecasts probable course of events. Prepares alternative strategies. Has 4 units: Resources Unit, Situation Unit, Documentation Unit, Demobilization Unit. |
| **Logistics Section Chief** | Provides facilities, services, and materials. Communications, medical, food, supplies. |
| **Finance/Admin Section Chief** | Tracks costs, contracts, compensation, procurement. |

### NIIMS / NIMS
- **NIIMS** (National Interagency Incident Management System) was adopted in 1982, born from FIRESCOPE after the disastrous 1970 Southern California fires.
- NIIMS combined two systems: the Large Fire Organization and ICS.
- In 2004, FEMA created **NIMS** (National Incident Management System), which absorbed and expanded NIIMS for all-hazard use.
- NIMS mandates that all federal, state, local, and tribal agencies use ICS for emergency response.

### Real-Time Decision Making
- Decisions flow through the **Incident Action Plan (IAP)**, typically covering 12-24 hour operational periods.
- The IC and General Staff conduct **planning meetings** (P-meetings) each operational period.
- In initial attack, the first-arriving officer IS the IC and makes rapid decisions unilaterally.
- As complexity grows, **Unified Command** brings multiple agency heads together (e.g., CAL FIRE + USFS + County Fire).

### Current Tools/Software
| System | Purpose |
|--------|---------|
| **CAD (Computer-Aided Dispatch)** | Dispatches resources, routes equipment. CAL FIRE uses a custom CAD integrated with GIS. |
| **IROC** (Interagency Resource Ordering Capability) | Replaced ROSS in ~2023. Cloud-based (ServiceNow). Manages 10,000+ personnel in peak season. Integrates with IRWIN and CAD systems across all 50 states. |
| **IRWIN** (Integrated Reporting of Wildland Fire Information) | Central wildfire data clearinghouse. |
| **ArcGIS / Esri** | Primary GIS platform for fire mapping, perimeter tracking, resource visualization. |
| **Wildfire Analyst / Technosylva** | Real-time fire spread simulation (seconds to compute). Used by CAL FIRE as authoritative modeling platform. |
| **fiResponse (Technosylva)** | Multi-platform incident management with mobile field data collection, mapping, resource tracking. |
| **Tablet Command** | Mobile incident command — drag/drop apparatus to scene, track checklists. |
| **NICS** (Next-Gen Incident Command System) | Open-standards, web-based collaborative situational awareness. |
| **FireGuard** | Military satellite integration for 24/7 detection. Updates every 10 min, 400m resolution. Feeds directly into CAD for automated dispatch. |
| **P25 Digital Radio** | Standard radio protocol. Still has frequency band interoperability issues between agencies. |

---

## 2. Detection & Early Warning

### Detection Methods (Ranked by Speed)

#### 1. AI Camera Networks (Fastest for remote areas)
- **ALERTCalifornia**: 1,200+ HD pan-tilt-zoom cameras across California, run by UC San Diego.
  - Cameras rotate 360 degrees every 2 minutes, taking 12 photos per sweep.
  - Can see 60 miles in daylight, 120 miles at night (near-infrared).
  - AI detects smoke and alerts dispatchers automatically.
  - **38% of wildfires detected BEFORE first 911 call** (636 of 1,668 fires in one year).
  - Weakness: dust/clouds trigger false alerts; can't see into deep valleys.
- **Pano AI**: 360-degree ultra-HD cameras on high vantage points, 10-mile detection radius.
  - Deployed in 16 states/provinces, covering 20+ million acres.
  - Deep-learning smoke detection + human analyst confirmation.
  - Partners with utilities (Xcel Energy: 123 cameras in Colorado; Austin Energy: 13 stations).

#### 2. 911 Calls (Fastest in populated areas)
- In urban/suburban areas, 911 calls beat AI cameras 90-95% of the time because humans start fires and call immediately.
- In remote areas, significant delays possible.

#### 3. Satellite Systems
| Satellite | Type | Revisit Time | Detection Latency | Resolution |
|-----------|------|-------------|-------------------|------------|
| **GOES-16/17/18** | Geostationary | Every 5-15 min | ~30 min for fires >2 hectares | ~2 km |
| **VIIRS** (Suomi NPP, NOAA-20/21) | Polar-orbiting | 2x daily | 50 sec (ultra-real-time) to 4 hr (standard) | 375 m |
| **MODIS** (Aqua/Terra) | Polar-orbiting | 2x daily | 25 sec (ultra-real-time) to 3 hr (standard) | 1 km |
| **FireGuard** (military) | Various | Every 10 min | Near real-time | 400 m |
| **GOES-EFD** (research) | Geostationary | 15-30 min | 31% detected before public report | Regional |

#### 4. Human Lookout Towers
- Once 8,000+ towers in the US; now ~2,500 structures standing.
- California: 217 remaining, only ~50 regularly staffed (mostly volunteers).
- Use **Osborne Fire Finder** for bearing/distance estimation.
- In Alberta tests, human lookouts BEAT all AI/tech systems for highest detection rate.

#### 5. FIRIS (Fire Integrated Real-time Intelligence System)
- 2 fixed-wing aircraft with aerial infrared (IR) platforms, based in Sacramento and Los Alamitos.
- Staffed 7 days/week. Maps fire perimeters from the air.
- FIRIS Fusion Center integrates: CAD, AVL, flight radar, mountaintop cameras, weather sensors, ground intel.

### The Gap: Ignition to Detection
- **Best case (AI cameras)**: ~2 minutes (camera sweep interval)
- **Best case (satellite)**: 5-15 minutes (GOES) to 25 seconds (MODIS ultra-real-time, but only 2x daily passes)
- **Typical case**: 18+ minutes before a fire is reported
- **Worst case (remote areas, night)**: Hours
- **Critical stat**: At 5 minutes, fire may be 250m from origin. At 30 minutes, ~1.5 km. At 60 minutes, ~3 km.

---

## 3. Fire Behavior Prediction

### Operational Models

| Model | Type | Speed | Use Case |
|-------|------|-------|----------|
| **Wildfire Analyst (Technosylva)** | Real-time simulation | **Seconds** | Primary operational tool for CAL FIRE. On-demand spread predictions within seconds of ignition notification. |
| **FARSITE** | Semi-empirical, Rothermel-based | Minutes to hours | Fire growth simulation for single ignitions. Based on Rothermel (1972) surface fire spread equation. |
| **FlamMap** | Spatial fire behavior | Minutes | Spread rate, flame length, fireline intensity, conditional burn probabilities under constant conditions. Now includes FARSITE for heterogeneous conditions. |
| **BEHAVE** | Field calculator | Real-time | In-the-field fire behavior estimates. Quick calculations for ground crews. |
| **BurnPro3D (WIFIRE)** | 3D prescribed burn simulation | Minutes | Web-based, uses QUIC-Fire coupled fire/atmosphere model from Los Alamos. |

### Required Inputs
- **Topography**: elevation, slope, aspect (from DEM data)
- **Weather**: wind speed/direction, temperature, relative humidity (from RAWS - Remote Automated Weather Stations)
- **Fuels**: fuel model classification, fuel moisture content (live and dead)
- **Vegetation**: type, density, canopy cover, crown base height

### Accuracy
- **With LANDFIRE default data**: Low accuracy (Sorensen's coefficient 0.38)
- **With satellite-derived vegetation maps**: Good accuracy (Sorensen's coefficient 0.70)
- **Rate of Spread (ROS)**: Considered "highly inaccurate" due to uncertainty in local wind and fuels
- **Key gap**: Models assume uniform conditions within cells; actual fire behavior is chaotic at fine scales

### Operational Reality
- There is a **notable gap between research models and real-time operational support**
- Technosylva has deployed the **world's largest dedicated wildfire supercomputers** (Sept 2025): simulates 1+ billion fire scenarios/day, predicts threats up to 5 days in advance
- WIFIRE provides fire spread predictions within **5 minutes** to CAL FIRE and CalOES

---

## 4. Evacuation Systems

### How Evacuation Orders Are Issued (California)

**Alert Levels:**
1. **Evacuation Warning**: Potential threat — prepare to leave, especially if you need extra time
2. **Evacuation Order**: Immediate threat to life — leave NOW. Area lawfully closed.
3. **Shelter-in-Place**: Remain indoors, take protective actions

**Alert Channels:**
- **WEA (Wireless Emergency Alerts)**: Federal system, pushed to all phones in target area
  - Was 90 characters, now up to 360 characters
  - As of 2019: must have <0.1 mile overshoot
  - Still >40% of phones don't support enhanced geo-targeting
  - Major limitation: opt-out possible for some alert categories
- **Genasys Protect** (formerly Zonehaven): Zone-based evacuation management
  - Counties divided into pre-defined evacuation zones
  - Alerts reference zone names/numbers
  - Web and mobile app for residents to check their zone status
- **Reverse 911 / Opt-in systems**: County-specific, requires registration
- **Bullhorns / Door-to-door**: Last resort, used when electronic systems fail

### Failure Modes

#### Altadena / Eaton Fire (January 2025)
- Fire erupted ~6:30 PM on Jan 7
- East side received evacuation orders at 7:26 PM
- **West side didn't receive orders until 3:25 AM** — a 9-hour delay
- All 17 fatalities were in west Altadena where alerts were delayed
- A field staffer suggested evacuating west Altadena before midnight; Unified Command didn't act
- Genasys software glitch: drawn polygon "disappeared" and alert defaulted to countywide
- Most residents never received WEA; were awakened by police bullhorns with fire already close

#### Paradise / Camp Fire (November 2018)
- Town divided into 14 evacuation zones — but **no plan existed for evacuating all zones at once**
- Only **7,000 of 52,000 evacuees received electronic alerts**
- 17 cell towers destroyed, cascading communication failure
- 3 of 5 exit roads closed by fire = gridlock within 1 hour
- 2/3 of the 85 dead were found inside homes (attempted shelter-in-place)
- Evacuation orders were never issued for 4 zones until a citywide order when much had already burned

### Key Lessons
- Opt-in alert systems fail when most people haven't opted in
- Cell infrastructure is vulnerable to the disaster it's supposed to warn about
- Zone-based evacuation falls apart when the entire area needs to evacuate simultaneously
- Human decision-making delays (hesitation to issue orders) cost lives
- Need redundant, multi-channel alert systems that don't depend on a single technology

---

## 5. Resource Deployment

### Initial Attack Protocol
- **First 10-30 minutes are critical** — fire contained or it escapes
- Response time thresholds: **30 minutes for engines**, 60 minutes for dozers/hand crews/helicopters
- First-arriving crew supervisor becomes IC
- Firefighters attack fire as directly as possible
- If initial attack fails within ~24 hours, fire enters **extended attack** phase

### Resource Types
- **Engines**: Type 1-7, varying size/capacity. Primary ground suppression.
- **Hand Crews**: 20-person crews including elite **Hotshot crews** for direct attack
- **Dozers**: Cut firebreaks, clear fuel
- **Helicopters**: Helitack (rappel crews), water drops (Bambi Buckets), medevac
- **Air Tankers**: Fixed-wing retardant drops
- **Smokejumpers**: Parachute to remote fires

### CAL FIRE Aviation
- **Largest aerial firefighting fleet in the world**: ~70 aircraft
- Fleet: C-130 Hercules tankers, S-2T tankers, Bell UH-1H Super Huey helicopters, Sikorsky S-70i FIREHAWK helicopters, OV-10A Bronco air tactical aircraft
- Bases: 1 airtanker base, 13 air attack bases, 10 helitack bases, 1 joint helitack base
- **Goal**: Air tanker over any fire within 20 minutes
- **Target**: Contain 95% of fires to 10 acres or less
- OV-10 Bronco serves as **aerial coordination hub** — flies above fire, directs tankers and helicopters via multiple radios

### Resource Ordering: IROC
- **IROC** (Interagency Resource Ordering Capability) replaced ROSS
- Largest custom ServiceNow application in existence
- Cloud-based, web-enabled, platform-agnostic
- Manages ordering, tracking, and status of all resources across all 50 states
- Peak season: 10,000+ personnel tracked
- Real-time integration with federal and state qualification/certification systems
- Integrates with IRWIN (fire data) and CAD (dispatch) systems

### Air Coordination
- **GACC** (Geographic Area Coordination Centers) manage aircraft scheduling
- Airtankers released daily and reordered under new request numbers
- **Air Tactical Group Supervisor** (ATGS) flies in OV-10 overhead, directs all air operations on scene
- Multiple simultaneous radio channels for IC, tanker pilots, helicopter crews

---

## 6. Communication Systems

### Radio Systems
- **P25 (Project 25)**: Digital radio standard for public safety
  - Goal: interoperability between agencies
  - Reality: P25 radios on different frequency bands (VHF vs UHF) **still cannot communicate directly**
  - Requires gateway/bridge hardware to interconnect different bands
  - Backward compatible with analog FM radios

### The Interoperability Problem
- Different agencies use different frequencies, different equipment, different protocols
- Federal (USFS) might be on VHF; local fire on UHF; law enforcement on 800 MHz
- Even with P25, frequency band differences create barriers
- Cell towers get destroyed by fires (17 lost in Camp Fire)
- Radio repeaters on mountaintops can burn

### Solutions Being Deployed
- **ICRI Gateway**: Links multiple radio types, models, and frequencies
- **Cubic Vocality**: Connects multiple agency radios so they can all talk
- **BLM invested $2.76M** (part of $10M) in communication kits for wildfire interoperability
- **Mesh networking**: Some agencies experimenting with portable mesh networks as backup

### Current Communication Stack (Typical Major Incident)
1. P25 digital radio (primary tactical)
2. CAD system (dispatch)
3. Cell phones (coordination, backup)
4. Satellite phones (remote areas)
5. Aircraft radios (air-to-ground)
6. Internet/web apps (Tablet Command, IROC, ArcGIS dashboards)

---

## 7. Current AI/Tech Efforts

### Deployed Systems (Operational NOW)

| System | Organization | What It Does |
|--------|-------------|-------------|
| **ALERTCalifornia** | UC San Diego / CAL FIRE | 1,200+ AI cameras, smoke detection, 360-degree sweep every 2 min |
| **Pano AI** | Pano (startup) | AI camera stations, deep-learning smoke detection, 20M+ acres covered |
| **Technosylva Wildfire Analyst** | Technosylva | Real-time fire spread simulation in seconds. Used by CAL FIRE, 13 state agencies, 20 utilities |
| **fiResponse** | Technosylva | Multi-platform incident management |
| **FireGuard** | NIFC / Military | Satellite-based 24/7 detection, 10-min updates, auto-feeds CAD |
| **WIFIRE / Firemap** | UC San Diego | Real-time fire modeling, 5-min predictions to CAL FIRE. Uses 3D FastFuels + QUIC-Fire. |
| **FIRIS** | CalOES | 2 IR-equipped aircraft, aerial fire mapping 7 days/week |
| **IROC** | NWCG | Cloud-based resource ordering across all 50 states |
| **Genasys Protect** | Genasys | Zone-based evacuation management |
| **BurnPro3D** | WIFIRE | 3D prescribed burn simulation web tool |

### Emerging Tech (2025-2026)

| System | What It Does |
|--------|-------------|
| **Technosylva Supercomputers** | 1B+ fire scenarios/day, 5-day-ahead prediction (deployed Sept 2025) |
| **Technosylva + Pano AI Partnership** | Unified predictive + real-time detection platform (announced Feb 2026) |
| **FireSwarm drones** | Autonomous heavy-lift drones with Bambi Buckets, AI-planned water pickups, night flight capable. Testing 2025, first deliveries 2026. |
| **Seneca autonomous drones** | 100-lb payload, 100 PSI suppression, AI navigation, <10 min response time target |
| **ACC Thunder Wasp drones** | Delivering 2025-2026 for automated firefighting |
| **XPRIZE Wildfire** | Competition: detect + extinguish fire within 1,000 km2 in <10 min. Finals June 2026. |
| **IVSR (research)** | Intelligent Virtual Situation Room: Digital Twin + Agentic AI for wildfire management (arXiv Feb 2026) |

### Cal Fire's Current Tech Stack
1. Custom CAD system (being upgraded with ArcGIS Enterprise)
2. ALERTCalifornia camera network
3. FireGuard satellite system
4. Technosylva Wildfire Analyst / fiResponse
5. FIRIS (aerial IR mapping)
6. RAWS (Remote Automated Weather Stations)
7. IROC (resource ordering)
8. P25 radio + interoperability gateways
9. Wildfire Forecast and Threat Intelligence Integration Center (central hub)

---

## 8. Where AI Agentic Mission Control Could Transform Response

### Current Pain Points (What Breaks Today)

| Pain Point | Evidence |
|-----------|----------|
| **Detection-to-decision delay** | Altadena: 9 hours between fire arrival and evacuation order for west side |
| **Siloed information** | Data lives in separate systems (CAD, IROC, cameras, satellites, weather, GIS) — no unified view |
| **Human bottleneck in evacuation decisions** | IC must manually decide which zones to evacuate, often hesitates |
| **Communication fragmentation** | Different radio frequencies, cell towers destroyed, opt-in alert systems |
| **Resource allocation is reactive** | Resources ordered after fire grows, not pre-positioned based on prediction |
| **Fire prediction is not integrated with tactical decisions** | Models run separately from command systems |
| **No 3D spatial awareness** | IC works from 2D maps and radio reports — no immersive understanding of terrain/fire/resources |

### Multi-Agent System Design for FireSight

#### Agent 1: PYRO (Fire Prediction Agent)
**Current gap it fills**: Fire models run separately from command. Takes time to configure. Not integrated with live sensor data.

**What it does**:
- Continuously ingests: satellite feeds (GOES, VIIRS, MODIS), ALERTCalifornia cameras, RAWS weather data, FIRIS aerial IR
- Runs Technosylva-style spread simulations every 60 seconds, auto-updating
- Predicts fire perimeter at T+15min, T+1hr, T+6hr, T+24hr
- Identifies structures, infrastructure, and critical facilities in predicted path
- Outputs 3D fire spread visualization onto world-model terrain
- **Key metric it improves**: Time from ignition to actionable spread prediction (from ~5 min to continuous)

#### Agent 2: SWARM (Drone Coordination Agent)
**Current gap it fills**: Drone operations are manual. No autonomous coordination. No integration with fire models.

**What it does**:
- Plans optimal surveillance routes based on PYRO's predicted fire boundary
- Coordinates multiple drones for continuous perimeter coverage
- Assigns thermal/visual sensing tasks to specific drones
- Feeds live drone imagery back to PYRO for model calibration
- Plans suppression drone water pickup/drop routes (when suppression drones available)
- Deconflicts drone airspace with manned aircraft (tankers, helicopters, ATGS)
- **Key metric it improves**: Situational awareness coverage area and update frequency

#### Agent 3: EVAC (Evacuation Agent)
**Current gap it fills**: Evacuation decisions are delayed by human hesitation. Alert systems are fragmented. Zone-based evacuation doesn't adapt to real-time fire behavior.

**What it does**:
- Monitors PYRO's fire predictions against Genasys-style evacuation zones
- Pre-computes evacuation recommendations as fire approaches zone boundaries
- Triggers multi-channel alerts (WEA, app push, reverse-911, PA systems) simultaneously
- Models traffic flow on evacuation routes using real-time data
- Identifies bottleneck roads and suggests contraflow or alternate routes
- Tracks evacuation progress and identifies zones with low compliance
- Recommends shelter-in-place for zones where evacuation routes are compromised
- **Key metric it improves**: Time from fire-threatens-zone to evacuation-order-sent (from hours to minutes)

#### Agent 4: DEPLOY (Resource Deployment Agent)
**Current gap it fills**: Resources ordered reactively through IROC. No predictive pre-positioning. Air coordination is voice-only.

**What it does**:
- Monitors PYRO predictions and current resource positions (from IROC/AVL)
- Pre-positions resources based on predicted fire growth (before they're needed)
- Optimizes engine/crew assignments based on: distance, capability, route safety
- Coordinates air tanker sequencing and retardant drop priorities
- Tracks resource fatigue, fuel, and water supply levels
- Suggests mutual aid requests before resources are depleted
- **Key metric it improves**: Time from resource-needed to resource-on-scene

### How It Maps to "Mission Control"

The concept mirrors NASA Mission Control or a military Combined Air Operations Center (CAOC):

| NASA/Military Concept | FireSight Equivalent |
|----------------------|---------------------|
| Flight Director | Incident Commander |
| CAPCOM (capsule communicator) | AI Agent Interface (voice/gesture) |
| Telemetry displays | 3D world model with live fire/resource/weather overlay |
| Flight dynamics | PYRO agent (fire behavior prediction) |
| Mission planning | EVAC + DEPLOY agents (evacuation + resource optimization) |
| Spacecraft systems | SWARM agent (drone/sensor management) |
| Mission rules | ICS protocols, SOPs, agency policies |

### What Changes with a Real-Time 3D World Model + AI Agents

**For the Incident Commander:**
1. **Sees the terrain in 3D** — understands ridgelines, canyons, wind channels that drive fire behavior (currently inferred from 2D topo maps)
2. **Sees fire prediction OVERLAID on terrain** — not a separate screen/model, but fire spreading across the world model in real-time
3. **Sees all resources positioned in 3D space** — engines on roads, aircraft in sky, crews on ridgelines, drones on perimeter
4. **Hears AI recommendations via voice** — "PYRO: Fire predicted to reach Zone 7 in 45 minutes. EVAC recommends issuing Warning now."
5. **Gives commands via voice/gesture** — "Deploy Engine 42 to Ridge Road. EVAC: issue warning for Zone 7."
6. **Sees evacuation status overlaid** — which zones ordered, which evacuating, which complete, which have stragglers
7. **Replays scenarios** — "PYRO: show me what happens if wind shifts to northwest at 30 mph"

**Concrete improvements over today:**
- **Detection to action**: From 18+ minutes to continuous monitoring
- **Evacuation decision**: From hours of human deliberation to minutes of AI-recommended, human-confirmed orders
- **Resource pre-positioning**: From reactive ordering to predictive deployment
- **Situational awareness**: From 2D maps + radio chatter to immersive 3D world model
- **Communication**: From fragmented radio/phone/app to unified agent-mediated coordination
- **Information fusion**: From separate CAD/IROC/camera/satellite screens to single integrated world view

---

## Key Statistics for Demo Narrative

- **95%** of CAL FIRE's fires are contained to 10 acres or less
- **85 people** died in Camp Fire (2018) — deadliest California wildfire
- **17 people** died in Eaton Fire (2025) — all in area with delayed alerts
- **7,000 of 52,000** evacuees received alerts in Paradise
- **38%** of California wildfires detected by AI cameras before first 911 call
- **1,200+** ALERTCalifornia cameras deployed
- **~70** aircraft in CAL FIRE fleet (world's largest)
- **10,000+** personnel managed by IROC in peak season
- **1 billion+** fire scenarios simulated per day by Technosylva supercomputers
- **20 minutes** — CAL FIRE's target for air tanker over any fire
- **5 minutes** — WIFIRE's prediction delivery time to CAL FIRE
- **At 5 min**: fire 250m from origin. **At 30 min**: 1.5 km. **At 60 min**: 3 km.

---

## Real System Names for Technical Credibility

### Detection: ALERTCalifornia, Pano AI, GOES-16/17/18, VIIRS, MODIS, FireGuard, FIRIS, GOES-EFD
### Prediction: Wildfire Analyst (Technosylva), FARSITE, FlamMap, BEHAVE, BurnPro3D, WIFIRE/Firemap, QUIC-Fire
### Command: ICS, NIMS, Unified Command, IAP (Incident Action Plan), CAD
### Resources: IROC, IRWIN, GACC, OCC, ATGS (Air Tactical Group Supervisor)
### Evacuation: WEA, Genasys Protect (formerly Zonehaven), IPAWS
### Communication: P25, ICRI Gateway, Cubic Vocality, RAWS
### Aircraft: C-130 Hercules, S-2T, UH-1H Super Huey, S-70i FIREHAWK, OV-10A Bronco
### Mapping/GIS: ArcGIS, Esri, LANDFIRE
### Emerging: IVSR (Digital Twin), FireSwarm, Seneca, XPRIZE Wildfire
