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
tiles.errorTarget = 6;
tiles.loadSiblings = false;
tiles.setCamera(camera);
tiles.setResolutionFromRenderer(camera, renderer);
scene.add(tiles.group);

let tilesReady = false;

// ============================================================
// GLOBE CONTROLS
// ============================================================
const controls = new GlobeControls(scene, camera, renderer.domElement, tiles);
controls.enableDamping = true;
controls.dampingFactor = 0.15;

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

camera.up.copy(vecNorth);
camera.lookAt(lookTarget);

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
const HIT_RADIUS = 80; // world-unit tolerance around each vehicle
const _proxyRaycaster = new THREE.Raycaster();
const _proxyMouse = new THREE.Vector2();

function findVehicleNearRay(clientX, clientY) {
  _proxyMouse.x = (clientX / window.innerWidth) * 2 - 1;
  _proxyMouse.y = -(clientY / window.innerHeight) * 2 + 1;
  _proxyRaycaster.setFromCamera(_proxyMouse, camera);
  const ray = _proxyRaycaster.ray;

  let closest = null;
  let closestRayDist = Infinity;

  for (const unit of allUnits) {
    const pos = unit.vehicle.group.position;
    // Distance from the ray line to the vehicle position
    const v = new THREE.Vector3().subVectors(pos, ray.origin);
    const projLen = v.dot(ray.direction);
    if (projLen < 0) continue; // behind camera
    const closestOnRay = ray.origin.clone().add(ray.direction.clone().multiplyScalar(projLen));
    const perpDist = closestOnRay.distanceTo(pos);

    if (perpDist < HIT_RADIUS && projLen < closestRayDist) {
      closestRayDist = projLen;
      closest = unit;
    }
  }
  return closest;
}

// ============================================================
// HOVER CURSOR
// ============================================================
let hoveredUnit = null;
renderer.domElement.addEventListener('mousemove', (e) => {
  if (fpvTarget || fpvZooming) return;
  const unit = findVehicleNearRay(e.clientX, e.clientY);
  if (unit) {
    renderer.domElement.style.cursor = 'pointer';
    // Show tooltip
    const tooltip = document.getElementById('vehicle-tooltip');
    if (tooltip) {
      const id = unit.vehicle.id || 'VEHICLE';
      tooltip.textContent = id + '  [CLICK FOR FPV]';
      tooltip.style.left = e.clientX + 14 + 'px';
      tooltip.style.top = e.clientY - 10 + 'px';
      tooltip.style.display = '';
    }
    hoveredUnit = unit;
  } else {
    renderer.domElement.style.cursor = '';
    const tooltip = document.getElementById('vehicle-tooltip');
    if (tooltip) tooltip.style.display = 'none';
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

// When pointer lock is released (ESC or tab away), exit FPV
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && (fpvTarget || fpvZooming)) {
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
function getSurfaceNormal(worldPos) {
  return worldPos.clone().normalize();
}

function enterFPV(unit) {
  const vehicle = unit.vehicle;
  const id = vehicle.id || 'VEHICLE';

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

  // Disable globe controls during animation + FPV
  controls.enabled = false;

  // Show HUD
  const banner = document.getElementById('fpv-banner');
  const exitBtn = document.getElementById('fpv-exit');
  banner.textContent = `FPV — ${id}  [MOUSE TO LOOK · E / ESC TO EXIT]`;
  banner.style.display = '';
  exitBtn.style.display = '';

  // Show command panel
  showCmdPanel(unit);

  // Hide normal controls & tooltip
  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.style.display = 'none';
  const hint = document.getElementById('ignite-hint');
  if (hint) hint.style.display = 'none';
  const tooltip = document.getElementById('vehicle-tooltip');
  if (tooltip) tooltip.style.display = 'none';

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

function exitFPV() {
  if (!fpvTarget && !fpvZooming) return;

  const exitVehicle = fpvTarget;
  // Clear fpvTarget FIRST so the render loop stops following
  fpvTarget = null;
  fpvZooming = false;

  // Restore vehicle visibility
  if (exitVehicle) {
    exitVehicle.group.traverse((child) => { child.visible = true; });
    const vPos = exitVehicle.group.position.clone();
    const up = vPos.clone().normalize();
    // Pull camera back and up from vehicle position
    camera.position.copy(vPos).add(up.clone().multiplyScalar(300));
    camera.up.copy(up);
    camera.lookAt(vPos);
    // Set controls target to the vehicle's ground position
    controls.target.copy(vPos);
  } else if (fpvSavedPos) {
    camera.position.copy(fpvSavedPos);
    if (fpvSavedUp) camera.up.copy(fpvSavedUp);
    if (fpvSavedLookAt) camera.lookAt(fpvSavedLookAt);
  }

  controls.enabled = true;
  fpvSavedPos = null;
  fpvSavedUp = null;
  fpvSavedLookAt = null;
  fpvYaw = 0;
  fpvPitch = 0;
  fpvManualMode = false;
  manualKeys.w = manualKeys.a = manualKeys.s = manualKeys.d = manualKeys.shift = manualKeys.ctrl = false;
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  renderer.domElement.style.cursor = '';

  const banner = document.getElementById('fpv-banner');
  const exitBtn = document.getElementById('fpv-exit');
  banner.style.display = 'none';
  exitBtn.style.display = 'none';

  // Hide command panel
  hideCmdPanel();

  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.style.display = '';

  console.log('[FPV] Exited first-person view');
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

window.addEventListener('keydown', (e) => {
  // Q toggles agentic/manual mode while in FPV
  if (e.key.toLowerCase() === 'q' && fpvTarget) {
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
  return { drone: 'SURVEILLANCE DRONE', heli: 'FIREHAWK HELICOPTER', tanker: 'AIR TANKER' }[type] || 'VEHICLE';
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
  if (type === 'drone') {
    manualLat = v._homeLatLng.lat;
    manualLng = v._homeLatLng.lng;
    manualAlt = 80;
  } else if (type === 'heli') {
    manualLat = v._homeLatLng.lat;
    manualLng = v._homeLatLng.lng;
    manualAlt = 150;
  } else if (type === 'tanker') {
    manualLat = v._homeLatLng.lat;
    manualLng = v._homeLatLng.lng;
    manualAlt = 350;
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

function setControlMode(manual) {
  fpvManualMode = manual;
  if (manual) {
    if (cmdBtnManual) cmdBtnManual.classList.add('selected', 'manual');
    if (cmdBtnAgentic) cmdBtnAgentic.classList.remove('selected');
    if (cmdModeLabel) { cmdModeLabel.textContent = 'MANUAL'; cmdModeLabel.className = 'cmd-stat-value warning'; }
    if (cmdSpeedBar) cmdSpeedBar.style.display = '';
    // Show appropriate hint based on vehicle type
    if (fpvUnitType === 'tanker') {
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
      manualAlt = carto.height || (fpvUnitType === 'tanker' ? 350 : fpvUnitType === 'heli' ? 150 : 80);
      // Start at cruising speed matching agentic movement so vehicle doesn't stall
      if (manualSpeed === 0) {
        manualSpeed = fpvUnitType === 'tanker' ? 0.6 : 0.5;
      }
      manualBankAngle = 0;
    }
  } else {
    if (cmdBtnAgentic) cmdBtnAgentic.classList.add('selected');
    if (cmdBtnManual) cmdBtnManual.classList.remove('selected', 'manual');
    if (cmdModeLabel) { cmdModeLabel.textContent = 'AGENTIC'; cmdModeLabel.className = 'cmd-stat-value active'; }
    if (cmdHintHover) cmdHintHover.style.display = 'none';
    if (cmdHintPlane) cmdHintPlane.style.display = 'none';
    if (cmdSpeedBar) cmdSpeedBar.style.display = 'none';
  }
}

if (cmdBtnAgentic) cmdBtnAgentic.addEventListener('click', () => setControlMode(false));
if (cmdBtnManual) cmdBtnManual.addEventListener('click', () => setControlMode(true));

// Get camera look direction projected onto local tangent plane as north/east
function getCameraLookNE() {
  const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const vPos = fpvTarget.group.position;
  const up = vPos.clone().normalize();
  // Remove radial component to project onto tangent plane
  const projected = camDir.clone().sub(up.clone().multiplyScalar(camDir.dot(up)));
  const len = projected.length();
  if (len < 0.0001) return { north: 0, east: 0 };
  projected.divideScalar(len);
  // Decompose into local east/north
  const carto = {};
  ellipsoid.getPositionToCartographic(vPos, carto);
  const e = new THREE.Vector3(), n = new THREE.Vector3(), u = new THREE.Vector3();
  ellipsoid.getEastNorthUpAxes(carto.lat, carto.lon, e, n, u);
  return { north: projected.dot(n), east: projected.dot(e) };
}

// Update manual vehicle position each frame
function updateManualControl(dt) {
  if (!fpvTarget || !fpvManualMode) return;

  const isPlane = fpvUnitType === 'tanker';
  const isHover = fpvUnitType === 'drone' || fpvUnitType === 'heli';

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

    // ~2x agentic speed
    const maxSpeed = 0.0001;
    const moveN = look.north * manualSpeed * maxSpeed + strafeN * sideInput * 0.3 * maxSpeed;
    const moveE = look.east * manualSpeed * maxSpeed + strafeE * sideInput * 0.3 * maxSpeed;

    manualLat += moveN;
    manualLng += moveE / cosLat;

    const newPos = new THREE.Vector3();
    ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(manualLat), THREE.MathUtils.degToRad(manualLng), manualAlt, newPos
    );
    fpvTarget.group.position.copy(newPos);

  } else if (isPlane) {
    if (manualKeys.shift) manualSpeed = Math.min(1, manualSpeed + 0.01);
    if (manualKeys.ctrl) manualSpeed = Math.max(0.15, manualSpeed - 0.02);
    if (!manualKeys.shift && !manualKeys.ctrl) manualSpeed = Math.max(0.15, manualSpeed * 0.998);

    if (manualKeys.a) manualBankAngle = Math.min(0.6, manualBankAngle + 0.02);
    else if (manualKeys.d) manualBankAngle = Math.max(-0.6, manualBankAngle - 0.02);
    else manualBankAngle *= 0.94;

    if (manualKeys.w) manualAlt = Math.max(100, manualAlt - 2);
    if (manualKeys.s) manualAlt = Math.min(600, manualAlt + 2);

    // Fly in camera look direction, ~2x agentic speed
    const maxSpeed = 0.00018;
    manualLat += look.north * manualSpeed * maxSpeed;
    manualLng += look.east * manualSpeed * maxSpeed / cosLat;

    const newPos = new THREE.Vector3();
    ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(manualLat), THREE.MathUtils.degToRad(manualLng), manualAlt, newPos
    );
    fpvTarget.group.position.copy(newPos);
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
    const unit = findVehicleNearRay(e.clientX, e.clientY);
    if (unit) enterFPV(unit);
  }, 280);
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
    if (t < 1) flyAnim = requestAnimationFrame(anim);
    else flyAnim = null;
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
renderer.setAnimationLoop((time) => {
  camera.updateMatrixWorld();
  tiles.update();
  controls.update();
  updateHUD();

  // Fire simulation ticks now run via setInterval (see bottom of file)
  // so they continue even when the iframe is hidden/rAF is throttled

  // Always update fire overlay (for animation even when paused)
  fireOverlay.update(fireEngine, camera, tiles);

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

    // Surface normal = always-upright "up"
    const up = getSurfaceNormal(vPos);

    // Snap camera position directly to vehicle (no lerp = no lag)
    const aboveOffset = 5;
    camera.position.copy(vPos).add(up.clone().multiplyScalar(aboveOffset));

    // Build camera orientation purely from mouse yaw/pitch — completely ignores vehicle heading
    // Start from a basis aligned to surface normal (up) and reference forward
    const refRight = new THREE.Vector3().crossVectors(fpvRefFwd, up).normalize();
    const refFwd = new THREE.Vector3().crossVectors(up, refRight).normalize();

    // Base quaternion: orient camera so -Z looks along refFwd, +Y is up
    const baseMat = new THREE.Matrix4().makeBasis(
      refRight,                 // +X = right
      up,                       // +Y = up
      refFwd.clone().negate()   // +Z = behind (camera looks down -Z)
    );
    const baseQ = new THREE.Quaternion().setFromRotationMatrix(baseMat);

    // Yaw and pitch use LOCAL camera axes (post-multiplied onto base)
    // Local Y = up in camera space → yaw (left/right)
    // Local X = right in camera space → pitch (up/down)
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), fpvYaw);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fpvPitch);

    // Combined: base * yaw * pitch (all in local space)
    camera.quaternion.copy(baseQ).multiply(yawQ).multiply(pitchQ);
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
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2a36, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
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
    g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.04*s, 0.04*s, 0.06*s, 8), accentMat), { position: new THREE.Vector3(ax, 0.04*s, az) }));
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
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2a36, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
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
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2a36, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
  // Fuselage
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08*s, 0.06*s, 1.0*s, 8), Object.assign(bodyMat.clone(), {})));
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
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x111518, roughness: 0.4, metalness: 0.6 });
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
  sprite.scale.set(60, 15, 1);
  sprite.position.set(0, 15, 0);
  return sprite;
}

// ---- Sprite creation ----
function createAgentSprite(id, type, dtype) {
  const color = getColor(type, dtype);
  let mesh;
  if (type === 'drone' || (!GROUND_TYPES.has(type) && !AIR_TYPES.has(type))) {
    // Drones — quadcopter (or fixed-wing for mapper)
    mesh = (dtype === 'mapper' || dtype === 'reaper')
      ? buildPlaneMesh(color, dtype === 'reaper' ? 6 : 3)
      : buildQuadcopterMesh(color, 3);
  } else if (type === 'heli') {
    mesh = buildHelicopterMesh(color, 4);
  } else if (AIR_TYPES.has(type)) {
    // air (VLAT), seat, lead → plane
    mesh = buildPlaneMesh(color, type === 'air' ? 6 : 4);
  } else if (type === 'hotshot' || type === 'crew') {
    mesh = buildCrewMesh(color, 2.5);
  } else {
    // engine, tender, dozer, structeng → ground vehicle
    mesh = buildGroundVehicleMesh(color, type === 'dozer' ? 4 : 3);
  }

  const group = new THREE.Group();
  group.add(mesh);
  group.add(buildLabelSprite(id, color));
  scene.add(group);

  const entry = { group, mesh, type, dtype, lastUpdate: performance.now(), targetLat: 0, targetLng: 0 };
  agentSprites.set(id, entry);
  return entry;
}

// ---- Terrain height raycasting ----
const _terrainRay = new THREE.Raycaster();
const _terrainDown = new THREE.Vector3();
const terrainHeightCache = new Map(); // 'lat,lng' → {height, time}

function getTerrainHeight(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = terrainHeightCache.get(key);
  if (cached && performance.now() - cached.time < 5000) return cached.height;

  // Raycast from 2000m above straight down
  const origin = new THREE.Vector3();
  ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 2000, origin);
  _terrainDown.copy(origin).normalize().negate();
  _terrainRay.set(origin, _terrainDown);
  _terrainRay.far = 3000;
  const hits = _terrainRay.intersectObjects(tiles.group.children, true);
  let h = 150; // default fallback for Palisades area
  if (hits.length > 0) {
    const carto = {};
    ellipsoid.getPositionToCartographic(hits[0].point, carto);
    h = Math.max(0, carto.height || 0);
  }
  terrainHeightCache.set(key, { height: h, time: performance.now() });
  if (terrainHeightCache.size > 500) {
    // Evict oldest entries
    const oldest = [...terrainHeightCache.entries()].sort((a, b) => a[1].time - b[1].time).slice(0, 200);
    for (const [k] of oldest) terrainHeightCache.delete(k);
  }
  return h;
}

// ---- Position update ----
function updateAgentPosition(id, type, dtype, lat, lng, launched) {
  // Skip if this sprite is under FPV manual control
  if (fpvBridgeId === id) return;

  let sprite = agentSprites.get(id);
  if (!sprite) sprite = createAgentSprite(id, type, dtype);
  sprite.lastUpdate = performance.now();
  sprite.targetLat = lat;
  sprite.targetLng = lng;

  if (launched === false) { sprite.group.visible = false; return; }
  sprite.group.visible = true;

  // Determine altitude
  let alt;
  if (GROUND_TYPES.has(type)) {
    alt = getTerrainHeight(lat, lng) + 3; // sit on terrain
  } else if (type === 'heli') {
    alt = getTerrainHeight(lat, lng) + 150;
  } else if (type === 'air') {
    alt = 350;
  } else if (type === 'seat') {
    alt = 250;
  } else if (type === 'lead') {
    alt = 280;
  } else {
    // Drones
    alt = dtype === 'reaper' ? 500 : dtype === 'mapper' ? 150 : getTerrainHeight(lat, lng) + 80;
  }

  ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), alt, _tmpPos);
  sprite.group.position.lerp(_tmpPos, 0.12);

  // Orient mesh so local Y points away from earth center
  const up = sprite.group.position.clone().normalize();
  const localUp = new THREE.Vector3(0, 1, 0);
  sprite.mesh.quaternion.setFromUnitVectors(localUp, up);
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

  // Fire ignition from 2D view
  if (ev.data.type === 'fire_ignite' && ev.data.lat && ev.data.lng) {
    const { lat, lng } = ev.data;
    if (lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX) {
      fireEngine.igniteAtLatLng(lat, lng, 3);
      fireRunning = true;
      updateFireStatus();
      const hint = document.getElementById('ignite-hint');
      if (hint) hint.style.display = 'none';
      console.log('[BRIDGE] Fire ignited from 2D at', lat.toFixed(4), lng.toFixed(4));
    }
  }

  // Unit positions from 2D view — create/update all agent sprites
  if (ev.data.type === 'unit_positions') {
    if (!bridgeActive) { bridgeActive = true; hideOriginalVehicles(); }
    const { drones: droneData, units: unitData } = ev.data;
    if (droneData) {
      for (const d of droneData) {
        updateAgentPosition(d.id, 'drone', d.dtype, d.lat, d.lng, d.launched);
      }
    }
    if (unitData) {
      for (const u of unitData) {
        if (u.atHome) continue;
        updateAgentPosition(u.id, u.type, null, u.lat, u.lng, true);
      }
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
  requestAnimationFrame(spinRotors);
})();
