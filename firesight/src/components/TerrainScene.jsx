// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TerrainScene.jsx — FireSight: Interactive Wildfire Simulation
//
// Click to ignite. Recon drones patrol autonomously. Fire response begins
// only when a drone's sensor detects the blaze.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { FireSpreadEngine, GRID_ROWS, GRID_COLS, BURNING, BURNED, RETARDANT, UNBURNED } from '../fireSpreadEngine.js';
import { NODES as ICS_NODES, TYPE_COLORS as ICS_TYPE_COLORS } from '../icsEngine.js';

// ── Remote Debug Logger — batches console logs to /api/log ───────────────────
function debugLog(msg, level = 'log') {
  console[level](`[FS] ${msg}`);
}

// ── Geographic Bounds (must match fire engine) ──────────────────────────────
const LAT_MIN = 33.950, LAT_MAX = 34.130;
const LNG_MIN = -118.680, LNG_MAX = -118.370;
const CENTER = { lat: (LAT_MIN + LAT_MAX) / 2, lng: (LNG_MIN + LNG_MAX) / 2 };

// ── Agent Colors ────────────────────────────────────────────────────────────
const AC = { overwatch:'#A78BFA', predict:'#EF4444', swarm:'#22D3EE', evac:'#34D399', deploy:'#FBBF24', system:'#94A3B8' };

// ── Drone Types (realistic models) ──────────────────────────────────────────
const DTYPE_COLORS = { scout:'#22D3EE', mapper:'#60A5FA', relay:'#A78BFA', safety:'#34D399', ignis:'#F97316', reaper:'#E2E8F0', suppression:'#F472B6' };
// Legacy aliases
DTYPE_COLORS.recon = DTYPE_COLORS.scout; DTYPE_COLORS.spotter = DTYPE_COLORS.mapper; DTYPE_COLORS.ignition = DTYPE_COLORS.ignis;

// ── Unit Types ──────────────────────────────────────────────────────────────
const UTYPE = {
  engine:{c:'#FBBF24'}, tender:{c:'#F59E0B'}, hotshot:{c:'#F97316'}, crew:{c:'#FB923C'},
  dozer:{c:'#A3E635'}, air:{c:'#F472B6'}, seat:{c:'#E879F9'}, heli:{c:'#EC4899'},
  lead:{c:'#D946EF'}, structeng:{c:'#38BDF8'},
};

// ── Vehicle Speeds (mph) ────────────────────────────────────────────────────
// Grid: 256×256 over ~12.2km × 15.8km → ~55m per cell
const CELL_SIZE_M = 95;
// Time compression: movement speed scaled so vehicles visually keep pace with fire.
// Base scale of 30 = moderate pace at 1x. Speed slider (1–100x) multiplies on top.
const SIM_TIME_SCALE = 30;
const MPH_TO_CPF = (0.447 / CELL_SIZE_M / 60) * SIM_TIME_SCALE; // mph → cells/frame (base rate)

const SPEED = {
  // Ground vehicles (road speed mph)
  engine: 35, tender: 30, structeng: 35,
  dozer: 6,      // tracked vehicle, very slow
  hotshot: 2.5,  // 20-person crew hiking through brush
  crew: 2.5,     // hand crew on foot
  // Aircraft (cruise speed mph)
  heli: 157,     // CH-47 Chinook
  air: 300,      // DC-10 VLAT
  seat: 170,     // AT-802 Air Tractor SEAT
  lead: 200,     // OV-10A Bronco lead plane
  // Drones
  scout: 40,     // DJI M30T / Skydio X10
  mapper: 25,    // senseFly eBee X fixed-wing
  relay: 35,     // comms relay
  safety: 40,    // DJI Mavic 3T
  ignis: 30,     // DJI M600 + IGNIS II
  reaper: 230,   // MQ-9 Reaper
  suppression: 45,
};
const IS_GROUND = new Set(['engine','tender','dozer','hotshot','crew','structeng']);

// ── Road Network (OpenStreetMap data, converted to 256×256 grid coords) ──────
const ROAD_SEGMENTS = [[[168,152],[166,150]],[[169,153],[168,152]],[[127,83],[126,84],[124,83],[122,83],[120,83],[120,84]],[[57,63],[56,64],[56,64]],[[71,70],[70,69],[69,68],[68,67],[66,67],[65,66]],[[116,155],[117,154],[118,153],[119,152],[120,151],[122,150],[123,149],[124,148],[126,147],[127,146],[128,145]],[[164,151],[163,152],[162,152]],[[45,6],[45,4],[44,1],[44,0]],[[47,167],[46,166],[44,166],[40,167],[37,167],[34,166],[33,165],[31,165]],[[28,163],[25,163],[23,163],[22,163]],[[17,163],[15,163]],[[9,166],[7,166]],[[156,143],[157,144],[159,146]],[[142,134],[141,133],[139,133],[137,133],[135,132],[134,133],[132,133],[130,134],[128,134],[127,134]],[[212,211],[211,208],[210,206],[209,204]],[[150,208],[149,207]],[[55,231],[53,232],[50,232],[48,232],[46,232],[44,232],[42,233],[40,233],[37,233],[36,234],[35,235],[33,236],[32,238],[30,238],[29,237],[28,236],[27,234],[26,233],[26,232]],[[71,203],[73,203],[75,204],[77,205],[79,205]],[[86,63],[87,62],[85,62]],[[143,139],[145,141],[148,143],[150,145]],[[81,176],[81,177]],[[75,240],[72,240],[70,240]],[[142,200],[141,201],[140,202],[138,202],[136,201]],[[123,47],[125,48],[124,49],[125,50],[127,51],[125,52],[126,53],[127,54],[128,55],[129,57],[131,57],[130,58],[129,59],[131,59],[132,59]],[[85,22],[84,21],[83,19],[82,18],[83,17],[84,16],[85,15],[87,15],[87,13],[85,12],[85,10],[86,9],[87,8],[88,7],[90,7],[91,6],[92,5],[92,3],[92,1],[91,0]],[[80,177],[80,176]],[[82,176],[81,175]],[[167,154],[168,153]],[[102,167],[105,168]],[[142,200],[141,201],[139,202],[137,202],[136,201]],[[142,205],[141,204],[140,203],[140,202]]];
const ROAD_NODES = [];
const ROAD_ADJ = new Map();
(function buildRoadGraph() {
  const nm = new Map();
  function ga(r,c) { const k=`${r},${c}`; if(nm.has(k)) return nm.get(k); const i=ROAD_NODES.length; ROAD_NODES.push({row:r,col:c}); nm.set(k,i); ROAD_ADJ.set(i,new Set()); return i; }
  for (const seg of ROAD_SEGMENTS) for (let i=0;i<seg.length;i++) { const idx=ga(seg[i][0],seg[i][1]); if(i>0){const p=ga(seg[i-1][0],seg[i-1][1]);ROAD_ADJ.get(idx).add(p);ROAD_ADJ.get(p).add(idx);} }
  for (let i=0;i<ROAD_NODES.length;i++) for(let j=i+1;j<ROAD_NODES.length;j++) { if(Math.abs(ROAD_NODES[i].row-ROAD_NODES[j].row)+Math.abs(ROAD_NODES[i].col-ROAD_NODES[j].col)<8){ROAD_ADJ.get(i).add(j);ROAD_ADJ.get(j).add(i);} }
})();

function nearestRoadNode(r,c) { let b=0,bd=1e9; for(let i=0;i<ROAD_NODES.length;i++){const n=ROAD_NODES[i],d=(n.row-r)**2+(n.col-c)**2;if(d<bd){bd=d;b=i;}} return b; }

function findRoadPath(fr,fc,tr,tc) {
  const s=nearestRoadNode(fr,fc),e=nearestRoadNode(tr,tc);
  if(s===e) return [{row:tr,col:tc}];
  const vis=new Set([s]),par=new Map(),q=[s]; let found=false;
  while(q.length){const c=q.shift();if(c===e){found=true;break;} for(const nb of ROAD_ADJ.get(c)||[]){if(!vis.has(nb)){vis.add(nb);par.set(nb,c);q.push(nb);}}}
  if(!found) return [{row:tr,col:tc}];
  const path=[]; let c=e; while(c!==s){path.unshift({row:ROAD_NODES[c].row,col:ROAD_NODES[c].col});c=par.get(c);}
  path.unshift({row:ROAD_NODES[s].row,col:ROAD_NODES[s].col});
  path.push({row:tr,col:tc});
  return path;
}

// Max visual movement per frame (cells) — prevents fast aircraft from teleporting
// 0.15 c/f × 60fps = 9 cells/sec × 95m = 855m/s ≈ reasonable visual max
const MAX_CPF = 0.15;

function moveAtSpeed(obj, speedMph, simSpd) {
  if(obj._path && obj._path.length > 0) {
    const wp=obj._path[obj._pi||0]; if(!wp){obj._path=null;return;}
    const dr=wp.row-obj.row,dc=wp.col-obj.col,dist=Math.sqrt(dr*dr+dc*dc);
    const mx=Math.min(speedMph*MPH_TO_CPF*simSpd, MAX_CPF*simSpd);
    if(dist<=mx+0.5){obj.row=wp.row;obj.col=wp.col;obj._pi=(obj._pi||0)+1;if(obj._pi>=obj._path.length){obj._path=null;obj._pi=0;}}
    else{obj.row+=dr/dist*mx;obj.col+=dc/dist*mx;}
  } else {
    const dr=obj.trow-obj.row,dc=obj.tcol-obj.col,dist=Math.sqrt(dr*dr+dc*dc);
    const mx=Math.min(speedMph*MPH_TO_CPF*simSpd, MAX_CPF*simSpd);
    if(dist<=mx+0.1){obj.row=obj.trow;obj.col=obj.tcol;}
    else{obj.row+=dr/dist*mx;obj.col+=dc/dist*mx;}
  }
}

function setUnitTarget(unit, tr, tc) {
  if(Math.abs(unit.trow-tr)<3 && Math.abs(unit.tcol-tc)<3) return;
  unit.trow=tr; unit.tcol=tc;
  if(IS_GROUND.has(unit.type)){unit._path=findRoadPath(Math.round(unit.row),Math.round(unit.col),Math.round(tr),Math.round(tc));unit._pi=0;}
  else{unit._path=null;}
}

// ── Evacuation Routes (lat/lng points) ──────────────────────────────────────
const ROUTES = [
  { id:'R1', name:'Sunset', pts:[[34.045,-118.50],[34.042,-118.48],[34.040,-118.45],[34.038,-118.42]] },
  { id:'R2', name:'PCH', pts:[[34.030,-118.52],[34.025,-118.50],[34.020,-118.47],[34.015,-118.44]] },
  { id:'R3', name:'Topanga', pts:[[34.050,-118.55],[34.055,-118.57],[34.060,-118.59]] },
];

// ── Population Zones ────────────────────────────────────────────────────────
const POP_ZONES = [
  { id:'B3', name:'Pacific Palisades', pop:2847, row:133, col:110 },
  { id:'B4', name:'Brentwood South', pop:1560, row:77, col:107 },
  { id:'C1', name:'Topanga', pop:4200, row:140, col:56 },
];

// ── Drone sensor range (grid cells) — how close a drone must be to "see" fire ──
const DRONE_SENSOR_RANGE = 18;  // ~900m at 50m/cell

// ── COMMAND CENTER — Incident Command Post + drone operations ───────────────
// Located at Pepperdine University staging area (34.074°N, 118.551°W)
// Real ICP location used during the 2025 Palisades Fire
const COMMAND_CENTER = { name:'FireSight ICP', row:24, col:36 };

// Total drone stash at command center — this is the hard max
const DRONE_STASH_TOTAL = 24;

// How many patrol at start vs. held in reserve
const INITIAL_PATROL = 6;

// Drone fleet composition — realistic models per phase
// Phase 1: Scouts (DFR drones, first on scene)
// Phase 2: Mappers (fixed-wing, perimeter mapping)
// Phase 3: Safety overwatch + comms relay
// Phase 4: IGNIS aerial ignition drones (dragon eggs)
// Phase 5: Suppression (heavy-lift, emerging)
// Always: MQ-9 Reaper (persistent HALE ISR)
const DRONE_STASH = [
  // ── Initial patrol (first 6, always airborne) ──
  { dtype:'scout',  model:'Skydio X10',     patrolCenterRow:80,  patrolCenterCol:128, patrolRadius:50, flightTime:40 },
  { dtype:'scout',  model:'DJI M30T',       patrolCenterRow:110, patrolCenterCol:80,  patrolRadius:45, flightTime:41 },
  { dtype:'scout',  model:'Skydio X10',     patrolCenterRow:60,  patrolCenterCol:160, patrolRadius:50, flightTime:40 },
  { dtype:'mapper', model:'senseFly eBee X', patrolCenterRow:100, patrolCenterCol:110, patrolRadius:55, flightTime:90 },
  { dtype:'relay',  model:'Comms Relay',     patrolCenterRow:50,  patrolCenterCol:128, patrolRadius:15, flightTime:120 },
  { dtype:'reaper', model:'MQ-9 Reaper',     patrolCenterRow:128, patrolCenterCol:128, patrolRadius:80, flightTime:1620 },
  // ── Reserve (launched as fire grows) ──
  { dtype:'scout',  model:'DJI M30T',       patrolCenterRow:128, patrolCenterCol:128, patrolRadius:40, flightTime:41 },
  { dtype:'mapper', model:'senseFly eBee X', patrolCenterRow:90,  patrolCenterCol:90,  patrolRadius:55, flightTime:90 },
  { dtype:'mapper', model:'JOUAV CW-25',    patrolCenterRow:128, patrolCenterCol:128, patrolRadius:60, flightTime:240 },
  { dtype:'safety', model:'DJI Mavic 3T',   patrolCenterRow:130, patrolCenterCol:110, patrolRadius:20, flightTime:45 },
  { dtype:'safety', model:'DJI Mavic 3T',   patrolCenterRow:80,  patrolCenterCol:107, patrolRadius:20, flightTime:45 },
  { dtype:'safety', model:'DJI Mavic 3T',   patrolCenterRow:135, patrolCenterCol:60,  patrolRadius:20, flightTime:45 },
  { dtype:'relay',  model:'Comms Relay',     patrolCenterRow:80,  patrolCenterCol:190, patrolRadius:15, flightTime:120 },
  { dtype:'scout',  model:'Skydio X10',     patrolCenterRow:128, patrolCenterCol:60,  patrolRadius:45, flightTime:40 },
  { dtype:'safety', model:'DJI Mavic 3T',   patrolCenterRow:100, patrolCenterCol:170, patrolRadius:25, flightTime:45 },
  { dtype:'ignis',  model:'DJI M600 IGNIS', patrolCenterRow:128, patrolCenterCol:128, patrolRadius:8,  flightTime:30 },
  { dtype:'ignis',  model:'DJI M600 IGNIS', patrolCenterRow:128, patrolCenterCol:128, patrolRadius:8,  flightTime:30 },
  { dtype:'ignis',  model:'DJI M600 IGNIS', patrolCenterRow:128, patrolCenterCol:128, patrolRadius:8,  flightTime:30 },
  { dtype:'ignis',  model:'DJI M600 IGNIS', patrolCenterRow:128, patrolCenterCol:128, patrolRadius:8,  flightTime:30 },
  { dtype:'suppression', model:'FireSwarm Thunder', patrolCenterRow:90, patrolCenterCol:50, patrolRadius:15, flightTime:35 },
  { dtype:'scout',  model:'DJI M30T',       patrolCenterRow:50,  patrolCenterCol:100, patrolRadius:45, flightTime:41 },
  { dtype:'relay',  model:'Comms Relay',     patrolCenterRow:100, patrolCenterCol:128, patrolRadius:15, flightTime:120 },
  { dtype:'suppression', model:'FireSwarm Thunder', patrolCenterRow:120, patrolCenterCol:80, patrolRadius:15, flightTime:35 },
  { dtype:'scout',  model:'Skydio X10',     patrolCenterRow:80,  patrolCenterCol:180, patrolRadius:50, flightTime:40 },
];

// ── Build initial drone fleet (first INITIAL_PATROL from stash, rest stay at base) ──
function makeDrones() {
  const drones = [];
  for (let i = 0; i < DRONE_STASH_TOTAL; i++) {
    const spec = DRONE_STASH[i];
    const id = `D-${String(i + 1).padStart(2, '0')}`;
    const deployed = i < INITIAL_PATROL;
    drones.push({
      id, dtype: spec.dtype, model: spec.model || spec.dtype,
      flightTime: spec.flightTime || 40,
      homeRow: COMMAND_CENTER.row, homeCol: COMMAND_CENTER.col,
      patrolCenterRow: spec.patrolCenterRow, patrolCenterCol: spec.patrolCenterCol,
      patrolRadius: spec.patrolRadius,
      row: COMMAND_CENTER.row, col: COMMAND_CENTER.col,
      trow: deployed ? spec.patrolCenterRow : COMMAND_CENTER.row,
      tcol: deployed ? spec.patrolCenterCol : COMMAND_CENTER.col,
      patrolAngle: Math.random() * Math.PI * 2,
      launched: deployed,
    });
  }
  return drones;
}

// ── Unit staging at real LAFD/LA County stations ────────────────────────────
// Ground units follow roads via waypoint pathfinding. Aircraft fly direct.
function makeUnits() {
  return [
    // ── FIRE ENGINES (3-person crew, Type 3, 500gal) ──
    // LAFD Station 69 — Pacific Palisades
    { id:'E-69A', type:'engine',  homeRow:46,  homeCol:49, station:'LAFD Stn 69', crew:3, vehicle:'Pierce Type 3' },
    { id:'E-69B', type:'engine',  homeRow:48,  homeCol:51, station:'LAFD Stn 69', crew:3, vehicle:'Pierce Type 3' },
    // LAFD Station 23 — Brentwood
    { id:'E-23',  type:'engine',  homeRow:44,  homeCol:76, station:'LAFD Stn 23', crew:3, vehicle:'Pierce Type 3' },

    // ── WATER TENDER (driver + operator, 4,000gal) ──
    // LA County Station 71 — Malibu
    { id:'WT-71', type:'tender',  homeRow:56,  homeCol:23, station:'LACoFD Stn 71', crew:2, vehicle:'International HV507' },

    // ── AIRCRAFT ──
    // Van Nuys Airport — Air Tanker Base
    { id:'AT-1',  type:'air',     homeRow:2,   homeCol:195, station:'Van Nuys ATB', crew:2, vehicle:'DC-10 VLAT (11,600gal Phos-Chek)' },
    { id:'SE-1',  type:'seat',    homeRow:4,   homeCol:198, station:'Van Nuys ATB', crew:1, vehicle:'AT-802 Air Tractor (800gal)' },
    { id:'LP-1',  type:'lead',    homeRow:3,   homeCol:192, station:'Van Nuys ATB', crew:2, vehicle:'OV-10A Bronco (Lead Plane)' },
    // Santa Monica Airport — Helitack
    { id:'H-1',   type:'heli',    homeRow:76,  homeCol:89, station:'SMO Heliport', crew:4, vehicle:'CH-47D Chinook (2,600gal Bambi)' },

    // ── HOTSHOT CREW (20-person elite, on foot in brush) ──
    // LA County Camp 8 — Malibu Canyon
    { id:'IHC-8', type:'hotshot', homeRow:32,  homeCol:16, station:'Camp 8 Malibu', crew:20, vehicle:'On foot (drip torches, hand tools)' },

    // ── HAND CREW (20-person, manual fireline) ──
    { id:'HC-2',  type:'crew',    homeRow:34,  homeCol:18, station:'Camp 8 Malibu', crew:20, vehicle:'On foot (Pulaski, McLeod)' },
    // Second hand crew from Topanga
    { id:'HC-5',  type:'crew',    homeRow:50,  homeCol:52, station:'Topanga Station', crew:20, vehicle:'On foot (Pulaski, McLeod)' },

    // ── DOZER (operator, D8 Cat on lowboy trailer) ──
    // Caltrans yard — Sepulveda Pass
    { id:'DZ-1',  type:'dozer',   homeRow:18,  homeCol:79, station:'Caltrans Sepulveda', crew:1, vehicle:'Cat D8T (10-20ft blade)' },

    // ── STRUCTURE ENGINE (4-person, Type 1) ──
    // LAFD Station 19 — Brentwood
    { id:'SP-19', type:'structeng',homeRow:41, homeCol:70, station:'LAFD Stn 19', crew:4, vehicle:'Pierce Arrow XT (foam/gel)' },
  ].map(u => ({ ...u, row:u.homeRow, col:u.homeCol, trow:u.homeRow, tcol:u.homeCol, _path:null, _pi:0 }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ICP personnel stationed at command center (stationary, always visible)
const ICP_PERSONNEL = [
  { id: 'ic', label: 'IC', name: 'Incident Commander', color: '#EF4444', offsetR: 0, offsetC: 0 },
  { id: 'safety', label: 'SAF', name: 'Safety Officer', color: '#EF4444', offsetR: -3, offsetC: 2 },
  { id: 'ops_chief', label: 'OPS', name: 'Operations Chief', color: '#A78BFA', offsetR: 2, offsetC: 3 },
  { id: 'plan_chief', label: 'PLAN', name: 'Planning Chief', color: '#A78BFA', offsetR: 3, offsetC: -1 },
  { id: 'log_chief', label: 'LOG', name: 'Logistics Chief', color: '#A78BFA', offsetR: -2, offsetC: -3 },
  { id: 'pio', label: 'PIO', name: 'Public Info Officer', color: '#EF4444', offsetR: -4, offsetC: -1 },
  { id: 'fin_chief', label: 'FIN', name: 'Finance/Admin Chief', color: '#A78BFA', offsetR: 4, offsetC: 2 },
  { id: 'liaison', label: 'LIAS', name: 'Liaison Officer', color: '#EF4444', offsetR: -5, offsetC: 3 },
  // Planning section at ICP
  { id: 'sit_unit', label: 'SIT', name: 'Situation Unit', color: '#FBBF24', offsetR: 5, offsetC: -3 },
  { id: 'fban', label: 'FBAN', name: 'Fire Behavior Analyst', color: '#FBBF24', offsetR: 6, offsetC: 0 },
  { id: 'res_unit', label: 'RESU', name: 'Resources Unit', color: '#FBBF24', offsetR: 5, offsetC: 3 },
  // Logistics at ICP
  { id: 'comms', label: 'COMMS', name: 'Communications Unit', color: '#FBBF24', offsetR: -6, offsetC: -2 },
  { id: 'medical', label: 'MED', name: 'Medical Unit', color: '#FBBF24', offsetR: -5, offsetC: -5 },
  // External systems co-located at ICP
  { id: 'dispatch', label: 'DISP', name: 'CAD / Dispatch', color: '#34D399', offsetR: 7, offsetC: -5 },
  { id: 'iroc', label: 'IROC', name: 'IROC Ordering', color: '#34D399', offsetR: 7, offsetC: 5 },
];

// Field entities — positioned away from ICP, near their operational area
const FIELD_ENTITIES = [
  // Branch directors in the field
  { id: 'fire_branch', label: 'FIRE BR', name: 'Fire Suppression Branch', color: '#FBBF24', row: 60, col: 70, category: 'branch' },
  { id: 'air_ops', label: 'AIR OPS', name: 'Air Operations Branch', color: '#FBBF24', row: 18, col: 42, category: 'branch' },
  { id: 'div_alpha', label: 'DIV-A', name: 'Division Alpha (Head)', color: '#FBBF24', row: 90, col: 80, category: 'branch' },
  { id: 'div_bravo', label: 'DIV-B', name: 'Division Bravo (Flanks)', color: '#FBBF24', row: 100, col: 55, category: 'branch' },
  { id: 'struct_group', label: 'STRUCT', name: 'Structure Protection Group', color: '#FBBF24', row: 77, col: 107, category: 'branch' },
  { id: 'le_branch', label: 'LE BR', name: 'Law Enforcement Branch', color: '#FBBF24', row: 133, col: 100, category: 'branch' },
  { id: 'traffic', label: 'TRAF', name: 'Traffic Control', color: '#22D3EE', row: 150, col: 56, category: 'branch' },
  // ATGS airborne supervisor
  { id: 'atgs', label: 'ATGS', name: 'Air Tactical (OV-10A)', color: '#22D3EE', row: 50, col: 100, category: 'airborne' },
  // External sensors at fixed positions
  { id: 'raws', label: 'RAWS', name: 'RAWS Weather Station', color: '#34D399', row: 40, col: 90, category: 'sensor' },
  { id: 'satellite', label: 'SAT', name: 'GOES/VIIRS Satellite', color: '#34D399', row: 8, col: 128, category: 'sensor' },
  { id: 'alert_cam', label: 'CAMS', name: 'ALERTCalifornia Camera', color: '#34D399', row: 55, col: 45, category: 'sensor' },
  { id: 'firis', label: 'FIRIS', name: 'FIRIS Aerial IR', color: '#34D399', row: 70, col: 150, category: 'sensor' },
  { id: 'nws', label: 'NWS', name: 'NWS Spot Forecast', color: '#34D399', row: 5, col: 50, category: 'sensor' },
  { id: 'genasys', label: 'GNSY', name: 'Genasys Protect', color: '#34D399', row: 140, col: 90, category: 'sensor' },
  // AI agents at ICP perimeter with special rendering
  { id: 'ai_overwatch', label: 'OW-AI', name: 'OVERWATCH AI', color: '#F472B6', row: COMMAND_CENTER.row + 10, col: COMMAND_CENTER.col + 8, category: 'ai' },
  { id: 'ai_predict', label: 'PR-AI', name: 'PREDICT AI', color: '#F472B6', row: COMMAND_CENTER.row + 12, col: COMMAND_CENTER.col + 3, category: 'ai' },
  { id: 'ai_swarm', label: 'SW-AI', name: 'SWARM AI', color: '#F472B6', row: COMMAND_CENTER.row + 10, col: COMMAND_CENTER.col - 4, category: 'ai' },
  { id: 'ai_evac', label: 'EV-AI', name: 'EVAC AI', color: '#F472B6', row: COMMAND_CENTER.row + 12, col: COMMAND_CENTER.col - 8, category: 'ai' },
  { id: 'ai_deploy', label: 'DP-AI', name: 'DEPLOY AI', color: '#F472B6', row: COMMAND_CENTER.row + 14, col: COMMAND_CENTER.col, category: 'ai' },
  // Unit group supervisors — tactical coordinators in the field
  { id: 'engines', label: 'ENG×3', name: 'Engine Strike Team Leader', color: '#FBBF24', row: 70, col: 75, category: 'group' },
  { id: 'hotshots', label: 'IHC', name: 'Hotshot Superintendent', color: '#F97316', row: 85, col: 65, category: 'group' },
  { id: 'hand_crew', label: 'T2 HC', name: 'Hand Crew Supervisor', color: '#FB923C', row: 95, col: 60, category: 'group' },
  { id: 'dozer', label: 'DZR', name: 'Dozer Boss', color: '#A3E635', row: 105, col: 50, category: 'group' },
  { id: 'vlat', label: 'VLAT', name: 'VLAT Coordinator', color: '#F472B6', row: 10, col: 180, category: 'group' },
  { id: 'seat', label: 'SEAT', name: 'SEAT Coordinator', color: '#E879F9', row: 12, col: 185, category: 'group' },
  { id: 'lead_plane', label: 'LEAD', name: 'Lead Plane Coordinator', color: '#D946EF', row: 8, col: 175, category: 'group' },
  { id: 'heli', label: 'HELI', name: 'Helitack Coordinator', color: '#EC4899', row: 72, col: 95, category: 'group' },
  { id: 'tender', label: 'WTR', name: 'Water Tender Boss', color: '#F59E0B', row: 52, col: 28, category: 'group' },
  { id: 'struct_eng', label: 'STRC', name: 'Structure Engine Leader', color: '#38BDF8', row: 45, col: 68, category: 'group' },
  // Drone fleet control + type coordinators
  { id: 'drones', label: 'UAS', name: 'UAS Fleet Control', color: '#22D3EE', row: COMMAND_CENTER.row - 6, col: COMMAND_CENTER.col + 6, category: 'drone_ctrl' },
  { id: 'drone_scout', label: 'SCOUT', name: 'Scout UAS Coordinator', color: '#22D3EE', row: COMMAND_CENTER.row - 8, col: COMMAND_CENTER.col + 10, category: 'drone_ctrl' },
  { id: 'drone_mapper', label: 'MAPPER', name: 'Mapper UAS Coordinator', color: '#60A5FA', row: COMMAND_CENTER.row - 10, col: COMMAND_CENTER.col + 7, category: 'drone_ctrl' },
  { id: 'drone_reaper', label: 'MQ-9', name: 'MQ-9 Reaper Controller', color: '#E2E8F0', row: COMMAND_CENTER.row - 10, col: COMMAND_CENTER.col + 3, category: 'drone_ctrl' },
  { id: 'drone_relay', label: 'RELAY', name: 'Relay UAS Coordinator', color: '#A78BFA', row: COMMAND_CENTER.row - 8, col: COMMAND_CENTER.col - 2, category: 'drone_ctrl' },
  { id: 'drone_safety', label: 'SAFE-D', name: 'Safety UAS Coordinator', color: '#34D399', row: COMMAND_CENTER.row - 10, col: COMMAND_CENTER.col - 5, category: 'drone_ctrl' },
  { id: 'drone_ignis', label: 'IGNIS', name: 'IGNIS UAS Coordinator', color: '#F97316', row: COMMAND_CENTER.row - 8, col: COMMAND_CENTER.col - 8, category: 'drone_ctrl' },
  { id: 'drone_suppress', label: 'F-SWM', name: 'Suppression UAS Coordinator', color: '#F472B6', row: COMMAND_CENTER.row - 10, col: COMMAND_CENTER.col - 10, category: 'drone_ctrl' },
];

// Map ICS graph node IDs to map entity IDs for cross-highlighting
const ICS_TO_MAP = {
  // Individual named units
  eng_69a: 'E-69A', eng_69b: 'E-69B', eng_23: 'E-23',
  tender_71: 'WT-71', heli_1: 'H-1', vlat_1: 'AT-1', seat_1: 'SE-1',
  lead_1: 'LP-1', ihc_8: 'IHC-8', hc_2: 'HC-2', hc_5: 'HC-5',
  dozer_1: 'DZ-1', struct_19: 'SP-19',
  // Unit group supervisors (same ID both sides — they're FIELD_ENTITIES)
  engines: 'engines', hotshots: 'hotshots', hand_crew: 'hand_crew', dozer: 'dozer',
  vlat: 'vlat', seat: 'seat', lead_plane: 'lead_plane', heli: 'heli',
  tender: 'tender', struct_eng: 'struct_eng',
  // Individual drones (d_XX → D-XX)
  d_01: 'D-01', d_02: 'D-02', d_03: 'D-03', d_04: 'D-04', d_05: 'D-05', d_06: 'D-06',
  d_07: 'D-07', d_08: 'D-08', d_09: 'D-09', d_10: 'D-10', d_11: 'D-11', d_12: 'D-12',
  d_13: 'D-13', d_14: 'D-14', d_15: 'D-15', d_16: 'D-16', d_17: 'D-17', d_18: 'D-18',
  d_19: 'D-19', d_20: 'D-20', d_21: 'D-21', d_22: 'D-22', d_23: 'D-23', d_24: 'D-24',
  // Drone fleet control + type coordinators (same ID both sides — FIELD_ENTITIES)
  drones: 'drones', drone_scout: 'drone_scout', drone_mapper: 'drone_mapper',
  drone_reaper: 'drone_reaper', drone_relay: 'drone_relay', drone_safety: 'drone_safety',
  drone_ignis: 'drone_ignis', drone_suppress: 'drone_suppress',
  // ICP personnel (same ID both sides)
  ic: 'ic', safety: 'safety', ops_chief: 'ops_chief',
  plan_chief: 'plan_chief', log_chief: 'log_chief', pio: 'pio',
  fin_chief: 'fin_chief', liaison: 'liaison',
  sit_unit: 'sit_unit', fban: 'fban', res_unit: 'res_unit',
  comms: 'comms', medical: 'medical', dispatch: 'dispatch', iroc: 'iroc',
  // Field entities (same ID both sides)
  fire_branch: 'fire_branch', air_ops: 'air_ops',
  div_alpha: 'div_alpha', div_bravo: 'div_bravo',
  struct_group: 'struct_group', le_branch: 'le_branch', traffic: 'traffic',
  atgs: 'atgs',
  // External sensors (same ID both sides)
  raws: 'raws', satellite: 'satellite', alert_cam: 'alert_cam',
  firis: 'firis', nws: 'nws', genasys: 'genasys',
  // AI agents (same ID both sides)
  ai_overwatch: 'ai_overwatch', ai_predict: 'ai_predict',
  ai_swarm: 'ai_swarm', ai_evac: 'ai_evac', ai_deploy: 'ai_deploy',
};
const MAP_TO_ICS = {};
for (const [ics, map] of Object.entries(ICS_TO_MAP)) MAP_TO_ICS[map] = ics;

export default function TerrainScene({ timeSlot, onTerrainClick, simulationMode, activeLayers, swarmActive, evacActive, deployActive, fireData, icsEngine, onLiveData, highlightedNode, onNodeHover }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const simRef = useRef(null);
  const animRef = useRef(null);
  const tooltipDivRef = useRef(null);
  const highlightRef = useRef(null);
  const onNodeHoverRef = useRef(null);
  highlightRef.current = highlightedNode;
  onNodeHoverRef.current = onNodeHover;
  const [mapStatus, setMapStatus] = useState('initializing');
  const [fogOfWar, setFogOfWar] = useState(false);
  const fogRef = useRef(false);
  const [ui, setUi] = useState({
    speed:1, acres:0, contain:0, drones:'0/12', phase:'Patrol',
    events:[], evac:0, actions:0, fireDetected:false, fireActive:false,
  });

  // ── Initialize Three.js Tile Map ────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let destroyed = false;
    setMapStatus('loading');

    // ── Web Mercator helpers ──
    const DEG2RAD = Math.PI / 180;
    function lat2mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2)); }
    function mercY2lat(y) { return (Math.atan(Math.exp(y)) - Math.PI / 4) * 2 / DEG2RAD; }
    function lng2mercX(lng) { return lng * DEG2RAD; }
    function mercX2lng(x) { return x / DEG2RAD; }

    // Merc bounds for the fire zone
    const mercXMin = lng2mercX(LNG_MIN), mercXMax = lng2mercX(LNG_MAX);
    const mercYMin = lat2mercY(LAT_MIN), mercYMax = lat2mercY(LAT_MAX);
    const mercCX = (mercXMin + mercXMax) / 2, mercCY = (mercYMin + mercYMax) / 2;

    // ── Three.js scene ──
    const container = mapContainerRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setClearColor(0x0a0e16);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Orthographic camera — units are Web Mercator radians
    const aspect = container.offsetWidth / container.offsetHeight;
    const viewH = (mercYMax - mercYMin) * 1.3; // slight padding
    const viewW = viewH * aspect;
    const camera = new THREE.OrthographicCamera(-viewW/2, viewW/2, viewH/2, -viewH/2, 0.1, 10);
    camera.position.set(mercCX, mercCY, 5);
    camera.lookAt(mercCX, mercCY, 0);
    camera.up.set(0, 1, 0);

    // ── Tile loading ──
    const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const tileCache = new Map();
    const tileMeshes = new Map();
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    function tileKey(z, x, y) { return `${z}/${x}/${y}`; }

    function lng2tileX(lng, z) { return Math.floor((lng + 180) / 360 * (1 << z)); }
    function lat2tileY(lat, z) {
      const r = lat * DEG2RAD;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z));
    }
    function tileX2lng(x, z) { return x / (1 << z) * 360 - 180; }
    function tileY2lat(y, z) {
      const n = Math.PI - 2 * Math.PI * y / (1 << z);
      return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    function loadTile(z, tx, ty) {
      const key = tileKey(z, tx, ty);
      if (tileCache.has(key)) return;
      tileCache.set(key, 'loading');

      const url = TILE_URL.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
      loader.load(url, (tex) => {
        if (destroyed) return;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

        // Tile geographic bounds in Mercator
        const west = tileX2lng(tx, z), east = tileX2lng(tx + 1, z);
        const north = tileY2lat(ty, z), south = tileY2lat(ty + 1, z);
        const mx0 = lng2mercX(west), mx1 = lng2mercX(east);
        const my0 = lat2mercY(south), my1 = lat2mercY(north);
        const tw = mx1 - mx0, th = my1 - my0;

        const geo = new THREE.PlaneGeometry(tw, th);
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(mx0 + tw / 2, my0 + th / 2, 0);
        mesh.userData = { z, tx, ty };
        scene.add(mesh);
        tileMeshes.set(key, mesh);
        tileCache.set(key, 'loaded');
      }, undefined, () => { tileCache.set(key, 'error'); });
    }

    let currentZoom = -1;
    let pendingCleanup = false;
    let cleanupTimer = null;

    function updateTiles() {
      // Determine visible bounds in Mercator
      const left = camera.position.x + camera.left;
      const right = camera.position.x + camera.right;
      const bottom = camera.position.y + camera.bottom;
      const top2 = camera.position.y + camera.top;

      // Pick zoom level based on how many screen pixels each tile would cover
      const viewWidthMerc = right - left;
      const screenWidth = container.offsetWidth;
      const targetPxPerTile = 384;
      const idealZoom = Math.log2(2 * Math.PI * screenWidth / (viewWidthMerc * targetPxPerTile));
      // Cap at zoom 17 — z18 is too dense and Esri tiles are blurry there anyway
      let z = Math.max(2, Math.min(17, Math.round(idealZoom)));

      // Convert visible bounds to tile coordinates
      const westLng = mercX2lng(left), eastLng = mercX2lng(right);
      const southLat = mercY2lat(bottom), northLat = mercY2lat(top2);
      const txMin = Math.max(0, lng2tileX(westLng, z) - 1);
      const txMax = Math.min((1 << z) - 1, lng2tileX(eastLng, z) + 1);
      const tyMin = Math.max(0, lat2tileY(northLat, z) - 1);
      const tyMax = Math.min((1 << z) - 1, lat2tileY(southLat, z) + 1);

      // If tile grid is too large at this zoom, step down
      const tileCountX = txMax - txMin + 1;
      const tileCountY = tyMax - tyMin + 1;
      if (tileCountX * tileCountY > 64) {
        z = Math.max(2, z - 1);
        // Recalculate at lower zoom
        const txMin2 = Math.max(0, lng2tileX(westLng, z) - 1);
        const txMax2 = Math.min((1 << z) - 1, lng2tileX(eastLng, z) + 1);
        const tyMin2 = Math.max(0, lat2tileY(northLat, z) - 1);
        const tyMax2 = Math.min((1 << z) - 1, lat2tileY(southLat, z) + 1);
        // Load at reduced zoom
        for (let ty = tyMin2; ty <= tyMax2; ty++) {
          for (let tx = txMin2; tx <= txMax2; tx++) {
            loadTile(z, tx, ty);
          }
        }
      } else {
        for (let ty = tyMin; ty <= tyMax; ty++) {
          for (let tx = txMin; tx <= txMax; tx++) {
            loadTile(z, tx, ty);
          }
        }
      }

      // Remove out-of-view tiles at current zoom (with padding)
      const padMerc = viewWidthMerc * 0.5;
      for (const [key, mesh] of tileMeshes) {
        if (mesh.userData.z === z) {
          const mx = mesh.position.x, my = mesh.position.y;
          if (mx < left - padMerc || mx > right + padMerc || my < bottom - padMerc || my > top2 + padMerc) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.map?.dispose();
            mesh.material.dispose();
            tileMeshes.delete(key);
            tileCache.delete(key);
          }
        }
      }

      // Handle zoom transitions — schedule old tile cleanup with debounce
      if (z !== currentZoom) {
        // Push old tiles behind new ones
        for (const [key, mesh] of tileMeshes) {
          mesh.position.z = (mesh.userData.z === z) ? 0 : -0.1;
        }
        // Debounced cleanup: wait 300ms for zoom to settle, then remove old tiles
        if (cleanupTimer) clearTimeout(cleanupTimer);
        cleanupTimer = setTimeout(() => {
          if (destroyed) return;
          for (const [key, mesh] of tileMeshes) {
            if (mesh.userData.z !== z) {
              scene.remove(mesh);
              mesh.geometry.dispose();
              mesh.material.map?.dispose();
              mesh.material.dispose();
              tileMeshes.delete(key);
              tileCache.delete(key);
            }
          }
          currentZoom = z;
        }, 300);
      }
    }

    // ── Pan / Zoom controls ──
    let isDragging = false, lastMX = 0, lastMY = 0;
    const el = renderer.domElement;

    el.addEventListener('mousedown', (e) => {
      isDragging = true; lastMX = e.clientX; lastMY = e.clientY;
      el.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
      lastMX = e.clientX; lastMY = e.clientY;
      // Convert pixel delta to Mercator delta
      const pxToMerc = (camera.right - camera.left) / container.offsetWidth;
      camera.position.x -= dx * pxToMerc;
      camera.position.y += dy * pxToMerc;
      camera.updateProjectionMatrix();
      needTileUpdate = true;
    });
    window.addEventListener('mouseup', () => { isDragging = false; el.style.cursor = 'grab'; });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 1 / 1.08;

      // Zoom toward mouse position
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const worldX = camera.position.x + camera.left + mx * (camera.right - camera.left);
      const worldY = camera.position.y + camera.top - my * (camera.top - camera.bottom);

      camera.left *= zoomFactor; camera.right *= zoomFactor;
      camera.top *= zoomFactor; camera.bottom *= zoomFactor;

      // Adjust position to keep point under mouse
      camera.position.x = worldX - camera.left - mx * (camera.right - camera.left);
      camera.position.y = worldY - camera.top + my * (camera.top - camera.bottom);
      camera.updateProjectionMatrix();
      needTileUpdate = true;
    }, { passive: false });

    el.style.cursor = 'grab';
    let needTileUpdate = true;

    // ── Fire overlay canvas ──
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    container.appendChild(overlayCanvas);

    function syncOverlay() {
      const cw = container.offsetWidth, ch = container.offsetHeight;
      const dpr = window.devicePixelRatio || 1;

      // Fire zone bounds in screen pixels
      const viewLeft = camera.position.x + camera.left;
      const viewRight = camera.position.x + camera.right;
      const viewTop = camera.position.y + camera.top;
      const viewBottom = camera.position.y + camera.bottom;
      const viewW2 = viewRight - viewLeft, viewH2 = viewTop - viewBottom;

      const fxLeft = (mercXMin - viewLeft) / viewW2 * cw;
      const fxRight = (mercXMax - viewLeft) / viewW2 * cw;
      const fyTop = (viewTop - mercYMax) / viewH2 * ch;
      const fyBottom = (viewTop - mercYMin) / viewH2 * ch;

      const fw = fxRight - fxLeft, fh = fyBottom - fyTop;

      overlayCanvas.style.left = fxLeft + 'px';
      overlayCanvas.style.top = fyTop + 'px';
      overlayCanvas.style.width = fw + 'px';
      overlayCanvas.style.height = fh + 'px';
      // Cap canvas resolution to avoid massive buffers when zoomed in far
      const maxCanvasDim = 4096;
      const rawW = Math.round(fw * dpr), rawH = Math.round(fh * dpr);
      const canvasScale = Math.min(1, maxCanvasDim / Math.max(rawW, rawH, 1));
      const finalW = Math.max(1, Math.round(rawW * canvasScale));
      const finalH = Math.max(1, Math.round(rawH * canvasScale));
      overlayCanvas.width = finalW;
      overlayCanvas.height = finalH;

      const ctx2 = overlayCanvas.getContext('2d');
      if (ctx2) ctx2.setTransform(finalW / Math.max(1, fw), 0, 0, finalH / Math.max(1, fh), 0, 0);

      return { gw: Math.max(1, fw), gh: Math.max(1, fh) };
    }

    // ── Click to ignite (screen → Mercator → lat/lng) ──
    el.addEventListener('click', (e) => {
      if (destroyed) return;
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const worldX = camera.position.x + camera.left + mx * (camera.right - camera.left);
      const worldY = camera.position.y + camera.top - my * (camera.top - camera.bottom);
      const clickLng = mercX2lng(worldX);
      const clickLat = mercY2lat(worldY);
      // Only fire the click callback, don't ignite here
      if (simRef.current?._handleClick) simRef.current._handleClick(clickLat, clickLng, e);
    });

    // ── Resize handling ──
    function onResize() {
      if (destroyed) return;
      const w = container.offsetWidth, h = container.offsetHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      const aspect2 = w / h;
      const halfH = (camera.top - camera.bottom) / 2;
      camera.left = -halfH * aspect2;
      camera.right = halfH * aspect2;
      camera.updateProjectionMatrix();
      needTileUpdate = true;
    }
    const resObs = new ResizeObserver(onResize);
    resObs.observe(container);

    // ── Render loop ──
    let rafId;
    function renderLoop() {
      if (destroyed) return;
      rafId = requestAnimationFrame(renderLoop);
      if (needTileUpdate) { updateTiles(); needTileUpdate = false; }
      renderer.render(scene, camera);
    }
    updateTiles();
    renderLoop();

    // Store map utilities for initSim
    const mapUtils = {
      mercXMin, mercXMax, mercYMin, mercYMax,
      lng2mercX, lat2mercY, mercX2lng, mercY2lat,
      camera, renderer, overlayCanvas, syncOverlay,
      container,
    };

    setMapStatus('ready');
    initSim(mapUtils);

    return () => {
      destroyed = true;
      if (simRef.current?._decisionCleanup) simRef.current._decisionCleanup();
      if (simRef.current?._cleanupFireIgnite) simRef.current._cleanupFireIgnite();
      if (simRef.current?._positionEmitTimer) clearInterval(simRef.current._positionEmitTimer);
      cancelAnimationFrame(rafId);
      resObs.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.remove();
      if (overlayCanvas.parentNode) overlayCanvas.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Initialize Simulation ───────────────────────────────────────────────
  function initSim(mapUtils) {
    const engine = new FireSpreadEngine({ windSpeed:25, windDirection:315, humidity:12, temperature:94 });
    const offCanvas = document.createElement('canvas');
    offCanvas.width = GRID_COLS; offCanvas.height = GRID_ROWS;

    const drones = makeDrones();
    const units = makeUnits();

    const sim = {
      engine, offCanvas, offCtx: offCanvas.getContext('2d'),
      drones, units,
      fireOps: { hoseLines:[], dozerLines:[], handLines:[], retardantDrops:[], waterDrops:[], backfireLines:[], structProtect:[] },
      routeStates: {}, zoneStates: POP_ZONES.map(z => ({ ...z, status:'clear', evacPct:0 })),
      speed: 1, frame: 0,
      fireStepAccum: 0, fireStepsPerFrame: 0.05,  // balanced: spreads but agents can contain it
      fireActive: false,       // user has placed fire
      fireDetected: false,     // a drone has spotted it
      fireDetectedAt: 0,       // timestamp of detection
      detectorDroneId: null,   // which drone found it
      icsStarted: false,       // ICS engine activated
      simTimeSec: 0,           // accumulated simulation time in seconds
      ag: { dronesDeployed:0, lastDroneAssign:0, logged:new Set(), actions:0,
            retardantReq:false, crewWithdrawn:false, routesActive:false, escalated:false,
            lastWaterDrop:0 },
      events: [], lastUi: 0,
      canvas: null, ctx: null, gw: 0, gh: 0,
      tooltipTarget: null,     // { type, id, x, y } for hover tooltips
    };
    simRef.current = sim;

    // ── Listen for IC decision effects from ICS graph iframe ──
    function onDecisionEffect(ev) {
      if (!ev.data || ev.data.type !== 'ic_decision_resolved') return;
      const fx = ev.data.effects;
      if (!fx) return;
      const s = simRef.current;
      if (!s) return;
      const eng = s.engine;

      // Apply containment delta — visually suppress/expand burning cells
      if (fx.containmentDelta && fx.containmentDelta > 0) {
        // Positive containment = extinguish some burning cells
        const fronts = eng.getActiveFronts();
        const toKill = Math.round(fronts.length * (fx.containmentDelta / 100));
        for (let i = 0; i < toKill && i < fronts.length; i++) {
          const f = fronts[i];
          eng.cells[f.row * GRID_COLS + f.col] = BURNED;
        }
        s.events.push({ time: Date.now(), agent: 'deploy', msg: `IC DECISION EFFECT: Containment improved +${fx.containmentDelta}%. ${toKill} cells suppressed.`, t: Date.now() });
      } else if (fx.containmentDelta && fx.containmentDelta < 0) {
        // Negative containment = fire advances faster temporarily
        s.fireStepsPerFrame = Math.min(0.2, s.fireStepsPerFrame * 1.3);
        setTimeout(() => { if (simRef.current) simRef.current.fireStepsPerFrame = 0.05; }, 15000);
        s.events.push({ time: Date.now(), agent: 'deploy', msg: `IC DECISION EFFECT: Containment weakened ${fx.containmentDelta}%. Fire advancing faster.`, t: Date.now() });
      }

      // Apply ROS multiplier — slow/speed fire spread
      if (fx.rosMultiplier && fx.rosMultiplier !== 1) {
        if (fx.rosMultiplier < 1) {
          // Slow spread: apply retardant at the leading edge
          const lead = eng.getActiveFronts()[0];
          if (lead) {
            eng.applyRetardant(lead.row, lead.col, 8, 30);
            s.fireOps.retardantDrops.push({
              r1: lead.row - 6, c1: lead.col - 6,
              r2: lead.row + 6, c2: lead.col + 6,
              startTime: Date.now(), duration: 20000
            });
          }
          s.events.push({ time: Date.now(), agent: 'deploy', msg: `IC DECISION EFFECT: Fire spread reduced ${Math.round((1 - fx.rosMultiplier) * 100)}%. Retardant applied.`, t: Date.now() });
        }
      }

      // Apply threatened structures reduction — move struct engines
      if (fx.threatenedDelta && fx.threatenedDelta < 0) {
        const structEng = s.units.find(u => u.type === 'structeng');
        if (structEng && POP_ZONES.length > 0) {
          setUnitTarget(structEng, POP_ZONES[0].row, POP_ZONES[0].col);
          s.events.push({ time: Date.now(), agent: 'deploy', msg: `IC DECISION EFFECT: Structure protection deployed. ${Math.abs(fx.threatenedDelta)} structures secured.`, t: Date.now() });
        }
      }

      // Move units visually in response to decision
      if (ev.data.decisionId === 'wind_shift_reposition') {
        // Move engines eastward on map
        const engines = s.units.filter(u => u.type === 'engine');
        const windRad = ((eng.windDirection + 180) % 360) * Math.PI / 180;
        engines.forEach((u, i) => {
          setUnitTarget(u, u.trow + Math.sin(windRad) * 20, u.tcol + Math.cos(windRad) * 20);
        });
      } else if (ev.data.decisionId === 'spot_fire_divert') {
        // Move drones to spot fire areas
        const scouts = s.drones.filter(d => d.launched && d.dtype === 'scout').slice(0, 3);
        const stats = eng.getStats();
        const cR = stats?.centroidRow || 128, cC = stats?.centroidCol || 128;
        scouts.forEach(d => {
          d.trow = cR + (Math.random() - 0.5) * 40;
          d.tcol = cC + (Math.random() - 0.5) * 40;
        });
      } else if (ev.data.decisionId === 'crew_fatigue') {
        // If pulled crew, move hotshots back
        if (fx.containmentDelta < 0) {
          const hs = s.units.find(u => u.type === 'hotshot');
          if (hs) setUnitTarget(hs, hs.homeRow, hs.homeCol);
        }
      }
    }
    window.addEventListener('message', onDecisionEffect);
    sim._decisionCleanup = () => window.removeEventListener('message', onDecisionEffect);

    // ── DEBUG: Log drone init state ──
    const launchedInit = drones.filter(d => d.launched);
    debugLog(`SIM INIT: ${drones.length} drones created, ${launchedInit.length} launched initially`);
    for (const d of launchedInit) {
      debugLog(`  ${d.id} [${d.dtype}] ${d.model} at (${d.row.toFixed(1)},${d.col.toFixed(1)}) → target (${d.trow.toFixed(1)},${d.tcol.toFixed(1)})`);
    }
    debugLog(`MPH_TO_CPF = ${MPH_TO_CPF.toFixed(6)}, SIM_TIME_SCALE = ${SIM_TIME_SCALE}`);
    debugLog(`Scout 40mph → ${(40 * MPH_TO_CPF).toFixed(4)} cells/frame → ${(40 * MPH_TO_CPF * 60).toFixed(2)} cells/sec`);

    // ── Fire overlay canvas — synced from Three.js camera ──
    sim.canvas = mapUtils.overlayCanvas;
    sim.ctx = mapUtils.overlayCanvas.getContext('2d');
    sim._syncOverlay = mapUtils.syncOverlay;
    // Initial sync
    const dims = mapUtils.syncOverlay();
    sim.gw = dims.gw;
    sim.gh = dims.gh;

    // ── Click to ignite ──
    sim._handleClick = (lat, lng, e) => {
      if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) return;
      engine.igniteAtLatLng(lat, lng, 5);
      sim.fireActive = true;
      debugLog(`IGNITE at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      sim.events.push({ time: Date.now(), agent:'system', msg: `Fire ignited at ${lat.toFixed(3)}\u00B0N, ${Math.abs(lng).toFixed(3)}\u00B0W`, t:Date.now() });
      // Notify 3D iframe to ignite at same location
      window.postMessage({ type: 'fire_ignite_to_3d', lat, lng }, '*');
    };

    // ── Listen for fire ignition from 3D view ──
    function onFireIgnite(ev) {
      if (ev.data?.type === 'fire_ignite' && ev.data.lat && ev.data.lng) {
        const { lat, lng } = ev.data;
        if (lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX) {
          engine.igniteAtLatLng(lat, lng, 5);
          sim.fireActive = true;
          debugLog(`IGNITE from 3D at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
          sim.events.push({ time: Date.now(), agent:'system', msg: `Fire ignited at ${lat.toFixed(3)}\u00B0N, ${Math.abs(lng).toFixed(3)}\u00B0W`, t:Date.now() });
        }
      }
    }
    window.addEventListener('message', onFireIgnite);
    sim._cleanupFireIgnite = () => window.removeEventListener('message', onFireIgnite);

    // ── Periodic position emitter for 3D view (every 200ms) ──
    sim._positionEmitTimer = setInterval(() => {
      if (!sim.drones || !sim.units) return;
      const drones = sim.drones.map(d => ({
        id: d.id, dtype: d.dtype, model: d.model, launched: d.launched,
        lat: LAT_MAX - (d.row / GRID_ROWS) * (LAT_MAX - LAT_MIN),
        lng: LNG_MIN + (d.col / GRID_COLS) * (LNG_MAX - LNG_MIN),
      }));
      const units = sim.units.map(u => ({
        id: u.id, type: u.type,
        lat: LAT_MAX - (u.row / GRID_ROWS) * (LAT_MAX - LAT_MIN),
        lng: LNG_MIN + (u.col / GRID_COLS) * (LNG_MAX - LNG_MIN),
        atHome: Math.abs(u.row - u.homeRow) < 2 && Math.abs(u.col - u.homeCol) < 2,
      }));
      window.postMessage({
        type: 'unit_positions', drones, units,
        fireActive: sim.fireActive || false,
        fireDetected: sim.fireDetected || false,
      }, '*');
    }, 200);

    // ── Tooltip on hover ──
    function grid2ll(row, col) {
      const lat = LAT_MAX - (row / GRID_ROWS) * (LAT_MAX - LAT_MIN);
      const lng = LNG_MIN + (col / GRID_COLS) * (LNG_MAX - LNG_MIN);
      return { lat, lng };
    }

    const dtypeLabels = {
      scout:'DFR Scout Drone', mapper:'Mapping Fixed-Wing', relay:'Comms Relay UAS',
      safety:'Safety Overwatch', ignis:'IGNIS Aerial Ignition', reaper:'MQ-9 Reaper (HALE)',
      suppression:'Heavy-Lift Suppression',
      // Legacy aliases
      recon:'DFR Scout Drone', spotter:'Mapping Fixed-Wing', ignition:'IGNIS Aerial Ignition',
    };
    const dtypeDescs = {
      scout:'DJI M30T / Skydio X10 quadcopter. 40mph, 30-45min flight. Thermal + visual camera. First on scene for fire confirmation.',
      mapper:'senseFly eBee X / JOUAV CW-25 fixed-wing. 25mph, 1-4hr flight. Systematic grid mapping builds real-time fire perimeter.',
      relay:'Comms relay at altitude. Bridges P25 radio frequencies for ground crews in canyons. 2hr endurance.',
      safety:'DJI Mavic 3T. 40mph. Monitors crew positions via IR. Verifies escape routes. Flags safety concerns.',
      ignis:'DJI M600 + IGNIS II system. Drops dragon eggs (KMnO4 spheres) for backfire ops. 10-120 spheres/min. 30min flight.',
      reaper:'General Atomics MQ-9 Reaper. 230mph at 25,000ft. 27hr endurance. Wide-area persistent thermal surveillance.',
      suppression:'FireSwarm Thunder Wasp. Heavy-lift, carries 350kg water/retardant payload. Autonomous pickup and drop.',
      // Legacy
      recon:'DJI M30T / Skydio X10 quadcopter. 40mph, 30-45min flight. Thermal + visual camera.',
      spotter:'senseFly eBee X fixed-wing. 25mph, 1-4hr flight. Systematic grid mapping.',
      ignition:'DJI M600 + IGNIS II. Dragon egg aerial ignition for backfire operations.',
    };
    const unitLabels = {
      engine:'Type 3 Engine', tender:'Water Tender (4,000gal)', hotshot:'Hotshot Crew (IHC) — 20 personnel',
      crew:'Type 2 Hand Crew — 20 personnel', dozer:'Cat D8T Dozer', air:'DC-10 VLAT (11,600gal)',
      seat:'AT-802 Air Tractor SEAT', heli:'CH-47D Chinook Helitack', lead:'OV-10A Bronco Lead Plane',
      structeng:'Structure Engine (Type 1)',
    };
    const unitDescs = {
      engine:'3-person crew, 500gal tank. Direct attack with hose lines. Pump-and-roll. 35mph on road.',
      tender:'2-person crew. Shuttles 4,000gal water to engines on fireline. 30mph on road.',
      hotshot:'20-person elite IHC crew. Hikes at 2.5mph through brush. Hand line construction, burnout with drip torches.',
      crew:'20-person hand crew. Hikes at 2.5mph. Manual fireline with Pulaski and McLeod tools. Mop-up, cold trailing.',
      dozer:'Cat D8T with 15ft blade. Transported on lowboy trailer (25mph), cuts firebreak off-road at 6mph.',
      air:'DC-10 VLAT. 11,600gal Phos-Chek retardant. 300mph cruise. Drops AHEAD of fire. 35min turnaround at Van Nuys.',
      seat:'AT-802 Air Tractor. 800gal retardant. 170mph. Fast turnaround. Flanks and initial attack.',
      heli:'CH-47D Chinook. 2,600gal Bambi Bucket. 157mph. Cools hot spots. Night-capable with NVG.',
      lead:'OV-10A Bronco. 200mph. Scouts drop zone, marks with smoke, guides tanker approach through smoke.',
      structeng:'Structure protection: triage, sprinklers, gel, foam application.',
    };

    const tooltipHandler = (e) => {
      const s = simRef.current;
      if (!s || !s.canvas) return;
      const tt = tooltipDivRef.current;
      if (!tt) return;
      const el = mapContainerRef.current;
      if (!el) return;

      // Use the overlay canvas bounding rect directly — this correctly accounts for
      // ALL CSS transforms (scale, translate) without needing projection APIs
      const canvasRect = s.canvas.getBoundingClientRect();
      const parentRect = el.getBoundingClientRect();

      // Mouse position in overlay canvas coordinates (same space as g2px)
      const mx = (e.clientX - canvasRect.left) / canvasRect.width * s.gw;
      const my = (e.clientY - canvasRect.top) / canvasRect.height * s.gh;

      // Tooltip position in the parent div's internal coordinate space
      const parentScale = el.offsetWidth / parentRect.width;
      const tmx = (e.clientX - parentRect.left) * parentScale;
      const tmy = (e.clientY - parentRect.top) * parentScale;

      const hitRadius = 20;

      // Check drones — g2px returns canvas-space coords, same as mx/my
      for (const d of s.drones) {
        if (!d.launched) continue;
        const sp = g2px(d.row, d.col, s.gw, s.gh);
        if (Math.abs(sp.x - mx) < hitRadius && Math.abs(sp.y - my) < hitRadius) {
          const dc = DTYPE_COLORS[d.dtype] || '#22D3EE';
          const spd = SPEED[d.dtype] || 40;
          tt.innerHTML = `<div style="font-size:12px;font-weight:700;color:${dc};margin-bottom:3px">${d.id} — ${d.model || dtypeLabels[d.dtype] || d.dtype}</div>` +
            `<div style="font-size:9px;color:#94A3B8;margin-bottom:4px">${dtypeDescs[d.dtype] || ''}</div>` +
            `<div style="font-size:8px;color:#64748B">Speed: ${spd}mph | Flight time: ${d.flightTime||40}min<br>Status: ${s.fireDetected ? 'Active Response' : 'Patrol'}</div>`;
          tt.style.display = 'block';
          tt.style.left = Math.min(tmx + 16, el.offsetWidth - 340) + 'px';
          tt.style.top = Math.max(tmy - 10, 4) + 'px';
          // Cross-highlight: notify ICS graph with individual drone ID
          if (onNodeHoverRef.current) onNodeHoverRef.current('d_' + d.id.replace('D-', ''));
          return;
        }
      }

      // Check units
      for (const u of s.units) {
        const sp = g2px(u.row, u.col, s.gw, s.gh);
        if (Math.abs(sp.x - mx) < hitRadius && Math.abs(sp.y - my) < hitRadius) {
          const uc = UTYPE[u.type]?.c || '#FBBF24';
          const spd = SPEED[u.type] || 20;
          const crewInfo = u.crew ? `Crew: ${u.crew} | ` : '';
          tt.innerHTML = `<div style="font-size:12px;font-weight:700;color:${uc};margin-bottom:3px">${u.id} — ${unitLabels[u.type] || u.type}</div>` +
            `<div style="font-size:9px;color:#94A3B8;margin-bottom:4px">${unitDescs[u.type] || ''}</div>` +
            `<div style="font-size:8px;color:#64748B">${crewInfo}Speed: ${spd}mph | From: ${u.station||'Unknown'}<br>Vehicle: ${u.vehicle||''}<br>Status: ${s.fireDetected ? 'Deployed' : 'Staged at station'}</div>`;
          tt.style.display = 'block';
          tt.style.left = Math.min(tmx + 16, el.offsetWidth - 340) + 'px';
          tt.style.top = Math.max(tmy - 10, 4) + 'px';
          // Cross-highlight: notify ICS graph
          if (onNodeHoverRef.current) onNodeHoverRef.current(MAP_TO_ICS[u.id] || u.type);
          return;
        }
      }

      // Check ICP personnel
      for (const p of ICP_PERSONNEL) {
        const pp = g2px(COMMAND_CENTER.row + p.offsetR, COMMAND_CENTER.col + p.offsetC, s.gw, s.gh);
        if (Math.abs(pp.x - mx) < 12 && Math.abs(pp.y - my) < 12) {
          tt.innerHTML = `<div style="font-size:12px;font-weight:700;color:${p.color};margin-bottom:3px">${p.name}</div>` +
            `<div style="font-size:9px;color:#94A3B8">Stationed at Incident Command Post</div>`;
          tt.style.display = 'block';
          tt.style.left = Math.min(tmx + 16, el.offsetWidth - 340) + 'px';
          tt.style.top = Math.max(tmy - 10, 4) + 'px';
          if (onNodeHoverRef.current) onNodeHoverRef.current(p.id);
          return;
        }
      }

      // Check field entities (branch directors, sensors, AI agents)
      for (const fe of FIELD_ENTITIES) {
        const fePx = g2px(fe.row, fe.col, s.gw, s.gh);
        if (Math.abs(fePx.x - mx) < 14 && Math.abs(fePx.y - my) < 14) {
          const catLabel = fe.category === 'ai' ? 'AI Agent' : fe.category === 'sensor' ? 'External Sensor' :
            fe.category === 'airborne' ? 'Airborne Supervisor' : 'Field Command';
          tt.innerHTML = `<div style="font-size:12px;font-weight:700;color:${fe.color};margin-bottom:3px">${fe.name}</div>` +
            `<div style="font-size:9px;color:#94A3B8">${catLabel}</div>`;
          tt.style.display = 'block';
          tt.style.left = Math.min(tmx + 16, el.offsetWidth - 340) + 'px';
          tt.style.top = Math.max(tmy - 10, 4) + 'px';
          if (onNodeHoverRef.current) onNodeHoverRef.current(fe.id);
          return;
        }
      }

      // Check command center
      const ccSp = g2px(COMMAND_CENTER.row, COMMAND_CENTER.col, s.gw, s.gh);
      if (Math.abs(ccSp.x - mx) < 20 && Math.abs(ccSp.y - my) < 20) {
        const stashed = s.drones.filter(d => !d.launched).length;
        const launched = s.drones.filter(d => d.launched).length;
        const phase = icsEngine ? icsEngine.icsPhase : 'standby';
        tt.innerHTML = `<div style="font-size:12px;font-weight:700;color:#A78BFA;margin-bottom:3px">FireSight ICP — Incident Command Post</div>` +
          `<div style="font-size:9px;color:#94A3B8;margin-bottom:4px">Pepperdine University staging area (34.074°N, 118.551°W). Real ICP location used during the 2025 Palisades Fire.</div>` +
          `<div style="font-size:8px;color:#64748B">UAS Fleet: ${launched} airborne / ${stashed} in reserve (${DRONE_STASH_TOTAL} total)<br>ICS Phase: ${phase.toUpperCase()}</div>`;
        tt.style.display = 'block';
        tt.style.left = Math.min(tmx + 16, el.offsetWidth - 340) + 'px';
        tt.style.top = Math.max(tmy - 10, 4) + 'px';
        if (onNodeHoverRef.current) onNodeHoverRef.current('ic');
        return;
      }

      // Nothing hovered — clear highlight
      tt.style.display = 'none';
      if (onNodeHoverRef.current) onNodeHoverRef.current(null);
    };

    mapContainerRef.current?.addEventListener('mousemove', tooltipHandler);

    // Click-to-ignite is now handled via sim._handleClick from the Three.js click listener

    startLoop();
  }

  // ── Grid (row,col) → Overlay canvas pixel ─────────────────────────────
  function g2px(row, col, gw, gh) {
    return { x: (col / GRID_COLS) * gw, y: (row / GRID_ROWS) * gh };
  }

  function ll2px(lat, lng, gw, gh) {
    const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * gw;
    const y = (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * gh;
    return { x, y };
  }

  // ── K-Means Clustering of Fire Fronts ─────────────────────────────────
  function clusterFronts(fronts, k) {
    if (fronts.length === 0) return [];
    if (fronts.length <= k) return fronts.map(f => ({ row:f.row, col:f.col, size:1 }));
    const step = Math.max(1, Math.floor(fronts.length / k));
    const centroids = [];
    for (let i = 0; i < k; i++) centroids.push({ row:fronts[Math.min(i*step,fronts.length-1)].row, col:fronts[Math.min(i*step,fronts.length-1)].col });
    for (let iter = 0; iter < 3; iter++) {
      const groups = centroids.map(() => ({ sR:0, sC:0, n:0 }));
      for (const f of fronts) {
        let best = 0, bestD = Infinity;
        for (let j = 0; j < centroids.length; j++) { const d = (f.row-centroids[j].row)**2 + (f.col-centroids[j].col)**2; if (d < bestD) { bestD=d; best=j; } }
        groups[best].sR += f.row; groups[best].sC += f.col; groups[best].n++;
      }
      for (let j = 0; j < centroids.length; j++) { if (groups[j].n > 0) { centroids[j].row = groups[j].sR/groups[j].n; centroids[j].col = groups[j].sC/groups[j].n; } }
    }
    const sizes = centroids.map(() => 0);
    for (const f of fronts) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < centroids.length; j++) { const d = (f.row-centroids[j].row)**2 + (f.col-centroids[j].col)**2; if (d < bestD) { bestD=d; best=j; } }
      sizes[best]++;
    }
    return centroids.map((c,i) => ({ row:Math.round(c.row), col:Math.round(c.col), size:sizes[i] })).filter(c => c.size > 0).sort((a,b) => b.size - a.size);
  }

  function getDefensePos(fronts, count, engine) {
    // Place engines at evenly-spaced points ALONG the active fire edge, offset
    // a few cells OUTWARD (away from fire center) so they're just outside the flames.
    if (fronts.length === 0) return [];
    // Fire center (used only to compute outward direction)
    let fcR=0,fcC=0;
    for (const f of fronts) { fcR+=f.row; fcC+=f.col; }
    fcR/=fronts.length; fcC/=fronts.length;
    // Sample `count` evenly-spaced front cells
    const step = Math.max(1, Math.floor(fronts.length / count));
    const OFFSET = 8; // cells outward from the fire edge
    const positions = [];
    for (let i = 0; i < count; i++) {
      const f = fronts[Math.min(i * step, fronts.length - 1)];
      // Direction from fire center → this front cell = outward
      const dr = f.row - fcR, dc = f.col - fcC;
      const len = Math.sqrt(dr*dr + dc*dc) || 1;
      const nr = dr/len, nc = dc/len;
      positions.push({
        row: Math.round(Math.max(2, Math.min(GRID_ROWS-2, f.row + nr * OFFSET))),
        col: Math.round(Math.max(2, Math.min(GRID_COLS-2, f.col + nc * OFFSET))),
      });
    }
    return positions;
  }

  function fireDist(zone, engine) {
    let minD = 999;
    for (let i = 0; i < engine.rows * engine.cols; i++) {
      if (engine.cells[i] !== BURNING) continue;
      const r = Math.floor(i/engine.cols), c = i%engine.cols;
      const d = Math.sqrt((r-zone.row)**2 + (c-zone.col)**2);
      if (d < minD) minD = d;
    }
    return minD;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DRONE PATROL — autonomous scan patterns before fire detection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function updateDronePatrol(sim) {
    const { drones } = sim;
    for (const d of drones) {
      if (!d.launched) continue;  // still in stash at command center
      d.patrolAngle += 0.008 * sim.speed;

      if (d.dtype === 'scout' || d.dtype === 'recon') {
        // Scout (Skydio/M30): fast figure-8 scan pattern
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.sin(d.patrolAngle * 2) * d.patrolRadius * 0.6;
      } else if (d.dtype === 'mapper' || d.dtype === 'spotter') {
        // Mapper (eBee): systematic grid lines (fixed-wing lawnmower pattern)
        const row = Math.floor(d.patrolAngle / (Math.PI * 2)) % 8;
        const progress = (d.patrolAngle % (Math.PI * 2)) / (Math.PI * 2);
        const rowDir = row % 2 === 0 ? 1 : -1;
        d.trow = d.patrolCenterRow - d.patrolRadius + (row / 8) * d.patrolRadius * 2;
        d.tcol = d.patrolCenterCol + rowDir * (progress - 0.5) * d.patrolRadius * 2;
      } else if (d.dtype === 'relay') {
        // Comms relay: slow station-keeping at altitude
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.3) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.3) * d.patrolRadius;
      } else if (d.dtype === 'safety') {
        // Safety overwatch (Mavic 3T): patrol near crew positions
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.7) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.7) * d.patrolRadius;
      } else if (d.dtype === 'reaper') {
        // MQ-9 Reaper: wide slow orbit at 25,000ft
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.15) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.15) * d.patrolRadius;
      } else if (d.dtype === 'suppression') {
        // Heavy-lift: circular pattern near water source then fire
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.5) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.5) * d.patrolRadius;
      } else {
        // IGNIS/other: standby, small hover drift
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.2) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.2) * d.patrolRadius;
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FIRE DETECTION — check if any drone can see burning cells
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function checkFireDetection(sim) {
    if (sim.fireDetected || !sim.fireActive) return false;
    const { drones, engine } = sim;
    const range = DRONE_SENSOR_RANGE;
    const rangeSq = range * range;

    for (const d of drones) {
      if (!d.launched) continue;
      if (!['recon','spotter','scout','mapper','safety','reaper'].includes(d.dtype)) continue;
      const dr = Math.round(d.row), dc = Math.round(d.col);

      for (let r = Math.max(0, dr - range); r < Math.min(GRID_ROWS, dr + range); r++) {
        for (let c = Math.max(0, dc - range); c < Math.min(GRID_COLS, dc + range); c++) {
          if ((r-dr)*(r-dr) + (c-dc)*(c-dc) > rangeSq) continue;
          if (engine.cells[r * GRID_COLS + c] === BURNING) {
            sim.fireDetected = true;
            sim.fireDetectedAt = Date.now();
            sim.detectorDroneId = d.id;
            sim.events.push({
              time: Date.now(), agent:'swarm',
              msg: `${d.id} (${d.dtype}) THERMAL ALERT \u2014 fire detected! Vectoring fleet.`,
              t: Date.now()
            });
            sim.events.push({
              time: Date.now(), agent:'overwatch',
              msg: `INCIDENT DECLARED. 5 AI agents online. Orchestrating response.`,
              t: Date.now()
            });
            return true;
          }
        }
      }
    }
    return false;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FIRE BEHAVIOR SCORING — composite threat assessment drives all dispatch
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function getResponseLevel(acres, ros, fronts, spots, windSpeed) {
    // Composite score: weights calibrated to real ICS escalation thresholds
    const score = (acres * 0.3) + (ros * 10) + (fronts * 0.1) + (windSpeed * 0.5) + (spots * 5);
    // Level 1: Size-up (initial detection, < 2 acres)
    // Level 2: Initial Attack (confirmed fire, engines + heli)
    // Level 3: Extended Attack (growing, add heavy resources)
    // Level 4: Major Fire (structure threat, VLAT + evac)
    // Level 5: Type 1 Incident (all resources committed)
    if (score > 120) return 5;
    if (score > 60)  return 4;
    if (score > 25)  return 3;
    if (score > 8)   return 2;
    return 1;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUTONOMOUS AGENT TICK — only runs AFTER fire detection
  // Dispatch is CONDITION-DRIVEN: units deploy based on fire behavior, not timers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function agentTick(sim) {
    if (!sim.fireDetected) return;
    const now = Date.now();
    if (now - (sim._lastAgentTick || 0) < 1500) return;
    sim._lastAgentTick = now;

    const { engine, drones, units, fireOps, ag } = sim;
    const stats = engine.getStats();
    if (!stats || stats.totalAffected === 0) return;

    const acres = Math.round(stats.totalAcres);
    const ros = stats.rosChainPerHour;
    const fronts = stats.activeFrontCells;
    const spots = stats.spotFireCount;
    const activeFronts = engine.getActiveFronts();
    const windRad = ((engine.windDirection + 180) % 360) * Math.PI / 180;
    const secSinceDetection = (now - sim.fireDetectedAt) / 1000;
    const level = getResponseLevel(acres, ros, fronts, spots, engine.windSpeed);

    // Fire centroid (center of active fronts — IN THE ASH, only for direction calc)
    let cR = 0, cC = 0;
    if (activeFronts.length > 0) { for (const f of activeFronts) { cR += f.row; cC += f.col; } cR /= activeFronts.length; cC /= activeFronts.length; }
    // Leading edge: the frontmost burning cell in the wind direction
    function leadingEdge() { let b = activeFronts[0], bs = -Infinity; for (const f of activeFronts) { const s = -Math.cos(windRad)*f.row + Math.sin(windRad)*f.col; if (s > bs) { bs=s; b=f; } } return b; }
    // Helper: get a fire-edge point offset outward from fire center
    // Used to place ground units AT the fire edge, not in the ash
    function edgePoint(angleFraction) {
      // Pick a front cell at the given fraction (0-1) of the sorted perimeter
      if (activeFronts.length === 0) return { row: 128, col: 128 };
      const idx = Math.min(Math.floor(angleFraction * activeFronts.length), activeFronts.length - 1);
      const f = activeFronts[idx];
      // Offset outward from fire center
      const dr = f.row - cR, dc = f.col - cC;
      const len = Math.sqrt(dr*dr + dc*dc) || 1;
      return { row: f.row + (dr/len)*6, col: f.col + (dc/len)*6 };
    }
    // Helper: get the fire-edge point closest to a given direction from center
    function edgeInDirection(dirRow, dirCol) {
      if (activeFronts.length === 0) return { row: 128, col: 128 };
      let best = activeFronts[0], bestDot = -Infinity;
      const len = Math.sqrt(dirRow*dirRow + dirCol*dirCol) || 1;
      const nr = dirRow/len, nc = dirCol/len;
      for (const f of activeFronts) {
        const dot = (f.row - cR)*nr + (f.col - cC)*nc;
        if (dot > bestDot) { bestDot = dot; best = f; }
      }
      return { row: best.row + nr*8, col: best.col + nc*8 };
    }
    const addEvent = (agent, msg) => {
      sim.events.push({ time: now, agent, msg, t: now });
      // Forward to comms log via postMessage (same window — App.jsx listens)
      const agentLabels = { swarm:'DRONE SWARM', predict:'AI PREDICT', deploy:'DEPLOY', evac:'AI EVAC', overwatch:'OVERWATCH', system:'SYSTEM' };
      window.postMessage({ type: 'map_event', from: agentLabels[agent]||agent.toUpperCase(), msg, msgType: agent==='evac'?'safety':agent==='deploy'?'command':'ai' }, '*');
    };

    // ── SWARM: launch drones from command center stash based on fire size ──
    const launchedDrones = drones.filter(d => d.launched);
    const stashedDrones = drones.filter(d => !d.launched);
    const desiredLaunched = Math.min(DRONE_STASH_TOTAL, Math.max(INITIAL_PATROL, INITIAL_PATROL + Math.ceil(acres / 15) + Math.ceil(fronts / 25) + spots * 2));

    if (launchedDrones.length < desiredLaunched && stashedDrones.length > 0) {
      const toLaunch = Math.min(desiredLaunched - launchedDrones.length, stashedDrones.length);
      for (let i = 0; i < toLaunch; i++) {
        const d = stashedDrones[i];
        d.launched = true;
        // Send new drones to the fire edge, not the ash center
        const ep = edgePoint(i / Math.max(1, toLaunch));
        d.trow = Math.round(ep.row + (Math.random() - 0.5) * 8);
        d.tcol = Math.round(ep.col + (Math.random() - 0.5) * 8);
      }
      const newTotal = drones.filter(d => d.launched).length;
      const remaining = drones.filter(d => !d.launched).length;
      if (!ag.logged.has('launch_' + newTotal)) {
        ag.logged.add('launch_' + newTotal);
        addEvent('swarm', `DECISION: ${acres} acres / ${fronts} front cells → launching ${toLaunch} drone${toLaunch>1?'s':''}. Fleet: ${newTotal}/${DRONE_STASH_TOTAL} (${remaining} reserve).`);
        ag.actions++;
      }
    }

    // Reassign all launched drones to fire edge clusters
    if (now - ag.lastDroneAssign > 4000) {
      ag.lastDroneAssign = now;
      const active = drones.filter(d => d.launched);
      const clusters = clusterFronts(activeFronts, Math.min(active.length, Math.max(3, Math.ceil(active.length / 3))));
      let di = 0;
      for (let ci = 0; ci < clusters.length && di < active.length; ci++) {
        const cl = clusters[ci];
        // Offset cluster center outward from fire center so drones hover over the edge, not the ash
        const dr = cl.row - cR, dc = cl.col - cC;
        const len = Math.sqrt(dr*dr + dc*dc) || 1;
        const oRow = cl.row + (dr/len)*5, oCol = cl.col + (dc/len)*5;
        const dronesFor = Math.min(4, Math.max(1, Math.round(cl.size / Math.max(1, fronts) * active.length)));
        for (let d = 0; d < dronesFor && di < active.length; d++) {
          active[di].trow = oRow + (d - dronesFor / 2) * 3;
          active[di].tcol = oCol + (d - dronesFor / 2) * 2;
          di++;
        }
      }
      // Remaining drones orbit the fire perimeter
      while (di < active.length) {
        const frac = di / active.length;
        const ep = edgePoint(frac);
        active[di].trow = ep.row;
        active[di].tcol = ep.col;
        di++;
      }
      ag.dronesDeployed = active.length;
    }

    // ── PREDICT: fire behavior analysis (condition-driven) ──
    if (acres >= 1 && !ag.logged.has('predict_init')) {
      ag.logged.add('predict_init');
      addEvent('predict', `ANALYSIS: ROS ${ros.toFixed(1)} ch/hr, Wind ${engine.windSpeed}mph @ ${engine.windDirection}°, ${fronts} active fronts. Threat Level ${level}/5. Spotting risk: ${engine.windSpeed>20?'EXTREME':engine.windSpeed>15?'HIGH':'MODERATE'}.`);
      ag.actions++;
    }
    if (acres >= 5 && !ag.logged.has('predict_forecast')) {
      ag.logged.add('predict_forecast');
      const est1h = Math.round(acres * (1 + ros * 0.5 + engine.windSpeed * 0.05));
      addEvent('predict', `FORECAST: 1h projection ${est1h} acres (50-scenario ensemble). Confidence ${ros>2?'58':'72'}%. ${ros>2?'Extreme ROS — recommend aerial suppression.':'Recommend direct attack.'}`);
      ag.actions++;
    }
    // Periodic updates as fire grows
    if (acres > 20 && !ag.logged.has('predict_update_'+Math.floor(acres/30)*30)) {
      ag.logged.add('predict_update_'+Math.floor(acres/30)*30);
      addEvent('predict', `UPDATE: Fire now ${acres} acres, ROS ${ros.toFixed(1)} ch/hr. Threat Level ${level}/5. ${spots>0?`${spots} spot fires active.`:''} Containment ${engine.windSpeed>20?'unlikely':'possible'} with current resources.`);
      ag.actions++;
    }

    // ── DEPLOY: CONDITION-DRIVEN dispatch ──
    // Units are dispatched ONCE to a road-accessible staging point near the fire.
    // After arriving, they hold position and only reposition every 30 seconds (real time).

    // Helper: find nearest road node to a point (for staging on roads, not in brush)
    function nearestRoadStaging(targetRow, targetCol) {
      let bestR = targetRow, bestC = targetCol, bestDist = Infinity;
      for (const rn of ROAD_NODES) {
        const d = (rn.row - targetRow) ** 2 + (rn.col - targetCol) ** 2;
        if (d < bestDist) { bestDist = d; bestR = rn.row; bestC = rn.col; }
      }
      return { row: bestR, col: bestC };
    }

    const engines = units.filter(u => u.type === 'engine');
    if (level >= 2 && acres >= 2 && activeFronts.length > 0) {
      // Dispatch engines ONCE, then only reposition every 30s
      if (!ag.logged.has('engine_attack')) {
        ag.logged.add('engine_attack');
        const defPos = getDefensePos(activeFronts, engines.length, engine);
        for (let ei = 0; ei < engines.length; ei++) {
          if (ei < defPos.length) {
            const staging = nearestRoadStaging(defPos[ei].row, defPos[ei].col);
            setUnitTarget(engines[ei], staging.row, staging.col);
          }
        }
        addEvent('deploy',`DECISION: Fire confirmed ${acres} acres, ROS ${ros.toFixed(1)} ch/hr → dispatching ${engines.length} engines. E-69A/B (Palisades), E-23 (Brentwood). ETA 8-12 min.`);
        ag.actions += 2;
        ag.lastEngineRepos = now;
      }
      // Reposition engines every 30s to follow the fire's advance
      if (ag.lastEngineRepos && now - ag.lastEngineRepos > 30000) {
        ag.lastEngineRepos = now;
        const defPos = getDefensePos(activeFronts, engines.length, engine);
        for (let ei = 0; ei < engines.length; ei++) {
          if (ei < defPos.length) {
            // Only move if fire has shifted significantly (>15 cells from current position)
            const dr = defPos[ei].row - engines[ei].row, dc = defPos[ei].col - engines[ei].col;
            if (Math.sqrt(dr * dr + dc * dc) > 15) {
              const staging = nearestRoadStaging(defPos[ei].row, defPos[ei].col);
              setUnitTarget(engines[ei], staging.row, staging.col);
            }
          }
        }
      }
    }

    // Level 2+: Water tender behind fire line (upwind, on road)
    const tender = units.find(u => u.type === 'tender');
    if (tender && level >= 2 && acres >= 5) {
      if (!ag.logged.has('tender')) {
        ag.logged.add('tender');
        const upwindPt = edgeInDirection(Math.cos(windRad), -Math.sin(windRad));
        const staging = nearestRoadStaging(upwindPt.row, upwindPt.col);
        setUnitTarget(tender, staging.row, staging.col);
        addEvent('deploy',`DECISION: ${acres} acres requires sustained water → WT-71 (4,000gal) from LACoFD Stn 71 via Malibu Canyon Rd.`);
        ag.actions++;
      }
    }

    // Level 2+: Helicopter orbits the fire EDGE, not the center
    const heli = units.find(u => u.type==='heli');
    if (heli && level >= 2 && (acres >= 8 || fronts > 20 || ros > 2.0)) {
      // Orbit along the active fire perimeter
      const orbitFrac = ((now * 0.0001) % 1);
      const ep = edgePoint(orbitFrac);
      heli.trow = ep.row; heli.tcol = ep.col;
      if (!ag.lastWaterDrop || now-ag.lastWaterDrop > 3000/sim.speed) {
        ag.lastWaterDrop=now; const lead=leadingEdge();
        if (lead) { fireOps.waterDrops.push({row:heli.trow,col:heli.tcol,startTime:now,duration:2000}); for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++) { const rr=Math.round(lead.row+dr),cc=Math.round(lead.col+dc); if(rr>=0&&rr<GRID_ROWS&&cc>=0&&cc<GRID_COLS&&engine.cells[rr*GRID_COLS+cc]===BURNING) engine.cells[rr*GRID_COLS+cc]=BURNED; } }
        if (!ag.logged.has('heli_drop')) { ag.logged.add('heli_drop'); addEvent('deploy',`DECISION: ${fronts} active fronts, ROS ${ros.toFixed(1)} → aerial attack needed. H-1 Chinook from SMO (157mph), 2,600gal Bambi Bucket.`); ag.actions++; }
      }
    }

    // Level 3+: Lead plane orbits just ahead of the fire edge
    const leadPlane = units.find(u => u.type==='lead');
    if (leadPlane && level >= 3 && acres >= 15) {
      const lpFrac = ((now * 0.00012 + 0.3) % 1);
      const lpPt = edgePoint(lpFrac);
      leadPlane.trow = lpPt.row; leadPlane.tcol = lpPt.col;
      if (!ag.logged.has('lead')) { ag.logged.add('lead'); addEvent('deploy',`DECISION: Multiple aircraft on scene → LP-1 Bronco lead plane for drop zone coordination.`); ag.actions++; }
    }

    // Level 3+: Hand crews on fire flanks (perpendicular to wind, staged on nearest road)
    const handCrews = units.filter(u => u.type==='crew');
    if (handCrews.length>0 && level >= 3 && fronts > 30 && !ag.logged.has('crew_line')) {
      ag.logged.add('crew_line');
      for (let ci=0; ci<handCrews.length; ci++) {
        const side = ci % 2 === 0 ? 1 : -1;
        const flankDir = { row: Math.sin(windRad + side * Math.PI/2), col: Math.cos(windRad + side * Math.PI/2) };
        const pt = edgeInDirection(flankDir.row, flankDir.col);
        const staging = nearestRoadStaging(pt.row, pt.col);
        setUnitTarget(handCrews[ci], staging.row, staging.col);
      }
      addEvent('deploy',`DECISION: ${fronts} fronts need containment → ${handCrews.length} hand crews (20 each) to flanks for fireline construction.`); ag.actions++;
    }

    // Level 3+: SEAT when flanks need retardant — orbits fire edge
    const seat = units.find(u => u.type==='seat');
    if (seat && level >= 3 && acres >= 20) {
      const seatFrac = ((now * 0.00015 + 0.6) % 1);
      const seatPt = edgePoint(seatFrac);
      seat.trow = seatPt.row; seat.tcol = seatPt.col;
      if (!ag.logged.has('seat_drop') && acres>25 && activeFronts.length>0) { ag.logged.add('seat_drop'); const flank=activeFronts[Math.floor(activeFronts.length*0.3)]; if (flank) { fireOps.retardantDrops.push({r1:flank.row,c1:flank.col,r2:flank.row+8,c2:flank.col+8,startTime:now,duration:15000}); engine.applyRetardant(flank.row+4,flank.col+4,5,30); } addEvent('deploy',`DECISION: Flanks spreading → SE-1 SEAT (800gal retardant) on southern flank.`); ag.actions++; }
    }

    // Level 3+: Dozer ahead of fire (downwind edge, on nearest road)
    const dozer = units.find(u => u.type==='dozer');
    if (dozer && level >= 3 && acres >= 25 && engine.windSpeed > 12 && !ag.logged.has('dozer_break') && activeFronts.length>0) {
      ag.logged.add('dozer_break');
      const lead = leadingEdge();
      if (lead) {
        const dwR = -Math.cos(windRad), dwC = Math.sin(windRad);
        const aR = lead.row + dwR * 15, aC = lead.col + dwC * 15;
        const staging = nearestRoadStaging(aR, aC);
        setUnitTarget(dozer, staging.row, staging.col);
      }
      addEvent('deploy',`DECISION: Wind ${engine.windSpeed}mph driving spread → DZ-1 Cat D8T cutting 15ft firebreak ahead of fire.`); ag.actions+=2;
    }

    // Level 3+: Hotshot burnout at the downwind flank (staged on nearest road)
    const hotshot = units.find(u => u.type==='hotshot');
    if (hotshot && level >= 3 && acres >= 30 && ros > 1.0 && !ag.crewWithdrawn && !ag.logged.has('backfire') && activeFronts.length>0) {
      ag.logged.add('backfire');
      const dwR = -Math.cos(windRad), dwC = Math.sin(windRad);
      const pt = edgeInDirection(dwR, dwC);
      const staging = nearestRoadStaging(pt.row, pt.col);
      setUnitTarget(hotshot, staging.row, staging.col);
      addEvent('deploy',`DECISION: ROS ${ros.toFixed(1)} ch/hr, direct attack failing → IHC-8 Hotshots for indirect burnout ops.`); ag.actions+=3;
    }

    // Level 4+: VLAT — now gated by AI_OVERWATCH decision queue (Iteration 2)
    // Direct dispatch removed; VLAT is proposed via proposeDecision('ai_overwatch', 'request_vlat', ...)

    // Level 4+: Structure protection when population zones threatened
    const structEng = units.find(u => u.type==='structeng');
    if (structEng && level >= 4 && !ag.logged.has('struct_protect')) {
      const nearest = sim.zoneStates.reduce((best,z) => { const d=fireDist(z,engine); return d<best.d?{z,d}:best; },{z:sim.zoneStates[0],d:999});
      if (nearest.d<40) { ag.logged.add('struct_protect'); const staging = nearestRoadStaging(nearest.z.row, nearest.z.col); setUnitTarget(structEng, staging.row, staging.col); addEvent('deploy',`DECISION: Fire ${Math.round(nearest.d)} cells from ${nearest.z.name} (${nearest.z.pop} residents) → SP-19 for structure triage.`); ag.actions+=2; }
    }

    // Safety: Crew withdrawal when overrun risk detected
    if (!ag.crewWithdrawn && acres>100 && hotshot) {
      let nearFire=false; for (const f of activeFronts) { if (Math.abs(f.row-hotshot.row)<10 && Math.abs(f.col-hotshot.col)<10) { nearFire=true; break; } }
      if (nearFire) { ag.crewWithdrawn=true; setUnitTarget(hotshot, 170, 90); addEvent('deploy','SAFETY OVERRIDE: IHC-8 WITHDRAWING — fire overrun risk. LCES compromised. All crew accounted for.'); ag.actions+=2; }
    }

    // ── EVAC: zone threat assessment (AI_EVAC driven) ──
    for (const zone of sim.zoneStates) {
      const dist = fireDist(zone, engine);
      if (zone.status==='clear' && dist<50) { zone.status='advisory'; addEvent('evac',`AI_EVAC ANALYSIS: Fire ${Math.round(dist)} cells from ${zone.id} (${zone.name}, ${zone.pop} residents) → ADVISORY issued.`); ag.actions++; }
      else if (zone.status==='advisory' && dist<35) { zone.status='warning'; addEvent('evac',`AI_EVAC: ${zone.id} fire ETA ~${Math.round(dist*95/1000*60/(ros*22+1))}min → WARNING. Prepare to evacuate.`); ag.actions++; if (!ag.routesActive) { ag.routesActive=true; ROUTES.forEach(r=>sim.routeStates[r.id]='clear'); addEvent('evac','3 evacuation routes activated. AI_EVAC optimizing flow.'); } }
      else if (zone.status==='warning' && dist<20) { zone.status='order'; addEvent('evac',`MANDATORY EVACUATION: ${zone.id}. ${zone.pop} residents. Genasys WEA + reverse-911 sent.`); ag.actions+=2; }
      if (zone.status==='warning'||zone.status==='order') zone.evacPct=Math.min(98,(zone.evacPct||0)+(zone.status==='order'?1.5:0.5));
      if (dist<15 && zone.id==='C1' && sim.routeStates['R3']!=='blocked') { sim.routeStates['R3']='blocked'; addEvent('evac','AI_EVAC: R3 Topanga Canyon BLOCKED by fire. Rerouting to R1 Sunset.'); }
      if (dist<25 && zone.id==='B3' && sim.routeStates['R2']==='clear') { sim.routeStates['R2']='congested'; addEvent('evac','AI_EVAC: R2 PCH congested → recommending contraflow for single-exit zones.'); }
    }

    // ── AI DECISION PROPOSALS — now handled by ICS graph iframe via postMessage ──
    // Old icsEngine.proposeDecision() calls removed; IC decisions come from ics-graph.html

    // ── Escalation (driven by response level) ──
    if (!ag.escalated && level >= 5) { ag.escalated=true; addEvent('overwatch',`ESCALATED to Type 1 Incident. ${acres} acres, Level ${level} threat. Requesting mutual aid via IROC.`); ag.actions+=3; }

    // ── Dynamic reinforcements (mutual aid, condition-driven) ──
    const desiredEngines = Math.max(3, Math.min(8, 3 + Math.floor(acres / 40)));
    const currentEngines = units.filter(u => u.type === 'engine').length;
    if (desiredEngines > currentEngines && level >= 3) {
      for (let i = currentEngines; i < desiredEngines; i++) {
        const u = { id:`E-MA${i+1}`, type:'engine', homeRow:COMMAND_CENTER.row, homeCol:COMMAND_CENTER.col, row:COMMAND_CENTER.row, col:COMMAND_CENTER.col, trow:COMMAND_CENTER.row, tcol:COMMAND_CENTER.col, station:'Mutual Aid', crew:3, vehicle:'Pierce Type 3', _path:null, _pi:0 };
        units.push(u);
        setUnitTarget(u, Math.round(cR + (Math.random()-0.5)*20), Math.round(cC + (Math.random()-0.5)*20));
      }
      addEvent('deploy', `DECISION: Level ${level} threat, ${acres} acres → ${desiredEngines - currentEngines} mutual aid engines requested. Total: ${desiredEngines}.`);
      ag.actions++;
    }

    const desiredHelis = Math.max(1, Math.min(4, 1 + Math.floor(acres / 80)));
    const currentHelis = units.filter(u => u.type === 'heli').length;
    if (desiredHelis > currentHelis && level >= 3) {
      for (let i = currentHelis; i < desiredHelis; i++) {
        const u = { id:`H-MA${i+1}`, type:'heli', homeRow:COMMAND_CENTER.row, homeCol:COMMAND_CENTER.col, row:COMMAND_CENTER.row, col:COMMAND_CENTER.col, trow:Math.round(cR), tcol:Math.round(cC), station:'Mutual Aid', crew:4, vehicle:'CH-47D Chinook', _path:null, _pi:0 };
        units.push(u);
      }
      addEvent('deploy', `DECISION: ${acres} acres exceeds rotary-wing capacity → ${desiredHelis - currentHelis} additional heli${desiredHelis-currentHelis>1?'s':''} scrambled. Total: ${desiredHelis}.`);
      ag.actions++;
    }

    // ── Spot fires ──
    if (spots>(sim._lastSpots||0) && spots>0) { const n=spots-(sim._lastSpots||0); if (n>0 && !ag.logged.has('spot_'+spots)) { ag.logged.add('spot_'+spots); addEvent('swarm',`IR CONFIRMED: ${n} new spot fire${n>1?'s':''}! Total: ${spots}. Vectoring scout drones.`); ag.actions+=2; } }
    sim._lastSpots = spots;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ANIMATION LOOP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function startLoop() {
    function animate() {
      const sim = simRef.current;
      if (!sim || !sim.canvas || !sim.ctx) { animRef.current = requestAnimationFrame(animate); return; }
      // Sync overlay canvas position/size with Three.js camera
      if (sim._syncOverlay) {
        const dims = sim._syncOverlay();
        sim.gw = dims.gw;
        sim.gh = dims.gh;
        sim.ctx = sim.canvas.getContext('2d');
      }
      if (sim.gw === 0) { animRef.current = requestAnimationFrame(animate); return; }
      sim.frame++;
      const { engine, offCanvas, offCtx, drones, units, fireOps, frame, ctx, gw, gh } = sim;

      // Accumulate sim clock (SIM_TIME_SCALE sec of sim per real-sec, times speed)
      sim.simTimeSec += (SIM_TIME_SCALE / 60) * sim.speed;

      // Tick fire engine (always, if fire is active)
      if (sim.fireActive && sim.fireStepsPerFrame > 0) {
        sim.fireStepAccum += sim.fireStepsPerFrame * sim.speed;
        const steps = Math.floor(sim.fireStepAccum);
        if (steps > 0) { sim.fireStepAccum -= steps; engine.runSteps(steps); }
      }

      // Drone patrol (always running pre-detection)
      if (!sim.fireDetected) {
        updateDronePatrol(sim);
      }

      // Debug log every 300 frames (~5 sec)
      if (frame % 300 === 1) {
        const ld = drones.filter(d => d.launched);
        debugLog(`FRAME ${frame}: ${ld.length} drones airborne, fireActive=${sim.fireActive}, fireDetected=${sim.fireDetected}, gw=${gw}, gh=${gh}`);
        if (ld.length > 0) {
          const d0 = ld[0];
          debugLog(`  ${d0.id} pos=(${d0.row.toFixed(2)},${d0.col.toFixed(2)}) tgt=(${d0.trow.toFixed(2)},${d0.tcol.toFixed(2)}) spd=${(SPEED[d0.dtype]||40)*MPH_TO_CPF} c/f`);
        }
      }

      // Check if drones can see fire
      checkFireDetection(sim);

      // ICS Engine — start on fire detection, tick every frame
      if (sim.fireDetected && icsEngine) {
        if (!sim.icsStarted) {
          sim.icsStarted = true;
          icsEngine.activateSensors();
          // Set initial fire origin from grid center of burning cells
          const stats = engine.getStats();
          if (stats) {
            icsEngine.fire.area = stats.totalAcres || 0.5;
          }
        }
        // Feed real fire stats into ICS engine
        const stats = engine.getStats();
        if (stats) {
          icsEngine.updateFireState({
            totalAcres: stats.totalAcres,
            rosChainPerHour: stats.rosChainPerHour,
            windSpeed: engine.windSpeed,
            windDirection: engine.windDirection,
            spotFires: [],  // managed internally by ICS
          });
          // Threatened structures based on proximity
          const activeFronts = engine.getActiveFronts();
          let threatened = 0;
          for (const zone of POP_ZONES) {
            let minD = 999;
            for (const f of activeFronts) {
              const d = Math.sqrt((f.row - zone.row) ** 2 + (f.col - zone.col) ** 2);
              if (d < minD) minD = d;
            }
            if (minD < 30) threatened += Math.round(zone.pop * Math.max(0, (30 - minD) / 30));
          }
          icsEngine.fire.threatenedStructures = threatened;
          // Spot fires from engine
          if (stats.spotFireCount > icsEngine.fire.spots.length) {
            for (let i = icsEngine.fire.spots.length; i < stats.spotFireCount; i++) {
              icsEngine.fire.spots.push({ x: 0.5 + Math.random() * 0.1, y: 0.3 + Math.random() * 0.1, confirmed: false, area: 0.1 });
            }
          }
        }
        // Tick ICS at sim speed
        const icsDt = (1 / 60) * sim.speed * 10;  // accelerated sim time
        icsEngine.tick(icsDt);

        // Sync ICS events into our event log
        const recentMsgs = icsEngine.getRecentMessages(3);
        for (const m of recentMsgs) {
          const key = `ics_${m.from}_${m.to}_${Math.floor(m.t)}`;
          if (!sim.ag.logged.has(key)) {
            sim.ag.logged.add(key);
            const fromNode = ICS_NODES[m.from];
            const toNode = ICS_NODES[m.to];
            sim.events.push({
              time: Date.now(), agent: m.type === 'ai' ? 'predict' : m.type === 'safety' ? 'deploy' : m.type === 'command' ? 'overwatch' : 'system',
              msg: `[${fromNode?.short || m.from} → ${toNode?.short || m.to}] ${m.msg}`,
              t: Date.now(),
            });
            sim.ag.actions++;
          }
        }

        // Sync ICS banners
        if (icsEngine.banners.length > 0) {
          const lastBanner = icsEngine.banners[icsEngine.banners.length - 1];
          const bKey = `banner_${Math.floor(lastBanner.t)}`;
          if (!sim.ag.logged.has(bKey)) {
            sim.ag.logged.add(bKey);
            sim.events.push({ time: Date.now(), agent: 'overwatch', msg: `${lastBanner.text}: ${lastBanner.detail || ''}`, t: Date.now() });
          }
        }
      }

      // Post fire state to ICS iframe (every 30 frames to avoid spam)
      if (sim.fireActive && frame % 30 === 0) {
        const stats = engine.getStats();
        try {
          const iframe = document.querySelector('iframe[title="ICS Command Chain"]');
          if (iframe?.contentWindow) {
            const totalAcres = stats?.totalAcres || 0;
            const rosChain = stats?.rosChainPerHour || 0;
            const intensity = Math.min(10, rosChain * 0.08 * (engine.windSpeed || 18));
            const contain = Math.max(0, Math.min(100, 100 - (stats?.activeFrontCells || 0) / Math.max(1, stats?.burnedCells || 1) * 100));
            // Collect deployed unit IDs → map to ICS graph node IDs
            const UNIT_TO_ICS = {
              'E-69A':'eng_69a','E-69B':'eng_69b','E-23':'eng_23',
              'WT-71':'tender_71','AT-1':'vlat_1','SE-1':'seat_1',
              'LP-1':'lead_1','H-1':'heli_1','IHC-8':'ihc_8',
              'HC-2':'hc_2','HC-5':'hc_5','DZ-1':'dozer_1','SP-19':'struct_19',
            };
            const deployedUnits = units
              .filter(u => u.row !== u.homeRow || u.col !== u.homeCol)
              .map(u => UNIT_TO_ICS[u.id])
              .filter(Boolean);
            // Add parent group nodes based on deployed unit types
            const unitTypes = new Set(units.filter(u => u.row !== u.homeRow || u.col !== u.homeCol).map(u => u.type));
            if (unitTypes.has('engine')) deployedUnits.push('engines');
            if (unitTypes.has('heli')) deployedUnits.push('heli');
            if (unitTypes.has('tender')) deployedUnits.push('tender');
            if (unitTypes.has('hotshot')) deployedUnits.push('hotshots');
            if (unitTypes.has('crew')) deployedUnits.push('hand_crew');
            if (unitTypes.has('dozer')) deployedUnits.push('dozer');
            if (unitTypes.has('air')) deployedUnits.push('vlat');
            if (unitTypes.has('seat')) deployedUnits.push('seat');
            if (unitTypes.has('lead')) deployedUnits.push('lead_plane');
            if (unitTypes.has('structeng')) deployedUnits.push('struct_eng','struct_group');
            // Drone nodes — send individual drone IDs + type groups
            const droneNodes = [];
            const droneTypesSeen = new Set();
            for (const d of drones) {
              if (!d.launched) continue;
              // Individual drone ID: D-01 → d_01
              const icsId = 'd_' + d.id.replace('D-', '');
              droneNodes.push(icsId);
              droneTypesSeen.add(d.dtype);
            }
            if (droneNodes.length > 0) {
              droneNodes.push('drones');
              if (droneTypesSeen.has('scout')) droneNodes.push('drone_scout');
              if (droneTypesSeen.has('mapper')) droneNodes.push('drone_mapper');
              if (droneTypesSeen.has('reaper')) droneNodes.push('drone_reaper');
              if (droneTypesSeen.has('relay')) droneNodes.push('drone_relay');
              if (droneTypesSeen.has('safety')) droneNodes.push('drone_safety');
              if (droneTypesSeen.has('ignis')) droneNodes.push('drone_ignis');
              if (droneTypesSeen.has('suppression')) droneNodes.push('drone_suppress');
            }

            iframe.contentWindow.postMessage({
              type: 'firesight_fire_state',
              fireDetected: sim.fireDetected,
              area: totalAcres,
              ros: rosChain,
              intensity: intensity,
              containment: contain,
              windSpeed: engine.windSpeed,
              windDirection: engine.windDirection,
              threatenedStructures: totalAcres > 20 ? Math.min(180, Math.round(totalAcres * 2)) : 0,
              spots: (stats?.spotFireCount || 0) > 0 ? Array.from({length: stats.spotFireCount}, () => ({x:0.5,y:0.3,confirmed:false,area:0.5})) : [],
              windShifted: engine.windShifted || false,
              fronts: stats?.activeFrontCells || 0,
              secSinceDetection: sim.fireDetected ? (Date.now() - sim.fireDetectedAt) / 1000 : 0,
              icsPhase: icsEngine?.icsPhase || 'standby',
              // Sync active nodes with ICS graph
              activeUnits: deployedUnits,
              activeDrones: droneNodes,
              activeAI: sim.fireDetected ? ['ai_overwatch','ai_predict','ai_swarm','ai_evac','ai_deploy'] : [],
            }, '*');
          }
        } catch (e) { /* iframe not loaded yet */ }
      }

      // Agent response (only after detection) — existing tactical dispatch
      agentTick(sim);

      // ── POST-FIRE: detect fire cleared → scouting → return to initial state ──
      if (sim.fireDetected && !sim.postFireStarted) {
        const pfStats = engine.getStats();
        if (pfStats && pfStats.burning === 0 && pfStats.totalAffected > 0) {
          sim.postFireStarted = true;
          sim.postFireScoutEnd = sim.simTimeSec + 60; // 60 sim-seconds of scouting
          sim.events.push({ time: Date.now(), agent: 'overwatch', msg: 'FIRE OUT — all burning cells extinguished. Initiating post-fire scouting sweep.', t: Date.now() });
          // Send all launched drones on a final sweep over burned area
          for (const d of drones) {
            if (!d.launched) continue;
            d.trow = d.patrolCenterRow + (Math.random() - 0.5) * 30;
            d.tcol = d.patrolCenterCol + (Math.random() - 0.5) * 30;
          }
        }
      }
      if (sim.postFireStarted && !sim.postFireComplete && sim.simTimeSec >= sim.postFireScoutEnd) {
        sim.postFireComplete = true;
        sim.events.push({ time: Date.now(), agent: 'overwatch', msg: 'POST-FIRE SCOUTING COMPLETE — no re-ignition detected. All units returning to station.', t: Date.now() });
        // Return all units to home stations
        for (const u of units) {
          u.trow = u.homeRow;
          u.tcol = u.homeCol;
          u._path = null;
          u._pi = 0;
        }
        // Return extra drones to base, keep initial 6 on patrol
        for (let i = 0; i < drones.length; i++) {
          const d = drones[i];
          if (i < INITIAL_PATROL) {
            // Return to original patrol
            d.trow = d.patrolCenterRow;
            d.tcol = d.patrolCenterCol;
          } else {
            // Fly back to command center and land
            d.trow = COMMAND_CENTER.row;
            d.tcol = COMMAND_CENTER.col;
          }
        }
        // Reset ICS engine to standby
        if (icsEngine) {
          icsEngine.icsPhase = 'standby';
        }
        // Send reset to ICS graph
        try {
          const iframe = document.querySelector('iframe[title="ICS Command Chain"]');
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'firesight_fire_state',
              fireDetected: false,
              area: 0, ros: 0, intensity: 0, containment: 100,
              windSpeed: engine.windSpeed, windDirection: engine.windDirection,
              threatenedStructures: 0, spots: [], windShifted: false,
              fronts: 0, secSinceDetection: 0, icsPhase: 'standby',
              activeUnits: [], activeDrones: [], activeAI: [],
            }, '*');
          }
        } catch (e) {}
      }
      // Once extra drones reach base, mark them as landed
      if (sim.postFireComplete) {
        for (let i = INITIAL_PATROL; i < drones.length; i++) {
          const d = drones[i];
          if (d.launched && Math.abs(d.row - COMMAND_CENTER.row) < 2 && Math.abs(d.col - COMMAND_CENTER.col) < 2) {
            d.launched = false;
            d.row = COMMAND_CENTER.row;
            d.col = COMMAND_CENTER.col;
          }
        }
        // Check if all units are home — full reset
        const allHome = units.every(u => Math.abs(u.row - u.homeRow) < 3 && Math.abs(u.col - u.homeCol) < 3);
        const extraLanded = drones.slice(INITIAL_PATROL).every(d => !d.launched);
        if (allHome && extraLanded && !sim.postFireReset) {
          sim.postFireReset = true;
          sim.fireDetected = false;
          sim.fireActive = false;
          sim.icsStarted = false;
          sim.ag = { dronesDeployed:0, lastDroneAssign:0, logged:new Set(), actions:0,
                     retardantReq:false, crewWithdrawn:false, routesActive:false, escalated:false,
                     lastWaterDrop:0 };
          sim.fireOps = { hoseLines:[], dozerLines:[], handLines:[], retardantDrops:[], waterDrops:[], backfireLines:[], structProtect:[] };
          sim.zoneStates = POP_ZONES.map(z => ({ ...z, status:'clear', evacPct:0 }));
          sim.routeStates = {};
          sim.events.push({ time: Date.now(), agent: 'system', msg: 'ALL CLEAR — incident closed. Agents returned to patrol state. Click map to start new fire.', t: Date.now() });
        }
      }

      // Move at realistic speeds (constant-speed, not easing)
      for (const d of drones) {
        if (!d.launched) continue;
        const spd = SPEED[d.dtype] || 40;
        moveAtSpeed(d, spd, sim.speed);
      }
      for (const u of units) {
        const spd = SPEED[u.type] || 20;
        moveAtSpeed(u, spd, sim.speed);
      }

      // ── SUPPRESSION TICK — units near fire suppress it (every 10 frames) ──
      if (sim.fireDetected && frame % 10 === 0) {
        const suppStats = engine.getStats();
        const suppRos = Math.max(0.3, 1 / (1 + (suppStats?.rosChainPerHour || 0) * 0.15));
        for (const u of units) {
          // Only suppress if unit has actually been dispatched (not still at home)
          if (Math.abs(u.row - u.homeRow) < 2 && Math.abs(u.col - u.homeCol) < 2) continue;
          const ur = Math.round(u.row), uc = Math.round(u.col);
          if (u.type === 'engine' || u.type === 'structeng') {
            // Engines suppress multiple burning cells within 5-cell radius
            let suppressed = 0;
            for (let dr = -5; dr <= 5 && suppressed < 3; dr++) for (let dc = -5; dc <= 5 && suppressed < 3; dc++) {
              const cr = ur + dr, cc = uc + dc;
              if (cr >= 0 && cr < GRID_ROWS && cc >= 0 && cc < GRID_COLS && engine.cells[cr * GRID_COLS + cc] === BURNING) {
                if (Math.random() < 0.6 * suppRos) { engine.suppressCell(cr, cc, 0); suppressed++; }
              }
            }
          }
          if (u.type === 'crew' || u.type === 'hotshot') {
            // Hand crews build fireline perpendicular to wind AND suppress nearby cells
            const windRad2 = ((engine.windDirection + 180) % 360) * Math.PI / 180;
            const perpR = Math.round(ur + Math.sin(windRad2) * 4), perpC = Math.round(uc + Math.cos(windRad2) * 4);
            if (Math.random() < 0.5 * suppRos) {
              engine.buildFireline(ur, uc, perpR, perpC, u.type === 'hotshot' ? 1 : 0, 60);
            }
            // Also directly suppress nearby burning cells
            for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
              const cr = ur + dr, cc = uc + dc;
              if (cr >= 0 && cr < GRID_ROWS && cc >= 0 && cc < GRID_COLS && engine.cells[cr * GRID_COLS + cc] === BURNING) {
                if (Math.random() < 0.4 * suppRos) engine.suppressCell(cr, cc, 0);
              }
            }
          }
          if (u.type === 'dozer') {
            // Dozer cuts wide firebreak (width 2) more reliably
            const windRad2 = ((engine.windDirection + 180) % 360) * Math.PI / 180;
            const perpR = Math.round(ur + Math.sin(windRad2) * 6), perpC = Math.round(uc + Math.cos(windRad2) * 6);
            if (Math.random() < 0.4 * suppRos) {
              engine.buildFireline(ur, uc, perpR, perpC, 2, 90);
            }
          }
        }
      }

      // Clear overlay canvas
      ctx.clearRect(0, 0, gw, gh);

      // ── FIRE CELLS via offscreen ImageData ──
      const cells = engine.cells;
      const imgData = offCtx.createImageData(GRID_COLS, GRID_ROWS);
      const data = imgData.data;
      const dR8=[-1,-1,0,1,1,1,0,-1], dC8=[0,1,1,1,0,-1,-1,-1];
      // Fog-of-war: precompute visibility mask from launched drone positions
      const useFog = fogRef.current;
      let fogVisible = null;
      // Persistent "ever seen" mask — once a cell is seen by a drone, it stays revealed
      if (!sim.everSeen) sim.everSeen = new Uint8Array(cells.length);
      if (useFog) {
        fogVisible = new Uint8Array(cells.length); // 0 = hidden, 1 = visible NOW
        const range = DRONE_SENSOR_RANGE;
        const rangeSq = range * range;
        for (const d of drones) {
          if (!d.launched) continue;
          const dr = Math.round(d.row), dc = Math.round(d.col);
          const rMin = Math.max(0, dr - range), rMax = Math.min(GRID_ROWS - 1, dr + range);
          const cMin = Math.max(0, dc - range), cMax = Math.min(GRID_COLS - 1, dc + range);
          for (let rr = rMin; rr <= rMax; rr++) {
            for (let cc = cMin; cc <= cMax; cc++) {
              if ((rr - dr) * (rr - dr) + (cc - dc) * (cc - dc) <= rangeSq) {
                fogVisible[rr * GRID_COLS + cc] = 1;
                sim.everSeen[rr * GRID_COLS + cc] = 1;
              }
            }
          }
        }
      }
      for (let i = 0; i < cells.length; i++) {
        const state = cells[i];
        if (state === UNBURNED) continue;
        // Fog: BURNING cells need live drone visibility; everything else stays once seen
        if (useFog) {
          if (state === BURNING && !fogVisible[i]) continue;
          if (state !== BURNING && !sim.everSeen[i]) continue;
        }
        const p = i*4, r = Math.floor(i/GRID_COLS), c = i%GRID_COLS;
        if (state === BURNING) {
          let isEdge = false;
          for (let d=0;d<8;d++) { const nr=r+dR8[d],nc=c+dC8[d]; if(nr<0||nr>=GRID_ROWS||nc<0||nc>=GRID_COLS){isEdge=true;break;} const ns=cells[nr*GRID_COLS+nc]; if(ns===UNBURNED||ns===RETARDANT){isEdge=true;break;} }
          if (isEdge) { const fl=0.6+Math.sin(frame*0.12+c*0.18+r*0.14)*0.4; data[p]=255*fl|0; data[p+1]=(55+Math.sin(frame*0.08+r*0.12)*35)*fl|0; data[p+2]=12*fl|0; data[p+3]=220; }
          else { const sm=0.3+Math.sin(frame*0.04+c*0.05+r*0.06)*0.15; data[p]=180*sm|0; data[p+1]=40*sm|0; data[p+2]=8*sm|0; data[p+3]=200; }
        } else if (state === BURNED) {
          // Ash: dark charcoal with slight variation for texture
          const ash = 15 + ((r * 7 + c * 13) % 20);
          data[p]=ash; data[p+1]=ash-5; data[p+2]=ash-8; data[p+3]=180;
        }
        else if (state === RETARDANT) { data[p]=200+(Math.sin(frame*0.02)*15|0); data[p+1]=50; data[p+2]=65; data[p+3]=180; }
      }
      offCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, gw, gh);

      // Fire glow (subtle, only on active flames — not burned areas)
      if (sim.fireActive) {
        ctx.save(); ctx.globalCompositeOperation='screen'; ctx.filter='blur(6px)'; ctx.globalAlpha=0.15;
        ctx.drawImage(offCanvas, -3, -3, gw+6, gh+6); ctx.restore();
      }

      // (Evac routes, zone labels, fire ops overlays, and road network removed for cleaner map)

      // ── COMMAND CENTER ──
      const ccPx = g2px(COMMAND_CENTER.row, COMMAND_CENTER.col, gw, gh);
      const stashedCount = drones.filter(d => !d.launched).length;
      const launchedCount = drones.filter(d => d.launched).length;
      // Outer diamond shape
      const ccS = 10;
      ctx.beginPath();
      ctx.moveTo(ccPx.x, ccPx.y - ccS); ctx.lineTo(ccPx.x + ccS, ccPx.y);
      ctx.lineTo(ccPx.x, ccPx.y + ccS); ctx.lineTo(ccPx.x - ccS, ccPx.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(167,139,250,0.15)'; ctx.fill();
      ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 1.5; ctx.stroke();
      // Pulsing ring when drones are launching
      if (sim.fireDetected && stashedCount > 0) {
        const pulse = 0.4 + Math.sin(frame * 0.06) * 0.3;
        ctx.beginPath(); ctx.arc(ccPx.x, ccPx.y, ccS + 4 + Math.sin(frame * 0.04) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(167,139,250,${pulse})`; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      // Label
      ctx.fillStyle = '#A78BFA'; ctx.font = 'bold 7px -apple-system,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ICP', ccPx.x, ccPx.y - ccS - 4);
      ctx.fillStyle = 'rgba(167,139,250,0.7)'; ctx.font = '6px monospace';
      ctx.fillText(`${stashedCount} reserve`, ccPx.x, ccPx.y + ccS + 10);

      // ── ICP PERSONNEL — stationary command staff at the ICP ──
      const hl = highlightRef.current;
      const hlMapId = hl ? ICS_TO_MAP[hl] : null;
      for (const p of ICP_PERSONNEL) {
        const px = g2px(COMMAND_CENTER.row + p.offsetR, COMMAND_CENTER.col + p.offsetC, gw, gh);
        const isHL = hl === p.id || hlMapId === p.id;
        const sz = isHL ? 6 : 4;
        // Person dot
        ctx.beginPath(); ctx.arc(px.x, px.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = p.color + (isHL ? '80' : '40');
        ctx.fill();
        ctx.strokeStyle = p.color + (isHL ? 'FF' : '80');
        ctx.lineWidth = isHL ? 1.5 : 0.8; ctx.stroke();
        // Highlight ring
        if (isHL) {
          ctx.beginPath(); ctx.arc(px.x, px.y, sz + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 2;
          ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
        // Label
        ctx.fillStyle = p.color + (isHL ? 'FF' : '90');
        ctx.font = (isHL ? 'bold ' : '') + '5px monospace'; ctx.textAlign = 'center';
        ctx.fillText(p.label, px.x, px.y - sz - 2);
      }

      // ── FIELD ENTITIES — branch directors, sensors, AI agents ──
      for (const fe of FIELD_ENTITIES) {
        const fePx = g2px(fe.row, fe.col, gw, gh);
        const isFeHL = hl === fe.id || hlMapId === fe.id;
        const feSz = isFeHL ? 6 : 3.5;

        if (fe.category === 'ai') {
          // AI agents: pulsing hexagon
          const pulse = 0.5 + Math.sin(frame * 0.04 + fe.row) * 0.3;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const r = feSz + 1;
            i === 0 ? ctx.moveTo(fePx.x + Math.cos(a) * r, fePx.y + Math.sin(a) * r)
                     : ctx.lineTo(fePx.x + Math.cos(a) * r, fePx.y + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fillStyle = fe.color + (isFeHL ? '60' : Math.round(pulse * 40).toString(16).padStart(2, '0'));
          ctx.fill();
          ctx.strokeStyle = fe.color + (isFeHL ? 'FF' : '80');
          ctx.lineWidth = isFeHL ? 1.5 : 0.8; ctx.stroke();
        } else if (fe.category === 'sensor') {
          // Sensors: diamond shape
          ctx.beginPath();
          ctx.moveTo(fePx.x, fePx.y - feSz); ctx.lineTo(fePx.x + feSz, fePx.y);
          ctx.lineTo(fePx.x, fePx.y + feSz); ctx.lineTo(fePx.x - feSz, fePx.y);
          ctx.closePath();
          ctx.fillStyle = fe.color + (isFeHL ? '60' : '25');
          ctx.fill();
          ctx.strokeStyle = fe.color + (isFeHL ? 'FF' : '70');
          ctx.lineWidth = isFeHL ? 1.5 : 0.8; ctx.stroke();
          // Pulse ring for active sensors
          if (sim.fireDetected) {
            const sp = 0.3 + Math.sin(frame * 0.03 + fe.col) * 0.2;
            ctx.beginPath(); ctx.arc(fePx.x, fePx.y, feSz + 4, 0, Math.PI * 2);
            ctx.strokeStyle = fe.color + Math.round(sp * 60).toString(16).padStart(2, '0');
            ctx.lineWidth = 0.5; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
          }
        } else if (fe.category === 'airborne') {
          // ATGS: orbiting aircraft indicator
          const orbitAng = frame * 0.008 + fe.row;
          const ox = fePx.x + Math.cos(orbitAng) * 8, oy = fePx.y + Math.sin(orbitAng) * 4;
          ctx.save(); ctx.translate(ox, oy); ctx.rotate(orbitAng + Math.PI / 2);
          ctx.strokeStyle = fe.color + (isFeHL ? 'CC' : '60'); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.stroke();
          ctx.restore();
          // Orbit path
          ctx.beginPath(); ctx.ellipse(fePx.x, fePx.y, 10, 5, 0, 0, Math.PI * 2);
          ctx.strokeStyle = fe.color + '15'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
        } else if (fe.category === 'group') {
          // Unit group supervisors: circle with inner ring (commander badge)
          ctx.beginPath(); ctx.arc(fePx.x, fePx.y, feSz + 1, 0, Math.PI * 2);
          ctx.fillStyle = fe.color + (isFeHL ? '50' : '20');
          ctx.fill();
          ctx.strokeStyle = fe.color + (isFeHL ? 'FF' : '80');
          ctx.lineWidth = isFeHL ? 1.5 : 1; ctx.stroke();
          // Inner dot
          ctx.beginPath(); ctx.arc(fePx.x, fePx.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = fe.color + (isFeHL ? 'FF' : '90');
          ctx.fill();
        } else if (fe.category === 'drone_ctrl') {
          // Drone controllers: triangle (antenna/control icon)
          const sz = feSz + 1;
          ctx.beginPath();
          ctx.moveTo(fePx.x, fePx.y - sz);
          ctx.lineTo(fePx.x + sz, fePx.y + sz * 0.6);
          ctx.lineTo(fePx.x - sz, fePx.y + sz * 0.6);
          ctx.closePath();
          ctx.fillStyle = fe.color + (isFeHL ? '50' : '20');
          ctx.fill();
          ctx.strokeStyle = fe.color + (isFeHL ? 'FF' : '80');
          ctx.lineWidth = isFeHL ? 1.5 : 0.8; ctx.stroke();
        } else {
          // Branch directors: small square
          const half = feSz;
          ctx.fillStyle = fe.color + (isFeHL ? '60' : '25');
          ctx.fillRect(fePx.x - half, fePx.y - half, half * 2, half * 2);
          ctx.strokeStyle = fe.color + (isFeHL ? 'FF' : '70');
          ctx.lineWidth = isFeHL ? 1.5 : 0.8;
          ctx.strokeRect(fePx.x - half, fePx.y - half, half * 2, half * 2);
        }

        // Highlight ring
        if (isFeHL) {
          ctx.beginPath(); ctx.arc(fePx.x, fePx.y, feSz + 6, 0, Math.PI * 2);
          ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 2;
          ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
        // Label
        ctx.fillStyle = fe.color + (isFeHL ? 'FF' : '80');
        ctx.font = (isFeHL ? 'bold ' : '') + '5px monospace'; ctx.textAlign = 'center';
        ctx.fillText(fe.label, fePx.x, fePx.y - feSz - 3);
      }

      // ── DRONES with type-specific rendering ──
      for (const d of drones) {
        if (!d.launched) continue;
        const dp=g2px(d.row,d.col,gw,gh);
        const dx=dp.x+Math.sin(frame*0.02+d.row*0.1)*2, dy=dp.y+Math.cos(frame*0.015+d.col*0.1)*1.5;
        const dc=DTYPE_COLORS[d.dtype]||'#22D3EE';

        // Cross-highlight from ICS graph hover
        const droneIcsId = 'd_' + d.id.replace('D-', '');
        const droneHL = hlMapId === d.id || MAP_TO_ICS[d.id] === hl ||
          hl === droneIcsId || hl === 'drones' || hl === 'drone_' + d.dtype;
        if (droneHL) {
          ctx.beginPath(); ctx.arc(dx, dy, 12, 0, Math.PI * 2);
          ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 2;
          ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]);
        }

        // Sensor range circle (for scouts/mappers/safety pre-detection)
        if ((d.dtype==='scout'||d.dtype==='mapper'||d.dtype==='safety'||d.dtype==='recon'||d.dtype==='spotter') && !sim.fireDetected) {
          const rangeR = (DRONE_SENSOR_RANGE / GRID_COLS) * gw;
          ctx.beginPath(); ctx.arc(dx,dy,rangeR,0,Math.PI*2);
          ctx.fillStyle = dc + '06'; ctx.fill();
          ctx.strokeStyle = dc + '15'; ctx.lineWidth=0.5; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
        }

        // Type-specific shape
        if (d.dtype==='reaper') {
          // MQ-9: large fixed-wing silhouette at high altitude
          ctx.save(); ctx.translate(dx,dy); ctx.rotate(frame*0.002);
          ctx.strokeStyle=dc+'60'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke(); // wings
          ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(0,5); ctx.stroke(); // fuselage
          ctx.beginPath(); ctx.moveTo(-3,-5); ctx.lineTo(3,-5); ctx.stroke(); // tail
          ctx.restore();
          // High altitude indicator
          ctx.fillStyle=dc+'30'; ctx.font='5px monospace'; ctx.textAlign='center';
          ctx.fillText('25kft',dx,dy-8);
        } else if (d.dtype==='mapper' || d.dtype==='spotter') {
          // Fixed-wing: small plane shape
          ctx.save(); ctx.translate(dx,dy);
          const heading = Math.atan2(d.trow-d.row, d.tcol-d.col) || frame*0.01;
          ctx.rotate(heading);
          ctx.strokeStyle=dc+'70'; ctx.lineWidth=0.8;
          ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.stroke(); // wings
          ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(0,4); ctx.stroke(); // body
          ctx.restore();
        } else if (d.dtype==='ignis' || d.dtype==='ignition') {
          // IGNIS: drone with orange glow for dragon eggs
          ctx.beginPath(); ctx.arc(dx,dy,4,0,Math.PI*2); ctx.fillStyle='#F97316'+'30'; ctx.fill();
          ctx.strokeStyle='#F97316'+'80'; ctx.lineWidth=1; ctx.stroke();
          // Dragon egg indicator
          ctx.fillStyle='#F97316'+'50'; ctx.font='5px monospace'; ctx.textAlign='center';
          ctx.fillText('IGNIS',dx,dy-7);
        } else if (d.dtype==='suppression') {
          // Heavy-lift: larger drone with payload indicator
          ctx.beginPath(); ctx.arc(dx,dy,5,0,Math.PI*2); ctx.fillStyle=dc+'20'; ctx.fill();
          ctx.strokeStyle=dc+'80'; ctx.lineWidth=1.5; ctx.stroke();
          ctx.fillStyle='#22D3EE50'; ctx.fillRect(dx-3,dy+2,6,3); // water payload
        } else {
          // Scout/relay/safety: standard quadcopter
          ctx.beginPath(); ctx.arc(dx,dy,3,0,Math.PI*2); ctx.fillStyle=dc; ctx.fill();
          // Scan beam for scouts
          if (d.dtype==='scout'||d.dtype==='recon') {
            const scanAng=frame*0.03+d.row*0.2;
            ctx.beginPath(); ctx.moveTo(dx,dy); ctx.lineTo(dx+Math.cos(scanAng)*12,dy+Math.sin(scanAng)*12);
            ctx.strokeStyle=dc+'30'; ctx.lineWidth=1; ctx.stroke();
          }
        }

        ctx.fillStyle=dc+'70'; ctx.font='6px monospace'; ctx.textAlign='center'; ctx.fillText(d.id,dx,dy+10);
      }

      // (Road network overlay removed for cleaner map)

      // ── UNITS ──
      for (const u of units) {
        const up=g2px(u.row,u.col,gw,gh); const ux=up.x,uy=up.y; const uc=UTYPE[u.type]?.c||'#FBBF24';
        const idleAlpha = sim.fireDetected ? '' : '40';
        // Cross-highlight from ICS graph hover
        const unitHL = hlMapId === u.id || MAP_TO_ICS[u.id] === hl;
        if (unitHL) {
          ctx.beginPath(); ctx.arc(ux, uy, 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 2;
          ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.beginPath(); ctx.arc(ux,uy,6,0,Math.PI*2); ctx.fillStyle=uc+(unitHL?'40':'18'); ctx.fill(); ctx.strokeStyle=uc+(sim.fireDetected||unitHL?'90':'30'); ctx.lineWidth=unitHL?1.5:1; ctx.stroke();

        // Type-specific vehicle/crew rendering
        if (u.type==='heli') {
          const ra=frame*0.15; ctx.save(); ctx.translate(ux,uy); ctx.rotate(ra);
          ctx.strokeStyle=uc+'60'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(9,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(0,9); ctx.stroke();
          ctx.restore();
        }
        if (u.type==='air') {
          ctx.save(); ctx.translate(ux,uy); ctx.rotate(Math.sin(frame*0.005)*0.1);
          ctx.strokeStyle=uc+'80'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(14,0); ctx.stroke(); // wings
          ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,8); ctx.stroke(); // fuselage
          ctx.beginPath(); ctx.moveTo(-5,-6); ctx.lineTo(5,-6); ctx.stroke(); // tail
          ctx.restore();
        }
        if (u.type==='dozer') {
          // Tracked vehicle with blade
          ctx.strokeStyle=uc+'60'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(ux-7,uy+4); ctx.lineTo(ux+7,uy+4); ctx.stroke(); // tracks
          ctx.beginPath(); ctx.moveTo(ux-7,uy-2); ctx.lineTo(ux+7,uy-2); ctx.stroke(); // tracks
          ctx.fillStyle=uc+'30'; ctx.fillRect(ux-8,uy+4,16,2); // blade
        }
        if (u.type==='seat') {
          ctx.save(); ctx.translate(ux,uy);
          ctx.strokeStyle=uc+'70'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(0,4); ctx.stroke();
          ctx.restore();
        }
        if (u.type==='lead') {
          ctx.strokeStyle=uc+'30'; ctx.lineWidth=1; ctx.setLineDash([2,3]);
          ctx.beginPath(); ctx.arc(ux,uy,12,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        }
        if (u.type==='structeng') {
          // House shape (structure protection)
          ctx.strokeStyle=uc+'60'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(ux,uy-7); ctx.lineTo(ux+6,uy-1); ctx.lineTo(ux+6,uy+5); ctx.lineTo(ux-6,uy+5); ctx.lineTo(ux-6,uy-1); ctx.closePath(); ctx.stroke();
        }
        if (u.type==='hotshot' || u.type==='crew') {
          // Show crew as cluster of small person dots (represents 20-person crew)
          const crewColor = u.type==='hotshot' ? '#F97316' : '#FB923C';
          const crewCount = 6; // visual dots representing 20 people
          for (let ci=0; ci<crewCount; ci++) {
            const ang = (ci/crewCount)*Math.PI*2 + frame*0.003;
            const cr = 5 + Math.sin(frame*0.01+ci)*1;
            const cx2 = ux + Math.cos(ang)*cr, cy2 = uy + Math.sin(ang)*cr;
            ctx.beginPath(); ctx.arc(cx2,cy2,1.5,0,Math.PI*2);
            ctx.fillStyle=crewColor+'80'; ctx.fill();
          }
          // Outer ring
          ctx.beginPath(); ctx.arc(ux,uy,9,0,Math.PI*2);
          ctx.strokeStyle=crewColor+'30'; ctx.lineWidth=0.5; ctx.stroke();
          // Crew count
          ctx.fillStyle=crewColor+'90'; ctx.font='bold 5px monospace'; ctx.textAlign='center';
          ctx.fillText('20',ux,uy+2);
        }
        if (u.type==='tender') {
          // Tank truck
          ctx.strokeStyle=uc+'50'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.rect(ux-6,uy-3,12,6); ctx.stroke();
          ctx.fillStyle=uc+'15'; ctx.fillRect(ux-6,uy-3,12,6);
          // Water level
          ctx.fillStyle=uc+'25'; ctx.fillRect(ux-5,uy-1,10,3);
        }
        if (u.type==='engine') {
          // Fire engine shape (cab + body)
          ctx.fillStyle=uc+'20'; ctx.fillRect(ux-5,uy-3,10,6);
          ctx.strokeStyle=uc+'60'; ctx.lineWidth=0.8; ctx.strokeRect(ux-5,uy-3,10,6);
          // Crew count
          ctx.fillStyle=uc+'70'; ctx.font='bold 4px monospace'; ctx.textAlign='center';
          ctx.fillText('3',ux,uy+1.5);
        }

        // Unit ID label
        ctx.fillStyle=uc+idleAlpha; ctx.font='bold 6px monospace'; ctx.textAlign='center'; ctx.fillText(u.id,ux,uy+16);

        // Show road path for ground units (faint line)
        if (u._path && u._path.length > 0 && u._pi !== undefined && u._pi < u._path.length) {
          ctx.beginPath(); ctx.moveTo(ux,uy);
          for (let pi=u._pi; pi<u._path.length; pi++) {
            const pp=g2px(u._path[pi].row,u._path[pi].col,gw,gh);
            ctx.lineTo(pp.x,pp.y);
          }
          ctx.strokeStyle=uc+'20'; ctx.lineWidth=1; ctx.setLineDash([2,4]); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // ── WIND INDICATOR ──
      const windRad=((engine.windDirection+180)%360)*Math.PI/180;
      const wx=gw*0.5, wy=30, wl=20;
      ctx.save(); ctx.translate(wx,wy); ctx.rotate(windRad); ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,-wl); ctx.lineTo(0,wl); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,wl); ctx.lineTo(-4,wl-6); ctx.moveTo(0,wl); ctx.lineTo(4,wl-6); ctx.stroke(); ctx.restore();
      ctx.fillStyle='rgba(255,255,255,.15)'; ctx.font='8px -apple-system,sans-serif'; ctx.textAlign='center'; ctx.fillText(`${engine.windSpeed}mph`,wx,wy+wl+14);

      // ── CLICK PROMPT (before fire) ──
      if (!sim.fireActive) {
        ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='bold 12px -apple-system,sans-serif'; ctx.textAlign='center';
        ctx.fillText('Click anywhere on terrain to start a fire', gw/2, gh - 20);
      }

      // ── UPDATE UI ──
      if (Date.now() - sim.lastUi > 400) {
        sim.lastUi = Date.now();
        const stats = engine.getStats();
        const contain = stats.totalAffected > 0 ? Math.round(Math.max(0, 100 - stats.activeFrontCells / Math.max(1, stats.totalAffected) * 200)) : 0;
        const totalEvac = sim.zoneStates.reduce((s,z) => s + (z.status!=='clear' ? Math.round(z.pop*z.evacPct/100) : 0), 0);
        let phase = 'Patrol';
        if (icsEngine && icsEngine.icsPhase !== 'standby') {
          const p = icsEngine.icsPhase;
          phase = p === 'initial' ? 'Initial Attack' : p === 'extended' ? 'Extended Attack' : p === 'crisis' ? 'Crisis / Type 1' : p === 'full' ? 'Full ICS' : 'Standby';
        } else if (sim.fireActive && !sim.fireDetected) phase = 'Undetected Fire';
        else if (sim.fireDetected && sim.ag.escalated) phase = 'Full Suppression';
        else if (sim.fireDetected && stats.totalAcres > 20) phase = 'Extended Attack';
        else if (sim.fireDetected) phase = 'Initial Attack';
        const icsAgents = icsEngine ? icsEngine.litNodes.size : 0;
        const icsEdges = icsEngine ? icsEngine.getActiveEdges().size : 0;
        const simMins = Math.floor(sim.simTimeSec / 60);
        const simHrs = Math.floor(simMins / 60);
        const simClock = simHrs > 0 ? `${simHrs}h ${simMins % 60}m` : `${simMins}m`;
        setUi({ speed:sim.speed, acres:Math.round(stats.totalAcres), contain:Math.max(0,contain), drones:`${sim.drones.filter(d=>d.launched).length}/${DRONE_STASH_TOTAL}`,
          phase, events:sim.events.slice(-15), evac:totalEvac, actions:sim.ag.actions,
          fireDetected:sim.fireDetected, fireActive:sim.fireActive,
          icsAgents, icsEdges, simClock });

        // Push live data to parent for AgentPanel metrics
        if (onLiveData) {
          const launchedCount = sim.drones.filter(d => d.launched).length;
          const blockedRoutes = Object.values(sim.routeStates).filter(s => s === 'blocked').length;
          const crewUnits = sim.units.filter(u => ['hotshot','crew','engine','structeng'].includes(u.type)).length;
          const airUnits = sim.units.filter(u => ['heli','air','seat','lead'].includes(u.type)).length;
          // Get latest reasoning from events
          const recentEvents = sim.events.slice(-20);
          const swarmReason = recentEvents.filter(e => e.agent === 'swarm').pop()?.msg;
          const evacReason = recentEvents.filter(e => e.agent === 'evac').pop()?.msg;
          const deployReason = recentEvents.filter(e => e.agent === 'deploy').pop()?.msg;
          onLiveData({
            swarm: { launched: launchedCount, total: DRONE_STASH_TOTAL, coverage: Math.min(99, Math.round(launchedCount / DRONE_STASH_TOTAL * 100 * 1.2)) },
            evac: { totalPop: POP_ZONES.reduce((s, z) => s + z.pop, 0), evacuated: totalEvac, blocked: blockedRoutes },
            deploy: { crews: crewUnits, aircraft: airUnits },
            reasoning: { swarm: swarmReason, evac: evacReason, deploy: deployReason },
          });
        }
      }

      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
  }

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const setSpeed = useCallback((s) => { const sim = simRef.current; if (sim) sim.speed = s; setUi(prev => ({ ...prev, speed: s })); }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', borderRadius:14, overflow:'hidden', background:'#060a10' }}>
      <div ref={mapContainerRef} style={{ position:'absolute', inset:0, zIndex:1 }} />

      {/* Speed Slider + Fog of War */}
      <div style={{ position:'absolute', top:8, left:8, zIndex:10, display:'flex', gap:6, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(20,26,36,0.85)', border:'1px solid rgba(30,38,54,0.6)', padding:'4px 10px', borderRadius:6, backdropFilter:'blur(8px)' }}>
          <span style={{ fontSize:8, fontWeight:700, color:'#8896AB', fontFamily:'-apple-system,sans-serif', letterSpacing:'0.04em', minWidth:28 }}>{ui.speed}x</span>
          <input type="range" min={1} max={100} value={ui.speed} onChange={e => setSpeed(Number(e.target.value))}
            style={{ width:90, height:4, accentColor:'#EF4444', cursor:'pointer' }} />
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', background:'rgba(20,26,36,0.85)', border:'1px solid rgba(30,38,54,0.6)', padding:'4px 8px', borderRadius:6, backdropFilter:'blur(8px)' }}>
          <input type="checkbox" checked={fogOfWar} onChange={e => { setFogOfWar(e.target.checked); fogRef.current = e.target.checked; }} style={{ accentColor:'#22D3EE', width:12, height:12, cursor:'pointer' }} />
          <span style={{ fontSize:9, fontWeight:700, color: fogOfWar ? '#22D3EE' : '#8896AB', fontFamily:'-apple-system,sans-serif', letterSpacing:'0.04em', transition:'color .15s' }}>FOG OF WAR</span>
        </label>
      </div>

      {/* Status Badge */}
      <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:10, display:'flex', gap:1, borderRadius:8, overflow:'hidden', backdropFilter:'blur(12px)', border:'1px solid rgba(30,38,54,0.6)' }}>
        <M l="Status" v={ui.phase} c={
          ui.phase==='Full Suppression'?'#FCA5A5':
          ui.phase==='Extended Attack'?'#FCD34D':
          ui.phase==='Initial Attack'?'#F97316':
          ui.phase==='Undetected Fire'?'#EF4444':
          '#6EE7B7'
        } />
        {ui.fireActive && <>
          <M l="Acres" v={ui.acres} c={ui.acres>200?'#FCA5A5':ui.acres>50?'#FCD34D':'#E2E8F0'} />
          <M l="Contain" v={`${ui.contain}%`} c={ui.contain>10?'#6EE7B7':'#E2E8F0'} />
        </>}
        {ui.fireDetected && <>
          <M l="Evac" v={ui.evac} c="#6EE7B7" />
          <M l="UAS" v={ui.drones} c="#67E8F9" />
          <M l="ICS" v={`${ui.icsAgents||0} agents`} c="#A78BFA" />
          <M l="Flows" v={ui.icsEdges||0} c="#F472B6" />
        </>}
      </div>

      {/* Event log removed — map + graph only */}

      {/* Map Status + Sim Clock */}
      <div style={{ position:'absolute', top:8, right:8, zIndex:10, display:'flex', alignItems:'center', gap:8, padding:'3px 10px', background:'rgba(0,0,0,0.5)', borderRadius:10, backdropFilter:'blur(12px)' }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:'#E2E8F0', letterSpacing:'0.04em' }}>
          T+{ui.simClock || '0m'}
        </span>
        <div style={{ width:1, height:12, background:'rgba(255,255,255,0.1)' }} />
        <div style={{ width:5, height:5, borderRadius:'50%', background: mapStatus==='ready'?'#10B981':mapStatus==='error'?'#E84430':'#FFD700' }} />
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:'rgba(200,210,225,0.5)', letterSpacing:'0.06em' }}>
          FIRESIGHT {mapStatus!=='ready'?`(${mapStatus})`:''}
        </span>
      </div>

      {/* Tooltip for drones/units/command center */}
      <div ref={tooltipDivRef} style={{
        position: 'absolute', display: 'none', zIndex: 100,
        background: 'rgba(17,24,39,.95)', border: '1px solid #1E2636',
        borderRadius: 6, padding: '10px 14px', fontSize: 10, maxWidth: 320,
        pointerEvents: 'none', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
        color: '#E2E8F0',
      }} />

      {/* Map powered by Esri World Imagery + Three.js */}
    </div>
  );
}

const btnS = { background:'rgba(20,26,36,0.85)', border:'1px solid rgba(30,38,54,0.6)', color:'#8896AB', padding:'5px 10px', borderRadius:6, cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'-apple-system,sans-serif', backdropFilter:'blur(8px)', transition:'all .15s' };
const aBtnS = { background:'#EF4444', borderColor:'#EF4444', color:'#fff' };

function M({ l, v, c }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(12,16,24,0.85)', padding:'4px 10px' }}>
      <span style={{ color:'#4A5568', fontSize:7, textTransform:'uppercase', letterSpacing:0.5, fontWeight:600 }}>{l}</span>
      <span style={{ fontWeight:800, fontSize:11, fontFamily:"'SF Mono',monospace", color:c||'#E2E8F0' }}>{v}</span>
    </div>
  );
}
