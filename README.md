# FireSight — Spatial Command Center for Wildfire Incident Response

**Best Agentic Mission Control** — Founders Inc. World Model Hack 2026

[Live Demo](https://alfredsjoqvist.com/firesight) · Built in 35 hours at Fort Mason, San Francisco

---

FireSight is a real-time spatial command center where an incident commander orchestrates wildfire response through a 3D terrain environment with autonomous AI agents, drone swarms, and fire simulation.

## What It Does

An incident commander sees a photorealistic 3D view of the terrain (Google 3D Tiles) with a live fire simulation overlay. They coordinate response through voice commands and a structured ICS (Incident Command System) command chain. The system manages 45 autonomous agents including scout drones, suppression units, and evacuation coordinators.

**Double-click the terrain to ignite a fire, then watch the response unfold.**

### Multi-Agent AI Coordination

Four specialized LLM-powered agents operate through a hierarchical ICS command chain:

- **Pyro** — Fire behavior prediction using cellular automata with Rothermel spread factors (wind, slope, fuel moisture, ember spotting)
- **Swarm** — Autonomous drone fleet coordination (24 drones: scouts, mappers, relays, suppression units) with real-time pathfinding
- **Evac** — Evacuation route optimization and civilian safety modeling
- **Deploy** — Resource allocation for engines, hotshot crews, air tankers, and bulldozers

Agents communicate through structured ICS protocols. The IC can override decisions via voice command (hold V to talk).

### Views

| View | Description |
|------|-------------|
| **3D View** | Google Photorealistic 3D Tiles with fire overlay, drone sprites, and unit positions. Click any agent to mount its camera. |
| **2D Map** | Top-down tactical view with fire perimeter, containment lines, evacuation zones, and resource positions. |
| **ICS Graph** | Real-time command chain visualization showing agent hierarchy, message flow, and decision audit trail. |

### Fire Simulation

The fire engine uses a Rothermel-based cellular automata model on a 256×256 grid:

- Wind-driven directional spread (Santa Ana conditions modeled)
- Slope influence on rate of spread
- Fuel type differentiation (chaparral, grassland, urban, forest)
- Probabilistic ember spotting for long-range ignition
- Retardant application zones with degrading effectiveness

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Main App (React)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 3D View  │  │ 2D Map   │  │  ICS Graph    │  │
│  │ (iframe) │  │ (canvas) │  │  (SVG/React)  │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       └──────────────┼────────────────┘          │
│              postMessage Bridge                   │
├─────────────────────────────────────────────────┤
│  Agent Orchestration Layer                       │
│  ┌──────┐ ┌───────┐ ┌──────┐ ┌────────┐        │
│  │ Pyro │ │ Swarm │ │ Evac │ │ Deploy │        │
│  └──────┘ └───────┘ └──────┘ └────────┘        │
├─────────────────────────────────────────────────┤
│  Fire Spread Engine (Cellular Automata)          │
│  Drone Pathfinding · ICS State Machine           │
├─────────────────────────────────────────────────┤
│  Node.js Server                                  │
│  Marble API Proxy · SSE Strategy Stream          │
│  World Cache · Grid Cell System                  │
└─────────────────────────────────────────────────┘
```

### Tech Stack

**Frontend:** React 18, Three.js, Vite, Google 3D Tiles, Cesium.js, Canvas API

**3D Engine:** Three.js with `3d-tiles-renderer`, Gaussian splat rendering, custom fire particle system

**AI/Agents:** Claude Opus 4.6 (command chain reasoning), Gemini (voice transcription), structured ICS message protocol

**Backend:** Node.js/Express, Server-Sent Events for real-time state, World Labs Marble API for terrain generation

**Simulation:** Custom Rothermel-based fire spread engine, drone swarm pathfinding with greedy lane assignment

## Controls

| Input | Action |
|-------|--------|
| Double-click | Ignite fire at location |
| Hold V | Voice command to IC |
| Click agent | Mount agent camera (3D view) |
| Scroll | Zoom |
| Right-drag | Pan (2D) / Tilt (3D) |
| Tab 1/2/3 | Switch between 3D / 2D / ICS views |

## Running Locally

```bash
# Clone
git clone git@github.com:AlfredSjoqvist/agentic-mission-control.git
cd agentic-mission-control

# Environment variables (create .env in project root)
MARBLE_API_KEY=...
VITE_CESIUM_ION_TOKEN=...
VITE_GOOGLE_MAPS_API_KEY=...
CLAUDE_API_KEY=...

# Install and run (3 terminals)
cd server && npm install && node index.js          # Port 3001
cd firesight && npm install && npx vite            # Port 5173
cd drone-view && npm install && npx vite           # Port 5176
```

## Team

Built by Alfred Sjöqvist and David Salib at Founders Inc., Fort Mason, San Francisco.
