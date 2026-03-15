import * as Cesium from 'cesium';

// ============================================================
// Fire Visual System v8 — Projected Canvas + CustomShader
//
// Instead of drawing per-cell gradients (slow, gaps between cells),
// we take the engine's fire canvas (185x167 px, 1px per cell, already
// has fire colors) and project it onto the screen using an affine
// transform derived from projecting the grid corners to screen space.
//
// This gives:
// - Perfectly continuous fire (no gaps — it's one image)
// - Ultra fast (3 drawImage calls total, no per-cell loops)
// - Correct perspective mapping via affine transform
// - Smooth interpolation from canvas scaling
// - Glow via additive blending + blur on the whole image at once
// ============================================================

export class FireVisualSystem {
  constructor(viewer, tileset, engine) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.engine = engine;
    this.tileset = tileset;
    this._visible = true;
    this._cells = [];
    this._animId = null;

    // ---- Layer 1: CustomShader for terrain tinting ----
    this._initShader();

    // ---- Layer 2: Canvas overlay ----
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
    this._ctx = this._canvas.getContext('2d');
    const container = viewer.container;
    container.style.position = 'relative';
    container.appendChild(this._canvas);

    // High-res fire canvas (4x grid resolution) — cells paint as
    // large overlapping blobs so they blend into continuous fire
    const SCALE = 4;
    this._fireScale = SCALE;
    this._fireCanvas = document.createElement('canvas');
    this._fireCanvas.width = engine.canvas.width * SCALE;   // 740
    this._fireCanvas.height = engine.canvas.height * SCALE;  // 668
    this._fireCtx = this._fireCanvas.getContext('2d');

    // Offscreen canvas for glow (half-res for performance)
    this._glowCanvas = document.createElement('canvas');
    this._glowCtx = this._glowCanvas.getContext('2d');

    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);

    // Enable bloom
    try {
      const bloom = this.scene.postProcessStages.bloom;
      bloom.enabled = true;
      bloom.uniforms.contrast = 119;
      bloom.uniforms.brightness = -0.15;
      bloom.uniforms.glowOnly = false;
      bloom.uniforms.delta = 1.5;
      bloom.uniforms.sigma = 3.78;
      bloom.uniforms.stepSize = 2.0;
    } catch (e) {}

    // Performance: cache Cartesian3 positions, throttle projections
    this._cartCache = new Map();  // key: "lng,lat,elev" → Cesium.Cartesian3
    this._projCache = [];         // cached screen positions from last projection
    this._lastCamPos = null;
    this._lastCamDir = null;
    this._lastProjTime = 0;
    this._frameCount = 0;

    this._startRenderLoop();
    console.log('%c[FireVisuals v8] Projected canvas system initialized', 'color: #ff4400; font-weight: bold');
  }

  // ============================================================
  // CustomShader — terrain tinting (created once)
  // ============================================================
  _initShader() {
    const b = this.engine.bounds;

    this._shader = new Cesium.CustomShader({
      uniforms: {
        u_fireTex: {
          type: Cesium.UniformType.SAMPLER_2D,
          value: new Cesium.TextureUniform({
            url: this.engine.canvas.toDataURL(),
          }),
        },
        u_minLng: { type: Cesium.UniformType.FLOAT, value: Cesium.Math.toRadians(b.minLng) },
        u_maxLng: { type: Cesium.UniformType.FLOAT, value: Cesium.Math.toRadians(b.maxLng) },
        u_minLat: { type: Cesium.UniformType.FLOAT, value: Cesium.Math.toRadians(b.minLat) },
        u_maxLat: { type: Cesium.UniformType.FLOAT, value: Cesium.Math.toRadians(b.maxLat) },
        u_time: { type: Cesium.UniformType.FLOAT, value: 0.0 },
      },
      fragmentShaderText: /* glsl */ `
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          vec3 posWC = fsInput.attributes.positionWC;
          float lng = atan(posWC.y, posWC.x);
          float lat = atan(posWC.z, length(posWC.xy));
          float u = (lng - u_minLng) / (u_maxLng - u_minLng);
          float v = (lat - u_minLat) / (u_maxLat - u_minLat);
          if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) return;

          vec4 fire = texture(u_fireTex, vec2(u, v));
          if (fire.a < 0.03) return;

          float brightness = (fire.r + fire.g + fire.b) / 3.0;

          if (brightness < 0.2) {
            // BURNED: darken terrain
            material.diffuse = mix(material.diffuse, vec3(0.05, 0.03, 0.02), fire.a * 0.85);
          } else {
            // BURNING: fire glow with flicker
            float flicker = 0.78 + 0.14 * sin(u_time * 6.0 + u * 100.0 + v * 80.0)
                                  + 0.08 * sin(u_time * 10.0 - u * 150.0 + v * 120.0);
            vec3 fireRGB = fire.rgb * flicker;
            fireRGB.r = min(1.0, fireRGB.r * 1.3);
            material.diffuse = mix(material.diffuse, fireRGB, fire.a * 0.7);
            material.emissive = fireRGB * fire.a * 0.6 * flicker;
          }
        }
      `
    });

    this.tileset.customShader = this._shader;
    console.log('%c[FireVisuals] CustomShader applied for terrain tinting', 'color: #ff4400');
  }

  _updateShaderTexture() {
    // Use data URL approach (not typedArray) for reliable texture updates
    try {
      const dataUrl = this.engine.canvas.toDataURL();
      this._shader.setUniform('u_fireTex', new Cesium.TextureUniform({
        url: dataUrl,
      }));
    } catch (e) {
      console.warn('[FireVisuals] Texture update failed:', e.message);
    }
  }

  // ============================================================
  // Canvas overlay — projected fire image
  // ============================================================
  _resize() {
    const w = this.viewer.container.clientWidth;
    const h = this.viewer.container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = w * dpr;
    this._canvas.height = h * dpr;
    this._canvas.style.width = w + 'px';
    this._canvas.style.height = h + 'px';
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Glow canvas at half res
    this._glowCanvas.width = Math.ceil(w / 2);
    this._glowCanvas.height = Math.ceil(h / 2);
  }

  _projectToScreen(lng, lat, elev) {
    const cart = Cesium.Cartesian3.fromDegrees(lng, lat, elev);
    return Cesium.SceneTransforms.worldToWindowCoordinates(this.scene, cart);
  }

  _cameraChanged() {
    const cam = this.scene.camera;
    const pos = cam.positionWC;
    const dir = cam.directionWC;
    if (!this._lastCamPos) return true;
    const dp = Cesium.Cartesian3.distanceSquared(pos, this._lastCamPos);
    const dd = Cesium.Cartesian3.dot(dir, this._lastCamDir);
    return dp > 0.01 || dd < 0.99999;
  }

  _saveCameraState() {
    const cam = this.scene.camera;
    this._lastCamPos = Cesium.Cartesian3.clone(cam.positionWC);
    this._lastCamDir = Cesium.Cartesian3.clone(cam.directionWC);
  }

  _getCartesian(lng, lat, elev) {
    const key = `${lng},${lat},${elev}`;
    let c = this._cartCache.get(key);
    if (!c) {
      c = Cesium.Cartesian3.fromDegrees(lng, lat, elev);
      this._cartCache.set(key, c);
      // Cap cache size
      if (this._cartCache.size > 50000) {
        const iter = this._cartCache.keys();
        for (let i = 0; i < 10000; i++) this._cartCache.delete(iter.next().value);
      }
    }
    return c;
  }

  _startRenderLoop() {
    const render = () => {
      if (this.viewer.isDestroyed()) return;
      this._animId = requestAnimationFrame(render);
      this._frameCount++;
      try { this._shader.setUniform('u_time', performance.now() / 1000.0); } catch (e) {}
      // Render canvas overlay every 2nd frame (30fps) — still smooth for fire flicker
      if (this._frameCount % 2 === 0) {
        this._drawFire();
      }
    };
    this._animId = requestAnimationFrame(render);
  }

  _projectCells() {
    const scene = this.scene;
    const w = this.viewer.container.clientWidth;
    const h = this.viewer.container.clientHeight;
    const camCarto = scene.camera.positionCartographic;
    const camHeight = camCarto ? camCarto.height : 5000;
    const cellPx = Math.max(6, Math.min(80, (80 / camHeight) * 450));
    const baseR = cellPx * 2.5;
    const margin = baseR * 2;

    const burning = [];
    const burned = [];

    for (let i = 0; i < this._cells.length; i++) {
      const cell = this._cells[i];
      const cart = this._getCartesian(cell.lng, cell.lat, cell.elevation + 10);
      const sp = Cesium.SceneTransforms.worldToWindowCoordinates(scene, cart);
      if (!sp) continue;
      if (sp.x < -margin || sp.x > w + margin ||
          sp.y < -margin || sp.y > h + margin) continue;

      if (cell.state === 2) {
        burned.push({ x: sp.x, y: sp.y });
      } else if (cell.state === 1) {
        burning.push({ x: sp.x, y: sp.y, t: cell.intensity, s: i * 137.5 });
      }
    }

    this._projCache = { burning, burned, cellPx, baseR };
    this._saveCameraState();
    this._lastProjTime = performance.now();
  }

  _drawFire() {
    const ctx = this._ctx;
    const w = this.viewer.container.clientWidth;
    const h = this.viewer.container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!this._visible || this._cells.length === 0) return;

    // Re-project if camera moved OR cells changed OR >100ms since last projection
    const now = performance.now();
    if (!this._projCache.burning || this._cameraChanged() || (now - this._lastProjTime) > 100) {
      this._projectCells();
    }

    const { burning, burned, cellPx, baseR } = this._projCache;

    // ==== BURNED: simple dark circles (no gradients — much faster) ====
    if (burned.length > 0) {
      ctx.save();
      const charR = baseR * 2.0;
      ctx.fillStyle = 'rgba(12, 8, 4, 0.18)';
      ctx.beginPath();
      for (const p of burned) {
        ctx.moveTo(p.x + charR, p.y);
        ctx.arc(p.x, p.y, charR, 0, Math.PI * 2);
      }
      ctx.fill();
      // Second pass slightly smaller for darker center
      ctx.fillStyle = 'rgba(10, 6, 3, 0.12)';
      ctx.beginPath();
      for (const p of burned) {
        ctx.moveTo(p.x + charR * 0.6, p.y);
        ctx.arc(p.x, p.y, charR * 0.6, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }

    if (burning.length === 0) return;

    // ==== FIRE LAYER 1: Wide soft glow — additive, large circles ====
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of burning) {
      const flick = 0.75 + 0.25 * Math.sin(now * 0.004 + p.s);
      const fi = p.t * flick;
      const r = baseR * (1.0 + fi * 0.3);
      const a = fi * 0.28 + 0.06;

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, `rgba(180, 55, 0, ${Math.min(0.7, a)})`);
      grad.addColorStop(0.5, `rgba(140, 25, 0, ${a * 0.4})`);
      grad.addColorStop(1, 'rgba(80, 8, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ==== FIRE LAYER 2: Bright hot cores — additive ====
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of burning) {
      const flick = 0.7 + 0.3 * Math.sin(now * 0.006 + p.s * 1.3);
      const fi = p.t * flick;
      if (fi < 0.12) continue;

      const coreR = cellPx * (0.9 + fi * 0.5);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreR);

      if (fi > 0.5) {
        grad.addColorStop(0, `rgba(255, 230, 130, ${fi * 0.7})`);
        grad.addColorStop(0.3, `rgba(255, 140, 20, ${fi * 0.45})`);
        grad.addColorStop(0.7, `rgba(255, 55, 0, ${fi * 0.2})`);
        grad.addColorStop(1, 'rgba(180, 15, 0, 0)');
      } else {
        grad.addColorStop(0, `rgba(255, 100, 10, ${fi * 0.55})`);
        grad.addColorStop(0.5, `rgba(200, 35, 0, ${fi * 0.2})`);
        grad.addColorStop(1, 'rgba(100, 8, 0, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, coreR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ==== FIRE LAYER 3: Bright sparks for texture ====
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of burning) {
      if (p.t < 0.4) continue;
      const sparkle = Math.sin(now * 0.011 + p.s * 2) * 0.5 + 0.5;
      if (sparkle < 0.55) continue;
      const sr = cellPx * 0.25 * sparkle;
      ctx.fillStyle = `rgba(255, 255, 180, ${p.t * sparkle * 0.5})`;
      ctx.beginPath();
      ctx.arc(
        p.x + Math.sin(p.s * 3.7) * cellPx * 0.3,
        p.y + Math.cos(p.s * 2.9) * cellPx * 0.3,
        sr, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  update(cells) {
    this._cells = cells || [];
    this._updateShaderTexture();
  }

  get show() { return this._visible; }
  set show(val) {
    this._visible = val;
    this._canvas.style.display = val ? 'block' : 'none';
    if (val) {
      this.tileset.customShader = this._shader;
    } else {
      this.tileset.customShader = undefined;
    }
  }

  destroy() {
    if (this._animId) cancelAnimationFrame(this._animId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this.tileset.customShader = undefined;
    try { this.scene.postProcessStages.bloom.enabled = false; } catch (e) {}
  }
}
