// fireOverlay.js — Fire visualization v16
//
// ALL fire rendered as 3D sprites (no canvas squares)
// - Burning edge: bright flame sprites with flicker
// - Burning interior: dim smoldering sprites
// - Burned: dark smoke sprites for ash
// Canvas used ONLY for the glow/bloom post-effect

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

    // Canvas only for glow post-effect
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

    // Pre-compute 3D positions at ellipsoid surface
    this._cellPos = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precompute();

    // Pre-compute normals
    this._cellNormals = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._precomputeNormals();

    // ── Sprite materials ──

    // Flame material (additive blend — bright fire)
    this._flameMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(255,255,220,1)'],
        [0.1, 'rgba(255,220,100,0.9)'],
        [0.3, 'rgba(255,140,30,0.6)'],
        [0.6, 'rgba(255,60,5,0.3)'],
        [1, 'rgba(150,20,0,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Smolder material (softer, darker interior fire)
    this._smolderMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(180,60,10,0.7)'],
        [0.3, 'rgba(120,30,5,0.45)'],
        [0.6, 'rgba(60,15,0,0.2)'],
        [1, 'rgba(20,5,0,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Ash material — wide soft gradient so overlapping sprites blend seamlessly
    this._ashMat = new THREE.SpriteMaterial({
      map: this._makeGradientTex([
        [0, 'rgba(8,5,3,0.6)'],
        [0.3, 'rgba(10,7,4,0.5)'],
        [0.6, 'rgba(10,6,4,0.3)'],
        [0.85, 'rgba(8,5,3,0.1)'],
        [1, 'rgba(8,5,3,0)'],
      ]),
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    });

    // ── Sprite pools ──
    this.spriteGroup = new THREE.Group();
    this.spriteGroup.renderOrder = 1001;

    // Pool for all fire/ash sprites
    this.maxSprites = 5000;
    this.spritePool = [];
    for (let i = 0; i < this.maxSprites; i++) {
      const s = new THREE.Sprite(this._flameMat);
      s.visible = false;
      this.spritePool.push(s);
      this.spriteGroup.add(s);
    }

    console.log('[fire-v16] All-sprite fire init');
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _makeGradientTex(stops) {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
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

    const halfW = W / 2, halfH = H / 2;
    const v = new THREE.Vector3();

    const dR8 = [-1, -1, 0, 1, 1, 1, 0, -1];
    const dC8 = [0, 1, 1, 1, 0, -1, -1, -1];

    // Cell physical size ~80m, sprite should cover that area
    const CELL_METERS = 80;
    const SPRITE_SIZE = CELL_METERS * 1.2; // slight overlap for seamless coverage

    let si = 0;
    let burningN = 0;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r * GRID_COLS + c;
        const state = cells[idx];
        if (state === UNBURNED) continue;
        if (si >= this.maxSprites) break;

        const i3 = idx * 3;
        const bx = this._cellPos[i3], by = this._cellPos[i3 + 1], bz = this._cellPos[i3 + 2];
        const nx = this._cellNormals[i3], ny = this._cellNormals[i3 + 1], nz = this._cellNormals[i3 + 2];

        const sprite = this.spritePool[si];

        if (state === BURNED) {
          // Ash sprite — oversized so they overlap into a continuous dark layer
          sprite.material = this._ashMat;
          sprite.position.set(bx + nx * 2, by + ny * 2, bz + nz * 2);
          const ashSize = SPRITE_SIZE * 2.5;
          sprite.scale.set(ashSize, ashSize, 1);
          sprite.visible = true;
          si++;
        } else if (state === BURNING) {
          burningN++;

          let isEdge = false;
          for (let d = 0; d < 8; d++) {
            const nr = r + dR8[d], nc = c + dC8[d];
            if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) { isEdge = true; break; }
            if (cells[nr * GRID_COLS + nc] === UNBURNED) { isEdge = true; break; }
          }

          const inten = intensity[idx];
          const seed = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
          const rnd = seed - Math.floor(seed);
          const fl = 0.6 + 0.4 * Math.sin(t * 11 + rnd * 50) * Math.sin(t * 7.5 + rnd * 35);

          if (isEdge) {
            // Bright flame at fire edge
            sprite.material = this._flameMat;
            const h = (5 + inten * 20) * fl;
            sprite.position.set(bx + nx * h, by + ny * h, bz + nz * h);
            const sc = SPRITE_SIZE * (0.8 + inten * 0.8) * fl;
            sprite.scale.set(sc, sc * 1.4, 1);
            sprite.visible = true;
            si++;
          }
          // Interior burning cells — no sprite (just flames at edge + ash when burned)

        }
      }
    }

    // Hide unused sprites
    for (let i = si; i < this.maxSprites; i++) this.spritePool[i].visible = false;

    // ── Glow/bloom pass on canvas ──
    if (burningN > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(8px)';
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.canvas, -4, -4, W + 8, H + 8);
      ctx.restore();
    }

    if (frame % 300 === 0 && si > 0) {
      console.log(`[fire-v16] sprites=${si}/${this.maxSprites} burning=${burningN}`);
    }
  }
}
