# 3D Map Viewer — Context for New Chat

## What This Is
A separate app for the **3D photorealistic map** component of **FireSight** — a spatial VR wildfire command center for the "Worlds in Action" hackathon (March 13-15, 2026). The main 2D app runs on `localhost:5173`. This 3D viewer should run on a **different port** (e.g., `localhost:5174`).

## Project Root
`c:\Users\Alfred\Desktop\agentic-mission-control`

## Goal
Build a 3D photorealistic terrain viewer for the Palisades Fire zone using **Google Maps 3D Tiles API**. This will be the immersive 3D view (neighborhood-level detail with 3D buildings and terrain) while the main app at `localhost:5173` handles the 2D satellite overview.

## What We Have Working

### API Keys (in `.env` at project root)
```
VITE_GOOGLE_MAPS_API_KEY="AIzaSyCt4tf9JgSKSFeFK24hpFLmLpuhGmohYzE"
MARBLE_API_KEY="UejO70nhH2bV7cqvrkyVEEsL266Vd0kx"
VITE_CESIUM_ION_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhMDlhMjQ2OC03YzZmLTQwMGUtOTk0Zi1iNDMzYmVmNzMyYmEiLCJpZCI6NDAzNzE0LCJpYXQiOjE3NzM1MTcyODF9.JAolyKVMtUtG8VKnHvz1r93jH_IRHSOjE6s36FBwPPw"
```

### Google Maps 3D Tiles API — CONFIRMED WORKING
- Billing is enabled on the Google Cloud project
- The Map Tiles API is enabled
- **3D Tiles endpoint works**: `https://tile.googleapis.com/v1/3dtiles/root.json?key=AIzaSyCt4tf9JgSKSFeFK24hpFLmLpuhGmohYzE` returns valid 3DTiles tileset JSON
- This is a standard **3D Tiles** (OGC) tileset — can be loaded with CesiumJS, Three.js + 3d-tiles-renderer, deck.gl, etc.

### What Was Tried and Failed
1. **`Map3DElement`** (Google's `maps3d` library) — Creates element but never renders. Shows loading spinner forever. Likely requires **WebGPU** browser support which isn't available.
2. **Standard `google.maps.Map`** with `tilt: 60` — Works for satellite view but only shows flat tiles, not true photorealistic 3D.

### What Should Work (Not Yet Tried)
1. **CesiumJS + Google 3D Tiles** — Load the 3D Tiles endpoint directly into a Cesium viewer. Cesium has native 3D Tiles support.
   - Package: `cesium` (already in project dependencies)
   - Token: `VITE_CESIUM_ION_TOKEN` is set
2. **Three.js + `3d-tiles-renderer`** — npm package `3d-tiles-renderer` can load Google's 3D Tiles into a Three.js scene
3. **deck.gl `Tile3DLayer`** — Can load 3D Tiles directly

### Marble API (World Labs)
- Also available for generating custom 3D gaussian splat views of specific locations
- Server at `localhost:3001` has a Marble grid cache system (9 cells loaded)
- Could be used for ultra-detailed neighborhood views on top of Google 3D base

## Location Data
```js
const PALISADES = { lat: 34.045, lng: -118.529 };

const FIRE_PERIMETER = [
  { lat: 34.055, lng: -118.555 },
  { lat: 34.068, lng: -118.520 },
  { lat: 34.062, lng: -118.498 },
  { lat: 34.042, lng: -118.490 },
  { lat: 34.025, lng: -118.502 },
  { lat: 34.020, lng: -118.530 },
  { lat: 34.032, lng: -118.552 },
  { lat: 34.055, lng: -118.555 },
];
```

## Tech Stack
- Vite + React
- The main app (`firesight/`) uses Vite on port 5173
- This 3D viewer should use its own Vite app on a different port (e.g., 5174)
- Backend server runs on port 3001

## Hackathon Context
- Building for "Best Agentic Mission Control with PICO" track
- Needs to run on PICO VR headset (WebXR compatible)
- Demo in ~12 hours — prioritize working over polished
- Full hackathon details in `CLAUDE.md` at project root
