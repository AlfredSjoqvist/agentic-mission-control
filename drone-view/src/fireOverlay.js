// fireOverlay.js — Fire visualization v20 (organic offset)
//
// Multi-layer fire rendering:
// - Layer 1: Base glow (low, wide, orange/red)
// - Layer 2: Main flames (mid height, flickering yellow-white)
// - Layer 3: Flame tips (tall, narrow, orange fade)
// - Layer 4: Smoke wisps (above flames, dark with alpha)
// - Interior burning cells get subtle glow
// - Ash/burned ground darkening
// - Screen-space heat glow via canvas

import * as THREE from 'three';
import {
  GRID_ROWS, GRID_COLS, BURNING, BURNED, UNBURNED,
  LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX,
} from './fireEngine.js';

export class FireOverlay {
  constructor(ellipsoid, engine, tiles) {
    this.ellipsoid = ellipsoid;
    this.engine = engine;
    this.tiles = tiles;
    this.frame = 0;

    // Canvas for screen-space glow
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fire-overlay';
    Object.assign(this.canvas.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100vw', height: '100vh',
      pointerEvents: 'none', zIndex: '50',
    });
    this._resize();
    this.ctx = this.canvas.getContext('2d');
    window.addEventListener('resize', () => this._resize());

    // Pre-compute positions, normals, and lateral offsets for organic look
    this._cellPos = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precompute();
    this._cellNormals = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precomputeNormals();
    // Per-cell random lateral offset (tangent to surface) — breaks up the grid pattern
    // Store as 2 floats per cell: offset along tangentU and tangentV
    this._cellOffset = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precomputeOffsets();

    // ── Materials ──
    // Base glow — wide, low, deep orange/red
    this._baseGlowMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(255,180,50,0.8)'],
        [0.15, 'rgba(255,120,20,0.6)'],
        [0.4, 'rgba(220,60,5,0.35)'],
        [0.7, 'rgba(180,30,0,0.15)'],
        [1, 'rgba(100,10,0,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Main flame — bright white-yellow core
    this._flameMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(255,255,240,1)'],
        [0.08, 'rgba(255,240,180,0.95)'],
        [0.2, 'rgba(255,200,80,0.7)'],
        [0.45, 'rgba(255,120,20,0.4)'],
        [0.7, 'rgba(200,50,5,0.15)'],
        [1, 'rgba(120,20,0,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Flame tip — tall narrow orange wisps
    this._tipMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(255,200,80,0.7)'],
        [0.2, 'rgba(255,130,30,0.5)'],
        [0.5, 'rgba(200,60,10,0.25)'],
        [0.8, 'rgba(120,30,5,0.08)'],
        [1, 'rgba(60,15,0,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Smoke — dark, rises above flames
    this._smokeMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(30,25,20,0.35)'],
        [0.3, 'rgba(40,35,30,0.25)'],
        [0.6, 'rgba(50,45,40,0.12)'],
        [1, 'rgba(60,55,50,0)'],
      ]),
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Interior glow — subtle orange for non-edge burning cells
    this._innerGlowMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(255,140,30,0.5)'],
        [0.3, 'rgba(255,80,10,0.3)'],
        [0.6, 'rgba(200,40,0,0.12)'],
        [1, 'rgba(100,20,0,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Ash ground — wide falloff so sprites overlap seamlessly, center not too dark
    this._ashMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(10,7,4,0.5)'],
        [0.15, 'rgba(10,7,4,0.45)'],
        [0.35, 'rgba(10,6,4,0.35)'],
        [0.55, 'rgba(8,5,3,0.22)'],
        [0.75, 'rgba(8,5,3,0.1)'],
        [0.9, 'rgba(8,5,3,0.03)'],
        [1, 'rgba(8,5,3,0)'],
      ]),
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Sprite pool
    this.spriteGroup = new THREE.Group();
    this.spriteGroup.renderOrder = 1001;
    this.maxSprites = 14000;
    this.spritePool = [];
    for (let i = 0; i < this.maxSprites; i++) {
      const s = new THREE.Sprite(this._flameMat);
      s.visible = false;
      this.spritePool.push(s);
      this.spriteGroup.add(s);
    }

    console.log('[fire-v20] Multi-layer fire rendering + organic offset');
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _makeGradientTex(stops) {
    const s = 128, c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    for (const [pos, color] of stops) g.addColorStop(pos, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }

  _precompute() {
    const pos = new THREE.Vector3();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const lat = LAT_MIN + ((r + 0.5) / GRID_ROWS) * (LAT_MAX - LAT_MIN);
        const lng = LNG_MIN + ((c + 0.5) / GRID_COLS) * (LNG_MAX - LNG_MIN);
        this.ellipsoid.getCartographicToPosition(
          THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 0, pos
        );
        const i3 = (r * GRID_COLS + c) * 3;
        this._cellPos[i3] = pos.x;
        this._cellPos[i3 + 1] = pos.y;
        this._cellPos[i3 + 2] = pos.z;
      }
    }
  }

  _precomputeNormals() {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const lat = LAT_MIN + ((r + 0.5) / GRID_ROWS) * (LAT_MAX - LAT_MIN);
        const lng = LNG_MIN + ((c + 0.5) / GRID_COLS) * (LNG_MAX - LNG_MIN);
        this.ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 0, p);
        this.ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 100, pu);
        const i3 = (r * GRID_COLS + c) * 3;
        const nx = pu.x - p.x, ny = pu.y - p.y, nz = pu.z - p.z;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        this._cellNormals[i3] = nx / len;
        this._cellNormals[i3 + 1] = ny / len;
        this._cellNormals[i3 + 2] = nz / len;
      }
    }
  }

  _precomputeOffsets() {
    // For each cell, compute a random XYZ offset that lies on the surface tangent plane
    // This shifts each flame/ash sprite off the grid center for a natural look
    const OFFSET_STRENGTH = 35; // meters — about 1/3 of a cell
    const up = new THREE.Vector3(0, 1, 0);
    const tangentU = new THREE.Vector3();
    const tangentV = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const i3 = (r * GRID_COLS + c) * 3;
        normal.set(this._cellNormals[i3], this._cellNormals[i3 + 1], this._cellNormals[i3 + 2]);
        // Build tangent frame: U = cross(up, normal), V = cross(normal, U)
        tangentU.crossVectors(up, normal);
        if (tangentU.lengthSq() < 0.001) tangentU.set(1, 0, 0); // fallback for poles
        tangentU.normalize();
        tangentV.crossVectors(normal, tangentU).normalize();

        // Deterministic random offsets using hash
        const h1 = this._hash(r, c) * 2 - 1;         // -1 to 1
        const h2 = this._hash(c + 37, r + 91) * 2 - 1; // different seed
        this._cellOffset[i3]     = (tangentU.x * h1 + tangentV.x * h2) * OFFSET_STRENGTH;
        this._cellOffset[i3 + 1] = (tangentU.y * h1 + tangentV.y * h2) * OFFSET_STRENGTH;
        this._cellOffset[i3 + 2] = (tangentU.z * h1 + tangentV.z * h2) * OFFSET_STRENGTH;
      }
    }
  }

  // Pseudo-random from cell position (deterministic flicker)
  _hash(r, c) {
    const n = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  addToScene(scene) {
    scene.add(this.spriteGroup);
    document.body.appendChild(this.canvas);
  }

  update(engine, camera, tiles) {
    this.frame++;
    const frame = this.frame;
    const t = frame * 0.016;
    const cells = engine.cells;
    const intensity = engine.intensity;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const dR8 = [-1, -1, 0, 1, 1, 1, 0, -1];
    const dC8 = [0, 1, 1, 1, 0, -1, -1, -1];

    const CELL_M = 100;

    // ── Pass 1: classify cells ──
    const edgeFlames = [];   // burning cells at fire front
    const innerBurn = [];    // burning cells fully surrounded by fire
    const ashCells = [];     // burned out
    const underAsh = [];     // burning cells old enough to show ash underneath

    const age = engine.age;
    const ASH_DELAY_TICKS = 5; // ash starts forming ~5 ticks after ignition

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        const state = cells[idx];
        if (state === UNBURNED) continue;

        if (state === BURNED) {
          ashCells.push(idx);
        } else if (state === BURNING) {
          // Any burning cell past the delay gets ash underneath
          if (age[idx] > ASH_DELAY_TICKS) underAsh.push(idx);

          let isEdge = false;
          for (let d = 0; d < 8; d++) {
            const nr = r + dR8[d], nc = c + dC8[d];
            if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) { isEdge = true; break; }
            if (cells[nr * GRID_COLS + nc] === UNBURNED) { isEdge = true; break; }
          }
          if (isEdge) edgeFlames.push(idx);
          else innerBurn.push(idx);
        }
      }
    }

    // ── Budget allocation ──
    const maxEdge = Math.min(edgeFlames.length, 1800);
    const edgeSprites = maxEdge * 4;  // 4 layers per edge cell
    const innerBudget = Math.min(innerBurn.length, 1200);
    const underAshBudget = Math.min(underAsh.length, 1200);
    const ashBudget = Math.max(0, this.maxSprites - edgeSprites - innerBudget - underAshBudget);

    let si = 0;

    // ── Ash sprites ──
    // Use hash-based selection to avoid stripe patterns from modulo skipping
    const ashStep = ashCells.length > ashBudget ? Math.ceil(ashCells.length / ashBudget) : 1;
    for (let i = 0; i < ashCells.length && si < ashBudget; i++) {
      const idx = ashCells[i];
      const r = Math.floor(idx / GRID_COLS);
      const c = idx % GRID_COLS;
      if (ashStep > 1 && (this._hash(r, c) * ashStep | 0) !== 0) continue;

      const i3 = idx * 3;
      const bx = this._cellPos[i3] + this._cellOffset[i3];
      const by = this._cellPos[i3 + 1] + this._cellOffset[i3 + 1];
      const bz = this._cellPos[i3 + 2] + this._cellOffset[i3 + 2];
      const nx = this._cellNormals[i3], ny = this._cellNormals[i3 + 1], nz = this._cellNormals[i3 + 2];

      const sprite = this.spritePool[si];
      sprite.material = this._ashMat;
      sprite.position.set(bx + nx * 2, by + ny * 2, bz + nz * 2);
      const ashScale = CELL_M * 4.0 * Math.sqrt(ashStep);
      sprite.scale.set(ashScale, ashScale, 1);
      sprite.visible = true;
      si++;
    }

    // ── Under-ash: ash forming underneath active flames after a few seconds ──
    const uaStep = underAsh.length > underAshBudget ? Math.ceil(underAsh.length / underAshBudget) : 1;
    for (let i = 0; i < underAsh.length && si < this.maxSprites; i++) {
      const idx = underAsh[i];
      const r = Math.floor(idx / GRID_COLS);
      const c = idx % GRID_COLS;
      if (uaStep > 1 && (this._hash(r, c) * uaStep | 0) !== 0) continue;

      const i3 = idx * 3;
      const bx = this._cellPos[i3] + this._cellOffset[i3];
      const by = this._cellPos[i3 + 1] + this._cellOffset[i3 + 1];
      const bz = this._cellPos[i3 + 2] + this._cellOffset[i3 + 2];
      const nx = this._cellNormals[i3], ny = this._cellNormals[i3 + 1], nz = this._cellNormals[i3 + 2];

      // Opacity ramps from 0 to 1 over ~20 ticks after the delay
      const ashAge = age[idx] - ASH_DELAY_TICKS;
      const ashOpacity = Math.min(1.0, ashAge / 20);

      const sprite = this.spritePool[si];
      sprite.material = this._ashMat;
      sprite.position.set(bx + nx * 1, by + ny * 1, bz + nz * 1); // just above ground, below flames
      const uaScale = CELL_M * 3.5 * ashOpacity;
      sprite.scale.set(uaScale, uaScale, 1);
      sprite.visible = true;
      si++;
    }

    // ── Interior burning glow (non-edge, subtle) ──
    const innerStep = innerBurn.length > innerBudget ? Math.ceil(innerBurn.length / innerBudget) : 1;
    for (let i = 0; i < innerBurn.length && si < this.maxSprites; i++) {
      const idx = innerBurn[i];
      const r = Math.floor(idx / GRID_COLS);
      const c = idx % GRID_COLS;
      if (innerStep > 1 && (this._hash(r, c) * innerStep | 0) !== 0) continue;

      const i3 = idx * 3;
      const bx = this._cellPos[i3] + this._cellOffset[i3];
      const by = this._cellPos[i3 + 1] + this._cellOffset[i3 + 1];
      const bz = this._cellPos[i3 + 2] + this._cellOffset[i3 + 2];
      const nx = this._cellNormals[i3], ny = this._cellNormals[i3 + 1], nz = this._cellNormals[i3 + 2];

      const inten = intensity[idx];
      const rnd = this._hash(r, c);
      const fl = 0.7 + 0.3 * Math.sin(t * 5 + rnd * 40);

      const sprite = this.spritePool[si];
      sprite.material = this._innerGlowMat;
      const h = 3 + inten * 8 * fl;
      sprite.position.set(bx + nx * h, by + ny * h, bz + nz * h);
      const sc = CELL_M * 2.8 * (0.6 + inten * 0.4) * fl * Math.sqrt(innerStep);
      sprite.scale.set(sc, sc, 1);
      sprite.visible = true;
      si++;
    }

    // ── Edge flame cells — 4 layers each ──
    // Use hash-based selection (not modulo stepping) for stable visuals across frames
    const edgeStep = edgeFlames.length > maxEdge ? Math.ceil(edgeFlames.length / maxEdge) : 1;

    for (let i = 0; i < edgeFlames.length && si < this.maxSprites - 3; i++) {
      if (edgeStep > 1) {
        const idx = edgeFlames[i];
        const r = Math.floor(idx / GRID_COLS);
        const c = idx % GRID_COLS;
        if ((this._hash(r, c) * edgeStep | 0) !== 0) continue;
      }
      const idx = edgeFlames[i];
      const r = Math.floor(idx / GRID_COLS);
      const c = idx % GRID_COLS;
      const i3 = idx * 3;
      const bx = this._cellPos[i3] + this._cellOffset[i3];
      const by = this._cellPos[i3 + 1] + this._cellOffset[i3 + 1];
      const bz = this._cellPos[i3 + 2] + this._cellOffset[i3 + 2];
      const nx = this._cellNormals[i3], ny = this._cellNormals[i3 + 1], nz = this._cellNormals[i3 + 2];

      const inten = intensity[idx];
      const rnd = this._hash(r, c);
      const rnd2 = this._hash(c, r);

      // Flicker — multiple frequencies for organic look
      const fl1 = Math.sin(t * 11 + rnd * 50) * Math.sin(t * 7.3 + rnd * 35);
      const fl2 = Math.sin(t * 15.7 + rnd2 * 42) * 0.5 + 0.5;
      const fl = 0.55 + 0.45 * fl1;
      const fl_fast = 0.6 + 0.4 * fl2;
      // Per-cell size variation so flames aren't uniform
      const szVar = 0.7 + rnd * 0.6; // 0.7 to 1.3

      // Layer 1: Base glow — wide, low, always visible
      const s1 = this.spritePool[si++];
      s1.material = this._baseGlowMat;
      const baseH = 2 + inten * 6;
      s1.position.set(bx + nx * baseH, by + ny * baseH, bz + nz * baseH);
      const baseScale = CELL_M * 3.2 * (0.7 + inten * 0.5) * szVar;
      s1.scale.set(baseScale, baseScale * 0.8, 1);
      s1.visible = true;

      // Layer 2: Main flame — bright core, flickers
      const s2 = this.spritePool[si++];
      s2.material = this._flameMat;
      const mainH = (6 + inten * 22) * fl;
      s2.position.set(bx + nx * mainH, by + ny * mainH, bz + nz * mainH);
      const mainScale = CELL_M * 1.8 * (0.7 + inten * 0.8) * fl * szVar;
      s2.scale.set(mainScale, mainScale * 1.6, 1);
      s2.visible = true;

      // Layer 3: Flame tip — tall, narrow, faster flicker
      const s3 = this.spritePool[si++];
      s3.material = this._tipMat;
      const tipH = (12 + inten * 35) * fl_fast;
      s3.position.set(bx + nx * tipH, by + ny * tipH, bz + nz * tipH);
      const tipScale = CELL_M * 0.9 * (0.5 + inten * 0.6) * fl_fast * szVar;
      s3.scale.set(tipScale, tipScale * 2.2, 1);
      s3.visible = true;

      // Layer 4: Smoke — above flames, drifts
      const s4 = this.spritePool[si++];
      s4.material = this._smokeMat;
      const smokeH = (25 + inten * 40) * (0.8 + 0.2 * Math.sin(t * 1.5 + rnd * 20));
      // Slight lateral drift
      const driftX = Math.sin(t * 0.8 + rnd * 30) * 8;
      const driftZ = Math.cos(t * 0.6 + rnd2 * 25) * 8;
      s4.position.set(bx + nx * smokeH + driftX, by + ny * smokeH, bz + nz * smokeH + driftZ);
      const smokeScale = CELL_M * 2.5 * (0.6 + inten * 0.5);
      s4.scale.set(smokeScale, smokeScale * 1.3, 1);
      s4.visible = true;
    }

    // Hide unused sprites
    for (let i = si; i < this.maxSprites; i++) this.spritePool[i].visible = false;

    // ── Screen-space heat glow ──
    // Single subtle glow at the fire centroid — no per-cell circles
    if (edgeFlames.length > 0) {
      let cx = 0, cy = 0, cz = 0, cnt = 0;
      const step = Math.max(1, Math.floor(edgeFlames.length / 12));
      for (let i = 0; i < edgeFlames.length; i += step) {
        const idx = edgeFlames[i];
        const i3 = idx * 3;
        cx += this._cellPos[i3]; cy += this._cellPos[i3+1]; cz += this._cellPos[i3+2];
        cnt++;
      }
      if (cnt > 0) {
        const pos = new THREE.Vector3(cx / cnt, cy / cnt, cz / cnt);
        pos.project(camera);
        if (pos.z > 0 && pos.z < 1) {
          const sx = (pos.x * 0.5 + 0.5) * W;
          const sy = (-pos.y * 0.5 + 0.5) * H;
          const glowR = 60 + Math.sin(t * 2) * 15;
          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
          g.addColorStop(0, 'rgba(255,100,20,0.03)');
          g.addColorStop(0.6, 'rgba(255,60,10,0.015)');
          g.addColorStop(1, 'rgba(255,30,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);
        }
      }
    }

    if (frame % 300 === 0 && si > 0) {
      console.log(`[fire-v19] sprites=${si} edge=${edgeFlames.length} inner=${innerBurn.length} ash=${ashCells.length}`);
    }
  }
}
