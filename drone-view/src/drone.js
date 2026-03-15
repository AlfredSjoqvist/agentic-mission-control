// drone.js — Surveillance drone that follows fire
//
// Creates a 3D drone sprite that:
//   - Sits idle at a home position when no fire
//   - Orbits the fire centroid when fire is active
//   - Positioned at terrain height + altitude via raycasting
//   - Has a pulsing scan beam cone below it
//   - Visual: cyan colored sprite with rotating propeller indicators

import * as THREE from 'three';
import {
  GRID_ROWS, GRID_COLS, BURNING,
  LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX,
} from './fireEngine.js';

const DRONE_ALTITUDE = 80;   // meters above terrain
const ORBIT_RADIUS = 400;    // meters from fire centroid
const ORBIT_SPEED = 0.3;     // radians per second
const MOVE_LERP = 0.02;      // how fast drone moves to new target

export class FireDrone {
  constructor(ellipsoid, tiles) {
    this.ellipsoid = ellipsoid;
    this.tiles = tiles;
    this.time = 0;
    this.deployed = false;

    // Home position (Pacific Palisades)
    this._homeLatLng = { lat: 34.04, lng: -118.52 };

    // Current target and actual position in ECEF
    this._targetPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();

    // Set initial position to home
    this._latLngToECEF(this._homeLatLng.lat, this._homeLatLng.lng, DRONE_ALTITUDE, this._currentPos);
    this._targetPos.copy(this._currentPos);

    // ── Drone body ──
    this.group = new THREE.Group();
    this.group.renderOrder = 1100;

    // Main body sprite
    this._bodyMat = new THREE.SpriteMaterial({
      map: this._createDroneTexture(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this._body = new THREE.Sprite(this._bodyMat);
    this._body.scale.set(30, 30, 1);
    this.group.add(this._body);

    // Scan cone (line going down from drone)
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
    this._scanMat = new THREE.LineBasicMaterial({
      color: 0x22D3EE,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
    });
    this._scanLine = new THREE.Line(scanGeo, this._scanMat);
    this.group.add(this._scanLine);

    // Scan circle on ground
    const circleGeo = new THREE.RingGeometry(8, 10, 32);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0x22D3EE,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this._scanCircle = new THREE.Mesh(circleGeo, circleMat);
    this.group.add(this._scanCircle);

    // Label
    this._label = this._createLabel('D-01 SCOUT');
    this.group.add(this._label);

    this.group.position.copy(this._currentPos);

    console.log('[drone] Init at home position');
  }

  _createDroneTexture() {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');

    // Drone body — cyan quadcopter shape
    const cx = s/2, cy = s/2;

    // Arms
    ctx.strokeStyle = '#22D3EE';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx-15, cy-15); ctx.lineTo(cx+15, cy+15);
    ctx.moveTo(cx+15, cy-15); ctx.lineTo(cx-15, cy+15);
    ctx.stroke();

    // Center body
    ctx.fillStyle = '#22D3EE';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI*2);
    ctx.fill();

    // Rotors
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
    ctx.lineWidth = 1.5;
    for (const [rx, ry] of [[-15,-15],[15,-15],[-15,15],[15,15]]) {
      ctx.beginPath();
      ctx.arc(cx+rx, cy+ry, 8, 0, Math.PI*2);
      ctx.stroke();
    }

    // Glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s/2);
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.15)');
    grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    return new THREE.CanvasTexture(c);
  }

  _createLabel(text) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.font = '14px monospace';
    ctx.fillStyle = '#22D3EE';
    ctx.textAlign = 'center';
    ctx.fillText(text, 64, 20);

    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthTest: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(40, 10, 1);
    sprite.position.set(0, 20, 0); // above drone
    return sprite;
  }

  _latLngToECEF(lat, lng, alt, target) {
    this.ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(lat),
      THREE.MathUtils.degToRad(lng),
      alt, target
    );
  }

  _getNormal(lat, lng) {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    this._latLngToECEF(lat, lng, 0, p);
    this._latLngToECEF(lat, lng, 100, pu);
    return pu.sub(p).normalize();
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  update(engine, camera, dt) {
    this.time += dt || 0.016;

    // Find fire centroid
    let sumR = 0, sumC = 0, count = 0;
    const cells = engine.cells;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (cells[r * GRID_COLS + c] === BURNING) {
          sumR += r; sumC += c; count++;
        }
      }
    }

    if (count > 0) {
      this.deployed = true;
      const centR = sumR / count;
      const centC = sumC / count;

      // Convert centroid to lat/lng
      const centLat = LAT_MIN + (centR / GRID_ROWS) * (LAT_MAX - LAT_MIN);
      const centLng = LNG_MIN + (centC / GRID_COLS) * (LNG_MAX - LNG_MIN);

      // Orbit around fire centroid
      const orbitAngle = this.time * ORBIT_SPEED;
      // Convert orbit radius from meters to degrees (rough)
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos(THREE.MathUtils.degToRad(centLat));
      const orbitLat = centLat + (ORBIT_RADIUS / mPerDegLat) * Math.sin(orbitAngle);
      const orbitLng = centLng + (ORBIT_RADIUS / mPerDegLng) * Math.cos(orbitAngle);

      this._latLngToECEF(orbitLat, orbitLng, DRONE_ALTITUDE, this._targetPos);
      this._normal.copy(this._getNormal(orbitLat, orbitLng));
    } else if (!this.deployed) {
      // Idle at home — gentle hover
      const hoverLat = this._homeLatLng.lat + Math.sin(this.time * 0.1) * 0.0005;
      const hoverLng = this._homeLatLng.lng + Math.cos(this.time * 0.08) * 0.0005;
      this._latLngToECEF(hoverLat, hoverLng, DRONE_ALTITUDE, this._targetPos);
      this._normal.copy(this._getNormal(hoverLat, hoverLng));
    }

    // Smooth movement
    this._currentPos.lerp(this._targetPos, MOVE_LERP);
    this.group.position.copy(this._currentPos);

    // Scan line — from drone down to ground
    const groundPos = this._currentPos.clone().sub(
      this._normal.clone().multiplyScalar(DRONE_ALTITUDE)
    );
    const scanPositions = this._scanLine.geometry.attributes.position;
    scanPositions.setXYZ(0, 0, 0, 0);
    const localGround = groundPos.clone().sub(this._currentPos);
    scanPositions.setXYZ(1, localGround.x, localGround.y, localGround.z);
    scanPositions.needsUpdate = true;

    // Scan circle on ground
    this._scanCircle.position.copy(localGround);
    this._scanCircle.lookAt(localGround.clone().add(this._normal));

    // Pulsing scan opacity
    this._scanMat.opacity = 0.25 + 0.15 * Math.sin(this.time * 3);

    // Rotate body sprite slightly for visual interest
    this._bodyMat.rotation = this.time * 0.5;
  }
}
