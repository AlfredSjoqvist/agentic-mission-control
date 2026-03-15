import * as Cesium from 'cesium';

/**
 * Minecraft creative mode flight controls for CesiumJS.
 *
 * Click canvas to lock pointer.
 * WASD = move forward/left/back/right
 * Space = fly up, Shift = fly down
 * Mouse = look around
 * Scroll = adjust speed
 * Escape = release pointer lock
 */
export function enableFlightControls(viewer) {
  const scene = viewer.scene;
  const canvas = viewer.canvas;
  const camera = viewer.camera;

  // Disable default Cesium mouse controls
  scene.screenSpaceCameraController.enableRotate = false;
  scene.screenSpaceCameraController.enableTranslate = false;
  scene.screenSpaceCameraController.enableZoom = false;
  scene.screenSpaceCameraController.enableTilt = false;
  scene.screenSpaceCameraController.enableLook = false;

  // State
  const keys = {};
  let speed = 50; // meters per frame tick (~50m at 60fps ≈ 3000m/s base, scaled by dt)
  let locked = false;

  // Pointer lock
  canvas.addEventListener('click', () => {
    if (!locked) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  // Mouse look
  const sensitivity = 0.002;
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    const dx = e.movementX * sensitivity;
    const dy = e.movementY * sensitivity;

    // Yaw (left/right) — rotate around the up axis
    camera.lookRight(dx);
    // Pitch (up/down) — rotate around the right axis
    camera.lookDown(dy);
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Scroll to adjust speed
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      speed = Math.min(speed * 1.3, 5000);
    } else {
      speed = Math.max(speed / 1.3, 5);
    }
  }, { passive: false });

  // Movement loop — runs every frame via Cesium's preUpdate event
  const removeListener = scene.preUpdate.addEventListener(() => {
    if (!locked) return;

    // Forward/back (along camera direction projected onto horizontal plane)
    const direction = camera.direction;
    const right = camera.right;
    const up = Cesium.Cartesian3.clone(camera.up);

    // Get the "world up" at the camera's current position (normalized position on ellipsoid)
    const worldUp = new Cesium.Cartesian3();
    Cesium.Cartesian3.normalize(camera.position, worldUp);

    const move = new Cesium.Cartesian3(0, 0, 0);

    if (keys['KeyW'] || keys['ArrowUp']) {
      Cesium.Cartesian3.add(move, direction, move);
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
      Cesium.Cartesian3.subtract(move, direction, move);
    }
    if (keys['KeyA'] || keys['ArrowLeft']) {
      Cesium.Cartesian3.subtract(move, right, move);
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
      Cesium.Cartesian3.add(move, right, move);
    }

    // Up/down (along world up, not camera up)
    if (keys['Space']) {
      Cesium.Cartesian3.add(move, worldUp, move);
    }
    if (keys['ShiftLeft'] || keys['ShiftRight']) {
      Cesium.Cartesian3.subtract(move, worldUp, move);
    }

    // Normalize and apply speed
    if (Cesium.Cartesian3.magnitude(move) > 0) {
      Cesium.Cartesian3.normalize(move, move);
      Cesium.Cartesian3.multiplyByScalar(move, speed, move);
      Cesium.Cartesian3.add(camera.position, move, camera.position);
    }
  });

  // Return cleanup function
  return function disableFlightControls() {
    removeListener();
    scene.screenSpaceCameraController.enableRotate = true;
    scene.screenSpaceCameraController.enableTranslate = true;
    scene.screenSpaceCameraController.enableZoom = true;
    scene.screenSpaceCameraController.enableTilt = true;
    scene.screenSpaceCameraController.enableLook = true;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };
}
