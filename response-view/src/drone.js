// drone.js — Surveillance drone that follows fire
//
// Procedural 3D quadcopter mesh (ported from TerrainScene.jsx):
//   - Sits idle at a home position when no fire
//   - Orbits the fire centroid when fire is active
//   - Has a pulsing scan beam and ground circle
//   - Spinning rotors with motion blur discs

import * as THREE from 'three';
import {
  GRID_ROWS, GRID_COLS, BURNING,
  LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX,
} from './fireEngine.js';

const DRONE_ALTITUDE = 80;   // meters above terrain
const ORBIT_RADIUS = 400;    // meters from fire centroid
const ORBIT_SPEED = 0.3;     // radians per second
const MOVE_LERP = 0.02;      // how fast drone moves to new target

function buildDroneMesh(scale = 1.0) {
  const drone = new THREE.Group();
  const s = scale;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1c2a36,
    roughness: 0.65,
    metalness: 0.35,
  });
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x263545,
    roughness: 0.6,
    metalness: 0.4,
  });
  const motorMat = new THREE.MeshStandardMaterial({
    color: 0x111518,
    roughness: 0.35,
    metalness: 0.75,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x2e5c7a,
    roughness: 0.45,
    metalness: 0.55,
  });
  const camLensMat = new THREE.MeshStandardMaterial({
    color: 0x080c10,
    roughness: 0.1,
    metalness: 0.9,
  });

  // Central body
  const bodyGeo = new THREE.BoxGeometry(0.60 * s, 0.16 * s, 0.42 * s);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  drone.add(bodyMesh);

  // Top dome
  const domeGeo = new THREE.SphereGeometry(0.14 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMesh = new THREE.Mesh(domeGeo, accentMat);
  domeMesh.position.set(0, 0.10 * s, 0);
  drone.add(domeMesh);

  // Camera gimbal
  const gimbalGeo = new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.06 * s, 10);
  const gimbal = new THREE.Mesh(gimbalGeo, motorMat);
  gimbal.position.set(0.23 * s, -0.09 * s, 0);
  drone.add(gimbal);

  // Camera lens
  const lensGeo = new THREE.SphereGeometry(0.065 * s, 8, 6);
  const lens = new THREE.Mesh(lensGeo, camLensMat);
  lens.position.set(0.27 * s, -0.10 * s, 0);
  drone.add(lens);

  // Status LED (cyan for scout)
  const ledGeo = new THREE.SphereGeometry(0.018 * s, 5, 4);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x22D3EE });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(-0.25 * s, 0.09 * s, 0);
  drone.add(led);

  // 4 arms + motors + rotors
  const armAngles = [45, 135, 225, 315];
  armAngles.forEach((deg) => {
    const rad = (deg * Math.PI) / 180;
    const armReach = 0.52 * s;

    const tipX = Math.cos(rad) * armReach;
    const tipZ = Math.sin(rad) * armReach;
    const midX = tipX * 0.5;
    const midZ = tipZ * 0.5;

    // Arm
    const armGeo = new THREE.BoxGeometry(armReach, 0.055 * s, 0.075 * s);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.y = -rad;
    arm.position.set(midX, 0, midZ);
    drone.add(arm);

    // Motor
    const motorGeo = new THREE.CylinderGeometry(0.072 * s, 0.072 * s, 0.11 * s, 10);
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(tipX, 0, tipZ);
    drone.add(motor);

    // Rotor pivot (spinning)
    const rotorPivot = new THREE.Group();
    rotorPivot.position.set(tipX, 0.09 * s, tipZ);
    rotorPivot.userData.isRotor = true;
    drone.add(rotorPivot);

    // Two crossed blades
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.3,
      metalness: 0.5,
    });
    [0, Math.PI / 2].forEach((bladeRot) => {
      const bladeGeo = new THREE.BoxGeometry(0.38 * s, 0.006 * s, 0.055 * s);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.y = bladeRot;
      rotorPivot.add(blade);
    });

    // Motion blur disc
    const discGeo = new THREE.CylinderGeometry(0.20 * s, 0.20 * s, 0.003 * s, 16);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x8aaabb,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    rotorPivot.add(disc);
  });

  return drone;
}

export class FireDrone {
  constructor(ellipsoid, tiles) {
    this.ellipsoid = ellipsoid;
    this.tiles = tiles;
    this.time = 0;
    this.deployed = false;

    this._homeLatLng = { lat: 34.04, lng: -118.52 };

    this._targetPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();

    this._latLngToECEF(this._homeLatLng.lat, this._homeLatLng.lng, DRONE_ALTITUDE, this._currentPos);
    this._targetPos.copy(this._currentPos);

    // ── Main group ──
    this.group = new THREE.Group();
    this.group.renderOrder = 1100;

    // 3D procedural drone mesh (scale 20 for visibility on the globe)
    this._droneMesh = buildDroneMesh(20);
    this.group.add(this._droneMesh);

    // Scan beam line
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

    console.log('[drone] 3D quadcopter init at home position');
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
    sprite.position.set(0, 20, 0);
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

      const centLat = LAT_MIN + (centR / GRID_ROWS) * (LAT_MAX - LAT_MIN);
      const centLng = LNG_MIN + (centC / GRID_COLS) * (LNG_MAX - LNG_MIN);

      const orbitAngle = this.time * ORBIT_SPEED;
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos(THREE.MathUtils.degToRad(centLat));
      const orbitLat = centLat + (ORBIT_RADIUS / mPerDegLat) * Math.sin(orbitAngle);
      const orbitLng = centLng + (ORBIT_RADIUS / mPerDegLng) * Math.cos(orbitAngle);

      this._latLngToECEF(orbitLat, orbitLng, DRONE_ALTITUDE, this._targetPos);
      this._normal.copy(this._getNormal(orbitLat, orbitLng));
    } else if (!this.deployed) {
      const hoverLat = this._homeLatLng.lat + Math.sin(this.time * 0.1) * 0.0005;
      const hoverLng = this._homeLatLng.lng + Math.cos(this.time * 0.08) * 0.0005;
      this._latLngToECEF(hoverLat, hoverLng, DRONE_ALTITUDE, this._targetPos);
      this._normal.copy(this._getNormal(hoverLat, hoverLng));
    }

    // Smooth movement
    this._currentPos.lerp(this._targetPos, MOVE_LERP);
    this.group.position.copy(this._currentPos);

    // Orient drone so "up" aligns with surface normal
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._targetPos, this._currentPos);
    if (forward.lengthSq() > 0.001) {
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      const correctedForward = new THREE.Vector3().crossVectors(right, up).normalize();
      const m = new THREE.Matrix4().makeBasis(correctedForward, up, right);
      this._droneMesh.quaternion.setFromRotationMatrix(m);
    }

    // Spin rotors
    this._droneMesh.traverse((child) => {
      if (child.userData.isRotor) {
        child.rotation.y += 0.8; // fast spin
      }
    });

    // Scan line
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
  }
}
