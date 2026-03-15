import * as THREE from 'three';
import { TilesRenderer, GlobeControls, Ellipsoid } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import { FireEngine, GRID_ROWS, GRID_COLS, LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX } from './fireEngine.js';
import { FireOverlay } from './fireOverlay.js';
import { FireDrone } from './drone.js';
import { ResponseHelicopter, ResponseAirTanker } from './vehicles.js';

// ============================================================
// CONFIG
// ============================================================
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const PALISADES_LAT = 34.045;
const PALISADES_LNG = -118.529;

// ============================================================
// SCENE
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88bbee);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 1, 1e8
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.HemisphereLight(0x9ec5ff, 0x4a3520, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(50000, 100000, 50000);
scene.add(sun);

// ============================================================
// GOOGLE 3D TILES
// ============================================================
const tiles = new TilesRenderer();
tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_API_KEY }));
tiles.errorTarget = 8;
tiles.loadSiblings = false;
tiles.maxDepth = 20;
tiles.downloadQueue.maxJobs = 4;
tiles.parseQueue.maxJobs = 2;
tiles.setCamera(camera);
tiles.setResolutionFromRenderer(camera, renderer);
scene.add(tiles.group);

let tilesReady = false;

// ============================================================
// GLOBE CONTROLS (kept for tiles integration — disabled for input)
// ============================================================
const controls = new GlobeControls(scene, camera, renderer.domElement, tiles);
controls.enableDamping = true;
controls.dampingFactor = 0.15;
// Immediately disable GlobeControls input — we use our own fly camera
controls.enabled = false;

const ellipsoid = controls.ellipsoid || new Ellipsoid(6378137, 6378137, 6356752.3);

// Position camera over Palisades — tilted view
const latRad = THREE.MathUtils.degToRad(PALISADES_LAT);
const lngRad = THREE.MathUtils.degToRad(PALISADES_LNG);

const camPos = new THREE.Vector3();
ellipsoid.getCartographicToPosition(
  THREE.MathUtils.degToRad(PALISADES_LAT - 0.008), lngRad, 400, camPos
);
camera.position.copy(camPos);

const lookTarget = new THREE.Vector3();
ellipsoid.getCartographicToPosition(
  THREE.MathUtils.degToRad(PALISADES_LAT + 0.003), lngRad, 0, lookTarget
);

const vecEast = new THREE.Vector3();
const vecNorth = new THREE.Vector3();
const vecUp = new THREE.Vector3();
ellipsoid.getEastNorthUpAxes(latRad, lngRad, vecEast, vecNorth, vecUp);

camera.up.copy(vecUp);
camera.lookAt(lookTarget);

// ============================================================
// MINECRAFT CREATIVE MODE FLY CAMERA
// ============================================================
// Yaw/pitch for free-look in map mode (separate from FPV yaw/pitch)
let flyCamYaw = 0;
let flyCamPitch = -0.3; // slight downward tilt initially
const FLY_SENSITIVITY = 0.002;
const FLY_PITCH_MAX = Math.PI * 0.45; // ±81°

// Capture initial yaw from camera look direction
{
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const up = camera.position.clone().normalize();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  ellipsoid.getEastNorthUpAxes(latRad, lngRad, east, north, upAxis);
  // Project look dir onto tangent plane
  const flat = dir.clone().sub(up.clone().multiplyScalar(dir.dot(up)));
  if (flat.length() > 0.001) {
    flat.normalize();
    flyCamYaw = Math.atan2(flat.dot(east), flat.dot(north));
  }
  flyCamPitch = Math.asin(Math.max(-1, Math.min(1, dir.dot(up))));
}

const flyKeys = { w: false, a: false, s: false, d: false, space: false, shift: false };
const FLY_SPEED = 80;       // meters per frame at normal speed
const FLY_SPRINT_MULT = 3;  // shift multiplier

// Pointer lock for map mode free-look (click to grab)
renderer.domElement.addEventListener('click', () => {
  if (!fpvTarget && !fpvZooming && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

// Mouse look in map mode
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (fpvTarget || fpvZooming) return; // FPV has its own mouse handler
  flyCamYaw += e.movementX * FLY_SENSITIVITY;
  flyCamPitch = Math.max(-FLY_PITCH_MAX, Math.min(FLY_PITCH_MAX,
    flyCamPitch - e.movementY * FLY_SENSITIVITY));
});

// WASD + Space + Shift for fly camera
window.addEventListener('keydown', (e) => {
  // Forward tab-switch keys (1/2/3) and Z (strategy panel) to parent
  if (e.key === '1' || e.key === '2' || e.key === '3') {
    try { window.parent.postMessage({ type: 'tab_switch', key: e.key }, '*'); } catch(ex) {}
    if (e.key !== '1') {
      if (document.pointerLockElement) document.exitPointerLock();
    }
    return;
  }
  if (e.key.toLowerCase() === 'z' && !fpvTarget) {
    try { window.parent.postMessage({ type: 'toggle_strategy' }, '*'); } catch(ex) {}
    return;
  }
  if (fpvTarget || fpvZooming) return; // FPV has its own keys
  const k = e.key.toLowerCase();
  if (k === 'w') flyKeys.w = true;
  if (k === 'a') flyKeys.a = true;
  if (k === 's') flyKeys.s = true;
  if (k === 'd') flyKeys.d = true;
  if (k === ' ') { flyKeys.space = true; e.preventDefault(); }
  if (k === 'shift' || e.shiftKey) flyKeys.shift = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w') flyKeys.w = false;
  if (k === 'a') flyKeys.a = false;
  if (k === 's') flyKeys.s = false;
  if (k === 'd') flyKeys.d = false;
  if (k === ' ') flyKeys.space = false;
  if (k === 'shift') flyKeys.shift = false;
});

// Pre-allocated vectors for fly camera (avoids GC pressure every frame)
const _flyCarto = {};
const _flyEast = new THREE.Vector3();
const _flyNorth = new THREE.Vector3();
const _flyUp = new THREE.Vector3();
const _flyFwd = new THREE.Vector3();
const _flyRight = new THREE.Vector3();
const _flyLookDir = new THREE.Vector3();
const _flyTarget = new THREE.Vector3();
const _flyMove = new THREE.Vector3();
const _flyTmp = new THREE.Vector3();

// Pre-allocated vectors for FPV camera follow (avoids GC pressure every frame)
const _fpvUpOffset = new THREE.Vector3();
const _fpvRefRight = new THREE.Vector3();
const _fpvRefFwd2 = new THREE.Vector3();
const _fpvNegFwd = new THREE.Vector3();
const _fpvBaseMat = new THREE.Matrix4();
const _fpvBaseQ = new THREE.Quaternion();
const _fpvYawQ = new THREE.Quaternion();
const _fpvPitchQ = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);

function updateFlyCamera() {
  if (fpvTarget || fpvZooming) return;

  ellipsoid.getPositionToCartographic(camera.position, _flyCarto);
  ellipsoid.getEastNorthUpAxes(_flyCarto.lat, _flyCarto.lon, _flyEast, _flyNorth, _flyUp);

  // Forward direction on tangent plane from yaw
  _flyFwd.copy(_flyNorth).multiplyScalar(Math.cos(flyCamYaw))
    .addScaledVector(_flyEast, Math.sin(flyCamYaw));
  _flyRight.crossVectors(_flyFwd, _flyUp).normalize();

  // Full look direction including pitch
  _flyLookDir.copy(_flyFwd).multiplyScalar(Math.cos(flyCamPitch))
    .addScaledVector(_flyUp, Math.sin(flyCamPitch));

  // Set camera orientation
  _flyTarget.copy(camera.position).addScaledVector(_flyLookDir, 100);
  camera.up.copy(_flyUp);
  camera.lookAt(_flyTarget);

  // Movement — W/S travel in the look direction (including pitch), like Minecraft creative
  const hasWASD = flyKeys.w || flyKeys.a || flyKeys.s || flyKeys.d;
  const speed = FLY_SPEED * (flyKeys.shift && hasWASD ? FLY_SPRINT_MULT : 1);
  _flyMove.set(0, 0, 0);
  if (flyKeys.w) _flyMove.addScaledVector(_flyLookDir, speed);
  if (flyKeys.s) _flyMove.addScaledVector(_flyLookDir, -speed);
  if (flyKeys.d) _flyMove.addScaledVector(_flyRight, speed);
  if (flyKeys.a) _flyMove.addScaledVector(_flyRight, -speed);
  if (flyKeys.space) _flyMove.addScaledVector(_flyUp, speed);
  if (flyKeys.shift && !hasWASD) _flyMove.addScaledVector(_flyUp, -speed);

  if (_flyMove.lengthSq() > 0) {
    camera.position.add(_flyMove);
  }
}

// ============================================================
// FIRE ENGINE + OVERLAY
// ============================================================
const fireEngine = new FireEngine();
const fireOverlay = new FireOverlay(ellipsoid, fireEngine, tiles);
fireOverlay.addToScene(scene);

// ---- Drones (5 total) ----
const drones = [
  new FireDrone(ellipsoid, tiles, 'D-01 SCOUT', 34.040, -118.520),
  new FireDrone(ellipsoid, tiles, 'D-02 SCOUT', 34.048, -118.535),
  new FireDrone(ellipsoid, tiles, 'D-03 SCOUT', 34.035, -118.540),
  new FireDrone(ellipsoid, tiles, 'D-04 SCOUT', 34.052, -118.515),
  new FireDrone(ellipsoid, tiles, 'D-05 SCOUT', 34.042, -118.545),
];
drones.forEach(d => d.addToScene(scene));

// ---- Helicopters (5 total) ----
const helis = [
  new ResponseHelicopter(ellipsoid, tiles, 'HAWK-1', 34.050, -118.540),
  new ResponseHelicopter(ellipsoid, tiles, 'HAWK-2', 34.058, -118.520),
  new ResponseHelicopter(ellipsoid, tiles, 'HAWK-3', 34.038, -118.530),
  new ResponseHelicopter(ellipsoid, tiles, 'HAWK-4', 34.055, -118.545),
  new ResponseHelicopter(ellipsoid, tiles, 'HAWK-5', 34.043, -118.510),
];
helis.forEach(h => h.addToScene(scene));

// ---- Air Tankers (5 total) ----
const tankers = [
  new ResponseAirTanker(ellipsoid, tiles, 'TANKER-10', 34.070, -118.560, 135),
  new ResponseAirTanker(ellipsoid, tiles, 'TANKER-20', 34.065, -118.500, 90),
  new ResponseAirTanker(ellipsoid, tiles, 'TANKER-30', 34.060, -118.545, 45),
  new ResponseAirTanker(ellipsoid, tiles, 'TANKER-40', 34.075, -118.520, 180),
  new ResponseAirTanker(ellipsoid, tiles, 'TANKER-50', 34.068, -118.530, 110),
];
tankers.forEach(t => t.addToScene(scene));

const allVehicles = [...helis, ...tankers];

// Master list of every clickable unit: { vehicle, type }
const allUnits = [
  ...drones.map(d => ({ vehicle: d, type: 'drone' })),
  ...helis.map(h => ({ vehicle: h, type: 'heli' })),
  ...tankers.map(t => ({ vehicle: t, type: 'tanker' })),
];

// ============================================================
// VEHICLE PROXIMITY DETECTION (ray → closest vehicle)
// ============================================================
const HIT_RADIUS_BASE = 35; // base world-unit tolerance (tighter hitbox)
const _proxyRaycaster = new THREE.Raycaster();
const _proxyMouse = new THREE.Vector2();

function findVehicleNearRay(clientX, clientY) {
  _proxyMouse.x = (clientX / window.innerWidth) * 2 - 1;
  _proxyMouse.y = -(clientY / window.innerHeight) * 2 + 1;
  _proxyRaycaster.setFromCamera(_proxyMouse, camera);
  const ray = _proxyRaycaster.ray;

  let closest = null;
  let closestRayDist = Infinity;

  // Check original 3D vehicles
  for (const unit of allUnits) {
    const pos = unit.vehicle.group.position;
    const v = new THREE.Vector3().subVectors(pos, ray.origin);
    const projLen = v.dot(ray.direction);
    if (projLen < 0) continue;
    const closestOnRay = ray.origin.clone().add(ray.direction.clone().multiplyScalar(projLen));
    const perpDist = closestOnRay.distanceTo(pos);
    // Scale hit radius with distance so markers are clickable when zoomed out
    const dist = camera.position.distanceTo(pos);
    const hitR = Math.max(HIT_RADIUS_BASE, HIT_RADIUS_BASE * (dist / 600));
    if (perpDist < hitR && projLen < closestRayDist) {
      closestRayDist = projLen;
      closest = unit;
    }
  }

  // Also check bridge agent sprites (primary click target)
  for (const [id, sprite] of agentSprites) {
    if (!sprite.group.visible) continue;
    const pos = sprite.group.position;
    const v = new THREE.Vector3().subVectors(pos, ray.origin);
    const projLen = v.dot(ray.direction);
    if (projLen < 0) continue;
    const closestOnRay = ray.origin.clone().add(ray.direction.clone().multiplyScalar(projLen));
    const perpDist = closestOnRay.distanceTo(pos);
    const dist = camera.position.distanceTo(pos);
    const hitR = Math.max(HIT_RADIUS_BASE, HIT_RADIUS_BASE * (dist / 600));
    if (perpDist < hitR && projLen < closestRayDist) {
      closestRayDist = projLen;
      closest = {
        vehicle: { id, group: sprite.group, _droneMesh: sprite.mesh, _mesh: sprite.mesh },
        type: sprite.type || 'drone',
        isBridgeSprite: true,
        bridgeId: id,
      };
    }
  }
  return closest;
}

// ============================================================
// HOVER SYSTEM — world-class marker hover with animated glow
// ============================================================
let hoveredUnit = null;
let _hoveredSpriteId = null;  // id of currently hovered bridge sprite
let _hoverT = 0;              // animation time for hover pulse (0 = not hovered)

// Type label map for tooltip
const TYPE_LABELS = {
  drone: 'DRONE', heli: 'HELICOPTER', air: 'AIR TANKER', seat: 'SEAT', lead: 'LEAD PLANE',
  engine: 'ENGINE', tender: 'WATER TENDER', dozer: 'DOZER', hotshot: 'HOTSHOT CREW',
  crew: 'HAND CREW', structeng: 'STRUCTURE ENGINE',
};
const DTYPE_LABELS = {
  scout: 'SCOUT', mapper: 'MAPPER', reaper: 'MQ-9 REAPER', relay: 'COMMS RELAY',
  safety: 'SAFETY OVERWATCH', ignis: 'AERIAL IGNITION', suppression: 'FIRE SUPPRESSION',
};

// Mountable types — only aircraft and drones can be entered via FPV
const MOUNTABLE_TYPES = new Set(['drone', 'heli', 'air', 'seat', 'lead']);
const MOUNTABLE_DTYPES = new Set(['scout', 'mapper', 'relay', 'safety', 'ignis', 'reaper', 'suppression', 'recon', 'spotter', 'ignition']);

function isMountable(type, dtype) {
  if (dtype && MOUNTABLE_DTYPES.has(dtype)) return true;
  if (MOUNTABLE_TYPES.has(type)) return true;
  return false;
}

renderer.domElement.addEventListener('mousemove', (e) => {
  if (fpvTarget || fpvZooming) return;
  // When pointer lock is active, cursor is locked — raycast from screen center
  const hx = document.pointerLockElement ? window.innerWidth / 2 : e.clientX;
  const hy = document.pointerLockElement ? window.innerHeight / 2 : e.clientY;
  const unit = findVehicleNearRay(hx, hy);
  // Clear previous hover
  const newId = unit?.bridgeId || unit?.vehicle?.id || null;
  if (_hoveredSpriteId && _hoveredSpriteId !== newId) {
    const prev = agentSprites.get(_hoveredSpriteId);
    if (prev) prev._hoverAnim = 0;
    _hoveredSpriteId = null;
    _hoverT = 0;
  }

  const hoverInfo = document.getElementById('hover-info');

  if (unit) {
    const id = unit.vehicle.id || unit.bridgeId || 'VEHICLE';
    const spriteEntry = agentSprites.get(id) || agentSprites.get(unit.bridgeId);

    // Set hover animation on the sprite entry
    if (spriteEntry && _hoveredSpriteId !== id) {
      spriteEntry._hoverAnim = 1;
      _hoveredSpriteId = id;
    }

    const typeLabel = DTYPE_LABELS[spriteEntry?.dtype] || TYPE_LABELS[unit.type] || unit.type?.toUpperCase() || 'UNIT';
    const cssColor = spriteEntry ? getCSSColor(spriteEntry.type, spriteEntry.dtype) : '#00e5ff';
    const mountable = isMountable(unit.type, spriteEntry?.dtype);

    renderer.domElement.style.cursor = mountable ? 'pointer' : 'default';

    // Cursor tooltip removed per user preference

    // Corner info panel (bottom-right)
    if (hoverInfo) {
      const actionLine = mountable ? '<div class="hi-action">CLICK TO ENTER FPV</div>' : '';
      hoverInfo.innerHTML = `<div class="hi-id"><span class="hi-color" style="background:${cssColor}"></span>${id}</div><div class="hi-type">${typeLabel}</div>${actionLine}`;
      hoverInfo.style.borderColor = cssColor + '40';
      hoverInfo.style.display = 'block';
    }

    hoveredUnit = unit;
  } else {
    renderer.domElement.style.cursor = '';
    // tooltip removed
    if (hoverInfo) hoverInfo.style.display = 'none';
    hoveredUnit = null;
  }
});

// ============================================================
// FIRST-PERSON VIEW (FPV) SYSTEM
// ============================================================
let fpvTarget = null;        // the vehicle object we're riding
let fpvZooming = false;      // true during zoom-in animation
let fpvSavedPos = null;      // saved camera state for restore
let fpvSavedUp = null;
let fpvSavedLookAt = null;

// Pointer-lock mouse look: yaw/pitch offsets from the vehicle's forward direction
let fpvYaw = 0;              // radians, 0 = looking forward
let fpvPitch = 0;            // radians, 0 = level
const FPV_MOUSE_SENSITIVITY = 0.0012; // radians per pixel of mouse movement
const FPV_PITCH_MAX = Math.PI * 0.4;  // ±72°

// Fixed reference forward captured at FPV start — look direction is independent of vehicle heading
const fpvRefFwd = new THREE.Vector3();
const fpvRefRight = new THREE.Vector3();

// Request pointer lock on click while in FPV
renderer.domElement.addEventListener('click', () => {
  if ((fpvTarget || fpvZooming) && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

// Accumulate mouse deltas while pointer is locked
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (!fpvTarget && !fpvZooming) return;
  fpvYaw -= e.movementX * FPV_MOUSE_SENSITIVITY;
  fpvPitch = Math.max(-FPV_PITCH_MAX, Math.min(FPV_PITCH_MAX,
    fpvPitch - e.movementY * FPV_MOUSE_SENSITIVITY));
});

// When pointer lock is released (ESC or tab away), exit FPV if we're in FPV mode
// In map fly-cam mode, just release the mouse — don't exit anything
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && fpvTarget && !fpvZooming) {
    exitFPV();
  }
});

window.addEventListener('keydown', (e) => {
  // E key to exit FPV
  if (e.key.toLowerCase() === 'e' && (fpvTarget || fpvZooming)) {
    exitFPV();
    return;
  }
});

// Compute surface normal at a world position (points away from earth center)
const _surfaceNormal = new THREE.Vector3();
function getSurfaceNormal(worldPos) {
  return _surfaceNormal.copy(worldPos).normalize();
}

function enterFPV(unit) {
  const vehicle = unit.vehicle;
  const id = vehicle.id || 'VEHICLE';

  // Track bridge sprite under FPV so position updates are paused
  if (unit.isBridgeSprite) {
    fpvBridgeId = unit.bridgeId;
  } else {
    fpvBridgeId = null;
  }

  // Save camera state for restore
  fpvSavedPos = camera.position.clone();
  fpvSavedUp = camera.up.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  fpvSavedLookAt = camera.position.clone().add(dir.multiplyScalar(500));

  // Reset look offsets
  fpvYaw = 0;
  fpvPitch = 0;

  // Capture initial forward direction from vehicle at this moment
  const mesh0 = vehicle._droneMesh || vehicle._mesh;
  const initFwd = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh0.quaternion).normalize();
  const initUp = getSurfaceNormal(vehicle.group.position);
  const initRight = new THREE.Vector3().crossVectors(initFwd, initUp).normalize();
  fpvRefFwd.crossVectors(initUp, initRight).normalize();
  fpvRefRight.copy(initRight);

  // Hide ALL children of the vehicle group so nothing blocks the FPV camera
  vehicle.group.traverse((child) => { child.visible = false; });
  vehicle.group.visible = true; // keep group itself visible so position updates work

  // Show HUD
  const banner = document.getElementById('fpv-banner');
  const exitBtn = document.getElementById('fpv-exit');
  banner.textContent = `FPV — ${id}  [MOUSE TO LOOK · E / ESC TO EXIT]`;
  banner.style.display = '';
  exitBtn.style.display = '';

  // Show command panel
  showCmdPanel(unit);

  // Clear hover state so the ring doesn't persist during FPV
  if (_hoveredSpriteId) {
    const prev = agentSprites.get(_hoveredSpriteId);
    if (prev) { prev._hoverAnim = 0; if (prev._hoverRing) prev._hoverRing.visible = false; }
    _hoveredSpriteId = null;
    _hoverT = 0;
  }
  hoveredUnit = null;
  renderer.domElement.style.cursor = '';

  // Hide normal controls & tooltip
  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.style.display = 'none';
  const hint = document.getElementById('ignite-hint');
  if (hint) hint.style.display = 'none';
  const navHint = document.getElementById('nav-hint');
  if (navHint) navHint.style.display = 'none';

  // ---- Zoom-in animation ----
  fpvZooming = true;
  fpvTarget = null;

  const startPos = camera.position.clone();
  const startUp = camera.up.clone();
  const startLookAt = camera.position.clone().add(dir.clone().normalize().multiplyScalar(200));
  const startTime = performance.now();
  const duration = 1200;

  function zoomAnim() {
    if (!fpvZooming) return;
    const now = performance.now();
    const t = Math.min((now - startTime) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const vPos = vehicle.group.position.clone();
    const mesh = vehicle._droneMesh || vehicle._mesh;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion).normalize();
    // Use surface normal for up — always upright
    const up = getSurfaceNormal(vPos);

    const fpvCamPos = vPos.clone()
      .sub(fwd.clone().multiplyScalar(5))
      .add(up.clone().multiplyScalar(4));
    const fpvLookAt = vPos.clone().add(fwd.clone().multiplyScalar(40));

    camera.position.lerpVectors(startPos, fpvCamPos, ease);
    camera.up.copy(startUp).lerp(up, ease).normalize();
    camera.lookAt(
      new THREE.Vector3().lerpVectors(startLookAt, fpvLookAt, ease)
    );

    if (t < 1) {
      requestAnimationFrame(zoomAnim);
    } else {
      fpvZooming = false;
      fpvTarget = vehicle;
      // Auto-request pointer lock for mouse look
      renderer.domElement.requestPointerLock();
      console.log('[FPV] Zoom complete, now following:', id);
    }
  }

  console.log('[FPV] Zooming to:', id);
  zoomAnim();
}

let _exitingFPV = false;
function exitFPV() {
  if (_exitingFPV) return;
  if (!fpvTarget && !fpvZooming) return;
  _exitingFPV = true;

  const exitVehicle = fpvTarget;
  // Clear fpvTarget FIRST so the render loop stops following
  fpvTarget = null;
  fpvZooming = false;

  // Clear bridge sprite lock — it will resume receiving position updates from 2D
  fpvBridgeId = null;

  // Restore vehicle visibility and position camera above the vehicle
  if (exitVehicle) {
    exitVehicle.group.traverse((child) => { child.visible = true; });
    const vPos = exitVehicle.group.position.clone();
    const up = vPos.clone().normalize();
    // Pull camera back and up from vehicle — slightly behind and above
    camera.position.copy(vPos).add(up.clone().multiplyScalar(200));
    // Restore fly camera yaw/pitch to a nice overview angle
    const carto = {};
    ellipsoid.getPositionToCartographic(vPos, carto);
    const east = new THREE.Vector3(), north = new THREE.Vector3(), upAxis = new THREE.Vector3();
    ellipsoid.getEastNorthUpAxes(carto.lat, carto.lon, east, north, upAxis);
    camera.up.copy(upAxis);
    // Set fly camera to look slightly downward toward the vehicle
    flyCamPitch = -0.25;
    // Keep current yaw (direction we were looking)
  } else if (fpvSavedPos) {
    camera.position.copy(fpvSavedPos);
    if (fpvSavedUp) camera.up.copy(fpvSavedUp);
    if (fpvSavedLookAt) camera.lookAt(fpvSavedLookAt);
  }

  fpvSavedPos = null;
  fpvSavedUp = null;
  fpvSavedLookAt = null;
  fpvYaw = 0;
  fpvPitch = 0;
  fpvManualMode = false;
  manualKeys.w = manualKeys.a = manualKeys.s = manualKeys.d = manualKeys.shift = manualKeys.ctrl = false;
  renderer.domElement.style.cursor = '';

  // Exit pointer lock if still active
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }

  const banner = document.getElementById('fpv-banner');
  const exitBtn = document.getElementById('fpv-exit');
  banner.style.display = 'none';
  exitBtn.style.display = 'none';

  // Hide command panel
  hideCmdPanel();

  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.style.display = '';
  const navHintEl = document.getElementById('nav-hint');
  if (navHintEl) navHintEl.style.display = '';

  console.log('[FPV] Exited first-person view');
  // Clear re-entrancy guard immediately — it only prevents double-calls within the same event
  _exitingFPV = false;
}

document.getElementById('fpv-exit')?.addEventListener('click', () => exitFPV());

// ============================================================
// FPV COMMAND PANEL + MANUAL CONTROL
// ============================================================
let fpvManualMode = false;    // false = agentic, true = manual
let fpvUnitType = null;       // 'drone' | 'heli' | 'tanker' | 'truck'

// Manual control state
const manualKeys = { w: false, a: false, s: false, d: false, shift: false, ctrl: false, space: false };
let manualSpeed = 0;          // 0..1 normalized speed
let manualYawRate = 0;        // current yaw velocity
let manualPitchRate = 0;      // for planes
let manualBankAngle = 0;      // for planes
let manualHeading = 0;        // radians, accumulated yaw
let manualLat = 0;
let manualLng = 0;
let manualAlt = 0;
const _manualNewPos = new THREE.Vector3();

window.addEventListener('keydown', (e) => {
  // Q toggles agentic/manual mode while in FPV
  if (e.key.toLowerCase() === 'q' && fpvTarget) {
    console.log('[MODE] Q pressed → switching to', fpvManualMode ? 'AGENTIC' : 'MANUAL', '| bridgeId:', fpvBridgeId);
    setControlMode(!fpvManualMode);
    return;
  }
  if (!fpvTarget || !fpvManualMode) return;
  const k = e.key.toLowerCase();
  if (k === 'w') { manualKeys.w = true; e.preventDefault(); }
  if (k === 'a') { manualKeys.a = true; e.preventDefault(); }
  if (k === 's') { manualKeys.s = true; e.preventDefault(); }
  if (k === 'd') { manualKeys.d = true; e.preventDefault(); }
  if (k === 'shift' || e.shiftKey) { manualKeys.shift = true; e.preventDefault(); }
  if (k === 'control' || e.ctrlKey) { manualKeys.ctrl = true; e.preventDefault(); }
  if (k === ' ') { manualKeys.space = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w') manualKeys.w = false;
  if (k === 'a') manualKeys.a = false;
  if (k === 's') manualKeys.s = false;
  if (k === 'd') manualKeys.d = false;
  if (k === 'shift') manualKeys.shift = false;
  if (k === 'control') manualKeys.ctrl = false;
  if (k === ' ') manualKeys.space = false;
});

// DOM references for command panel
const cmdPanel = document.getElementById('cmd-panel');
const cmdName = document.getElementById('cmd-name');
const cmdType = document.getElementById('cmd-type');
const cmdDot = document.getElementById('cmd-dot');
const cmdStatus = document.getElementById('cmd-status');
const cmdModeLabel = document.getElementById('cmd-mode-label');
const cmdSpeed = document.getElementById('cmd-speed');
const cmdBtnAgentic = document.getElementById('cmd-btn-agentic');
const cmdBtnManual = document.getElementById('cmd-btn-manual');
const cmdHintHover = document.getElementById('cmd-hint-hover');
const cmdHintPlane = document.getElementById('cmd-hint-plane');
const cmdSpeedBar = document.getElementById('cmd-speed-bar');
const cmdSpeedFill = document.getElementById('cmd-speed-fill');

function getVehicleTypeName(type) {
  const names = {
    drone: 'SURVEILLANCE DRONE', heli: 'FIREHAWK HELICOPTER', tanker: 'AIR TANKER',
    air: 'DC-10 VLAT', seat: 'AT-802 AIR TRACTOR', lead: 'OV-10A LEAD PLANE',
  };
  return names[type] || type?.toUpperCase() || 'VEHICLE';
}

function showCmdPanel(unit) {
  if (!cmdPanel) return; // guard against missing DOM
  const v = unit.vehicle;
  const type = unit.type;
  fpvUnitType = type;
  if (cmdName) cmdName.textContent = v.id || 'UNKNOWN';
  if (cmdType) cmdType.textContent = getVehicleTypeName(type);
  if (cmdDot) cmdDot.className = 'dot';
  if (cmdStatus) { cmdStatus.textContent = 'ACTIVE'; cmdStatus.className = 'cmd-stat-value active'; }
  setControlMode(false); // start in agentic
  cmdPanel.style.display = 'block';

  // Initialize manual position from vehicle's current lat/lng
  if (v._homeLatLng) {
    manualLat = v._homeLatLng.lat;
    manualLng = v._homeLatLng.lng;
    manualAlt = type === 'heli' ? 150 : type === 'tanker' ? 350 : 80;
  } else {
    // Bridge sprite — derive lat/lng from current ECEF position
    const carto = {};
    ellipsoid.getPositionToCartographic(v.group.position, carto);
    manualLat = THREE.MathUtils.radToDeg(carto.latitude || 0);
    manualLng = THREE.MathUtils.radToDeg(carto.longitude || 0);
    manualAlt = carto.height || 80;
  }
  manualSpeed = 0;
  manualHeading = 0;
  manualBankAngle = 0;
}

function hideCmdPanel() {
  if (cmdPanel) cmdPanel.style.display = 'none';
  fpvManualMode = false;
  fpvUnitType = null;
}

// Vehicle types that use plane-style controls
const PLANE_TYPES = new Set(['tanker', 'air', 'seat', 'lead']);

function setControlMode(manual) {
  fpvManualMode = manual;
  const isPlane = PLANE_TYPES.has(fpvUnitType);

  // Update panel header text
  const cmdTitle = document.querySelector('.cmd-card-title');
  if (cmdTitle) {
    cmdTitle.textContent = manual ? 'COMMANDING' : 'SPECTATING';
    cmdTitle.style.color = manual ? '#ff8800' : '#00e5ff';
  }

  if (manual) {
    if (cmdBtnManual) cmdBtnManual.classList.add('selected', 'manual');
    if (cmdBtnAgentic) cmdBtnAgentic.classList.remove('selected');
    if (cmdModeLabel) { cmdModeLabel.textContent = 'MANUAL'; cmdModeLabel.className = 'cmd-stat-value warning'; }
    if (cmdSpeedBar) cmdSpeedBar.style.display = '';
    // Show appropriate hint based on vehicle type
    if (isPlane) {
      if (cmdHintHover) cmdHintHover.style.display = 'none';
      if (cmdHintPlane) cmdHintPlane.style.display = '';
    } else {
      if (cmdHintHover) cmdHintHover.style.display = '';
      if (cmdHintPlane) cmdHintPlane.style.display = 'none';
    }
    // Capture current position for manual control (preserve momentum)
    if (fpvTarget) {
      const carto = {};
      ellipsoid.getPositionToCartographic(fpvTarget.group.position, carto);
      manualLat = THREE.MathUtils.radToDeg(carto.lat);
      manualLng = THREE.MathUtils.radToDeg(carto.lon);
      manualAlt = carto.height || (isPlane ? 350 : fpvUnitType === 'heli' ? 150 : 80);
      // Start at cruising speed matching agentic movement so vehicle doesn't stall
      manualSpeed = isPlane ? 0.8 : 0.7;
      manualBankAngle = 0;
      // Initialize ghost position to current agentic position (will be updated by incoming messages)
      if (fpvBridgeId) {
        const spriteEntry = agentSprites.get(fpvBridgeId);
        if (spriteEntry) {
          spriteEntry._ghostLat = spriteEntry.targetLat;
          spriteEntry._ghostLng = spriteEntry.targetLng;
        }
      }
    }
  } else {
    if (cmdBtnAgentic) cmdBtnAgentic.classList.add('selected');
    if (cmdBtnManual) cmdBtnManual.classList.remove('selected', 'manual');
    if (cmdModeLabel) { cmdModeLabel.textContent = 'AGENTIC'; cmdModeLabel.className = 'cmd-stat-value active'; }
    if (cmdHintHover) cmdHintHover.style.display = 'none';
    if (cmdHintPlane) cmdHintPlane.style.display = 'none';
    if (cmdSpeedBar) cmdSpeedBar.style.display = 'none';
    // Resume agentic movement: apply ghost position if available, otherwise
    // just let the next position update from 2D move it naturally via lerp
    if (fpvBridgeId) {
      const spriteEntry = agentSprites.get(fpvBridgeId);
      if (spriteEntry) {
        if (spriteEntry._ghostLat != null) {
          // Ghost exists — teleport targetPos to where the agent "would have been"
          const ghostType = spriteEntry.type;
          let ghostAlt = 250;
          if (GROUND_TYPES.has(ghostType)) ghostAlt = getTerrainHeight(spriteEntry._ghostLat, spriteEntry._ghostLng) + 10;
          else if (ghostType === 'heli') ghostAlt = getTerrainHeight(spriteEntry._ghostLat, spriteEntry._ghostLng) + 350;
          else if (ghostType === 'air') ghostAlt = 600;
          else if (ghostType === 'seat') ghostAlt = 500;
          else if (ghostType === 'lead') ghostAlt = 550;
          ellipsoid.getCartographicToPosition(
            THREE.MathUtils.degToRad(spriteEntry._ghostLat),
            THREE.MathUtils.degToRad(spriteEntry._ghostLng),
            ghostAlt, _tmpPos
          );
          spriteEntry.targetPos.copy(_tmpPos);
          spriteEntry.targetLat = spriteEntry._ghostLat;
          spriteEntry.targetLng = spriteEntry._ghostLng;
          spriteEntry._ghostLat = null;
          spriteEntry._ghostLng = null;
          console.log('[MODE] Agentic resumed → ghost target applied, vehicle will lerp there');
        } else {
          console.log('[MODE] Agentic resumed → no ghost, waiting for next 2D position update');
        }
      }
    }
  }
}

if (cmdBtnAgentic) cmdBtnAgentic.addEventListener('click', () => setControlMode(false));
if (cmdBtnManual) cmdBtnManual.addEventListener('click', () => setControlMode(true));

// Pre-allocated for getCameraLookNE (called every frame in manual mode)
const _lookCamDir = new THREE.Vector3();
const _lookUp = new THREE.Vector3();
const _lookProjected = new THREE.Vector3();
const _lookCarto = {};
const _lookE = new THREE.Vector3();
const _lookN = new THREE.Vector3();
const _lookU = new THREE.Vector3();
const _lookResult = { north: 0, east: 0 };

// Get camera look direction projected onto local tangent plane as north/east
function getCameraLookNE() {
  _lookCamDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const vPos = fpvTarget.group.position;
  _lookUp.copy(vPos).normalize();
  // Remove radial component to project onto tangent plane
  const dot = _lookCamDir.dot(_lookUp);
  _lookProjected.copy(_lookCamDir).addScaledVector(_lookUp, -dot);
  const len = _lookProjected.length();
  if (len < 0.0001) { _lookResult.north = 0; _lookResult.east = 0; return _lookResult; }
  _lookProjected.divideScalar(len);
  // Decompose into local east/north
  ellipsoid.getPositionToCartographic(vPos, _lookCarto);
  ellipsoid.getEastNorthUpAxes(_lookCarto.lat, _lookCarto.lon, _lookE, _lookN, _lookU);
  _lookResult.north = _lookProjected.dot(_lookN);
  _lookResult.east = _lookProjected.dot(_lookE);
  return _lookResult;
}

// Update manual vehicle position each frame
function updateManualControl(dt) {
  if (!fpvTarget || !fpvManualMode) return;

  const isPlane = PLANE_TYPES.has(fpvUnitType);
  const isHover = !isPlane; // drones, helis — anything not a fixed-wing

  // Camera look direction as north/east on tangent plane
  const look = getCameraLookNE();
  // Perpendicular (strafe) direction: rotate 90° CW
  const strafeN = look.east;
  const strafeE = -look.north;
  const cosLat = Math.max(0.01, Math.cos(THREE.MathUtils.degToRad(manualLat)));

  if (isHover) {
    const accel = 0.012;
    let fwdInput = 0, sideInput = 0;
    if (manualKeys.w) fwdInput = 1;
    if (manualKeys.s) fwdInput = -0.4;
    if (manualKeys.a) sideInput = -1;
    if (manualKeys.d) sideInput = 1;

    // Ascend / descend
    if (manualKeys.space) manualAlt = Math.min(500, manualAlt + 1.5);
    if (manualKeys.shift) manualAlt = Math.max(10, manualAlt - 1.5);

    manualSpeed = fwdInput !== 0
      ? Math.max(-0.4, Math.min(1, manualSpeed + fwdInput * accel))
      : manualSpeed * 0.94;

    // ~4x agentic speed
    const maxSpeed = 0.00018;
    const moveN = look.north * manualSpeed * maxSpeed + strafeN * sideInput * 0.3 * maxSpeed;
    const moveE = look.east * manualSpeed * maxSpeed + strafeE * sideInput * 0.3 * maxSpeed;

    manualLat += moveN;
    manualLng += moveE / cosLat;

    ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(manualLat), THREE.MathUtils.degToRad(manualLng), manualAlt, _manualNewPos
    );
    fpvTarget.group.position.copy(_manualNewPos);

  } else if (isPlane) {
    if (manualKeys.shift) manualSpeed = Math.min(1, manualSpeed + 0.01);
    if (manualKeys.ctrl) manualSpeed = Math.max(0.15, manualSpeed - 0.02);
    if (!manualKeys.shift && !manualKeys.ctrl) manualSpeed = Math.max(0.15, manualSpeed * 0.998);

    if (manualKeys.a) manualBankAngle = Math.min(0.6, manualBankAngle + 0.02);
    else if (manualKeys.d) manualBankAngle = Math.max(-0.6, manualBankAngle - 0.02);
    else manualBankAngle *= 0.94;

    if (manualKeys.w) manualAlt = Math.max(100, manualAlt - 2);
    if (manualKeys.s) manualAlt = Math.min(600, manualAlt + 2);

    // Fly in camera look direction, ~4x agentic speed
    const maxSpeed = 0.00032;
    manualLat += look.north * manualSpeed * maxSpeed;
    manualLng += look.east * manualSpeed * maxSpeed / cosLat;

    ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(manualLat), THREE.MathUtils.degToRad(manualLng), manualAlt, _manualNewPos
    );
    fpvTarget.group.position.copy(_manualNewPos);
  }

  // Update speed display
  const kts = Math.round(Math.abs(manualSpeed) * (isPlane ? 250 : 60));
  if (cmdSpeed) cmdSpeed.textContent = `${kts} kts`;
  if (cmdSpeedFill) cmdSpeedFill.style.width = `${Math.abs(manualSpeed) * 100}%`;
}

// Fire simulation speed: run N engine ticks per real second
const TICKS_PER_SECOND = 6;
let lastFireTick = 0;
let fireRunning = false;

// ============================================================
// CLICK-TO-IGNITE (Raycasting)
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

console.log('[FireSight] Fire engine initialized. Grid:', GRID_ROWS, 'x', GRID_COLS);
console.log('[FireSight] Bounds: lat [' + LAT_MIN + ', ' + LAT_MAX + '] lng [' + LNG_MIN + ', ' + LNG_MAX + ']');

// ---- SINGLE-CLICK: select vehicle for FPV ----
let clickTimer = null;
renderer.domElement.addEventListener('click', (e) => {
  if (fpvTarget || fpvZooming) return;

  // Delay to let dblclick fire first
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    clickTimer = null;
    const cx = document.pointerLockElement ? window.innerWidth / 2 : e.clientX;
    const cy = document.pointerLockElement ? window.innerHeight / 2 : e.clientY;
    const unit = findVehicleNearRay(cx, cy);
    if (unit) {
      const sprite = agentSprites.get(unit.bridgeId || unit.vehicle?.id);
      if (isMountable(unit.type, sprite?.dtype)) enterFPV(unit);
    }
  }, 180);
});

renderer.domElement.addEventListener('dblclick', () => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
});

renderer.domElement.addEventListener('dblclick', (e) => {
  // Block fire ignition while in FPV or zooming into a vehicle
  if (fpvTarget || fpvZooming) return;

  console.log('=== DOUBLE-CLICK ===');

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  let lat, lng;

  // Method 1: Raycast against 3D tiles (most accurate — hits actual terrain surface)
  const tileHits = raycaster.intersectObjects(tiles.group.children, true);
  if (tileHits.length > 0) {
    const pt = tileHits[0].point;
    const carto = {};
    ellipsoid.getPositionToCartographic(pt, carto);
    lat = THREE.MathUtils.radToDeg(carto.lat);
    lng = THREE.MathUtils.radToDeg(carto.lon);
    console.log('  HIT 3D TILES at lat:', lat.toFixed(5), 'lng:', lng.toFixed(5));
  }

  // Method 2: Raycast against overlay mesh (gets UV directly)
  if (lat === undefined) {
    const overlayHits = raycaster.intersectObject(fireOverlay.mesh);
    if (overlayHits.length > 0 && overlayHits[0].uv) {
      const uv = overlayHits[0].uv;
      lat = LAT_MIN + uv.y * (LAT_MAX - LAT_MIN);
      lng = LNG_MIN + uv.x * (LNG_MAX - LNG_MIN);
      console.log('  HIT OVERLAY at lat:', lat.toFixed(5), 'lng:', lng.toFixed(5));
    }
  }

  // Method 3: Fallback to ellipsoid intersection
  if (lat === undefined) {
    const hitPoint = new THREE.Vector3();
    const result = ellipsoid.intersectRay(raycaster.ray, hitPoint);
    if (!result) {
      console.warn('  MISS — ray missed everything');
      return;
    }
    const carto = {};
    ellipsoid.getPositionToCartographic(hitPoint, carto);
    lat = THREE.MathUtils.radToDeg(carto.lat);
    lng = THREE.MathUtils.radToDeg(carto.lon);
    console.log('  HIT ELLIPSOID (fallback) at lat:', lat.toFixed(5), 'lng:', lng.toFixed(5));
  }

  const inBounds = lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
  if (!inBounds) {
    console.warn('  Outside fire grid bounds');
    return;
  }

  const { row, col } = fireEngine.latLngToCell(lat, lng);
  console.log('  grid cell: row=' + row, 'col=' + col,
    'fuel:', fireEngine.fuelType[row * GRID_COLS + col]);

  fireEngine.igniteAtLatLng(lat, lng, 3);
  fireRunning = true;
  updateFireStatus();

  // Notify parent (2D view) to ignite at same location
  try { window.parent.postMessage({ type: 'fire_ignite_from_3d', lat, lng }, '*'); } catch(e) {}

  const hint = document.getElementById('ignite-hint');
  if (hint) hint.style.display = 'none';
  console.log('=== IGNITION DONE ===');
});

function updateFireStatus() {
  const s = document.getElementById('fire-status');
  if (s) {
    let burning = 0, burned = 0;
    for (let i = 0; i < fireEngine.cells.length; i++) {
      if (fireEngine.cells[i] === 1) burning++;
      if (fireEngine.cells[i] === 2) burned++;
    }
    const acres = ((burning + burned) * 80 * 80 / 4047).toFixed(0);
    s.textContent = `FIRE: ${acres} acres | T+${fireEngine.tick}min`;
    s.style.display = burning > 0 ? '' : 'none';
  }
}

// ============================================================
// FLY-TO HELPER
// ============================================================
let flyAnim = null;

function flyTo(lat, lng, alt, duration = 1500) {
  const latR = THREE.MathUtils.degToRad(lat);
  const lngR = THREE.MathUtils.degToRad(lng);

  const target = new THREE.Vector3();
  ellipsoid.getCartographicToPosition(latR, lngR, alt, target);

  // Look at a point slightly south for tilted view
  const ground = new THREE.Vector3();
  ellipsoid.getCartographicToPosition(
    THREE.MathUtils.degToRad(lat + 0.005), lngR, 0, ground
  );

  // Get proper ENU north for this location
  const e = new THREE.Vector3(), n = new THREE.Vector3(), u = new THREE.Vector3();
  ellipsoid.getEastNorthUpAxes(latR, lngR, e, n, u);

  const startP = camera.position.clone();
  const startUp = camera.up.clone();
  const startTime = performance.now();
  if (flyAnim) cancelAnimationFrame(flyAnim);

  function anim() {
    const t = Math.min((performance.now() - startTime) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(startP, target, ease);
    camera.up.copy(startUp).lerp(n, ease).normalize();
    camera.lookAt(ground);
    if (t < 1) {
      flyAnim = requestAnimationFrame(anim);
    } else {
      flyAnim = null;
      // Sync fly camera yaw/pitch from final camera orientation
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const flat = dir.clone().sub(u.clone().multiplyScalar(dir.dot(u)));
      if (flat.length() > 0.001) {
        flat.normalize();
        flyCamYaw = Math.atan2(flat.dot(e), flat.dot(n));
      }
      flyCamPitch = Math.asin(Math.max(-1, Math.min(1, dir.dot(u))));
    }
  }
  anim();
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  const pos = camera.position;
  const dist = pos.length();
  const R = 6378137;
  const lat = THREE.MathUtils.radToDeg(Math.asin(pos.z / dist));
  const lng = THREE.MathUtils.radToDeg(Math.atan2(pos.y, pos.x));
  const alt = Math.max(0, dist - R);

  const coordsEl = document.getElementById('coords');
  if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}° ${lng.toFixed(4)}° ALT ${Math.round(alt)}m`;

  const altLabel = document.getElementById('altitude-label');
  if (altLabel) altLabel.textContent = `${Math.round(alt)}m`;

  const altInd = document.getElementById('altitude-indicator');
  if (altInd) altInd.style.bottom = `${Math.min(alt / 5000, 1) * 100}%`;

  if (!tilesReady && tiles.group.children.length > 0) {
    tilesReady = true;
    const s = document.getElementById('status');
    if (s) s.textContent = 'TILES ACTIVE';
  }
}

// ============================================================
// WEBXR
// ============================================================
const vrButton = document.getElementById('vr-button');
if ('xr' in navigator) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (ok) {
      vrButton.classList.remove('hidden');
      vrButton.addEventListener('click', async () => {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor'],
        });
        renderer.xr.enabled = true;
        renderer.xr.setSession(session);
        vrButton.textContent = 'IN VR';
        session.addEventListener('end', () => {
          renderer.xr.enabled = false;
          vrButton.textContent = 'ENTER VR';
        });
      });
    }
  });
}

// ============================================================
// BUTTONS
// ============================================================
document.getElementById('btn-palisades')?.addEventListener('click', () => flyTo(34.045, -118.529, 400));
document.getElementById('btn-overhead')?.addEventListener('click', () => flyTo(34.045, -118.529, 2000));
document.getElementById('btn-street')?.addEventListener('click', () => flyTo(34.045, -118.529, 30));

const ob = document.getElementById('btn-orbit');
if (ob) ob.style.display = 'none';

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  tiles.setResolutionFromRenderer(camera, renderer);
});

// ============================================================
// RENDER LOOP
// ============================================================
let _frameCount = 0;
renderer.setAnimationLoop((time) => {
  _frameCount++;
  camera.updateMatrixWorld();
  tiles.update();
  updateFlyCamera();
  if (_frameCount % 4 === 0) updateHUD(); // throttle DOM updates

  // Fire overlay — update every other frame for performance
  if (_frameCount % 2 === 0) fireOverlay.update(fireEngine, camera, tiles);

  // Update all drones (skip manual-controlled one)
  drones.forEach(d => {
    if (fpvManualMode && fpvTarget === d) return;
    d.update(fireEngine, camera);
  });

  // Update all response vehicles (skip manual-controlled one)
  allVehicles.forEach(v => {
    if (fpvManualMode && fpvTarget === v) return;
    v.update(fireEngine, camera);
  });

  // Manual vehicle control
  try { updateManualControl(0.016); } catch(err) { console.error('[manual]', err); }

  // ---- FPV camera follow ----
  if (fpvTarget) {
    const vPos = fpvTarget.group.position;
    const up = getSurfaceNormal(vPos);

    // Snap camera position directly to vehicle (no lerp = no lag)
    _fpvUpOffset.copy(up).multiplyScalar(5);
    camera.position.copy(vPos).add(_fpvUpOffset);

    // Build camera orientation from mouse yaw/pitch
    _fpvRefRight.crossVectors(fpvRefFwd, up).normalize();
    _fpvRefFwd2.crossVectors(up, _fpvRefRight).normalize();

    // Base quaternion: orient camera so -Z looks along refFwd, +Y is up
    _fpvNegFwd.copy(_fpvRefFwd2).negate();
    _fpvBaseMat.makeBasis(_fpvRefRight, up, _fpvNegFwd);
    _fpvBaseQ.setFromRotationMatrix(_fpvBaseMat);

    // Yaw and pitch (local camera axes)
    _fpvYawQ.setFromAxisAngle(_yAxis, fpvYaw);
    _fpvPitchQ.setFromAxisAngle(_xAxis, fpvPitch);

    camera.quaternion.copy(_fpvBaseQ).multiply(_fpvYawQ).multiply(_fpvPitchQ);
  }

  renderer.render(scene, camera);
});

console.log('FireSight Drone View — Three.js + Google 3D Tiles + Fire Simulation');
console.log('Double-click anywhere to ignite fire. Controls: Left-drag = pan, Scroll = zoom, Right-drag = tilt/rotate');

// ============================================================
// AGENT SPRITE SYSTEM — receives positions from 2D parent
// Proper meshes: quadcopter drones, helicopters, planes, ground vehicles
// ============================================================
const AGENT_COLORS = {
  engine: 0xFBBF24, tender: 0xF59E0B, structeng: 0x38BDF8,
  dozer: 0xA3E635, hotshot: 0xF97316, crew: 0xFB923C,
  heli: 0xEC4899, air: 0xF472B6, seat: 0xE879F9, lead: 0xD946EF,
  scout: 0x22D3EE, mapper: 0x60A5FA, relay: 0xA78BFA,
  safety: 0x34D399, ignis: 0xF97316, reaper: 0xE2E8F0,
  suppression: 0xF472B6, default: 0x94A3B8,
};
const GROUND_TYPES = new Set(['engine', 'tender', 'dozer', 'hotshot', 'crew', 'structeng']);
const AIR_TYPES = new Set(['heli', 'air', 'seat', 'lead']);
const agentSprites = new Map();
const _tmpPos = new THREE.Vector3();
const allRotors = []; // {mesh, speed} — spun each frame
let bridgeActive = false; // true once first unit_positions arrives
let fpvBridgeId = null; // sprite ID currently under FPV manual control

function getColor(type, dtype) {
  if (dtype && AGENT_COLORS[dtype] !== undefined) return AGENT_COLORS[dtype];
  if (AGENT_COLORS[type] !== undefined) return AGENT_COLORS[type];
  return AGENT_COLORS.default;
}

// ---- Procedural mesh builders ----

function buildQuadcopterMesh(color, s = 3) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });
  const accentMat = new THREE.MeshBasicMaterial({ color });
  // Body
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5*s, 0.12*s, 0.35*s), bodyMat));
  // 4 arms + rotors
  const armLen = 0.5*s, armR = 0.03*s, rotorR = 0.22*s;
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI / 2) + Math.PI / 4;
    const ax = Math.cos(ang) * armLen, az = Math.sin(ang) * armLen;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(armR, armR, armLen, 6), bodyMat);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = ang;
    arm.position.set(ax * 0.5, 0, az * 0.5);
    g.add(arm);
    // Rotor disc
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(rotorR, rotorR, 0.01*s, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    disc.position.set(ax, 0.08*s, az);
    g.add(disc);
    allRotors.push({ mesh: disc, speed: 12 + Math.random() * 4 });
    // Motor
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.04*s, 0.04*s, 0.06*s, 8), accentMat);
    motor.position.set(ax, 0.04*s, az);
    g.add(motor);
  }
  // LED
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03*s, 6, 4), new THREE.MeshBasicMaterial({ color }));
  led.position.set(-0.2*s, 0.08*s, 0);
  g.add(led);
  // Scan beam (downward cone)
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.15*s, 0.8*s, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  );
  beam.position.y = -0.5*s;
  beam.rotation.x = Math.PI;
  g.add(beam);
  return g;
}

function buildHelicopterMesh(color, s = 4) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });
  const accentMat = new THREE.MeshBasicMaterial({ color });
  // Fuselage
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7*s, 0.22*s, 0.3*s), bodyMat));
  // Tail boom
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6*s, 0.08*s, 0.08*s), bodyMat);
  tail.position.set(-0.6*s, 0.05*s, 0);
  g.add(tail);
  // Tail fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02*s, 0.2*s, 0.12*s), accentMat);
  fin.position.set(-0.9*s, 0.15*s, 0);
  g.add(fin);
  // Tail rotor
  const tailRotor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08*s, 0.08*s, 0.01*s, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 })
  );
  tailRotor.rotation.x = Math.PI / 2;
  tailRotor.position.set(-0.9*s, 0.15*s, 0.07*s);
  g.add(tailRotor);
  allRotors.push({ mesh: tailRotor, speed: 18 });
  // Main rotor disc
  const mainRotor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55*s, 0.55*s, 0.01*s, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  mainRotor.position.y = 0.18*s;
  g.add(mainRotor);
  allRotors.push({ mesh: mainRotor, speed: 10 });
  // Skids
  for (const z of [-0.15*s, 0.15*s]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.5*s, 0.02*s, 0.02*s), bodyMat);
    skid.position.set(0, -0.14*s, z);
    g.add(skid);
  }
  // Cockpit glass
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.1*s, 8, 6, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshBasicMaterial({ color: 0x080c10, transparent: true, opacity: 0.7 }));
  glass.position.set(0.3*s, 0.06*s, 0);
  g.add(glass);
  return g;
}

function buildPlaneMesh(color, s = 5) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });
  const accentMat = new THREE.MeshBasicMaterial({ color });
  // Fuselage
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08*s, 0.06*s, 1.0*s, 8), bodyMat));
  g.children[0].rotation.z = Math.PI / 2;
  // Wings
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.15*s, 0.02*s, 1.2*s), accentMat);
  wing.position.set(0.05*s, 0, 0);
  g.add(wing);
  // Tail horizontal stabilizer
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(0.08*s, 0.02*s, 0.4*s), accentMat);
  hstab.position.set(-0.45*s, 0.02*s, 0);
  g.add(hstab);
  // Tail vertical stabilizer
  const vstab = new THREE.Mesh(new THREE.BoxGeometry(0.08*s, 0.18*s, 0.02*s), accentMat);
  vstab.position.set(-0.45*s, 0.1*s, 0);
  g.add(vstab);
  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06*s, 0.15*s, 6), bodyMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.55*s, 0, 0);
  g.add(nose);
  return g;
}

function buildGroundVehicleMesh(color, s = 3) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a2028 });
  // Body
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5*s, 0.2*s, 0.25*s), mat));
  // Cab (slightly raised front)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.2*s, 0.15*s, 0.23*s), darkMat);
  cab.position.set(0.18*s, 0.15*s, 0);
  g.add(cab);
  // Wheels (4)
  for (const [x,z] of [[-0.15, -0.14], [-0.15, 0.14], [0.15, -0.14], [0.15, 0.14]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06*s, 0.06*s, 0.04*s, 8), darkMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x*s, -0.1*s, z*s);
    g.add(w);
  }
  // Light bar on top
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.12*s, 0.03*s, 0.2*s), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
  light.position.set(0.12*s, 0.24*s, 0);
  g.add(light);
  return g;
}

function buildCrewMesh(color, s = 2) {
  const g = new THREE.Group();
  // Glowing sphere representing crew on foot
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.2*s, 10, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  g.add(sphere);
  // Pulsing ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25*s, 0.35*s, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  g.add(ring);
  return g;
}

function buildLabelSprite(id, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.textAlign = 'center';
  ctx.fillText(id.substring(0, 14), 128, 36);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(20, 5, 1);
  sprite.position.set(0, 5, 0);
  return sprite;
}

// ---- 2D-style marker icon sprite (matches the map view shapes) ----
function getMarkerShape(type, dtype) {
  // Match the 2D TerrainScene shapes exactly
  if (type === 'heli') return 'heli_cross';  // rotating cross
  if (type === 'air') return 'plane';         // plane silhouette
  if (type === 'seat' || type === 'lead') return 'plane_small';
  if (type === 'dozer') return 'dozer';       // tracked vehicle
  if (type === 'hotshot' || type === 'crew') return 'crew_ring';
  if (type === 'tender') return 'tank';       // tank rectangle
  if (type === 'engine') return 'engine';     // cab + body
  if (type === 'structeng') return 'house';   // house shape
  if (type === 'drone') {
    if (dtype === 'reaper') return 'reaper';
    if (dtype === 'mapper' || dtype === 'spotter') return 'plane_small';
    if (dtype === 'ignis' || dtype === 'ignition') return 'ignis';
    if (dtype === 'suppression') return 'suppression';
    return 'dot';  // scout, relay, safety — standard dot
  }
  return 'dot';
}

// Exact 2D color map (CSS strings) — must match TerrainScene.jsx DTYPE_COLORS and UTYPE
const CSS_DTYPE_COLORS = { scout:'#22D3EE', mapper:'#60A5FA', relay:'#A78BFA', safety:'#34D399', ignis:'#F97316', reaper:'#E2E8F0', suppression:'#F472B6' };
const CSS_UTYPE_COLORS = { engine:'#FBBF24', tender:'#F59E0B', hotshot:'#F97316', crew:'#FB923C', dozer:'#A3E635', air:'#F472B6', seat:'#E879F9', heli:'#EC4899', lead:'#D946EF', structeng:'#38BDF8' };

function getCSSColor(type, dtype) {
  if (dtype && CSS_DTYPE_COLORS[dtype]) return CSS_DTYPE_COLORS[dtype];
  if (CSS_UTYPE_COLORS[type]) return CSS_UTYPE_COLORS[type];
  return '#94A3B8';
}

// Dashed yellow ring sprite — matches 2D hover highlight
function buildHoverRingSprite() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = 48;
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 1350;
  sprite.visible = false;
  return sprite;
}

function buildMarkerSprite(type, dtype, colorHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const r = 38;
  const c = getCSSColor(type, dtype);
  const shape = getMarkerShape(type, dtype);

  // Dark backdrop disc so icons pop against sky/terrain
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();

  // 2D-style: dark fill with visible stroke
  const fillAlpha = '30'; // dark like 2D (~0.19 opacity)
  const strokeAlpha = '90'; // solid stroke like 2D
  ctx.lineWidth = 3;

  if (shape === 'dot') {
    // Circle — scouts, relays, safety drones
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    // Inner solid dot
    ctx.fillStyle = c + 'AA';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();

  } else if (shape === 'heli_cross') {
    // Circle + cross (helicopter rotor) — matches 2D
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = c + '80';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.8, cy); ctx.lineTo(cx + r * 0.8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx, cy + r * 0.8); ctx.stroke();

  } else if (shape === 'plane' || shape === 'plane_small') {
    // Plane — wings + fuselage + tail
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.lineWidth = shape === 'plane' ? 3.5 : 2.5;
    ctx.strokeStyle = c + 'AA';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.9, cy); ctx.lineTo(cx + r * 0.9, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.3, cy - r * 0.5); ctx.lineTo(cx + r * 0.3, cy - r * 0.5); ctx.stroke();

  } else if (shape === 'reaper') {
    // MQ-9 reaper
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = c + 'AA';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.8, cy); ctx.lineTo(cx + r * 0.8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.25, cy - r * 0.5); ctx.lineTo(cx + r * 0.25, cy - r * 0.5); ctx.stroke();

  } else if (shape === 'ignis') {
    // Ignis drone — fire icon
    ctx.fillStyle = '#F97316' + '25';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#F97316' + '80'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#F97316';
    ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔥', cx, cy);

  } else if (shape === 'suppression') {
    // Suppression drone — circle + water bar
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.fillStyle = '#22D3EE50';
    ctx.fillRect(cx - r * 0.5, cy + r * 0.2, r, r * 0.3);

  } else if (shape === 'dozer') {
    // Dozer — rectangle + tracks
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = c + '70';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy + r * 0.3); ctx.lineTo(cx + r * 0.6, cy + r * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.2); ctx.lineTo(cx + r * 0.6, cy - r * 0.2); ctx.stroke();
    ctx.fillStyle = c + '25';
    ctx.fillRect(cx - r * 0.7, cy + r * 0.3, r * 1.4, r * 0.15);

  } else if (shape === 'crew_ring') {
    // Crew — outer ring + inner dots (like 2D group supervisors)
    ctx.fillStyle = c + '20';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    const crewColor = type === 'hotshot' ? '#F97316' : '#FB923C';
    ctx.fillStyle = crewColor + 'AA';
    for (let ci = 0; ci < 6; ci++) {
      const ang = (ci / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (shape === 'tank') {
    // Water tender — circle + inner rectangle
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.strokeStyle = c + '60'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - r * 0.5, cy - r * 0.3, r, r * 0.6);
    ctx.fillStyle = c + '20'; ctx.fillRect(cx - r * 0.45, cy - r * 0.1, r * 0.9, r * 0.3);

  } else if (shape === 'engine') {
    // Fire engine — circle + cab
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.fillStyle = c + '40';
    ctx.fillRect(cx - r * 0.6, cy - r * 0.3, r * 1.2, r * 0.6);
    ctx.fillStyle = c + '60';
    ctx.fillRect(cx + r * 0.15, cy - r * 0.45, r * 0.4, r * 0.3);

  } else if (shape === 'house') {
    // Structure engine — house icon
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
    ctx.strokeStyle = c + '80'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.4);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.4);
    ctx.lineTo(cx - r * 0.5, cy);
    ctx.closePath(); ctx.stroke();

  } else {
    // Fallback — plain dark circle
    ctx.fillStyle = c + fillAlpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c + strokeAlpha; ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 1300;
  sprite.scale.set(8, 8, 1);
  sprite.position.set(0, 8, 0);
  return sprite;
}

// ---- Sprite creation ----
function buildFallbackSphere(color, s = 5) {
  const g = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.3 * s, 10, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  g.add(sphere);
  // Pulsing ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35 * s, 0.5 * s, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  g.add(ring);
  return g;
}

function createAgentSprite(id, type, dtype) {
  const color = getColor(type, dtype);
  let mesh;
  try {
    if (type === 'drone' || (!GROUND_TYPES.has(type) && !AIR_TYPES.has(type))) {
      mesh = (dtype === 'mapper' || dtype === 'reaper')
        ? buildPlaneMesh(color, dtype === 'reaper' ? 8 : 5)
        : buildQuadcopterMesh(color, 5);
    } else if (type === 'heli') {
      mesh = buildHelicopterMesh(color, 6);
    } else if (AIR_TYPES.has(type)) {
      mesh = buildPlaneMesh(color, type === 'air' ? 8 : 6);
    } else if (type === 'hotshot' || type === 'crew') {
      mesh = buildCrewMesh(color, 4);
    } else {
      mesh = buildGroundVehicleMesh(color, type === 'dozer' ? 6 : 5);
    }
  } catch (e) {
    console.warn('[BRIDGE] Mesh build failed for', id, type, dtype, e.message);
    mesh = buildFallbackSphere(color, 5);
  }

  if (!mesh) mesh = buildFallbackSphere(color, 5);

  // Disable depth test on all materials so sprites render above 3D tiles
  mesh.traverse((child) => {
    if (child.material) {
      child.material.depthTest = false;
      child.material.depthWrite = false;
    }
  });

  const group = new THREE.Group();
  group.renderOrder = 1200; // above fire sprites (1001) and 3D tiles

  // Physical mesh — fixed small scale, not visible from far away
  mesh.scale.setScalar(15);
  group.add(mesh);

  // Marker icon + label — these scale with distance to stay visible from afar
  const marker = buildMarkerSprite(type, dtype, color);
  const label = buildLabelSprite(id, color);
  group.add(marker);
  group.add(label);
  scene.add(group);

  console.log('[BRIDGE] Created sprite:', id, type, dtype);
  const entry = { group, mesh, marker, label, type, dtype, lastUpdate: performance.now(), targetLat: 0, targetLng: 0, targetPos: new THREE.Vector3() };
  agentSprites.set(id, entry);
  return entry;
}

// ---- Terrain height raycasting ----
const _terrainRay = new THREE.Raycaster();
const _terrainDown = new THREE.Vector3();
const _terrainOrigin = new THREE.Vector3();
const _terrainCarto = {};
const terrainHeightCache = new Map(); // 'lat,lng' → {height, time}

function getTerrainHeight(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = terrainHeightCache.get(key);
  if (cached && performance.now() - cached.time < 10000) return cached.height;

  // Raycast from 2000m above straight down
  ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 2000, _terrainOrigin);
  _terrainDown.copy(_terrainOrigin).normalize().negate();
  _terrainRay.set(_terrainOrigin, _terrainDown);
  _terrainRay.far = 3000;
  _terrainRay.firstHitOnly = true;
  const hits = _terrainRay.intersectObjects(tiles.group.children, true);
  let h = 500;
  if (hits.length > 0) {
    ellipsoid.getPositionToCartographic(hits[0].point, _terrainCarto);
    h = Math.max(0, _terrainCarto.height || 0);
  }
  terrainHeightCache.set(key, { height: h, time: performance.now() });
  // Simple eviction: just clear when too large (O(1) instead of O(n log n) sort)
  if (terrainHeightCache.size > 1000) terrainHeightCache.clear();
  return h;
}

// ---- Position update ----
function updateAgentPosition(id, type, dtype, lat, lng, launched) {
  // When in manual mode, track the "ghost" agentic position so we can resume there
  if (fpvBridgeId === id && fpvManualMode) {
    let sprite = agentSprites.get(id);
    if (sprite) {
      sprite._ghostLat = lat;
      sprite._ghostLng = lng;
    }
    return;
  }
  // When fpvBridgeId matches but NOT in manual mode, this is a live agentic update
  if (fpvBridgeId === id) {
    console.log('[MODE] Live agentic position update for FPV vehicle:', id, 'lat:', lat.toFixed(4), 'lng:', lng.toFixed(4));
  }

  let sprite = agentSprites.get(id);
  if (!sprite) sprite = createAgentSprite(id, type, dtype);
  sprite.lastUpdate = performance.now();
  sprite.targetLat = lat;
  sprite.targetLng = lng;

  // Show all agents — dim unlaunched ones instead of hiding
  if (launched === false) {
    sprite.group.visible = true;
    if (sprite.marker.material) sprite.marker.material.opacity = 0.3;
    if (sprite.label.material) sprite.label.material.opacity = 0.3;
    sprite.mesh.visible = false;
  } else {
    sprite.group.visible = true;
    if (sprite.marker.material) sprite.marker.material.opacity = 0.9;
    if (sprite.label.material) sprite.label.material.opacity = 0.9;
    sprite.mesh.visible = true;
  }

  // Determine altitude
  // Altitudes — aircraft fly ABOVE smoke/fire (which tops out ~200m above terrain)
  let alt;
  if (GROUND_TYPES.has(type)) {
    alt = getTerrainHeight(lat, lng) + 10; // sit on terrain
  } else if (type === 'heli') {
    alt = getTerrainHeight(lat, lng) + 350; // above smoke plumes
  } else if (type === 'air') {
    alt = 600; // well above fire
  } else if (type === 'seat') {
    alt = 500;
  } else if (type === 'lead') {
    alt = 550;
  } else {
    // Drones — above smoke
    alt = dtype === 'reaper' ? 700 : dtype === 'mapper' ? 300 : getTerrainHeight(lat, lng) + 250;
  }

  ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), alt, _tmpPos);
  sprite.targetPos.copy(_tmpPos);
  // Snap on first placement (position near origin means never placed)
  if (sprite.group.position.lengthSq() < 1000) {
    sprite.group.position.copy(_tmpPos);
    // Orient immediately
    _spriteUp.copy(sprite.group.position).normalize();
    sprite.mesh.quaternion.setFromUnitVectors(_localUp, _spriteUp);
  }
}

const _localUp = new THREE.Vector3(0, 1, 0);

// ---- Per-frame smooth sprite movement ----
const MARKER_BASE = 14;      // marker sprite base scale
const MARKER_REF_DIST = 500; // distance at which marker is at base scale
const LABEL_BASE_X = 20;     // label sprite base scale X
const LABEL_BASE_Y = 5;      // label sprite base scale Y

const _spriteUp = new THREE.Vector3();
function lerpSpritesFrame() {
  const now = performance.now();
  for (const [id, sprite] of agentSprites) {
    if (!sprite.group.visible || sprite.targetPos.lengthSq() < 1000) continue;
    // Skip lerp for sprite under manual FPV control — updateManualControl handles it
    if (fpvManualMode && fpvBridgeId === id) continue;
    sprite.group.position.lerp(sprite.targetPos, 0.08);
    // Orient mesh so local Y points away from earth center
    _spriteUp.copy(sprite.group.position).normalize();
    sprite.mesh.quaternion.setFromUnitVectors(_localUp, _spriteUp);

    // Distance-based scaling for marker + label only (mesh stays fixed)
    const dist = camera.position.distanceTo(sprite.group.position);
    let mScale = Math.max(MARKER_BASE, MARKER_BASE * (dist / MARKER_REF_DIST));

    // Hover animation — enlarged dot + dashed yellow ring (matches 2D)
    const hovered = sprite._hoverAnim === 1;
    if (hovered) {
      mScale *= 1.5; // enlarge dot on hover
      if (sprite.marker.material) sprite.marker.material.opacity = 1.0;
      // Show hover ring
      if (!sprite._hoverRing) {
        sprite._hoverRing = buildHoverRingSprite();
        sprite.group.add(sprite._hoverRing);
      }
      sprite._hoverRing.visible = true;
      const ringScale = mScale * 1.6;
      // Rotate the ring slowly for a dashed-line animation feel
      sprite._hoverRing.material.rotation = now * 0.002;
      sprite._hoverRing.scale.set(ringScale, ringScale, 1);
      sprite._hoverRing.position.set(0, mScale * 0.9, 0);
    } else {
      if (sprite.marker.material) sprite.marker.material.opacity = 1.0;
      if (sprite._hoverRing) sprite._hoverRing.visible = false;
    }

    sprite.marker.scale.set(mScale, mScale, 1);
    sprite.marker.position.set(0, mScale * 0.9, 0);

    // Label — show brighter on hover
    const lScale = Math.max(1, dist / MARKER_REF_DIST);
    sprite.label.scale.set(LABEL_BASE_X * lScale, LABEL_BASE_Y * lScale, 1);
    sprite.label.position.set(0, mScale * 0.9 + LABEL_BASE_Y * lScale * 0.6, 0);
    if (sprite.label.material) sprite.label.material.opacity = hovered ? 1.0 : 0.8;
  }

  // Scale static markers (ICP, field entities) with distance — same size as agent markers
  for (const [, entry] of staticMarkers) {
    const dist = camera.position.distanceTo(entry.sprite.position);
    const s = Math.max(MARKER_BASE, MARKER_BASE * (dist / MARKER_REF_DIST));
    entry.sprite.scale.set(s, s, 1);
  }
}

// ---- Static markers (ICP personnel, field entities) ----
const staticMarkers = new Map();
const _staticMarkerPos = new THREE.Vector3();

let _staticRenderOrder = 1350;
function buildStaticMarkerSprite(label, colorCSS, category) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = 70;
  const pad = 8; // shadow padding

  // Helper: draw shadow behind the exact same path
  function shapeShadow(drawPath) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = pad * 2;
    ctx.lineJoin = 'round';
    drawPath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = colorCSS;
  ctx.lineWidth = 5;

  if (category === 'ai') {
    const hexPath = () => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; i === 0 ? ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); };
    shapeShadow(hexPath);
    hexPath(); ctx.fillStyle = colorCSS + '60'; ctx.fill(); ctx.stroke();
  } else if (category === 'sensor') {
    const diaPath = () => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); };
    shapeShadow(diaPath);
    diaPath(); ctx.fillStyle = colorCSS + '55'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = colorCSS + '80'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(cx, cy, r + 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  } else if (category === 'drone_ctrl') {
    const triPath = () => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.6); ctx.lineTo(cx - r, cy + r * 0.6); ctx.closePath(); };
    shapeShadow(triPath);
    triPath(); ctx.fillStyle = colorCSS + '55'; ctx.fill(); ctx.stroke();
  } else if (category === 'group') {
    const cirPath = () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); };
    shapeShadow(cirPath);
    cirPath(); ctx.fillStyle = colorCSS + '50'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = colorCSS + 'EE'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  } else if (category === 'icp') {
    const icpPath = () => { ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); };
    shapeShadow(icpPath);
    icpPath(); ctx.fillStyle = colorCSS + '80'; ctx.fill(); ctx.strokeStyle = colorCSS; ctx.stroke();
  } else if (category === 'airborne') {
    const airPath = () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); };
    shapeShadow(airPath);
    airPath(); ctx.fillStyle = colorCSS + '45'; ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = colorCSS + 'BB';
    ctx.beginPath(); ctx.moveTo(cx - r * 1.2, cy); ctx.lineTo(cx + r * 1.2, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke();
  } else {
    const h = r * 0.85;
    const sqPath = () => { ctx.beginPath(); ctx.rect(cx - h, cy - h, h * 2, h * 2); };
    shapeShadow(sqPath);
    sqPath(); ctx.fillStyle = colorCSS + '55'; ctx.fill(); ctx.strokeStyle = colorCSS; ctx.stroke();
  }

  // Label text with shadow
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, cx + 1, cy + r + 25);
  ctx.fillStyle = colorCSS;
  ctx.fillText(label, cx, cy + r + 24);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1.0, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = _staticRenderOrder++; // unique per sprite — prevents z-fighting
  return sprite;
}

function updateStaticMarker(id, label, name, colorCSS, category, lat, lng) {
  let entry = staticMarkers.get(id);
  if (!entry) {
    const sprite = buildStaticMarkerSprite(label, colorCSS, category);
    scene.add(sprite);
    entry = { sprite, label, name, colorCSS, category, lastUpdate: 0 };
    staticMarkers.set(id, entry);
  }
  entry.lastUpdate = performance.now();

  // Position on globe — well above terrain to prevent z-fighting flicker
  const alt = category === 'airborne' ? 500 : category === 'ai' ? 250 : 200;
  ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), alt, _staticMarkerPos);
  entry.sprite.position.copy(_staticMarkerPos);
}

// ---- Stale sprite cleanup ----
function cleanStaleSprites() {
  const now = performance.now();
  for (const [id, sprite] of agentSprites) {
    if (now - sprite.lastUpdate > 5000) {
      scene.remove(sprite.group);
      agentSprites.delete(id);
    }
  }
}

// ---- Hide original 3D vehicles once bridge is active ----
function hideOriginalVehicles() {
  drones.forEach(d => { d.group.visible = false; });
  allVehicles.forEach(v => { v.group.visible = false; });
}

// ---- Spin all rotors each frame ----
function updateRotors(dt) {
  for (const r of allRotors) {
    r.mesh.rotation.y += r.speed * dt;
  }
}

// ============================================================
// POSTMESSAGE BRIDGE — communication with parent (2D/App.jsx)
// ============================================================
window.addEventListener('message', (ev) => {
  if (!ev.data) return;
  if (ev.data.type === 'unit_positions') {
    console.log('[BRIDGE] Got unit_positions:', (ev.data.drones||[]).length, 'drones,', (ev.data.units||[]).length, 'units');
  }

  // Auto pointer-lock when switching to 3D tab
  if (ev.data.type === 'request_pointer_lock') {
    if (!fpvTarget && !fpvZooming && document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock().catch(() => {});
    }
  }

  // Fire ignition from 2D view
  if (ev.data.type === 'fire_ignite' && ev.data.lat != null && ev.data.lng != null) {
    const lat = ev.data.lat, lng = ev.data.lng;
    console.log('[BRIDGE] fire_ignite received, lat:', lat, 'lng:', lng, 'bounds:', LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX);
    if (lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX) {
      fireEngine.igniteAtLatLng(lat, lng, 3);
      fireRunning = true;
      updateFireStatus();
      const hint = document.getElementById('ignite-hint');
      if (hint) hint.style.display = 'none';
      console.log('[BRIDGE] Fire ignited from 2D at', lat.toFixed(4), lng.toFixed(4));
    } else {
      console.warn('[BRIDGE] fire_ignite OUT OF BOUNDS:', lat, lng);
    }
  }

  // Unit positions from 2D view — create/update all agent sprites
  if (ev.data.type === 'unit_positions') {
    if (!bridgeActive) {
      bridgeActive = true;
      hideOriginalVehicles();
      console.log('[BRIDGE] First unit_positions received — bridge activated');
    }
    const { drones: droneData, units: unitData } = ev.data;
    if (droneData) {
      for (const d of droneData) {
        updateAgentPosition(d.id, 'drone', d.dtype, d.lat, d.lng, d.launched);
      }
    }
    if (unitData) {
      for (const u of unitData) {
        // Never skip the FPV vehicle — it needs position updates for agentic mode
        if (u.atHome && u.id !== fpvBridgeId) continue;
        updateAgentPosition(u.id, u.type, null, u.lat, u.lng, true);
      }
    }
    // ICP personnel (incident commander, safety, chiefs, etc.)
    if (ev.data.icpUnits) {
      for (const p of ev.data.icpUnits) {
        updateStaticMarker(p.id, p.label, p.name, p.color, p.category, p.lat, p.lng);
      }
    }
    // Field entities (branch directors, sensors, AI agents, groups)
    if (ev.data.fieldUnits) {
      for (const fe of ev.data.fieldUnits) {
        updateStaticMarker(fe.id, fe.label, fe.name, fe.color, fe.category, fe.lat, fe.lng);
      }
    }
  }

  // Remote FPV enter from 2D map click
  if (ev.data.type === 'enter_fpv' && ev.data.vehicleId) {
    const id = ev.data.vehicleId;
    console.log('[BRIDGE] enter_fpv requested for', id);
    const sprite = agentSprites.get(id);
    if (sprite && !fpvTarget && !fpvZooming) {
      const fakeUnit = {
        vehicle: { id, group: sprite.group, _droneMesh: sprite.mesh, _mesh: sprite.mesh },
        type: sprite.type || 'drone',
        isBridgeSprite: true,
        bridgeId: id,
      };
      enterFPV(fakeUnit);
    }
  }
});

// Periodic cleanup
setInterval(cleanStaleSprites, 3000);

// Fire simulation via setInterval (runs even when iframe is hidden)
setInterval(() => {
  if (fireRunning) {
    fireEngine.step();
    updateFireStatus();
  }
}, 1000 / TICKS_PER_SECOND);

// ---- Inject rotor animation into the existing render loop ----
// We patch the existing setAnimationLoop by adding rotor updates
const _origSetAnimationLoop = renderer.setAnimationLoop;
let _lastRotorTime = 0;
const _origLoop = renderer.getAnimationLoop && renderer.getAnimationLoop();
// Instead, we hook into the RAF-based tick by overriding requestAnimationFrame call
// Simpler: use a separate rAF loop for rotors
(function spinRotors() {
  const now = performance.now();
  const dt = Math.min((now - (_lastRotorTime || now)) / 1000, 0.1);
  _lastRotorTime = now;
  updateRotors(dt);
  lerpSpritesFrame();
  requestAnimationFrame(spinRotors);
})();
