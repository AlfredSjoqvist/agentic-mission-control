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

// Drone
const drone = new FireDrone(ellipsoid, tiles);
drone.addToScene(scene);

// ---- Response vehicles ----
// Helicopters (Firehawk style — orbit fire, hover for water drops)
const heli1 = new ResponseHelicopter(ellipsoid, tiles, 'HAWK-1', 34.050, -118.540);
heli1.addToScene(scene);
const heli2 = new ResponseHelicopter(ellipsoid, tiles, 'HAWK-2', 34.058, -118.520);
heli2.addToScene(scene);

// Air tankers (fixed-wing — racetrack patterns over fire)
const tanker1 = new ResponseAirTanker(ellipsoid, tiles, 'TANKER-10', 34.070, -118.560, 135);
tanker1.addToScene(scene);
const tanker2 = new ResponseAirTanker(ellipsoid, tiles, 'TANKER-130', 34.065, -118.500, 90);
tanker2.addToScene(scene);

const allVehicles = [heli1, heli2, tanker1, tanker2];

// Fire simulation speed: run N engine ticks per real second
const TICKS_PER_SECOND = 12;
let lastFireTick = 0;
let fireRunning = false;

// ============================================================
// CLICK-TO-IGNITE (Raycasting)
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

console.log('[FireSight] Fire engine initialized. Grid:', GRID_ROWS, 'x', GRID_COLS);
console.log('[FireSight] Bounds: lat [' + LAT_MIN + ', ' + LAT_MAX + '] lng [' + LNG_MIN + ', ' + LNG_MAX + ']');

renderer.domElement.addEventListener('dblclick', (e) => {
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

  // Fire simulation ticks
  if (fireRunning) {
    const elapsed = time - lastFireTick;
    if (elapsed > 1000 / TICKS_PER_SECOND) {
      const tick = fireEngine.step();
      lastFireTick = time;
      updateFireStatus();
      // Log every 10 ticks
      if (tick % 10 === 0) {
        let b = 0, d = 0;
        for (let i = 0; i < fireEngine.cells.length; i++) {
          if (fireEngine.cells[i] === 1) b++;
          if (fireEngine.cells[i] === 2) d++;
        }
        console.log(`[engine] tick=${tick} burning=${b} burned=${d} wind=${fireEngine.windSpeed}km/h@${fireEngine.windDir}°`);
      }
    }
  }

  // Always update fire overlay (for animation even when paused)
  fireOverlay.update(fireEngine, camera, tiles);

  // Update drone
  drone.update(fireEngine, camera);

  // Update all response vehicles
  allVehicles.forEach(v => v.update(fireEngine, camera));

  renderer.render(scene, camera);
});

console.log('FireSight Drone View — Three.js + Google 3D Tiles + Fire Simulation');
console.log('Double-click anywhere to ignite fire. Controls: Left-drag = pan, Scroll = zoom, Right-drag = tilt/rotate');
