// fireOverlay.js — Fire visualization v11
// Based on v9 (which worked) + perf optimizations that don't break things

import * as THREE from 'three';
import {
  GRID_ROWS, GRID_COLS, BURNING, BURNED, UNBURNED,
  LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX,
} from './fireEngine.js';

// v9 values that worked
const MESH_SEGS_LAT = 80;
const MESH_SEGS_LNG = 88;
const TEX_W = 1024;
const TEX_H = 1024;
const CELL_PX_W = TEX_W / GRID_COLS;
const CELL_PX_H = TEX_H / GRID_ROWS;

const SNAP_BATCH_SIZE = 200;
const TERRAIN_OFFSET = 1;
const RAY_START_HEIGHT = 1200;
const SPRITE_OFFSET = 2;

export class FireOverlay {
  constructor(ellipsoid, engine, tiles) {
    this.ellipsoid = ellipsoid;
    this.engine = engine;
    this.tiles = tiles;
    this.frame = 0;

    // Ground texture
    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = TEX_W;
    this.groundCanvas.height = TEX_H;
    this.groundCtx = this.groundCanvas.getContext('2d');

    this.groundTexture = new THREE.CanvasTexture(this.groundCanvas);
    this.groundTexture.minFilter = THREE.LinearFilter;
    this.groundTexture.magFilter = THREE.LinearFilter;

    // Pre-render stamps for perf
    this._stamps = this._createStamps();

    // Build mesh
    this._vertOriginalPos = [];
    this.mesh = this._buildGroundMesh();

    // Snap state — runs continuously (like v9) but with perf guard
    this._snapRaycaster = new THREE.Raycaster();
    this._snapRaycaster.firstHitOnly = true;
    this._totalVerts = (MESH_SEGS_LAT + 1) * (MESH_SEGS_LNG + 1);
    this._vertNormals = [];
    this._vertSnapped = new Uint8Array(this._totalVerts);
    this._snapIndex = 0;
    this._snapPass = 0;
    this._snapConverged = false; // true once >95% snapped
    this._precomputeVertexNormals();

    // Cell positions for sprites
    this._cellSurfacePos = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._cellNormals = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._cellTerrainPos = new Float32Array(GRID_ROWS * GRID_COLS * 3);
    this._cellSnapDone = new Uint8Array(GRID_ROWS * GRID_COLS);
    this._cellSnapIndex = 0;
    this._cellSnapConverged = false;
    this._precomputeCellPositions();

    // Flame sprites — shared material
    this._sharedFlameMat = new THREE.SpriteMaterial({
      map: this._createFlameTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      color: new THREE.Color(1.0, 0.6, 0.15),
      opacity: 0.7,
    });

    this.spritePool = [];
    this.spriteGroup = new THREE.Group();
    this.spriteGroup.renderOrder = 1001;
    this.maxSprites = 500;

    for (let i = 0; i < this.maxSprites; i++) {
      const s = new THREE.Sprite(this._sharedFlameMat);
      s.visible = false;
      this.spritePool.push(s);
      this.spriteGroup.add(s);
    }

    console.log('[fire] Init. Verts:', this._totalVerts);
  }

  _createStamps() {
    const stampSize = Math.ceil(Math.max(CELL_PX_W, CELL_PX_H) * 3);
    const half = stampSize / 2;
    function makeStamp(colors) {
      const c = document.createElement('canvas');
      c.width = stampSize; c.height = stampSize;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
      colors.forEach(([s, col]) => grad.addColorStop(s, col));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, stampSize, stampSize);
      return c;
    }
    return {
      burned: makeStamp([[0,'rgba(8,5,3,0.75)'],[0.6,'rgba(12,8,4,0.5)'],[1,'rgba(15,10,5,0)']]),
      edge: makeStamp([[0,'rgba(255,60,5,0.9)'],[0.4,'rgba(255,30,0,0.6)'],[1,'rgba(100,0,0,0)']]),
      interior: makeStamp([[0,'rgba(130,25,0,0.6)'],[0.5,'rgba(50,0,0,0.35)'],[1,'rgba(8,3,0,0)']]),
      size: stampSize, half,
    };
  }

  _createFlameTexture() {
    const s = 128, c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0,'rgba(255,255,220,1)');
    g.addColorStop(0.1,'rgba(255,220,100,0.95)');
    g.addColorStop(0.25,'rgba(255,160,40,0.7)');
    g.addColorStop(0.5,'rgba(255,80,10,0.4)');
    g.addColorStop(0.75,'rgba(200,30,0,0.15)');
    g.addColorStop(1,'rgba(100,10,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,s,s);
    return new THREE.CanvasTexture(c);
  }

  _precomputeVertexNormals() {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    for (let j = 0; j <= MESH_SEGS_LAT; j++) {
      for (let i = 0; i <= MESH_SEGS_LNG; i++) {
        const lat = LAT_MIN + (j/MESH_SEGS_LAT)*(LAT_MAX-LAT_MIN);
        const lng = LNG_MIN + (i/MESH_SEGS_LNG)*(LNG_MAX-LNG_MIN);
        this.ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 0, p);
        this.ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 100, pu);
        this._vertNormals.push(new THREE.Vector3().copy(pu).sub(p).normalize());
      }
    }
  }

  _precomputeCellPositions() {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const lat = LAT_MIN + ((r+0.5)/GRID_ROWS)*(LAT_MAX-LAT_MIN);
        const lng = LNG_MIN + ((c+0.5)/GRID_COLS)*(LNG_MAX-LNG_MIN);
        this.ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 0, p);
        this.ellipsoid.getCartographicToPosition(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), 100, pu);
        const i3 = (r*GRID_COLS+c)*3;
        this._cellSurfacePos[i3]=p.x; this._cellSurfacePos[i3+1]=p.y; this._cellSurfacePos[i3+2]=p.z;
        const nx=pu.x-p.x, ny=pu.y-p.y, nz=pu.z-p.z;
        const len = Math.sqrt(nx*nx+ny*ny+nz*nz);
        this._cellNormals[i3]=nx/len; this._cellNormals[i3+1]=ny/len; this._cellNormals[i3+2]=nz/len;
        this._cellTerrainPos[i3]=p.x; this._cellTerrainPos[i3+1]=p.y; this._cellTerrainPos[i3+2]=p.z;
      }
    }
  }

  _buildGroundMesh() {
    const geo = new THREE.BufferGeometry();
    const verts = [], uvs = [], indices = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= MESH_SEGS_LAT; j++) {
      for (let i = 0; i <= MESH_SEGS_LNG; i++) {
        const u = i/MESH_SEGS_LNG, v = j/MESH_SEGS_LAT;
        this.ellipsoid.getCartographicToPosition(
          THREE.MathUtils.degToRad(LAT_MIN + v*(LAT_MAX-LAT_MIN)),
          THREE.MathUtils.degToRad(LNG_MIN + u*(LNG_MAX-LNG_MIN)), 0, p
        );
        verts.push(p.x, p.y, p.z); uvs.push(u, v);
        this._vertOriginalPos.push(p.x, p.y, p.z);
      }
    }
    const stride = MESH_SEGS_LNG + 1;
    for (let j = 0; j < MESH_SEGS_LAT; j++) {
      for (let i = 0; i < MESH_SEGS_LNG; i++) {
        const a = j*stride+i;
        indices.push(a,a+1,a+stride, a+1,a+stride+1,a+stride);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      map: this.groundTexture, transparent: true,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    return mesh;
  }

  addToScene(scene) {
    scene.add(this.mesh);
    scene.add(this.spriteGroup);
  }

  // Continuous terrain snapping — runs every frame until converged,
  // then only once every 60 frames to catch tile refinements
  _snapMeshToTerrain() {
    if (!this.tiles?.group?.children?.length) return;
    // After convergence, only re-snap occasionally
    if (this._snapConverged && this.frame % 60 !== 0) return;

    const posAttr = this.mesh.geometry.attributes.position;
    const ray = this._snapRaycaster;
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();
    const end = Math.min(this._snapIndex + SNAP_BATCH_SIZE, this._totalVerts);

    this.mesh.visible = false;
    this.spriteGroup.visible = false;

    for (let vi = this._snapIndex; vi < end; vi++) {
      const n = this._vertNormals[vi];
      const ox = this._vertOriginalPos[vi*3], oy = this._vertOriginalPos[vi*3+1], oz = this._vertOriginalPos[vi*3+2];
      origin.set(ox+n.x*RAY_START_HEIGHT, oy+n.y*RAY_START_HEIGHT, oz+n.z*RAY_START_HEIGHT);
      dir.set(-n.x, -n.y, -n.z);
      ray.set(origin, dir);
      const hits = ray.intersectObjects(this.tiles.group.children, true);
      if (hits.length > 0) {
        const h = hits[0].point;
        // Check distance from original — reject ocean floor / distant tile hits
        const dx=h.x-ox, dy=h.y-oy, dz=h.z-oz;
        const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (dist < 600) { // within 600m of ellipsoid = valid terrain
          posAttr.setXYZ(vi, h.x+n.x*TERRAIN_OFFSET, h.y+n.y*TERRAIN_OFFSET, h.z+n.z*TERRAIN_OFFSET);
          this._vertSnapped[vi] = 1;
        } else {
          posAttr.setXYZ(vi, ox+n.x*TERRAIN_OFFSET, oy+n.y*TERRAIN_OFFSET, oz+n.z*TERRAIN_OFFSET);
        }
      } else {
        posAttr.setXYZ(vi, ox+n.x*TERRAIN_OFFSET, oy+n.y*TERRAIN_OFFSET, oz+n.z*TERRAIN_OFFSET);
      }
    }

    this.mesh.visible = true;
    this.spriteGroup.visible = true;
    posAttr.needsUpdate = true;

    this._snapIndex = end;
    if (this._snapIndex >= this._totalVerts) {
      this._snapPass++;
      let n = 0;
      for (let i = 0; i < this._totalVerts; i++) if (this._vertSnapped[i]) n++;
      const pct = n / this._totalVerts;
      console.log(`[fire] Mesh snap pass ${this._snapPass}: ${(pct*100).toFixed(1)}%`);
      if (pct > 0.95 && !this._snapConverged) {
        this._snapConverged = true;
        this.mesh.geometry.computeVertexNormals();
        console.log('[fire] Mesh snap converged');
      }
      this._snapIndex = 0;
    }
  }

  _snapCellsToTerrain() {
    if (!this.tiles?.group?.children?.length) return;
    if (this._cellSnapConverged && this.frame % 60 !== 0) return;

    const ray = this._snapRaycaster;
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();
    const total = GRID_ROWS * GRID_COLS;
    const end = Math.min(this._cellSnapIndex + SNAP_BATCH_SIZE, total);

    this.mesh.visible = false;
    this.spriteGroup.visible = false;

    for (let ci = this._cellSnapIndex; ci < end; ci++) {
      const i3 = ci*3;
      const nx=this._cellNormals[i3], ny=this._cellNormals[i3+1], nz=this._cellNormals[i3+2];
      origin.set(this._cellSurfacePos[i3]+nx*RAY_START_HEIGHT, this._cellSurfacePos[i3+1]+ny*RAY_START_HEIGHT, this._cellSurfacePos[i3+2]+nz*RAY_START_HEIGHT);
      dir.set(-nx,-ny,-nz);
      ray.set(origin, dir);
      const hits = ray.intersectObjects(this.tiles.group.children, true);
      if (hits.length > 0) {
        const hp = hits[0].point;
        const dx=hp.x-this._cellSurfacePos[i3], dy=hp.y-this._cellSurfacePos[i3+1], dz=hp.z-this._cellSurfacePos[i3+2];
        const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (dist < 600) {
          this._cellTerrainPos[i3]=hp.x+nx*SPRITE_OFFSET;
          this._cellTerrainPos[i3+1]=hp.y+ny*SPRITE_OFFSET;
          this._cellTerrainPos[i3+2]=hp.z+nz*SPRITE_OFFSET;
          this._cellSnapDone[ci] = 1;
        }
      }
    }

    this.mesh.visible = true;
    this.spriteGroup.visible = true;

    this._cellSnapIndex = end;
    if (this._cellSnapIndex >= total) {
      let n = 0;
      for (let i = 0; i < total; i++) if (this._cellSnapDone[i]) n++;
      if (n > total * 0.9 && !this._cellSnapConverged) {
        this._cellSnapConverged = true;
        console.log(`[fire] Cell snap converged: ${(n/total*100).toFixed(1)}%`);
      }
      this._cellSnapIndex = 0;
    }
  }

  update(engine, camera, tiles) {
    this.frame++;
    this.tiles = tiles;
    const frame = this.frame;
    const cells = engine.cells;
    const intensity = engine.intensity;

    this._snapMeshToTerrain();
    this._snapCellsToTerrain();

    const edgeCells = [];
    let burningN = 0, burnedN = 0;
    const dR8=[-1,-1,0,1,1,1,0,-1], dC8=[0,1,1,1,0,-1,-1,-1];

    // Ground texture — stamps
    const ctx = this.groundCtx;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    const { burned: bStamp, edge: eStamp, interior: iStamp, half: sh } = this._stamps;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const idx = r*GRID_COLS+c;
        const state = cells[idx];
        if (state === UNBURNED) continue;

        const texR = GRID_ROWS-1-r;
        const cx = (c+0.5)*CELL_PX_W - sh;
        const cy = (texR+0.5)*CELL_PX_H - sh;

        if (state === BURNED) {
          burnedN++;
          ctx.drawImage(bStamp, cx, cy);
        } else if (state === BURNING) {
          burningN++;
          let isEdge = false;
          for (let d = 0; d < 8; d++) {
            const nr=r+dR8[d], nc=c+dC8[d];
            if (nr<0||nr>=GRID_ROWS||nc<0||nc>=GRID_COLS) { isEdge=true; break; }
            if (cells[nr*GRID_COLS+nc]===UNBURNED) { isEdge=true; break; }
          }
          if (isEdge) {
            edgeCells.push({ r, c, inten: intensity[idx] });
            ctx.globalAlpha = 0.6 + Math.sin(frame*0.12+c*0.18+r*0.14)*0.4;
            ctx.drawImage(eStamp, cx, cy);
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = 0.6 + Math.sin(frame*0.04+c*0.05+r*0.06)*0.3;
            ctx.drawImage(iStamp, cx, cy);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    if (burningN > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(8px)';
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.groundCanvas, -4, -4, TEX_W+8, TEX_H+8);
      ctx.restore();
    }

    this.groundTexture.needsUpdate = true;

    // Sprites
    const t = frame * 0.016;
    const step = edgeCells.length > this.maxSprites ? Math.ceil(edgeCells.length/this.maxSprites) : 1;
    let si = 0;
    for (let i = 0; i < edgeCells.length && si < this.maxSprites; i += step) {
      const { r, c, inten } = edgeCells[i];
      const i3 = (r*GRID_COLS+c)*3;
      const bx=this._cellTerrainPos[i3], by=this._cellTerrainPos[i3+1], bz=this._cellTerrainPos[i3+2];
      const nx=this._cellNormals[i3], ny=this._cellNormals[i3+1], nz=this._cellNormals[i3+2];
      const seed = Math.sin(r*127.1+c*311.7)*43758.5453;
      const rnd = seed - Math.floor(seed);
      const fl = 0.6 + 0.4*Math.sin(t*11+rnd*50)*Math.sin(t*7.5+rnd*35);
      const h = (8+inten*30)*fl;
      const sprite = this.spritePool[si];
      sprite.position.set(bx+nx*h, by+ny*h, bz+nz*h);
      const sc = (35+inten*60)*fl;
      sprite.scale.set(sc, sc*1.3, 1);
      sprite.visible = true;
      si++;
    }
    this._sharedFlameMat.opacity = 0.55 + 0.2*Math.sin(t*5);
    for (let i = si; i < this.maxSprites; i++) this.spritePool[i].visible = false;

    if (frame % 300 === 0 && (burningN>0||burnedN>0)) {
      console.log(`[fire] burning=${burningN} burned=${burnedN} edges=${edgeCells.length} sprites=${si}`);
    }
  }
}
