# AGENT2.md — Agentic Wildfire Response Simulation Framework (v3)

## Overview

This document defines a multi-agent simulation workflow that mirrors real-world Incident Command System (ICS) protocols for wildfire response. The simulation runs as a scripted scenario inside FireSight's 3D interface, where 4 AI agents + 1 orchestrator augment (not replace) the ICS structure — giving the Incident Commander continuous spatial awareness and AI-driven decision support.

**Design principle:** Agents handle information synthesis and recommendations. Humans retain authority over all decisions that affect life safety. This mirrors how real ICS works — the IC sets objectives, the staff recommends tactics, the IC approves.

---

## Architecture: Agent Hierarchy (ICS-Aligned)

```
                    ┌──────────────────────┐
                    │      COMMANDER       │
                    │   (The User / IC)     │
                    │  Sets OBJECTIVES      │
                    │  Approves ACTIONS     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │      OVERWATCH       │
                    │  Orchestration Layer  │
                    │  (Augments Planning   │
                    │   Section + Situation │
                    │   Unit + GIS)         │
                    └──┬────┬────┬────┬────┘
                       │    │    │    │
            ┌──────────▼┐ ┌▼────▼─┐ ┌▼──────────┐
            │ PREDICT   │ │SWARM  │ │  EVAC     │
            │ Fire Intel│ │Recon  │ │ Routing   │
            └───────────┘ └───────┘ └───────────┘
                       │    │    │
            ┌──────────▼────▼────▼─────────────┐
            │           DEPLOY                 │
            │   Resource Optimization          │
            │   (Consumes all agent outputs     │
            │    to recommend positioning)      │
            └──────────────────────────────────┘
```

### How This Maps to Real ICS

| ICS Role | FireSight Agent | Relationship |
|----------|----------------|-------------|
| Incident Commander | COMMANDER (user) | Sets objectives: "Protect Sunset Ridge." "Prioritize civilian life." Not tactics. |
| Planning Section Chief + Situation Unit + FBAN | OVERWATCH + PREDICT | Synthesizes intel, maintains COP (Common Operating Picture), forecasts fire behavior |
| Operations Section Chief | DEPLOY (recommendations) + COMMANDER (approval) | DEPLOY recommends tactical resource assignments. IC approves. |
| Air Operations Branch Director + ATGS | SWARM | Coordinates all aerial assets (drones + manned aircraft deconfliction) |
| Law Enforcement Branch (evacuation) | EVAC | Zone-based evacuation management, alert issuance, route optimization |
| Logistics Section | DEPLOY (resource tracking) | Tracks supply levels, fatigue, mutual aid needs |

**Key ICS principles preserved:**
- **Unity of Command** — every resource reports to one supervisor (DEPLOY tracks assignments)
- **Span of Control** — 3-7 direct reports per supervisor (OVERWATCH manages 4 agents)
- **Unified Command** — multi-agency IC structure activates when USFS/local FD/law enforcement join (OVERWATCH mediates)
- **IAP-driven operations** — OVERWATCH continuously generates a living Incident Action Plan, replacing the 12-24 hour paper cycle

---

## Agent Definitions

### OVERWATCH — The Orchestrator

**Real-world analog:** Planning Section Chief + Situation Unit Leader + GIS Specialist + Documentation Unit

**What it augments:** The P-meeting (planning meeting) cycle. Today, the Planning Section gathers reports every 12-24 hours, compiles an IAP on paper, and briefs the IC. OVERWATCH does this **continuously** — maintaining a living Common Operating Picture (COP) that all agents read from and write to.

**ICS forms it replaces:**
- ICS-201 (Incident Briefing) → Initial world state
- ICS-202 (Incident Objectives) → IC's stated objectives, tracked
- ICS-204 (Assignment List) → DEPLOY's resource assignments
- ICS-209 (Incident Status Summary) → Real-time dashboard
- ICS-215 (Operational Planning Worksheet) → PREDICT + DEPLOY integration

**Responsibilities:**
1. Maintains the unified **World State** — single source of truth for all agents
2. Detects **conflicts** between agent recommendations (e.g., DEPLOY positioning a crew where PREDICT says fire will be in 20 min)
3. Checks agent recommendations against **10 Standard Firefighting Orders** and **18 Watch Out Situations** — flags violations
4. Generates **Decision Points** for the IC when:
   - Agent recommendations conflict
   - Risk thresholds are crossed (life safety, structure threat, resource safety)
   - Incident complexity warrants type escalation (Type 5 → 3 → 2 → 1)
   - Unified Command activation needed (new agency arrives on scene)
5. Produces the scrolling **Event Feed** (replaces fragmented radio chatter)
6. Tracks **confidence levels** across all agent outputs — alerts IC when overall situational confidence drops below threshold
7. Manages **night operations transition** — flags when aerial operations must cease at sunset, adjusts agent behavior accordingly

**World State Object:**
```json
{
  "timestamp": "2025-01-08T12:04:32-08:00",
  "incident": {
    "name": "PALISADES FIRE",
    "type": 3,
    "status": "ACTIVE",
    "acres": 23000,
    "containment_pct": 0,
    "structures_threatened": 12500,
    "structures_destroyed": 0,
    "personnel_assigned": 1247,
    "unified_command": ["CAL_FIRE", "LAFD"],
    "iap_period": 1,
    "objectives": [
      "Protect life safety of civilians in Zones B3, B4, C1",
      "Prevent fire spread into Sunset Ridge neighborhood",
      "Maintain firefighter safety — LCES verified for all crews"
    ]
  },
  "fire": {
    "perimeter": [[34.045, -118.529], "...GeoJSON..."],
    "active_fronts": [
      {
        "id": "NE-1",
        "direction": "NE",
        "ros_chains_per_hr": 2.4,
        "flame_length_ft": 15,
        "intensity": "extreme",
        "fire_type": "surface_to_crown_transition",
        "anchor_point": "Ridge Rd / Sunset Blvd intersection"
      }
    ],
    "spot_fires": [
      { "id": "SPOT-07", "location": [34.048, -118.524], "confirmed": true, "age_min": 3, "size_acres": 0.5 }
    ],
    "predictions": {
      "15min": { "acres": 24100, "confidence": 0.91, "perimeter": ["..."] },
      "1h":    { "acres": 26800, "confidence": 0.82, "perimeter": ["..."] },
      "3h":    { "acres": 34200, "confidence": 0.61, "perimeter": ["..."] },
      "6h":    { "acres": 48500, "confidence": 0.38, "perimeter": ["..."] }
    },
    "pyroconvection_risk": "LOW"
  },
  "weather": {
    "wind_speed_mph": 25,
    "wind_direction": "NW",
    "wind_gusts_mph": 45,
    "humidity_pct": 12,
    "temperature_f": 94,
    "red_flag": true,
    "santa_ana": true,
    "forecast": {
      "wind_shift": { "time": "+2h", "new_direction": "NE", "confidence": 0.73 },
      "sunset": "17:08",
      "overnight_rh_recovery": 28
    }
  },
  "terrain": {
    "slope_at_front_deg": 32,
    "fuel_model": "SH5_chaparral",
    "fuel_moisture_1hr_pct": 3,
    "fuel_moisture_10hr_pct": 5,
    "fuel_moisture_live_pct": 62,
    "elevation_range_ft": [200, 1400],
    "canyon_effect_zones": ["Topanga Canyon", "Las Virgenes Canyon"]
  },
  "resources": {
    "engines": { "assigned": 47, "available": 12, "en_route": 8, "type_breakdown": { "type1": 12, "type3": 28, "type6": 15 } },
    "hand_crews": { "assigned": 14, "available": 3, "hotshot": 6, "type2": 8, "work_hours_avg": 8.5 },
    "aircraft": {
      "air_tankers": { "assigned": 4, "available": 1, "turnaround_min": 35, "retardant_remaining_gal": 28000 },
      "helicopters": { "assigned": 6, "available": 2, "type1": 2, "type2": 4 },
      "drones": { "deployed": 12, "available": 2, "coverage_pct": 74 },
      "air_attack_platform": { "callsign": "AA-320", "type": "OV-10A", "status": "OVERHEAD", "altitude_ft": 2500 }
    },
    "dozers": { "assigned": 3, "available": 1 },
    "water_tenders": { "assigned": 8, "available": 2, "total_capacity_gal": 24000 }
  },
  "evacuation": {
    "zones": [
      { "id": "B3", "status": "WARNING", "population": 2847, "evacuated": 1203, "vulnerable": { "elderly": 312, "mobility_limited": 45, "non_english": 189 } },
      { "id": "B4", "status": "CLEAR", "population": 1560, "evacuated": 0, "vulnerable": { "elderly": 201, "mobility_limited": 22, "non_english": 94 } },
      { "id": "C1", "status": "ORDER", "population": 4200, "evacuated": 3891, "vulnerable": { "elderly": 480, "mobility_limited": 67, "non_english": 310 } }
    ],
    "routes": [
      { "id": "R1", "name": "Sunset Blvd West", "status": "CLEAR", "capacity_pct": 67, "lanes": 4, "distance_mi": 3.2 },
      { "id": "R2", "name": "PCH South", "status": "CONGESTED", "capacity_pct": 94, "lanes": 4, "distance_mi": 5.1 },
      { "id": "R3", "name": "Topanga Canyon", "status": "BLOCKED", "reason": "fire_crossing", "lanes": 2, "distance_mi": 8.7 }
    ],
    "shelters": [
      { "id": "S1", "name": "Santa Monica High School", "capacity": 2000, "occupancy": 847, "distance_mi": 6.5 }
    ]
  },
  "safety": {
    "watch_out_situations_active": [11, 14, 15],
    "lces_status": {
      "Crew3_Hotshot": { "lookout": "SWARM_Drone07", "comms": "OK", "escape_routes": 2, "safety_zone": "Alpha", "status": "GREEN" },
      "Engine12": { "lookout": "visual", "comms": "OK", "escape_routes": 1, "safety_zone": "Sunset_staging", "status": "YELLOW" }
    },
    "work_rest_violations": []
  },
  "comms": {
    "interop_status": "DEGRADED",
    "agencies_connected": ["CAL_FIRE", "LAFD", "LACSD"],
    "agencies_disconnected": ["USFS_ANF"],
    "cell_towers_affected": 3,
    "backup_comms": "satellite"
  },
  "confidence": {
    "overall": 0.74,
    "fire_prediction": 0.82,
    "weather_forecast": 0.73,
    "resource_tracking": 0.95,
    "evacuation_status": 0.88,
    "degradation_reason": "Wind shift uncertainty reducing prediction confidence"
  }
}
```

---

### PREDICT — Fire Intelligence Agent

**Real-world analog:** Fire Behavior Analyst (FBAN) + Intelligence Section + Technosylva Wildfire Analyst

**What it augments:** Today, the FBAN manually configures and runs Technosylva Wildfire Analyst or FARSITE, interprets satellite/FIRIS imagery, monitors RAWS weather data, and briefs the IC with a paper map and spot weather forecast. This cycle takes **30-60 minutes per update**. PREDICT runs **continuously** with automatic data fusion.

**Core algorithm (mirrors real operational tools):**
```
1. Ingest current conditions:
   - Fire perimeter (SWARM IR feeds + GOES/VIIRS satellite)
   - Weather (RAWS stations + NWS forecast models)
   - Fuel moisture (NFDRS calculations + ground truth from SWARM)
   - Terrain (DEM from world model)

2. Run Rothermel-based spread calculation:
   R = (I_R × ξ × (1 + φ_w + φ_s)) / (ρ_b × ε × Q_ig)
   - Per-pixel across the landscape at terrain resolution
   - Slope coefficient from DEM
   - Wind coefficient from interpolated weather field

3. Propagate fire front via Huygens wavelet principle:
   - Each point on fire perimeter generates elliptical wavelet
   - Wavelets merge to form new perimeter
   - Time steps: 1 min (near-term) to 15 min (6h forecast)

4. Spot fire probability model:
   - Ember lofting based on fire intensity + convection column height
   - Transport distance based on wind speed at multiple altitudes
   - Landing probability based on fuel receptivity
   - Flag zones with >50% spot fire probability

5. Ensemble uncertainty:
   - Run 50 scenarios varying wind ±5mph and ±15° direction
   - Weight by weather forecast confidence
   - Output: probability contours (50th, 75th, 95th percentile spread)

6. Confidence decay:
   - 15min prediction: 0.91 confidence
   - 1h prediction: 0.82 confidence
   - 3h prediction: 0.61 confidence
   - 6h prediction: 0.38 confidence
   - Confidence further reduced by:
     - Pending wind shift (−0.15)
     - Active spotting (−0.10)
     - Pyroconvection risk (−0.20)
```

**Inputs consumed:**
| Input | Real-World Source | Agent Source | Update Rate |
|-------|------------------|-------------|-------------|
| Fire perimeter | FIRIS aerial IR, GOES/VIIRS satellite | SWARM drone IR feeds | Every 2-5 min |
| Wind speed/direction/gusts | RAWS (Remote Automated Weather Stations) + NWS | Weather API | Every 5 min |
| Spot weather forecast | NWS spot forecast (requested by FBAN) | Weather API | Every 30 min |
| Fuel type & model | LANDFIRE 2022 (53 Scott & Burgan fuel models) | Static database | Static |
| Fuel moisture (dead) | NFDRS calculations from RAWS | Computed | Hourly |
| Fuel moisture (live) | Seasonal tables + ground sampling | Static + SWARM ground truth | Daily |
| Terrain slope/aspect/elevation | USGS DEM (10m or 30m) | Baked into Marble world model | Static |
| Spot fire reports | Ground crews + FIRIS | SWARM drone confirmations | Event-driven |

**Outputs:**
| Output | Description | Visual on Map |
|--------|-------------|---------------|
| `fire.perimeter` | Current fire boundary polygon (GeoJSON) | Red irregular contour on terrain |
| `fire.active_fronts[]` | Segments with active spread, ROS, flame length, fire type | Pulsing red arrows showing direction + speed labels |
| `fire.predictions.15min/1h/3h/6h` | Predicted perimeters with confidence | Concentric overlays: red → orange → yellow → faded yellow |
| `fire.predictions.ensemble` | Probability contours (50/75/95th pct) | Gradient bands showing uncertainty spread |
| `fire.spot_fires[]` | Confirmed + predicted spot fire locations | Confirmed: red blinking dots. Predicted: yellow probability halos |
| `alerts.crown_fire_risk` | Segments where crown fire transition is likely | Hazard markers on steep slopes with ladder fuels |
| `alerts.pyroconvection` | Warning when fire intensity may generate its own weather | Atmospheric column visualization above fire + confidence warning |
| `confidence` | Overall prediction confidence score + degradation reasons | Color-coded confidence bar in PREDICT panel (green → yellow → red) |

**Agent behaviors (autonomous):**
1. **Wind shift response:** When weather API reports wind direction change >15° → recalculate all predictions → notify OVERWATCH → cascade to EVAC zone reassessment + DEPLOY repositioning
2. **Spot fire integration:** When SWARM confirms new spot fire → add ignition point to model → recalculate spread → check if evacuation zones newly threatened → alert OVERWATCH
3. **ROS escalation:** When observed ROS exceeds predicted ROS by >25% → self-calibrate model → if ROS >3.0 ch/hr flag "EXTREME" → OVERWATCH Decision Point
4. **Crown fire warning:** When flame length exceeds 11 ft + continuous canopy + slope >30% → flag crown fire transition → increases confidence penalty
5. **Pyroconvection monitoring:** When fire area exceeds ~10,000 acres AND fire intensity is extreme → assess convective column potential → if positive, reduce all prediction confidence by 0.20 and warn IC: "Fire may create its own weather. Predictions unreliable beyond 1h."
6. **Prediction validation:** Continuously compare predicted vs actual perimeter → compute Sorensen's coefficient → use error to adjust future predictions → report validation score to OVERWATCH
7. **Night behavior modeling:** After sunset, model overnight recovery: higher humidity, lower wind, reduced ROS → but flag if Santa Ana/Diablo winds override normal diurnal pattern

**Decision Points surfaced to IC:**
- "PREDICT: Wind shift to NE predicted in 2h (73% confidence). Under current trajectory, Zone B4 remains CLEAR for 3h. Under shifted wind, fire reaches B4 in 1.5h. **Set objective: protect B4? This will trigger EVAC preemptive advisory and DEPLOY pre-positioning.**"
- "PREDICT: Crown fire transition confirmed on NE slope. ROS doubled to 4.8 ch/hr. Current containment line overrun in ~45 min. Prediction confidence dropped to 0.58. **Recommend: request air tanker support for NE front.**"
- "PREDICT: Pyroconvection risk elevated. Fire area 12,000 acres, extreme intensity. Convective column forming. All predictions beyond 1h are LOW CONFIDENCE. **Recommend: increase safety margins for all crews. Consider pre-emptive withdrawal from exposed positions.**"

---

### SWARM — Aerial Reconnaissance & Coordination Agent

**Real-world analog:** Air Operations Branch Director + Air Tactical Group Supervisor (ATGS in OV-10A Bronco) + FIRIS

**What it augments:** Today, California has only 2 FIRIS aircraft for aerial IR mapping statewide. Helicopter recon is coordinated by voice radio through the ATGS. Individual drones each require their own operator. There is no automated fleet coordination or sensor fusion. SWARM treats the entire aerial sensor network — drones, manned aircraft cameras, satellites — as a **single coordinated intelligence platform**.

**Critical constraint: TFR (Temporary Flight Restriction) deconfliction.**
Every wildfire has a TFR. Unauthorized drones in a TFR force all aerial firefighting to stop — this has happened 32 times in one California fire season. SWARM must:
- Operate all drones within the TFR under ATGS authority
- Deconflict drone altitudes from manned aircraft (tankers at 150-300ft AGL, helicopters at 200-500ft AGL, ATGS at 2000-2500ft)
- Ground all drones immediately if ATGS calls "DRONES DOWN" for incoming air tanker run
- Maintain safe separation from all manned aircraft at all times

**Inputs consumed:**
| Input | Real-World Source | Agent Source | Update Rate |
|-------|------------------|-------------|-------------|
| Fire predictions | FBAN spot forecasts | PREDICT agent | Every recalculation |
| Resource positions | AVL (Automatic Vehicle Location) | DEPLOY agent | Every 30 sec |
| Evacuation zones | Genasys Protect | EVAC agent | Event-driven |
| Drone telemetry | Individual UAS control stations | Direct drone feeds | Real-time |
| TFR boundaries | FAA NOTAM system | Static per incident | Updated if TFR modified |
| Manned aircraft positions | ADS-B + ATGS radio | Air Operations | Real-time |
| Sunset/sunrise | Astronomical data | System | Static per day |

**Fleet management logic:**
```
Priority zones (ranked by threat to life):
  1. Crew safety overwatch — any crew with LCES status YELLOW or RED
  2. Active fire fronts with stale imagery (>5 min since last scan)
  3. Confirmed/predicted spot fire zones (from PREDICT)
  4. Evacuation route verification (from EVAC — confirm road is clear)
  5. Newly threatened structures/communities
  6. Systematic perimeter mapping (for PREDICT model calibration)

For each priority zone:
  → Check TFR and manned aircraft positions
  → Find nearest available drone with sufficient battery (>30%)
  → Calculate flight path deconflicted from manned aircraft altitudes
  → Assign patrol pattern:
     - Fire front: orbit at 400ft AGL, IR + visual
     - Spot fire: hover confirm at 300ft AGL, IR
     - Evacuation route: transect at 500ft AGL, visual
     - Crew overwatch: orbit at 350ft AGL, IR + visual
  → Stream feeds to OVERWATCH for COP integration
  → Auto-recall at 20% battery, dispatch replacement

Manned aircraft coordination:
  → When Air Tanker inbound: clear all drones from drop zone corridor
  → When Helicopter making water drop: clear vertical column
  → ATGS has override authority on all drone positions
```

**Outputs:**
| Output | Description | Visual on Map |
|--------|-------------|---------------|
| `drones[].position` | Real-time GPS position of each drone | Moving dot with altitude label + flight path trail |
| `drones[].feed` | IR/visual camera feed | Thumbnail in SWARM panel, expandable |
| `drones[].coverage_cone` | Current scanning footprint on terrain | Translucent blue cone projected downward |
| `drones[].battery_pct` | Remaining battery | Color-coded battery indicator (green→yellow→red) |
| `coverage_map` | Terrain heat map by last-scanned time | Green (< 2 min) → yellow (2-5 min) → red (> 5 min stale) |
| `detections[]` | Spot fires, hotspots, people, vehicles, blocked roads | Typed markers on terrain with detection timestamp |
| `fleet_status` | Available / deployed / returning / charging counts | Summary bar in SWARM panel |
| `manned_aircraft[]` | Tracked positions of air tankers, helicopters, ATGS | Aircraft icons with altitude + callsign labels |
| `tfr_boundary` | Active TFR polygon | Semi-transparent restricted zone overlay |

**Agent behaviors (autonomous):**
1. **PREDICT spot fire alert:** When PREDICT flags a high-probability spot fire zone → redirect nearest drone to confirm → IR scan → report confirmed/negative to PREDICT within 2 min
2. **EVAC route verification:** When EVAC activates an evacuation route → assign drone transect → verify road is physically clear (no debris, downed power lines, fire crossing) → report back
3. **Battery management:** At 20% battery → auto-recall to charging station → dispatch fresh drone → ensure no coverage gap during swap
4. **Coverage gap alert:** If active fire front goes >5 min without drone coverage → reprioritize fleet → if no drone available, alert OVERWATCH: "Coverage gap on [front], duration [X] min"
5. **Crew safety overwatch:** When DEPLOY positions a crew → assign dedicated drone to orbit above them → monitor for fire behavior changes that threaten escape routes → if threat detected, **directly alert crew AND DEPLOY simultaneously** (bypasses OVERWATCH for life safety)
6. **Air tanker deconfliction:** When DEPLOY orders air tanker drop → SWARM clears all drones from drop zone approach path → holds drones at safe altitude/distance → resumes after tanker clears area
7. **Night transition:** At sunset - 30 min → switch all drones to IR-only mode → alert IC that visual confirmation capability reduced → reduce flight altitude limits for safety
8. **Manned aircraft tracking:** Continuously plot tanker, helicopter, and ATGS positions → alert if any drone approaches within 500ft lateral or 200ft vertical of manned aircraft

**Decision Points surfaced to IC:**
- "SWARM: Drone-07 IR detected heat signature 400m NE of perimeter. 2m × 3m hotspot. Probability of spot fire: 89%. **Confirm as spot fire? (Updates PREDICT model and may trigger EVAC zone reassessment.)**"
- "SWARM: All 12 drones committed. Coverage gap on southern flank, 8 min and growing. Options: (A) Recall Drone-03 from perimeter mapping, (B) Accept gap and monitor via satellite only. **Choose?**"
- "SWARM: Air Tanker 2 inbound to NE front. Clearing drone corridor now. Drone-07 (crew overwatch for Crew 3) must relocate. Crew 3 will have 4 min without overhead safety watch. **Approve temporary gap or delay tanker approach?**"

---

### EVAC — Evacuation Routing Agent

**Real-world analog:** Law Enforcement Branch Director + Emergency Alert System + Genasys Protect + County OES

**What it augments:** Today, evacuation is a law enforcement function. The fire IC *recommends* evacuation. The county OES or Sheriff *authorizes and issues* the order. Alerts go through WEA, Genasys Protect, reverse-911, and door-to-door. This bureaucratic chain took **20-30 minutes in normal conditions** and **9+ hours in Altadena (2025)**. EVAC pre-computes recommendations so the IC can approve with a single action, compressing the decision-to-alert pipeline.

**Zone threat classification (mirrors real Genasys/Zonehaven system):**
```
CLEAR     → No fire threat. Normal conditions.
ADVISORY  → Fire in area. Be prepared to leave. Pack go-bags. Vulnerable populations
             (elderly, mobility-limited, non-English speakers) should consider leaving now.
WARNING   → Fire approaching. Leave if you feel unsafe. Voluntary evacuation.
             Vulnerable populations should leave immediately.
ORDER     → Mandatory evacuation. Leave now via designated routes.
             Area is lawfully closed. Law enforcement may enforce.
RESCUE    → Zone is cut off. All routes blocked or compromised. Shelter in place.
             Helicopter rescue operations initiated. DEPLOY assigns rescue aircraft.
```

**Vulnerable population tracking (critical lesson from Altadena + Paradise):**
```
For each zone, EVAC tracks:
  - Total population (census + real-time cell density estimate)
  - Elderly residents (65+) — slower evacuation, may need transport
  - Mobility-limited — wheelchair, medical equipment, need accessible vehicles
  - Non-English speakers — alerts must be multilingual
  - Assisted living / care facilities — need bus transport, medical escort
  - Schools / daycares — need bus transport, parent notification
  - Unhoused populations — no phone alerts, need door-to-door / PA system
  - Livestock / large animals — need evacuation time + trailer access

Vulnerable populations trigger EARLIER warnings:
  - If general population gets WARNING → vulnerable populations get ORDER
  - If zone has assisted living facility → trigger bus request to DEPLOY immediately
```

**Inputs consumed:**
| Input | Real-World Source | Agent Source | Update Rate |
|-------|------------------|-------------|-------------|
| Fire predictions (15min, 1h, 3h, 6h) | Technosylva / FBAN | PREDICT agent | Every recalculation |
| Road status | CHP + traffic sensors + aerial recon | SWARM drone feeds + traffic API | Every 2 min |
| Zone populations + demographics | Census + ACS + Genasys registry | Static database + real-time cell estimates | Static + hourly |
| Zone threat levels | FBAN + Operations | PREDICT fire proximity calculation | Every recalculation |
| Resource positions | IROC / AVL | DEPLOY agent (traffic control, buses, medical) | Every 30 sec |
| Shelter capacity | County OES | Static database + real-time occupancy | Event-driven |

**Route optimization algorithm:**
```
For each zone with status ≥ ADVISORY:
  1. Identify all road segments connecting zone to safe areas (outside 6h prediction perimeter)
  2. Score each route on 5 factors:
     a. distance (shorter = better, weighted 0.15)
     b. capacity (lanes × speed limit × current flow rate, weighted 0.30)
     c. fire_safety (minimum distance from any predicted fire perimeter at any time
        during evacuation window, weighted 0.35)
     d. terrain_safety (penalize narrow canyons, single-lane roads, steep grades, weighted 0.15)
     e. infrastructure (bridges, tunnels = choke points, weighted 0.05)
  3. Eliminate any route that intersects PREDICT's 1h fire perimeter (hard constraint)
  4. Assign population proportionally to routes by capacity score
  5. Model traffic flow using fluid dynamics (capacity × free flow speed × density function)
  6. Compute estimated clearance time per zone
  7. If any route capacity_pct > 80% → flag CONGESTED → recommend:
     - Traffic control from DEPLOY at key intersections
     - Contraflow (reverse inbound lanes to outbound) — doubles capacity, requires law enforcement
  8. If all routes for a zone are blocked → zone status = RESCUE → trigger helicopter rescue protocol
  9. Re-run EVERY TIME PREDICT updates predictions or SWARM reports road condition change
```

**Outputs:**
| Output | Description | Visual on Map |
|--------|-------------|---------------|
| `zones[].status` | Threat level per zone | Zone polygons colored: green/blue/yellow/orange/red/purple |
| `zones[].population_remaining` | People still in zone | Population counter in zone center |
| `zones[].vulnerable_remaining` | Vulnerable populations still in zone | Secondary counter, highlighted if >0 when ORDER issued |
| `zones[].clearance_eta` | Estimated time to fully evacuate | Time label in zone |
| `routes[].status` | Clear / congested / blocked | Animated flow arrows (green → yellow → red) |
| `routes[].flow_particles` | Population movement visualization | Dots flowing along route toward shelters |
| `routes[].capacity_pct` | Current utilization | Thickness/color of route line |
| `alerts_pending[]` | Queue of alerts waiting for IC approval | Alert queue in EVAC panel |
| `shelters[]` | Safe zone locations + capacity + occupancy | Green markers at destinations with capacity bars |
| `contraflow_requests[]` | Roads recommended for contraflow | Bidirectional arrows on road segment |

**Agent behaviors (autonomous):**
1. **Progressive threat escalation:** When PREDICT's 3h perimeter enters a CLEAR zone → auto-upgrade to ADVISORY → notify OVERWATCH. When PREDICT's 1h perimeter enters an ADVISORY zone → recommend upgrade to WARNING → Decision Point for IC. (Never auto-upgrade to ORDER — IC must approve mandatory evacuation.)
2. **Vulnerable population early warning:** When zone upgrades to WARNING → automatically flag all assisted living facilities, schools, hospitals in zone → request DEPLOY arrange transport → alert IC that vulnerable populations need immediate action
3. **Dynamic rerouting:** When SWARM reports route blockage (debris, fire crossing, downed power line) → instantly reroute affected traffic → recalculate clearance ETAs → alert IC if new ETAs exceed fire arrival time
4. **Capacity management:** When any route hits 80% capacity → request DEPLOY send traffic control → compute contraflow option → present to IC
5. **Zone cutoff detection:** When ALL routes for a zone intersect PREDICT's 1h perimeter → escalate to RESCUE status → request DEPLOY helicopter rescue assets → **IMMEDIATE ALERT to IC** (life safety)
6. **Evacuation progress tracking:** Monitor population remaining per zone → if zone at ORDER status but evacuation progress stalls (<5% decrease in 10 min) → alert IC: "Compliance may be low. Consider door-to-door with law enforcement."
7. **Shelter overflow management:** When shelter occupancy hits 80% → identify alternate shelters → update route destinations → notify DEPLOY for logistics

**Decision Points surfaced to IC:**
- "EVAC: Zone B3 population 2,847 (312 elderly, 45 mobility-limited). PREDICT's 1h perimeter now 0.4 mi from zone boundary. Current status: WARNING. Clearance ETA at current flow: 38 min. Fire arrival ETA: 47 min. Margin: 9 min. **Upgrade to mandatory evacuation ORDER?** [Approve / Delay 10 min / Deny]"
- "EVAC: PCH South at 94% capacity. 1,200 vehicles queued. Topanga Canyon blocked. Only Sunset Blvd remains (67% capacity). **Request contraflow on Sunset Blvd? (Doubles outbound capacity. Requires 2 DEPLOY traffic units + 15 min setup.)**"
- "EVAC: Zone C2 cut off. All routes intersect 1h fire perimeter. 340 residents remaining (22 elderly, 8 mobility-limited). **Initiate shelter-in-place protocol + helicopter rescue? (Requires DEPLOY commit 2 helicopters.)**"
- "EVAC: Sunrise Senior Living in Zone B4 — 89 residents, 12 wheelchair-bound. Zone status: WARNING. Facility cannot self-evacuate. **Request DEPLOY send 3 accessible buses + medical escort immediately?**"

---

### DEPLOY — Resource Deployment & Safety Agent

**Real-world analog:** Operations Section Chief + Logistics Section Chief + Safety Officer + IROC + ATGS (for air resource coordination)

**What it augments:** Today, the Operations Section Chief assigns resources to divisions/groups on a paper map (ICS-204 Assignment List). Logistics coordinates transport and supply. Aircraft dispatch goes through the ATGS by radio. IROC tracks personnel across 50 states but doesn't optimize positioning. DEPLOY **unifies all resource management and recommends optimal, SAFE positioning based on all agents' outputs**.

**Critical safety integration — the 10 Standard Firefighting Orders:**
DEPLOY checks every resource assignment against the 10 Orders before recommending it to IC:

```
For every crew/engine assignment:
  □ Order 1: Weather forecast reviewed (PREDICT weather data current?)
  □ Order 2: Fire behavior known (PREDICT last update < 5 min?)
  □ Order 3: Actions based on current fire behavior (not stale data?)
  □ Order 4: Escape routes identified (at least 2, verified by SWARM?)
  □ Order 5: Lookout posted (SWARM drone assigned for overwatch?)
  □ Order 6: Stay alert (crew fatigue < 14h since rest?)
  □ Order 7: Communications verified (radio check within 15 min?)
  □ Order 8: Instructions clear (assignment description unambiguous?)
  □ Order 9: Control maintained (crew supervisor identified?)
  □ Order 10: Fight fire aggressively HAVING PROVIDED FOR SAFETY FIRST

If ANY order cannot be satisfied → assignment is flagged YELLOW
If Orders 3, 4, or 5 cannot be satisfied → assignment is BLOCKED until resolved
```

**18 Watch Out Situations monitoring:**
DEPLOY continuously checks for active Watch Out Situations and alerts IC:
```
Active flags in current scenario:
  ⚠ #11: Unburned fuel between crew and fire (PREDICT perimeter check)
  ⚠ #14: Weather becoming hotter and drier (PREDICT weather trend)
  ⚠ #15: Wind increases and/or changes direction (PREDICT wind shift forecast)
  ⚠ #16: Getting frequent spot fires across line (PREDICT spotting frequency)

Additional monitoring:
  #9:  Building fireline downhill with fire below → check crew position vs fire position
  #13: On hillside where rolling material can ignite fuel below → terrain analysis
  #17: Terrain and fuels make escape to safety zones difficult → route analysis
```

**Inputs consumed:**
| Input | Real-World Source | Agent Source | Update Rate |
|-------|------------------|-------------|-------------|
| Fire predictions + active fronts | Technosylva / FBAN | PREDICT agent | Every recalculation |
| Drone coverage + safety overwatch | FIRIS / aerial recon | SWARM agent | Every 2 min |
| Evacuation route needs | County OES / Genasys | EVAC agent | Event-driven |
| Resource positions | AVL (GPS on all units) | Direct GPS feeds | Every 30 sec |
| Resource status | Crew timekeeping / IROC | Crew management | Event-driven |
| Terrain accessibility | Road network + DEM | World model | Static |
| Retardant inventory | Air tanker base ops | Supply tracking | Per-sortie |
| Water supply | Water tender levels | Supply tracking | Every 15 min |

**Resource types managed:**
```
GROUND (tracked individually):
  - Type 1 Engine (structural, 500 gal, 4 crew) — structure protection
  - Type 3 Engine (wildland, 500 gal, 3 crew) — fireline support
  - Type 6 Engine (brush, 150-400 gal, 2-3 crew) — fast, off-road
  - Hotshot Crew (20 people, Type 1) — elite, complex assignments
  - Type 2 Hand Crew (20 people) — fireline construction
  - Dozer + Dozer Boss (D6-D8, requires transport trailer)
  - Water Tender (2,000-4,000 gal) — resupply engines on fireline
  - Traffic Control Unit (law enforcement) — evacuation route management
  - Medical Unit (paramedic + ambulance) — positioned along fireline + evac routes

AIR (coordinated with SWARM for deconfliction):
  - Air Tanker (retardant, 2,400-9,400 gal capacity, 35 min turnaround)
  - Lead Plane (flies ahead of tanker, marks drop zone, clears flight path)
  - Helicopter Type 1 (water bucket 700 gal, crew transport, medevac)
  - Helicopter Type 2 (water bucket 300 gal, recon)
  - Air Attack / ATGS (OV-10A Bronco, aerial coordinator, multiple radios)
  - Drones → managed by SWARM, but DEPLOY can request specific drone tasks

SUPPORT:
  - Staging Area (pre-positioned resources waiting for assignment)
  - Base Camp (rest, food, medical, equipment maintenance)
  - Helibase (helicopter refueling, loading)
```

**Deployment optimization:**
```
For each active fire front (from PREDICT):
  1. Calculate threat priority = (ROS × flame_length × proximity_to_structures) / confidence
     Higher confidence → more aggressive positioning. Lower confidence → larger safety margins.
  2. Assign resources proportional to threat priority
  3. Position ground crews at ANCHOR POINTS (roads, ridges, streams, previously burned areas)
     → NEVER deploy in unburned fuel between crew and fire (Watch Out #11)
     → NEVER position downhill from fire unless explicitly approved by IC (Watch Out #9)
  4. LCES verification for EVERY crew before assignment is approved:
     Lookout  → Request SWARM assign overwatch drone (or designate crew lookout)
     Comms    → Verify radio contact with supervisor + OVERWATCH
     Escape   → At least 2 routes, verified clear by SWARM
     Safety Zone → Identified within 2 min travel time; into-the-black preferred
     → If LCES cannot be fully established → BLOCK assignment → alert IC
  5. Air tanker coordination (with SWARM for deconfliction):
     → Lead plane scouts drop zone, marks approach path
     → SWARM clears all drones from approach corridor
     → Retardant line placed 50-100m AHEAD of ground crew's fireline work
     → Ground crew arrival timed to arrive as retardant lands (30-60 min effective window)
     → Timer started on retardant effectiveness
  6. Pre-position resources at staging areas near PREDICT's 3h prediction perimeter
     → "Be where the fire WILL be, not where it IS"
     → Staging areas placed at road intersections with multiple egress options
  7. Structure protection triage (when fire threatens community):
     → Assess each structure: defensible space, access, water supply, fuel proximity
     → Classify: DEFENSIBLE (assign engine) / MARGINAL (assign only if resources allow) / NON-DEFENSIBLE (do not assign)
     → Present triage summary to IC for approval
     → Do NOT commit crews to non-defensible structures

For crew safety management:
  - Track cumulative work hours per crew (max 16h work to 8h rest = 2:1 ratio)
  - At 14h → flag for rotation → identify replacement from staging
  - At 16h → MANDATORY rest → pull from fireline → no exceptions
  - Track water/food supply per crew position
  - Monitor Watch Out Situations continuously

For evacuation support (from EVAC):
  → Assign traffic control units at key intersections
  → Position medical units along evacuation routes
  → Station water tender at route segments nearest fire (wet down roadside fuel)
  → Dispatch accessible buses for vulnerable population facilities
  → Assign law enforcement for door-to-door in low-compliance zones

For mutual aid management:
  → Track incoming mutual aid resources (agency, type, ETA)
  → Pre-assign incoming resources to highest-priority gaps
  → Coordinate staging area assignments for arriving resources
  → When local resources < 20% available → recommend mutual aid request to IC
```

**Outputs:**
| Output | Description | Visual on Map |
|--------|-------------|---------------|
| `units[].position` | Real-time GPS of every resource | Icons on terrain by type (engine, crew, dozer, aircraft) |
| `units[].assignment` | Current task + status | Label on icon: "Fireline", "Staging", "En Route", "Rest" |
| `units[].movement_path` | Animated route to destination | Dotted line along roads, animated movement |
| `units[].lces_status` | LCES verification per crew | Green/Yellow/Red badge on each crew icon |
| `units[].work_hours` | Hours since last rest | Timer on crew icon, turns yellow at 12h, red at 14h |
| `staging_areas[]` | Staging locations + queued resources | Hexagonal markers with resource count |
| `drop_zones[]` | Planned retardant drop lines + approach paths | Pink lines on terrain with "RETARDANT" label |
| `retardant_timers[]` | Active retardant effectiveness countdowns | Timer overlay: "RETARDANT: 27:14 remaining" |
| `structure_triage` | Defensible / marginal / non-defensible classification | Green/yellow/red on structure footprints |
| `coverage_map` | Resource coverage gaps | Green (covered) → red (gap) overlay |
| `safety_alerts[]` | Watch Out Situations + LCES violations | Pulsing red alerts on affected crews |
| `mutual_aid_status` | Incoming resources + ETAs | Icon trail showing incoming units |

**Agent behaviors (autonomous):**
1. **Predictive pre-positioning:** When PREDICT forecasts spread toward unprotected area → identify nearest staging area → recommend pre-positioning resources → alert IC
2. **LCES enforcement:** When DEPLOY assigns a crew → verify all LCES elements → request SWARM drone for lookout → if any element fails, BLOCK assignment and alert IC with specific gap
3. **Crew safety emergency (HIGHEST PRIORITY — bypasses OVERWATCH):** When PREDICT updates show fire threatening a crew's escape route → **IMMEDIATELY alert crew AND IC** → begin withdrawal procedure → SWARM assigns safety drone → do not wait for IC approval to start withdrawal
4. **Retardant lifecycle:** When air tanker drops → start effectiveness countdown → at 10 min remaining, alert IC: "Retardant on [front] expiring in 10 min. Re-drop or accept increased ROS?" → when expired, notify PREDICT to remove retardant effect from model
5. **Crew rotation:** At 14h work time → flag crew for rotation → identify replacement → propose swap to IC → at 16h, mandatory pull (2:1 work-rest ratio per NWCG standards)
6. **Evacuation support dispatch:** When EVAC requests traffic control → assign nearest law enforcement unit → when EVAC flags vulnerable facility → dispatch accessible buses + medical escort
7. **Structure triage:** When fire within 1h of community → run defensibility assessment → present triage to IC → assign engines only to defensible structures
8. **Mutual aid trigger:** When available resources drop below 20% of assigned → recommend mutual aid request → compute what types/quantities needed → present to IC for approval
9. **Night operations constraint:** At sunset → halt all aerial suppression (except IR-equipped helicopters with night vision) → notify IC → adjust resource positioning for ground-only operations → factor overnight humidity recovery into staging decisions
10. **Water supply management:** Track water tender levels → when any tender below 25% → dispatch refill → if refill ETA > 15 min, alert affected engines → compute maximum continuous operating time per engine at current flow rate

**Decision Points surfaced to IC:**
- "DEPLOY: Crew 3 building fireline on NE front. PREDICT shows their escape route (Ridge Rd) intersected by 1h fire prediction. LCES COMPROMISED — escape route threatened. **Withdrawal initiated. Approve Safety Zone Alpha as rally point? SWARM Drone-07 providing overwatch.**"
- "DEPLOY: Air Tanker 2 has fuel for one more sortie. Two targets with equal threat: (A) Retardant line on NE front protecting Crew 3's fireline work, (B) Structure protection drop on Sunset Ridge (47 homes, 38 assessed defensible). **Prioritize crew support or structure protection?**"
- "DEPLOY: 3 engine companies + 1 hand crew arriving from San Bernardino mutual aid. ETA 45 min. PREDICT's southern flank has 30% activation probability in next hour. Options: (A) Stage at South (ready for southern flank), (B) Reinforce NE front (retardant expiring in 12 min), (C) Hold at base camp pending situation development. **Assign?**"
- "DEPLOY: Sunrise Senior Living (Zone B4) — 89 residents including 12 wheelchair-bound. EVAC requested bus transport. Nearest accessible buses: 3 available at County OES depot, ETA 25 min. Medical escort required. **Approve dispatch?**"
- "DEPLOY: Crew 7 at 15.5h work time. Replacement Crew 11 at Staging North, ETA 20 min to fireline. NWCG 2:1 work-rest standard: Crew 7 must rest in 30 min. **Approve rotation?**"

---

## Simulation Scenario: Palisades Fire Recreation (v3)

A scripted 15-minute simulation (compressible to 3 min for demo) based on the January 2025 Palisades Fire timeline. Each timestamp triggers agent actions, world state changes, and cascading agent communication.

### Phase 1: Detection & Initial Attack (T+0:00 to T+2:00)

**ICS context:** First-arriving engine captain becomes IC. Fire is Type 5 (single resource). Initial attack doctrine: find anchor point, attack directly if safe.

```
T+0:00  SYSTEM    Smoke reported via ALERTCalifornia camera rotation.
                   Location: 34.045°N, 118.529°W. Camera confidence: 87%.

T+0:05  OVERWATCH INCIDENT INITIALIZED: PALISADES FIRE
                   Type: 5 (single resource). IC: Engine Captain (auto-assigned).
                   PREDICT/SWARM/EVAC/DEPLOY agents activated.
                   → Interface transitions from globe view to 3D terrain

T+0:10  PREDICT   Initial assessment computed from LANDFIRE + RAWS data:
                   Fuel: SH5 (high-load chaparral). Moisture: 3% (1hr dead fuel).
                   Wind: 25 mph NW, gusts 45. Slope: 32°.
                   Rate of Spread: 2.4 chains/hr. Flame length: 12-15 ft.
                   Spotting risk: EXTREME (ember transport up to 400m predicted).
                   → Environmental data populates PREDICT panel

T+0:15  PREDICT   Predictions generated (50 ensemble scenarios):
                   +15 min: 12 acres (conf 0.91)
                   +1h: 210 acres (conf 0.82)
                   +3h: 480 acres (conf 0.61)
                   +6h: 1,100 acres (conf 0.38)
                   → Fire prediction overlays render on terrain (red/orange/yellow/faded)

T+0:20  SWARM     Dispatching Drone-01 (IR) and Drone-02 (visual) to fire origin.
                   TFR established: 3 nm radius, surface to 3000ft AGL.
                   → Two drone icons launch from staging. TFR boundary appears.

T+0:30  SWARM     Drone-01 on station (400ft AGL). IR confirms:
                   Active fire, 8 acres, single front moving NE.
                   No structures within 0.5 mi. Anchor point identified:
                   Ridge Rd / Sunset Blvd intersection (paved, defensible).
                   → Drone feed thumbnail appears in SWARM panel

T+0:35  DEPLOY    Initial attack dispatched:
                   - Engine 12 (Type 3) — ETA 8 min — anchor at Ridge Rd
                   - Engine 15 (Type 6) — ETA 12 min — flanking assignment
                   - Engine 22 (Type 3) — ETA 15 min — water supply
                   - Hand Crew 7 (Type 2, 20 persons) — ETA 20 min — fireline construction
                   LCES: Lookout = Drone-01. Comms = verified. Escape = Ridge Rd south.
                   Safety Zone = Sunset Blvd parking area (0.5 acres paved).
                   → Unit icons appear on roads, animated movement toward fire

T+0:40  EVAC      Zone assessment complete (8 zones within 6h prediction):
                   B3 (pop 2,847): ADVISORY — 1h perimeter approaches boundary
                   B4 (pop 1,560): CLEAR — outside 3h perimeter
                   C1 (pop 4,200): CLEAR — outside 6h perimeter
                   Vulnerable populations flagged: Sunrise Senior Living in B4 (89 residents).
                   Pre-computing 3 evacuation routes for B3.
                   → Zone polygons appear on terrain, colored by status

T+1:00  DEPLOY    Engine 12 on scene. Size-up: 15 acres, moving upslope NE.
                   Anchor point established at Ridge Rd intersection.
                   Direct attack on south flank initiated.
                   → Engine icon arrives, fireline animation begins

T+1:15  OVERWATCH INCIDENT TYPE ESCALATION: Type 5 → Type 3.
                   Fire exceeding single-resource capability. Requesting IMT-3.
                   IC: upgraded to IC3 (Incident Commander Type 3).
                   Additional resources ordered through IROC.
                   → Status bar updates: "TYPE 3" badge appears

T+1:30  DEPLOY    Additional resources ordered:
                   - 2 more engines (Type 3) — ETA 25 min
                   - 1 Hotshot Crew (Crew 3, 20 persons) — ETA 35 min
                   - 1 Air Tanker (AT-2) — ETA 20 min
                   - 1 Dozer — ETA 45 min (requires transport)
                   SWARM: Requesting OV-10A Air Attack platform overhead.
                   → New unit icons appear at edges of map, moving inbound

T+1:45  OVERWATCH Status: 4 agents active. Initial attack in progress.
                   PREDICT confidence stable at 0.82. No decisions needed yet.
                   Watch Out Situations active: #14 (hotter/drier), #11 (unburned fuel NE).
                   → Event feed shows steady stream of agent updates
```

### Phase 2: Escalation — Spot Fire & Wind Shift Warning (T+2:00 to T+5:00)

**ICS context:** Fire growing beyond initial attack. Extended attack resources arriving. FBAN (PREDICT) detecting concerning trends.

```
T+2:00  PREDICT   Fire at 45 acres. Observed ROS exceeding prediction by 18%.
                   Self-calibrating: adjusting ROS to 3.1 chains/hr.
                   Predictions revised upward. 1h: 240 acres. 3h: 520 acres.
                   → Fire overlay expands on terrain

T+2:15  PREDICT   ⚠ EMBER TRANSPORT ALERT:
                   Convection column reaching 3,000 ft. Ember lofting model predicts
                   78% probability of spot fire within 400m NE of perimeter.
                   Target zone marked. SWARM requested to confirm.
                   → Blinking yellow probability zone appears NE of fire

T+2:20  SWARM     Redirecting Drone-03 (IR) to scan NE spot fire zone.
                   Drone-03 departing perimeter mapping. Coverage gap on SE flank
                   for est. 4 min during reposition.
                   → Drone-03 icon moves toward yellow zone

T+2:30  SWARM     Drone-03 IR scan POSITIVE. Heat signature at 34.048°, -118.524°.
                   Hotspot: approx 0.5 acres, active flame. CONFIRMED SPOT FIRE.
                   → Yellow zone turns red blinking dot on terrain

T+2:32  PREDICT   SPOT FIRE INTEGRATED into model. Recalculating all predictions.
                   Revised: +1h: 260 acres (+8%). +3h: 580 acres (+12%).
                   Confidence dropped to 0.74 (active spotting penalty -0.10).
                   Zone B3 now within 3h prediction perimeter.
                   → Prediction overlays morph to new irregular shapes

T+2:35  OVERWATCH ━━━ DECISION POINT 1 ━━━
                   Context: Spot fire confirmed 400m NE. Zone B3 (pop 2,847)
                   now within 3h fire prediction perimeter (conf 0.74).
                   Zone B3 current status: ADVISORY.

                   EVAC recommends: Upgrade Zone B3 to WARNING.
                   Rationale: Fire arrival to zone boundary est. 2h 47min.
                   Evacuation clearance time est. 38 min (3 routes available).
                   Safety margin: ~2h 09min. Adequate, but spotting could reduce.

                   Vulnerable populations in B3: 312 elderly, 45 mobility-limited.
                   EVAC additionally recommends: Begin vulnerable population
                   transport now (don't wait for ORDER).

                   ➤ [APPROVE WARNING + VULNERABLE TRANSPORT]
                   ➤ [APPROVE WARNING ONLY]
                   ➤ [HOLD — MONITOR 15 MIN]
                   → Decision modal appears over terrain. B3 zone highlights.

T+2:40  (IC approves WARNING + vulnerable transport)

T+2:42  EVAC      Zone B3 upgraded to WARNING. Multi-channel alert pushed:
                   - WEA alert (English + Spanish + Mandarin)
                   - Genasys Protect zone notification
                   - Reverse-911 to registered numbers
                   3 evacuation routes activated:
                   - R1 Sunset Blvd West: CLEAR, capacity 67%, 4 lanes
                   - R2 PCH South: CLEAR, capacity 34%, 4 lanes
                   - R3 Topanga Canyon: CLEAR, capacity 45%, 2 lanes (narrow — flagged)
                   → Green route lines with flow arrows appear on terrain

T+2:45  DEPLOY    Responding to EVAC vulnerable transport request:
                   - 2 accessible buses dispatched to Zone B3 assisted living (ETA 18 min)
                   - 1 medical escort unit assigned
                   - Traffic control unit dispatched to Sunset/PCH intersection
                   - Repositioning Engine-22 to Sunset Blvd staging area
                   → Bus + traffic unit icons appear, moving toward B3

T+3:00  DEPLOY    Air Tanker AT-2 on station. Lead plane (LP-1) scouting drop zone.
                   SWARM: clearing drone corridor for tanker approach to NE front.
                   → SWARM Drone-03 and Drone-04 reposition to safe distance

T+3:05  DEPLOY    AT-2 retardant drop on NE front. 3,000 gal Phos-Chek.
                   Retardant line: 400m along NE slope.
                   Effectiveness timer started: 45:00.
                   → Pink retardant line renders on terrain. Timer overlay appears.

T+3:08  PREDICT   Retardant effect integrated. NE front ROS reduced 50% (1.5 ch/hr)
                   within retardant zone. Predictions revised slightly downward.
                   → Orange prediction overlay contracts slightly on NE

T+3:15  DEPLOY    Hotshot Crew 3 (20 persons) arriving at staging.
                   Assignment: Construct direct-attack fireline on NE flank,
                   working from anchor point (Ridge Rd) eastward.
                   LCES verified:
                     Lookout: SWARM Drone-07 (assigned)
                     Comms: Radio check GOOD
                     Escape Routes: Ridge Rd south (primary), Sunset Blvd west (secondary)
                     Safety Zone: Alpha (Sunset parking lot, 0.5 ac paved)
                   10 Standard Orders: ALL SATISFIED ✓
                   Watch Out: #11 active (unburned fuel NE of crew — acknowledged)
                   → Crew 3 icon moves to fireline. SWARM assigns Drone-07 overhead.

T+3:30  SWARM     Fleet status: 8/14 drones deployed. Coverage: 72%.
                   Drone-05 assigned to monitor evacuation route R2 (PCH South).
                   Drone-09 assigned to scan predicted spot fire zone east.

T+3:45  PREDICT   ⚠ WEATHER INTELLIGENCE:
                   NWS spot forecast update: Wind shift NW → NE predicted
                   in ~90 min (73% confidence). Speed increasing to 30 mph,
                   gusts to 50 mph.
                   Impact assessment:
                   - Fire front would redirect toward Zone B4 (pop 1,560)
                   - Zone B4 fire arrival: 1.5h under shifted wind (vs 4h+ current)
                   - Evacuation route R3 (Topanga Canyon) may be cut
                   - Crew 3 escape route (Ridge Rd) remains viable under shifted wind
                   Overall confidence reduced to 0.68 (wind uncertainty penalty -0.15).
                   → Wind arrows on terrain begin slowly rotating. Confidence bar turns yellow.

T+4:00  OVERWATCH ━━━ DECISION POINT 2 ━━━
                   Context: PREDICT forecasts wind shift NW→NE in ~90 min (73% conf).
                   If shift occurs:
                   - Zone B4 (pop 1,560, currently CLEAR) reached in 1.5h
                   - Sunrise Senior Living in B4: 89 residents (12 wheelchair)
                   - Route R3 (Topanga) potentially cut
                   - Crew 3 escape route still viable but margin reduced

                   EVAC recommends: Preemptive ADVISORY for Zone B4.
                   Begin Sunrise Senior Living evacuation immediately.
                   DEPLOY recommends: Pre-position 2 engines at B4 staging area.

                   ➤ [APPROVE ALL (ADVISORY + SENIOR EVAC + PRE-POSITION)]
                   ➤ [APPROVE ADVISORY ONLY — WAIT ON RESOURCES]
                   ➤ [WAIT FOR WIND SHIFT CONFIRMATION]
                   → Decision modal. B4 zone highlights. Sunrise facility pulses.
```

### Phase 3: Crisis — Wind Shift Confirmed, Cascading Failures (T+5:00 to T+9:00)

**ICS context:** Incident escalating to Type 2. Wind shift creates cascading threats. Multiple concurrent crises require IC to prioritize competing demands.

```
T+5:00  (IC approved all — ADVISORY B4, senior evac, pre-position)

T+5:05  EVAC      Zone B4 ADVISORY issued. Sunrise Senior Living: immediate evacuation
                   initiated. 3 accessible buses en route (ETA 20 min).

T+5:10  DEPLOY    Pre-positioning Engine 31 and Engine 35 to B4 staging area.

T+5:30  PREDICT   ⚠⚠ WIND SHIFT CONFIRMED.
                   Wind now NE at 30 mph, gusts 50 mph.
                   Santa Ana pattern intensifying.
                   RECALCULATING ALL PREDICTIONS.
                   → All prediction overlays shimmer and dramatically reshape

T+5:35  PREDICT   ⚠⚠ CRITICAL UPDATE:
                   All predictions revised:
                   +15 min: 190 acres (conf 0.85)
                   +1h: 380 acres (conf 0.68)
                   +3h: 890 acres (conf 0.44)
                   +6h: 2,100 acres (conf 0.25)
                   Fire front REDIRECTED northeast toward Zone B4.
                   ETA to B4 boundary: 52 min.
                   Crown fire transition detected on NE slope — ROS: 4.8 ch/hr.
                   Flame length: 20-30 ft. Watch Out #15 ACTIVE (wind change).
                   Overall confidence: 0.55 (wind shift + crown fire penalties).
                   → Prediction overlays dramatically expand. NE front pulses red.
                   → Confidence bar turns red.

T+5:38  EVAC      ⚠ ROUTE R3 (Topanga Canyon) now intersects PREDICT's 1h perimeter.
                   STATUS: BLOCKED. Rerouting 340 vehicles to R1 and R2.
                   R2 (PCH South) capacity surging to 89% with rerouted traffic.
                   → R3 turns red with animated X. Flow arrows redirect to R1/R2.

T+5:40  DEPLOY    ⚠⚠ CREW SAFETY ALERT (BYPASSES OVERWATCH — LIFE SAFETY):
                   Crew 3 on NE fireline. Wind shift has increased ROS to 4.8 ch/hr.
                   Crown fire transition occurring above crew position.
                   LCES CHECK:
                     Escape Route 1 (Ridge Rd south): VIABLE (7 min to Safety Zone Alpha)
                     Escape Route 2 (Sunset Blvd west): VIABLE (12 min)
                     Safety Zone Alpha: 0.5 acres paved — ADEQUATE for 20-person crew
                   Current margin: escape time (7 min) vs fire arrival (22 min) = 15 min margin.
                   DEPLOY recommends: WITHDRAW Crew 3 to Safety Zone Alpha.
                   Reason: Crown fire + wind shift + Watch Out #15 → 2:1 safety margin needed.
                   → Crew 3 icon pulses red. Escape route highlights on terrain.

T+5:42  OVERWATCH ━━━ CRITICAL DECISION POINT 3 ━━━
                   MULTIPLE CONCURRENT CRISES — IC must prioritize:

                   1. CREW SAFETY: Crew 3 withdrawal recommended.
                      Crown fire on NE slope. 15 min margin. DEPLOY already initiated
                      withdrawal preparations. SWARM Drone-07 on overwatch.
                      → [APPROVE WITHDRAWAL TO SZ-ALPHA]

                   2. EVACUATION ESCALATION: Zones B3 + B4.
                      B3 (WARNING, pop 2,847): 42% evacuated. Fire arrival: 47 min.
                      B4 (ADVISORY, pop 1,560): 0% evacuated. Fire arrival: 52 min.
                      Sunrise Senior Living buses: 12 min out.
                      EVAC recommends: MANDATORY ORDER for B3 + B4 immediately.
                      → [APPROVE MANDATORY EVACUATION ORDER]

                   3. AIR SUPPORT: NE front crown fire.
                      AT-2 retardant from earlier drop: 12 min remaining.
                      AT-4 available at Hemet base, ETA 18 min.
                      Retardant drop could slow crown fire, buying time for both
                      Crew 3 withdrawal and B4 evacuation.
                      → [REQUEST AT-4 RETARDANT DROP ON NE FRONT]

                   ➤ [APPROVE ALL THREE] [SELECT INDIVIDUALLY]
                   → Large crisis modal. All three areas highlight on terrain.
                   → Alarm tone. UI enters CRISIS state (red vignette, pulsing borders).

T+5:45  (IC approves all three)

T+5:46  DEPLOY    Crew 3 WITHDRAWING to Safety Zone Alpha. Crew supervisor
                   acknowledging via radio. Movement initiated. ETA: 6 min.
                   → Crew 3 icon moves rapidly toward SZ-Alpha. Route highlighted green.

T+5:47  SWARM     Drone-07 maintaining safety overwatch on Crew 3.
                   IR tracking crew movement. No fire threat on escape route.
                   → Drone-07 icon follows crew, cone pointed down

T+5:48  EVAC      MANDATORY EVACUATION ORDER issued: Zones B3 + B4.
                   Total population: 4,407. Vulnerable remaining: 524.
                   Multi-channel alert: WEA + Genasys + reverse-911 + PA vehicles.
                   Contraflow requested on Sunset Blvd (doubles outbound capacity).
                   DEPLOY: requesting 2 additional traffic units + law enforcement for
                   door-to-door in non-compliant areas.
                   → Zone polygons turn red. Population dots begin flowing on routes.

T+5:50  DEPLOY    AT-4 scrambled from Hemet. ETA 16 min to NE front.
                   Lead plane LP-2 being assigned.
                   SWARM: pre-clearing drone corridor for approach.

T+5:52  DEPLOY    Crew 3 SAFE at Safety Zone Alpha. All 20 personnel accounted for.
                   → Green checkmark on Crew 3 icon. Event feed: "✓ Crew 3 safe at SZ-Alpha"
                   → CRISIS indicator for crew safety resolves. UI slightly de-escalates.

T+6:00  EVAC      Sunrise Senior Living evacuation: 3 buses arrived.
                   Loading 89 residents. Medical escort on site.
                   Estimated loading time: 25 min. Route: Sunset Blvd to SM High School.
                   → Bus icons at facility, loading animation

T+6:10  DEPLOY    AT-4 + LP-2 inbound. SWARM clearing corridor.
                   Drop zone: NE slope, 500m line along crown fire front.
                   → Aircraft icons approaching fire from SW

T+6:15  DEPLOY    AT-4 RETARDANT DROP COMPLETE. 4,200 gal Phos-Chek on NE slope.
                   Effectiveness timer: 45:00.
                   → New pink retardant line on terrain. Timer starts.

T+6:18  PREDICT   Retardant effect integrated. NE crown fire ROS reduced to 1.8 ch/hr
                   (from 4.8). Predictions revised:
                   +1h: 320 acres (was 380). B4 fire arrival pushed back to 68 min (was 52).
                   Confidence partially recovers to 0.62.
                   → Prediction overlays contract on NE. Confidence bar improves slightly.

T+6:30  OVERWATCH INCIDENT TYPE ESCALATION: Type 3 → Type 2.
                   Fire complexity exceeds local IMT capability.
                   Requesting CIMT (Complex Incident Management Team).
                   Unified Command activated: CAL FIRE + LAFD + LA County Sheriff.
                   → Status bar: "TYPE 2 | UNIFIED COMMAND" badge

T+7:00  EVAC      Evacuation progress:
                   B3: 1,650/2,847 evacuated (58%). Clearance ETA: 32 min.
                   B4: 420/1,560 evacuated (27%). Clearance ETA: 48 min.
                   Sunrise Senior Living: COMPLETE. 89 residents at SM High School.
                   R1 (Sunset, contraflow): 72% capacity. Flowing well.
                   R2 (PCH): 85% capacity → nearing congestion.
                   → Population counters decrement. Facility icon turns green.

T+7:15  EVAC      ⚠ R2 (PCH South) at 88% capacity with B4 traffic entering.
                   DEPLOY: Requesting additional traffic control at PCH/Malibu Canyon.
                   Alternate route analysis: Malibu Canyon Rd — viable but narrow (2 lanes).
                   → R2 turns yellow on terrain

T+7:30  DEPLOY    ⚠ RETARDANT TIMER: First drop (T+3:05) EXPIRED.
                   NE front south section: retardant no longer effective.
                   ROS increasing on that segment.
                   PREDICT notified to remove retardant effect from model.
                   → First retardant line fades. Timer shows "EXPIRED" in red.

T+7:45  PREDICT   Southern NE segment ROS back to 3.5 ch/hr. Northern segment
                   (AT-4 drop) holding at 1.8 ch/hr (37 min remaining).
                   Updated prediction: fire reaching B4 boundary ETA 55 min.
                   Confidence: 0.58.

T+8:00  OVERWATCH Status update:
                   Fire: 310 acres. Containment: 8% (western perimeter only).
                   Active Watch Out: #11, #14, #15, #16 (spotting increasing).
                   Crew 3 at SZ-Alpha — awaiting retardant support to re-engage.
                   Evacuation: B3 72%, B4 38%.
                   Confidence: 0.58 (degraded by wind + spotting).
```

### Phase 4: Stabilization & Structure Protection (T+9:00 to T+12:00)

**ICS context:** CIMT arriving. Mutual aid flowing in. Fire growth slowing as retardant + fireline take effect. Evacuation nearing completion. Structure protection decisions ahead.

```
T+9:00  DEPLOY    Mutual aid arriving from San Bernardino County:
                   3 engine companies (Type 3) + 1 Type 2 hand crew.
                   → New unit icons appear at staging area

T+9:05  OVERWATCH ━━━ DECISION POINT 4 ━━━
                   Context: Mutual aid resources available. Multiple needs:
                   A. Reinforce NE front (retardant expiring in 8 min, Crew 3
                      waiting to re-engage but needs fresh support)
                   B. Extend western containment line south (12% contained,
                      opportunity to reach 25% before conditions change)
                   C. Structure protection: Sunset Ridge community (47 homes)
                      now within PREDICT's 3h perimeter. Triage assessment:
                      - 38 homes DEFENSIBLE (good clearance, hydrants)
                      - 6 homes MARGINAL (limited access)
                      - 3 homes NON-DEFENSIBLE (surrounded by chaparral, no access)

                   DEPLOY recommends Option A + begin structure triage:
                   - Send 2 engines to NE front supporting Crew 3
                   - Send 1 engine + hand crew to begin Sunset Ridge structure prep
                   - Begin structure protection triage (requires IC approval for triage policy)

                   ➤ [APPROVE DEPLOY RECOMMENDATION]
                   ➤ [PRIORITIZE WESTERN LINE EXTENSION]
                   ➤ [ALL RESOURCES TO STRUCTURE PROTECTION]
                   → Structure triage overlay appears on Sunset Ridge. Green/yellow/red homes.

T+9:10  (IC approves DEPLOY recommendation)

T+9:15  DEPLOY    Resources assigned:
                   - Engine 41 + Engine 43 → NE front (support Crew 3 re-engagement)
                   - Engine 45 + Hand Crew 9 → Sunset Ridge structure protection
                   Crew 3: cleared to re-engage NE fireline from SZ-Alpha.
                   LCES re-verified. New escape route added (dozer line from T+8:30).
                   → Units move to assignments. Crew 3 icon returns to fireline.

T+9:30  DEPLOY    AT-4 second sortie retardant timer: EXPIRED.
                   NE front ROS increasing. DEPLOY requesting third sortie.
                   AT-4 turnaround: 35 min. Available at ~T+10:05.

T+9:45  EVAC      Evacuation progress:
                   B3: 2,501/2,847 (88%). Remaining: mostly elderly sheltering by choice.
                   B4: 1,248/1,560 (80%). Remaining: 312, including unhoused encampment
                       near Topanga (est. 25 individuals, no phone alerts received).
                   EVAC: Requesting DEPLOY send law enforcement + outreach team
                   to unhoused encampment for in-person notification.
                   → Low-compliance areas highlighted on map

T+10:00 PREDICT   Fire at 370 acres. NE front: Crew 3 fireline holding in retardant zone.
                   Southern flank: stable (Watch Out #16 — spotting frequency increasing).
                   Western perimeter: containment line holding. Now 18% contained.
                   Confidence stabilizing at 0.62 as wind steadies.
                   Night forecast: Wind decreasing to 15 mph after sunset (17:08).
                   Humidity rising to 28% overnight. ROS will decrease ~40%.

T+10:30 DEPLOY    Structure protection active at Sunset Ridge:
                   - 38 defensible homes: brush clearing, sprinkler setup, engine standby
                   - 6 marginal homes: pre-positioned water supply, conditional defense
                   - 3 non-defensible homes: NO RESOURCES ASSIGNED (per triage policy)
                   → Structure icons update: green (prepped), yellow (conditional), red (abandoned)

T+11:00 OVERWATCH ━━━ DECISION POINT 5: NIGHT TRANSITION ━━━
                   Sunset in 1h 08 min (17:08). Night operations constraints:
                   - ALL fixed-wing aerial operations CEASE at sunset
                   - Helicopter operations: IR-equipped only, restricted altitude
                   - SWARM drones: IR-only mode, reduced fleet (safety)
                   - Ground crews: increased hazard (Watch Out #2: country not seen in daylight)

                   PREDICT overnight forecast:
                   - Wind: 15 mph (reduced from 30). Humidity: 28% (up from 12%).
                   - ROS: expected decrease 40%. Fire likely to "lay down" after 20:00.
                   - BUT: Santa Ana pattern may reassert at dawn — PREDICT confidence LOW
                     for tomorrow morning conditions.

                   DEPLOY recommends night shift plan:
                   - Transition to indirect attack (hold containment lines, no new fireline)
                   - Crew rotation: Day crews to base camp by 18:00 (14h+ on duty)
                   - Night crew deployment: 22 engines, 6 hand crews, 4 dozers
                   - Maintain SWARM IR surveillance (8 drones, IR-only)
                   - Structure protection: maintain engine standby at Sunset Ridge

                   ➤ [APPROVE NIGHT OPERATIONS PLAN]
                   ➤ [MAINTAIN AGGRESSIVE OPERATIONS THROUGH NIGHT]
                   → Night transition overlay dims terrain slightly. Sun angle visualization.

T+11:30 DEPLOY    Crew 3 at 14.5h work time. Rotation initiated.
                   Night Crew 11 arriving at NE fireline. Handoff in progress.
                   → Crew 3 icon → "ROTATING" status. Crew 11 icon arriving.

T+12:00 OVERWATCH Night operations transition complete.
                   Fire: 420 acres. Containment: 24%.
                   All evacuations: 94% complete.
                   All day crews rotated. Night crews LCES verified.
                   SWARM: 8 drones IR-only. No fixed-wing aerial until dawn.
```

### Phase 5: Resolution & Impact Comparison (T+12:00 to T+15:00)

```
T+12:30 EVAC      Final evacuation status:
                   B3: 2,760/2,847 (97%). 87 sheltering in place (informed choice).
                   B4: 1,498/1,560 (96%). 62 remaining (including 25 unhoused, contacted).
                   All shelters at capacity. SM High School: 847/2000.
                   Contraflow released on Sunset Blvd. All routes demobilizing.

T+13:00 PREDICT   Fire activity decreasing with nightfall.
                   ROS: 0.8 ch/hr (down from peak 4.8). Humidity: 22% (rising).
                   1h prediction: +15 acres (vs +100 earlier).
                   Containment lines holding. Confidence recovering: 0.71.
                   ⚠ Tomorrow forecast: Potential Santa Ana resurgence at dawn.
                   OVERWATCH will generate pre-dawn briefing and Decision Point.

T+14:00 DEPLOY    Night shift status:
                   22 engines, 6 hand crews, 4 dozers on containment.
                   Structure protection: 4 engines on standby at Sunset Ridge.
                   All crews LCES verified. No safety concerns.
                   Water supply: 68% (3 tenders refilling). Retardant: 12,000 gal at base.

T+14:30 SWARM     Night IR sweep complete. No new spot fires detected.
                   Perimeter stable. Hot spots cooling in mop-up zones.
                   8 drones maintaining pattern. 6 charging for dawn surge.
                   → Coverage map shows green across all active fronts

T+15:00 OVERWATCH ━━━ SIMULATION COMPLETE ━━━

                   FIRESIGHT INCIDENT SUMMARY
                   ┌─────────────────────────────────────────────────┐
                   │ Duration:             15 hours                  │
                   │ Final size:           420 acres                  │
                   │ Containment:          24%                        │
                   │ Structures destroyed: 0                          │
                   │ Civilian fatalities:  0                          │
                   │ Firefighter injuries: 0                          │
                   │ Civilians evacuated:  4,258 / 4,407 (97%)       │
                   │ Vulnerable pop evac:  524 / 524 (100%)           │
                   │ IC decisions made:    5                          │
                   │ Agent actions:        1,247                      │
                   │ Agent-to-agent msgs:  3,891                      │
                   │ Drone flight hours:   168                        │
                   │ Avg decision time:    < 45 seconds               │
                   │ Safety violations:    0                          │
                   │ LCES checks passed:   142/142                    │
                   │                                                  │
                   │  COMPARISON: ACTUAL PALISADES FIRE (JAN 2025)   │
                   │ ─────────────────────────────────────────────── │
                   │ Structures destroyed: 6,837                     │
                   │ Lives lost:           11                         │
                   │ Evacuation alert delay: 4+ hours                │
                   │ People who fled on foot / by car on PCH: 1000s  │
                   │ Hydrants that ran dry: ALL three 1M-gal tanks   │
                   │ Total damage:         $76+ billion               │
                   │                                                  │
                   │  "What if they had FireSight?"                   │
                   └─────────────────────────────────────────────────┘
```

---

## Agent Communication Protocol

### Message Format
```json
{
  "id": "msg-2847",
  "from": "PREDICT",
  "to": "OVERWATCH",
  "type": "UPDATE",
  "priority": "URGENT",
  "timestamp": "T+05:35",
  "payload": {
    "message": "Crown fire transition confirmed on NE slope. ROS 4.8 ch/hr.",
    "data": {
      "front_id": "NE-1",
      "ros_ch_hr": 4.8,
      "flame_length_ft": 25,
      "fire_type": "active_crown",
      "confidence": 0.55,
      "watch_out_situations": [11, 14, 15]
    },
    "requires_action": true,
    "recommended_action": "Crew 3 withdrawal + air tanker drop + evacuation escalation",
    "affected_agents": ["DEPLOY", "EVAC", "SWARM"]
  }
}
```

### Priority Levels
| Priority | Routing | Example |
|----------|---------|---------|
| ROUTINE | Queued in Event Feed | "Drone-05 battery at 45%" |
| URGENT | Highlighted in Event Feed, agent panels update | "ROS exceeding prediction by 25%" |
| CRITICAL | Immediate Decision Point generated | "Crown fire transition detected" |
| EMERGENCY | **Bypasses OVERWATCH. Direct to IC + affected crews.** | "Crew escape route compromised" |

### Communication Chains

```
Chain 1: Fire Spread Update (normal flow)
  PREDICT updates prediction
    → OVERWATCH receives, checks against incident objectives
    → OVERWATCH checks for Watch Out Situation triggers
    → OVERWATCH notifies EVAC (zone threat reassessment)
    → OVERWATCH notifies DEPLOY (resource repositioning)
    → EVAC recalculates routes + zone statuses, reports back
    → DEPLOY rechecks crew LCES against new predictions, reports back
    → OVERWATCH synthesizes, generates Decision Point if thresholds crossed
    → Event Feed shows entire chain in 3-5 seconds
    Total latency: ~5 seconds from prediction to recommendation

Chain 2: Spot Fire Detection
  SWARM drone detects heat anomaly
    → SWARM requests confirmation pass (second drone or second orbit)
    → SWARM confirms spot fire, notifies OVERWATCH with location + size
    → OVERWATCH notifies PREDICT (integrate new ignition point)
    → PREDICT recalculates all predictions (triggers Chain 1 cascade)
    → DEPLOY dispatches nearest available resource to spot fire
    → EVAC reassesses zones near spot fire location
    Total latency: ~2 min from detection to resource dispatch

Chain 3: Evacuation Escalation
  EVAC detects zone entering PREDICT's 1h prediction perimeter
    → EVAC computes evacuation timing analysis (clearance time vs fire arrival)
    → EVAC recommends status upgrade, notifies OVERWATCH
    → OVERWATCH generates Decision Point for IC (with timing analysis)
    → IC approves
    → EVAC issues multi-channel alerts (WEA, Genasys, reverse-911)
    → EVAC activates routes, begins flow visualization
    → DEPLOY assigns traffic control + medical + buses for vulnerable populations
    → SWARM assigns drone for route verification
    Total latency from IC approval to public alert: ~15 seconds
    (vs 20-30 min in current bureaucratic chain)

Chain 4: Crew Safety Emergency (HIGHEST PRIORITY — bypasses normal flow)
  DEPLOY detects crew escape route intersects PREDICT's updated perimeter
    → DEPLOY immediately: alerts crew via radio ("WITHDRAW TO SZ-ALPHA")
    → DEPLOY immediately: alerts IC (EMERGENCY priority, no queue)
    → SWARM immediately: redirects nearest drone for safety overwatch
    → PREDICT: fast-recalculates for escape route corridor ONLY (30-second model)
    → DEPLOY: tracks crew movement toward safety zone, confirms arrival
    → OVERWATCH: logs event, updates COP after crew is safe
    Total latency from threat detection to crew notification: < 10 seconds
    (In Yarnell Hill, crew had < 2 min warning. In Mann Gulch, zero warning.)

Chain 5: Air Tanker Coordination (multi-agent synchronization)
  DEPLOY determines retardant drop needed
    → DEPLOY requests tanker from GACC/Air Attack (confirms availability)
    → SWARM receives drone corridor clearance request
    → SWARM repositions all drones from approach path (30-second buffer)
    → SWARM confirms corridor clear
    → DEPLOY authorizes tanker approach, Lead Plane scouts drop zone
    → Lead Plane marks approach, ATGS clears airspace
    → Tanker drops retardant
    → PREDICT integrates retardant effect into model (ROS reduction in drop zone)
    → DEPLOY starts effectiveness countdown timer
    → SWARM resumes normal drone operations in cleared corridor
    Total coordination time: ~3 min (vs 10-15 min voice-radio coordination today)
```

---

## Visual Simulation States

### Terrain Layer States
| State | Trigger | Visual | Audio |
|-------|---------|--------|-------|
| IDLE | No simulation | Clean terrain, neutral lighting | Ambient wind |
| ACTIVE | Simulation running | Fire zones, drones, routes visible | Low operational hum |
| ESCALATING | New threat detected | Prediction overlays morphing, agents updating | Alert tones |
| CRISIS | Critical Decision Point | Red vignette, pulsing UI, multiple highlights | Alarm tone |
| RESOLVED | Decision made + executed | Smooth transitions, updated overlays | Confirmation tone |

### Agent Panel States
| State | Visual | When |
|-------|--------|------|
| STANDBY | Gray status dot, dim panel | Agent monitoring, no active tasks |
| ACTIVE | Blue dot, metrics updating | Processing data, providing updates |
| ALERT | Orange dot, orange border glow | New information requires attention |
| CRITICAL | Red pulsing dot, red border, hazard stripe | Life safety threat, immediate action needed |
| EXECUTING | Green dot, progress bar | Carrying out IC-approved action |
| DEGRADED | Yellow dot, confidence warning | Agent output reliability reduced |

### Confidence Visualization
| Score | Color | Meaning |
|-------|-------|---------|
| 0.80+ | Green | High confidence — predictions reliable |
| 0.60-0.79 | Yellow | Moderate — predictions usable but margins needed |
| 0.40-0.59 | Red | Low — predictions unreliable, increase safety margins |
| <0.40 | Pulsing red + text warning | Very low — consider predictions advisory only |

### Event Feed Entry Types
| Type | Color | Icon | Sound | Example |
|------|-------|------|-------|---------|
| INFO | Gray | ○ | None | "Drone-05 on station" |
| UPDATE | Blue | ◆ | Soft click | "PREDICT: 1h prediction updated" |
| SAFETY | Green | ✓ | None | "Crew 3 LCES verified" |
| ALERT | Orange | ▲ | Alert tone | "EVAC: Route R2 at 85% capacity" |
| CRITICAL | Red | ⚠ | Alarm | "DEPLOY: Crew escape route threatened" |
| DECISION | White/Gold | ★ | Decision chime | "OVERWATCH: IC decision required" |
| RESOLVED | Green | ✓ | Confirmation | "Crew 3 safe at Safety Zone Alpha" |

---

## Implementation Notes

### Data Flow
```
Scenario Script (JSON timeline)
  → SimulationEngine (advances clock, emits events)
    → World State store (updated by events, triggers React re-renders)
      → TerrainScene (3D overlays: fire, drones, routes, units, retardant)
      → AgentPanels (metrics, status dots, confidence bars)
      → EventFeed (scrolling log, auto-scroll, color-coded)
      → DecisionModal (appears when triggered, pauses sim clock)
      → ConfidenceBar (overall system confidence indicator)
      → SafetyMonitor (Watch Out Situations + LCES status dashboard)
```

### Scenario Script Format
```json
{
  "scenario": "PALISADES_FIRE_2025",
  "version": 3,
  "location": { "lat": 34.045, "lng": -118.529, "name": "Pacific Palisades, CA" },
  "duration_sim_minutes": 15,
  "playback_speeds": [1, 2, 5, 10],
  "events": [
    {
      "sim_time": "0:00",
      "agent": "SYSTEM",
      "type": "INFO",
      "priority": "ROUTINE",
      "message": "Smoke reported via ALERTCalifornia camera. Location: 34.045°N, 118.529°W.",
      "world_state_patch": {
        "incident.status": "ACTIVE",
        "incident.type": 5,
        "incident.acres": 5,
        "fire.perimeter": "geojson:palisades_t0.json"
      },
      "terrain_actions": [
        { "action": "show_fire_zone", "zone": 0, "shape": "geojson:zone0_t0.json" }
      ],
      "panel_updates": {
        "PREDICT": { "state": "ACTIVE" },
        "SWARM": { "state": "ACTIVE" },
        "EVAC": { "state": "ACTIVE" },
        "DEPLOY": { "state": "ACTIVE" }
      }
    },
    {
      "sim_time": "2:35",
      "agent": "OVERWATCH",
      "type": "DECISION",
      "priority": "URGENT",
      "message": "Spot fire confirmed NE. Zone B3 within 3h perimeter. Upgrade to WARNING?",
      "decision": {
        "id": "DP-1",
        "title": "Zone B3 Evacuation Status",
        "context": "Spot fire confirmed 400m NE. B3 (pop 2,847) now in 3h prediction.",
        "options": [
          {
            "label": "APPROVE WARNING + VULNERABLE TRANSPORT",
            "recommended": true,
            "triggers": ["evac_b3_warning", "deploy_vulnerable_transport"]
          },
          {
            "label": "APPROVE WARNING ONLY",
            "triggers": ["evac_b3_warning"]
          },
          {
            "label": "HOLD — MONITOR 15 MIN",
            "triggers": ["delay_15min_recheck"]
          }
        ],
        "pause_simulation": true,
        "auto_resolve_seconds": 30,
        "auto_resolve_option": 0
      }
    }
  ]
}
```

### Key Components to Build
1. **SimulationEngine** — Reads scenario JSON, manages sim clock (with pause/speed), emits events
2. **WorldState store** — Centralized state updated by events, drives all component rendering
3. **EventFeed** — Scrolling log, color-coded, with agent avatars and timestamps
4. **DecisionModal** — Overlay card with options, pauses sim, auto-resolves after timeout for demo
5. **ConfidenceBar** — System-wide confidence indicator with degradation reasons tooltip
6. **SafetyMonitor** — Active Watch Out Situations + LCES status per crew (collapsible panel)
7. **AgentPulse** — Cascading glow lines between agents on terrain when communication chains fire
8. **PopulationFlow** — Particle system showing people moving along evacuation routes
9. **ResourceMovement** — Units animate along road paths, not teleport
10. **RetardantTimer** — Countdown overlay on terrain with fade-out when expired
11. **StructureTriage** — Color-coded structure footprints (defensible/marginal/non-defensible)
12. **NightTransition** — Gradual lighting change, UI adjustments for night ops mode
