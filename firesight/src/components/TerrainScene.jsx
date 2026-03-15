// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TerrainScene.jsx — FireSight: Google Maps + Full Wildfire Simulation
//
// Uses Google Maps OverlayView so the fire canvas moves with map pan/zoom.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FireSpreadEngine, GRID_ROWS, GRID_COLS, BURNING, BURNED, RETARDANT, UNBURNED } from '../fireSpreadEngine.js';

// ── Geographic Bounds (must match fire engine) ──────────────────────────────
const LAT_MIN = 33.990, LAT_MAX = 34.100;
const LNG_MIN = -118.620, LNG_MAX = -118.430;
const CENTER = { lat: (LAT_MIN + LAT_MAX) / 2, lng: (LNG_MIN + LNG_MAX) / 2 };

// ── Agent Colors ────────────────────────────────────────────────────────────
const AC = { overwatch:'#A78BFA', predict:'#EF4444', swarm:'#22D3EE', evac:'#34D399', deploy:'#FBBF24' };

// ── Drone Types ─────────────────────────────────────────────────────────────
const DTYPE_COLORS = { recon:'#22D3EE', spotter:'#60A5FA', relay:'#A78BFA', safety:'#34D399', ignition:'#F97316' };
const DTYPE_LIST = ['recon','recon','recon','spotter','spotter','relay','relay','safety','safety','safety','ignition','ignition'];

// ── Unit Types ──────────────────────────────────────────────────────────────
const UTYPE = {
  engine:{c:'#FBBF24'}, tender:{c:'#F59E0B'}, hotshot:{c:'#F97316'}, crew:{c:'#FB923C'},
  dozer:{c:'#A3E635'}, air:{c:'#F472B6'}, seat:{c:'#E879F9'}, heli:{c:'#EC4899'},
  lead:{c:'#D946EF'}, structeng:{c:'#38BDF8'},
};

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

// ── Scenario Timeline ───────────────────────────────────────────────────────
const SCENARIO = [
  { t:0, fire:{lat:34.045,lng:-118.529,r:3}, rate:.05, agent:'system', msg:'Fire reported at 34.045°N. Est 5 acres.' },
  { t:5000, agent:'overwatch', msg:'Incident initialized: PALISADES FIRE. 5 agents online.' },
  { t:8000, agent:'predict', rate:.08, msg:'ROS 2.4 ch/hr. Spotting risk: EXTREME.' },
  { t:10000, agent:'predict', rate:.12, msg:'1h prediction: 210 acres. 3h: 480 acres.' },
  { t:60000, agent:'predict', rate:.18, msg:'Fire 45 acres. ROS 3.1 ch/hr (+29%).' },
  { t:120000, agent:'predict', rate:.22, msg:'Revised: 1h 260ac. Confidence 74%.' },
  { t:210000, agent:'predict', msg:'Wind shift NW→NE forecast in ~90min (73% conf).' },
  { t:270000, agent:'predict', weather:{windDirection:45,windSpeed:30}, rate:.28, msg:'WIND SHIFT CONFIRMED. NE 30mph gusts 50.' },
  { t:275000, agent:'predict', rate:.35, msg:'CROWN FIRE detected. ROS accelerating.' },
  { t:480000, agent:'predict', rate:.32, msg:'340 acres. NE slowed. Western line holding. 12% contained.' },
  { t:750000, agent:'overwatch', msg:'Resolution phase. 31% contained.' },
  { t:900000, agent:'overwatch', msg:'SIMULATION COMPLETE. 420ac | 31% contained | 0 structures lost.' },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function TerrainScene({ timeSlot, onTerrainClick, simulationMode, activeLayers, swarmActive, evacActive, deployActive, fireData }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const simRef = useRef(null);
  const animRef = useRef(null);
  const [mapStatus, setMapStatus] = useState('initializing');
  const [ui, setUi] = useState({ running:false, speed:1, acres:0, contain:0, drones:'0/12', phase:'Detection', events:[], evac:0, actions:0 });

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
          center: CENTER, zoom: 13, tilt: 0, heading: 0,
          mapTypeId: 'satellite', disableDefaultUI: true, gestureHandling: 'greedy',
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

    // Init drones in grid space
    const drones = [];
    for (let i = 0; i < 12; i++) {
      const r = 200 + Math.random() * 15, c = 200 + Math.random() * 15;
      drones.push({ id:`D-${String(i+1).padStart(2,'0')}`, dtype:DTYPE_LIST[i], row:r, col:c, trow:r, tcol:c });
    }

    // Init units
    const units = [
      {id:'E-1',type:'engine',row:190,col:210},{id:'E-2',type:'engine',row:192,col:212},{id:'E-3',type:'engine',row:194,col:210},
      {id:'WT-1',type:'tender',row:195,col:215},{id:'H-1',type:'heli',row:180,col:220},{id:'LP-1',type:'lead',row:175,col:225},
      {id:'HC-1',type:'hotshot',row:185,col:210},{id:'C-1',type:'crew',row:195,col:218},
      {id:'AT-1',type:'air',row:170,col:230},{id:'SE-1',type:'seat',row:172,col:228},
      {id:'DZ-1',type:'dozer',row:190,col:225},{id:'SP-1',type:'structeng',row:198,col:220},
    ].map(u => ({ ...u, trow:u.row, tcol:u.col }));

    const sim = {
      engine, offCanvas, offCtx: offCanvas.getContext('2d'),
      drones, units,
      fireOps: { hoseLines:[], dozerLines:[], handLines:[], retardantDrops:[], waterDrops:[], backfireLines:[], structProtect:[] },
      routeStates: {}, zoneStates: POP_ZONES.map(z => ({ ...z, status:'clear', evacPct:0 })),
      running: false, speed: 1, simStart: 0, stepIdx: 0,
      fireStepAccum: 0, fireStepsPerFrame: 0, frame: 0,
      ag: { dronesDeployed:0, lastDroneAssign:0, logged:new Set(), actions:0,
            retardantReq:false, crewWithdrawn:false, routesActive:false, escalated:false,
            lastWaterDrop:0 },
      events: [], lastUi: 0,
      // Overlay canvas state (set by OverlayView.draw)
      canvas: null, ctx: null, gw: 0, gh: 0,
    };
    simRef.current = sim;

    // ── Create OverlayView — canvas lives inside the map's overlay pane
    // so it physically moves with the map during pan/zoom ──
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

    startLoop();
  }

  // ── Grid (row,col) → Overlay canvas pixel ─────────────────────────────
  // The overlay canvas covers exactly the fire grid bounds, so mapping is linear
  function g2px(row, col, gw, gh) {
    return { x: (col / GRID_COLS) * gw, y: (row / GRID_ROWS) * gh };
  }

  // ── Lat/Lng → Overlay canvas pixel (for routes etc) ───────────────────
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
  // AUTONOMOUS AGENT TICK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function agentTick(sim) {
    if (!sim.running) return;
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

    let cR = 0, cC = 0;
    if (activeFronts.length > 0) { for (const f of activeFronts) { cR += f.row; cC += f.col; } cR /= activeFronts.length; cC /= activeFronts.length; }
    function leadingEdge() { let b = activeFronts[0], bs = -Infinity; for (const f of activeFronts) { const s = -Math.cos(windRad)*f.row + Math.sin(windRad)*f.col; if (s > bs) { bs=s; b=f; } } return b; }
    const addEvent = (agent, msg) => { sim.events.push({ time: sim.running ? (now - sim.simStart) * sim.speed : 0, agent, msg, t: now }); };

    // SWARM: Deploy drones
    const numDrones = Math.min(12, Math.max(2, Math.ceil(acres/30) + Math.ceil(fronts/40)));
    if (numDrones > ag.dronesDeployed || now - ag.lastDroneAssign > 5000) {
      ag.lastDroneAssign = now;
      const clusters = clusterFronts(activeFronts, numDrones);
      let di = 0;
      for (let ci = 0; ci < clusters.length && di < drones.length; ci++) {
        const cl = clusters[ci];
        const dronesFor = Math.min(3, Math.max(1, Math.round(cl.size / Math.max(1,fronts) * numDrones)));
        for (let d = 0; d < dronesFor && di < drones.length; d++) { drones[di].trow = cl.row + (d-dronesFor/2)*3; drones[di].tcol = cl.col + (d-dronesFor/2)*2; di++; }
      }
      while (di < drones.length) { const angle = (di/drones.length)*Math.PI*2+now*0.0001; drones[di].trow=(cR||128)+Math.sin(angle)*40; drones[di].tcol=(cC||128)+Math.cos(angle)*40; di++; }
      ag.dronesDeployed = numDrones;
      if (!ag.logged.has('drone_'+numDrones) && numDrones>=3) { ag.logged.add('drone_'+numDrones); addEvent('swarm',`Fleet ${numDrones}/12 deployed to ${clusters.length} cluster${clusters.length>1?'s':''}. IR scanning.`); ag.actions++; }
    }

    // Engines: direct attack
    const engines = units.filter(u => u.type === 'engine');
    if (acres > 5 && activeFronts.length > 0) {
      const defPos = getDefensePos(activeFronts, engines.length, engine);
      fireOps.hoseLines.length = 0;
      for (let ei = 0; ei < engines.length; ei++) {
        if (ei < defPos.length) {
          engines[ei].trow = defPos[ei].row; engines[ei].tcol = defPos[ei].col;
          const nearF = activeFronts[Math.min(ei*Math.floor(activeFronts.length/engines.length),activeFronts.length-1)];
          fireOps.hoseLines.push({ ur:defPos[ei].row, uc:defPos[ei].col, fr:nearF.row, fc:nearF.col });
        }
      }
      if (!ag.logged.has('engine_attack')) { ag.logged.add('engine_attack'); addEvent('deploy',`${engines.length} Type 3 engines. Direct attack — hose lines.`); ag.actions+=2; }
    }

    // Water tender
    const tender = units.find(u => u.type==='tender');
    if (tender && acres>10) { tender.trow=(cR||128)+Math.cos(windRad)*20; tender.tcol=(cC||128)-Math.sin(windRad)*20; if (!ag.logged.has('tender')) { ag.logged.add('tender'); addEvent('deploy','WT-1 Water Tender staged.'); ag.actions++; } }

    // Helicopter
    const heli = units.find(u => u.type==='heli');
    if (heli && acres>15 && activeFronts.length>3) {
      const orbitAng=now*0.0003; heli.trow=(cR||128)+Math.sin(orbitAng)*30; heli.tcol=(cC||128)+Math.cos(orbitAng)*30;
      if (!ag.lastWaterDrop || now-ag.lastWaterDrop > 6000/sim.speed) {
        ag.lastWaterDrop=now; const lead=leadingEdge();
        if (lead) { fireOps.waterDrops.push({row:heli.trow,col:heli.tcol,startTime:now,duration:2000}); for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) { const rr=Math.round(lead.row+dr),cc=Math.round(lead.col+dc); if(rr>=0&&rr<GRID_ROWS&&cc>=0&&cc<GRID_COLS&&engine.cells[rr*GRID_COLS+cc]===BURNING) engine.cells[rr*GRID_COLS+cc]=BURNED; } }
        if (!ag.logged.has('heli_drop')) { ag.logged.add('heli_drop'); addEvent('deploy','H-1 Chinook Bambi Bucket cooling hot spots.'); ag.actions++; }
      }
    }

    // Lead plane
    const leadPlane = units.find(u => u.type==='lead');
    if (leadPlane && acres>30) { const ang=now*0.0005+1; leadPlane.trow=(cR||128)+Math.sin(ang)*38; leadPlane.tcol=(cC||128)+Math.cos(ang)*38; if (!ag.logged.has('lead')) { ag.logged.add('lead'); addEvent('deploy','LP-1 Lead Plane on station.'); ag.actions++; } }

    // Hand crew
    const handCrew = units.find(u => u.type==='crew');
    if (handCrew && acres>30 && activeFronts.length>0 && !ag.logged.has('crew_line')) {
      ag.logged.add('crew_line'); const flankR=cR+Math.sin(windRad)*15,flankC=cC+Math.cos(windRad)*15;
      handCrew.trow=flankR; handCrew.tcol=flankC; const len=12;
      fireOps.handLines.push({r1:Math.round(flankR-Math.cos(windRad)*len),c1:Math.round(flankC+Math.sin(windRad)*len),r2:Math.round(flankR+Math.cos(windRad)*len),c2:Math.round(flankC-Math.sin(windRad)*len)});
      addEvent('deploy','C-1 Hand Crew cutting fireline on flank.'); ag.actions++;
    }

    // SEAT
    const seat = units.find(u => u.type==='seat');
    if (seat && acres>40) { const ang=now*0.0004+2; seat.trow=(cR||128)+Math.sin(ang)*22; seat.tcol=(cC||128)+Math.cos(ang)*22;
      if (!ag.logged.has('seat_drop') && acres>55 && activeFronts.length>0) { ag.logged.add('seat_drop'); const flank=activeFronts[Math.floor(activeFronts.length*0.3)]; if (flank) { fireOps.retardantDrops.push({r1:flank.row,c1:flank.col,r2:flank.row+8,c2:flank.col+8,startTime:now,duration:15000}); engine.applyRetardant(flank.row+4,flank.col+4,5,30); } addEvent('deploy','SE-1 SEAT — 800gal retardant on flank.'); ag.actions++; }
    }

    // Dozer
    const dozer = units.find(u => u.type==='dozer');
    if (dozer && acres>50 && !ag.logged.has('dozer_break') && activeFronts.length>0) {
      ag.logged.add('dozer_break'); const aR=cR-Math.cos(windRad)*25,aC=cC+Math.sin(windRad)*25; const pR=Math.sin(windRad)*20,pC=Math.cos(windRad)*20;
      fireOps.dozerLines.push({r1:Math.round(aR-pR),c1:Math.round(aC-pC),r2:Math.round(aR+pR),c2:Math.round(aC+pC)}); dozer.trow=aR; dozer.tcol=aC;
      addEvent('deploy','DZ-1 cutting dozer line ahead of fire.'); ag.actions+=2;
    }

    // Hotshot burnout
    const hotshot = units.find(u => u.type==='hotshot');
    if (hotshot && acres>60 && !ag.crewWithdrawn && !ag.logged.has('backfire') && activeFronts.length>0) {
      ag.logged.add('backfire'); const sR=cR+Math.sin(windRad)*18,sC=cC+Math.cos(windRad)*18; const lR=Math.cos(windRad)*15,lC=-Math.sin(windRad)*15;
      fireOps.backfireLines.push({r1:Math.round(sR-lR),c1:Math.round(sC-lC),r2:Math.round(sR+lR),c2:Math.round(sC+lC),startTime:now,duration:25000}); hotshot.trow=sR; hotshot.tcol=sC;
      addEvent('deploy','HC-1 Hotshot burnout op.'); ag.actions+=3;
    }

    // VLAT retardant
    if (!ag.retardantReq && acres>120 && ros>1.5 && activeFronts.length>0) {
      ag.retardantReq=true; const lead=leadingEdge();
      if (lead) { const dropR=Math.round(lead.row-Math.cos(windRad)*20),dropC=Math.round(lead.col+Math.sin(windRad)*20); const airUnit=units.find(u=>u.type==='air'); if (airUnit) { airUnit.trow=dropR; airUnit.tcol=dropC; } addEvent('deploy','AT-1 VLAT DC-10 inbound. 11,600gal retardant.'); ag.actions+=2;
        setTimeout(()=>{ if(!sim.running) return; engine.applyRetardant(dropR,dropC,10,45); const pR=Math.sin(windRad)*12,pC=Math.cos(windRad)*12; fireOps.retardantDrops.push({r1:Math.round(dropR+pR),c1:Math.round(dropC+pC),r2:Math.round(dropR-pR),c2:Math.round(dropC-pC),startTime:Date.now(),duration:30000}); addEvent('deploy','VLAT DROP COMPLETE.'); ag.actions+=2; },6000/sim.speed);
      }
    }

    // Structure protection
    const structEng = units.find(u => u.type==='structeng');
    if (structEng && acres>80 && !ag.logged.has('struct_protect')) {
      const nearest = sim.zoneStates.reduce((best,z) => { const d=fireDist(z,engine); return d<best.d?{z,d}:best; },{z:sim.zoneStates[0],d:999});
      if (nearest.d<40) { ag.logged.add('struct_protect'); structEng.trow=nearest.z.row; structEng.tcol=nearest.z.col; for (let si=0;si<4;si++) { const ang=(si/4)*Math.PI*2; fireOps.structProtect.push({row:nearest.z.row+Math.cos(ang)*4,col:nearest.z.col+Math.sin(ang)*4}); } addEvent('deploy',`SP-1 at ${nearest.z.name}. Foam/gel.`); ag.actions+=2; }
    }

    // Crew safety
    if (!ag.crewWithdrawn && acres>150 && hotshot) {
      let nearFire=false; for (const f of activeFronts) { if (Math.abs(f.row-hotshot.row)<10 && Math.abs(f.col-hotshot.col)<10) { nearFire=true; break; } }
      if (nearFire) { ag.crewWithdrawn=true; hotshot.trow=170; hotshot.tcol=90; addEvent('deploy','⚠ HC-1 WITHDRAWING to Safety Zone.'); ag.actions+=2; }
    }

    // Evacuation
    for (const zone of sim.zoneStates) {
      const dist = fireDist(zone, engine);
      if (zone.status==='clear' && dist<50) { zone.status='advisory'; addEvent('evac',`${zone.id} (${zone.name}) → ADVISORY.`); ag.actions++; }
      else if (zone.status==='advisory' && dist<35) { zone.status='warning'; addEvent('evac',`${zone.id} → WARNING.`); ag.actions++; if (!ag.routesActive) { ag.routesActive=true; ROUTES.forEach(r=>sim.routeStates[r.id]='clear'); addEvent('evac','3 evac routes activated.'); } }
      else if (zone.status==='warning' && dist<20) { zone.status='order'; addEvent('evac',`⚠ MANDATORY ORDER: ${zone.id}.`); ag.actions+=2; }
      if (zone.status==='warning'||zone.status==='order') zone.evacPct=Math.min(98,(zone.evacPct||0)+(zone.status==='order'?1.5:0.5));
      if (dist<15 && zone.id==='C1' && sim.routeStates['R3']!=='blocked') { sim.routeStates['R3']='blocked'; addEvent('evac','R3 Topanga BLOCKED.'); }
      if (dist<25 && zone.id==='B3' && sim.routeStates['R2']==='clear') { sim.routeStates['R2']='congested'; addEvent('evac','R2 PCH congested.'); }
    }

    // Escalation
    if (!ag.escalated && acres>150) { ag.escalated=true; addEvent('overwatch',`ESCALATED to Type 1. ${acres} acres.`); ag.actions+=3; }

    // Spot fires
    if (spots>(sim._lastSpots||0) && spots>0) { const n=spots-(sim._lastSpots||0); if (n>0 && !ag.logged.has('spot_'+spots)) { ag.logged.add('spot_'+spots); addEvent('swarm',`IR CONFIRMED: ${n} new spot fire${n>1?'s':''}! Total: ${spots}.`); ag.actions+=2; } }
    sim._lastSpots = spots;
  }

  function execStep(sim, step) {
    if (step.fire) sim.engine.igniteAtLatLng(step.fire.lat, step.fire.lng, step.fire.r || 3);
    if (step.rate !== undefined) sim.fireStepsPerFrame = step.rate * 1.7;
    if (step.weather) sim.engine.setWeather(step.weather);
    if (step.msg) sim.events.push({ time:step.t, agent:step.agent||'system', msg:step.msg, t:Date.now() });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ANIMATION LOOP — renders onto the OverlayView canvas
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function startLoop() {
    function animate() {
      const sim = simRef.current;
      if (!sim || !sim.canvas || !sim.ctx || sim.gw === 0) { animRef.current = requestAnimationFrame(animate); return; }
      sim.frame++;
      const { engine, offCanvas, offCtx, drones, units, fireOps, frame, ctx, gw, gh } = sim;

      // Tick fire engine
      if (sim.running && sim.fireStepsPerFrame > 0) {
        sim.fireStepAccum += sim.fireStepsPerFrame;
        const steps = Math.floor(sim.fireStepAccum);
        if (steps > 0) { sim.fireStepAccum -= steps; engine.runSteps(steps); }
      }

      // Agents + Scenario
      if (sim.running) agentTick(sim);
      if (sim.running && sim.simStart > 0) {
        const elapsed = (Date.now() - sim.simStart) * sim.speed;
        while (sim.stepIdx < SCENARIO.length && SCENARIO[sim.stepIdx].t <= elapsed) { execStep(sim, SCENARIO[sim.stepIdx]); sim.stepIdx++; }
      }

      // Ease positions
      for (const d of drones) { d.row += (d.trow - d.row) * 0.02; d.col += (d.tcol - d.col) * 0.02; }
      for (const u of units) { u.row += (u.trow - u.row) * 0.015; u.col += (u.tcol - u.col) * 0.015; }

      // Clear overlay canvas
      ctx.clearRect(0, 0, gw, gh);

      // ── FIRE CELLS via offscreen ImageData ──
      const cells = engine.cells;
      const imgData = offCtx.createImageData(GRID_COLS, GRID_ROWS);
      const data = imgData.data;
      const dR8=[-1,-1,0,1,1,1,0,-1], dC8=[0,1,1,1,0,-1,-1,-1];
      for (let i = 0; i < cells.length; i++) {
        const state = cells[i];
        if (state === UNBURNED) continue;
        const p = i*4, r = Math.floor(i/GRID_COLS), c = i%GRID_COLS;
        if (state === BURNING) {
          let isEdge = false;
          for (let d=0;d<8;d++) { const nr=r+dR8[d],nc=c+dC8[d]; if(nr<0||nr>=GRID_ROWS||nc<0||nc>=GRID_COLS){isEdge=true;break;} const ns=cells[nr*GRID_COLS+nc]; if(ns===UNBURNED||ns===RETARDANT){isEdge=true;break;} }
          if (isEdge) { const fl=0.6+Math.sin(frame*0.12+c*0.18+r*0.14)*0.4; data[p]=255*fl|0; data[p+1]=(55+Math.sin(frame*0.08+r*0.12)*35)*fl|0; data[p+2]=12*fl|0; data[p+3]=220; }
          else { const sm=0.3+Math.sin(frame*0.04+c*0.05+r*0.06)*0.15; data[p]=180*sm|0; data[p+1]=40*sm|0; data[p+2]=8*sm|0; data[p+3]=200; }
        } else if (state === BURNED) { data[p]=55; data[p+1]=50; data[p+2]=45; data[p+3]=170; }
        else if (state === RETARDANT) { data[p]=200+(Math.sin(frame*0.02)*15|0); data[p+1]=50; data[p+2]=65; data[p+3]=180; }
      }
      offCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, gw, gh);

      // Fire glow
      ctx.save(); ctx.globalCompositeOperation='screen'; ctx.filter='blur(8px)'; ctx.globalAlpha=0.25;
      ctx.drawImage(offCanvas, -4, -4, gw+8, gh+8); ctx.restore();

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

      // ── DRONES ──
      for (const d of drones) {
        const dp=g2px(d.row,d.col,gw,gh); const dx=dp.x+Math.sin(frame*0.02+d.row*0.1)*2, dy=dp.y+Math.cos(frame*0.015+d.col*0.1)*1.5;
        const dc=DTYPE_COLORS[d.dtype]||'#22D3EE';
        if (d.dtype==='recon'||d.dtype==='spotter') { const scanAng=frame*0.03+d.row*0.2; ctx.beginPath(); ctx.moveTo(dx,dy); ctx.lineTo(dx+Math.cos(scanAng)*12,dy+Math.sin(scanAng)*12); ctx.strokeStyle=dc+'30'; ctx.lineWidth=1; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(dx,dy,3,0,Math.PI*2); ctx.fillStyle=dc; ctx.fill();
        ctx.fillStyle=dc+'70'; ctx.font='6px monospace'; ctx.textAlign='center'; ctx.fillText(d.id,dx,dy+10);
      }

      // ── UNITS ──
      for (const u of units) {
        const up=g2px(u.row,u.col,gw,gh); const ux=up.x,uy=up.y; const uc=UTYPE[u.type]?.c||'#FBBF24';
        ctx.beginPath(); ctx.arc(ux,uy,6,0,Math.PI*2); ctx.fillStyle=uc+'18'; ctx.fill(); ctx.strokeStyle=uc+'90'; ctx.lineWidth=1; ctx.stroke();
        if (u.type==='heli') { const ra=frame*0.15; ctx.save(); ctx.translate(ux,uy); ctx.rotate(ra); ctx.strokeStyle=uc+'60'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(9,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(0,9); ctx.stroke(); ctx.restore(); }
        if (u.type==='air') { ctx.save(); ctx.translate(ux,uy); ctx.rotate(Math.sin(frame*0.005)*0.1); ctx.strokeStyle=uc+'80'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-12,0); ctx.lineTo(12,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(0,6); ctx.stroke(); ctx.restore(); }
        if (u.type==='dozer') { ctx.strokeStyle=uc+'50'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ux-6,uy+3); ctx.lineTo(ux+6,uy+3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ux-6,uy-3); ctx.lineTo(ux+6,uy-3); ctx.stroke(); }
        if (u.type==='seat') { ctx.save(); ctx.translate(ux,uy); ctx.strokeStyle=uc+'70'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(0,4); ctx.stroke(); ctx.restore(); }
        if (u.type==='lead') { ctx.strokeStyle=uc+'30'; ctx.lineWidth=1; ctx.setLineDash([2,3]); ctx.beginPath(); ctx.arc(ux,uy,12,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
        if (u.type==='structeng') { ctx.strokeStyle=uc+'60'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(ux,uy-6); ctx.lineTo(ux+6,uy); ctx.lineTo(ux+3,uy+6); ctx.lineTo(ux-3,uy+6); ctx.lineTo(ux-6,uy); ctx.closePath(); ctx.stroke(); }
        if (u.type==='hotshot') { ctx.strokeStyle=uc+'40'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(ux,uy,8,-.5,Math.PI+.5); ctx.stroke(); }
        if (u.type==='crew') { ctx.strokeStyle=uc+'35'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(ux,uy,7,0,Math.PI); ctx.stroke(); }
        if (u.type==='tender') { ctx.strokeStyle=uc+'50'; ctx.lineWidth=1; ctx.beginPath(); ctx.rect(ux-5,uy-3,10,6); ctx.stroke(); ctx.fillStyle=uc+'15'; ctx.fillRect(ux-5,uy-3,10,6); }
        ctx.fillStyle=uc; ctx.font='bold 6px monospace'; ctx.textAlign='center'; ctx.fillText(u.id,ux,uy+16);
      }

      // ── WIND INDICATOR ──
      const windRad=((engine.windDirection+180)%360)*Math.PI/180;
      const wx=gw*0.5, wy=30, wl=20;
      ctx.save(); ctx.translate(wx,wy); ctx.rotate(windRad); ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,-wl); ctx.lineTo(0,wl); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,wl); ctx.lineTo(-4,wl-6); ctx.moveTo(0,wl); ctx.lineTo(4,wl-6); ctx.stroke(); ctx.restore();
      ctx.fillStyle='rgba(255,255,255,.15)'; ctx.font='8px -apple-system,sans-serif'; ctx.textAlign='center'; ctx.fillText(`${engine.windSpeed}mph`,wx,wy+wl+14);

      // ── UPDATE UI ──
      if (Date.now() - sim.lastUi > 400) {
        sim.lastUi = Date.now();
        const stats = engine.getStats();
        const contain = stats.totalAffected > 0 ? Math.round(Math.max(0, 100 - stats.activeFrontCells / Math.max(1, stats.totalAffected) * 200)) : 0;
        const totalEvac = sim.zoneStates.reduce((s,z) => s + (z.status!=='clear' ? Math.round(z.pop*z.evacPct/100) : 0), 0);
        setUi({ running:sim.running, speed:sim.speed, acres:Math.round(stats.totalAcres), contain:Math.max(0,contain), drones:`${sim.ag.dronesDeployed}/12`,
          phase: sim.ag.escalated?'Full Suppression':stats.totalAcres>20?'Extended Attack':stats.totalAcres>0?'Initial Attack':'Detection',
          events:sim.events.slice(-15), evac:totalEvac, actions:sim.ag.actions });
      }

      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
  }

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // ── Controls ────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const sim = simRef.current; if (!sim) return;
    if (sim.running) { sim.running = false; }
    else { if (!sim.simStart) { sim.simStart = Date.now(); sim.engine.igniteAtLatLng(34.045,-118.529,3); sim.fireStepsPerFrame = 0.05*1.7; } sim.running = true; }
    setUi(prev => ({ ...prev, running: sim.running }));
  }, []);

  const setSpeed = useCallback((s) => { const sim = simRef.current; if (sim) sim.speed = s; setUi(prev => ({ ...prev, speed: s })); }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER — no <canvas> in JSX; it lives inside the OverlayView
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', borderRadius:14, overflow:'hidden', background:'#060a10' }}>
      {hasApiKey && <div ref={mapContainerRef} style={{ position:'absolute', inset:0, zIndex:1 }} />}

      {/* Controls */}
      <div style={{ position:'absolute', top:8, left:8, zIndex:10, display:'flex', gap:4, alignItems:'center' }}>
        <button onClick={togglePlay} style={btnS}>{ui.running ? '⏸ Pause' : '▶ Play'}</button>
        {[1,3,10].map(s => <button key={s} onClick={() => setSpeed(s)} style={{ ...btnS, ...(ui.speed===s ? aBtnS : {}) }}>{s}x</button>)}
      </div>

      {/* Metrics */}
      <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:10, display:'flex', gap:1, borderRadius:8, overflow:'hidden', backdropFilter:'blur(12px)', border:'1px solid rgba(30,38,54,0.6)' }}>
        <M l="Acres" v={ui.acres} c={ui.acres>200?'#FCA5A5':ui.acres>50?'#FCD34D':'#E2E8F0'} />
        <M l="Contain" v={`${ui.contain}%`} c={ui.contain>10?'#6EE7B7':'#E2E8F0'} />
        <M l="Evac" v={ui.evac} c="#6EE7B7" />
        <M l="UAS" v={ui.drones} c="#67E8F9" />
        <M l="Actions" v={ui.actions} c="#E2E8F0" />
        <M l="Phase" v={ui.phase} c={ui.phase==='Full Suppression'?'#FCA5A5':ui.phase==='Extended Attack'?'#FCD34D':'#E2E8F0'} />
      </div>

      {/* Event Log */}
      <div style={{ position:'absolute', bottom:8, right:8, zIndex:10, width:280, maxHeight:200, background:'rgba(10,14,23,0.92)', borderRadius:8, border:'1px solid rgba(30,38,54,0.6)', overflow:'hidden', backdropFilter:'blur(12px)' }}>
        <div style={{ padding:'5px 10px', fontSize:8, fontWeight:700, color:'#8896AB', letterSpacing:0.8, textTransform:'uppercase', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(20,26,36,0.6)' }}>
          <span style={{ display:'inline-block', width:4, height:4, borderRadius:'50%', background:'#A78BFA', marginRight:6, verticalAlign:'middle' }} />
          Event Feed
        </div>
        <div style={{ maxHeight:165, overflowY:'auto', padding:4 }}>
          {[...ui.events].reverse().map((ev, i) => {
            const ac = ev.agent && ev.agent!=='system' ? AC[ev.agent] : '#94A3B8';
            return (
              <div key={i} style={{ padding:'4px 6px', fontSize:9, color:'#8896AB', borderBottom:'1px solid rgba(255,255,255,0.03)', borderLeft:`2px solid ${ac}`, marginBottom:1, borderRadius:2 }}>
                <span style={{ fontSize:7, color:'#4A5568', marginRight:4, fontFamily:'monospace' }}>{fmtT(ev.time)}</span>
                <span style={{ fontSize:8, fontWeight:700, color:ac, marginRight:4, textTransform:'uppercase' }}>{ev.agent!=='system'?(ev.agent||'').toUpperCase():'SYS'}</span>
                <span>{ev.msg}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map Status */}
      <div style={{ position:'absolute', top:8, right:8, zIndex:10, display:'flex', alignItems:'center', gap:5, padding:'3px 8px', background:'rgba(0,0,0,0.5)', borderRadius:10, backdropFilter:'blur(12px)' }}>
        <div style={{ width:5, height:5, borderRadius:'50%', background: mapStatus==='ready'?'#10B981':mapStatus==='error'?'#E84430':'#FFD700' }} />
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:'rgba(200,210,225,0.5)', letterSpacing:'0.06em' }}>
          GOOGLE MAPS {mapStatus!=='ready'?`(${mapStatus})`:''}
        </span>
      </div>

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

function fmtT(ms) { const t=Math.floor((ms||0)/1000); return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; }
