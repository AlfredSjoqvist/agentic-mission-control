// vehicles.js — Wildfire response vehicles: Helicopter, Air Tanker, Fire Truck
//
// Procedural 3D meshes matching the drone.js style:
//   - Same material palette (dark teal/slate body, metallic accents)
//   - Same scale system (scale parameter × unit geometry)
//   - Same label sprite approach
//   - Each vehicle has a class with update() for movement

import * as THREE from 'three';
import {
  GRID_ROWS, GRID_COLS, BURNING,
  LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX,
} from './fireEngine.js';

// ============================================================
// SHARED MATERIALS (consistent with drone.js palette)
// ============================================================
const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x1c2a36, roughness: 0.65, metalness: 0.35,
});
const frameMat = new THREE.MeshStandardMaterial({
  color: 0x263545, roughness: 0.6, metalness: 0.4,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x111518, roughness: 0.35, metalness: 0.75,
});
const accentMat = new THREE.MeshStandardMaterial({
  color: 0x2e5c7a, roughness: 0.45, metalness: 0.55,
});
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x080c10, roughness: 0.1, metalness: 0.9,
});

// Emergency red for trucks
const redMat = new THREE.MeshStandardMaterial({
  color: 0xcc2200, roughness: 0.5, metalness: 0.3,
});
const orangeMat = new THREE.MeshStandardMaterial({
  color: 0xff6600, roughness: 0.5, metalness: 0.3,
});

// ============================================================
// HELICOPTER MESH — Sikorsky S-70 Firehawk style
// ============================================================
function buildHelicopterMesh(scale = 1.0) {
  const heli = new THREE.Group();
  const s = scale;

  // Fuselage (elongated rounded body)
  const fuselageGeo = new THREE.BoxGeometry(0.35 * s, 0.25 * s, 0.80 * s);
  const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
  heli.add(fuselage);

  // Nose (tapered front)
  const noseGeo = new THREE.ConeGeometry(0.15 * s, 0.30 * s, 6);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.02 * s, -0.50 * s);
  heli.add(nose);

  // Cockpit glass (front windshield)
  const cockpitGeo = new THREE.SphereGeometry(0.12 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.rotation.x = Math.PI * 0.6;
  cockpit.position.set(0, 0.08 * s, -0.32 * s);
  heli.add(cockpit);

  // Tail boom (long thin cylinder)
  const boomGeo = new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.65 * s, 8);
  const boom = new THREE.Mesh(boomGeo, frameMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.06 * s, 0.70 * s);
  heli.add(boom);

  // Tail fin (vertical stabilizer)
  const finGeo = new THREE.BoxGeometry(0.02 * s, 0.20 * s, 0.12 * s);
  const fin = new THREE.Mesh(finGeo, accentMat);
  fin.position.set(0, 0.16 * s, 1.00 * s);
  heli.add(fin);

  // Tail rotor
  const tailRotorPivot = new THREE.Group();
  tailRotorPivot.position.set(0.05 * s, 0.16 * s, 1.02 * s);
  tailRotorPivot.userData.isRotor = true;
  tailRotorPivot.userData.axis = 'x';
  heli.add(tailRotorPivot);

  const tailBladeGeo = new THREE.BoxGeometry(0.003 * s, 0.18 * s, 0.03 * s);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.5 });
  [0, Math.PI / 2].forEach(rot => {
    const blade = new THREE.Mesh(tailBladeGeo, bladeMat);
    blade.rotation.x = rot;
    tailRotorPivot.add(blade);
  });

  // Main rotor mast
  const mastGeo = new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.10 * s, 8);
  const mast = new THREE.Mesh(mastGeo, darkMat);
  mast.position.set(0, 0.17 * s, -0.05 * s);
  heli.add(mast);

  // Main rotor pivot (spinning)
  const mainRotorPivot = new THREE.Group();
  mainRotorPivot.position.set(0, 0.22 * s, -0.05 * s);
  mainRotorPivot.userData.isRotor = true;
  mainRotorPivot.userData.axis = 'y';
  heli.add(mainRotorPivot);

  // Main rotor blades (4 blades, long)
  const mainBladeGeo = new THREE.BoxGeometry(0.06 * s, 0.005 * s, 0.90 * s);
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(rot => {
    const blade = new THREE.Mesh(mainBladeGeo, bladeMat);
    blade.rotation.y = rot;
    mainRotorPivot.add(blade);
  });

  // Rotor motion blur disc
  const discGeo = new THREE.CylinderGeometry(0.45 * s, 0.45 * s, 0.003 * s, 24);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x8aaabb, transparent: true, opacity: 0.22,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  mainRotorPivot.add(new THREE.Mesh(discGeo, discMat));

  // Landing skids
  const skidMat = frameMat;
  [-0.14, 0.14].forEach(xOff => {
    // Vertical struts
    [-0.15, 0.15].forEach(zOff => {
      const strutGeo = new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.15 * s, 6);
      const strut = new THREE.Mesh(strutGeo, skidMat);
      strut.position.set(xOff * s, -0.20 * s, zOff * s);
      heli.add(strut);
    });
    // Horizontal skid
    const skidGeo = new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.50 * s, 6);
    const skid = new THREE.Mesh(skidGeo, skidMat);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(xOff * s, -0.27 * s, 0);
    heli.add(skid);
  });

  // Water tank (underslung, orange accent)
  const tankGeo = new THREE.BoxGeometry(0.22 * s, 0.10 * s, 0.35 * s);
  const tank = new THREE.Mesh(tankGeo, orangeMat);
  tank.position.set(0, -0.18 * s, 0.05 * s);
  heli.add(tank);

  // Status LED (yellow for helicopter)
  const ledGeo = new THREE.SphereGeometry(0.02 * s, 5, 4);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(0, 0.14 * s, -0.35 * s);
  heli.add(led);

  // Rotate so nose points +X (matching drone mesh convention: +X=forward, +Y=up)
  heli.rotation.y = -Math.PI / 2;

  return heli;
}

// ============================================================
// AIR TANKER MESH — DC-10 / C-130 style fixed-wing
// ============================================================
function buildAirTankerMesh(scale = 1.0) {
  const plane = new THREE.Group();
  const s = scale;

  // Fuselage (long cylinder)
  const fuselageGeo = new THREE.CylinderGeometry(0.12 * s, 0.10 * s, 1.20 * s, 10);
  const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  plane.add(fuselage);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(0.12 * s, 0.25 * s, 10);
  const nose = new THREE.Mesh(noseGeo, accentMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, -0.72 * s);
  plane.add(nose);

  // Cockpit windows
  const cockpitGeo = new THREE.BoxGeometry(0.10 * s, 0.06 * s, 0.12 * s);
  const cockpitWin = new THREE.Mesh(cockpitGeo, glassMat);
  cockpitWin.position.set(0, 0.10 * s, -0.52 * s);
  plane.add(cockpitWin);

  // Main wings (swept)
  const wingGeo = new THREE.BoxGeometry(1.60 * s, 0.015 * s, 0.22 * s);
  const wings = new THREE.Mesh(wingGeo, frameMat);
  wings.position.set(0, 0, -0.05 * s);
  plane.add(wings);

  // Wing tips (angled up slightly)
  [-0.82, 0.82].forEach(xSign => {
    const tipGeo = new THREE.BoxGeometry(0.06 * s, 0.08 * s, 0.10 * s);
    const tip = new THREE.Mesh(tipGeo, accentMat);
    tip.position.set(xSign * s, 0.04 * s, -0.05 * s);
    plane.add(tip);
  });

  // Horizontal tail stabilizer
  const hStabGeo = new THREE.BoxGeometry(0.55 * s, 0.012 * s, 0.12 * s);
  const hStab = new THREE.Mesh(hStabGeo, frameMat);
  hStab.position.set(0, 0, 0.55 * s);
  plane.add(hStab);

  // Vertical tail fin
  const vFinGeo = new THREE.BoxGeometry(0.015 * s, 0.25 * s, 0.18 * s);
  const vFin = new THREE.Mesh(vFinGeo, accentMat);
  vFin.position.set(0, 0.13 * s, 0.52 * s);
  plane.add(vFin);

  // Engine nacelles (2 under wings)
  [-0.38, 0.38].forEach(xOff => {
    const nacGeo = new THREE.CylinderGeometry(0.045 * s, 0.055 * s, 0.22 * s, 8);
    const nac = new THREE.Mesh(nacGeo, darkMat);
    nac.rotation.x = Math.PI / 2;
    nac.position.set(xOff * s, -0.06 * s, -0.08 * s);
    plane.add(nac);

    // Engine intake ring
    const intakeGeo = new THREE.TorusGeometry(0.05 * s, 0.008 * s, 6, 12);
    const intake = new THREE.Mesh(intakeGeo, frameMat);
    intake.position.set(xOff * s, -0.06 * s, -0.18 * s);
    plane.add(intake);
  });

  // Retardant tank belly (red/orange)
  const tankGeo = new THREE.BoxGeometry(0.18 * s, 0.08 * s, 0.55 * s);
  const tank = new THREE.Mesh(tankGeo, redMat);
  tank.position.set(0, -0.14 * s, 0);
  plane.add(tank);

  // Status LED (red for tanker)
  const ledGeo = new THREE.SphereGeometry(0.025 * s, 5, 4);
  const ledMaterial = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const led = new THREE.Mesh(ledGeo, ledMaterial);
  led.position.set(0, 0.14 * s, -0.40 * s);
  plane.add(led);

  // Rotate mesh so nose points +X (matching drone convention)
  plane.rotation.y = -Math.PI / 2;

  return plane;
}

// ============================================================
// FIRE TRUCK MESH — Type 1 Engine style
// ============================================================
function buildFireTruckMesh(scale = 1.0) {
  const truck = new THREE.Group();
  const s = scale;

  // Main body / chassis (long box)
  const bodyGeo = new THREE.BoxGeometry(0.30 * s, 0.22 * s, 0.85 * s);
  const body = new THREE.Mesh(bodyGeo, redMat);
  truck.add(body);

  // Cab (front, slightly taller)
  const cabGeo = new THREE.BoxGeometry(0.30 * s, 0.26 * s, 0.25 * s);
  const cab = new THREE.Mesh(cabGeo, redMat);
  cab.position.set(0, 0.02 * s, -0.48 * s);
  truck.add(cab);

  // Windshield
  const windshieldGeo = new THREE.BoxGeometry(0.24 * s, 0.10 * s, 0.02 * s);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 0.08 * s, -0.60 * s);
  truck.add(windshield);

  // Side windows
  [-0.155, 0.155].forEach(xOff => {
    const winGeo = new THREE.BoxGeometry(0.02 * s, 0.08 * s, 0.12 * s);
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.set(xOff * s, 0.08 * s, -0.45 * s);
    truck.add(win);
  });

  // Light bar on cab roof
  const lightBarGeo = new THREE.BoxGeometry(0.22 * s, 0.04 * s, 0.06 * s);
  const lightBar = new THREE.Mesh(lightBarGeo, frameMat);
  lightBar.position.set(0, 0.17 * s, -0.46 * s);
  truck.add(lightBar);

  // Emergency lights (red + white, emissive)
  const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-0.08, 0.08].forEach((xOff, i) => {
    const lightGeo = new THREE.SphereGeometry(0.018 * s, 6, 4);
    const light = new THREE.Mesh(lightGeo, i === 0 ? redLightMat : whiteLightMat);
    light.position.set(xOff * s, 0.20 * s, -0.46 * s);
    light.userData.isLight = true;
    light.userData.phase = i * Math.PI; // alternating flash
    truck.add(light);
  });

  // Ladder rack on top of body
  const ladderGeo = new THREE.BoxGeometry(0.06 * s, 0.02 * s, 0.70 * s);
  const ladder = new THREE.Mesh(ladderGeo, frameMat);
  ladder.position.set(0, 0.12 * s, 0);
  truck.add(ladder);

  // Ladder cross bars
  for (let z = -0.30; z <= 0.30; z += 0.12) {
    const barGeo = new THREE.BoxGeometry(0.10 * s, 0.015 * s, 0.015 * s);
    const bar = new THREE.Mesh(barGeo, frameMat);
    bar.position.set(0, 0.13 * s, z * s);
    truck.add(bar);
  }

  // Hose reel (back)
  const reelGeo = new THREE.TorusGeometry(0.06 * s, 0.015 * s, 6, 12);
  const reel = new THREE.Mesh(reelGeo, accentMat);
  reel.position.set(0, 0.02 * s, 0.44 * s);
  truck.add(reel);

  // Bumper (front)
  const bumperGeo = new THREE.BoxGeometry(0.32 * s, 0.06 * s, 0.04 * s);
  const bumper = new THREE.Mesh(bumperGeo, darkMat);
  bumper.position.set(0, -0.10 * s, -0.62 * s);
  truck.add(bumper);

  // Wheels (6 wheels — 2 front, 4 rear dual)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
  const wheelGeo = new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.04 * s, 10);

  // Front axle
  [-0.17, 0.17].forEach(xOff => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(xOff * s, -0.14 * s, -0.35 * s);
    truck.add(wheel);
  });

  // Rear axle (dual wheels)
  [-0.17, 0.17].forEach(xOff => {
    [0.15, 0.28].forEach(zOff => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(xOff * s, -0.14 * s, zOff * s);
      truck.add(wheel);
    });
  });

  // Water tank panel indicators (side stripes)
  [-0.155, 0.155].forEach(xOff => {
    const stripeGeo = new THREE.BoxGeometry(0.005 * s, 0.04 * s, 0.50 * s);
    const stripe = new THREE.Mesh(stripeGeo, orangeMat);
    stripe.position.set(xOff * s, -0.02 * s, 0.05 * s);
    truck.add(stripe);
  });

  return truck;
}

// ============================================================
// LABEL HELPER (same as drone.js)
// ============================================================
function createLabel(text, color = '#22D3EE') {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.font = '14px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, 96, 20);

  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(50, 13, 1);
  sprite.position.set(0, 25, 0);
  return sprite;
}

// ============================================================
// HELICOPTER CLASS
// ============================================================
const HELI_ALTITUDE = 150;
const HELI_ORBIT_RADIUS = 300;
const HELI_ORBIT_SPEED = 0.25;
const HELI_MOVE_LERP = 0.018;

export class ResponseHelicopter {
  constructor(ellipsoid, tiles, id, homeLat, homeLng) {
    this.ellipsoid = ellipsoid;
    this.tiles = tiles;
    this.id = id;
    this.time = 0;
    this.deployed = false;
    this._hoverTime = 0;
    this._hovering = false;

    this._homeLatLng = { lat: homeLat, lng: homeLng };
    this._targetPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();

    this._latLngToECEF(homeLat, homeLng, HELI_ALTITUDE, this._currentPos);
    this._targetPos.copy(this._currentPos);

    this.group = new THREE.Group();
    this.group.renderOrder = 1100;

    // Scale 25 — slightly larger than drone (20)
    this._mesh = buildHelicopterMesh(25);
    this.group.add(this._mesh);

    // Scan beam
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
    this._scanMat = new THREE.LineBasicMaterial({
      color: 0xffdd00, transparent: true, opacity: 0.35, depthTest: false,
    });
    this._scanLine = new THREE.Line(scanGeo, this._scanMat);
    this.group.add(this._scanLine);

    // Ground circle
    const circleGeo = new THREE.RingGeometry(10, 13, 32);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0xffdd00, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    });
    this._scanCircle = new THREE.Mesh(circleGeo, circleMat);
    this.group.add(this._scanCircle);

    this._label = createLabel(id, '#ffdd00');
    this.group.add(this._label);
    this.group.position.copy(this._currentPos);
  }

  _latLngToECEF(lat, lng, alt, target) {
    this.ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), alt, target
    );
  }

  _getNormal(lat, lng) {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    this._latLngToECEF(lat, lng, 0, p);
    this._latLngToECEF(lat, lng, 100, pu);
    return pu.sub(p).normalize();
  }

  addToScene(scene) { scene.add(this.group); }

  update(engine, camera, dt) {
    this.time += dt || 0.016;

    // Find fire centroid
    let sumR = 0, sumC = 0, count = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (engine.cells[r * GRID_COLS + c] === BURNING) {
          sumR += r; sumC += c; count++;
        }
      }
    }

    if (count > 0) {
      this.deployed = true;
      const centLat = LAT_MIN + (sumR / count / GRID_ROWS) * (LAT_MAX - LAT_MIN);
      const centLng = LNG_MIN + (sumC / count / GRID_COLS) * (LNG_MAX - LNG_MIN);

      // Helicopter behavior: orbit, then periodically hover for water drops
      const cycleTime = 20; // seconds per orbit cycle
      const cycleFrac = (this.time % cycleTime) / cycleTime;

      // Hover for 4 seconds every 20-second cycle (simulating water drop)
      if (cycleFrac > 0.7 && cycleFrac < 0.9) {
        this._hovering = true;
        // Hold position with slight bob
        const hoverLat = centLat + (HELI_ORBIT_RADIUS * 0.5 / 111320) * Math.sin(this.time * 0.05);
        const hoverLng = centLng + (HELI_ORBIT_RADIUS * 0.5 / (111320 * Math.cos(THREE.MathUtils.degToRad(centLat)))) * Math.cos(this.time * 0.05);
        const bob = Math.sin(this.time * 2) * 3;
        this._latLngToECEF(hoverLat, hoverLng, HELI_ALTITUDE - 30 + bob, this._targetPos);
        this._normal.copy(this._getNormal(hoverLat, hoverLng));
      } else {
        this._hovering = false;
        const orbitAngle = this.time * HELI_ORBIT_SPEED;
        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos(THREE.MathUtils.degToRad(centLat));
        const orbitLat = centLat + (HELI_ORBIT_RADIUS / mPerDegLat) * Math.sin(orbitAngle);
        const orbitLng = centLng + (HELI_ORBIT_RADIUS / mPerDegLng) * Math.cos(orbitAngle);
        this._latLngToECEF(orbitLat, orbitLng, HELI_ALTITUDE, this._targetPos);
        this._normal.copy(this._getNormal(orbitLat, orbitLng));
      }
    } else if (!this.deployed) {
      const hoverLat = this._homeLatLng.lat + Math.sin(this.time * 0.08) * 0.0003;
      const hoverLng = this._homeLatLng.lng + Math.cos(this.time * 0.06) * 0.0003;
      this._latLngToECEF(hoverLat, hoverLng, HELI_ALTITUDE, this._targetPos);
      this._normal.copy(this._getNormal(hoverLat, hoverLng));
    }

    this._currentPos.lerp(this._targetPos, HELI_MOVE_LERP);
    this.group.position.copy(this._currentPos);

    // Orient — same approach as drone.js
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._targetPos, this._currentPos);
    if (forward.lengthSq() < 0.001) {
      // When barely moving, use a default forward direction (tangent to surface)
      forward.set(1, 0, 0).cross(up).cross(up).negate().normalize();
      if (forward.lengthSq() < 0.001) forward.set(0, 0, 1);
    }
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const corrFwd = new THREE.Vector3().crossVectors(right, up).normalize();
    const m = new THREE.Matrix4().makeBasis(corrFwd, up, right);
    this._mesh.quaternion.setFromRotationMatrix(m);

    // Spin rotors
    this._mesh.traverse(child => {
      if (child.userData.isRotor) {
        if (child.userData.axis === 'y') child.rotation.y += 0.6;
        else child.rotation.x += 1.2;
      }
    });

    // Scan line
    const groundPos = this._currentPos.clone().sub(this._normal.clone().multiplyScalar(HELI_ALTITUDE));
    const scanPos = this._scanLine.geometry.attributes.position;
    scanPos.setXYZ(0, 0, 0, 0);
    const localGround = groundPos.clone().sub(this._currentPos);
    scanPos.setXYZ(1, localGround.x, localGround.y, localGround.z);
    scanPos.needsUpdate = true;
    this._scanCircle.position.copy(localGround);
    this._scanCircle.lookAt(localGround.clone().add(this._normal));
    this._scanMat.opacity = 0.2 + 0.15 * Math.sin(this.time * 2.5);
  }
}

// ============================================================
// AIR TANKER CLASS — fixed-wing racetrack pattern
// ============================================================
const TANKER_ALTITUDE = 350;
const TANKER_MOVE_LERP = 0.015;

export class ResponseAirTanker {
  constructor(ellipsoid, tiles, id, homeLat, homeLng, racetrackHeading = 135) {
    this.ellipsoid = ellipsoid;
    this.tiles = tiles;
    this.id = id;
    this.time = 0;
    this.deployed = false;
    this._racetrackHeading = racetrackHeading;

    this._homeLatLng = { lat: homeLat, lng: homeLng };
    this._targetPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();

    this._latLngToECEF(homeLat, homeLng, TANKER_ALTITUDE, this._currentPos);
    this._targetPos.copy(this._currentPos);
    this._prevPos.copy(this._currentPos);

    this.group = new THREE.Group();
    this.group.renderOrder = 1100;

    // Scale 28 — larger than helicopter
    this._mesh = buildAirTankerMesh(28);
    this.group.add(this._mesh);

    this._label = createLabel(id, '#ff4444');
    this.group.add(this._label);
    this.group.position.copy(this._currentPos);
  }

  _latLngToECEF(lat, lng, alt, target) {
    this.ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), alt, target
    );
  }

  _getNormal(lat, lng) {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    this._latLngToECEF(lat, lng, 0, p);
    this._latLngToECEF(lat, lng, 100, pu);
    return pu.sub(p).normalize();
  }

  addToScene(scene) { scene.add(this.group); }

  update(engine, camera, dt) {
    this.time += dt || 0.016;
    this._prevPos.copy(this._currentPos);

    let sumR = 0, sumC = 0, count = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (engine.cells[r * GRID_COLS + c] === BURNING) {
          sumR += r; sumC += c; count++;
        }
      }
    }

    if (count > 0) {
      this.deployed = true;
      const centLat = LAT_MIN + (sumR / count / GRID_ROWS) * (LAT_MAX - LAT_MIN);
      const centLng = LNG_MIN + (sumC / count / GRID_COLS) * (LNG_MAX - LNG_MIN);

      // Racetrack pattern: long straight runs with semicircle turns
      const headRad = (this._racetrackHeading * Math.PI) / 180;
      const runLength = 0.04; // degrees
      const runWidth = 0.015;
      const cycleTime = 40;
      const t = (this.time / cycleTime) % 1;

      let lat, lng, alt = TANKER_ALTITUDE;
      const cosH = Math.cos(headRad), sinH = Math.sin(headRad);

      if (t < 0.35) {
        const st = t / 0.35;
        const along = (st - 0.5) * runLength;
        const across = -runWidth / 2;
        lat = centLat + along * cosH - across * sinH;
        lng = centLng + along * sinH + across * cosH;
        alt -= 50; // lower during drop run
      } else if (t < 0.50) {
        const turnT = (t - 0.35) / 0.15;
        const angle = Math.PI * turnT;
        const turnR = runWidth / 2;
        const turnCenterLat = centLat + (runLength / 2) * cosH;
        const turnCenterLng = centLng + (runLength / 2) * sinH;
        const across = -turnR * Math.cos(angle);
        lat = turnCenterLat - across * sinH;
        lng = turnCenterLng + across * cosH;
        alt += 30; // climb in turn
      } else if (t < 0.85) {
        const st = (t - 0.50) / 0.35;
        const along = (0.5 - st) * runLength;
        const across = runWidth / 2;
        lat = centLat + along * cosH - across * sinH;
        lng = centLng + along * sinH + across * cosH;
        alt -= 50;
      } else {
        const turnT = (t - 0.85) / 0.15;
        const angle = Math.PI * turnT;
        const turnR = runWidth / 2;
        const turnCenterLat = centLat - (runLength / 2) * cosH;
        const turnCenterLng = centLng - (runLength / 2) * sinH;
        const across = turnR * Math.cos(angle);
        lat = turnCenterLat - across * sinH;
        lng = turnCenterLng + across * cosH;
        alt += 30;
      }

      this._latLngToECEF(lat, lng, alt, this._targetPos);
      this._normal.copy(this._getNormal(lat, lng));
    } else if (!this.deployed) {
      // Circle at home
      const r = 0.008;
      const circleLat = this._homeLatLng.lat + r * Math.sin(this.time * 0.15);
      const circleLng = this._homeLatLng.lng + r * Math.cos(this.time * 0.15);
      this._latLngToECEF(circleLat, circleLng, TANKER_ALTITUDE, this._targetPos);
      this._normal.copy(this._getNormal(circleLat, circleLng));
    }

    this._currentPos.lerp(this._targetPos, TANKER_MOVE_LERP);
    this.group.position.copy(this._currentPos);

    // Orient — same as drone: X=forward, Y=up, Z=right
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._currentPos, this._prevPos);
    if (forward.lengthSq() > 0.0001) {
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      const corrFwd = new THREE.Vector3().crossVectors(right, up).normalize();
      const m = new THREE.Matrix4().makeBasis(corrFwd, up, right);
      this._mesh.quaternion.setFromRotationMatrix(m);
    }
  }
}

// ============================================================
// FIRE TRUCK CLASS — ground vehicle, road-constrained
// ============================================================
const TRUCK_ALTITUDE = 5; // just above terrain
const TRUCK_MOVE_LERP = 0.012;

export class ResponseFireTruck {
  constructor(ellipsoid, tiles, id, roadPoints) {
    this.ellipsoid = ellipsoid;
    this.tiles = tiles;
    this.id = id;
    this.time = 0;
    this._road = roadPoints; // array of {lat, lng}

    this._targetPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();

    const start = roadPoints[0];
    this._latLngToECEF(start.lat, start.lng, TRUCK_ALTITUDE, this._currentPos);
    this._targetPos.copy(this._currentPos);
    this._prevPos.copy(this._currentPos);

    this.group = new THREE.Group();
    this.group.renderOrder = 1100;

    // Scale 22 — between drone and helicopter size
    this._mesh = buildFireTruckMesh(22);
    this.group.add(this._mesh);

    // Emergency lights flashing effect
    this._lightTime = 0;

    this._label = createLabel(id, '#ff6622');
    this.group.add(this._label);
    this.group.position.copy(this._currentPos);
  }

  _latLngToECEF(lat, lng, alt, target) {
    this.ellipsoid.getCartographicToPosition(
      THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lng), alt, target
    );
  }

  _getNormal(lat, lng) {
    const p = new THREE.Vector3(), pu = new THREE.Vector3();
    this._latLngToECEF(lat, lng, 0, p);
    this._latLngToECEF(lat, lng, 100, pu);
    return pu.sub(p).normalize();
  }

  addToScene(scene) { scene.add(this.group); }

  update(engine, camera, dt) {
    this.time += dt || 0.016;
    this._prevPos.copy(this._currentPos);

    const road = this._road;
    if (road.length < 2) return;

    // Drive back and forth along road
    const totalPoints = road.length;
    const cycleTime = 50; // seconds for full back-and-forth
    const rawT = (this.time / cycleTime) % 1;
    const t = rawT < 0.5 ? rawT * 2 : 2 - rawT * 2; // ping-pong

    const segIndex = Math.floor(t * (totalPoints - 1));
    const segT = (t * (totalPoints - 1)) - segIndex;
    const p1 = road[Math.min(segIndex, totalPoints - 1)];
    const p2 = road[Math.min(segIndex + 1, totalPoints - 1)];

    const lat = p1.lat + (p2.lat - p1.lat) * segT;
    const lng = p1.lng + (p2.lng - p1.lng) * segT;

    this._latLngToECEF(lat, lng, TRUCK_ALTITUDE, this._targetPos);
    this._normal.copy(this._getNormal(lat, lng));

    this._currentPos.lerp(this._targetPos, TRUCK_MOVE_LERP);
    this.group.position.copy(this._currentPos);

    // Orient truck along road direction
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._currentPos, this._prevPos);
    if (forward.lengthSq() > 0.0001) {
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      const corrFwd = new THREE.Vector3().crossVectors(right, up).normalize();
      const m = new THREE.Matrix4().makeBasis(corrFwd, up, right);
      this._mesh.quaternion.setFromRotationMatrix(m);
    }

    // Flash emergency lights
    this._lightTime += dt || 0.016;
    this._mesh.traverse(child => {
      if (child.userData.isLight) {
        const flash = Math.sin(this._lightTime * 8 + child.userData.phase) > 0;
        child.visible = flash;
      }
    });
  }
}
