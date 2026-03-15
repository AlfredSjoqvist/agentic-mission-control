import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { FireSpreadEngine, FUEL_TYPES, CELL_STATES } from './fireSpreadEngine';
import { FireVisualSystem } from './fireVisuals';
import './App.css';

// ============================================================
// DATA
// ============================================================
const PALISADES = { lat: 34.045, lng: -118.529 };

const EVAC_ROUTES = [
  {
    name: 'PCH South', status: 'clear',
    points: [
      { lat: 34.035, lng: -118.530 }, { lat: 34.025, lng: -118.540 },
      { lat: 34.015, lng: -118.555 }, { lat: 34.005, lng: -118.570 },
    ],
  },
  {
    name: 'Sunset East', status: 'clear',
    points: [
      { lat: 34.048, lng: -118.510 }, { lat: 34.050, lng: -118.490 },
      { lat: 34.052, lng: -118.470 }, { lat: 34.054, lng: -118.450 },
    ],
  },
  {
    name: 'Topanga Canyon', status: 'blocked',
    points: [
      { lat: 34.050, lng: -118.540 }, { lat: 34.060, lng: -118.555 },
      { lat: 34.070, lng: -118.570 },
    ],
  },
];

// ---- DRONES (small recon UAVs) ----
const DRONES = [
  {
    id: 'SCOUT-1', type: 'recon', status: 'active',
    position: { lat: 34.052, lng: -118.535, alt: 250 }, heading: 45, speed: 35, battery: 78,
    patrol: [
      { lat: 34.052, lng: -118.535 }, { lat: 34.060, lng: -118.525 },
      { lat: 34.065, lng: -118.510 }, { lat: 34.058, lng: -118.500 },
      { lat: 34.052, lng: -118.535 },
    ],
  },
  {
    id: 'SCOUT-2', type: 'recon', status: 'active',
    position: { lat: 34.035, lng: -118.515, alt: 300 }, heading: 180, speed: 40, battery: 62,
    patrol: [
      { lat: 34.035, lng: -118.515 }, { lat: 34.028, lng: -118.505 },
      { lat: 34.022, lng: -118.520 }, { lat: 34.030, lng: -118.535 },
      { lat: 34.035, lng: -118.515 },
    ],
  },
  {
    id: 'TANKER-1', type: 'payload', status: 'active',
    position: { lat: 34.048, lng: -118.548, alt: 200 }, heading: 90, speed: 25, battery: 45,
    patrol: [
      { lat: 34.048, lng: -118.548 }, { lat: 34.055, lng: -118.540 },
      { lat: 34.058, lng: -118.530 }, { lat: 34.048, lng: -118.548 },
    ],
  },
  {
    id: 'RELAY-1', type: 'comms', status: 'hovering',
    position: { lat: 34.045, lng: -118.529, alt: 400 }, heading: 0, speed: 0, battery: 91,
    patrol: [],
  },
];

// ---- HELICOPTERS (Sikorsky S-70 Firehawk / CH-47 Chinook style) ----
const HELICOPTERS = [
  {
    id: 'HAWK-1', model: 'S-70 Firehawk', status: 'active', role: 'water-drop',
    position: { lat: 34.050, lng: -118.540, alt: 180 },
    speed: 95, fuel: 72,
    // Helicopter orbits a point near fire, with hover stops
    patrol: [
      { lat: 34.050, lng: -118.540, hover: 0 },
      { lat: 34.048, lng: -118.532, hover: 5 },   // hover 5s over fire
      { lat: 34.044, lng: -118.528, hover: 8 },   // water drop hover
      { lat: 34.042, lng: -118.535, hover: 0 },
      { lat: 34.046, lng: -118.542, hover: 3 },   // refill hover
      { lat: 34.050, lng: -118.540, hover: 0 },
    ],
  },
  {
    id: 'HAWK-2', model: 'CH-47 Chinook', status: 'active', role: 'heavy-lift',
    position: { lat: 34.058, lng: -118.520, alt: 220 },
    speed: 80, fuel: 58,
    patrol: [
      { lat: 34.058, lng: -118.520, hover: 0 },
      { lat: 34.054, lng: -118.515, hover: 6 },
      { lat: 34.050, lng: -118.522, hover: 10 },  // heavy water drop
      { lat: 34.055, lng: -118.528, hover: 0 },
      { lat: 34.058, lng: -118.520, hover: 0 },
    ],
  },
];

// ---- AIR TANKERS (fixed-wing, DC-10 / C-130 style) ----
const AIRTANKERS = [
  {
    id: 'TANKER-10', model: 'DC-10 Air Tanker', status: 'active', role: 'retardant-drop',
    position: { lat: 34.070, lng: -118.560, alt: 450 },
    speed: 280, fuel: 65,
    // Large racetrack pattern — long straight runs over fire, wide banking turns
    racetrack: {
      center: { lat: 34.050, lng: -118.530 },
      length: 0.06,    // degrees (~6.5 km run)
      width: 0.025,    // degrees (~2.7 km spacing)
      heading: 135,     // NW-SE run axis
    },
  },
  {
    id: 'TANKER-130', model: 'C-130 Hercules', status: 'active', role: 'retardant-drop',
    position: { lat: 34.065, lng: -118.500, alt: 380 },
    speed: 240, fuel: 81,
    racetrack: {
      center: { lat: 34.048, lng: -118.518 },
      length: 0.05,
      width: 0.02,
      heading: 90,      // E-W run axis
    },
  },
];

// ---- FIRE TRUCKS (ground vehicles — road-constrained) ----
// Road paths derived from the terrain: PCH, Sunset Blvd, Topanga Canyon Rd
const FIRETRUCKS = [
  {
    id: 'ENGINE-41', model: 'Type 1 Engine', status: 'deployed', role: 'structure-protection',
    position: { lat: 34.038, lng: -118.530, alt: 0 }, speed: 35, crew: 6,
    // PCH coastal road
    road: [
      { lat: 34.020, lng: -118.555 },
      { lat: 34.025, lng: -118.545 },
      { lat: 34.030, lng: -118.538 },
      { lat: 34.035, lng: -118.530 },
      { lat: 34.038, lng: -118.522 },
      { lat: 34.040, lng: -118.515 },
      { lat: 34.042, lng: -118.508 },
    ],
  },
  {
    id: 'ENGINE-57', model: 'Type 3 Engine', status: 'deployed', role: 'wildland',
    position: { lat: 34.048, lng: -118.510, alt: 0 }, speed: 25, crew: 4,
    // Sunset Blvd
    road: [
      { lat: 34.046, lng: -118.540 },
      { lat: 34.047, lng: -118.530 },
      { lat: 34.048, lng: -118.520 },
      { lat: 34.049, lng: -118.510 },
      { lat: 34.050, lng: -118.500 },
      { lat: 34.051, lng: -118.490 },
      { lat: 34.052, lng: -118.480 },
    ],
  },
  {
    id: 'BRUSH-9', model: 'Type 6 Brush Truck', status: 'en-route', role: 'brush-fire',
    position: { lat: 34.055, lng: -118.545, alt: 0 }, speed: 30, crew: 3,
    // Topanga Canyon Road
    road: [
      { lat: 34.045, lng: -118.535 },
      { lat: 34.050, lng: -118.540 },
      { lat: 34.055, lng: -118.545 },
      { lat: 34.060, lng: -118.550 },
      { lat: 34.065, lng: -118.555 },
      { lat: 34.070, lng: -118.560 },
    ],
  },
];

// ============================================================
// HELPERS
// ============================================================
function toPositions(points, height = 50) {
  return points.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, height));
}

function getDroneColor(drone) {
  if (drone.type === 'recon') return Cesium.Color.CYAN;
  if (drone.type === 'payload') return Cesium.Color.ORANGE;
  if (drone.type === 'comms') return Cesium.Color.MEDIUMPURPLE;
  return Cesium.Color.WHITE;
}

function getDroneCSSColor(drone) {
  if (drone.type === 'recon') return '#00e5ff';
  if (drone.type === 'payload') return '#ff8800';
  if (drone.type === 'comms') return '#bb86fc';
  return '#ffffff';
}

// Vehicle colors
const VEHICLE_COLORS = {
  helicopter: { cesium: Cesium.Color.fromCssColorString('#ffdd00'), css: '#ffdd00' },
  airtanker: { cesium: Cesium.Color.fromCssColorString('#ff4444'), css: '#ff4444' },
  firetruck: { cesium: Cesium.Color.fromCssColorString('#ff6622'), css: '#ff6622' },
};

// Wind direction labels
const WIND_DIRS = [
  { deg: 0, label: 'N' }, { deg: 45, label: 'NE' }, { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' }, { deg: 180, label: 'S' }, { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' }, { deg: 315, label: 'NW' },
];

function windLabel(deg) {
  const d = WIND_DIRS.reduce((a, b) => Math.abs(b.deg - deg) < Math.abs(a.deg - deg) ? b : a);
  return d.label;
}

// ============================================================
// CANVAS SPRITE GENERATORS — realistic top-down vehicle icons
// ============================================================
function createHelicopterSprite(color = '#ffdd00', size = 48) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;

  // Body (elongated oval)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.12, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail boom
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.22);
  ctx.lineTo(cx, cy + size * 0.40);
  ctx.stroke();

  // Tail rotor (small horizontal line)
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.08, cy + size * 0.38);
  ctx.lineTo(cx + size * 0.08, cy + size * 0.38);
  ctx.stroke();

  // Main rotor (large cross)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy);
  ctx.lineTo(cx + size * 0.42, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.42);
  ctx.lineTo(cx, cy + size * 0.15);
  ctx.stroke();

  // Rotor hub
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  // Skids
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.15, cy - size * 0.12);
  ctx.lineTo(cx - size * 0.15, cy + size * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.15, cy - size * 0.12);
  ctx.lineTo(cx + size * 0.15, cy + size * 0.18);
  ctx.stroke();

  return c;
}

function createAirTankerSprite(color = '#ff4444', size = 56) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;

  // Fuselage (long narrow body)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.06, size * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose cone
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.04, cy - size * 0.35);
  ctx.lineTo(cx, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.04, cy - size * 0.35);
  ctx.fill();

  // Main wings (swept)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.05);
  ctx.lineTo(cx - size * 0.42, cy + size * 0.08);
  ctx.lineTo(cx - size * 0.38, cy + size * 0.12);
  ctx.lineTo(cx, cy + size * 0.02);
  ctx.lineTo(cx + size * 0.38, cy + size * 0.12);
  ctx.lineTo(cx + size * 0.42, cy + size * 0.08);
  ctx.closePath();
  ctx.fill();

  // Tail wings (horizontal stabilizer)
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.28);
  ctx.lineTo(cx - size * 0.18, cy + size * 0.35);
  ctx.lineTo(cx - size * 0.16, cy + size * 0.38);
  ctx.lineTo(cx, cy + size * 0.32);
  ctx.lineTo(cx + size * 0.16, cy + size * 0.38);
  ctx.lineTo(cx + size * 0.18, cy + size * 0.35);
  ctx.closePath();
  ctx.fill();

  // Vertical stabilizer (tail fin) — draw as triangle on top
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.25);
  ctx.lineTo(cx + size * 0.03, cy + size * 0.38);
  ctx.lineTo(cx - size * 0.03, cy + size * 0.38);
  ctx.closePath();
  ctx.fill();

  // Engine nacelles (on wings)
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.2, cy + size * 0.06, size * 0.03, size * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.2, cy + size * 0.06, size * 0.03, size * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

function createFireTruckSprite(color = '#ff6622', size = 44) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;

  // Truck body (rectangular, top-down)
  const bw = size * 0.22, bh = size * 0.40;
  ctx.fillStyle = color;
  ctx.fillRect(cx - bw, cy - bh, bw * 2, bh * 2);

  // Cab (front, slightly narrower)
  ctx.fillStyle = '#cc4400';
  ctx.fillRect(cx - bw * 0.85, cy - bh - size * 0.08, bw * 1.7, size * 0.12);

  // Windshield
  ctx.fillStyle = 'rgba(100,200,255,0.5)';
  ctx.fillRect(cx - bw * 0.65, cy - bh - size * 0.04, bw * 1.3, size * 0.06);

  // Ladder rack (center line on top)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - bh * 0.6);
  ctx.lineTo(cx, cy + bh * 0.8);
  ctx.stroke();

  // Cross bars on ladder
  for (let y = -0.4; y <= 0.6; y += 0.25) {
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.4, cy + bh * y);
    ctx.lineTo(cx + bw * 0.4, cy + bh * y);
    ctx.stroke();
  }

  // Emergency lights on top (red/white)
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(cx - bw * 0.5, cy - bh - size * 0.01, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx + bw * 0.5, cy - bh - size * 0.01, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Wheels (4 circles on sides)
  ctx.fillStyle = '#222';
  const wheelY1 = cy - bh * 0.55;
  const wheelY2 = cy + bh * 0.55;
  ctx.beginPath();
  ctx.arc(cx - bw - 1, wheelY1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + bw + 1, wheelY1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - bw - 1, wheelY2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + bw + 1, wheelY2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Hose reel (back circle)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy + bh * 0.65, size * 0.06, 0, Math.PI * 2);
  ctx.stroke();

  return c;
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  // UI state
  const [loaded, setLoaded] = useState(false);
  const [showEvac, setShowEvac] = useState(true);
  const [showDrones, setShowDrones] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [selectedDrone, setSelectedDrone] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Fire simulation state
  const [igniteMode, setIgniteMode] = useState(false);
  const [fireRunning, setFireRunning] = useState(false);
  const [fireSpeed, setFireSpeed] = useState(1);
  const [fireStats, setFireStats] = useState(null);
  const [windSpeed, setWindSpeed] = useState(30);
  const [windDir, setWindDir] = useState(315);
  const [showFuelMap, setShowFuelMap] = useState(false);

  // Refs
  const entitiesRef = useRef({ evacEntities: [], droneEntities: [], pathEntities: [], vehicleEntities: [] });
  const igniteModeRef = useRef(false);
  const fireEngineRef = useRef(null);
  const fireOverlayRef = useRef(null);
  const fuelOverlayRef = useRef(null);
  const fireIntervalRef = useRef(null);

  // ---- Initialize Cesium + Fire Engine ----
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;

    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false, animation: false, baseLayerPicker: false,
      geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false,
      selectionIndicator: false, infoBox: false, shadows: false,
      skyAtmosphere: new Cesium.SkyAtmosphere(),
      requestRenderMode: false,
    });
    viewerRef.current = viewer;
    viewer.imageryLayers.removeAll();

    viewer.scene.globe.depthTestAgainstTerrain = true;
    if (viewer.scene.pickTranslucentDepth !== undefined) {
      viewer.scene.pickTranslucentDepth = true;
    }

    // ---- Fire Engine ----
    const engine = new FireSpreadEngine({
      minLat: 33.990, maxLat: 34.110,
      minLng: -118.600, maxLng: -118.440,
      cellSize: 80, windSpeed: 30, windDirection: 315,
    });
    fireEngineRef.current = engine;

    // Load Google 3D Tiles
    (async () => {
      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`,
          { showCreditsOnScreen: true, maximumScreenSpaceError: 8 }
        );
        if (viewer.isDestroyed()) return;
        viewer.scene.primitives.add(tileset);

        const fireVisuals = new FireVisualSystem(viewer, tileset, engine);
        fireOverlayRef.current = fireVisuals;

        engine._updateOverlay = () => {
          const cells = engine.getBurningCells();
          fireVisuals.update(cells);
        };

        setLoaded(true);
      } catch (err) {
        console.error('3D Tiles fallback:', err);
        if (viewer.isDestroyed()) return;
        try {
          viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
          viewer.imageryLayers.addImageryProvider(await Cesium.IonImageryProvider.fromAssetId(2));
        } catch (e2) { console.error(e2); }
        setLoaded(true);
      }
    })();

    // Fly to fire zone
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(PALISADES.lng, PALISADES.lat, 3500),
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-45), roll: 0 },
      duration: 2,
    });

    // Fuel map overlay
    const fuelOverlay = viewer.entities.add({
      name: 'Fuel Map', show: false,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(-118.600, 33.990, -118.440, 34.110),
        material: new Cesium.ImageMaterialProperty({ image: engine.fuelCanvas.toDataURL(), transparent: false }),
        height: 600, extrudedHeight: 601,
      },
    });
    fuelOverlayRef.current = fuelOverlay;

    // ---- Evacuation Routes ----
    const evacEntities = EVAC_ROUTES.map(route => {
      const color = route.status === 'clear' ? Cesium.Color.LIME : Cesium.Color.RED;
      return viewer.entities.add({
        name: `Evac: ${route.name}`,
        polyline: {
          positions: toPositions(route.points, 100),
          width: 6,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.35, color }),
        },
        properties: { type: 'evac' },
      });
    });
    entitiesRef.current.evacEntities = evacEntities;

    // ---- Center marker ----
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(PALISADES.lng, PALISADES.lat, 200),
      point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: 'PALISADES FIRE', font: '13px monospace',
        fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15000),
      },
    });

    // ---- Drones (point sprites) ----
    const droneEntities = DRONES.map(drone => {
      const color = getDroneColor(drone);
      return viewer.entities.add({
        name: drone.id,
        position: Cesium.Cartesian3.fromDegrees(drone.position.lng, drone.position.lat, drone.position.alt),
        point: {
          pixelSize: 14, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
          scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 10000, 0.6),
        },
        label: {
          text: drone.id, font: '11px monospace', fillColor: color,
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000),
        },
        properties: { type: 'drone', droneId: drone.id },
      });
    });
    entitiesRef.current.droneEntities = droneEntities;

    // ---- Drone Patrol Paths ----
    const pathEntities = DRONES.filter(d => d.patrol.length > 0).map(drone => {
      const color = getDroneColor(drone).withAlpha(0.5);
      return viewer.entities.add({
        name: `Path: ${drone.id}`,
        polyline: {
          positions: toPositions(drone.patrol, drone.position.alt),
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({ color, dashLength: 16 }),
        },
        properties: { type: 'dronePath', droneId: drone.id },
      });
    });
    entitiesRef.current.pathEntities = pathEntities;

    // ============================================================
    // CREATE VEHICLE SPRITES (billboard entities)
    // ============================================================
    const heliSprite = createHelicopterSprite('#ffdd00', 48);
    const tankerSprite = createAirTankerSprite('#ff4444', 56);
    const truckSprite = createFireTruckSprite('#ff6622', 44);

    const vehicleEntities = [];

    // ---- Helicopters ----
    HELICOPTERS.forEach(heli => {
      const entity = viewer.entities.add({
        name: heli.id,
        position: Cesium.Cartesian3.fromDegrees(heli.position.lng, heli.position.lat, heli.position.alt),
        billboard: {
          image: heliSprite,
          width: 36, height: 36,
          scaleByDistance: new Cesium.NearFarScalar(300, 1.5, 12000, 0.4),
          rotation: 0,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
        },
        label: {
          text: heli.id, font: '11px monospace',
          fillColor: Cesium.Color.fromCssColorString('#ffdd00'),
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -24),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10000),
        },
        properties: { type: 'vehicle', vehicleId: heli.id, vehicleKind: 'helicopter' },
      });
      vehicleEntities.push(entity);
    });

    // ---- Air Tankers ----
    AIRTANKERS.forEach(tanker => {
      const entity = viewer.entities.add({
        name: tanker.id,
        position: Cesium.Cartesian3.fromDegrees(tanker.position.lng, tanker.position.lat, tanker.position.alt),
        billboard: {
          image: tankerSprite,
          width: 42, height: 42,
          scaleByDistance: new Cesium.NearFarScalar(300, 1.5, 15000, 0.35),
          rotation: 0,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
        },
        label: {
          text: tanker.id, font: '11px monospace',
          fillColor: Cesium.Color.fromCssColorString('#ff4444'),
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12000),
        },
        properties: { type: 'vehicle', vehicleId: tanker.id, vehicleKind: 'airtanker' },
      });
      vehicleEntities.push(entity);
    });

    // ---- Fire Trucks ----
    FIRETRUCKS.forEach(truck => {
      // Get ground elevation from engine for first road point
      const startElev = engine._estimateElevation(truck.road[0].lat, truck.road[0].lng);
      const entity = viewer.entities.add({
        name: truck.id,
        position: Cesium.Cartesian3.fromDegrees(truck.road[0].lng, truck.road[0].lat, startElev + 8),
        billboard: {
          image: truckSprite,
          width: 30, height: 30,
          scaleByDistance: new Cesium.NearFarScalar(200, 1.8, 8000, 0.5),
          rotation: 0,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
        },
        label: {
          text: truck.id, font: '10px monospace',
          fillColor: Cesium.Color.fromCssColorString('#ff6622'),
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000),
        },
        properties: { type: 'vehicle', vehicleId: truck.id, vehicleKind: 'firetruck' },
      });
      vehicleEntities.push(entity);

      // Draw road path for truck
      const roadPositions = truck.road.map(p => {
        const elev = engine._estimateElevation(p.lat, p.lng);
        return Cesium.Cartesian3.fromDegrees(p.lng, p.lat, elev + 5);
      });
      viewer.entities.add({
        name: `Road: ${truck.id}`,
        polyline: {
          positions: roadPositions,
          width: 4,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#ff6622').withAlpha(0.4),
            dashLength: 12,
          }),
        },
        properties: { type: 'truckPath', vehicleId: truck.id },
      });
    });

    entitiesRef.current.vehicleEntities = vehicleEntities;

    // ============================================================
    // ANIMATION LOOP — all vehicles
    // ============================================================
    let animFrame;
    const startTime = Date.now();

    function animateAll() {
      if (viewer.isDestroyed()) return;
      const elapsed = (Date.now() - startTime) / 1000;

      // ---- Drone animation (same as original) ----
      DRONES.forEach((drone, i) => {
        if (drone.patrol.length < 2 || !droneEntities[i]) return;
        const totalPoints = drone.patrol.length;
        const cycleTime = 30 + i * 5;
        const t = (elapsed / cycleTime) % 1;
        const segIndex = Math.floor(t * (totalPoints - 1));
        const segT = (t * (totalPoints - 1)) - segIndex;
        const p1 = drone.patrol[segIndex];
        const p2 = drone.patrol[Math.min(segIndex + 1, totalPoints - 1)];
        const lat = p1.lat + (p2.lat - p1.lat) * segT;
        const lng = p1.lng + (p2.lng - p1.lng) * segT;
        droneEntities[i].position = Cesium.Cartesian3.fromDegrees(lng, lat, drone.position.alt);
      });

      let vIdx = 0;

      // ---- Helicopter animation (waypoints with hover pauses) ----
      HELICOPTERS.forEach((heli, i) => {
        const entity = vehicleEntities[vIdx + i];
        if (!entity || heli.patrol.length < 2) return;

        const totalPoints = heli.patrol.length;
        // Calculate total cycle time including hover durations
        const transitTime = 12; // seconds per segment transit
        const totalHover = heli.patrol.reduce((sum, p) => sum + (p.hover || 0), 0);
        const cycleTime = totalPoints * transitTime + totalHover;
        const t = elapsed % cycleTime;

        // Find current segment accounting for hover times
        let accumTime = 0;
        let segIdx = 0;
        let segT = 0;
        let hovering = false;

        for (let s = 0; s < totalPoints - 1; s++) {
          const hoverTime = heli.patrol[s].hover || 0;
          // Hover at waypoint
          if (t < accumTime + hoverTime) {
            segIdx = s;
            segT = 0;
            hovering = true;
            break;
          }
          accumTime += hoverTime;
          // Transit to next waypoint
          if (t < accumTime + transitTime) {
            segIdx = s;
            segT = (t - accumTime) / transitTime;
            // Ease in-out for realistic acceleration
            segT = segT * segT * (3 - 2 * segT);
            break;
          }
          accumTime += transitTime;
        }

        const p1 = heli.patrol[segIdx];
        const p2 = heli.patrol[Math.min(segIdx + 1, totalPoints - 1)];
        const lat = p1.lat + (p2.lat - p1.lat) * segT;
        const lng = p1.lng + (p2.lng - p1.lng) * segT;

        // Altitude bob when hovering
        let alt = heli.position.alt;
        if (hovering) {
          alt += Math.sin(elapsed * 1.5) * 3; // gentle bob
        } else {
          alt += Math.sin(elapsed * 0.8) * 5; // slight altitude variation in transit
        }

        entity.position = Cesium.Cartesian3.fromDegrees(lng, lat, alt);

        // Heading — face direction of travel
        if (!hovering && segT > 0.01) {
          const headingRad = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat);
          entity.billboard.rotation = -headingRad;
        } else if (hovering) {
          // Slow yaw while hovering (scanning)
          entity.billboard.rotation = -(elapsed * 0.15 % (Math.PI * 2));
        }
      });
      vIdx += HELICOPTERS.length;

      // ---- Air Tanker animation (racetrack pattern) ----
      AIRTANKERS.forEach((tanker, i) => {
        const entity = vehicleEntities[vIdx + i];
        if (!entity) return;

        const rt = tanker.racetrack;
        const headRad = (rt.heading * Math.PI) / 180;
        const cycleTime = 45 + i * 8; // seconds per full racetrack
        const t = (elapsed / cycleTime) % 1;

        // Racetrack: straight run → semicircle turn → straight run back → semicircle turn
        // 0.0-0.35: straight run (inbound)
        // 0.35-0.50: semicircle turn (far end)
        // 0.50-0.85: straight run (outbound)
        // 0.85-1.00: semicircle turn (near end)

        let lat, lng, heading;
        const cosH = Math.cos(headRad);
        const sinH = Math.sin(headRad);

        if (t < 0.35) {
          // Straight inbound run
          const st = t / 0.35;
          const along = (st - 0.5) * rt.length;
          const across = -rt.width / 2;
          lat = rt.center.lat + along * cosH - across * sinH;
          lng = rt.center.lng + along * sinH + across * cosH;
          heading = headRad;
        } else if (t < 0.50) {
          // Semicircle turn at far end (banking right)
          const turnT = (t - 0.35) / 0.15;
          const angle = Math.PI * turnT;
          const turnR = rt.width / 2;
          const endAlongBase = rt.length / 2;
          const turnCenterLat = rt.center.lat + endAlongBase * cosH;
          const turnCenterLng = rt.center.lng + endAlongBase * sinH;
          const across = -turnR * Math.cos(angle);
          const extra = turnR * Math.sin(angle) * 0.15; // slight forward motion in turn
          lat = turnCenterLat - across * sinH + extra * cosH;
          lng = turnCenterLng + across * cosH + extra * sinH;
          heading = headRad + Math.PI * turnT;
        } else if (t < 0.85) {
          // Straight outbound run (opposite direction)
          const st = (t - 0.50) / 0.35;
          const along = (0.5 - st) * rt.length;
          const across = rt.width / 2;
          lat = rt.center.lat + along * cosH - across * sinH;
          lng = rt.center.lng + along * sinH + across * cosH;
          heading = headRad + Math.PI;
        } else {
          // Semicircle turn at near end
          const turnT = (t - 0.85) / 0.15;
          const angle = Math.PI * turnT;
          const turnR = rt.width / 2;
          const endAlongBase = -rt.length / 2;
          const turnCenterLat = rt.center.lat + endAlongBase * cosH;
          const turnCenterLng = rt.center.lng + endAlongBase * sinH;
          const across = turnR * Math.cos(angle);
          const extra = -turnR * Math.sin(angle) * 0.15;
          lat = turnCenterLat - across * sinH + extra * cosH;
          lng = turnCenterLng + across * cosH + extra * sinH;
          heading = headRad + Math.PI + Math.PI * turnT;
        }

        // Altitude: slight variation, dip during runs (simulating retardant drop altitude)
        const isRunning = (t < 0.35 || (t >= 0.50 && t < 0.85));
        let alt = tanker.position.alt;
        if (isRunning) {
          alt -= 40; // lower during drop runs
          alt += Math.sin(elapsed * 0.3) * 8;
        } else {
          alt += Math.sin(elapsed * 0.5) * 15; // climbing in turns
        }

        entity.position = Cesium.Cartesian3.fromDegrees(lng, lat, alt);
        entity.billboard.rotation = -heading;
      });
      vIdx += AIRTANKERS.length;

      // ---- Fire Truck animation (road-constrained, back and forth) ----
      FIRETRUCKS.forEach((truck, i) => {
        const entity = vehicleEntities[vIdx + i];
        if (!entity || truck.road.length < 2) return;

        const totalPoints = truck.road.length;
        const cycleTime = 60 + i * 15; // slow — trucks take a while
        const rawT = (elapsed / cycleTime) % 1;
        // Ping-pong: go forward then reverse
        const t = rawT < 0.5 ? rawT * 2 : 2 - rawT * 2;

        const segIndex = Math.floor(t * (totalPoints - 1));
        const segT = (t * (totalPoints - 1)) - segIndex;
        const p1 = truck.road[Math.min(segIndex, totalPoints - 1)];
        const p2 = truck.road[Math.min(segIndex + 1, totalPoints - 1)];

        const lat = p1.lat + (p2.lat - p1.lat) * segT;
        const lng = p1.lng + (p2.lng - p1.lng) * segT;

        // Ground-level elevation from engine
        const elev = engine._estimateElevation(lat, lng);

        entity.position = Cesium.Cartesian3.fromDegrees(lng, lat, elev + 8);

        // Heading — face direction of travel
        const headingRad = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat);
        const adjustedHeading = rawT < 0.5 ? headingRad : headingRad + Math.PI;
        entity.billboard.rotation = -adjustedHeading;
      });

      animFrame = requestAnimationFrame(animateAll);
    }
    animateAll();

    // ---- Click handler ----
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      if (igniteModeRef.current) {
        const position = pickWorldPosition(viewer, click.position);
        if (position) handleIgnite(position);
        return;
      }

      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id?.properties) {
        const pType = picked.id.properties.type?.getValue();
        if (pType === 'drone') {
          setSelectedDrone(picked.id.properties.droneId.getValue());
          setSelectedVehicle(null);
        } else if (pType === 'vehicle') {
          setSelectedVehicle(picked.id.properties.vehicleId.getValue());
          setSelectedDrone(null);
        } else {
          setSelectedDrone(null);
          setSelectedVehicle(null);
        }
      } else {
        setSelectedDrone(null);
        setSelectedVehicle(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    function pickWorldPosition(viewer, screenPos) {
      let cartesian = viewer.scene.pickPosition(screenPos);
      if (cartesian && Cesium.defined(cartesian)) return cartesian;
      const ray = viewer.camera.getPickRay(screenPos);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (cartesian && Cesium.defined(cartesian)) return cartesian;
        cartesian = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid);
        if (cartesian && Cesium.defined(cartesian)) return cartesian;
      }
      return null;
    }

    function handleIgnite(cartesian) {
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const didIgnite = engine.ignite(lat, lng, 3);
      if (didIgnite) {
        if (engine._updateOverlay) engine._updateOverlay();
        setFireStats(engine.getStats());
        setFireRunning(true);
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, 100),
          point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.YELLOW, outlineWidth: 2 },
          label: {
            text: 'IGNITION', font: '10px monospace',
            fillColor: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12000),
          },
        });
      }
    }

    return () => {
      cancelAnimationFrame(animFrame);
      if (fireIntervalRef.current) clearInterval(fireIntervalRef.current);
      handler.destroy();
      if (fireOverlayRef.current?.destroy) fireOverlayRef.current.destroy();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // ---- Fire simulation interval ----
  useEffect(() => {
    if (fireIntervalRef.current) {
      clearInterval(fireIntervalRef.current);
      fireIntervalRef.current = null;
    }
    if (fireRunning && fireEngineRef.current) {
      const tickMs = Math.max(200, 1000 / fireSpeed);
      fireIntervalRef.current = setInterval(() => {
        const engine = fireEngineRef.current;
        if (!engine || (viewerRef.current && viewerRef.current.isDestroyed())) return;
        engine.tick();
        if (engine._updateOverlay) engine._updateOverlay();
        setFireStats(engine.getStats());
      }, tickMs);
    }
    return () => { if (fireIntervalRef.current) clearInterval(fireIntervalRef.current); };
  }, [fireRunning, fireSpeed]);

  // Wind updates
  useEffect(() => {
    if (fireEngineRef.current) fireEngineRef.current.setWind(windSpeed, windDir);
  }, [windSpeed, windDir]);

  // Fuel map toggle
  useEffect(() => {
    if (fuelOverlayRef.current) fuelOverlayRef.current.show = showFuelMap;
    if (fireOverlayRef.current) fireOverlayRef.current.show = !showFuelMap;
  }, [showFuelMap]);

  // Toggle layers
  useEffect(() => { entitiesRef.current.evacEntities.forEach(e => { e.show = showEvac; }); }, [showEvac]);
  useEffect(() => { entitiesRef.current.droneEntities.forEach(e => { e.show = showDrones; }); }, [showDrones]);
  useEffect(() => { entitiesRef.current.pathEntities.forEach(e => { e.show = showPaths; }); }, [showPaths]);
  useEffect(() => { entitiesRef.current.vehicleEntities.forEach(e => { e.show = showVehicles; }); }, [showVehicles]);

  // Camera presets
  const flyCamera = useCallback((lng, lat, alt, heading, pitch, duration = 1.5) => {
    viewerRef.current?.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, alt),
      orientation: { heading: Cesium.Math.toRadians(heading), pitch: Cesium.Math.toRadians(pitch), roll: 0 },
      duration,
    });
  }, []);

  const followDrone = useCallback((droneId) => {
    const drone = DRONES.find(d => d.id === droneId);
    if (!drone) return;
    flyCamera(drone.position.lng, drone.position.lat, drone.position.alt + 200, 0, -35, 1.2);
  }, [flyCamera]);

  const followVehicle = useCallback((vehicleId) => {
    const heli = HELICOPTERS.find(h => h.id === vehicleId);
    if (heli) { flyCamera(heli.position.lng, heli.position.lat, heli.position.alt + 300, 0, -35, 1.2); return; }
    const tanker = AIRTANKERS.find(t => t.id === vehicleId);
    if (tanker) { flyCamera(tanker.position.lng, tanker.position.lat, tanker.position.alt + 500, 0, -30, 1.5); return; }
    const truck = FIRETRUCKS.find(t => t.id === vehicleId);
    if (truck) { flyCamera(truck.road[0].lng, truck.road[0].lat, 500, 0, -45, 1.2); }
  }, [flyCamera]);

  const selDrone = selectedDrone ? DRONES.find(d => d.id === selectedDrone) : null;

  // Find selected vehicle details
  const selVehicleData = selectedVehicle
    ? HELICOPTERS.find(h => h.id === selectedVehicle)
      || AIRTANKERS.find(t => t.id === selectedVehicle)
      || FIRETRUCKS.find(t => t.id === selectedVehicle)
    : null;
  const selVehicleKind = selVehicleData
    ? (HELICOPTERS.includes(selVehicleData) ? 'helicopter'
       : AIRTANKERS.includes(selVehicleData) ? 'airtanker' : 'firetruck')
    : null;

  const cursor = igniteMode ? 'crosshair' : 'default';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', cursor }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ---- HUD Top ---- */}
      <div className="hud-top">
        <div className="hud-title">
          <span className="fire-dot" /> FIRESIGHT — WILDFIRE RESPONSE
        </div>
        <div className={`hud-status ${loaded ? 'active' : ''}`}>
          {loaded ? '3D TILES ACTIVE' : 'LOADING...'}
        </div>
        {fireStats && fireStats.burning > 0 && (
          <div className="hud-status fire-active">
            FIRE ACTIVE — {fireStats.simMinutes} MIN
          </div>
        )}
      </div>

      {/* ---- Ignite Mode Banner ---- */}
      {igniteMode && (
        <div className="ignite-banner">
          IGNITE MODE — Click on the 3D terrain to start fires
          <button onClick={() => { setIgniteMode(false); igniteModeRef.current = false; }}>DONE</button>
        </div>
      )}

      {/* ---- Fire Simulation Controls (left panel) ---- */}
      <div className="fire-panel">
        <div className="panel-header fire-header">FIRE SIMULATION</div>
        <div className="fire-actions">
          <button
            className={`ignite-btn ${igniteMode ? 'active' : ''}`}
            onClick={() => {
              const next = !igniteMode;
              setIgniteMode(next);
              igniteModeRef.current = next;
            }}
          >
            {igniteMode ? 'CLICK TERRAIN...' : 'IGNITE'}
          </button>
          <button className="reset-btn" onClick={() => {
            if (fireEngineRef.current) {
              fireEngineRef.current.reset();
              if (fireEngineRef.current._updateOverlay) fireEngineRef.current._updateOverlay();
              setFireStats(null);
              setFireRunning(false);
            }
          }}>RESET</button>
        </div>

        <div className="fire-playback">
          <button className={fireRunning ? 'pause-btn' : 'play-btn'} onClick={() => setFireRunning(!fireRunning)}>
            {fireRunning ? 'PAUSE' : 'PLAY'}
          </button>
          <div className="speed-btns">
            {[1, 2, 4, 8].map(s => (
              <button key={s} className={fireSpeed === s ? 'active' : ''} onClick={() => setFireSpeed(s)}>{s}x</button>
            ))}
          </div>
        </div>

        <div className="wind-section">
          <div className="wind-header">WIND — {windSpeed} km/h {windLabel(windDir)}</div>
          <div className="wind-control">
            <label>Speed</label>
            <input type="range" min="0" max="80" step="5" value={windSpeed} onChange={e => setWindSpeed(Number(e.target.value))} />
          </div>
          <div className="wind-control">
            <label>Dir</label>
            <input type="range" min="0" max="360" step="45" value={windDir} onChange={e => setWindDir(Number(e.target.value))} />
          </div>
          <div className="wind-compass">
            <div className="compass-arrow" style={{ transform: `rotate(${windDir + 180}deg)` }}>
              <span className="arrow-tip" />
            </div>
            <span className="compass-label">N</span>
          </div>
        </div>

        {fireStats && (
          <div className="fire-stats">
            <div className="stat-row"><span className="stat-label">BURNING</span><span className="stat-val burning">{fireStats.burningAreaKm2} km²</span></div>
            <div className="stat-row"><span className="stat-label">BURNED</span><span className="stat-val burned">{fireStats.burnedAreaKm2} km²</span></div>
            <div className="stat-row"><span className="stat-label">TOTAL FIRE</span><span className="stat-val">{fireStats.totalFireAreaKm2} km²</span></div>
            <div className="stat-row"><span className="stat-label">SIM TIME</span><span className="stat-val">{fireStats.simMinutes} min</span></div>
            <div className="stat-row"><span className="stat-label">CONTAINMENT</span><span className="stat-val">{fireStats.containmentPct}%</span></div>
          </div>
        )}

        <button className={`fuel-toggle ${showFuelMap ? 'active' : ''}`} onClick={() => setShowFuelMap(!showFuelMap)}>
          {showFuelMap ? 'HIDE FUEL MAP' : 'SHOW FUEL MAP'}
        </button>
        {showFuelMap && (
          <div className="fuel-legend">
            {Object.entries(FUEL_TYPES).map(([key, ft]) => (
              <div key={key} className="fuel-item">
                <span className="fuel-swatch" style={{ background: ft.color }} />
                <span>{ft.id}</span>
                <span className="fuel-rate">{ft.rate > 0 ? `${(ft.rate * 100).toFixed(0)}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Drone Fleet Panel ---- */}
      <div className="fleet-panel">
        <div className="panel-header">DRONE FLEET</div>
        {DRONES.map(drone => (
          <div key={drone.id} className={`drone-card ${selectedDrone === drone.id ? 'selected' : ''}`}
            onClick={() => { setSelectedDrone(drone.id); setSelectedVehicle(null); followDrone(drone.id); }}>
            <div className="drone-card-header">
              <span className="drone-dot" style={{ background: getDroneCSSColor(drone) }} />
              <span className="drone-name">{drone.id}</span>
              <span className={`drone-badge ${drone.status}`}>{drone.status.toUpperCase()}</span>
            </div>
            <div className="drone-card-stats">
              <span>ALT {drone.position.alt}m</span>
              <span>{drone.speed} km/h</span>
              <span className={drone.battery < 50 ? 'low-batt' : ''}>{drone.battery}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Response Fleet Panel (new — helicopters, planes, trucks) ---- */}
      <div className="response-panel">
        <div className="panel-header response-header">RESPONSE FLEET</div>

        {/* Helicopters */}
        <div className="vehicle-section-label">HELICOPTERS</div>
        {HELICOPTERS.map(heli => (
          <div key={heli.id} className={`vehicle-card heli ${selectedVehicle === heli.id ? 'selected' : ''}`}
            onClick={() => { setSelectedVehicle(heli.id); setSelectedDrone(null); followVehicle(heli.id); }}>
            <div className="vehicle-card-header">
              <span className="vehicle-icon heli-icon">H</span>
              <span className="vehicle-name">{heli.id}</span>
              <span className={`drone-badge ${heli.status}`}>{heli.status.toUpperCase()}</span>
            </div>
            <div className="vehicle-card-info">
              <span>{heli.model}</span>
              <span className="vehicle-role">{heli.role}</span>
            </div>
            <div className="vehicle-card-stats">
              <span>ALT {heli.position.alt}m</span>
              <span>{heli.speed} km/h</span>
              <span>FUEL {heli.fuel}%</span>
            </div>
          </div>
        ))}

        {/* Air Tankers */}
        <div className="vehicle-section-label">AIR TANKERS</div>
        {AIRTANKERS.map(tanker => (
          <div key={tanker.id} className={`vehicle-card tanker ${selectedVehicle === tanker.id ? 'selected' : ''}`}
            onClick={() => { setSelectedVehicle(tanker.id); setSelectedDrone(null); followVehicle(tanker.id); }}>
            <div className="vehicle-card-header">
              <span className="vehicle-icon tanker-icon">T</span>
              <span className="vehicle-name">{tanker.id}</span>
              <span className={`drone-badge ${tanker.status}`}>{tanker.status.toUpperCase()}</span>
            </div>
            <div className="vehicle-card-info">
              <span>{tanker.model}</span>
              <span className="vehicle-role">{tanker.role}</span>
            </div>
            <div className="vehicle-card-stats">
              <span>ALT {tanker.position.alt}m</span>
              <span>{tanker.speed} km/h</span>
              <span>FUEL {tanker.fuel}%</span>
            </div>
          </div>
        ))}

        {/* Fire Trucks */}
        <div className="vehicle-section-label">FIRE ENGINES</div>
        {FIRETRUCKS.map(truck => (
          <div key={truck.id} className={`vehicle-card truck ${selectedVehicle === truck.id ? 'selected' : ''}`}
            onClick={() => { setSelectedVehicle(truck.id); setSelectedDrone(null); followVehicle(truck.id); }}>
            <div className="vehicle-card-header">
              <span className="vehicle-icon truck-icon">E</span>
              <span className="vehicle-name">{truck.id}</span>
              <span className={`drone-badge ${truck.status}`}>{truck.status.toUpperCase()}</span>
            </div>
            <div className="vehicle-card-info">
              <span>{truck.model}</span>
              <span className="vehicle-role">{truck.role}</span>
            </div>
            <div className="vehicle-card-stats">
              <span>CREW {truck.crew}</span>
              <span>{truck.speed} km/h</span>
              <span className="vehicle-role">{truck.role}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Selected Drone Detail ---- */}
      {selDrone && (
        <div className="drone-detail">
          <div className="detail-header">
            <span className="drone-dot" style={{ background: getDroneCSSColor(selDrone) }} />
            {selDrone.id}
            <span className="detail-type">{selDrone.type.toUpperCase()}</span>
          </div>
          <div className="detail-grid">
            <div><span className="detail-label">POSITION</span><span>{selDrone.position.lat.toFixed(3)}, {selDrone.position.lng.toFixed(3)}</span></div>
            <div><span className="detail-label">ALTITUDE</span><span>{selDrone.position.alt}m AGL</span></div>
            <div><span className="detail-label">HEADING</span><span>{selDrone.heading}°</span></div>
            <div><span className="detail-label">SPEED</span><span>{selDrone.speed} km/h</span></div>
            <div><span className="detail-label">BATTERY</span><span className={selDrone.battery < 50 ? 'low-batt' : ''}>{selDrone.battery}%</span></div>
            <div><span className="detail-label">STATUS</span><span className={`status-${selDrone.status}`}>{selDrone.status.toUpperCase()}</span></div>
          </div>
          <div className="detail-actions">
            <button onClick={() => followDrone(selDrone.id)}>TRACK</button>
            <button onClick={() => setSelectedDrone(null)}>DISMISS</button>
          </div>
        </div>
      )}

      {/* ---- Selected Vehicle Detail ---- */}
      {selVehicleData && (
        <div className={`drone-detail vehicle-detail-${selVehicleKind}`}>
          <div className="detail-header">
            <span className="drone-dot" style={{ background: VEHICLE_COLORS[selVehicleKind]?.css || '#fff' }} />
            {selVehicleData.id}
            <span className="detail-type">{selVehicleData.model}</span>
          </div>
          <div className="detail-grid">
            <div><span className="detail-label">ROLE</span><span>{selVehicleData.role?.toUpperCase()}</span></div>
            {selVehicleData.position?.alt > 0 && (
              <div><span className="detail-label">ALTITUDE</span><span>{selVehicleData.position.alt}m AGL</span></div>
            )}
            <div><span className="detail-label">SPEED</span><span>{selVehicleData.speed} km/h</span></div>
            {selVehicleData.fuel !== undefined && (
              <div><span className="detail-label">FUEL</span><span>{selVehicleData.fuel}%</span></div>
            )}
            {selVehicleData.crew !== undefined && (
              <div><span className="detail-label">CREW</span><span>{selVehicleData.crew} personnel</span></div>
            )}
            <div><span className="detail-label">STATUS</span><span className={`status-${selVehicleData.status}`}>{selVehicleData.status?.toUpperCase()}</span></div>
          </div>
          <div className="detail-actions">
            <button onClick={() => followVehicle(selVehicleData.id)}>TRACK</button>
            <button onClick={() => setSelectedVehicle(null)}>DISMISS</button>
          </div>
        </div>
      )}

      {/* ---- Controls (right) ---- */}
      <div className="controls-panel">
        <button className={showDrones ? 'active' : ''} onClick={() => setShowDrones(!showDrones)}>DRONES</button>
        <button className={showVehicles ? 'active' : ''} onClick={() => setShowVehicles(!showVehicles)}>RESPONSE FLEET</button>
        <button className={showPaths ? 'active' : ''} onClick={() => setShowPaths(!showPaths)}>PATROL PATHS</button>
        <button className={showEvac ? 'active' : ''} onClick={() => setShowEvac(!showEvac)}>EVAC ROUTES</button>
        <div className="control-divider" />
        <button onClick={() => flyCamera(PALISADES.lng, PALISADES.lat, 3500, 0, -45)}>OVERVIEW</button>
        <button onClick={() => flyCamera(PALISADES.lng, PALISADES.lat, 800, 30, -25)}>STREET</button>
        <button onClick={() => flyCamera(PALISADES.lng, PALISADES.lat, 6000, 0, -90)}>TOP DOWN</button>
      </div>

      {/* ---- Evac Legend ---- */}
      {showEvac && (
        <div className="evac-legend">
          {EVAC_ROUTES.map(route => (
            <div key={route.name} className="evac-item">
              <span className={`evac-dot ${route.status}`} />
              {route.name}
              <span className="evac-status">{route.status.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
