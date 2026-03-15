// vehicles.js — Wildfire response vehicles: Helicopter, Air Tanker, Fire Truck
//
// Procedural 3D meshes matching the drone.js style:
//   - Same material palette (dark teal/slate body, metallic accents)
//   - Same scale system (scale parameter × unit geometry)
//   - Same label sprite approach
//   - Each vehicle has a class with update() for movement

import * as THREE from 'three';
import {
  GRID_ROWS, GRID_COLS, BURNING, UNBURNED,
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
// Built with NOSE along +X, UP along +Y — matches makeBasis(forward, up, right)
// so NO local rotation quaternion is needed in update().
// ============================================================
function buildHelicopterMesh(scale = 1.0) {
  const heli = new THREE.Group();
  const s = scale;

  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.5 });

  // Fuselage — long along X (nose = +X, tail = -X)
  const fuselageGeo = new THREE.BoxGeometry(0.80 * s, 0.25 * s, 0.35 * s);
  heli.add(new THREE.Mesh(fuselageGeo, bodyMat));

  // Nose cone (+X direction)
  const noseGeo = new THREE.ConeGeometry(0.15 * s, 0.30 * s, 6);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.rotation.z = -Math.PI / 2; // point cone tip along +X
  nose.position.set(0.50 * s, -0.02 * s, 0);
  heli.add(nose);

  // Cockpit glass
  const cockpitGeo = new THREE.SphereGeometry(0.12 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.rotation.z = -Math.PI * 0.1;
  cockpit.position.set(0.32 * s, 0.10 * s, 0);
  heli.add(cockpit);

  // Tail boom (-X direction)
  const boomGeo = new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.65 * s, 8);
  const boom = new THREE.Mesh(boomGeo, frameMat);
  boom.rotation.z = Math.PI / 2; // lay along X axis
  boom.position.set(-0.70 * s, 0.06 * s, 0);
  heli.add(boom);

  // Tail fin
  const finGeo = new THREE.BoxGeometry(0.12 * s, 0.20 * s, 0.02 * s);
  const fin = new THREE.Mesh(finGeo, accentMat);
  fin.position.set(-1.00 * s, 0.16 * s, 0);
  heli.add(fin);

  // Tail rotor (spins around Z axis on the side of the tail)
  const tailRotorPivot = new THREE.Group();
  tailRotorPivot.position.set(-1.02 * s, 0.16 * s, 0.05 * s);
  tailRotorPivot.userData.isRotor = true;
  tailRotorPivot.userData.axis = 'z';
  heli.add(tailRotorPivot);

  const tailBladeGeo = new THREE.BoxGeometry(0.18 * s, 0.03 * s, 0.003 * s);
  [0, Math.PI / 2].forEach(rot => {
    const blade = new THREE.Mesh(tailBladeGeo, bladeMat);
    blade.rotation.z = rot;
    tailRotorPivot.add(blade);
  });

  // Main rotor mast
  const mastGeo = new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.10 * s, 8);
  const mast = new THREE.Mesh(mastGeo, darkMat);
  mast.position.set(0.05 * s, 0.17 * s, 0);
  heli.add(mast);

  // Main rotor pivot (spins around Y)
  const mainRotorPivot = new THREE.Group();
  mainRotorPivot.position.set(0.05 * s, 0.22 * s, 0);
  mainRotorPivot.userData.isRotor = true;
  mainRotorPivot.userData.axis = 'y';
  heli.add(mainRotorPivot);

  // 4 main blades — extend along X and Z
  const mainBladeGeo = new THREE.BoxGeometry(0.90 * s, 0.005 * s, 0.06 * s);
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(rot => {
    const blade = new THREE.Mesh(mainBladeGeo, bladeMat);
    blade.rotation.y = rot;
    mainRotorPivot.add(blade);
  });

  // Motion blur disc
  const discGeo = new THREE.CylinderGeometry(0.45 * s, 0.45 * s, 0.003 * s, 24);
  const discMat2 = new THREE.MeshBasicMaterial({
    color: 0x8aaabb, transparent: true, opacity: 0.22,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  mainRotorPivot.add(new THREE.Mesh(discGeo, discMat2));

  // Landing skids
  [-0.14, 0.14].forEach(zOff => {
    // Vertical struts
    [-0.15, 0.15].forEach(xOff => {
      const strutGeo = new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.15 * s, 6);
      const strut = new THREE.Mesh(strutGeo, frameMat);
      strut.position.set(xOff * s, -0.20 * s, zOff * s);
      heli.add(strut);
    });
    // Horizontal skid (runs along X)
    const skidGeo = new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.50 * s, 6);
    const skid = new THREE.Mesh(skidGeo, frameMat);
    skid.rotation.z = Math.PI / 2; // lay along X
    skid.position.set(0, -0.27 * s, zOff * s);
    heli.add(skid);
  });

  // Water tank (underslung, orange)
  const tankGeo = new THREE.BoxGeometry(0.35 * s, 0.10 * s, 0.22 * s);
  const tank = new THREE.Mesh(tankGeo, orangeMat);
  tank.position.set(-0.05 * s, -0.18 * s, 0);
  heli.add(tank);

  // Status LED
  const ledGeo = new THREE.SphereGeometry(0.02 * s, 5, 4);
  const ledMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
  const led = new THREE.Mesh(ledGeo, ledMaterial);
  led.position.set(0.35 * s, 0.14 * s, 0);
  heli.add(led);

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

  // Note: nose-to-+X rotation is applied via quaternion composition in update()
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
    this._prevPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();

    this._latLngToECEF(homeLat, homeLng, HELI_ALTITUDE, this._currentPos);
    this._targetPos.copy(this._currentPos);
    this._prevPos.copy(this._currentPos);

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
    this._prevPos.copy(this._currentPos);

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

    // Orient — mesh nose is along +X, up is +Y
    // Use previous position for stable forward vector (lerp delta can be tiny)
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._currentPos, this._prevPos || this._currentPos);
    if (forward.lengthSq() < 0.0001) {
      // Fallback: project world X onto tangent plane
      forward.set(1, 0, 0).sub(up.clone().multiplyScalar(up.dot(new THREE.Vector3(1,0,0)))).normalize();
      if (forward.lengthSq() < 0.0001) forward.set(0, 0, 1);
    }
    forward.normalize();
    // Right-handed basis: right = forward × up, corrFwd = up × right
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const corrFwd = new THREE.Vector3().crossVectors(up, right).normalize();
    const m = new THREE.Matrix4().makeBasis(corrFwd, up, right);
    this._mesh.quaternion.setFromRotationMatrix(m);

    // Spin rotors
    this._mesh.traverse(child => {
      if (child.userData.isRotor) {
        if (child.userData.axis === 'y') child.rotation.y += 0.6;
        else child.rotation.z += 1.2;
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

    // Orient — compose world orientation with mesh's local -90° Y rotation
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._currentPos, this._prevPos);
    if (forward.lengthSq() > 0.0001) {
      forward.normalize();
      // Right-handed basis: right = forward × up, corrFwd = up × right
      const right = new THREE.Vector3().crossVectors(forward, up).normalize();
      const corrFwd = new THREE.Vector3().crossVectors(up, right).normalize();
      const m = new THREE.Matrix4().makeBasis(corrFwd, up, right);
      const worldQ = new THREE.Quaternion().setFromRotationMatrix(m);
      const localQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
      this._mesh.quaternion.copy(worldQ).multiply(localQ);
    }
  }
}

// ============================================================
// TERRAIN ALTITUDE HELPER — reads elevation from fire engine grid
// ============================================================
function getTerrainAlt(engine, lat, lng) {
  const latN = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
  const lngN = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN);
  const rowF = Math.max(0, Math.min(GRID_ROWS - 1.01, latN * GRID_ROWS));
  const colF = Math.max(0, Math.min(GRID_COLS - 1.01, lngN * GRID_COLS));
  const r0 = Math.floor(rowF), c0 = Math.floor(colF);
  const r1 = Math.min(r0 + 1, GRID_ROWS - 1), c1 = Math.min(c0 + 1, GRID_COLS - 1);
  const fr = rowF - r0, fc = colF - c0;
  const e = engine.elevation;
  // Bilinear interpolation
  const e00 = e[r0 * GRID_COLS + c0], e10 = e[r1 * GRID_COLS + c0];
  const e01 = e[r0 * GRID_COLS + c1], e11 = e[r1 * GRID_COLS + c1];
  return (e00 * (1 - fr) * (1 - fc) + e10 * fr * (1 - fc) +
          e01 * (1 - fr) * fc + e11 * fr * fc) + 3;
}

// ============================================================
// FIRE EDGE FINDER — find nearest burning cell edge from a lat/lng
// ============================================================
function findFireEdge(engine, lat, lng) {
  const { row, col } = engine.latLngToCell(lat, lng);
  for (let radius = 1; radius < 80; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
        if (engine.cells[r * GRID_COLS + c] !== BURNING) continue;
        // Check if it has an unburned neighbor (edge cell)
        for (const [nr, nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
          if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS &&
              engine.cells[nr * GRID_COLS + nc] === UNBURNED) {
            return engine.cellToLatLng(r, c);
          }
        }
      }
    }
  }
  return null;
}

// ============================================================
// FIREFIGHTER MESH — small humanoid in turnout gear
// ============================================================
const turnoutMat = new THREE.MeshStandardMaterial({ color: 0xc4a200, roughness: 0.7, metalness: 0.1 });
const helmetMat  = new THREE.MeshStandardMaterial({ color: 0xcccc00, roughness: 0.4, metalness: 0.3 });
const pantsMat   = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.1 });
const stripeMat  = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5, metalness: 0.2, emissive: 0x554400, emissiveIntensity: 0.3 });
const skinMat    = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8, metalness: 0.0 });
const bootMat    = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 });
const hoseMat    = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.3 });
const tankMat    = new THREE.MeshStandardMaterial({ color: 0xcccc22, roughness: 0.5, metalness: 0.2 });

function buildFirefighterMesh(scale = 1.0) {
  const fig = new THREE.Group();
  const s = scale;

  // Torso (turnout jacket — yellow/tan)
  const torsoGeo = new THREE.BoxGeometry(0.14 * s, 0.22 * s, 0.10 * s);
  const torso = new THREE.Mesh(torsoGeo, turnoutMat);
  torso.position.y = 0.28 * s;
  fig.add(torso);

  // Reflective stripes on torso (2 horizontal bands)
  [0.22, 0.34].forEach(yPos => {
    const stripeGeo = new THREE.BoxGeometry(0.15 * s, 0.012 * s, 0.105 * s);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = yPos * s;
    fig.add(stripe);
  });

  // SCBA air tank (on back)
  const scbaGeo = new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.16 * s, 6);
  const scba = new THREE.Mesh(scbaGeo, tankMat);
  scba.position.set(0, 0.30 * s, 0.06 * s);
  fig.add(scba);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.03 * s, 6);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.41 * s;
  fig.add(neck);

  // Head
  const headGeo = new THREE.SphereGeometry(0.045 * s, 8, 6);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.47 * s;
  fig.add(head);

  // Helmet (fire helmet with brim)
  const helmetGeo = new THREE.SphereGeometry(0.052 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.y = 0.50 * s;
  fig.add(helmet);

  // Helmet brim (front shield)
  const brimGeo = new THREE.BoxGeometry(0.10 * s, 0.035 * s, 0.01 * s);
  const brim = new THREE.Mesh(brimGeo, helmetMat);
  brim.position.set(0, 0.48 * s, -0.045 * s);
  brim.rotation.x = -0.2;
  fig.add(brim);

  // Arms (angled forward — holding hose)
  [-0.085, 0.085].forEach(xOff => {
    // Upper arm
    const upperGeo = new THREE.BoxGeometry(0.045 * s, 0.14 * s, 0.045 * s);
    const upper = new THREE.Mesh(upperGeo, turnoutMat);
    upper.position.set(xOff * s, 0.30 * s, -0.03 * s);
    upper.rotation.x = -0.5;
    fig.add(upper);
    // Lower arm (forearm) — angled forward
    const lowerGeo = new THREE.BoxGeometry(0.04 * s, 0.12 * s, 0.04 * s);
    const lower = new THREE.Mesh(lowerGeo, turnoutMat);
    lower.position.set(xOff * s, 0.22 * s, -0.10 * s);
    lower.rotation.x = -1.2;
    fig.add(lower);
    // Glove
    const gloveGeo = new THREE.BoxGeometry(0.04 * s, 0.03 * s, 0.04 * s);
    const glove = new THREE.Mesh(gloveGeo, darkMat);
    glove.position.set(xOff * s, 0.18 * s, -0.16 * s);
    fig.add(glove);
  });

  // Legs (pants)
  [-0.035, 0.035].forEach(xOff => {
    const legGeo = new THREE.BoxGeometry(0.055 * s, 0.18 * s, 0.06 * s);
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(xOff * s, 0.08 * s, 0);
    fig.add(leg);
    // Pant reflective stripe
    const pStripeGeo = new THREE.BoxGeometry(0.058 * s, 0.01 * s, 0.065 * s);
    const pStripe = new THREE.Mesh(pStripeGeo, stripeMat);
    pStripe.position.set(xOff * s, 0.06 * s, 0);
    fig.add(pStripe);
    // Boots
    const bootGeo = new THREE.BoxGeometry(0.055 * s, 0.05 * s, 0.08 * s);
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(xOff * s, -0.02 * s, -0.01 * s);
    fig.add(boot);
  });

  // Fire hose (held in front, extending outward)
  const hoseGeo = new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.30 * s, 6);
  const hose = new THREE.Mesh(hoseGeo, hoseMat);
  hose.rotation.x = -Math.PI / 2;
  hose.position.set(0, 0.18 * s, -0.30 * s);
  fig.add(hose);

  // Nozzle at end of hose
  const nozzleGeo = new THREE.ConeGeometry(0.018 * s, 0.04 * s, 6);
  const nozzle = new THREE.Mesh(nozzleGeo, frameMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.18 * s, -0.47 * s);
  fig.add(nozzle);

  return fig;
}

// ============================================================
// FIRE CREW CLASS — firefighters that deploy from truck
// ============================================================
const CREW_WALK_SPEED = 0.000008; // degrees per frame
const CREW_DEPLOY_DIST = 0.0008;  // degrees from truck (~80m)

export class FireCrew {
  constructor(ellipsoid, count = 4) {
    this.ellipsoid = ellipsoid;
    this._count = count;
    this.time = 0;
    this._deployed = false;
    this._scene = null;

    // Each crew member: { mesh, group, lat, lng, targetLat, targetLng, walking, spraying }
    this._members = [];
    for (let i = 0; i < count; i++) {
      const mesh = buildFirefighterMesh(8);
      const memberGroup = new THREE.Group();
      memberGroup.renderOrder = 1200;
      memberGroup.add(mesh);

      // Water spray line
      const sprayGeo = new THREE.BufferGeometry();
      sprayGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0, 0,0,0, 0,0,0], 3));
      const sprayMat = new THREE.LineBasicMaterial({
        color: 0x88ccff, transparent: true, opacity: 0.6, depthTest: false,
      });
      const sprayLine = new THREE.Line(sprayGeo, sprayMat);
      memberGroup.add(sprayLine);

      // Spray impact mist sprite
      const mistC = document.createElement('canvas');
      mistC.width = 32; mistC.height = 32;
      const mctx = mistC.getContext('2d');
      const grad = mctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(200,230,255,0.6)');
      grad.addColorStop(1, 'rgba(200,230,255,0)');
      mctx.fillStyle = grad;
      mctx.fillRect(0, 0, 32, 32);
      const mistMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(mistC),
        transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const mistSprite = new THREE.Sprite(mistMat);
      mistSprite.scale.set(12, 12, 1);
      mistSprite.visible = false;
      memberGroup.add(mistSprite);

      this._members.push({
        mesh, group: memberGroup, sprayLine, sprayMat, mistSprite,
        lat: 0, lng: 0, targetLat: 0, targetLng: 0,
        fireLat: 0, fireLng: 0,
        walking: false, spraying: false, walkT: 0,
        startLat: 0, startLng: 0,
      });
    }
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

  addToScene(scene) {
    this._scene = scene;
    this._members.forEach(m => scene.add(m.group));
  }

  removeFromScene() {
    if (!this._scene) return;
    this._members.forEach(m => this._scene.remove(m.group));
  }

  deploy(truckLat, truckLng, fireLat, fireLng) {
    this._deployed = true;
    // Direction from truck to fire
    const dLat = fireLat - truckLat;
    const dLng = fireLng - truckLng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    const nLat = dLat / dist, nLng = dLng / dist;
    // Perpendicular for fan spread
    const pLat = -nLng, pLng = nLat;

    this._members.forEach((m, i) => {
      m.startLat = truckLat;
      m.startLng = truckLng;
      m.lat = truckLat;
      m.lng = truckLng;
      // Fan out: deploy positions spread perpendicular to fire direction
      const spread = (i - (this._count - 1) / 2) * 0.00025;
      m.targetLat = truckLat + nLat * CREW_DEPLOY_DIST + pLat * spread;
      m.targetLng = truckLng + nLng * CREW_DEPLOY_DIST + pLng * spread;
      m.fireLat = fireLat;
      m.fireLng = fireLng;
      m.walking = true;
      m.spraying = false;
      m.walkT = 0;
    });
  }

  update(engine, camera, dt) {
    if (!this._deployed) {
      this._members.forEach(m => m.group.visible = false);
      return;
    }
    this.time += dt || 0.016;

    this._members.forEach((m, i) => {
      m.group.visible = true;

      if (m.walking) {
        // Stagger deployment: each crew member starts walking 0.5s after the previous
        const staggerDelay = i * 0.5;
        if (this.time < staggerDelay) return;

        m.walkT = Math.min(m.walkT + 0.008, 1);
        m.lat = m.startLat + (m.targetLat - m.startLat) * m.walkT;
        m.lng = m.startLng + (m.targetLng - m.startLng) * m.walkT;

        if (m.walkT >= 1) {
          m.walking = false;
          m.spraying = true;
        }
      }

      // Animate walking legs via slight bob
      if (m.walking) {
        m.mesh.position.y = Math.abs(Math.sin(this.time * 8 + i)) * 0.5;
      } else {
        m.mesh.position.y = 0;
      }

      // Position on terrain
      const alt = getTerrainAlt(engine, m.lat, m.lng);
      const pos = new THREE.Vector3();
      this._latLngToECEF(m.lat, m.lng, alt, pos);
      m.group.position.copy(pos);

      // Orient to face fire
      const up = this._getNormal(m.lat, m.lng);
      const firePos = new THREE.Vector3();
      this._latLngToECEF(m.fireLat, m.fireLng, alt, firePos);
      const forward = firePos.clone().sub(pos);
      if (forward.lengthSq() > 0.001) {
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        const corrFwd = new THREE.Vector3().crossVectors(right, up).normalize();
        const mat = new THREE.Matrix4().makeBasis(corrFwd, up, right);
        m.mesh.quaternion.setFromRotationMatrix(mat);
      }

      // Water spray effect
      if (m.spraying) {
        m.sprayLine.visible = true;
        m.mistSprite.visible = true;
        // Spray oscillates side to side
        const osc = Math.sin(this.time * 2.5 + i * 1.5) * 0.3;
        const sprayLen = 25 + Math.sin(this.time * 1.8 + i) * 5;
        const sprayUp = 8 + Math.sin(this.time * 3 + i * 0.7) * 2;

        // Local spray direction (relative to group)
        const localFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.mesh.quaternion);
        const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(m.mesh.quaternion);
        const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(m.mesh.quaternion);

        // Nozzle position (in front of figure)
        const nozzlePos = localFwd.clone().multiplyScalar(4).add(localUp.clone().multiplyScalar(1.5));
        // Mid arc point (spray arcs up)
        const midPos = localFwd.clone().multiplyScalar(sprayLen * 0.5)
          .add(localRight.clone().multiplyScalar(osc * 5))
          .add(localUp.clone().multiplyScalar(sprayUp));
        // Impact point
        const impactPos = localFwd.clone().multiplyScalar(sprayLen)
          .add(localRight.clone().multiplyScalar(osc * 8))
          .add(localUp.clone().multiplyScalar(2));

        const positions = m.sprayLine.geometry.attributes.position;
        positions.setXYZ(0, nozzlePos.x, nozzlePos.y, nozzlePos.z);
        positions.setXYZ(1, midPos.x, midPos.y, midPos.z);
        positions.setXYZ(2, impactPos.x, impactPos.y, impactPos.z);
        positions.needsUpdate = true;
        m.sprayLine.geometry.setDrawRange(0, 3);

        m.sprayMat.opacity = 0.4 + 0.2 * Math.sin(this.time * 4 + i);
        m.mistSprite.position.copy(impactPos);
        m.mistSprite.material.opacity = 0.3 + 0.2 * Math.sin(this.time * 3 + i * 2);
      } else {
        m.sprayLine.visible = false;
        m.mistSprite.visible = false;
      }
    });
  }
}

// ============================================================
// FIRE TRUCK CLASS — terrain-following, deploys crew at fire edge
// ============================================================
const TRUCK_GROUND_OFFSET = 3;
const TRUCK_SPEED = 0.012; // road progress per second

export class ResponseFireTruck {
  // States: 'idle' → 'enroute' → 'deployed'
  constructor(ellipsoid, tiles, id, roadPoints, crewCount = 4) {
    this.ellipsoid = ellipsoid;
    this.tiles = tiles;
    this.id = id;
    this.time = 0;
    this._road = roadPoints;
    this._state = 'idle';
    this._roadProgress = 0; // 0..1 along route

    this._targetPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._currentLat = roadPoints[0].lat;
    this._currentLng = roadPoints[0].lng;

    const start = roadPoints[0];
    const startAlt = 3;
    this._latLngToECEF(start.lat, start.lng, startAlt, this._currentPos);
    this._targetPos.copy(this._currentPos);
    this._prevPos.copy(this._currentPos);

    this.group = new THREE.Group();
    this.group.renderOrder = 1100;

    this._mesh = buildFireTruckMesh(22);
    this.group.add(this._mesh);

    this._lightTime = 0;

    this._label = createLabel(id, '#ff6622');
    this.group.add(this._label);
    this.group.position.copy(this._currentPos);

    // Crew
    this._crew = new FireCrew(ellipsoid, crewCount);
    this._crewDeployed = false;
    this._scene = null;
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

  addToScene(scene) {
    this._scene = scene;
    scene.add(this.group);
    this._crew.addToScene(scene);
  }

  _interpRoad(t) {
    const road = this._road;
    const n = road.length;
    const idx = Math.min(Math.floor(t * (n - 1)), n - 2);
    const segT = (t * (n - 1)) - idx;
    const p1 = road[idx], p2 = road[Math.min(idx + 1, n - 1)];
    return {
      lat: p1.lat + (p2.lat - p1.lat) * segT,
      lng: p1.lng + (p2.lng - p1.lng) * segT,
    };
  }

  update(engine, camera, dt) {
    this.time += dt || 0.016;
    this._prevPos.copy(this._currentPos);

    // Check for fire
    let fireCount = 0;
    for (let i = 0; i < engine.cells.length; i++) {
      if (engine.cells[i] === BURNING) { fireCount++; break; }
    }

    // State machine
    if (this._state === 'idle' && fireCount > 0) {
      this._state = 'enroute';
      this._roadProgress = 0;
    }

    let lat, lng;

    if (this._state === 'enroute') {
      this._roadProgress = Math.min(this._roadProgress + TRUCK_SPEED * (dt || 0.016), 1);
      const pos = this._interpRoad(this._roadProgress);
      lat = pos.lat;
      lng = pos.lng;

      if (this._roadProgress >= 1) {
        this._state = 'deployed';
      }
    } else if (this._state === 'deployed') {
      // Stay at end of route
      const pos = this._interpRoad(1);
      lat = pos.lat;
      lng = pos.lng;

      // Deploy crew once
      if (!this._crewDeployed) {
        this._crewDeployed = true;
        const fireEdge = findFireEdge(engine, lat, lng);
        if (fireEdge) {
          this._crew.deploy(lat, lng, fireEdge.lat, fireEdge.lng);
        }
      }
    } else {
      // Idle — stay at start
      lat = this._road[0].lat;
      lng = this._road[0].lng;
    }

    this._currentLat = lat;
    this._currentLng = lng;

    // Terrain-following altitude
    const alt = getTerrainAlt(engine, lat, lng);
    this._latLngToECEF(lat, lng, alt, this._targetPos);
    this._normal.copy(this._getNormal(lat, lng));

    this._currentPos.lerp(this._targetPos, 0.06);
    this.group.position.copy(this._currentPos);

    // Orient truck along road direction
    const up = this._normal.clone();
    const forward = new THREE.Vector3().subVectors(this._currentPos, this._prevPos);
    if (forward.lengthSq() > 0.0001) {
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      const corrFwd = new THREE.Vector3().crossVectors(right, up).normalize();
      const m = new THREE.Matrix4().makeBasis(corrFwd, up, right);
      const worldQ = new THREE.Quaternion().setFromRotationMatrix(m);
      const localQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
      this._mesh.quaternion.copy(worldQ).multiply(localQ);
    }

    // Flash emergency lights when en route or deployed
    if (this._state !== 'idle') {
      this._lightTime += dt || 0.016;
      this._mesh.traverse(child => {
        if (child.userData.isLight) {
          const flash = Math.sin(this._lightTime * 8 + child.userData.phase) > 0;
          child.visible = flash;
        }
      });
    }

    // Update crew
    this._crew.update(engine, camera, dt);
  }
}
