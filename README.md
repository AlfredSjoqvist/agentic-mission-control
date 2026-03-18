# FireSight — Spatial Command Center for Wildfire Incident Response

**Best Agentic Mission Control** — Founders Inc. World Model Hack 2026

<a href="https://alfredsjoqvist.com/firesight" target="_blank">Live Demo</a> · Built in 35 hours at Fort Mason, San Francisco

---

FireSight is a real-time spatial command center where an incident commander orchestrates wildfire response through a 3D terrain environment with autonomous AI agents, drone swarms, and fire simulation.

## What It Does

An incident commander sees a photorealistic 3D view of the terrain (Google 3D Tiles) with a live fire simulation overlay. They coordinate response through voice commands and a structured ICS (Incident Command System) command chain. The system simulates 45 autonomous units including scout drones, engine crews, hotshot teams, helicopters, and air tankers.

**Double-click the terrain to ignite a fire, then watch the response unfold.**

### AI Agents (powered by OpenClaw)

Four LLM-powered ICS agents run autonomously through a structured command chain:

- **Incident Commander (IC)** — The central agent commanding the entire fleet. Coordinates drones, helicopters, air tankers, and engine crews. Makes strategic decisions on containment lines, resource allocation, and evacuation timing. Responds to voice commands from the user (hold V to talk).
- **Safety Officer** — Monitors crew positions relative to fire progression and flags hazardous conditions. Issues safety advisories when units are at risk.
- **Public Information Officer** — Tracks civilian impact, evacuation status, and generates situational updates for the comms log.
- **Liaison Officer** — Coordinates with external agencies and manages mutual aid resource requests.

The IC is the primary decision-maker, orchestrating 24 drones (scouts, mappers, relays, suppression), helicopter and air tanker operations, and ground crew deployment. All agent communications flow through the ICS comms log in the bottom panel.

### Views

| View | Description |
|------|-------------|
| **3D View** | Google Photorealistic 3D Tiles with fire overlay, drone sprites, and unit positions. Click any agent to mount its camera. |
| **2D Map** | Top-down tactical view with fire perimeter, unit positions, and resource icons on satellite imagery. |
| **ICS Graph** | Command chain visualization showing the ICS organizational hierarchy and message flow. |

### Fire Simulation

The fire engine uses a Rothermel-based cellular automata model on a 256x256 grid covering the LA Palisades area:

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
│  OpenClaw Agent Layer                             │
│  IC · Safety · PIO · Liaison                     │
│  Confidence Engine · Conflict Resolver            │
├─────────────────────────────────────────────────┤
│  Fire Spread Engine (Cellular Automata)          │
│  Drone Pathfinding · ICS State Machine           │
├─────────────────────────────────────────────────┤
│  Node.js Server                                  │
│  SSE Strategy Stream · Voice Transcription       │
└─────────────────────────────────────────────────┘
```

### Tech Stack

**Frontend:** React 18, Three.js, Vite, Google Photorealistic 3D Tiles, Canvas API

**3D Engine:** Three.js with `3d-tiles-renderer`, custom multi-layer fire rendering, drone sprite system

**AI/Agents:** Claude Opus 4.6 (command chain reasoning), Gemini (voice transcription), structured ICS message protocol

**Backend:** Node.js/Express, Server-Sent Events for real-time strategy updates

**Simulation:** Rothermel-based fire spread engine, greedy lane assignment for drone pathfinding, ICS organizational state machine

## Controls

| Input | Action |
|-------|--------|
| Double-click | Ignite fire at location |
| Hold V | Voice command to IC |
| Click agent | Mount agent camera (3D view) |
| Scroll | Zoom |
| Right-drag | Pan (2D) / Tilt (3D) |
| 1 / 2 / 3 | Switch between 3D / 2D / ICS views |

## Running Locally

```bash
git clone git@github.com:AlfredSjoqvist/agentic-mission-control.git
cd agentic-mission-control

# Environment variables (create .env in project root)
VITE_GOOGLE_MAPS_API_KEY=...
CLAUDE_API_KEY=...

# Install and run (3 terminals)
cd server && npm install && node index.js          # Port 3001
cd firesight && npm install && npx vite            # Port 5173
cd drone-view && npm install && npx vite           # Port 5176
```

## Team

Built by Alfred Sjöqvist and Xiya Tang at Founders Inc., Fort Mason, San Francisco.
