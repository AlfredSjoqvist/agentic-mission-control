import React, { useEffect, useRef, useCallback, useState } from 'react';
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

// ─── Glow sprite (sharp for detail particles) ────────────────────────────
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

// ─── Soft volume sprite (wide falloff for flame body) ────────────────────
function makeSoftGlowTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
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

  // Compute slope colors from vertex normals (steeper = more red)
  const normals = geo.attributes.normal;
  const slopeColorArr = [];
  for (let i = 0; i < normals.count; i++) {
    const ny = Math.abs(normals.getY(i)); // 1 = flat, 0 = vertical
    const steepness = 1 - ny; // 0 = flat, 1 = cliff
    // Flat → green, moderate → yellow, steep → red
    if (steepness < 0.15) {
      slopeColorArr.push(0.1, 0.4, 0.15);
    } else if (steepness < 0.3) {
      slopeColorArr.push(0.3, 0.45, 0.1);
    } else if (steepness < 0.5) {
      slopeColorArr.push(0.6, 0.5, 0.08);
    } else if (steepness < 0.7) {
      slopeColorArr.push(0.8, 0.3, 0.05);
    } else {
      slopeColorArr.push(0.9, 0.1, 0.05);
    }
  }
  geo.userData = {
    heightColors: new Float32Array(colorArr),
    slopeColors: new Float32Array(slopeColorArr),
  };

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
    opacity: soft ? 0.3 : 0.5,
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

// ─── Fire particles (temperature-gradient vertex colors) ────────────────
function buildFireParticles(zone, glowTex) {
  const count = zone.particles;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
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

    colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.55; colors[i * 3 + 2] = 0.12;

    opacities[i] = Math.random();
    speeds[i] = 0.016 + Math.random() * 0.04;
    offsets[i * 2 + 0] = bx;
    offsets[i * 2 + 1] = bz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const baseSize = zone.slot === 0 ? 2.5 : zone.slot === 1 ? 2.0 : 1.6;
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size: baseSize,
    map: glowTex,
    transparent: true,
    opacity: zone.slot === 0 ? 0.55 : zone.slot === 1 ? 0.45 : 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { opacities, speeds, offsets, zone, count, baseSize };
  points.visible = false;
  return points;
}

// ─── Volume flame particles (large, overlapping for body/mass) ───────────
function buildFireVolume(zone, softTex) {
  const count = zone.slot === 0 ? 120 : zone.slot === 1 ? 80 : 60;
  const positions = new Float32Array(count * 3);
  const volColors = new Float32Array(count * 3);
  const opacities = new Float32Array(count);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    // Tighter cluster than detail particles — 60% of radius
    const r = Math.sqrt(Math.random()) * zone.radius * 0.6;
    const theta = Math.random() * Math.PI * 2;
    const bx = zone.cx + Math.cos(theta) * r;
    const bz = zone.cz + Math.sin(theta) * r;
    const baseH = getHeight(bx, bz);
    positions[i * 3] = bx;
    positions[i * 3 + 1] = baseH + Math.random() * 3;
    positions[i * 3 + 2] = bz;
    // Start warm orange-yellow
    volColors[i * 3] = 1.0; volColors[i * 3 + 1] = 0.6; volColors[i * 3 + 2] = 0.1;
    opacities[i] = Math.random();
    speeds[i] = 0.01 + Math.random() * 0.025; // slower than detail particles
    offsets[i * 2] = bx; offsets[i * 2 + 1] = bz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(volColors, 3));

  const volSize = zone.slot === 0 ? 6.0 : zone.slot === 1 ? 5.0 : 4.0;
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size: volSize,
    map: softTex,
    transparent: true,
    opacity: 0.45,
    blending: THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { opacities, speeds, offsets, zone, count, baseSize: volSize };
  points.visible = false;
  return points;
}

// ─── Ember/spark particles ──────────────────────────────────────────────
function buildEmberParticles(zone, glowTex) {
  const count = 60;
  const positions = new Float32Array(count * 3);
  const opacities = new Float32Array(count);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * zone.radius * 0.7;
    const theta = Math.random() * Math.PI * 2;
    const bx = zone.cx + Math.cos(theta) * r;
    const bz = zone.cz + Math.sin(theta) * r;
    positions[i * 3] = bx;
    positions[i * 3 + 1] = getHeight(bx, bz) + Math.random() * 3;
    positions[i * 3 + 2] = bz;
    opacities[i] = Math.random() * 0.7;
    speeds[i] = 0.08 + Math.random() * 0.07;
    offsets[i * 2] = bx;
    offsets[i * 2 + 1] = bz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(1.0, 0.7, 0.2),
    size: 0.4,
    map: glowTex,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { opacities, speeds, offsets, zone, count };
  points.visible = false;
  return points;
}

// ─── Smoke particles ────────────────────────────────────────────────────
function buildSmokeParticles(zone, glowTex) {
  const count = 80;
  const positions = new Float32Array(count * 3);
  const opacities = new Float32Array(count);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * zone.radius * 0.9;
    const theta = Math.random() * Math.PI * 2;
    const bx = zone.cx + Math.cos(theta) * r;
    const bz = zone.cz + Math.sin(theta) * r;
    positions[i * 3] = bx;
    positions[i * 3 + 1] = getHeight(bx, bz) + 5 + Math.random() * 3;
    positions[i * 3 + 2] = bz;
    opacities[i] = Math.random() * 0.5;
    speeds[i] = 0.008 + Math.random() * 0.012;
    offsets[i * 2] = bx;
    offsets[i * 2 + 1] = bz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(0.15, 0.13, 0.12),
    size: 3.5,
    map: glowTex,
    transparent: true,
    opacity: 0.15,
    blending: THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { opacities, speeds, offsets, zone, count };
  points.visible = false;
  return points;
}


// ─── GLSL Shader Fire ────────────────────────────────────────────────────
function makeFireShaderMaterial(intensity = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      intensity: { value: intensity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float intensity;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        v += 0.5000 * noise(p); p = p * 2.02 + vec2(0.13);
        v += 0.2500 * noise(p); p = p * 2.03 + vec2(0.24);
        v += 0.1250 * noise(p); p = p * 2.01 + vec2(0.31);
        v += 0.0625 * noise(p);
        return v;
      }

      void main() {
        float cx = vUv.x * 2.0 - 1.0; // -1 to 1
        float cy = vUv.y;              // 0=bottom 1=top

        float t = time * 0.55;

        vec2 nCoord = vec2(cx * 0.7, cy - t);
        float n1 = fbm(nCoord * 3.0);
        float n2 = fbm(nCoord * 5.8 + vec2(5.2, 1.3));
        float n = n1 * 0.65 + n2 * 0.35;

        // Flame silhouette: wide base, narrow tip, noisy edge
        float shapeH = 1.0 - cy;
        float edgeR = shapeH * 0.82 + n * 0.38 - 0.12;
        float shape = smoothstep(-0.04, 0.22, edgeR - abs(cx));

        // Fade top and bottom
        float topFade = 1.0 - smoothstep(0.5, 1.0, cy);
        float botFade = smoothstep(0.0, 0.06, cy);

        float fire = shape * topFade * botFade * (0.55 + n * 0.75);
        fire = clamp(fire * intensity, 0.0, 1.0);

        // Color ramp: dark red → orange → warm yellow (NO white-hot)
        vec3 col = vec3(0.0);
        col = mix(col, vec3(0.55, 0.02, 0.0),  smoothstep(0.0,  0.20, fire));
        col = mix(col, vec3(0.90, 0.18, 0.01), smoothstep(0.12, 0.38, fire));
        col = mix(col, vec3(1.0,  0.45, 0.04), smoothstep(0.30, 0.58, fire));
        col = mix(col, vec3(1.0,  0.65, 0.12), smoothstep(0.50, 0.80, fire));

        float alpha = smoothstep(0.04, 0.30, fire) * 0.82;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function buildShaderFireGroup(zone) {
  const group = new THREE.Group();
  const fireH = (5.0 + zone.radius * 0.35) * (1.3 - zone.slot * 0.2);
  // Each plane is wide enough to overlap neighbors → continuous coverage
  const planeW = zone.radius * 1.4;

  // Scatter billboard planes within the zone.
  // All will track the camera → never seen edge-on.
  // Enough planes + overlap → looks continuous from any angle.
  const count = zone.slot === 0 ? 9 : zone.slot === 1 ? 7 : 5;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * zone.radius * 0.65;
    const theta = Math.random() * Math.PI * 2;
    const px = zone.cx + Math.cos(theta) * r;
    const pz = zone.cz + Math.sin(theta) * r;
    const bh = getHeight(px, pz);
    // Vary height slightly so layers don't all end at same point
    const h = fireH * (0.75 + Math.random() * 0.5);
    const w = planeW * (0.7 + Math.random() * 0.6);
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = makeFireShaderMaterial(0.22 + Math.random() * 0.12);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, bh + h * 0.48, pz);
    // No baseAngle — these always billboard
    group.add(mesh);
  }

  group.visible = false;
  return group;
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
  // 3×3 grid — just enough to show direction without cluttering
  const spacing = 22;
  const count = 3;
  const half = (count - 1) * spacing / 2;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const x = i * spacing - half;
      const z = j * spacing - half;
      const y = getHeight(x, z) + 3.5;
      const arrow = new THREE.ArrowHelper(
        dir, new THREE.Vector3(x, y, z),
        3.5, 0x6EA8D7, 1.0, 0.5
      );
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.28;
      arrow.line.material.blending = THREE.AdditiveBlending;
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.28;
      arrow.cone.material.blending = THREE.AdditiveBlending;
      group.add(arrow);
    }
  }
  group.visible = false;
  return group;
}

// ─── Build a 3-D quadcopter mesh ──────────────────────────────────────────
function buildDroneMesh() {
  const root = new THREE.Group();

  const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.6, metalness: 0.5 });
  const armMat   = new THREE.MeshStandardMaterial({ color: 0x333345, roughness: 0.7, metalness: 0.4 });
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x5588aa, roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x4a90c4, roughness: 0.4, metalness: 0.5 });

  // Central body
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), bodyMat));

  // Top sensor dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
  dome.position.y = 0.08;
  root.add(dome);

  // 4 diagonal arms + motor housing + rotor at each tip
  const ARM_DIST = 0.68;
  [45, 135, 225, 315].forEach((deg) => {
    const rad = (deg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dz = Math.cos(rad);

    // Arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.95, 6), armMat);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -rad;
    arm.position.set(dx * ARM_DIST / 2, 0, dz * ARM_DIST / 2);
    root.add(arm);

    const tipX = dx * ARM_DIST;
    const tipZ = dz * ARM_DIST;

    // Motor block
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.11, 8), armMat);
    motor.position.set(tipX, 0, tipZ);
    root.add(motor);

    // Rotor disc (thin flat cylinder)
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 20), rotorMat);
    rotor.position.set(tipX, 0.07, tipZ);
    rotor.userData.isRotor = true;
    rotor.userData.rotorPhase = deg;
    root.add(rotor);

    // Propeller cross blades
    ['x', 'z'].forEach((axis) => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(
        axis === 'x' ? 0.6 : 0.055,
        0.01,
        axis === 'z' ? 0.6 : 0.055
      ), rotorMat);
      blade.position.set(tipX, 0.07, tipZ);
      blade.userData.isRotor = true;
      blade.userData.rotorPhase = deg;
      root.add(blade);
    });

    // Landing leg
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 5), armMat);
    leg.position.set(tipX * 0.55, -0.16, tipZ * 0.55);
    root.add(leg);
  });

  // Skid rails
  [-0.34, 0.34].forEach((off) => {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.65, 5), armMat);
    skid.rotation.z = Math.PI / 2;
    skid.position.set(0, -0.24, off);
    root.add(skid);
  });

  return root;
}

// ─── Swarm drone group ────────────────────────────────────────────────────
const DRONE_POSITIONS = [
  [-15, -12], [-5, -18], [8, -14], [18, -8],
  [16,   4],  [ 6,  14], [-8,  16], [-18,  6],
];

function buildSwarmGroup() {
  const group = new THREE.Group();

  DRONE_POSITIONS.forEach(([x, z], idx) => {
    const y = getHeight(x, z) + 4.5;
    const droneGroup = buildDroneMesh();
    droneGroup.position.set(x, y, z);
    droneGroup.rotation.y = (idx * Math.PI) / 4;
    droneGroup.userData.unitType = 'drone';
    droneGroup.userData.label = `Drone #${idx + 1}`;

    group.add(droneGroup);

    // Coverage ring on ground
    const ringGeo = new THREE.RingGeometry(4.5, 5.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x6EA8D7, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.position.set(x, getHeight(x, z) + 0.2, z);
    ring.userData.unitType = 'ring';
    group.add(ring);
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
    const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.14, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true, opacity: 0.65,
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

  // Ground crews — location pin (sphere head + cylinder stem)
  CREW_POSITIONS.forEach(([x, z], idx) => {
    const baseH = getHeight(x, z);
    const crewGroup = new THREE.Group();
    crewGroup.position.set(x, baseH + 0.45, z);
    crewGroup.userData.unitType = 'crew';
    crewGroup.userData.label = `Ground Crew ${String.fromCharCode(65 + idx)}`;

    const mat = new THREE.MeshBasicMaterial({
      color: 0xF27D26, transparent: true, opacity: 0.82,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat);
    head.position.y = 0.42;
    crewGroup.add(head);
    crewGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6), mat.clone()));
    group.add(crewGroup);
  });

  // Air tankers — airplane silhouette (fuselage + wings + tail)
  TANKER_POSITIONS.forEach(([x, z], idx) => {
    const y = getHeight(x, z) + 9;
    const tankerGroup = new THREE.Group();
    tankerGroup.position.set(x, y, z);
    tankerGroup.userData.unitType = 'tanker';
    tankerGroup.userData.label = `Air Tanker ${idx + 1}`;

    const mat = new THREE.MeshBasicMaterial({
      color: 0xD0E8FF, transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    // Fuselage
    tankerGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.4), mat));
    // Wings
    const wings = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.38), mat.clone());
    wings.position.z = -0.1;
    tankerGroup.add(wings);
    // Tail fin
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.18), mat.clone());
    tail.position.z = 0.62;
    tankerGroup.add(tail);

    group.add(tankerGroup);
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
export default function TerrainScene({ timeSlot, sliderValue = 0, onTerrainClick, simulationMode, activeLayers, swarmActive, evacActive, deployActive, placedUnits }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const [tooltip, setTooltip] = useState(null);

  const handleMouseMove = useCallback((e) => {
    const { renderer, camera, swarmGroup, deployGroup } = sceneRef.current;
    if (!renderer || !camera) return;
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const targets = [];
    if (swarmGroup?.visible)
      swarmGroup.children.forEach(c => { if (c.userData?.label) targets.push(c); });
    if (deployGroup?.visible)
      deployGroup.children.forEach(c => { if (c.userData?.label) targets.push(c); });
    if (!targets.length) { setTooltip(null); return; }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(targets, true); // recursive into groups
    if (hits.length > 0) {
      // Walk up to find the labeled group
      let obj = hits[0].object;
      while (obj && !obj.userData?.label) obj = obj.parent;
      if (obj?.userData?.label) {
        setTooltip({ label: obj.userData.label, x: e.clientX, y: e.clientY });
        return;
      }
    }
    setTooltip(null);
  }, []);

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
    const softTex = makeSoftGlowTexture();
    const overlays = [];
    const halos = [];
    const particleSystems = [];
    const volumeSystems = [];
    const emberSystems = [];
    const smokeSystems = [];
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

      // Volume flame body (large overlapping particles)
      const vol = buildFireVolume(zone, softTex);
      scene.add(vol);
      volumeSystems.push(vol);

      // Detail particles
      const ps = buildFireParticles(zone, glowTex);
      scene.add(ps);
      particleSystems.push(ps);

      // Embers
      const embers = buildEmberParticles(zone, glowTex);
      scene.add(embers);
      emberSystems.push(embers);

      // Smoke
      const smoke = buildSmokeParticles(zone, glowTex);
      scene.add(smoke);
      smokeSystems.push(smoke);

      // Point light — strong glow on terrain
      const light = new THREE.PointLight(zone.color, 0, zone.radius * 6, 1.5);
      const lh = getHeight(zone.cx, zone.cz);
      light.position.set(zone.cx, lh + 6, zone.cz);
      scene.add(light);
      fireLights.push(light);
    });

    // ── Shader fire groups ───────────────────────────────────────────
    const shaderFireGroups = FIRE_ZONES.map((zone) => {
      const g = buildShaderFireGroup(zone);
      scene.add(g);
      return g;
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
      overlays, halos, particleSystems, volumeSystems, emberSystems, smokeSystems, fireLights,
      shaderFireGroups,
      perimeterRings, windArrows,
      swarmGroup, evacRoutes, deployGroup,
      camAngle: 0,
      spawnAnims: [],
    };

    // Show zone 0 immediately — shader fire replaces blob particles
    overlays[0].visible = true;
    halos[0].visible = true;
    volumeSystems[0].visible = false;   // replaced by shader fire
    particleSystems[0].visible = false; // replaced by shader fire
    emberSystems[0].visible = false;    // controlled by activeLayers.embers
    smokeSystems[0].visible = true;
    fireLights[0].intensity = 2.5;
    shaderFireGroups[0].visible = true;

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

      // Wind direction (NW → +x, -z)
      const windX = 0.012;
      const windZ = -0.008;

      // ── Animate flame particles (vertex colors + turbulent drift) ──
      s.particleSystems.forEach((ps) => {
        if (!ps.visible) return;
        const { opacities, speeds, offsets, zone, count, baseSize } = ps.userData;
        const posArr = ps.geometry.attributes.position.array;
        const colorArr = ps.geometry.attributes.color.array;

        for (let i = 0; i < count; i++) {
          // Accelerating rise (convection)
          posArr[i * 3 + 1] += speeds[i] * (1 + opacities[i] * 0.5);
          opacities[i] += speeds[i] * 0.35;

          // Turbulent multi-frequency drift + wind
          const drift = 0.015;
          posArr[i * 3] += Math.sin(elapsed * 1.8 + i * 0.37) * drift
            + Math.sin(elapsed * 3.1 + i * 1.2) * drift * 0.5
            + windX * speeds[i] * 8;
          posArr[i * 3 + 2] += Math.cos(elapsed * 2.2 + i * 0.53) * drift
            + Math.cos(elapsed * 3.7 + i * 0.9) * drift * 0.4
            + windZ * speeds[i] * 8;

          // Temperature gradient per zone:
          // slot 0 (intense core): yellow-white → orange → dark red
          // slot 1 (spreading): orange → dark orange → red
          // slot 2 (outer spread): dark orange → red → dim red
          const t = opacities[i];
          const sl = zone.slot;
          if (sl === 0) {
            colorArr[i * 3] = 1.0;
            colorArr[i * 3 + 1] = Math.max(0.08, 0.7 - t * 0.62);
            colorArr[i * 3 + 2] = Math.max(0.02, 0.25 - t * 0.23);
          } else if (sl === 1) {
            colorArr[i * 3] = 1.0;
            colorArr[i * 3 + 1] = Math.max(0.06, 0.45 - t * 0.39);
            colorArr[i * 3 + 2] = Math.max(0.01, 0.08 - t * 0.07);
          } else {
            colorArr[i * 3] = Math.max(0.6, 1.0 - t * 0.4);
            colorArr[i * 3 + 1] = Math.max(0.03, 0.3 - t * 0.27);
            colorArr[i * 3 + 2] = Math.max(0.01, 0.04 - t * 0.03);
          }

          if (opacities[i] > 1.0) {
            opacities[i] = 0;
            const r2 = Math.sqrt(Math.random()) * zone.radius * 0.85;
            const theta2 = Math.random() * Math.PI * 2;
            const nx = zone.cx + Math.cos(theta2) * r2;
            const nz = zone.cz + Math.sin(theta2) * r2;
            posArr[i * 3] = nx;
            posArr[i * 3 + 2] = nz;
            offsets[i * 2] = nx;
            offsets[i * 2 + 1] = nz;
            posArr[i * 3 + 1] = getHeight(nx, nz);
          }
        }
        ps.geometry.attributes.position.needsUpdate = true;
        ps.geometry.attributes.color.needsUpdate = true;

        // Flickering size
        ps.material.size = baseSize * (0.85 + Math.sin(elapsed * 5 + zone.slot * 2) * 0.15);

        // Subtle opacity pulse
        const opBase = zone.slot === 0 ? 0.55 : zone.slot === 1 ? 0.45 : 0.35;
        ps.material.opacity = opBase + Math.sin(elapsed * 2.5 + zone.slot) * 0.06;
      });

      // ── Animate volume flame body ──
      if (s.volumeSystems) s.volumeSystems.forEach((ps) => {
        if (!ps.visible) return;
        const { opacities, speeds, offsets, zone, count, baseSize } = ps.userData;
        const posArr = ps.geometry.attributes.position.array;
        const colorArr = ps.geometry.attributes.color.array;

        for (let i = 0; i < count; i++) {
          // Slow rise
          posArr[i * 3 + 1] += speeds[i] * 0.8;
          opacities[i] += speeds[i] * 0.25;

          // Gentle sway
          posArr[i * 3] += Math.sin(elapsed * 1.2 + i * 0.6) * 0.008 + windX * speeds[i] * 4;
          posArr[i * 3 + 2] += Math.cos(elapsed * 1.5 + i * 0.8) * 0.006 + windZ * speeds[i] * 4;

          // Color: bright yellow-white core → orange → dark red
          const t = opacities[i];
          const sl = zone.slot;
          if (sl === 0) {
            colorArr[i * 3] = 1.0;
            colorArr[i * 3 + 1] = Math.max(0.08, 0.45 - t * 0.37);
            colorArr[i * 3 + 2] = Math.max(0.01, 0.08 - t * 0.07);
          } else {
            colorArr[i * 3] = Math.max(0.7, 1.0 - t * 0.3);
            colorArr[i * 3 + 1] = Math.max(0.05, 0.35 - t * 0.3);
            colorArr[i * 3 + 2] = Math.max(0.01, 0.05 - t * 0.04);
          }

          if (opacities[i] > 1.0) {
            opacities[i] = 0;
            const r2 = Math.sqrt(Math.random()) * zone.radius * 0.6;
            const th = Math.random() * Math.PI * 2;
            const nx = zone.cx + Math.cos(th) * r2;
            const nz = zone.cz + Math.sin(th) * r2;
            posArr[i * 3] = nx;
            posArr[i * 3 + 2] = nz;
            offsets[i * 2] = nx; offsets[i * 2 + 1] = nz;
            posArr[i * 3 + 1] = getHeight(nx, nz);
          }
        }
        ps.geometry.attributes.position.needsUpdate = true;
        ps.geometry.attributes.color.needsUpdate = true;

        // Flickering volume size
        ps.material.size = baseSize * (0.8 + Math.sin(elapsed * 3 + zone.slot * 1.5) * 0.2);
      });

      // ── Animate ember particles ──
      if (s.emberSystems) s.emberSystems.forEach((ps) => {
        if (!ps.visible) return;
        const { opacities, speeds, offsets, zone, count } = ps.userData;
        const posArr = ps.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
          posArr[i * 3 + 1] += speeds[i];
          opacities[i] += speeds[i] * 0.6;
          posArr[i * 3] += Math.sin(elapsed * 4.5 + i * 1.7) * 0.03 + windX * 12 * speeds[i];
          posArr[i * 3 + 2] += Math.cos(elapsed * 3.9 + i * 2.1) * 0.025 + windZ * 12 * speeds[i];
          if (opacities[i] > 0.7) {
            opacities[i] = 0;
            const r2 = Math.sqrt(Math.random()) * zone.radius * 0.7;
            const th = Math.random() * Math.PI * 2;
            const nx = zone.cx + Math.cos(th) * r2;
            const nz = zone.cz + Math.sin(th) * r2;
            posArr[i * 3] = nx;
            posArr[i * 3 + 2] = nz;
            offsets[i * 2] = nx; offsets[i * 2 + 1] = nz;
            posArr[i * 3 + 1] = getHeight(nx, nz) + Math.random() * 2;
          }
        }
        ps.geometry.attributes.position.needsUpdate = true;
        ps.material.opacity = 0.7 + Math.sin(elapsed * 6 + zone.slot * 3) * 0.2;
      });

      // ── Animate smoke particles ──
      if (s.smokeSystems) s.smokeSystems.forEach((ps) => {
        if (!ps.visible) return;
        const { opacities, speeds, offsets, zone, count } = ps.userData;
        const posArr = ps.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
          posArr[i * 3 + 1] += speeds[i];
          opacities[i] += speeds[i] * 0.15;
          posArr[i * 3] += windX * 6 * speeds[i] + Math.sin(elapsed * 0.7 + i * 0.4) * 0.008;
          posArr[i * 3 + 2] += windZ * 6 * speeds[i] + Math.cos(elapsed * 0.9 + i * 0.6) * 0.008;
          if (opacities[i] > 0.5) {
            opacities[i] = 0;
            const r2 = Math.sqrt(Math.random()) * zone.radius * 0.9;
            const th = Math.random() * Math.PI * 2;
            const nx = zone.cx + Math.cos(th) * r2;
            const nz = zone.cz + Math.sin(th) * r2;
            posArr[i * 3] = nx;
            posArr[i * 3 + 2] = nz;
            offsets[i * 2] = nx; offsets[i * 2 + 1] = nz;
            posArr[i * 3 + 1] = getHeight(nx, nz) + 5 + Math.random() * 3;
          }
        }
        ps.geometry.attributes.position.needsUpdate = true;
        ps.material.opacity = 0.12 + Math.sin(elapsed * 1.5 + zone.slot) * 0.03;
      });

      // ── Billboard & animate shader fire planes ──
      if (s.shaderFireGroups) s.shaderFireGroups.forEach((group) => {
        if (!group.visible) return;
        group.children.forEach((mesh) => {
          // All planes face the camera (y-axis billboard) — never seen edge-on
          const dx = s.camera.position.x - mesh.position.x;
          const dz = s.camera.position.z - mesh.position.z;
          mesh.rotation.set(0, Math.atan2(dx, dz), 0);
          mesh.material.uniforms.time.value = elapsed;
        });
      });

      // Pulse fire lights
      s.fireLights.forEach((light, idx) => {
        if (light.intensity > 0) {
          const base = 1.2 + idx * 0.2;
          light.intensity = base + Math.sin(elapsed * 2.8 + idx * 1.5) * 0.3;
        }
      });

      // ── Spawn animations (fly-in / draw-in / drop-in) ──────────
      if (s.spawnAnims && s.spawnAnims.length > 0) {
        // Works for both single meshes and Groups
        const setOpacity = (obj, v) => {
          if (obj.material) { obj.material.opacity = v; }
          else { obj.traverse(c => { if (c.material) c.material.opacity = v; }); }
        };
        const now = performance.now();
        for (let i = s.spawnAnims.length - 1; i >= 0; i--) {
          const anim = s.spawnAnims[i];
          const t = Math.min((now - anim.startTime) / anim.duration, 1);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

          if (anim.type === 'position') {
            anim.mesh.position.y = anim.fromY + (anim.toY - anim.fromY) * eased;
            anim.mesh.scale.setScalar(0.3 + 0.7 * eased);
            setOpacity(anim.mesh, anim.targetOpacity * eased);
          } else if (anim.type === 'drawRange') {
            anim.mesh.geometry.setDrawRange(0, Math.round(anim.maxCount * eased));
          } else if (anim.type === 'flyIn') {
            anim.mesh.position.x = anim.fromX + (anim.toX - anim.fromX) * eased;
            anim.mesh.position.y = anim.fromY + (anim.toY - anim.fromY) * eased;
            anim.mesh.scale.setScalar(0.3 + 0.7 * eased);
            setOpacity(anim.mesh, anim.targetOpacity * eased);
          } else if (anim.type === 'discFade') {
            setOpacity(anim.mesh, anim.targetOpacity * eased);
          }

          if (t >= 1) s.spawnAnims.splice(i, 1);
        }
      }

      // Hovering bob + rotor spin for active drones
      if (s.swarmGroup?.visible) {
        s.swarmGroup.children.forEach((child, i) => {
          if (child.userData?.unitType === 'drone') {
            // Bob up/down
            child.position.y += Math.sin(elapsed * 2.5 + i * 1.2) * 0.003;
            // Spin rotors
            child.children.forEach((part) => {
              if (part.userData?.isRotor) {
                const dir = (part.userData.rotorPhase === 45 || part.userData.rotorPhase === 225) ? 1 : -1;
                part.rotation.y += 0.25 * dir;
              }
            });
          }
        });
      }

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
      volumeSystems.forEach((ps) => { ps.geometry.dispose(); ps.material.dispose(); });
      emberSystems.forEach((ps) => { ps.geometry.dispose(); ps.material.dispose(); });
      smokeSystems.forEach((ps) => { ps.geometry.dispose(); ps.material.dispose(); });
      shaderFireGroups.forEach((g) => { g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); });
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
    const s = sceneRef.current;
    const { overlays, halos, particleSystems, volumeSystems, emberSystems, smokeSystems, fireLights, shaderFireGroups } = s;
    if (!overlays) return;

    s._lastTimeSlot = timeSlot;

    // Continuous fire intensity per zone based on sliderValue (0-100)
    const zoneIntensity = [
      1.0,
      Math.min(1, Math.max(0, sliderValue / 50)),
      Math.min(1, Math.max(0, (sliderValue - 50) / 50)),
    ];

    const fireLayerOn = activeLayers?.fireSpread !== false;

    overlays.forEach((overlay, idx) => {
      const intensity = zoneIntensity[idx];
      const visible = intensity > 0.01 && fireLayerOn;
      overlay.visible = visible;
      overlay.material.opacity = intensity * 0.3;
      overlay.scale.setScalar(0.3 + intensity * 0.7);

      halos[idx].visible = visible;
      halos[idx].material.opacity = intensity * 0.15;
      halos[idx].scale.setScalar(0.3 + intensity * 0.7);

      // Volume/particle blobs hidden — replaced by shader fire
      if (volumeSystems) volumeSystems[idx].visible = false;
      particleSystems[idx].visible = false;

      // Shader fire
      if (shaderFireGroups) {
        shaderFireGroups[idx].visible = visible;
        shaderFireGroups[idx].children.forEach((mesh) => {
          // Scale down so 4 additive planes don't over-saturate
          mesh.material.uniforms.intensity.value = intensity * 0.28;
        });
      }

      emberSystems[idx].visible = visible && !!(activeLayers?.embers);
      if (emberSystems[idx].visible) {
        emberSystems[idx].material.opacity = intensity * 0.5;
      }

      smokeSystems[idx].visible = visible;
      smokeSystems[idx].material.opacity = intensity * 0.18;

      fireLights[idx].intensity = visible ? intensity * 1.4 : 0;
    });
  }, [sliderValue, timeSlot, activeLayers]);

  // ── Respond to simulationMode — perimeter ring visibility ─────────────
  useEffect(() => {
    const { perimeterRings } = sceneRef.current;
    if (!perimeterRings) return;
    const zoneIntensity = [
      1.0,
      Math.min(1, Math.max(0, sliderValue / 50)),
      Math.min(1, Math.max(0, (sliderValue - 50) / 50)),
    ];
    perimeterRings.forEach((ring, idx) => {
      const intensity = zoneIntensity[idx];
      ring.visible = simulationMode && intensity > 0.01;
      ring.material.opacity = intensity * 0.6;
      ring.scale.setScalar(0.3 + intensity * 0.7);
    });
  }, [simulationMode, sliderValue, timeSlot]);

  // ── Respond to activeLayers ───────────────────────────────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s.windArrows) return;

    // Wind arrows
    s.windArrows.visible = !!(activeLayers?.wind);

    // Fire Spread — toggle all fire visuals
    const fireOn = activeLayers?.fireSpread !== false;
    if (s.overlays) {
      s.overlays.forEach((o) => { if (!fireOn) o.visible = false; });
      s.halos.forEach((h) => { if (!fireOn) h.visible = false; });
      s.particleSystems.forEach((ps) => { if (!fireOn) ps.visible = false; });
      if (s.volumeSystems) s.volumeSystems.forEach((vs) => { vs.visible = false; });
      if (s.shaderFireGroups) s.shaderFireGroups.forEach((g) => { if (!fireOn) g.visible = false; });
      if (s.smokeSystems) s.smokeSystems.forEach((ss) => { if (!fireOn) ss.visible = false; });
      s.fireLights.forEach((l) => { if (!fireOn) l.intensity = 0; });
    }

    // Embers — toggle visibility (only visible when fire is also on)
    if (s.emberSystems) {
      s.emberSystems.forEach((ps) => {
        if (!fireOn || !activeLayers?.embers) {
          ps.visible = false;
        }
      });
    }

    // Slope — swap terrain vertex colors
    if (s.terrain?.geometry?.userData) {
      const geoData = s.terrain.geometry.userData;
      const colorAttr = s.terrain.geometry.attributes.color;
      if (activeLayers?.slope) {
        colorAttr.array.set(geoData.slopeColors);
      } else {
        colorAttr.array.set(geoData.heightColors);
      }
      colorAttr.needsUpdate = true;
    }
  }, [activeLayers]);

  // ── Respond to swarmActive — staggered fly-in from above ────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s.swarmGroup) return;
    if (!swarmActive) { s.swarmGroup.visible = false; return; }

    s.swarmGroup.visible = true;
    if (!s.spawnAnims) s.spawnAnims = [];
    const now = performance.now();

    let droneIdx = 0;
    s.swarmGroup.children.forEach((child) => {
      if (child.userData?.unitType === 'drone') {
        // Drone group — fly down from high
        const targetY = child.position.y;
        child.position.y = targetY + 20;
        child.scale.setScalar(0);
        child.traverse(c => { if (c.material) c.material.opacity = 0; });
        s.spawnAnims.push({
          type: 'position', mesh: child,
          fromY: targetY + 20, toY: targetY,
          targetOpacity: 0.85,
          startTime: now + droneIdx * 150, duration: 600,
        });
        droneIdx++;
      } else if (child.userData?.unitType === 'ring') {
        // Coverage ring — fade in
        child.material.opacity = 0;
        s.spawnAnims.push({
          type: 'discFade', mesh: child,
          targetOpacity: 0.18,
          startTime: now + droneIdx * 150 + 300, duration: 400,
        });
      }
    });
  }, [swarmActive]);

  // ── Respond to evacActive — progressive route draw ─────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s.evacRoutes) return;
    if (!evacActive) { s.evacRoutes.visible = false; return; }

    s.evacRoutes.visible = true;
    if (!s.spawnAnims) s.spawnAnims = [];
    const now = performance.now();

    s.evacRoutes.children.forEach((tube, idx) => {
      const totalVerts = tube.geometry.index
        ? tube.geometry.index.count
        : tube.geometry.attributes.position.count;
      tube.geometry.setDrawRange(0, 0);
      s.spawnAnims.push({
        type: 'drawRange', mesh: tube,
        maxCount: totalVerts,
        startTime: now + idx * 400, duration: 800,
      });
    });
  }, [evacActive]);

  // ── Respond to deployActive — drop-in crews, fly-in tankers ────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s.deployGroup) return;
    if (!deployActive) { s.deployGroup.visible = false; return; }

    s.deployGroup.visible = true;
    if (!s.spawnAnims) s.spawnAnims = [];
    const now = performance.now();

    let crewIdx = 0;
    let tankerIdx = 0;
    s.deployGroup.children.forEach((child) => {
      if (child.userData?.unitType === 'crew') {
        // Crew group — drop from above
        const targetY = child.position.y;
        child.position.y = targetY + 15;
        child.scale.setScalar(0);
        child.traverse(c => { if (c.material) c.material.opacity = 0; });
        s.spawnAnims.push({
          type: 'position', mesh: child,
          fromY: targetY + 15, toY: targetY,
          targetOpacity: 0.82,
          startTime: now + crewIdx * 200, duration: 400,
        });
        crewIdx++;
      } else if (child.userData?.unitType === 'tanker') {
        // Tanker group — fly in from far left
        const targetX = child.position.x;
        const targetY = child.position.y;
        child.position.x = -60;
        child.position.y = targetY + 10;
        child.scale.setScalar(0.3);
        child.traverse(c => { if (c.material) c.material.opacity = 0; });
        s.spawnAnims.push({
          type: 'flyIn', mesh: child,
          fromX: -60, toX: targetX,
          fromY: targetY + 10, toY: targetY,
          targetOpacity: 0.88,
          startTime: now + 800 + tankerIdx * 300, duration: 800,
        });
        tankerIdx++;
      }
    });
  }, [deployActive]);

  // ── Individually placed units from context menu ──────────────────────────
  const placedCountRef = useRef(0);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s.scene || !placedUnits) return;

    // Only process new units (avoid re-adding on re-render)
    const newUnits = placedUnits.slice(placedCountRef.current);
    if (newUnits.length === 0) return;
    placedCountRef.current = placedUnits.length;

    if (!s.placedGroup) {
      s.placedGroup = new THREE.Group();
      s.scene.add(s.placedGroup);
    }

    newUnits.forEach((unit) => {
      const { type, position } = unit;
      const px = position.x;
      const pz = position.z;
      const groundY = getHeight(px, pz);

      if (type === 'drone') {
        // Place a drone at this position with fly-in animation
        const drone = buildDroneMesh();
        drone.scale.setScalar(1.2);
        const targetY = groundY + 5;
        drone.position.set(px, targetY + 12, pz);
        drone.userData.unitType = 'drone';
        drone.userData.label = 'Recon Drone';
        s.placedGroup.add(drone);

        // Coverage ring
        const ringGeo = new THREE.RingGeometry(4.5, 5.0, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          color: 0x6EA8D7, transparent: true, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        ring.position.set(px, groundY + 0.2, pz);
        s.placedGroup.add(ring);

        // Animate descent
        const startTime = performance.now();
        const dur = 600;
        function animDrone(now) {
          const t = Math.min((now - startTime) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          drone.position.y = targetY + 12 * (1 - eased);
          ring.material.opacity = eased * 0.18;
          if (t < 1) requestAnimationFrame(animDrone);
        }
        requestAnimationFrame(animDrone);

        // Light
        const light = new THREE.PointLight(0x6EA8D7, 0.6, 10);
        light.position.set(px, targetY + 1, pz);
        s.placedGroup.add(light);

      } else if (type === 'crew') {
        // Place a crew marker (small cylinder + glow)
        const markerMat = new THREE.MeshStandardMaterial({ color: 0xF27D26, roughness: 0.4, metalness: 0.3 });
        const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8), markerMat);
        const targetY = groundY + 0.6;
        marker.position.set(px, targetY + 10, pz);
        marker.userData.unitType = 'crew';
        marker.userData.label = 'Ground Crew';
        s.placedGroup.add(marker);

        // Pole
        const poleMat = new THREE.MeshBasicMaterial({ color: 0xF27D26, transparent: true, opacity: 0.4 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), poleMat);
        pole.position.set(px, targetY + 1.5, pz);
        pole.visible = false;
        s.placedGroup.add(pole);

        // Light
        const light = new THREE.PointLight(0xF27D26, 0.8, 8);
        light.position.set(px, targetY + 2, pz);
        light.intensity = 0;
        s.placedGroup.add(light);

        // Drop animation
        const startTime = performance.now();
        const dur = 400;
        function animCrew(now) {
          const t = Math.min((now - startTime) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          marker.position.y = targetY + 10 * (1 - eased);
          light.intensity = eased * 0.8;
          if (t >= 1) pole.visible = true;
          if (t < 1) requestAnimationFrame(animCrew);
        }
        requestAnimationFrame(animCrew);

      } else if (type === 'evac') {
        // Place an evac waypoint marker (green diamond)
        const shape = new THREE.ConeGeometry(0.5, 1.0, 4);
        const mat = new THREE.MeshStandardMaterial({ color: 0x10B981, roughness: 0.4, metalness: 0.3 });
        const cone = new THREE.Mesh(shape, mat);
        const targetY = groundY + 1;
        cone.position.set(px, targetY, pz);
        cone.rotation.y = Math.PI / 4;
        cone.userData.unitType = 'evac';
        cone.userData.label = 'Evac Waypoint';
        s.placedGroup.add(cone);

        // Pulsing ring
        const ringGeo = new THREE.RingGeometry(1.5, 1.8, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          color: 0x10B981, transparent: true, opacity: 0.25,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        ring.position.set(px, groundY + 0.15, pz);
        s.placedGroup.add(ring);

        // Light
        const light = new THREE.PointLight(0x10B981, 0.5, 8);
        light.position.set(px, targetY + 1, pz);
        s.placedGroup.add(light);

        // Scale-in animation
        cone.scale.setScalar(0);
        const startTime = performance.now();
        const dur = 350;
        function animEvac(now) {
          const t = Math.min((now - startTime) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          cone.scale.setScalar(eased);
          ring.material.opacity = eased * 0.25;
          if (t < 1) requestAnimationFrame(animEvac);
        }
        requestAnimationFrame(animEvac);
      }
    });
  }, [placedUnits]);

  return (
    <div
      ref={mountRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
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
      <UnitLegend swarmActive={swarmActive} deployActive={deployActive} />
      <UnitTooltip tooltip={tooltip} />
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

// ─── Unit Legend ─────────────────────────────────────────────────────────
function UnitLegend({ swarmActive, deployActive }) {
  const items = [];
  if (swarmActive)  items.push({ color: '#6EA8D7', label: 'Drone' });
  if (deployActive) items.push({ color: '#F27D26', label: 'Ground Crew' });
  if (deployActive) items.push({ color: '#D0E8FF', label: 'Air Tanker' });
  if (!items.length) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 56, left: 14,
      pointerEvents: 'none',
      background: 'rgba(10,13,17,0.75)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      padding: '7px 11px',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{
        fontFamily: "'Inter', sans-serif", fontSize: 8,
        color: 'rgba(130,138,150,0.5)', letterSpacing: '0.14em',
        textTransform: 'uppercase', marginBottom: 2,
      }}>Units</div>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: `0 0 5px ${color}99`,
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: 'rgba(180,190,205,0.6)', letterSpacing: '0.04em',
          }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Unit Tooltip ─────────────────────────────────────────────────────────
function UnitTooltip({ tooltip }) {
  if (!tooltip) return null;
  return (
    <div style={{
      position: 'fixed',
      left: tooltip.x + 14,
      top: tooltip.y - 28,
      pointerEvents: 'none',
      padding: '4px 10px',
      background: 'rgba(10,13,17,0.90)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6,
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: 10, fontWeight: 500,
      color: '#D4DAE3', letterSpacing: '0.04em',
      whiteSpace: 'nowrap', zIndex: 200,
    }}>
      {tooltip.label}
    </div>
  );
}
