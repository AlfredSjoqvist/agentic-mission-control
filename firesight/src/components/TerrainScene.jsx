// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TerrainScene.jsx — FireSight: Interactive Wildfire Simulation
//
// Click to ignite. Recon drones patrol autonomously. Fire response begins
// only when a drone's sensor detects the blaze.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FireSpreadEngine, GRID_ROWS, GRID_COLS, BURNING, BURNED, RETARDANT, UNBURNED } from '../fireSpreadEngine.js';
import { NODES as ICS_NODES, TYPE_COLORS as ICS_TYPE_COLORS } from '../icsEngine.js';

// ── Remote Debug Logger — batches console logs to /api/log ───────────────────
const _logQueue = [];
let _logTimer = null;
function debugLog(msg, level = 'log') {
  console[level](`[FS] ${msg}`);
  _logQueue.push({ msg, level, t: Date.now() });
  if (!_logTimer) {
    _logTimer = setTimeout(() => {
      _logTimer = null;
      const batch = _logQueue.splice(0, 50);
      if (batch.length) fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) }).catch(() => {});
    }, 500);
  }
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

// ── Road Network (Palisades area, grid coords) ─────────────────────────────
const ROAD_SEGMENTS = [
  [[46,30],[46,49],[44,60],[44,76],[44,90],[44,110],[44,130]],           // Sunset Blvd E-W
  [[165,15],[160,30],[155,50],[150,70],[145,90],[140,110],[135,130]],    // PCH coastal
  [[30,50],[50,52],[80,54],[110,55],[140,56],[160,52]],                  // Topanga Canyon N-S
  [[24,36],[32,28],[40,24],[56,22],[80,22],[120,24],[155,28]],           // Malibu Canyon
  [[18,79],[30,80],[44,80],[60,85],[80,90],[100,95],[120,105]],          // I-405 / Sepulveda
  [[24,36],[30,40],[38,45],[46,49]],                                     // Pepperdine → Sunset
  [[41,70],[44,72],[44,76]],                                             // Brentwood connector
  [[76,89],[90,85],[110,80],[130,75],[145,68]],                          // Santa Monica → PCH
];
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

export default function TerrainScene({ timeSlot, onTerrainClick, simulationMode, activeLayers, swarmActive, evacActive, deployActive, fireData, icsEngine, onLiveData }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const simRef = useRef(null);
  const animRef = useRef(null);
  const tooltipDivRef = useRef(null);
  const [mapStatus, setMapStatus] = useState('initializing');
  const [fogOfWar, setFogOfWar] = useState(false);
  const fogRef = useRef(false);
  const [ui, setUi] = useState({
    speed:1, acres:0, contain:0, drones:'0/12', phase:'Patrol',
    events:[], evac:0, actions:0, fireDetected:false, fireActive:false,
  });

  const hasApiKey = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // ── Initialize Google Maps ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasApiKey || !mapContainerRef.current) return;
    let destroyed = false;
    setMapStatus('loading');

    const g = window.google || (window.google = {});
    const m = g.maps || (g.maps = {});
    if (!m.importLibrary) {
      const r = new Set(); let h;
      m.importLibrary = (name) => {
        r.add(name);
        return (h || (h = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          const params = new URLSearchParams({
            key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, v:'weekly',
            libraries: [...r].join(','), callback:'google.maps.__ib__',
          });
          script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
          script.async = true;
          script.onerror = () => reject(new Error('Google Maps script failed'));
          m.__ib__ = resolve;
          document.head.appendChild(script);
        }))).then(() => m.importLibrary(name));
      };
    }

    (async () => {
      try {
        const { Map } = await google.maps.importLibrary('maps');
        if (destroyed) return;
        const map = new Map(mapContainerRef.current, {
          center: CENTER, zoom: 13, tilt: 0, heading: 0, minZoom: 12, maxZoom: 18,
          mapTypeId: 'satellite', disableDefaultUI: true, gestureHandling: 'greedy',
          restriction: {
            latLngBounds: { north: LAT_MAX, south: LAT_MIN, east: LNG_MAX, west: LNG_MIN },
            strictBounds: false,
          },
        });
        mapRef.current = map;
        setMapStatus('ready');
        initSim(map);
      } catch (err) {
        console.error('[Map] Failed:', err);
        setMapStatus('error');
      }
    })();
    return () => { destroyed = true; mapRef.current = null; };
  }, [hasApiKey]);

  // ── Initialize Simulation ───────────────────────────────────────────────
  function initSim(map) {
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

    // ── DEBUG: Log drone init state ──
    const launchedInit = drones.filter(d => d.launched);
    debugLog(`SIM INIT: ${drones.length} drones created, ${launchedInit.length} launched initially`);
    for (const d of launchedInit) {
      debugLog(`  ${d.id} [${d.dtype}] ${d.model} at (${d.row.toFixed(1)},${d.col.toFixed(1)}) → target (${d.trow.toFixed(1)},${d.tcol.toFixed(1)})`);
    }
    debugLog(`MPH_TO_CPF = ${MPH_TO_CPF.toFixed(6)}, SIM_TIME_SCALE = ${SIM_TIME_SCALE}`);
    debugLog(`Scout 40mph → ${(40 * MPH_TO_CPF).toFixed(4)} cells/frame → ${(40 * MPH_TO_CPF * 60).toFixed(2)} cells/sec`);

    // ── Create OverlayView ──
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = function() {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.pointerEvents = 'none';
      this.getPanes().overlayLayer.appendChild(canvas);
      sim.canvas = canvas;
      sim.ctx = canvas.getContext('2d');
    };
    overlay.draw = function() {
      const proj = this.getProjection();
      if (!proj || !sim.canvas) return;
      const tl = proj.fromLatLngToDivPixel(new google.maps.LatLng(LAT_MAX, LNG_MIN));
      const br = proj.fromLatLngToDivPixel(new google.maps.LatLng(LAT_MIN, LNG_MAX));
      const w = Math.abs(br.x - tl.x);
      const h = Math.abs(br.y - tl.y);
      const dpr = window.devicePixelRatio || 1;
      sim.canvas.style.left = Math.min(tl.x, br.x) + 'px';
      sim.canvas.style.top = Math.min(tl.y, br.y) + 'px';
      sim.canvas.style.width = w + 'px';
      sim.canvas.style.height = h + 'px';
      sim.canvas.width = Math.round(w * dpr);
      sim.canvas.height = Math.round(h * dpr);
      sim.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.gw = w;
      sim.gh = h;
    };
    overlay.onRemove = function() { if (sim.canvas) sim.canvas.remove(); };
    overlay.setMap(map);
    sim.overlay = overlay;

    // ── Tooltip on hover ──
    // Uses Google Maps projection to convert grid→latLng→containerPixel
    // This correctly accounts for map pan/zoom transforms
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
        return;
      }

      tt.style.display = 'none';
    };

    mapContainerRef.current?.addEventListener('mousemove', tooltipHandler);

    // ── Click-to-ignite ──
    map.addListener('click', (e) => {
      const lat = e.latLng.lat(), lng = e.latLng.lng();
      // Clamp to grid bounds (fire grid has finite extent)
      const clat = Math.max(LAT_MIN, Math.min(LAT_MAX, lat));
      const clng = Math.max(LNG_MIN, Math.min(LNG_MAX, lng));
      engine.igniteAtLatLng(clat, clng, 5);
      sim.fireActive = true;
      debugLog(`IGNITE at (${lat.toFixed(4)}, ${lng.toFixed(4)}) → grid (${clat.toFixed(4)}, ${clng.toFixed(4)})`);
      sim.events.push({ time: Date.now(), agent:'system', msg: `Fire ignited at ${lat.toFixed(3)}\u00B0N, ${Math.abs(lng).toFixed(3)}\u00B0W`, t:Date.now() });
    });

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
    if (fronts.length === 0) return [];
    let minR=999,maxR=0,minC=999,maxC=0;
    for (const f of fronts) { minR=Math.min(minR,f.row); maxR=Math.max(maxR,f.row); minC=Math.min(minC,f.col); maxC=Math.max(maxC,f.col); }
    const centerR=(minR+maxR)/2, centerC=(minC+maxC)/2;
    const windRad = (engine.windDirection * Math.PI / 180);
    const dwR = -Math.cos(windRad), dwC = Math.sin(windRad);
    const margin = 5, radius = Math.max(maxR-minR, maxC-minC)/2 + margin;
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = (i/count) * Math.PI * 2;
      positions.push({ row:Math.round(Math.max(2,Math.min(GRID_ROWS-2,centerR+Math.sin(angle)*radius+dwR*margin*0.4))), col:Math.round(Math.max(2,Math.min(GRID_COLS-2,centerC+Math.cos(angle)*radius+dwC*margin*0.4))) });
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

    let cR = 0, cC = 0;
    if (activeFronts.length > 0) { for (const f of activeFronts) { cR += f.row; cC += f.col; } cR /= activeFronts.length; cC /= activeFronts.length; }
    function leadingEdge() { let b = activeFronts[0], bs = -Infinity; for (const f of activeFronts) { const s = -Math.cos(windRad)*f.row + Math.sin(windRad)*f.col; if (s > bs) { bs=s; b=f; } } return b; }
    const addEvent = (agent, msg) => { sim.events.push({ time: now, agent, msg, t: now }); };

    // ── SWARM: launch drones from command center stash based on fire size ──
    const launchedDrones = drones.filter(d => d.launched);
    const stashedDrones = drones.filter(d => !d.launched);
    const desiredLaunched = Math.min(DRONE_STASH_TOTAL, Math.max(INITIAL_PATROL, INITIAL_PATROL + Math.ceil(acres / 15) + Math.ceil(fronts / 25) + spots * 2));

    if (launchedDrones.length < desiredLaunched && stashedDrones.length > 0) {
      const toLaunch = Math.min(desiredLaunched - launchedDrones.length, stashedDrones.length);
      for (let i = 0; i < toLaunch; i++) {
        const d = stashedDrones[i];
        d.launched = true;
        d.trow = Math.round(cR + (Math.random() - 0.5) * 20);
        d.tcol = Math.round(cC + (Math.random() - 0.5) * 20);
      }
      const newTotal = drones.filter(d => d.launched).length;
      const remaining = drones.filter(d => !d.launched).length;
      if (!ag.logged.has('launch_' + newTotal)) {
        ag.logged.add('launch_' + newTotal);
        addEvent('swarm', `DECISION: ${acres} acres / ${fronts} front cells → launching ${toLaunch} drone${toLaunch>1?'s':''}. Fleet: ${newTotal}/${DRONE_STASH_TOTAL} (${remaining} reserve).`);
        ag.actions++;
      }
    }

    // Reassign all launched drones to fire clusters (k-means)
    if (now - ag.lastDroneAssign > 4000) {
      ag.lastDroneAssign = now;
      const active = drones.filter(d => d.launched);
      const clusters = clusterFronts(activeFronts, Math.min(active.length, Math.max(3, Math.ceil(active.length / 3))));
      let di = 0;
      for (let ci = 0; ci < clusters.length && di < active.length; ci++) {
        const cl = clusters[ci];
        const dronesFor = Math.min(4, Math.max(1, Math.round(cl.size / Math.max(1, fronts) * active.length)));
        for (let d = 0; d < dronesFor && di < active.length; d++) {
          active[di].trow = cl.row + (d - dronesFor / 2) * 3;
          active[di].tcol = cl.col + (d - dronesFor / 2) * 2;
          di++;
        }
      }
      while (di < active.length) {
        const angle = (di / active.length) * Math.PI * 2 + now * 0.0001;
        active[di].trow = (cR || 128) + Math.sin(angle) * 40;
        active[di].tcol = (cC || 128) + Math.cos(angle) * 40;
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

    // ── DEPLOY: CONDITION-DRIVEN dispatch (not fixed timers) ──
    // Level 2+: Engines deploy when fire confirmed and actively spreading
    const engines = units.filter(u => u.type === 'engine');
    if (level >= 2 && acres >= 2 && activeFronts.length > 0) {
      const defPos = getDefensePos(activeFronts, engines.length, engine);
      fireOps.hoseLines.length = 0;
      for (let ei = 0; ei < engines.length; ei++) {
        if (ei < defPos.length) {
          setUnitTarget(engines[ei], defPos[ei].row, defPos[ei].col);
          const nearF = activeFronts[Math.min(ei*Math.floor(activeFronts.length/engines.length),activeFronts.length-1)];
          fireOps.hoseLines.push({ ur:defPos[ei].row, uc:defPos[ei].col, fr:nearF.row, fc:nearF.col });
        }
      }
      if (!ag.logged.has('engine_attack')) { ag.logged.add('engine_attack'); addEvent('deploy',`DECISION: Fire confirmed ${acres} acres, ROS ${ros.toFixed(1)} ch/hr → dispatching ${engines.length} engines. E-69A/B (Palisades), E-23 (Brentwood). ETA 8-12 min.`); ag.actions+=2; }
    }

    // Level 2+: Water tender when fire needs sustained water supply
    const tender = units.find(u => u.type==='tender');
    if (tender && level >= 2 && acres >= 5) {
      setUnitTarget(tender, (cR||128)+Math.cos(windRad)*20, (cC||128)-Math.sin(windRad)*20);
      if (!ag.logged.has('tender')) { ag.logged.add('tender'); addEvent('deploy',`DECISION: ${acres} acres requires sustained water → WT-71 (4,000gal) from LACoFD Stn 71 via Malibu Canyon Rd.`); ag.actions++; }
    }

    // Level 2+: Helicopter when perimeter too broad for ground-only attack
    const heli = units.find(u => u.type==='heli');
    if (heli && level >= 2 && (acres >= 8 || fronts > 20 || ros > 2.0)) {
      const orbitAng=now*0.0003; heli.trow=(cR||128)+Math.sin(orbitAng)*30; heli.tcol=(cC||128)+Math.cos(orbitAng)*30;
      if (!ag.lastWaterDrop || now-ag.lastWaterDrop > 3000/sim.speed) {
        ag.lastWaterDrop=now; const lead=leadingEdge();
        if (lead) { fireOps.waterDrops.push({row:heli.trow,col:heli.tcol,startTime:now,duration:2000}); for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++) { const rr=Math.round(lead.row+dr),cc=Math.round(lead.col+dc); if(rr>=0&&rr<GRID_ROWS&&cc>=0&&cc<GRID_COLS&&engine.cells[rr*GRID_COLS+cc]===BURNING) engine.cells[rr*GRID_COLS+cc]=BURNED; } }
        if (!ag.logged.has('heli_drop')) { ag.logged.add('heli_drop'); addEvent('deploy',`DECISION: ${fronts} active fronts, ROS ${ros.toFixed(1)} → aerial attack needed. H-1 Chinook from SMO (157mph), 2,600gal Bambi Bucket.`); ag.actions++; }
      }
    }

    // Level 3+: Lead plane when aerial coordination needed
    const leadPlane = units.find(u => u.type==='lead');
    if (leadPlane && level >= 3 && acres >= 15) { const ang=now*0.0005+1; leadPlane.trow=(cR||128)+Math.sin(ang)*38; leadPlane.tcol=(cC||128)+Math.cos(ang)*38; if (!ag.logged.has('lead')) { ag.logged.add('lead'); addEvent('deploy',`DECISION: Multiple aircraft on scene → LP-1 Bronco lead plane for drop zone coordination.`); ag.actions++; } }

    // Level 3+: Hand crews when perimeter needs containment lines
    const handCrews = units.filter(u => u.type==='crew');
    if (handCrews.length>0 && level >= 3 && fronts > 30 && !ag.logged.has('crew_line')) {
      ag.logged.add('crew_line');
      for (let ci=0; ci<handCrews.length; ci++) {
        const flankR=cR+Math.sin(windRad+ci*0.5)*15, flankC=cC+Math.cos(windRad+ci*0.5)*15;
        setUnitTarget(handCrews[ci], flankR, flankC);
      }
      const len=12; const flankR=cR+Math.sin(windRad)*15,flankC=cC+Math.cos(windRad)*15;
      fireOps.handLines.push({r1:Math.round(flankR-Math.cos(windRad)*len),c1:Math.round(flankC+Math.sin(windRad)*len),r2:Math.round(flankR+Math.cos(windRad)*len),c2:Math.round(flankC-Math.sin(windRad)*len)});
      addEvent('deploy',`DECISION: ${fronts} fronts need containment → ${handCrews.length} hand crews (20 each) to eastern flank for fireline construction.`); ag.actions++;
    }

    // Level 3+: SEAT when flanks need retardant
    const seat = units.find(u => u.type==='seat');
    if (seat && level >= 3 && acres >= 20) { const ang=now*0.0004+2; seat.trow=(cR||128)+Math.sin(ang)*22; seat.tcol=(cC||128)+Math.cos(ang)*22;
      if (!ag.logged.has('seat_drop') && acres>25 && activeFronts.length>0) { ag.logged.add('seat_drop'); const flank=activeFronts[Math.floor(activeFronts.length*0.3)]; if (flank) { fireOps.retardantDrops.push({r1:flank.row,c1:flank.col,r2:flank.row+8,c2:flank.col+8,startTime:now,duration:15000}); engine.applyRetardant(flank.row+4,flank.col+4,5,30); } addEvent('deploy',`DECISION: Flanks spreading → SE-1 SEAT (800gal retardant) on southern flank.`); ag.actions++; }
    }

    // Level 3+: Dozer when fire needs mechanical firebreak
    const dozer = units.find(u => u.type==='dozer');
    if (dozer && level >= 3 && acres >= 25 && engine.windSpeed > 12 && !ag.logged.has('dozer_break') && activeFronts.length>0) {
      ag.logged.add('dozer_break'); const aR=cR-Math.cos(windRad)*25,aC=cC+Math.sin(windRad)*25; const pR=Math.sin(windRad)*20,pC=Math.cos(windRad)*20;
      fireOps.dozerLines.push({r1:Math.round(aR-pR),c1:Math.round(aC-pC),r2:Math.round(aR+pR),c2:Math.round(aC+pC)});
      setUnitTarget(dozer, aR, aC);
      addEvent('deploy',`DECISION: Wind ${engine.windSpeed}mph driving spread → DZ-1 Cat D8T cutting 15ft firebreak ahead of fire.`); ag.actions+=2;
    }

    // Level 3+: Hotshot burnout when indirect attack needed
    const hotshot = units.find(u => u.type==='hotshot');
    if (hotshot && level >= 3 && acres >= 30 && ros > 1.0 && !ag.crewWithdrawn && !ag.logged.has('backfire') && activeFronts.length>0) {
      ag.logged.add('backfire'); const sR=cR+Math.sin(windRad)*18,sC=cC+Math.cos(windRad)*18; const lR=Math.cos(windRad)*15,lC=-Math.sin(windRad)*15;
      fireOps.backfireLines.push({r1:Math.round(sR-lR),c1:Math.round(sC-lC),r2:Math.round(sR+lR),c2:Math.round(sC+lC),startTime:now,duration:25000});
      setUnitTarget(hotshot, sR, sC);
      addEvent('deploy',`DECISION: ROS ${ros.toFixed(1)} ch/hr, direct attack failing → IHC-8 Hotshots for indirect burnout ops.`); ag.actions+=3;
    }

    // Level 4+: VLAT — now gated by AI_OVERWATCH decision queue (Iteration 2)
    // Direct dispatch removed; VLAT is proposed via proposeDecision('ai_overwatch', 'request_vlat', ...)

    // Level 4+: Structure protection when population zones threatened
    const structEng = units.find(u => u.type==='structeng');
    if (structEng && level >= 4 && !ag.logged.has('struct_protect')) {
      const nearest = sim.zoneStates.reduce((best,z) => { const d=fireDist(z,engine); return d<best.d?{z,d}:best; },{z:sim.zoneStates[0],d:999});
      if (nearest.d<40) { ag.logged.add('struct_protect'); setUnitTarget(structEng, nearest.z.row, nearest.z.col); for (let si=0;si<4;si++) { const ang=(si/4)*Math.PI*2; fireOps.structProtect.push({row:nearest.z.row+Math.cos(ang)*4,col:nearest.z.col+Math.sin(ang)*4}); } addEvent('deploy',`DECISION: Fire ${Math.round(nearest.d)} cells from ${nearest.z.name} (${nearest.z.pop} residents) → SP-19 for structure triage.`); ag.actions+=2; }
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

    // ── AI DECISION PROPOSALS (human-in-the-loop) ──
    if (icsEngine) {
      // AI_DEPLOY: Pre-stage on threatened flank when wind conditions warrant
      if (level >= 3 && engine.windSpeed > 18 && !ag.logged.has('dp_prestage') && activeFronts.length > 0) {
        ag.logged.add('dp_prestage');
        const flankR = Math.round(cR + Math.sin(windRad) * 25), flankC = Math.round(cC + Math.cos(windRad) * 25);
        icsEngine.proposeDecision('ai_deploy', 'prestage_east',
          `Wind ${engine.windSpeed}mph pushing fire east. Pre-stage 2 engines on east flank to protect ${POP_ZONES[0].name}.`,
          'high',
          () => {
            const avail = units.filter(u => u.type === 'engine').slice(0, 2);
            avail.forEach((u, i) => setUnitTarget(u, flankR + i * 5, flankC));
            addEvent('deploy', `APPROVED: Pre-staging engines on east flank per AI_DEPLOY recommendation.`);
            ag.actions += 2;
          }
        );
        addEvent('overwatch', `AI_DEPLOY proposes: pre-stage engines on east flank. Awaiting commander approval.`);
      }

      // AI_EVAC: Propose mandatory evacuation when zone critically threatened
      for (const zone of sim.zoneStates) {
        if (zone.status === 'warning') {
          const dist = fireDist(zone, engine);
          const dpKey = `dp_evac_${zone.id}`;
          if (dist < 25 && !ag.logged.has(dpKey)) {
            ag.logged.add(dpKey);
            const eta = Math.round(dist * 95 / 1000 * 60 / (ros * 22 + 1));
            icsEngine.proposeDecision('ai_evac', `mandatory_evac_${zone.id}`,
              `Fire ETA ${eta}min to ${zone.id} (${zone.name}, ${zone.pop} residents). Single exit via ${ROUTES[0].name}. Recommend MANDATORY evacuation + contraflow.`,
              'critical',
              () => {
                zone.status = 'order';
                addEvent('evac', `APPROVED: Mandatory evacuation ${zone.id}. Genasys WEA + reverse-911 sent.`);
                ag.actions += 2;
              }
            );
            addEvent('evac', `AI_EVAC proposes: Mandatory evacuation ${zone.id}. Awaiting commander approval.`);
          }
        }
      }

      // AI_OVERWATCH: Request VLAT when containment is failing
      if (level >= 4 && !ag.retardantReq && acres > 30 && !ag.logged.has('dp_vlat')) {
        ag.logged.add('dp_vlat');
        icsEngine.proposeDecision('ai_overwatch', 'request_vlat',
          `Fire ${acres} acres, ROS ${ros.toFixed(1)} ch/hr. Ground suppression insufficient. Recommend DC-10 VLAT (11,600gal) ahead of fire head.`,
          'high',
          () => {
            ag.retardantReq = true;
            const lead = leadingEdge();
            if (lead) {
              const dropR = Math.round(lead.row - Math.cos(windRad) * 20), dropC = Math.round(lead.col + Math.sin(windRad) * 20);
              const airUnit = units.find(u => u.type === 'air');
              if (airUnit) { airUnit.trow = dropR; airUnit.tcol = dropC; }
              addEvent('deploy', `APPROVED: AT-1 DC-10 VLAT inbound. 11,600gal Phos-Chek.`);
              setTimeout(() => {
                if (!sim.fireActive) return;
                engine.applyRetardant(dropR, dropC, 10, 45);
                fireOps.retardantDrops.push({ r1: Math.round(dropR + Math.sin(windRad) * 12), c1: Math.round(dropC + Math.cos(windRad) * 12), r2: Math.round(dropR - Math.sin(windRad) * 12), c2: Math.round(dropC - Math.cos(windRad) * 12), startTime: Date.now(), duration: 30000 });
                addEvent('deploy', 'VLAT DROP COMPLETE — 11,600gal retardant line established.');
              }, 6000 / sim.speed);
            }
            ag.actions += 3;
          }
        );
        addEvent('overwatch', `AI_OVERWATCH proposes: VLAT request. Awaiting commander approval.`);
      }

      // AI_SWARM: Propose drone repositioning for spot fire investigation
      if (spots > 0 && !ag.logged.has('dp_spot_recon_' + spots)) {
        ag.logged.add('dp_spot_recon_' + spots);
        icsEngine.proposeDecision('ai_swarm', 'spot_recon_' + spots,
          `${spots} spot fire${spots > 1 ? 's' : ''} detected. Reassign 3 scout drones for thermal confirmation and perimeter mapping.`,
          spots > 2 ? 'high' : 'medium',
          () => {
            const scouts = drones.filter(d => d.launched && d.dtype === 'scout').slice(0, 3);
            scouts.forEach((d, i) => {
              d.trow = Math.round(cR + (Math.random() - 0.5) * 30);
              d.tcol = Math.round(cC + (Math.random() - 0.5) * 30);
            });
            addEvent('swarm', `APPROVED: 3 scouts vectored to spot fire investigation.`);
            ag.actions++;
          }
        );
      }
    }

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
      if (!sim || !sim.canvas || !sim.ctx || sim.gw === 0) { animRef.current = requestAnimationFrame(animate); return; }
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
            // Drone nodes
            const launchedCount = drones.filter(d => d.launched).length;
            const droneNodes = [];
            if (launchedCount > 0) {
              droneNodes.push('drones');
              const hasScout = drones.some(d => d.launched && d.dtype === 'scout');
              const hasMapper = drones.some(d => d.launched && d.dtype === 'mapper');
              const hasReaper = drones.some(d => d.launched && d.dtype === 'reaper');
              const hasRelay = drones.some(d => d.launched && d.dtype === 'relay');
              if (hasScout) droneNodes.push('drone_scout');
              if (hasMapper) droneNodes.push('drone_mapper');
              if (hasReaper) droneNodes.push('drone_reaper');
              if (hasRelay) droneNodes.push('drone_relay');
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

      // ── EVAC ROUTES ──
      for (const route of ROUTES) {
        const st = sim.routeStates[route.id]; if (!st) continue;
        ctx.beginPath(); ctx.strokeStyle=st==='clear'?'rgba(52,211,153,.6)':st==='blocked'?'rgba(239,68,68,.6)':'rgba(251,191,36,.6)';
        ctx.lineWidth=st==='congested'?3:2; ctx.setLineDash(st==='congested'?[6,4]:st==='blocked'?[3,3]:[4,8]);
        route.pts.forEach((p,i) => { const px=ll2px(p[0],p[1],gw,gh); i===0?ctx.moveTo(px.x,px.y):ctx.lineTo(px.x,px.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }

      // ── ZONE LABELS ──
      for (const zone of sim.zoneStates) {
        if (zone.status==='clear') continue;
        const zp = g2px(zone.row,zone.col,gw,gh);
        ctx.font='bold 9px -apple-system,sans-serif'; ctx.fillStyle=zone.status==='order'?'#FCA5A5':zone.status==='warning'?'#FCD34D':'#6EE7B7'; ctx.textAlign='center';
        ctx.fillText(`${zone.id}: ${zone.status.toUpperCase()}`,zp.x,zp.y);
        if (zone.evacPct>0) { ctx.font='8px -apple-system,sans-serif'; ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.fillText(`Evac ${Math.round(zone.evacPct)}%`,zp.x,zp.y+12); }
      }

      // ── FIRE OPS ──
      const nowT = Date.now();
      for (const fb of fireOps.dozerLines) { const p1=g2px(fb.r1,fb.c1,gw,gh),p2=g2px(fb.r2,fb.c2,gw,gh); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.strokeStyle='rgba(163,230,53,.4)'; ctx.lineWidth=2; ctx.setLineDash([3,4]); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle='rgba(120,100,60,.15)'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }
      for (const hl of fireOps.handLines) { const p1=g2px(hl.r1,hl.c1,gw,gh),p2=g2px(hl.r2,hl.c2,gw,gh); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.strokeStyle='rgba(180,120,60,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([2,3]); ctx.stroke(); ctx.setLineDash([]); }
      for (const ho of fireOps.hoseLines) { const pu=g2px(ho.ur,ho.uc,gw,gh),pf=g2px(ho.fr,ho.fc,gw,gh); ctx.beginPath(); ctx.moveTo(pu.x,pu.y); ctx.lineTo(pf.x,pf.y); ctx.strokeStyle='rgba(56,189,248,.3)'; ctx.lineWidth=1; ctx.setLineDash([1,2]); ctx.stroke(); ctx.setLineDash([]); for(let sp=0;sp<3;sp++){const a=frame*0.08+sp*2.1;ctx.beginPath();ctx.arc(pf.x+Math.cos(a)*3,pf.y+Math.sin(a)*3,1.5,0,Math.PI*2);ctx.fillStyle='rgba(56,189,248,.25)';ctx.fill();} }
      for (const sp of fireOps.structProtect) { const pp=g2px(sp.row,sp.col,gw,gh); ctx.beginPath(); ctx.arc(pp.x,pp.y,6,0,Math.PI*2); ctx.strokeStyle='rgba(56,189,248,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([2,2]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='rgba(56,189,248,.08)'; ctx.fill(); }
      for (let ri=fireOps.retardantDrops.length-1;ri>=0;ri--) { const rd=fireOps.retardantDrops[ri],age=(nowT-rd.startTime)/1000; if(age>rd.duration/1000){fireOps.retardantDrops.splice(ri,1);continue;} const alpha=Math.max(.1,1-age/(rd.duration/1000)); const p1=g2px(rd.r1,rd.c1,gw,gh),p2=g2px(rd.r2,rd.c2,gw,gh); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.strokeStyle=`rgba(220,50,70,${alpha*.5})`; ctx.lineWidth=3; ctx.stroke(); }
      for (const bf of fireOps.backfireLines) { const age=(nowT-bf.startTime)/1000,prog=Math.min(1,age/(bf.duration/1000)); const p1=g2px(bf.r1,bf.c1,gw,gh),p2=g2px(bf.r2,bf.c2,gw,gh); const ex=p1.x+(p2.x-p1.x)*prog,ey=p1.y+(p2.y-p1.y)*prog; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(ex,ey); ctx.strokeStyle='rgba(80,40,10,.5)'; ctx.lineWidth=2; ctx.stroke(); if(prog<1){const fl=0.6+Math.sin(frame*0.2)*0.4;ctx.beginPath();ctx.arc(ex,ey,4,0,Math.PI*2);ctx.fillStyle=`rgba(255,${Math.round(100*fl)},0,${0.5*fl})`;ctx.fill();} }
      for (let wi=fireOps.waterDrops.length-1;wi>=0;wi--) { const wd=fireOps.waterDrops[wi],age=(nowT-wd.startTime)/1000; if(age>wd.duration/1000){fireOps.waterDrops.splice(wi,1);continue;} const prog=age/(wd.duration/1000),radius=6+prog*10,alpha=Math.max(0,1-prog*1.1); const pp=g2px(wd.row,wd.col,gw,gh); ctx.beginPath(); ctx.arc(pp.x,pp.y,radius,0,Math.PI*2); ctx.fillStyle=`rgba(56,189,248,${alpha*0.15})`; ctx.fill(); ctx.strokeStyle=`rgba(56,189,248,${alpha*0.4})`; ctx.lineWidth=1; ctx.stroke(); }

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
      ctx.fillText('COMMAND', ccPx.x, ccPx.y - ccS - 4);
      ctx.fillStyle = 'rgba(167,139,250,0.7)'; ctx.font = '6px monospace';
      ctx.fillText(`${stashedCount} in reserve`, ccPx.x, ccPx.y + ccS + 10);

      // ── DRONES with type-specific rendering ──
      for (const d of drones) {
        if (!d.launched) continue;
        const dp=g2px(d.row,d.col,gw,gh);
        const dx=dp.x+Math.sin(frame*0.02+d.row*0.1)*2, dy=dp.y+Math.cos(frame*0.015+d.col*0.1)*1.5;
        const dc=DTYPE_COLORS[d.dtype]||'#22D3EE';

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

      // ── ROAD NETWORK (faint overlay) ──
      if (sim.fireDetected) {
        ctx.strokeStyle='rgba(167,139,250,0.08)'; ctx.lineWidth=1.5; ctx.setLineDash([4,6]);
        for (const seg of ROAD_SEGMENTS) { ctx.beginPath(); for(let i=0;i<seg.length;i++){const p=g2px(seg[i][0],seg[i][1],gw,gh);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);} ctx.stroke(); }
        ctx.setLineDash([]);
      }

      // ── UNITS ──
      for (const u of units) {
        const up=g2px(u.row,u.col,gw,gh); const ux=up.x,uy=up.y; const uc=UTYPE[u.type]?.c||'#FBBF24';
        const idleAlpha = sim.fireDetected ? '' : '40';
        ctx.beginPath(); ctx.arc(ux,uy,6,0,Math.PI*2); ctx.fillStyle=uc+'18'; ctx.fill(); ctx.strokeStyle=uc+(sim.fireDetected?'90':'30'); ctx.lineWidth=1; ctx.stroke();

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
      {hasApiKey && <div ref={mapContainerRef} style={{ position:'absolute', inset:0, zIndex:1 }} />}

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

      {!hasApiKey && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', color:'rgba(200,210,225,0.4)', fontFamily:"'Inter',sans-serif", zIndex:3 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Google Maps</div>
          <div style={{ fontSize:11 }}>Set VITE_GOOGLE_MAPS_API_KEY in .env to enable</div>
        </div>
      )}
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
