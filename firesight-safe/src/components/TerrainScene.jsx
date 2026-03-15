import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GRID_ROWS, GRID_COLS, BURNING, BURNED, RETARDANT, UNBURNED } from '../fireSpreadEngine.js';
import { NODES as ICS_NODES } from '../icsEngine.js';

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

function setUnitTarget(unit, tr, tc) {
  if(Math.abs(unit.trow-tr)<3 && Math.abs(unit.tcol-tc)<3) return;
  unit.trow=tr; unit.tcol=tc;
  if(IS_GROUND.has(unit.type)){unit._path=findRoadPath(Math.round(unit.row),Math.round(unit.col),Math.round(tr),Math.round(tc));unit._pi=0;}
  else{unit._path=null;}
}

const ROUTES = [
  { id:'R1', name:'Sunset', pts:[[34.045,-118.50],[34.042,-118.48],[34.040,-118.45],[34.038,-118.42]] },
  { id:'R2', name:'PCH', pts:[[34.030,-118.52],[34.025,-118.50],[34.020,-118.47],[34.015,-118.44]] },
  { id:'R3', name:'Topanga', pts:[[34.050,-118.55],[34.055,-118.57],[34.060,-118.59]] },
];

const POP_ZONES = [
  { id:'B3', name:'Pacific Palisades', pop:2847, row:133, col:110 },
  { id:'B4', name:'Brentwood South', pop:1560, row:77, col:107 },
  { id:'C1', name:'Topanga', pop:4200, row:140, col:56 },
];

const DRONE_SENSOR_RANGE = 18;
const COMMAND_CENTER = { name:'FireSight ICP', row:24, col:36 };
const DRONE_STASH_TOTAL = 24;

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

// ─── Three.js terrain constants ───────────────────────────────────────────
const TERRAIN_SIZE = 100;
const TERRAIN_SEGS = 128;
const CAM_HEIGHT = 38;
const CAM_RADIUS = 72;
const CAM_SPEED = 0.04;

// ─── Procedural terrain height function ───────────────────────────────────
function getHeight(x, z) {
  const nx = x / TERRAIN_SIZE;
  const nz = z / TERRAIN_SIZE;
  return (
    Math.sin(nx * 3.1 + 0.4) * 4.5 +
    Math.cos(nz * 2.7 + 0.9) * 3.2 +
    Math.sin((nx + nz) * 5.3) * 2.1 +
    Math.cos((nx - nz) * 4.1 + 1.2) * 1.8 +
    Math.sin(nx * 8.7 + nz * 6.2) * 0.9 +
    Math.max(0, Math.sin(nx * 1.5 - 0.3) * Math.cos(nz * 1.8 + 0.5) * 7.5) +
    3.5
  );
}

// ─── Fire zone definitions ────────────────────────────────────────────────
const FIRE_ZONES = [
  { slot: 0, cx: -4,  cz:  2,  radius: 5.5,  color: new THREE.Color(0.85, 0.20, 0.04), particles: 120 },
  { slot: 1, cx: -8,  cz:  9,  radius: 9.0,  color: new THREE.Color(0.70, 0.28, 0.08), particles: 200 },
  { slot: 2, cx:  4,  cz: -6,  radius: 14.0, color: new THREE.Color(0.55, 0.32, 0.12), particles: 340 },
];

// ─── Max visual movement per frame (canvas simulation) ───────────────────
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

// ─── Terrain vertex color ────────────────────────────────────────────────
function colorForHeight(h) {
  if (h < 1.5) return [0.10, 0.22, 0.11];
  if (h < 3.5) return [0.14, 0.30, 0.14];
  if (h < 5.5) return [0.22, 0.28, 0.15];
  if (h < 8.0) return [0.36, 0.27, 0.17];
  if (h < 11.0) return [0.50, 0.45, 0.38];
  return [0.72, 0.72, 0.74];
}

// ─── Glow sprite ─────────────────────────────────────────────────────────
function makeGlowTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.3)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ─── Fire overlay texture ────────────────────────────────────────────────
function makeFireOverlayTexture(r, g, b, soft) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  if (soft) {
    grad.addColorStop(0.0, `rgba(${r},${g},${b},0.35)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.15)`);
    grad.addColorStop(0.75, `rgba(${r},${g},${b},0.04)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0.00)`);
  } else {
    grad.addColorStop(0.0, `rgba(${r},${g},${b},0.90)`);
    grad.addColorStop(0.25, `rgba(${r},${g},${b},0.65)`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},0.30)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0.00)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ─── GLSL Volumetric Fire Shader ─────────────────────────────────────────
const FIRE_VERT = `
  varying vec2 vUv;
  varying float vY;
  varying float vNormY;
  uniform float uTime;
  uniform float uHeight;

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vY = position.y;
    vNormY = clamp(position.y / max(uHeight, 1.0), 0.0, 1.0);

    vec3 pos = position;
    float hNorm = clamp(pos.y / max(uHeight, 1.0), 0.0, 1.0);

    // Noise-based displacement — stronger at top, zero at base
    float heightFactor = smoothstep(0.0, 0.6, hNorm);

    // Multi-octave noise for wild, organic flame tongues
    float n1 = snoise(vec3(pos.x * 0.4, pos.y * 0.25 - uTime * 2.2, pos.z * 0.4)) * 3.2;
    float n2 = snoise(vec3(pos.x * 0.9, pos.y * 0.6 - uTime * 3.8, pos.z * 0.9 + 10.0)) * 1.8;
    float n3 = snoise(vec3(pos.x * 2.0, pos.y * 1.2 - uTime * 5.5, pos.z * 2.0 + 20.0)) * 0.8;
    // Extra turbulence for wispy tips
    float n4 = snoise(vec3(pos.x * 3.5, pos.y * 2.0 - uTime * 7.0, pos.z * 3.5 + 35.0)) * 0.4;

    float displaceX = (n1 + n2 + n3 + n4) * heightFactor;
    float displaceZ = (n1 * 0.8 + n2 * 0.6 + n3 * 0.3) * heightFactor;

    // Wind lean — fire leans in wind direction
    displaceX += hNorm * 1.5;
    displaceZ += hNorm * 0.8;

    pos.x += displaceX;
    pos.z += displaceZ;

    // Pinch at top — tighter for flame tongue shape
    float pinch = 1.0 - heightFactor * 0.75;
    pos.x *= pinch;
    pos.z *= pinch;

    // Slight vertical stretch with noise for irregular tips
    pos.y += n2 * heightFactor * 0.4;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FIRE_FRAG = `
  varying vec2 vUv;
  varying float vY;
  varying float vNormY;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uHeight;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 5; i++) {
      v += a * noise2D(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float h = vNormY;
    float dist = length(vUv - 0.5) * 2.0;

    // Multi-scale noise — upward flowing
    vec2 nc1 = vec2(vUv.x * 3.0, vUv.y * 2.0 - uTime * 0.9);
    vec2 nc2 = vec2(vUv.x * 5.5 + 3.0, vUv.y * 3.5 - uTime * 1.6);
    vec2 nc3 = vec2(vUv.x * 9.0 + 7.0, vUv.y * 6.0 - uTime * 2.5);
    float n1 = fbm(nc1 * 3.0);
    float n2 = fbm(nc2 * 2.5);
    float n3 = fbm(nc3 * 2.0);
    float n = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;

    // Very soft edge — gradual falloff so wide cylinders merge into one mass
    float edgeFade = 1.0 - smoothstep(0.0, 0.55, dist);
    edgeFade = edgeFade * edgeFade; // quadratic falloff, softer
    float topFade = 1.0 - smoothstep(0.25, 0.95, h);
    float shape = edgeFade * topFade;

    // Dark gap streaks — vertical dark channels through fire
    float gapNoise1 = fbm(vec2(vUv.x * 8.0 + uTime * 0.2, vUv.y * 3.0 - uTime * 1.2) * 2.0);
    float gapNoise2 = fbm(vec2(vUv.x * 12.0 - 5.0, vUv.y * 5.0 - uTime * 2.0) * 1.5);
    float gaps = smoothstep(0.18, 0.52, gapNoise1) * smoothstep(0.22, 0.50, gapNoise2);
    shape *= mix(0.0, 1.0, gaps);

    // Organic warp
    float warp = smoothstep(0.08, 0.55, n + 0.3 * (1.0 - h));
    shape *= warp;

    // Color ramp — deep orange/red, bright enough to be visible with fewer overlaps
    vec3 col;
    float t = h + n * 0.08;

    if (t < 0.06) {
      // Base: warm bright orange
      col = mix(vec3(0.90, 0.50, 0.08), vec3(0.85, 0.35, 0.05), t / 0.06);
    } else if (t < 0.20) {
      // Lower: saturated deep orange
      col = mix(vec3(0.85, 0.35, 0.05), vec3(0.70, 0.18, 0.02), (t - 0.06) / 0.14);
    } else if (t < 0.45) {
      // Mid body: dark orange-red (DOMINANT)
      col = mix(vec3(0.70, 0.18, 0.02), vec3(0.50, 0.08, 0.01), (t - 0.20) / 0.25);
    } else if (t < 0.68) {
      // Upper: dark red
      col = mix(vec3(0.50, 0.08, 0.01), vec3(0.22, 0.025, 0.005), (t - 0.45) / 0.23);
    } else {
      // Tips: smoky dark
      col = mix(vec3(0.22, 0.025, 0.005), vec3(0.05, 0.006, 0.001), clamp((t - 0.68) / 0.32, 0.0, 1.0));
    }

    // Slight noise warmth
    col += vec3(0.04, 0.015, 0.0) * n1 * (1.0 - h * 0.7);

    float alpha = shape * uIntensity;
    alpha = clamp(alpha, 0.0, 0.80);

    if (alpha < 0.005) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Build volumetric fire mesh (returns group with multiple flame columns) ──
function buildFireVolume(zone) {
  const group = new THREE.Group();

  // Wide overlapping blobs — continuous fire mass, not separate strips
  const columns = zone.slot === 0 ? 8 : zone.slot === 1 ? 10 : 12;
  for (let i = 0; i < columns; i++) {
    const angle = i * 2.39996 + (zone.slot * 1.7);
    const dist = (i === 0) ? 0 : (Math.sqrt(i / columns)) * zone.radius * 0.55;
    const fx = zone.cx + Math.cos(angle) * dist;
    const fz = zone.cz + Math.sin(angle) * dist;

    // Each volume: wide base, tall flames
    const centerFactor = 1.0 - (dist / (zone.radius * 0.55 + 0.01)) * 0.3;
    const heightScale = (0.7 + Math.random() * 0.6) * centerFactor;
    const height = zone.radius * 2.2 * heightScale;
    // Wide radius — each blob covers big area, overlaps with neighbors
    const radiusBottom = zone.radius * (i === 0 ? 0.80 : 0.55);
    const radiusTop = radiusBottom * 0.10;
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16, 22, true);

    const uniforms = {
      uTime: { value: i * 1.7 + zone.slot * 3.0 },
      uIntensity: { value: zone.slot === 0 ? 0.85 : zone.slot === 1 ? 0.65 : 0.45 },
      uHeight: { value: height },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: FIRE_VERT,
      fragmentShader: FIRE_FRAG,
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending, // Additive so overlapping cylinders blend seamlessly
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    const baseH = getHeight(fx, fz);
    mesh.position.set(fx, baseH + height * 0.25, fz);
    mesh.userData = { uniforms };
    group.add(mesh);
  }

  group.visible = false;
  group.userData = { zone };
  return group;
}

// ─── Build terrain ───────────────────────────────────────────────────────
function buildTerrain() {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS
  );
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colorArr = [];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = getHeight(x, z);
    pos.setY(i, h);
    const [cr, cg, cb] = colorForHeight(h);
    colorArr.push(cr, cg, cb);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  return geo;
}

// ─── Fire overlay disc ──────────────────────────────────────────────────
function buildFireOverlay(zone, soft = false) {
  const [r, g, b] = [
    Math.round(zone.color.r * 255),
    Math.round(zone.color.g * 255),
    Math.round(zone.color.b * 255),
  ];
  const scaleFactor = soft ? 2.8 : 1;
  const tex = makeFireOverlayTexture(r, g, b, soft);
  const geo = new THREE.PlaneGeometry(zone.radius * 2 * scaleFactor, zone.radius * 2 * scaleFactor);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: soft ? 0.06 : 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  const avgH = getHeight(zone.cx, zone.cz);
  mesh.position.set(zone.cx, avgH + (soft ? 3.5 : 2.0), zone.cz);
  mesh.visible = false;
  return mesh;
}

// ─── Fire particles ─────────────────────────────────────────────────────
function buildFireParticles(zone, glowTex) {
  const count = zone.particles;
  const positions = new Float32Array(count * 3);
  const opacities = new Float32Array(count);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * zone.radius * 0.85;
    const theta = Math.random() * Math.PI * 2;
    const bx = zone.cx + Math.cos(theta) * r;
    const bz = zone.cz + Math.sin(theta) * r;
    const baseH = getHeight(bx, bz);

    positions[i * 3 + 0] = bx;
    positions[i * 3 + 1] = baseH + Math.random() * 5;
    positions[i * 3 + 2] = bz;

    opacities[i] = Math.random();
    speeds[i] = 0.016 + Math.random() * 0.04;
    offsets[i * 2 + 0] = bx;
    offsets[i * 2 + 1] = bz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(1.0, 0.6, 0.15),
    size: zone.slot === 0 ? 0.35 : zone.slot === 1 ? 0.28 : 0.22,
    map: glowTex,
    transparent: true,
    opacity: zone.slot === 0 ? 0.55 : zone.slot === 1 ? 0.40 : 0.30,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { opacities, speeds, offsets, zone, count };
  points.visible = false;
  return points;
}

// ─── Fire perimeter ring ────────────────────────────────────────────────
function buildPerimeterRing(zone) {
  const segments = 80;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = zone.cx + Math.cos(theta) * zone.radius;
    const z = zone.cz + Math.sin(theta) * zone.radius;
    const y = getHeight(x, z) + 0.9;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: zone.color,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  return line;
}

// ─── Wind arrow grid ────────────────────────────────────────────────────
function buildWindArrows() {
  const group = new THREE.Group();
  const dir = new THREE.Vector3(-1, 0, -1).normalize();
  const spacing = 18;
  const count = 4;
  const half = (count - 1) * spacing / 2;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const x = i * spacing - half;
      const z = j * spacing - half;
      const y = getHeight(x, z) + 1.2; // hug terrain closely
      const arrow = new THREE.ArrowHelper(
        dir, new THREE.Vector3(x, y, z),
        5.0, 0x55bbee, 1.4, 0.7
      );
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.7;
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.7;
      group.add(arrow);
    }
  }
  group.visible = false;
  return group;
}

// ─── Build a quadcopter drone mesh from primitives ───────────────────────
function buildDroneMesh(scale = 1.0) {
  const drone = new THREE.Group();
  const s = scale;

  // ── Materials ──────────────────────────────────────────────────────────
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1c2a36,   // dark anthracite body
    roughness: 0.65,
    metalness: 0.35,
  });
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x263545,
    roughness: 0.6,
    metalness: 0.4,
  });
  const motorMat = new THREE.MeshStandardMaterial({
    color: 0x111518,
    roughness: 0.35,
    metalness: 0.75,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x2e5c7a,   // blue-grey sensor dome
    roughness: 0.45,
    metalness: 0.55,
  });
  const camLensMat = new THREE.MeshStandardMaterial({
    color: 0x080c10,
    roughness: 0.1,
    metalness: 0.9,
  });

  // ── Central body — flat box ────────────────────────────────────────────
  const bodyGeo = new THREE.BoxGeometry(0.60 * s, 0.16 * s, 0.42 * s);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  drone.add(bodyMesh);

  // ── Top dome / obstacle sensor ─────────────────────────────────────────
  const domeGeo = new THREE.SphereGeometry(0.14 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMesh = new THREE.Mesh(domeGeo, accentMat);
  domeMesh.position.set(0, 0.10 * s, 0);
  drone.add(domeMesh);

  // ── Camera gimbal housing — cylinder below nose ────────────────────────
  const gimbalHouseGeo = new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.06 * s, 10);
  const gimbalHouse = new THREE.Mesh(gimbalHouseGeo, motorMat);
  gimbalHouse.position.set(0.23 * s, -0.09 * s, 0);
  drone.add(gimbalHouse);

  // ── Camera lens (dark glossy sphere) ──────────────────────────────────
  const lensGeo = new THREE.SphereGeometry(0.065 * s, 8, 6);
  const lens = new THREE.Mesh(lensGeo, camLensMat);
  lens.position.set(0.27 * s, -0.10 * s, 0);
  drone.add(lens);

  // ── Status LED ─────────────────────────────────────────────────────────
  const ledGeo = new THREE.SphereGeometry(0.018 * s, 5, 4);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(-0.25 * s, 0.09 * s, 0);
  drone.add(led);

  // ── 4 arms + motor mounts + rotors at 45° diagonals ───────────────────
  const armAngles = [45, 135, 225, 315];
  armAngles.forEach((deg) => {
    const rad = (deg * Math.PI) / 180;
    const armReach = 0.52 * s;   // distance from center to motor tip

    const tipX = Math.cos(rad) * armReach;
    const tipZ = Math.sin(rad) * armReach;
    const midX = tipX * 0.5;
    const midZ = tipZ * 0.5;

    // Arm — tapered box pointing from body to tip
    const armGeo = new THREE.BoxGeometry(armReach, 0.055 * s, 0.075 * s);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.y = -rad;
    arm.position.set(midX, 0, midZ);
    arm.castShadow = true;
    drone.add(arm);

    // Motor cylinder at tip
    const motorGeo = new THREE.CylinderGeometry(0.072 * s, 0.072 * s, 0.11 * s, 10);
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(tipX, 0, tipZ);
    drone.add(motor);

    // ── Rotor: actual crossed blade pair + blur disc ──────────────────
    const rotorPivot = new THREE.Group();
    rotorPivot.position.set(tipX, 0.09 * s, tipZ);
    rotorPivot.userData.isRotor = true;
    drone.add(rotorPivot);

    // Two rotor blades (crossed) — thin, dark
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.3,
      metalness: 0.5,
    });
    [0, Math.PI / 2].forEach((bladeRot) => {
      const bladeGeo = new THREE.BoxGeometry(0.38 * s, 0.006 * s, 0.055 * s);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.y = bladeRot;
      rotorPivot.add(blade);
    });

    // Blur disc — semi-transparent flat cylinder simulating motion blur
    const discGeo = new THREE.CylinderGeometry(0.20 * s, 0.20 * s, 0.003 * s, 16);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x8aaabb,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    rotorPivot.add(disc);
  });

  return drone;
}

// ─── Swarm drone group ──────────────────────────────────────────────────
const DRONE_POSITIONS = [
  [-15, -12], [-5, -18], [8, -14], [18, -8],
  [16,   4],  [ 6,  14], [-8,  16], [-18,  6],
];

function buildSwarmGroup() {
  const group = new THREE.Group();

  DRONE_POSITIONS.forEach(([x, z]) => {
    const y = getHeight(x, z) + 4.5;

    // Realistic quadcopter drone — scale 2.5 so it's visible from orbit camera
    const drone = buildDroneMesh(2.5);
    drone.position.set(x, y, z);
    // Slight random yaw per drone
    drone.rotation.y = Math.random() * Math.PI * 2;
    drone.userData.isDrone = true;

    // Invisible hit sphere — makes clicking the drone much easier
    const hitGeo = new THREE.SphereGeometry(3.5, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitSphere = new THREE.Mesh(hitGeo, hitMat);
    hitSphere.userData.isDrone = true;  // raycast will hit this first
    drone.add(hitSphere);               // parented to drone, inherits position

    group.add(drone);

    // Coverage disc on ground — subtle dark scanning area
    const discGeo = new THREE.CircleGeometry(7, 32);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x3a6080,
      transparent: true, opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(x, getHeight(x, z) + 0.2, z);
    group.add(disc);
  });

  group.visible = false;
  return group;
}

// ─── Evac routes ────────────────────────────────────────────────────────
const EVAC_ROUTES = [
  { points: [[-12, -5], [-25, -15], [-38, -28]], color: 0x00cc66, emissive: 0x00ff88 },
  { points: [[0, -8], [10, -25], [25, -38]], color: 0x00cc66, emissive: 0x00ff88 },
  { points: [[5, 10], [15, 22], [20, 35]], color: 0xcc2222, emissive: 0xff3333 },
];

// Sample many points along route, snapping each to terrain height
function sampleTerrainRoute(controlPoints, samples = 60) {
  // First create a rough 2D spline from the control points
  const pts2D = controlPoints.map(([x, z]) => new THREE.Vector2(x, z));
  const result = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    // Interpolate along segments
    const totalSegs = pts2D.length - 1;
    const seg = Math.min(Math.floor(t * totalSegs), totalSegs - 1);
    const localT = (t * totalSegs) - seg;
    const x = pts2D[seg].x + (pts2D[seg + 1].x - pts2D[seg].x) * localT;
    const z = pts2D[seg].y + (pts2D[seg + 1].y - pts2D[seg].y) * localT;
    const y = getHeight(x, z) + 0.35; // hug terrain, just slightly above
    result.push(new THREE.Vector3(x, y, z));
  }
  return result;
}

function buildEvacRoutes() {
  const group = new THREE.Group();

  EVAC_ROUTES.forEach(({ points, color, emissive }) => {
    // Dense terrain-hugging sample points
    const terrainPts = sampleTerrainRoute(points, 80);
    const curve = new THREE.CatmullRomCurve3(terrainPts);
    const tubeGeo = new THREE.TubeGeometry(curve, 80, 0.18, 5, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.6,
      transparent: true, opacity: 0.85,
      depthWrite: false,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tube);
  });

  group.visible = false;
  return group;
}

// ─── Build an air tanker (fixed-wing firefighting aircraft) ──────────────
function buildTankerMesh(scale = 1.0) {
  const tanker = new THREE.Group();
  const s = scale;

  // Materials — solid, realistic, dark military tones
  const fuselageMat = new THREE.MeshStandardMaterial({
    color: 0xc8c8c8,
    roughness: 0.5,
    metalness: 0.4,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xb0b0b0,
    roughness: 0.6,
    metalness: 0.3,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xcc3322,
    roughness: 0.5,
    metalness: 0.2,
  });
  const engineMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.3,
    metalness: 0.7,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.3,
    metalness: 0.6,
  });

  // Fuselage — elongated cylinder
  const fuselageGeo = new THREE.CylinderGeometry(0.18 * s, 0.16 * s, 2.0 * s, 10);
  fuselageGeo.rotateZ(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.castShadow = true;
  tanker.add(fuselage);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(0.18 * s, 0.5 * s, 10);
  noseGeo.rotateZ(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(1.25 * s, 0, 0);
  tanker.add(nose);

  // Tail cone (tapers to rear)
  const tailConeGeo = new THREE.ConeGeometry(0.16 * s, 0.6 * s, 8);
  tailConeGeo.rotateZ(Math.PI / 2);
  const tailCone = new THREE.Mesh(tailConeGeo, fuselageMat);
  tailCone.position.set(-1.3 * s, 0, 0);
  tanker.add(tailCone);

  // Main wings — flat boxes angled back slightly
  const wingGeo = new THREE.BoxGeometry(0.8 * s, 0.03 * s, 1.8 * s);
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.set(0.1 * s, -0.02 * s, 0);
  leftWing.castShadow = true;
  tanker.add(leftWing);

  // Horizontal tail stabilizer
  const hStabGeo = new THREE.BoxGeometry(0.35 * s, 0.02 * s, 0.9 * s);
  const hStab = new THREE.Mesh(hStabGeo, tailMat);
  hStab.position.set(-1.4 * s, 0.05 * s, 0);
  tanker.add(hStab);

  // Vertical tail fin
  const vFinGeo = new THREE.BoxGeometry(0.4 * s, 0.5 * s, 0.03 * s);
  const vFin = new THREE.Mesh(vFinGeo, tailMat);
  vFin.position.set(-1.35 * s, 0.28 * s, 0);
  tanker.add(vFin);

  // Engine nacelles (2, under wings)
  [-0.55, 0.55].forEach((zOff) => {
    const engGeo = new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 0.4 * s, 8);
    engGeo.rotateZ(Math.PI / 2);
    const eng = new THREE.Mesh(engGeo, engineMat);
    eng.position.set(0.15 * s, -0.12 * s, zOff * s);
    tanker.add(eng);

    // Engine intake
    const intakeGeo = new THREE.CylinderGeometry(0.08 * s, 0.07 * s, 0.05 * s, 8);
    intakeGeo.rotateZ(Math.PI / 2);
    const intake = new THREE.Mesh(intakeGeo, noseMat);
    intake.position.set(0.36 * s, -0.12 * s, zOff * s);
    tanker.add(intake);
  });

  // Red belly stripe (retardant tank indicator)
  const bellyGeo = new THREE.BoxGeometry(1.2 * s, 0.04 * s, 0.28 * s);
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xcc2211,
    roughness: 0.5,
    metalness: 0.2,
  });
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, -0.17 * s, 0);
  tanker.add(belly);

  return tanker;
}

// ─── Deploy units ───────────────────────────────────────────────────────
const CREW_POSITIONS  = [[-14, -4], [-8, 2], [2, -10], [-20, 0]];
const TANKER_POSITIONS = [[0, -20], [-20, -20]];

function buildDeployGroup() {
  const group = new THREE.Group();

  CREW_POSITIONS.forEach(([x, z]) => {
    const y = getHeight(x, z);
    // Crew marker — solid orange cone
    const geo = new THREE.ConeGeometry(0.45, 1.2, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xE06820,
      roughness: 0.6,
      metalness: 0.2,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(x, y + 0.6, z);
    cone.castShadow = true;
    group.add(cone);
  });

  TANKER_POSITIONS.forEach(([x, z]) => {
    const y = getHeight(x, z) + 9;
    const tanker = buildTankerMesh(1.2);
    tanker.position.set(x, y, z);
    // Slight bank angle for flying look
    tanker.rotation.y = Math.atan2(z, x) + Math.PI * 0.5;
    tanker.rotation.z = 0.08;
    tanker.userData.isTanker = true;
    group.add(tanker);
  });

  group.visible = false;
  return group;
}

// ─── Subtle grid overlay ────────────────────────────────────────────────
function buildGridOverlay() {
  const grid = new THREE.GridHelper(TERRAIN_SIZE, 24,
    new THREE.Color(0.25, 0.50, 0.75),
    new THREE.Color(0.25, 0.50, 0.75)
  );
  grid.material.transparent = true;
  grid.material.opacity = 0.04;
  grid.material.blending = THREE.AdditiveBlending;
  grid.position.y = 0.6;
  return grid;
}

// ─── Placed units (from context menu) ───────────────────────────────────
function buildPlacedUnits(placedUnits, scene, existingGroup) {
  // Clear previous
  if (existingGroup) {
    existingGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    scene.remove(existingGroup);
  }

  const group = new THREE.Group();

  placedUnits.forEach(u => {
    const x = u.position.x;
    const z = u.position.z;
    const y = getHeight(x, z) || 3;

    if (u.type === 'drone') {
      // Realistic quadcopter
      const drone = buildDroneMesh(2.5);
      drone.position.set(x, y + 3.5, z);
      drone.rotation.y = Math.random() * Math.PI * 2;
      group.add(drone);
    } else if (u.type === 'evac') {
      // Arrow/marker for evac
      const geo = new THREE.ConeGeometry(0.45, 1.2, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3DB87A,
        transparent: true, opacity: 0.88,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.6, z);
      group.add(mesh);
    } else {
      // Crew — cone marker
      const geo = new THREE.ConeGeometry(0.45, 1.2, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xFFB84A,
        transparent: true, opacity: 0.88,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.6, z);
      group.add(mesh);
    }
  });

  scene.add(group);
  return group;
}

// ─── Main component ─────────────────────────────────────────────────────
export default function TerrainScene({
  timeSlot,
  sliderValue,
  onTerrainClick,
  onDroneSelect,
  activeDroneIndex,
  simulationMode,
  activeLayers,
  swarmActive,
  evacActive,
  deployActive,
  placedUnits,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const onDroneSelectRef = useRef(onDroneSelect);
  const activeDroneIndexRef = useRef(activeDroneIndex);
  useEffect(() => { onDroneSelectRef.current = onDroneSelect; }, [onDroneSelect]);
  useEffect(() => { activeDroneIndexRef.current = activeDroneIndex; }, [activeDroneIndex]);

  const handleClick = useCallback((e) => {
    const { renderer, camera, terrain, swarmGroup } = sceneRef.current;
    if (!renderer || !camera || !terrain) return;

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // ── Check drone clicks first (higher priority than terrain) ──────────
    if (swarmGroup && swarmGroup.visible) {
      const droneHits = raycaster.intersectObjects(swarmGroup.children, true);
      for (const hit of droneHits) {
        // Walk up to direct child of swarmGroup
        let obj = hit.object;
        while (obj.parent && obj.parent !== swarmGroup) obj = obj.parent;
        // Only trigger on actual drone meshes (skip coverage discs)
        if (obj.userData.isDrone) {
          const childIdx = swarmGroup.children.indexOf(obj);
          // Children are [drone0, disc0, drone1, disc1, ...] → droneIndex = childIdx/2
          const droneIndex = Math.floor(childIdx / 2);
          onDroneSelect?.(droneIndex);
          return;
        }
      }
    }

    // ── Terrain click fallback ────────────────────────────────────────────
    const hits = raycaster.intersectObject(terrain);
    if (hits.length > 0) {
      const pt = hits[0].point;
      onTerrainClick?.({
        screenX: e.clientX,
        screenY: e.clientY,
        worldPos: { x: pt.x, z: pt.z },
      });
    }
  }, [onTerrainClick, onDroneSelect]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // ── Renderer ────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x060a10, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // ── VR Enter button ─────────────────────────────────────────────
    const vrBtn = VRButton.createButton(renderer);
    Object.assign(vrBtn.style, {
      position: 'absolute', bottom: '14px', right: '14px',
      fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.10em',
      padding: '8px 16px', borderRadius: '6px',
      background: 'rgba(4,6,10,0.80)', color: '#5b9bd5',
      border: '1px solid rgba(91,155,213,0.60)',
      cursor: 'pointer', textTransform: 'uppercase',
    });
    container.style.position = 'relative';
    container.appendChild(vrBtn);

    // ── Scene ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080e18, 0.005);
    scene.background = new THREE.Color(0x060a10);

    // ── Camera ───────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 400);
    camera.position.set(0, CAM_HEIGHT, CAM_RADIUS);
    camera.lookAt(0, 4, 0);

    // ── Lighting ────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x304868, 2.0);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0x88aacc, 1.8);
    dir.position.set(-30, 55, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 200;
    dir.shadow.camera.left = -50;
    dir.shadow.camera.right = 50;
    dir.shadow.camera.top = 50;
    dir.shadow.camera.bottom = -50;
    dir.shadow.bias = -0.001;
    scene.add(dir);

    const rim = new THREE.DirectionalLight(0xddaa66, 0.7);
    rim.position.set(25, 20, -30);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0x445566, 0.5);
    fill.position.set(0, 10, 50);
    scene.add(fill);

    const hemi = new THREE.HemisphereLight(0x445577, 0x1a1a10, 0.6);
    scene.add(hemi);

    // ── Terrain ─────────────────────────────────────────────────────
    const geo = buildTerrain();
    const terrainMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 12,
      specular: new THREE.Color(0x334455),
    });
    const terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    scene.add(buildGridOverlay());

    // ── Fire ────────────────────────────────────────────────────────
    const glowTex = makeGlowTexture();
    const overlays = [];
    const halos = [];
    const particleSystems = [];
    const fireLights = [];
    const fireVolumes = [];

    FIRE_ZONES.forEach((zone) => {
      const overlay = buildFireOverlay(zone, false);
      scene.add(overlay);
      overlays.push(overlay);

      const halo = buildFireOverlay(zone, true);
      scene.add(halo);
      halos.push(halo);

      // Ember particles (small sparks, fewer and subtler)
      const ps = buildFireParticles(zone, glowTex);
      scene.add(ps);
      particleSystems.push(ps);

      // Volumetric fire shader
      const vol = buildFireVolume(zone);
      scene.add(vol);
      fireVolumes.push(vol);

      const light = new THREE.PointLight(new THREE.Color(0.95, 0.4, 0.05), 0, zone.radius * 4, 1.8);
      const lh = getHeight(zone.cx, zone.cz);
      light.position.set(zone.cx, lh + 4, zone.cz);
      scene.add(light);
      fireLights.push(light);
    });

    const perimeterRings = FIRE_ZONES.map((zone) => {
      const ring = buildPerimeterRing(zone);
      scene.add(ring);
      return ring;
    });

    const windArrows = buildWindArrows();
    scene.add(windArrows);

    const swarmGroup = buildSwarmGroup();
    scene.add(swarmGroup);

    const evacRoutes = buildEvacRoutes();
    scene.add(evacRoutes);

    const deployGroup = buildDeployGroup();
    scene.add(deployGroup);

    // ── Store refs ──────────────────────────────────────────────────
    sceneRef.current = {
      renderer, scene, camera, terrain: terrainMesh,
      overlays, halos, particleSystems, fireLights, fireVolumes,
      perimeterRings, windArrows,
      swarmGroup, evacRoutes, deployGroup,
      camAngle: 0,
      placedGroup: null,
      xrDroneIndex: null,
      xrControllers: [],
    };

    // ── XR Controllers (PICO) ────────────────────────────────────────
    const tempMatrix = new THREE.Matrix4();
    const xrRaycaster = new THREE.Raycaster();

    function buildControllerRay() {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0x5b9bd5, transparent: true, opacity: 0.7 });
      const line = new THREE.Line(geo, mat);
      line.scale.z = 30;
      return line;
    }

    [0, 1].forEach((i) => {
      const ctrl = renderer.xr.getController(i);
      ctrl.add(buildControllerRay());
      scene.add(ctrl);
      sceneRef.current.xrControllers.push(ctrl);

      ctrl.addEventListener('selectstart', () => {
        const s = sceneRef.current;
        if (!s.swarmGroup?.visible) {
          s.xrDroneIndex = null;
          onDroneSelectRef.current?.(null);
          return;
        }
        tempMatrix.identity().extractRotation(ctrl.matrixWorld);
        xrRaycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        xrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const hits = xrRaycaster.intersectObjects(s.swarmGroup.children, true);
        for (const hit of hits) {
          let obj = hit.object;
          while (obj.parent && obj.parent !== s.swarmGroup) obj = obj.parent;
          if (obj.userData.isDrone) {
            const childIdx = s.swarmGroup.children.indexOf(obj);
            const droneIndex = Math.floor(childIdx / 2);
            // Toggle: pressing same drone again deselects
            const next = s.xrDroneIndex === droneIndex ? null : droneIndex;
            s.xrDroneIndex = next;
            onDroneSelectRef.current?.(next);
            return;
          }
        }
        // Missed all drones — deselect
        s.xrDroneIndex = null;
        onDroneSelectRef.current?.(null);
      });
    });

    // Show zone 0 immediately
    overlays[0].visible = true;
    halos[0].visible = true;
    particleSystems[0].visible = true;
    fireVolumes[0].visible = true;
    fireLights[0].intensity = 2.5;

    // ── Resize ──────────────────────────────────────────────────────
    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    // ── Animation loop ──────────────────────────────────────────────
    const clock = new THREE.Clock();

    function animate() {
      const dt = clock.getDelta();
      const elapsed = clock.elapsedTime;

      const s = sceneRef.current;
      if (!s.renderer) return;

      // Camera — drone POV or default orbit
      const curDroneIdx = s.xrDroneIndex ?? activeDroneIndexRef.current;
      if (curDroneIdx !== null && curDroneIdx !== undefined && s.swarmGroup?.visible) {
        const droneChildIdx = curDroneIdx * 2; // [drone, disc, drone, disc, ...]
        const droneObj = s.swarmGroup.children[droneChildIdx];
        if (droneObj) {
          const tx = droneObj.position.x;
          const tz = droneObj.position.z;
          const ty = droneObj.position.y + 2; // just above the drone
          // Smoothly lerp camera to drone position
          s.camera.position.x += (tx - s.camera.position.x) * 0.06;
          s.camera.position.y += (ty - s.camera.position.y) * 0.06;
          s.camera.position.z += (tz - s.camera.position.z) * 0.06;
          s.camera.lookAt(-4, 1, 2); // look toward fire center, slightly down
        }
      } else {
        s.camAngle += CAM_SPEED * dt;
        const cx = Math.sin(s.camAngle) * CAM_RADIUS;
        const cz = Math.cos(s.camAngle) * CAM_RADIUS;
        s.camera.position.set(cx, CAM_HEIGHT, cz);
        s.camera.lookAt(0, 4, 0);
      }

      // Animate particles
      s.particleSystems.forEach((ps) => {
        if (!ps.visible) return;
        const { opacities, speeds, offsets, zone, count } = ps.userData;
        const posArr = ps.geometry.attributes.position.array;

        for (let i = 0; i < count; i++) {
          posArr[i * 3 + 1] += speeds[i];
          opacities[i] += speeds[i] * 0.35;

          posArr[i * 3 + 0] += Math.sin(elapsed + i * 0.37) * 0.004;
          posArr[i * 3 + 2] += Math.cos(elapsed + i * 0.53) * 0.004;

          if (opacities[i] > 1.0) {
            opacities[i] = 0;
            const r2 = Math.sqrt(Math.random()) * zone.radius * 0.85;
            const theta2 = Math.random() * Math.PI * 2;
            const nx = zone.cx + Math.cos(theta2) * r2;
            const nz = zone.cz + Math.sin(theta2) * r2;
            posArr[i * 3 + 0] = nx;
            posArr[i * 3 + 2] = nz;
            offsets[i * 2 + 0] = nx;
            offsets[i * 2 + 1] = nz;
            posArr[i * 3 + 1] = getHeight(nx, nz);
          }
        }
        ps.geometry.attributes.position.needsUpdate = true;

        const base = zone.slot === 0 ? 0.85 : zone.slot === 1 ? 0.70 : 0.55;
        ps.material.opacity = base + Math.sin(elapsed * 2.5 + zone.slot) * 0.08;
      });

      // Animate drone rotors + hover bob
      if (s.swarmGroup && s.swarmGroup.visible) {
        s.swarmGroup.children.forEach((child) => {
          if (child.userData.isDrone) {
            // Gentle hover bob
            child.position.y += Math.sin(elapsed * 1.8 + child.position.x * 0.5) * 0.004;
            // Spin each rotor pivot on Y axis (rotorPivot is horizontal plane)
            child.children.forEach((part) => {
              if (part.userData.isRotor) {
                part.rotation.y += 0.22;
              }
            });
          }
        });
      }

      // Animate volumetric fire shaders
      if (s.fireVolumes) {
        s.fireVolumes.forEach((group) => {
          if (!group.visible) return;
          group.children.forEach((mesh) => {
            if (mesh.userData.uniforms) {
              mesh.userData.uniforms.uTime.value = elapsed;
            }
          });
        });
      }

      // Pulse fire lights — subtle warm glow, not blinding
      s.fireLights.forEach((light, idx) => {
        if (light.intensity > 0) {
          const base = 1.6 + idx * 0.2;
          light.intensity = base + Math.sin(elapsed * 2.8 + idx * 1.5) * 0.4;
        }
      });

      // ── XR thumbstick drone flight (PICO controllers) ────────────
      const xrSession = s.renderer.xr.getSession?.();
      if (xrSession && s.xrDroneIndex !== null && s.swarmGroup?.visible) {
        const droneChildIdx = s.xrDroneIndex * 2;
        const droneObj = s.swarmGroup.children[droneChildIdx];
        if (droneObj) {
          const FLY_SPEED = 10 * dt;
          const sources = xrSession.inputSources;
          // Left controller → XZ movement, Right controller → altitude
          if (sources[0]?.gamepad) {
            const ax = sources[0].gamepad.axes[2] ?? 0;
            const az = sources[0].gamepad.axes[3] ?? 0;
            if (Math.abs(ax) > 0.12) droneObj.position.x += ax * FLY_SPEED;
            if (Math.abs(az) > 0.12) droneObj.position.z += az * FLY_SPEED;
          }
          if (sources[1]?.gamepad) {
            const ay = sources[1].gamepad.axes[3] ?? 0;
            if (Math.abs(ay) > 0.12) droneObj.position.y -= ay * FLY_SPEED;
          }
        }
      }

      s.renderer.render(s.scene, s.camera);
    }
    renderer.setAnimationLoop(animate);

    // ── Cleanup ─────────────────────────────────────────────────────
    return () => {
      renderer.setAnimationLoop(null);
      resizeObs.disconnect();
      if (vrBtn.parentNode) vrBtn.parentNode.removeChild(vrBtn);
      geo.dispose();
      terrainMat.dispose();
      glowTex.dispose();
      overlays.forEach((o) => { o.geometry.dispose(); o.material.dispose(); });
      halos.forEach((o) => { o.geometry.dispose(); o.material.dispose(); });
      particleSystems.forEach((ps) => { ps.geometry.dispose(); ps.material.dispose(); });
      fireVolumes.forEach((g) => g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }));
      perimeterRings.forEach((r) => { r.geometry.dispose(); r.material.dispose(); });
      windArrows.traverse((child) => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
      swarmGroup.traverse((child) => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
      evacRoutes.traverse((child) => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
      deployGroup.traverse((child) => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = {};
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Respond to timeSlot ───────────────────────────────────────────────
  useEffect(() => {
    const { overlays, halos, particleSystems, fireLights, fireVolumes } = sceneRef.current;
    if (!overlays) return;

    overlays.forEach((overlay, idx) => {
      const zone = FIRE_ZONES[idx];
      const visible = zone.slot <= timeSlot;
      overlay.visible = visible;
      halos[idx].visible = visible;
      particleSystems[idx].visible = visible;
      if (fireVolumes) fireVolumes[idx].visible = visible;
      fireLights[idx].intensity = visible ? 2.0 : 0;
    });
  }, [timeSlot]);

  // ── Respond to simulationMode ─────────────────────────────────────────
  useEffect(() => {
    const { perimeterRings } = sceneRef.current;
    if (!perimeterRings) return;
    perimeterRings.forEach((ring, idx) => {
      ring.visible = simulationMode && FIRE_ZONES[idx].slot <= timeSlot;
    });
  }, [simulationMode, timeSlot]);

  // ── Respond to activeLayers ───────────────────────────────────────────
  useEffect(() => {
    const { windArrows } = sceneRef.current;
    if (!windArrows) return;
    windArrows.visible = !!(activeLayers?.wind);
  }, [activeLayers]);

  // ── Respond to swarmActive ────────────────────────────────────────────
  useEffect(() => {
    const { swarmGroup } = sceneRef.current;
    if (!swarmGroup) return;
    swarmGroup.visible = !!swarmActive;
  }, [swarmActive]);

  // ── Respond to evacActive ─────────────────────────────────────────────
  useEffect(() => {
    const { evacRoutes } = sceneRef.current;
    if (!evacRoutes) return;
    evacRoutes.visible = !!evacActive;
  }, [evacActive]);

  // ── Respond to deployActive ───────────────────────────────────────────
  useEffect(() => {
    const { deployGroup } = sceneRef.current;
    if (!deployGroup) return;
    deployGroup.visible = !!deployActive;
  }, [deployActive]);

  // ── Respond to placedUnits ────────────────────────────────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s.scene) return;
    s.placedGroup = buildPlacedUnits(placedUnits || [], s.scene, s.placedGroup);
  }, [placedUnits]);

  return (
    <div
      ref={mountRef}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'crosshair',
        background: '#060a10',
        position: 'relative',
      }}
    >
      {activeDroneIndex === null && <SceneOverlay />}
    </div>
  );

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

  function updateDronePatrol(sim) {
    const { drones } = sim;
    for (const d of drones) {
      if (!d.launched) continue;
      d.patrolAngle += 0.008 * sim.speed;
      if (d.dtype === 'scout' || d.dtype === 'recon') {
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.sin(d.patrolAngle * 2) * d.patrolRadius * 0.6;
      } else if (d.dtype === 'mapper' || d.dtype === 'spotter') {
        const row = Math.floor(d.patrolAngle / (Math.PI * 2)) % 8;
        const progress = (d.patrolAngle % (Math.PI * 2)) / (Math.PI * 2);
        const rowDir = row % 2 === 0 ? 1 : -1;
        d.trow = d.patrolCenterRow - d.patrolRadius + (row / 8) * d.patrolRadius * 2;
        d.tcol = d.patrolCenterCol + rowDir * (progress - 0.5) * d.patrolRadius * 2;
      } else if (d.dtype === 'relay') {
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.3) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.3) * d.patrolRadius;
      } else if (d.dtype === 'safety') {
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.7) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.7) * d.patrolRadius;
      } else if (d.dtype === 'reaper') {
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.15) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.15) * d.patrolRadius;
      } else if (d.dtype === 'suppression') {
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.5) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.5) * d.patrolRadius;
      } else {
        d.trow = d.patrolCenterRow + Math.sin(d.patrolAngle * 0.2) * d.patrolRadius;
        d.tcol = d.patrolCenterCol + Math.cos(d.patrolAngle * 0.2) * d.patrolRadius;
      }
    }
  }

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
            sim.events.push({ time: Date.now(), agent:'swarm', msg: `${d.id} (${d.dtype}) THERMAL ALERT \u2014 fire detected! Vectoring fleet.`, t: Date.now() });
            sim.events.push({ time: Date.now(), agent:'overwatch', msg: `INCIDENT DECLARED. 5 AI agents online. Orchestrating response.`, t: Date.now() });
            return true;
          }
        }
      }
    }
    return false;
  }

  function getResponseLevel(acres, ros, fronts, spots, windSpeed) {
    const score = (acres * 0.3) + (ros * 10) + (fronts * 0.1) + (windSpeed * 0.5) + (spots * 5);
    if (score > 120) return 5;
    if (score > 60)  return 4;
    if (score > 25)  return 3;
    if (score > 8)   return 2;
    return 1;
  }

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
    const desiredDrones = Math.min(24, 6 + Math.ceil(acres / 15) + Math.ceil(fronts / 25) + spots * 2);
    if (launchedDrones.length < desiredDrones && stashedDrones.length > 0) {
      const toLaunch = Math.min(stashedDrones.length, desiredDrones - launchedDrones.length);
      for (let i = 0; i < toLaunch; i++) {
        const d = stashedDrones[i];
        d.launched = true;
        d.trow = Math.round(cR + (Math.random() - 0.5) * 40);
        d.tcol = Math.round(cC + (Math.random() - 0.5) * 40);
      }
      addEvent('swarm', `AI_SWARM: Scaling fleet → ${launchedDrones.length + toLaunch}/${drones.length} drones. Fire: ${acres} acres, ${fronts} fronts.`);
    }

    // ── DEPLOY: CONDITION-DRIVEN dispatch (not fixed timers) ──
    // Level 2+: Engines deploy when fire confirmed and actively spreading
    const engines = units.filter(u => u.type === 'engine');
    if (level >= 2 && acres >= 2 && activeFronts.length > 0) {
      const defPos = getDefensePos(activeFronts, engines.length, engines);
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

function Compass() {
  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 14,
      pointerEvents: 'none',
      width: 36, height: 36,
      opacity: 0.5,
    }}>
      <svg viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="16" stroke="rgba(140,160,190,0.15)" strokeWidth="0.8" />
        <circle cx="18" cy="18" r="1.2" fill="rgba(140,160,190,0.35)" />
        <polygon points="18,3.5 16.2,16 18,14 19.8,16" fill="rgba(212,80,50,0.7)" />
        <polygon points="18,32.5 16.2,20 18,22 19.8,20" fill="rgba(140,160,190,0.3)" />
        <text x="18" y="3" textAnchor="middle" fontSize="4.5" fill="rgba(212,80,50,0.6)"
          fontFamily="Inter, sans-serif" fontWeight="600">N</text>
      </svg>
    </div>
  );
}
