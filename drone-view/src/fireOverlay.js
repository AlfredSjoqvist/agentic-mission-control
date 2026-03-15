// fireOverlay.js — Fire visualization v12
//
// 100% screen-space approach: project every fire cell from 3D → 2D
// No mesh, no terrain snapping, no raycasting
// Just a canvas overlay that draws where the terrain IS
//
// This inherently follows terrain because cell positions are on the ellipsoid

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

    // Full-screen canvas overlay
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

    // Pre-compute 3D positions for every cell on the ellipsoid surface
    this._cellPos = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precompute();

    // No mesh needed — no sprites needed for ground
    // We'll keep sprite flames as a separate THREE.js layer
    this._flameSpriteMat = new THREE.SpriteMaterial({
      map: this._createFlameTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      color: new THREE.Color(1.0, 0.55, 0.12),
      opacity: 0.7,
    });

    this.spriteGroup = new THREE.Group();
    this.spriteGroup.renderOrder = 1001;
    this.maxSprites = 500;
    this.spritePool = [];
    for (let i = 0; i < this.maxSprites; i++) {
      const s = new THREE.Sprite(this._flameSpriteMat);
      s.visible = false;
      this.spritePool.push(s);
      this.spriteGroup.add(s);
    }

    // Pre-compute cell surface normals for sprite positioning
    this._cellNormals = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precomputeNormals();

    console.log('[fire-v12] Screen-space overlay init');
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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

  _createFlameTexture() {
    const s = 128, c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.1, 'rgba(255,220,100,0.95)');
    g.addColorStop(0.25, 'rgba(255,160,40,0.7)');
    g.addColorStop(0.5, 'rgba(255,80,10,0.4)');
    g.addColorStop(0.75, 'rgba(200,30,0,0.15)');
    g.addColorStop(1, 'rgba(100,10,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }

  // No mesh to add — just sprites + DOM canvas
  addToScene(scene) {
    scene.add(this.spriteGroup);
    document.body.appendChild(this.canvas);
    console.log('[fire-v12] Canvas + sprites added');
  }

  update(engine, camera, tiles) {
    this.frame++;
    const frame = this.frame;
    const cells = engine.cells;
    const intensity = engine.intensity;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const halfW = W / 2, halfH = H / 2;
    const v = new THREE.Vector3();

    const edgeCells = [];
    let burningN = 0, burnedN = 0;
    const dR8 = [-1, -1, 0, 1, 1, 1, 0, -1];
    const dC8 = [0, 1, 1, 1, 0, -1, -1, -1];

    // ══════════════════════════════════════════════════════════
    // PROJECT EVERY FIRE CELL TO SCREEN AND DRAW
    // ══════════════════════════════════════════════════════════
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        const state = cells[idx];
        if (state === UNBURNED) continue;

        const i3 = idx * 3;
        v.set(this._cellPos[i3], this._cellPos[i3 + 1], this._cellPos[i3 + 2]);
        v.project(camera);

        // Behind camera or clipped
        if (v.z < 0 || v.z > 1) continue;

        const sx = (v.x * halfW) + halfW;
        const sy = (-v.y * halfH) + halfH;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

        // Size based on depth (perspective)
        const depth = v.z;
        const cellSize = Math.max(1, (1 - depth) * 50);

        if (state === BURNED) {
          burnedN++;
          // Dark semi-transparent char — terrain shows through
          ctx.fillStyle = 'rgba(5, 3, 2, 0.55)';
          ctx.fillRect(sx - cellSize * 0.5, sy - cellSize * 0.5, cellSize, cellSize);
        } else if (state === BURNING) {
          burningN++;

          let isEdge = false;
          for (let d = 0; d < 8; d++) {
            const nr = r + dR8[d], nc = c + dC8[d];
            if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) { isEdge = true; break; }
            if (cells[nr * GRID_COLS + nc] === UNBURNED) { isEdge = true; break; }
          }

          const inten = intensity[idx];

          if (isEdge) {
            edgeCells.push({ r, c, inten, sx, sy, cellSize });
            // Bright fire edge
            const fl = 0.6 + Math.sin(frame * 0.12 + c * 0.18 + r * 0.14) * 0.4;
            const R = Math.round(255 * fl);
            const G = Math.round((55 + Math.sin(frame * 0.08 + r * 0.12) * 35) * fl);
            ctx.fillStyle = `rgba(${R}, ${G}, ${Math.round(12 * fl)}, 0.8)`;
            ctx.fillRect(sx - cellSize * 0.5, sy - cellSize * 0.5, cellSize, cellSize);
          } else {
            // Smoldering interior
            const sm = 0.3 + Math.sin(frame * 0.04 + c * 0.05 + r * 0.06) * 0.15;
            ctx.fillStyle = `rgba(${Math.round(140 * sm)}, ${Math.round(25 * sm)}, 0, 0.55)`;
            ctx.fillRect(sx - cellSize * 0.5, sy - cellSize * 0.5, cellSize, cellSize);
          }
        }
      }
    }

    // ── Glow pass ──
    if (burningN > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(6px)';
      ctx.globalAlpha = 0.15;
      ctx.drawImage(this.canvas, -3, -3, W + 6, H + 6);
      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════
    // 3D FLAME SPRITES (edge cells only)
    // ══════════════════════════════════════════════════════════
    const t = frame * 0.016;
    const step = edgeCells.length > this.maxSprites ? Math.ceil(edgeCells.length / this.maxSprites) : 1;
    let si = 0;

    for (let i = 0; i < edgeCells.length && si < this.maxSprites; i += step) {
      const { r, c, inten } = edgeCells[i];
      const ci = r * GRID_COLS + c;
      const i3 = ci * 3;

      const bx = this._cellPos[i3], by = this._cellPos[i3 + 1], bz = this._cellPos[i3 + 2];
      const nx = this._cellNormals[i3], ny = this._cellNormals[i3 + 1], nz = this._cellNormals[i3 + 2];

      const seed = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
      const rnd = seed - Math.floor(seed);
      const fl = 0.6 + 0.4 * Math.sin(t * 11 + rnd * 50) * Math.sin(t * 7.5 + rnd * 35);
      const h = (8 + inten * 30) * fl;

      const sprite = this.spritePool[si];
      sprite.position.set(bx + nx * h, by + ny * h, bz + nz * h);
      const sc = (35 + inten * 60) * fl;
      sprite.scale.set(sc, sc * 1.3, 1);
      sprite.visible = true;
      si++;
    }

    this._flameSpriteMat.opacity = 0.55 + 0.2 * Math.sin(t * 5);
    for (let i = si; i < this.maxSprites; i++) this.spritePool[i].visible = false;

    if (frame % 300 === 0 && (burningN > 0 || burnedN > 0)) {
      console.log(`[fire-v12] burning=${burningN} burned=${burnedN} edges=${edgeCells.length} sprites=${si}`);
    }
  }
}
