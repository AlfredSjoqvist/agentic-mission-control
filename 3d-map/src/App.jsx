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
  const [selectedDrone, setSelectedDrone] = useState(null);

  // Fire simulation state
  const [igniteMode, setIgniteMode] = useState(false);
  const [fireRunning, setFireRunning] = useState(false);
  const [fireSpeed, setFireSpeed] = useState(1); // 1x, 2x, 4x
  const [fireStats, setFireStats] = useState(null);
  const [windSpeed, setWindSpeed] = useState(30);
  const [windDir, setWindDir] = useState(315);
  const [showFuelMap, setShowFuelMap] = useState(false);

  // Refs
  const entitiesRef = useRef({ evacEntities: [], droneEntities: [], pathEntities: [] });
  const igniteModeRef = useRef(false);
  const fireEngineRef = useRef(null);
  const fireOverlayRef = useRef(null);
  const fuelOverlayRef = useRef(null);
  const fireIntervalRef = useRef(null);
  const fireCanvasVersion = useRef(0);

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
    console.log('%c[App] Cesium viewer initialized', 'color: #00e5ff; font-weight: bold');

    // Enable depth picking so pickPosition works on 3D tiles
    viewer.scene.globe.depthTestAgainstTerrain = true;
    if (viewer.scene.pickTranslucentDepth !== undefined) {
      viewer.scene.pickTranslucentDepth = true;
    }
    console.log('%c[App] Depth testing enabled for 3D tiles picking', 'color: #00e5ff');

    // ---- Initialize Fire Spread Engine ----
    const engine = new FireSpreadEngine({
      minLat: 33.990, maxLat: 34.110,
      minLng: -118.600, maxLng: -118.440,
      cellSize: 80, windSpeed: 30, windDirection: 315,
    });
    fireEngineRef.current = engine;

    // Load Google 3D Tiles, then attach fire shader
    (async () => {
      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`,
          { showCreditsOnScreen: true, maximumScreenSpaceError: 8 }
        );
        if (viewer.isDestroyed()) return;
        viewer.scene.primitives.add(tileset);
        console.log('%c[App] Google 3D Tiles loaded successfully', 'color: #0f0; font-weight: bold');

        // Fire visual system — CustomShader on tileset + particles
        const fireVisuals = new FireVisualSystem(viewer, tileset, engine);
        fireOverlayRef.current = fireVisuals;

        engine._updateOverlay = () => {
          const cells = engine.getBurningCells();
          fireVisuals.update(cells);
        };

        console.log('%c[App] Fire visuals: Shader + particles system', 'color: #00e5ff');
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

    // Fuel map overlay (hidden by default)
    const fuelOverlay = viewer.entities.add({
      name: 'Fuel Map',
      show: false,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(-118.600, 33.990, -118.440, 34.110),
        material: new Cesium.ImageMaterialProperty({
          image: engine.fuelCanvas.toDataURL(),
          transparent: false,
        }),
        height: 600,
        extrudedHeight: 601,
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

    // ---- Drones ----
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

    // ---- Drone animation ----
    let animFrame;
    const startTime = Date.now();
    function animateAll() {
      if (viewer.isDestroyed()) return;
      const elapsed = (Date.now() - startTime) / 1000;
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
      animFrame = requestAnimationFrame(animateAll);
    }
    animateAll();

    // ---- Click handler ----
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      console.log(`%c[App] Click at screen pos: (${click.position.x}, ${click.position.y}), igniteMode=${igniteModeRef.current}`, 'color: #aaa');

      // Ignite mode: click to start fire at clicked location
      if (igniteModeRef.current) {
        console.log('%c[App] IGNITE MODE CLICK — picking world position...', 'color: #ff4400; font-weight: bold');
        const position = pickWorldPosition(viewer, click.position);
        if (position) {
          handleIgnite(position);
        } else {
          console.error('[App] FAILED to pick any world position! No terrain/tiles under cursor.');
        }
        return;
      }

      // Normal: select drone
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id?.properties?.type?.getValue() === 'drone') {
        setSelectedDrone(picked.id.properties.droneId.getValue());
      } else {
        setSelectedDrone(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Try multiple pick strategies (3D tiles, globe, ellipsoid)
    function pickWorldPosition(viewer, screenPos) {
      // 1. pickPosition — works on 3D tiles and terrain
      let cartesian = viewer.scene.pickPosition(screenPos);
      if (cartesian && Cesium.defined(cartesian)) {
        const c = Cesium.Cartographic.fromCartesian(cartesian);
        console.log(`%c[Pick] Method 1 (pickPosition) SUCCESS: lat=${Cesium.Math.toDegrees(c.latitude).toFixed(5)}, lng=${Cesium.Math.toDegrees(c.longitude).toFixed(5)}, alt=${c.height.toFixed(1)}`, 'color: #0f0');
        return cartesian;
      }
      console.log('%c[Pick] Method 1 (pickPosition) failed', 'color: #ff0');

      // 2. Globe pick via ray
      const ray = viewer.camera.getPickRay(screenPos);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (cartesian && Cesium.defined(cartesian)) {
          const c = Cesium.Cartographic.fromCartesian(cartesian);
          console.log(`%c[Pick] Method 2 (globe.pick) SUCCESS: lat=${Cesium.Math.toDegrees(c.latitude).toFixed(5)}, lng=${Cesium.Math.toDegrees(c.longitude).toFixed(5)}`, 'color: #0f0');
          return cartesian;
        }
        console.log('%c[Pick] Method 2 (globe.pick) failed', 'color: #ff0');
      }

      // 3. Fallback: ray-ellipsoid intersection (always works, gives surface point)
      if (ray) {
        cartesian = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid);
        if (cartesian && Cesium.defined(cartesian)) {
          const c = Cesium.Cartographic.fromCartesian(cartesian);
          console.log(`%c[Pick] Method 3 (pickEllipsoid) SUCCESS: lat=${Cesium.Math.toDegrees(c.latitude).toFixed(5)}, lng=${Cesium.Math.toDegrees(c.longitude).toFixed(5)}`, 'color: #0f0');
          return cartesian;
        }
        console.log('%c[Pick] Method 3 (pickEllipsoid) failed', 'color: #f00');
      }

      console.error('[Pick] ALL 3 methods failed!');
      return null;
    }

    function handleIgnite(cartesian) {
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lng = Cesium.Math.toDegrees(carto.longitude);

      console.log(`%c[App] handleIgnite: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}`, 'color: #ff4400; font-weight: bold');
      console.log(`%c[App] Grid bounds check: lat in [${engine.bounds.minLat}, ${engine.bounds.maxLat}]=${lat >= engine.bounds.minLat && lat <= engine.bounds.maxLat}, lng in [${engine.bounds.minLng}, ${engine.bounds.maxLng}]=${lng >= engine.bounds.minLng && lng <= engine.bounds.maxLng}`, 'color: #ff4400');

      const didIgnite = engine.ignite(lat, lng, 3);
      console.log(`%c[App] engine.ignite() returned: ${didIgnite}`, didIgnite ? 'color: #0f0; font-weight: bold' : 'color: #f00; font-weight: bold');

      if (didIgnite) {
        // Immediately update the fire overlay so ignition is visible
        console.log('%c[App] Updating fire overlay...', 'color: #ff8800');
        if (engine._updateOverlay) {
          engine._updateOverlay();
          console.log('%c[App] Fire overlay updated (new dataURL pushed to Cesium)', 'color: #0f0');
        } else {
          console.error('[App] engine._updateOverlay is not defined!');
        }
        setFireStats(engine.getStats());
        setFireRunning(true);

        // Add ignition marker
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, 100),
          point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.YELLOW, outlineWidth: 2 },
          label: {
            text: 'IGNITION',
            font: '10px monospace',
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12000),
          },
        });
      }

      // Stay in ignite mode so user can click multiple ignition points
      // Click IGNITE button again or CANCEL to exit
    }

    return () => {
      cancelAnimationFrame(animFrame);
      if (fireIntervalRef.current) clearInterval(fireIntervalRef.current);
      handler.destroy();
      if (fireOverlayRef.current && fireOverlayRef.current.destroy) {
        fireOverlayRef.current.destroy();
      }
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
      console.log(`%c[App] Starting fire simulation interval: ${tickMs}ms per tick (speed=${fireSpeed}x)`, 'color: #ff8800; font-weight: bold');
      fireIntervalRef.current = setInterval(() => {
        const engine = fireEngineRef.current;
        if (!engine || (viewerRef.current && viewerRef.current.isDestroyed())) return;
        engine.tick();
        if (engine._updateOverlay) engine._updateOverlay();
        setFireStats(engine.getStats());
      }, tickMs);
    } else {
      console.log(`%c[App] Fire sim interval cleared (running=${fireRunning}, engine=${!!fireEngineRef.current})`, 'color: #888');
    }

    return () => {
      if (fireIntervalRef.current) clearInterval(fireIntervalRef.current);
    };
  }, [fireRunning, fireSpeed]);

  // ---- Wind updates ----
  useEffect(() => {
    if (fireEngineRef.current) {
      fireEngineRef.current.setWind(windSpeed, windDir);
    }
  }, [windSpeed, windDir]);

  // ---- Fuel map toggle ----
  useEffect(() => {
    if (fuelOverlayRef.current) {
      fuelOverlayRef.current.show = showFuelMap;
    }
    // firePoints is a PointPrimitiveCollection — toggle via show property
    if (fireOverlayRef.current) {
      fireOverlayRef.current.show = !showFuelMap;
    }
  }, [showFuelMap]);

  // ---- Toggle layers ----
  useEffect(() => {
    entitiesRef.current.evacEntities.forEach(e => { e.show = showEvac; });
  }, [showEvac]);
  useEffect(() => {
    entitiesRef.current.droneEntities.forEach(e => { e.show = showDrones; });
  }, [showDrones]);
  useEffect(() => {
    entitiesRef.current.pathEntities.forEach(e => { e.show = showPaths; });
  }, [showPaths]);

  // ---- Camera presets ----
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

  const selDrone = selectedDrone ? DRONES.find(d => d.id === selectedDrone) : null;

  // Cursor
  const cursor = igniteMode ? 'crosshair' : 'default';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', cursor }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ---- HUD Top ---- */}
      <div className="hud-top">
        <div className="hud-title">
          <span className="fire-dot" /> FIRESIGHT — WILDFIRE SIM
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
          IGNITE MODE — Click on the 3D terrain to start fires (multiple clicks allowed)
          <button onClick={() => { setIgniteMode(false); igniteModeRef.current = false; }}>DONE</button>
        </div>
      )}

      {/* ---- Fire Simulation Controls (left panel) ---- */}
      <div className="fire-panel">
        <div className="panel-header fire-header">FIRE SIMULATION</div>

        {/* Ignite / Reset */}
        <div className="fire-actions">
          <button
            className={`ignite-btn ${igniteMode ? 'active' : ''}`}
            onClick={() => {
              const next = !igniteMode;
              console.log(`%c[App] IGNITE button clicked, mode: ${next ? 'ON' : 'OFF'}`, 'color: #ff4400; font-weight: bold');
              setIgniteMode(next);
              igniteModeRef.current = next;
            }}
          >
            {igniteMode ? 'CLICK TERRAIN...' : 'IGNITE'}
          </button>
          <button
            className="reset-btn"
            onClick={() => {
              if (fireEngineRef.current) {
                fireEngineRef.current.reset();
                if (fireEngineRef.current._updateOverlay) fireEngineRef.current._updateOverlay();
                setFireStats(null);
                setFireRunning(false);
              }
            }}
          >
            RESET
          </button>
        </div>

        {/* Play / Pause / Speed */}
        <div className="fire-playback">
          <button
            className={fireRunning ? 'pause-btn' : 'play-btn'}
            onClick={() => setFireRunning(!fireRunning)}
          >
            {fireRunning ? 'PAUSE' : 'PLAY'}
          </button>
          <div className="speed-btns">
            {[1, 2, 4, 8].map(s => (
              <button
                key={s}
                className={fireSpeed === s ? 'active' : ''}
                onClick={() => setFireSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Wind Controls */}
        <div className="wind-section">
          <div className="wind-header">
            WIND — {windSpeed} km/h {windLabel(windDir)}
          </div>
          <div className="wind-control">
            <label>Speed</label>
            <input
              type="range" min="0" max="80" step="5"
              value={windSpeed}
              onChange={e => setWindSpeed(Number(e.target.value))}
            />
          </div>
          <div className="wind-control">
            <label>Dir</label>
            <input
              type="range" min="0" max="360" step="45"
              value={windDir}
              onChange={e => setWindDir(Number(e.target.value))}
            />
          </div>
          {/* Wind compass */}
          <div className="wind-compass">
            <div className="compass-arrow" style={{ transform: `rotate(${windDir + 180}deg)` }}>
              <span className="arrow-tip" />
            </div>
            <span className="compass-label">N</span>
          </div>
        </div>

        {/* Fire Stats */}
        {fireStats && (
          <div className="fire-stats">
            <div className="stat-row">
              <span className="stat-label">BURNING</span>
              <span className="stat-val burning">{fireStats.burningAreaKm2} km²</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">BURNED</span>
              <span className="stat-val burned">{fireStats.burnedAreaKm2} km²</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">TOTAL FIRE</span>
              <span className="stat-val">{fireStats.totalFireAreaKm2} km²</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">SIM TIME</span>
              <span className="stat-val">{fireStats.simMinutes} min</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">CONTAINMENT</span>
              <span className="stat-val">{fireStats.containmentPct}%</span>
            </div>
          </div>
        )}

        {/* Fuel Map Toggle */}
        <button
          className={`fuel-toggle ${showFuelMap ? 'active' : ''}`}
          onClick={() => setShowFuelMap(!showFuelMap)}
        >
          {showFuelMap ? 'HIDE FUEL MAP' : 'SHOW FUEL MAP'}
        </button>

        {/* Fuel legend */}
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

      {/* ---- Drone Fleet Panel (below fire panel on left) ---- */}
      <div className="fleet-panel">
        <div className="panel-header">DRONE FLEET</div>
        {DRONES.map(drone => (
          <div
            key={drone.id}
            className={`drone-card ${selectedDrone === drone.id ? 'selected' : ''}`}
            onClick={() => { setSelectedDrone(drone.id); followDrone(drone.id); }}
          >
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

      {/* ---- Controls (right) ---- */}
      <div className="controls-panel">
        <button className={showDrones ? 'active' : ''} onClick={() => setShowDrones(!showDrones)}>DRONES</button>
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
