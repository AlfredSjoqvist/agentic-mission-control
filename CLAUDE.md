# CLAUDE.md — Worlds in Action Hackathon (March 13–15, 2026)

## Mission
Win the hackathon. Build **FireSight** — a spatial VR command center for wildfire response on PICO, where an incident commander stands inside a world-model-generated 3D terrain and orchestrates AI agents (fire prediction, drone swarms, evacuation, resource deployment) via voice and gesture. Full details in `IDEA.md`.

## Hackathon Constraints
- **Duration**: ~35 hours of build time (Saturday 9:30 AM → Sunday 8:30 PM)
- **Location**: Founders, Inc., Fort Mason, San Francisco
- **Core requirement**: Ship something that uses **world models**. "You will have one goal: actually ship (with) world models."
- **Team resources**: One World Labs Marble Pro subscription per team, 17 PICO devkits available

## Award Tracks (pick the best fit from IDEA.md)
1. **Best Filmmaking, Entertainment, Simulation App**
2. **Best Gaming, UGC Experience**
3. **Best World Models Implementation with PICO**
4. **Best Agentic Mission Control with PICO**
5. **Best Emulator Project with PICO**
6. **Best WebSpatial Project with PICO**

4 of 6 tracks require PICO integration. The "Agentic Mission Control" track aligns with this repo's name.

## Available Tech Stack (use these — they're provided and judges expect them)
- **World Labs Marble API** — world model generation and integration
- **PICO XR headsets** — ByteDance VR hardware (PICO 4 Ultra, SDK support)
- **Unity / Unreal / WebXR** — rendering and interaction
- **WebSpatial** — cross-platform deployment (web-based spatial apps)
- **OpenClaw** — agentic orchestration in WebSpatial (multi-view windows, agent management)

## Workshop Resources (pre-studied material the team has access to)
- World Models Workshop: https://www.youtube.com/playlist?list=PLRQI9ZSqDkKfcfnITW0hK-vxlfMuS6PUT
- PICO Workshop: https://www.youtube.com/playlist?list=PLRQI9ZSqDkKdqhIYyEMu3f1g3SyzpfZn4
- OpenClaw Workflow: https://www.youtube.com/watch?v=XQJuaXmwbqM

## Judge Profiles — What They Value (tailor the demo to these people)

### Founder's Inc Team (6 judges — internal, likely judging all tracks)
- **Hubert Thieblot** — GP at Founders Inc, ex-VP Twitch, ex-CEO Curse. Cares about ambitious builders, creator ecosystems.
- **Hugo Hernandez** — Built the first "world model game engine" (Alakazam Studios). Deeply technical on world models. Will scrutinize implementation quality.
- **Cris Lenta** — Building LifeSim (AI reality sim). Cares about AI + simulation depth, world model research.
- **Ryan Chan & Isaac Sin** — Co-founders of MakerMods (hardware/robotics). Value technical ingenuity, hardware integration.
- **Hendrik Chiche** — ML/CV background (UC Berkeley). Will appreciate solid ML pipeline and clean architecture.

### Award Category Judges (15 judges — likely assigned to specific tracks)
- **Ian Curtis (World Labs)** — Product Designer at World Labs (the Marble API provider). Will judge world model usage quality. Built demos with Marble + Gaussian Splats for persistent 3D worlds.
- **David Gene Oh (ByteDance/PICO)** — Global Developer Advocacy for PICO. Will judge PICO tracks. Knows the SDK deeply.
- **Fasai Phuathavornskul (Google)** — Senior SWE on Android XR, leads Gemini Live on XR glasses. Values AI integration in spatial computing.
- **Sherrie Cao (EA)** — First PM for AI Experiences at EA. Cares about AI making experiences more engaging/personalized.
- **Yiqi Zhao (Meta)** — Product Design Lead, AI-native spatial computing. Led Meta Horizon, AssetGen, WorldGen. Values design quality and AI-native thinking.
- **Greg Madison** — 30+ years XR, 10+ patents, Staff XR/AI Interaction Designer. Values polished interactions and novel UX.
- **Marco DeMiroz (VR Fund)** — Investor in Spatial AI and Physical AI. Thinks about market potential and defensibility.
- **Conway Anderson** — Won 2nd at Odyssey world model hackathon, built AR gamification app. Values practical, delightful implementations.
- **Asim Ahmed (Niantic)** — Launched Pokemon GO. Thinks about mass-market spatial experiences.
- **Jake Steinerman** — ex-Meta XR, scaled Spatial's dev ecosystem. Values developer experience and ecosystem thinking.
- **John Dagdelen (Fluid)** — PhD computational science, built VR Smart TV. Values utility and productivity applications.
- **Michael Morran (VIVERSE/HTC)** — WebXR community builder. Values open web standards and creator tools.
- **Felix Hartmann** — Frontier tech investor (XR, AI, UGC). Looks for investable ideas.
- **Sze Yuan Cheong (Devol Robots)** — AI world models for robotics. Values real-world physical applications.
- **Yiliu Shen-Burke (Softspace)** — Spatial computing tools since 2018. Values thoughtful spatial UX.

## Winning Strategy — Engineering Principles

### Demo > Everything
- The final demo IS the product. Build backward from a 3-minute killer demo.
- First 30 seconds must show the "wow moment" — world model output visible in XR.
- Have a working demo by hour 20. Spend remaining time polishing, not adding features.

### Technical Priorities (in order)
1. **World model integration must be real and visible** — Marble API generating/manipulating 3D worlds in real-time. Ian Curtis (World Labs) will spot fakes.
2. **PICO integration if targeting a PICO track** — Actually run on the headset. David Gene Oh will check.
3. **Agentic layer if targeting "Agentic Mission Control"** — Use OpenClaw or similar for multi-agent orchestration visible in spatial UI.
4. **WebSpatial deployment if targeting that track** — Cross-platform web-based spatial app.
5. **Polish the interaction design** — Greg Madison and Yiqi Zhao have decades of XR UX expertise. Sloppy interactions will lose points.

### Architecture Guidelines
- Keep the stack minimal. Prefer WebXR + WebSpatial for speed unless Unity/Unreal is essential.
- Use the Marble API as the core engine — don't just call it once for a screenshot.
- Build modular: world model backend, spatial frontend, agent layer (if applicable). Each can be demo'd independently if something breaks.
- Have a fallback: pre-generate some world model outputs so the demo works even if the API is slow/down.

### What Loses Hackathons
- Showing slides instead of a working demo
- "We would have built X but ran out of time"
- Not using the sponsored tech (PICO, Marble API)
- Over-scoping: 1 polished feature beats 5 broken ones
- Ignoring the track criteria — pick ONE track and optimize for it

### What Wins Hackathons
- A live demo that makes the audience say "wow"
- Creative, non-obvious use of world models (not just "we generated a 3D scene")
- Showing a loop: user does something → world model responds → visible in XR → user reacts
- Narrative: tell a story about WHY this matters, not just WHAT it does
- Technical depth that holds up to judge Q&A

## UI Design Principles (judge-aligned)

### Spatial Layout: World Model is the Interface
- **Center = 3D terrain (god-view war table), periphery = agent panels.** The world model is not a background — it's the primary surface all agents annotate. Fire overlays, drone positions, evacuation routes, and resource icons all render ON the terrain, not in separate windows.
- **One floating panel per agent, max.** Pyro, Swarm, Evac, Deploy — four panels orbiting at arm's reach. Each shows: agent name, status (one line), last action. No dashboards-within-dashboards.
- Agent panels are **peripheral** — status boards at the edges of vision. The world model stays center. This mirrors how incident commanders think: situational awareness first, details on demand.

### Interaction: Voice-First, Gesture-Second
- **Voice is the hero interaction.** "Pyro, project 25 mph northwest wind" is the demo's centerpiece. Voice is reliable and impressive on stage. Greg Madison (30+ yrs XR) will judge interaction novelty here.
- **Gaze/point for context.** Point at terrain → context menu (send drone / check route / deploy crew). Keep it simple — complex hand-tracking UIs break in live demos.
- **No controllers with laser pointers.** That's not novel XR. Gaze + voice signals "AI-native spatial computing" to Yiqi Zhao (Meta) and Fasai (Google).

### Visual Language: Color = Time, No Labels Needed
- **Fire spread**: red (now) → orange (30 min) → yellow (1 hr) — animated on terrain
- **Evacuation routes**: green (clear) → red (blocked) — glowing lines on terrain
- **Resource status**: green / yellow / red
- The color system must be instantly readable without text. Greg Madison will notice this polish.

### The "Wow Moment": Timeline Scrubber
- Sliding from "now" to "+3 hours" and watching fire consume a neighborhood is the single most viscerally compelling interaction. **Build this before any other polish.**
- This proves the world model is dynamic (not a static screenshot) — critical for Ian Curtis (World Labs) and Hugo Hernandez (Alakazam).

### The Interaction Loop (every judge wants to see this)
- User speaks → agent responds → world model updates visually → user reacts
- Every interaction must complete this loop in **under 3 seconds**. If Marble API is slow, cache terrain and make overlays instant.

### The 30-Second Rule
- If someone puts on the headset and within 30 seconds sees 3D terrain with fire spreading and hears "Pyro, show me the spread" — half the judges are already sold. Everything else is depth for Q&A.

### What NOT to Build (UI scope)
- No settings, menus, or configuration screens
- No onboarding or tutorials
- No multi-user — single commander POV is enough
- No text-heavy UI in VR — investor judges (Marco DeMiroz, Felix Hartmann) will zone out
- Don't over-animate — one smooth fire-spread animation beats five janky ones

## Code Standards (for hackathon speed)
- Prioritize working code over clean code. Refactor nothing unless it blocks progress.
- Comment only what's non-obvious. No boilerplate docs.
- Use environment variables for API keys (Marble API, any others).
- Git commit at every milestone so we can roll back if something breaks.
- Test on PICO hardware early and often — don't leave device testing for the last hour.

## File Structure
- `IDEA.md` — The specific project idea and scope
- `context/` — Hackathon research, judge profiles, event details
- Source code goes in `src/` or project-appropriate structure based on the idea
