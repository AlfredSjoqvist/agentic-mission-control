# IMPLEMENTATION PLAN — FireSight

**Goal**: Working live demo ASAP, then polish.
**Team**: Alfred (Engineer) + Friend (Product Designer)
**Target Track**: Best Agentic Mission Control with PICO

---

## Workstream Overview

```
HOUR  0   1   2   3   4   5   6   7   8   9  10  11  12
      ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
ENG   │▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓│
      │ 1.Backend  │ 2.Agents   │ 3.Voice│ 6.Integrate│
      │ +Marble API│ +LLM       │ Input  │ +Demo      │
DES   │▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓│
      │ 4.WebSpatial│ 5.Dynamic │ PICO   │ 6.Demo     │
      │ +PICO setup │ UI + Panels│ Test   │ Script     │
```

**Integration points** are marked with `>>> SYNC <<<` — moments where both people must align.

---

## WORKSTREAM A — ENGINEER (Alfred)

### 1. Backend + Marble API Integration

**What**: Express proxy server that calls the Marble API and serves Gaussian Splats to the frontend via SparkJS.

#### 1.1 Create the backend server

Create `server/` at the project root (sibling to `firesight/`).

**File: `server/package.json`**
```json
{
  "name": "firesight-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7"
  }
}
```

**File: `server/index.js`**
```js
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const API_BASE = 'https://api.worldlabs.ai/marble/v1';
const headers = {
  'WLT-Api-Key': process.env.MARBLE_API_KEY,
  'Content-Type': 'application/json',
};

// Serve pre-generated splat files
app.use('/assets', express.static(resolve('..', 'assets')));

// Generate a world from text or image
app.post('/api/worlds/generate', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/worlds:generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll operation status
app.get('/api/operations/:id', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/operations/${req.params.id}`, {
      headers: { 'WLT-Api-Key': process.env.MARBLE_API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get world details (including splat download URLs)
app.get('/api/worlds/:id', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/worlds/${req.params.id}`, {
      headers: { 'WLT-Api-Key': process.env.MARBLE_API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy splat file downloads (avoids CORS issues)
app.get('/api/proxy-asset', async (req, res) => {
  try {
    const { url } = req.query;
    const response = await fetch(url, {
      headers: { 'WLT-Api-Key': process.env.MARBLE_API_KEY },
    });
    res.set('Content-Type', response.headers.get('content-type'));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`FireSight server on :${PORT}`));
```

Run: `cd server && npm install && npm run dev`

#### 1.2 Pre-generate wildfire terrain worlds

Create a script `server/generate-worlds.js` that:
1. Calls `POST /api/worlds/generate` with wildfire terrain prompts:
   - `"Aerial view of a California mountain wildfire zone, dry chaparral hillside, El Dorado County, smoke visible"`
   - `"Satellite view of burning forest terrain, mountainous landscape, firefighting operations visible"`
2. Polls until done
3. Downloads the SPZ file (use 500k resolution for performance) + GLB collider mesh
4. Saves to `assets/worlds/` directory

Use `Marble 0.1-mini` for fast iteration (30-45s), `Marble 0.1-plus` for the final demo asset.

Run this script 2-3 times to have fallback worlds cached locally.

#### 1.3 Integrate SparkJS into the frontend

**Install in `firesight/`:**
```bash
npm install @sparkjsdev/spark
```

**Modify `TerrainScene.jsx`:**
- Import `SplatMesh` from `@sparkjsdev/spark`
- Add a `worldUrl` prop (URL to the SPZ file, served from backend or local)
- When `worldUrl` is provided, load the splat and add to scene instead of procedural terrain
- Keep procedural terrain as fallback when `worldUrl` is null
- Load the GLB collider mesh via Three.js `GLTFLoader` for raycasting (replaces procedural PlaneGeometry for click detection)

Key code change in the `useEffect` setup:
```js
import { SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Inside the scene setup:
if (worldUrl) {
  // Load Marble-generated world
  const splat = new SplatMesh({ url: worldUrl });
  scene.add(splat);

  // Load collider mesh for raycasting
  const loader = new GLTFLoader();
  loader.load(colliderUrl, (gltf) => {
    const collider = gltf.scene;
    collider.visible = false; // invisible, just for raycasting
    scene.add(collider);
    sceneRef.current.terrain = collider; // use for click detection
  });
} else {
  // Fallback: procedural terrain (existing code)
  const geo = buildTerrain();
  // ... existing code ...
}
```

**Add to `App.jsx`:**
```js
const [worldUrl, setWorldUrl] = useState(null);
const [colliderUrl, setColliderUrl] = useState(null);

// On mount, try to load pre-generated world
useEffect(() => {
  fetch('http://localhost:3001/assets/worlds/manifest.json')
    .then(r => r.json())
    .then(manifest => {
      if (manifest.worlds?.length > 0) {
        const world = manifest.worlds[0];
        setWorldUrl(`http://localhost:3001/assets/worlds/${world.splat}`);
        setColliderUrl(`http://localhost:3001/assets/worlds/${world.collider}`);
      }
    })
    .catch(() => {}); // fallback to procedural
}, []);
```

**File: `assets/worlds/manifest.json`** (created by generate-worlds.js)
```json
{
  "worlds": [
    {
      "name": "Pine Ridge Complex",
      "splat": "pine-ridge.spz",
      "collider": "pine-ridge.glb",
      "worldId": "abc123"
    }
  ]
}
```

#### 1.4 Vite proxy config

Update `firesight/vite.config.js` to proxy API calls to the backend:
```js
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/assets': 'http://localhost:3001',
    },
  },
});
```

**>>> SYNC <<< After 1.3**: Designer can see the Marble terrain in the browser. Verify fire overlays still render on top of the splat.

---

### 2. Agent Backend + LLM Integration

**What**: Real agent logic that returns dynamic data. At least Pyro must compute real responses. Other agents can use structured mock data enhanced with LLM reasoning.

#### 2.1 Agent API endpoints

Add to `server/index.js`:

```js
// Agent command endpoint
app.post('/api/agent/:agentId/command', async (req, res) => {
  const { agentId } = req.params;
  const { command, worldState } = req.body;

  const agentResponse = await runAgent(agentId, command, worldState);
  res.json(agentResponse);
});
```

#### 2.2 Agent logic module

**File: `server/agents.js`**

Each agent is a function that takes a command + world state and returns structured data.

**Pyro Agent** (fire prediction):
- Input: wind speed/direction, humidity, temperature, slope, current fire perimeter
- Output: projected fire spread zones (arrays of {cx, cz, radius} for each time step), rate of spread, spotting risk level, confidence
- Implementation: Use a simple physics-based model (Rothermel-style spread rate = f(wind, slope, fuel moisture)) OR call Claude/Featherless API with the world state to get a reasoned fire analysis
- The output directly updates the fire overlay positions/sizes in TerrainScene

**Swarm Agent** (drone coordination):
- Input: fire perimeter, coverage gaps, available drones
- Output: drone positions (array of {x, z, status}), coverage percentage, recommended dispatch targets
- Implementation: Simple coverage algorithm — distribute drones around fire perimeter + gaps

**Evac Agent** (evacuation routing):
- Input: fire spread projection, road network (hardcoded for demo), population centers
- Output: route statuses (open/blocked/warning), civilian counts, recommended evacuation order
- Implementation: Check if projected fire overlaps routes, update status accordingly

**Deploy Agent** (resource management):
- Input: fire status, available resources, current deployments
- Output: unit positions, recommended deployments, resource utilization
- Implementation: Priority-based allocation near active fire fronts

#### 2.3 LLM-powered agent reasoning (Claude or Featherless)

Add to `server/agents.js`:

```js
async function getLLMAnalysis(agentId, command, worldState) {
  // Use Claude API for agent reasoning
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: AGENT_SYSTEM_PROMPTS[agentId],
      messages: [{ role: 'user', content: formatAgentPrompt(command, worldState) }],
    }),
  });
  return response.json();
}
```

System prompts per agent:
- **Pyro**: "You are Pyro, a wildfire behavior analyst. Given weather and terrain data, provide fire spread predictions. Respond with JSON: {spreadRate, spottingRisk, projectedAcres, confidence, analysis}."
- **Swarm**: "You are Swarm, a drone fleet coordinator. Given fire perimeter and drone positions, recommend optimal drone deployments. Respond with JSON."
- **Evac**: "You are Evac, an evacuation routing specialist. Given fire projections and road network, assess route safety. Respond with JSON."
- **Deploy**: "You are Deploy, a resource deployment coordinator. Given fire status and available assets, recommend crew and tanker positioning. Respond with JSON."

Use Haiku for speed (~200ms responses). Fall back to hardcoded responses if API is slow.

#### 2.4 Frontend: Connect agent panels to backend

**Modify `AgentPanel.jsx`:**
- Replace static `PANELS` data with a `useAgentData` hook that fetches from `/api/agent/:id/command`
- Agent panels poll every 5 seconds for updated world state
- Button clicks (Dispatch, Predict Spread, etc.) send commands to the backend
- Response data updates panel metrics in real-time
- Add a `agentMessage` field that shows the LLM's natural language analysis (1-2 sentences)

**Modify `App.jsx`:**
- Add a `worldState` object that aggregates current fire zones, weather, drone positions
- Pass `worldState` down to agent command calls
- Agent responses update the `worldState`, which flows back to TerrainScene

**>>> SYNC <<< After 2.4**: Dynamic agent data flows into the panels the Designer is polishing.

---

### 3. Voice Input

**What**: Web Speech API for voice commands routed to agents.

#### 3.1 Voice recognition hook

**File: `firesight/src/hooks/useVoiceInput.js`**

```js
export function useVoiceInput(onCommand) {
  // Uses Web Speech API (SpeechRecognition)
  // Continuous listening mode
  // On result: parse transcript for agent commands
  // Returns { isListening, transcript, startListening, stopListening }
}
```

#### 3.2 Command parser

**File: `firesight/src/utils/commandParser.js`**

Parse natural language into agent commands:
- "Pyro, predict fire spread" → `{ agent: 'pyro', action: 'predict', params: {} }`
- "Swarm, dispatch drones to sector 4" → `{ agent: 'swarm', action: 'dispatch', params: { target: 'sector4' } }`
- "Evac, route civilians from Sunset Ridge" → `{ agent: 'evac', action: 'route', params: { area: 'sunset-ridge' } }`
- "Deploy, send Engine 7 to northern front" → `{ agent: 'deploy', action: 'dispatch', params: { unit: 'engine-7', target: 'north' } }`

Simple keyword matching is fine — doesn't need NLP. Match agent name + action verb.

#### 3.3 Voice UI indicator

Add to the header bar in `App.jsx`:
- Microphone icon (from lucide-react: `Mic` / `MicOff`)
- Pulsing red dot when listening
- Show last recognized command text briefly (fade out after 3s)
- Voice feedback: when a command is parsed, briefly highlight the target agent panel

**>>> SYNC <<< After 3.3**: Designer can style the voice indicator and test the interaction flow.

---

## WORKSTREAM B — PRODUCT DESIGNER (Friend)

### 4. WebSpatial + PICO Setup

**What**: Make the app run as a spatial app on PICO. Even if WebSpatial's PICO support is incomplete, get it running in PICO browser at minimum.

#### 4.1 Install WebSpatial SDK

In `firesight/`:
```bash
npm install @webspatial/react-sdk @webspatial/core-sdk @google/model-viewer
npm install -D @webspatial/vite-plugin @webspatial/builder
```

(`three` is already installed)

#### 4.2 Configure Vite for WebSpatial

Update `firesight/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webSpatial from '@webspatial/vite-plugin';

export default defineConfig({
  plugins: [react(), webSpatial()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/assets': 'http://localhost:3001',
    },
  },
});
```

#### 4.3 Make the app a minimal PWA (WebSpatial prerequisite)

Add to `firesight/public/manifest.json`:
```json
{
  "name": "FireSight",
  "short_name": "FireSight",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0e14",
  "theme_color": "#E84430"
}
```

Add to `firesight/index.html` `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
```

#### 4.4 Test on PICO headset

1. Connect PICO to same Wi-Fi as dev machine
2. Open PICO browser → navigate to `http://<dev-machine-ip>:5173`
3. Verify: terrain renders, panels are readable, buttons are tappable
4. Note any issues: text too small, touch targets too small, performance

If WebSpatial works on PICO:
- Wrap agent panels in WebSpatial spatial containers so they float as independent windows
- Enable depth/z-axis positioning

If WebSpatial doesn't work on PICO yet:
- Fall back to PICO browser (fullscreen web app is still valid)
- Focus on making the UI touch-friendly and readable at headset resolution

#### 4.5 PICO-specific UI adjustments

- Increase minimum touch targets to 44px (VR tappability)
- Increase font sizes by ~20% for headset readability
- Add a `?pico=1` URL param that triggers VR-optimized layout
- Consider wider panel spacing for spatial depth perception

**>>> SYNC <<< After 4.4**: Engineer needs to know if WebSpatial works on PICO to decide on backend deployment strategy.

---

### 5. Dynamic UI + Panel Polish

**What**: Make the agent panels feel alive with real-time data, transitions, and interaction feedback. This work runs in parallel with the Engineer building the agent backend — use mock data initially, then swap in real data when the backend is ready.

#### 5.1 Agent panel animations

In `AgentPanel.jsx`:
- Add number count-up animation when metrics change (e.g., "74%" → "91%")
- Add subtle pulse/glow when an agent receives a new command
- Add a "thinking" state: show a subtle loading shimmer when waiting for agent response
- Smooth transitions when switching between idle/active states

#### 5.2 Agent message display

Add a text area in each panel for the LLM's natural language output:
- 1-2 sentences of agent analysis (e.g., "Fire behavior is erratic due to crosswinds. Spotting risk elevated beyond ridgeline.")
- Typewriter animation for the text (character by character, like a live feed)
- Mono font, dimmer color than metrics, but readable

#### 5.3 TerrainScene overlay improvements

Work with the Engineer to ensure fire overlays render correctly on the Marble splat:
- Fire overlays may need repositioning/scaling for the new terrain geometry
- Test that raycasting works on the GLB collider mesh
- Adjust camera orbit parameters if the splat world has different scale

#### 5.4 Voice command feedback

When the voice system (Task 3) detects a command:
- Flash the border of the target agent panel (e.g., Pyro panel glows orange for 1s)
- Show the recognized command text at the top of the screen
- Play a subtle audio cue (optional: use Web Audio API for a soft "ping")

#### 5.5 Loading / connection states

- Add a loading screen for when the Marble world is loading (SparkJS splat load)
- "Connecting to agents..." state on first load
- Graceful fallback messages if backend is unreachable

**>>> SYNC <<< After 5.2**: Engineer's agent responses flow into the panels Designer has polished.

---

## SHARED TASKS

### 6. Integration + Demo Preparation

Both team members work together on this final phase.

#### 6.1 End-to-end integration test

Run the full stack:
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
cd firesight && npm run dev
```

Test the complete flow:
1. App loads → Marble terrain (or fallback procedural) renders
2. Agent panels show dynamic data from backend
3. Click "Predict Spread" → Pyro agent returns fire projection → terrain updates
4. Click "Dispatch" on Swarm → drones appear on terrain
5. Voice command: "Pyro, predict fire spread" → same as clicking the button
6. Timeline scrubber still works with the new terrain

#### 6.2 Pre-generate final demo worlds

Using `server/generate-worlds.js`:
- Generate 2-3 high-quality worlds using `Marble 0.1-plus` model
- Save SPZ + GLB files to `assets/worlds/`
- Pick the best-looking one for the demo
- Update `manifest.json`

#### 6.3 Demo script (3 minutes)

**0:00-0:30** — Hook
"This is how wildfire commanders work today — radios, flat maps, chaos." [Show slide or photo of current ICS setup] "What if they could stand INSIDE the fire zone?"

**0:30-0:45** — World Model
"This terrain was generated by World Labs Marble from a single aerial photograph." [Show the Marble-generated 3D terrain in the viewer] "It's a Gaussian splat — photorealistic, explorable, real-time."

**0:45-1:30** — Agents
"Meet my agents." [Point to panels]
- "Pyro, predict fire spread." [Voice command or button → fire overlay animates]
- "Swarm is coordinating 12 drones." [Show drone positions on terrain]
- "Evac has identified 3 evacuation routes." [Show routes light up]

**1:30-2:15** — The Loop (most important part!)
"Let me show you the command loop."
- [Click on terrain] → Context menu: "Deploy crew here"
- [Crew icon appears] → Deploy panel updates
- [Scrub timeline forward] → Fire spread shows the crew is in the right position
- "That decision just saved a crew 20 minutes of repositioning."

**2:15-2:45** — On PICO (if working)
"And this runs on PICO." [Put on headset or show screen mirror]
"The panels float around you. The terrain is below you. You ARE the incident commander."

**2:45-3:00** — Close
"Today, incident commanders make life-or-death decisions from a folding table. FireSight gives them spatial awareness. Built with Marble, powered by AI agents, running on PICO."

#### 6.4 Fallback plan

If something breaks during demo:
- **Marble API down**: Pre-generated worlds cached locally, auto-fallback
- **Agent backend down**: Frontend shows last-known-good data, static mock still looks good
- **Voice not working**: All commands also available via buttons (already built)
- **PICO not working**: Demo on laptop, mention PICO compatibility
- **Everything breaks**: Procedural terrain + static panels still make a polished demo

---

## File Structure (After Implementation)

```
agentic-mission-control/
├── .env                          # MARBLE_API_KEY, CLAUDE_API_KEY, FEATHERLESS_API_KEY
├── CLAUDE.md
├── IDEA.md
├── IMPLEMENTATION_PLAN.md
├── assets/
│   └── worlds/                   # Pre-generated Marble worlds
│       ├── manifest.json
│       ├── pine-ridge.spz
│       └── pine-ridge.glb
├── server/                       # NEW — Express backend
│   ├── package.json
│   ├── index.js                  # API proxy + static serving
│   ├── agents.js                 # Agent logic + LLM integration
│   └── generate-worlds.js        # Script to pre-generate worlds
├── firesight/                    # Existing React frontend
│   ├── package.json              # + @sparkjsdev/spark, @webspatial/*
│   ├── vite.config.js            # + webspatial plugin, proxy config
│   ├── public/
│   │   └── manifest.json         # NEW — PWA manifest
│   └── src/
│       ├── App.jsx               # + worldUrl state, voice UI, agent data flow
│       ├── hooks/
│       │   ├── useVoiceInput.js  # NEW — Web Speech API
│       │   └── useAgentData.js   # NEW — Agent data fetching
│       ├── utils/
│       │   └── commandParser.js  # NEW — Voice command parsing
│       ├── components/
│       │   ├── TerrainScene.jsx  # + SplatMesh loading, fallback logic
│       │   ├── AgentPanel.jsx    # + dynamic data, LLM messages, animations
│       │   ├── Timeline.jsx
│       │   ├── StatusBar.jsx
│       │   └── ContextMenu.jsx
│       └── styles/
│           └── designTokens.js
└── context/                      # Research (unchanged)
```

---

## Quick Reference: Dependencies to Install

**Backend (`server/`):**
```bash
npm install express cors dotenv
```

**Frontend (`firesight/`):**
```bash
npm install @sparkjsdev/spark
npm install @webspatial/react-sdk @webspatial/core-sdk @google/model-viewer
npm install -D @webspatial/vite-plugin @webspatial/builder
```

---

## Task Checklist

| # | Task | Owner | Depends On | Status |
|---|------|-------|------------|--------|
| 1.1 | Create backend server | Engineer | — | [ ] |
| 1.2 | Pre-generate wildfire worlds | Engineer | 1.1 | [ ] |
| 1.3 | Integrate SparkJS into TerrainScene | Engineer | 1.1, 1.2 | [ ] |
| 1.4 | Vite proxy config | Engineer | 1.1 | [ ] |
| 2.1 | Agent API endpoints | Engineer | 1.1 | [ ] |
| 2.2 | Agent logic module | Engineer | 2.1 | [ ] |
| 2.3 | LLM-powered agent reasoning | Engineer | 2.2 | [ ] |
| 2.4 | Connect agent panels to backend | Engineer | 2.2 | [ ] |
| 3.1 | Voice recognition hook | Engineer | — | [ ] |
| 3.2 | Command parser | Engineer | 3.1 | [ ] |
| 3.3 | Voice UI indicator | Engineer | 3.1, 3.2 | [ ] |
| 4.1 | Install WebSpatial SDK | Designer | — | [ ] |
| 4.2 | Configure Vite for WebSpatial | Designer | 4.1 | [ ] |
| 4.3 | PWA manifest | Designer | — | [ ] |
| 4.4 | Test on PICO headset | Designer | 4.1 | [ ] |
| 4.5 | PICO-specific UI adjustments | Designer | 4.4 | [ ] |
| 5.1 | Agent panel animations | Designer | — | [ ] |
| 5.2 | Agent message display (typewriter) | Designer | — | [ ] |
| 5.3 | TerrainScene overlay adjustments | Designer + Engineer | 1.3 | [ ] |
| 5.4 | Voice command feedback UI | Designer | 3.3 | [ ] |
| 5.5 | Loading / connection states | Designer | 1.3 | [ ] |
| 6.1 | End-to-end integration test | Both | All above | [ ] |
| 6.2 | Pre-generate final demo worlds | Engineer | 1.2 | [ ] |
| 6.3 | Demo script rehearsal | Both | 6.1 | [ ] |
| 6.4 | Fallback plan verification | Both | 6.1 | [ ] |
