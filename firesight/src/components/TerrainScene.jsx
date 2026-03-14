import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────
const TERRAIN_SIZE = 80;
const TERRAIN_SEGS = 128;

// Fire zones: [now=0, +1h=1, +3h=2]
const FIRE_ZONES = [
  { cx: -10, cz: -6, radius: 7, color: new THREE.Color(1.0, 0.15, 0.05), slot: 0, particles: 500 },
  { cx: -5, cz: 2, radius: 12, color: new THREE.Color(1.0, 0.48, 0.06), slot: 1, particles: 400 },
  { cx: 5, cz: 10, radius: 19, color: new THREE.Color(1.0, 0.82, 0.08), slot: 2, particles: 350 },
];

const CAM_RADIUS = 68;
const CAM_HEIGHT = 50;
const CAM_SPEED = 0.035;

// ─── Terrain height ──────────────────────────────────────────────────────
function getHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.07 + 1.2) * Math.cos(z * 0.06) * 9;
  h += Math.sin(x * 0.14 + 2.4) * Math.cos(z * 0.12 + 1.1) * 5.5;
  h += Math.sin(x * 0.28 + 0.5) * Math.cos(z * 0.27 + 2.2) * 2.8;
  h += Math.sin(x * 0.56 + 1.8) * Math.cos(z * 0.54 + 0.7) * 1.4;
  h += Math.sin(x * 1.12) * Math.cos(z * 1.10 + 0.3) * 0.7;
  h += Math.sin(x * 2.24 + 3.1) * Math.cos(z * 2.21 + 1.5) * 0.35;
  return Math.max(0.1, h + 4.5);
}

// ─── Terrain vertex color — brighter, more readable ──────────────────────
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
    // Outer heat halo — much softer
    grad.addColorStop(0.0, `rgba(${r},${g},${b},0.35)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.15)`);
    grad.addColorStop(0.75, `rgba(${r},${g},${b},0.04)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0.00)`);
  } else {
    // Core fire overlay — bright center
    grad.addColorStop(0.0, `rgba(${r},${g},${b},0.90)`);
    grad.addColorStop(0.25, `rgba(${r},${g},${b},0.65)`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},0.30)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0.00)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
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
    opacity: soft ? 0.6 : 0.95,
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
    color: zone.color,
    size: zone.slot === 0 ? 1.2 : zone.slot === 1 ? 1.0 : 0.8,
    map: glowTex,
    transparent: true,
    opacity: zone.slot === 0 ? 0.92 : zone.slot === 1 ? 0.78 : 0.60,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { opacities, speeds, offsets, zone, count };
  points.visible = false;
  return points;
}

// ─── Fire perimeter ring (outline) ───────────────────────────────────────
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

// ─── Wind arrow grid (NW direction) ──────────────────────────────────────
function buildWindArrows() {
  const group = new THREE.Group();
  const dir = new THREE.Vector3(-1, 0, -1).normalize();
  const spacing = 14;
  const count = 5;
  const half = (count - 1) * spacing / 2;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const x = i * spacing - half;
      const z = j * spacing - half;
      const y = getHeight(x, z) + 3.5;
      const arrow = new THREE.ArrowHelper(
        dir, new THREE.Vector3(x, y, z),
        2.8, 0x6EA8D7, 0.8, 0.45
      );
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.45;
      arrow.line.material.blending = THREE.AdditiveBlending;
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.45;
      arrow.cone.material.blending = THREE.AdditiveBlending;
      group.add(arrow);
    }
  }
  group.visible = false;
  return group;
}

// ─── Swarm drone group ────────────────────────────────────────────────────
const DRONE_POSITIONS = [
  [-15, -12], [-5, -18], [8, -14], [18, -8],
  [16,   4],  [ 6,  14], [-8,  16], [-18,  6],
];

function buildSwarmGroup() {
  const group = new THREE.Group();

  DRONE_POSITIONS.forEach(([x, z]) => {
    const y = getHeight(x, z) + 4.5;

    // Drone body — small glowing sphere
    const bodyGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0x6EA8D7,
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(x, y, z);
    group.add(body);

    // Coverage disc on ground
    const discGeo = new THREE.CircleGeometry(7, 32);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x6EA8D7,
      transparent: true, opacity: 0.04,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(x, getHeight(x, z) + 0.2, z);
    group.add(disc);
  });

  group.visible = false;
  return group;
}

// ─── Evac routes ──────────────────────────────────────────────────────────
const EVAC_ROUTES = [
  {
    points: [[-12, -5], [-25, -15], [-38, -28]],
    color: 0x10B981, // green — clear
  },
  {
    points: [[0, -8], [10, -25], [25, -38]],
    color: 0x10B981, // green — clear
  },
  {
    points: [[5, 10], [15, 22], [20, 35]],
    color: 0xFF4444, // red — blocked
  },
];

function buildEvacRoutes() {
  const group = new THREE.Group();

  EVAC_ROUTES.forEach(({ points, color }) => {
    const curvePts = points.map(([x, z]) =>
      new THREE.Vector3(x, getHeight(x, z) + 0.5, z)
    );
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.22, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true, opacity: 0.82,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tube);
  });

  group.visible = false;
  return group;
}

// ─── Deploy units ─────────────────────────────────────────────────────────
const CREW_POSITIONS  = [[-14, -4], [-8, 2], [2, -10], [-20, 0]];
const TANKER_POSITIONS = [[0, -20], [-20, -20]];

function buildDeployGroup() {
  const group = new THREE.Group();

  // Ground crews — orange cones
  CREW_POSITIONS.forEach(([x, z]) => {
    const y = getHeight(x, z);
    const geo = new THREE.ConeGeometry(0.45, 1.2, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xF27D26,
      transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(x, y + 0.6, z);
    group.add(cone);
  });

  // Air tankers — blue flat boxes at altitude
  TANKER_POSITIONS.forEach(([x, z]) => {
    const y = getHeight(x, z) + 9;
    const geo = new THREE.BoxGeometry(0.8, 0.3, 1.4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6EA8D7,
      transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const box = new THREE.Mesh(geo, mat);
    box.position.set(x, y, z);
    group.add(box);
  });

  group.visible = false;
  return group;
}

// ─── Subtle grid overlay ─────────────────────────────────────────────────
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

// ─── Main component ─────────────────────────────────────────────────────
export default function TerrainScene({ timeSlot, onTerrainClick, simulationMode, activeLayers, swarmActive, evacActive, deployActive }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  const handleClick = useCallback((e) => {
    const { renderer, camera, terrain } = sceneRef.current;
    if (!renderer || !camera || !terrain) return;

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(terrain);
    if (hits.length > 0) {
      const pt = hits[0].point;
      onTerrainClick?.({
        screenX: e.clientX,
        screenY: e.clientY,
        worldPos: { x: pt.x, z: pt.z },
      });
    }
  }, [onTerrainClick]);

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
    container.appendChild(renderer.domElement);

    // ── Scene ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080e18, 0.005);
    scene.background = new THREE.Color(0x060a10);

    // ── Camera ───────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 400);
    camera.position.set(0, CAM_HEIGHT, CAM_RADIUS);
    camera.lookAt(0, 4, 0);

    // ── Lighting — multi-source for readable terrain ────────────────
    // Ambient fill — cool blue, fairly bright
    const ambient = new THREE.AmbientLight(0x304868, 2.0);
    scene.add(ambient);

    // Primary directional — moonlight from upper-left
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

    // Warm rim light — catches ridge edges
    const rim = new THREE.DirectionalLight(0xddaa66, 0.7);
    rim.position.set(25, 20, -30);
    scene.add(rim);

    // Cool fill from front — lifts shadow areas
    const fill = new THREE.DirectionalLight(0x445566, 0.5);
    fill.position.set(0, 10, 50);
    scene.add(fill);

    // Hemisphere light — sky/ground color separation
    const hemi = new THREE.HemisphereLight(0x445577, 0x1a1a10, 0.6);
    scene.add(hemi);

    // ── Terrain — Phong for specular ridge highlights ───────────────
    const geo = buildTerrain();
    const terrainMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 12,
      specular: new THREE.Color(0x334455),
    });
    const terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // ── Grid ────────────────────────────────────────────────────────
    scene.add(buildGridOverlay());

    // ── Fire overlays + heat halos + particles + lights ─────────────
    const glowTex = makeGlowTexture();
    const overlays = [];
    const halos = [];
    const particleSystems = [];
    const fireLights = [];

    FIRE_ZONES.forEach((zone) => {
      // Core overlay
      const overlay = buildFireOverlay(zone, false);
      scene.add(overlay);
      overlays.push(overlay);

      // Heat halo (larger, softer)
      const halo = buildFireOverlay(zone, true);
      scene.add(halo);
      halos.push(halo);

      // Particles
      const ps = buildFireParticles(zone, glowTex);
      scene.add(ps);
      particleSystems.push(ps);

      // Point light — strong glow on terrain
      const light = new THREE.PointLight(zone.color, 0, zone.radius * 6, 1.5);
      const lh = getHeight(zone.cx, zone.cz);
      light.position.set(zone.cx, lh + 6, zone.cz);
      scene.add(light);
      fireLights.push(light);
    });

    // ── Perimeter rings (simulation mode outlines) ──────────────────
    const perimeterRings = FIRE_ZONES.map((zone) => {
      const ring = buildPerimeterRing(zone);
      scene.add(ring);
      return ring;
    });

    // ── Wind arrow grid ──────────────────────────────────────────────
    const windArrows = buildWindArrows();
    scene.add(windArrows);

    // ── Swarm drones ──────────────────────────────────────────────
    const swarmGroup = buildSwarmGroup();
    scene.add(swarmGroup);

    // ── Evac routes ───────────────────────────────────────────────
    const evacRoutes = buildEvacRoutes();
    scene.add(evacRoutes);

    // ── Deploy units ──────────────────────────────────────────────
    const deployGroup = buildDeployGroup();
    scene.add(deployGroup);

    // ── Store refs ──────────────────────────────────────────────────
    sceneRef.current = {
      renderer, scene, camera, terrain: terrainMesh,
      overlays, halos, particleSystems, fireLights,
      perimeterRings, windArrows,
      swarmGroup, evacRoutes, deployGroup,
      camAngle: 0,
    };

    // Show zone 0 immediately
    overlays[0].visible = true;
    halos[0].visible = true;
    particleSystems[0].visible = true;
    fireLights[0].intensity = 6.0;

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
    let frameId;
    const clock = new THREE.Clock();

    function animate() {
      frameId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.elapsedTime;

      const s = sceneRef.current;
      if (!s.renderer) return;

      // Camera orbit
      s.camAngle += CAM_SPEED * dt;
      const cx = Math.sin(s.camAngle) * CAM_RADIUS;
      const cz = Math.cos(s.camAngle) * CAM_RADIUS;
      s.camera.position.set(cx, CAM_HEIGHT, cz);
      s.camera.lookAt(0, 4, 0);

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

        // Subtle pulse
        const base = zone.slot === 0 ? 0.85 : zone.slot === 1 ? 0.70 : 0.55;
        ps.material.opacity = base + Math.sin(elapsed * 2.5 + zone.slot) * 0.08;
      });

      // Pulse fire lights
      s.fireLights.forEach((light, idx) => {
        if (light.intensity > 0) {
          const base = 5.0 + idx * 0.5;
          light.intensity = base + Math.sin(elapsed * 2.8 + idx * 1.5) * 1.2;
        }
      });

      s.renderer.render(s.scene, s.camera);
    }
    animate();

    // ── Cleanup ─────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      resizeObs.disconnect();
      geo.dispose();
      terrainMat.dispose();
      glowTex.dispose();
      overlays.forEach((o) => { o.geometry.dispose(); o.material.dispose(); });
      halos.forEach((o) => { o.geometry.dispose(); o.material.dispose(); });
      particleSystems.forEach((ps) => { ps.geometry.dispose(); ps.material.dispose(); });
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
    const { overlays, halos, particleSystems, fireLights } = sceneRef.current;
    if (!overlays) return;

    overlays.forEach((overlay, idx) => {
      const zone = FIRE_ZONES[idx];
      const visible = zone.slot <= timeSlot;
      overlay.visible = visible;
      halos[idx].visible = visible;
      particleSystems[idx].visible = visible;
      fireLights[idx].intensity = visible ? 6.0 : 0;
    });
  }, [timeSlot]);

  // ── Respond to simulationMode — perimeter ring visibility ─────────────
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
      <SceneOverlay />
    </div>
  );
}

// ─── Scene overlay ──────────────────────────────────────────────────────
function SceneOverlay() {
  return (
    <>
      <div style={{
        position: 'absolute', top: 14, left: 14,
        pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          color: 'rgba(200,210,225,0.38)',
          letterSpacing: '0.06em',
          fontWeight: 500,
        }}>
          Pine Ridge Fire — Zone 7B
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: 'rgba(180,195,215,0.22)',
          letterSpacing: '0.04em',
        }}>
          38.847° N  120.891° W
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 12, right: 14,
        pointerEvents: 'none',
        fontFamily: "'Inter', sans-serif",
        fontSize: 9,
        color: 'rgba(180,195,215,0.22)',
        letterSpacing: '0.04em',
      }}>
        Click terrain for actions
      </div>

      <Compass />
    </>
  );
}

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
