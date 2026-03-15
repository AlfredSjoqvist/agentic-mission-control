import React, { useState, useCallback, useLayoutEffect, useRef, useMemo, useEffect } from 'react';
import TerrainScene from './components/TerrainScene.jsx';
// ICSGraph embedded via iframe for exact fidelity with the standalone app
import AgentPanel, { LargeAgentPanel } from './components/AgentPanel.jsx';
import Timeline, { sliderToTimeSlot } from './components/Timeline.jsx';
import StatusBar from './components/StatusBar.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import CommandChain from './components/CommandChain.jsx';
import { useVoiceControl, MicButton, VoiceToast } from './components/VoiceControl.jsx';
import DroneHUD from './components/DroneHUD.jsx';
import { colors, typography, radii, panelStyle } from './styles/designTokens.js';
import { createPalisadesScenario } from './fireSpreadEngine.js';
import { ICSEngine, NODES as ICS_NODES } from './icsEngine.js';

// Design target — layout is authored at this size and proportionally scaled
const TW = 1440;
const TH = 900;

export default function App() {
  const [sliderValue, setSliderValue] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const [simulationMode, setSimulationMode] = useState(false);
  // Both views always visible side by side

  // Shared ICS Engine — single instance used by both views
  const icsEngineRef = useRef(null);
  if (!icsEngineRef.current) {
    icsEngineRef.current = new ICSEngine();
  }

  // Decision queue — poll ICS engine for pending AI decisions
  const [decisions, setDecisions] = useState([]);
  useEffect(() => {
    const timer = setInterval(() => {
      const eng = icsEngineRef.current;
      if (!eng) return;
      const pending = eng.getPendingDecisions();
      const resolved = eng.getResolvedDecisions();
      setDecisions([...pending, ...resolved]);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleApprove = useCallback((id) => {
    icsEngineRef.current?.approveDecision(id);
  }, []);
  const handleOverride = useCallback((id) => {
    icsEngineRef.current?.overrideDecision(id);
  }, []);

  // Live data from simulation for agent panels
  const [liveData, setLiveData] = useState(null);

  const [activeLayers, setActiveLayers] = useState({
    fireSpread: true,
    wind: false,
    slope: false,
    embers: false,
  });
  const [swarmActive,  setSwarmActive]  = useState(false);
  const [evacActive,   setEvacActive]   = useState(false);
  const [deployActive, setDeployActive] = useState(false);
  const [placedUnits, setPlacedUnits] = useState([]);
  const [cycleCount, setCycleCount] = useState(0);
  const [activeDroneIndex, setActiveDroneIndex] = useState(null);

  // Reset everything for a new prediction cycle
  const handleResetCycle = useCallback(() => {
    setSimulationMode(false);
    setSwarmActive(false);
    setEvacActive(false);
    setDeployActive(false);
    setTriggerSwarm(false);
    setTriggerEvac(false);
    setTriggerDeploy(false);
    setPlacedUnits([]);
    setSliderValue(0);
    dispatchTimers.current.forEach(clearTimeout);
    setCycleCount(c => c + 1);
  }, []);

  // Fire spread engine + projections
  const engineRef = useRef(null);
  const [projections, setProjections] = useState(null); // { now, oneHour, threeHour }
  const [fireStats, setFireStats] = useState(null);

  const handleSimulate = useCallback(() => {
    const engine = createPalisadesScenario();
    engineRef.current = engine;
    const proj = engine.generateProjections();
    setProjections(proj);
    setFireStats(engine.getStats());
    setSimulationMode(true);
  }, []);

  // Sequential dispatch — triggered by "Execute Plan" in Pyro panel
  const [triggerSwarm,  setTriggerSwarm]  = useState(false);
  const [triggerEvac,   setTriggerEvac]   = useState(false);
  const [triggerDeploy, setTriggerDeploy] = useState(false);
  const dispatchTimers = useRef([]);

  const handleFullDispatch = useCallback(() => {
    // Already dispatched? Bail
    if (swarmActive && evacActive && deployActive) return;
    // Stagger: Swarm → 2.5s → Evac → 2.5s → Deploy
    setTriggerSwarm(true);
    const t1 = setTimeout(() => setTriggerEvac(true), 2500);
    const t2 = setTimeout(() => setTriggerDeploy(true), 5000);
    dispatchTimers.current = [t1, t2];
  }, [swarmActive, evacActive, deployActive]);

  useEffect(() => () => dispatchTimers.current.forEach(clearTimeout), []);

  // ── Voice control ────────────────────────────────────────────────────────
  const { status: voiceStatus, toast: voiceToast, toggle: toggleVoice } = useVoiceControl({
    onPyro:   () => setSimulationMode(true),
    onSwarm:  () => { setSwarmActive(true);  setTriggerSwarm(true);  },
    onEvac:   () => { setEvacActive(true);   setTriggerEvac(true);   },
    onDeploy: () => { setDeployActive(true); setTriggerDeploy(true); },
    onReset:  handleResetCycle,
  });

  const toggleLayer = useCallback((key) => {
    setActiveLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const timeSlot = sliderToTimeSlot(sliderValue);

  // Pick the right snapshot based on the timeline slider
  const currentFireData = useMemo(() => {
    if (!projections) return null;
    if (timeSlot === 0) return projections.now;
    if (timeSlot === 1) return projections.oneHour;
    return projections.threeHour;
  }, [projections, timeSlot]);

  useLayoutEffect(() => {
    function update() {
      const s = Math.min(window.innerWidth / TW, window.innerHeight / TH);
      scaleRef.current = s;
      setScale(s);
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleTerrainClick = useCallback((info) => {
    const s = scaleRef.current;
    setContextMenu({ ...info, screenX: info.screenX / s, screenY: info.screenY / s });
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: colors.bg,
    }}>
      <div style={{
        width: TW,
        height: TH,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        display: 'flex',
        gap: 0,
        boxSizing: 'border-box',
        background: colors.bg,
      }}>

        {/* ── LEFT: Pyro (large primary panel) ──────────── */}
        <aside style={{
          gridArea: 'left',
          minHeight: 0,
          overflow: 'hidden',
        }} enable-xr="">
          <LargeAgentPanel
            panelId="pyro"
            simulationMode={simulationMode}
            onSimulate={() => setSimulationMode(true)}
            onFullDispatch={handleFullDispatch}
            allDeployed={swarmActive && evacActive && deployActive}
            onResetCycle={handleResetCycle}
            resetSignal={cycleCount}
          />
        </aside>

        {/* ── CENTER: Hero terrain scene ──────────────────────── */}
        <main style={{
          gridArea: 'terrain',
          borderRadius: radii.lg,
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
          position: 'relative',
          minHeight: 0,
        }}>
          <TerrainScene
            timeSlot={timeSlot}
            onTerrainClick={handleTerrainClick}
            onDroneSelect={setActiveDroneIndex}
            activeDroneIndex={activeDroneIndex}
            simulationMode={simulationMode}
            activeLayers={activeLayers}
            swarmActive={swarmActive}
            evacActive={evacActive}
            deployActive={deployActive}
            fireData={currentFireData}
            icsEngine={icsEngineRef.current}
            onLiveData={setLiveData}
          />
          {/* DecisionQueue overlay on terrain — from upstream */}
          {decisions.length > 0 && (
            <DecisionQueue decisions={decisions} onApprove={handleApprove} onOverride={handleOverride} />
          )}
          {activeDroneIndex === null && <TimeframePill timeSlot={timeSlot} simulationMode={simulationMode} />}
          {simulationMode && activeDroneIndex === null && (
            <LayerControl activeLayers={activeLayers} onToggle={toggleLayer} />
          )}
          {activeDroneIndex !== null && (
            <DroneHUD
              droneIndex={activeDroneIndex}
              onExit={() => setActiveDroneIndex(null)}
            />
          )}
        </main>

        {/* ── RIGHT: 3 compact panels + Command Chain ─────── */}
        <aside style={{
          gridArea: 'right',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0,
          overflow: 'auto',
        }} enable-xr="">
          <AgentPanel panelId="swarm"  onActivate={() => setSwarmActive(true)}  isActive={swarmActive}  triggerDispatch={triggerSwarm}  resetSignal={cycleCount} />
          <AgentPanel panelId="evac"   onActivate={() => setEvacActive(true)}   isActive={evacActive}   triggerDispatch={triggerEvac}   resetSignal={cycleCount} />
          <AgentPanel panelId="deploy" onActivate={() => setDeployActive(true)} isActive={deployActive} triggerDispatch={triggerDeploy} resetSignal={cycleCount} />
          <CommandChain
            simulationMode={simulationMode}
            swarmActive={swarmActive}
            evacActive={evacActive}
            deployActive={deployActive}
          />
        </aside>

        {/* ── VOICE TOAST ─────────────────────────────────────── */}
        <VoiceToast toast={voiceToast} />

        {/* ── CONTEXT MENU ────────────────────────────────────── */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.screenX + 14}
            y={contextMenu.screenY - 6}
            worldPos={contextMenu.worldPos}
            onClose={closeMenu}
          />
        )}
      </div>
    </div>
  );
}

// ─── Tiny helpers ──────────────────────────────────────────────────────────

function Separator() {
  return <div style={{ width: 1, height: 18, background: colors.border, flexShrink: 0 }} />;
}

function TimeframePill({ timeSlot, simulationMode }) {
  const labels = ['Current Fire', '+1 Hour Projection', '+3 Hour Projection'];
  const clrs = [colors.fireNow, colors.fireOneHour, colors.fireThreeHour];

  return (
    <div style={{
      position: 'absolute',
      top: 10, right: 10,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      background: 'rgba(0,0,0,0.45)',
      borderRadius: radii.full,
      backdropFilter: 'blur(12px)',
      transition: 'all 0.3s ease',
    }}>
      {simulationMode && (
        <span style={{
          fontFamily: typography.monoFamily,
          fontSize: '8px',
          color: colors.fireOneHour,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          marginRight: '4px',
          opacity: 0.85,
        }}>
          SIM
        </span>
      )}
      <div style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: clrs[timeSlot],
        animation: 'pulse 2s ease-in-out infinite',
      }} />
      <span style={{
        fontFamily: typography.sansFamily,
        fontSize: '10px',
        color: clrs[timeSlot],
        fontWeight: typography.weights.medium,
        letterSpacing: '0.04em',
      }}>
        {labels[timeSlot]}
      </span>
    </div>
  );
}

// ─── Layer control overlay ─────────────────────────────────────────────────
const LAYER_DEFS = [
  { key: 'fireSpread', label: 'Fire Spread',  color: colors.fireNow      },
  { key: 'wind',       label: 'Wind',         color: colors.accent        },
  { key: 'slope',      label: 'Slope',        color: colors.fireThreeHour },
  { key: 'embers',     label: 'Embers',       color: colors.fireOneHour   },
];

// ─── Decision Queue — AI agents propose, commander approves/overrides ────────
const URGENCY_COLORS = { critical:'#EF4444', high:'#F59E0B', medium:'#3B82F6', low:'#6B7280' };
const AGENT_LABELS = { ai_deploy:'DEPLOY', ai_evac:'EVAC', ai_overwatch:'OVERWATCH', ai_swarm:'SWARM', ai_predict:'PREDICT' };

function DecisionQueue({ decisions, onApprove, onOverride }) {
  const pending = decisions.filter(d => d.status === 'pending');
  const recent = decisions.filter(d => d.status !== 'pending').slice(-3);
  return (
    <div style={{
      position: 'absolute',
      bottom: 10, left: 10,
      maxWidth: 340, maxHeight: 280,
      overflowY: 'auto',
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {pending.map(d => {
        const uc = URGENCY_COLORS[d.urgency] || '#3B82F6';
        const agLabel = AGENT_LABELS[d.agentId] || d.agentId;
        return (
          <div key={d.id} style={{
            background: 'rgba(10,14,22,0.92)',
            border: `1px solid ${uc}50`,
            borderLeft: `3px solid ${uc}`,
            borderRadius: 6,
            padding: '6px 10px',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
              <span style={{ fontSize:8, fontWeight:700, color:uc, fontFamily:typography.monoFamily, letterSpacing:'0.06em' }}>
                {agLabel}
              </span>
              <span style={{ fontSize:7, fontWeight:600, color:uc, background:uc+'20', padding:'1px 4px', borderRadius:3, fontFamily:typography.sansFamily, textTransform:'uppercase' }}>
                {d.urgency}
              </span>
              <span style={{ flex:1 }} />
              <span style={{ fontSize:7, color:'#64748B', fontFamily:typography.monoFamily }}>
                auto {Math.max(0, Math.round(d.timeout - (Date.now()/1000 - d.createdAt)))}s
              </span>
            </div>
            <div style={{ fontSize:9, color:'#CBD5E1', fontFamily:typography.sansFamily, lineHeight:'13px', marginBottom:5 }}>
              {d.reasoning}
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={() => onApprove(d.id)} style={{
                flex:1, padding:'3px 0', fontSize:8, fontWeight:700, fontFamily:typography.sansFamily,
                background:uc+'25', border:`1px solid ${uc}60`, borderRadius:3, color:uc,
                cursor:'pointer', letterSpacing:'0.06em',
              }}>APPROVE</button>
              <button onClick={() => onOverride(d.id)} style={{
                padding:'3px 8px', fontSize:8, fontWeight:700, fontFamily:typography.sansFamily,
                background:'transparent', border:'1px solid #475569', borderRadius:3, color:'#64748B',
                cursor:'pointer', letterSpacing:'0.06em',
              }}>DENY</button>
            </div>
          </div>
        );
      })}
      {recent.map(d => {
        const isApproved = d.status === 'approved' || d.status === 'auto';
        return (
          <div key={d.id} style={{
            background: 'rgba(10,14,22,0.7)',
            border: `1px solid ${isApproved ? '#22C55E30' : '#EF444430'}`,
            borderLeft: `3px solid ${isApproved ? '#22C55E' : '#EF4444'}`,
            borderRadius: 6,
            padding: '4px 10px',
            opacity: 0.6,
          }}>
            <span style={{ fontSize:8, color:isApproved?'#22C55E':'#EF4444', fontFamily:typography.monoFamily, fontWeight:700 }}>
              {d.status === 'auto' ? 'AUTO-APPROVED' : d.status === 'approved' ? 'APPROVED' : 'DENIED'}
            </span>
            <span style={{ fontSize:8, color:'#64748B', fontFamily:typography.sansFamily, marginLeft:6 }}>
              {(AGENT_LABELS[d.agentId]||d.agentId)}: {d.actionKey}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LayerControl({ activeLayers, onToggle }) {
  return (
    <div style={{
      position: 'absolute',
      top: 44, right: 10,
      background: 'rgba(0, 0, 0, 0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: radii.md,
      border: `1px solid ${colors.border}`,
      padding: '8px 12px',
      minWidth: '120px',
    }}>
      <div style={{
        fontFamily: typography.sansFamily,
        fontSize: '9px',
        color: colors.textTertiary,
        letterSpacing: typography.letterSpacing.widest,
        textTransform: 'uppercase',
        marginBottom: '7px',
      }}>
        Layers
      </div>
      {LAYER_DEFS.map(({ key, label, color }) => {
        const active = activeLayers[key];
        return (
          <div
            key={key}
            onClick={() => onToggle(key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '3px 0',
              cursor: 'pointer',
            }}
          >
            {/* Toggle square */}
            <div style={{
              width: 8, height: 8,
              borderRadius: '2px',
              background: active ? color : 'transparent',
              border: `1px solid ${active ? color : colors.borderFocus}`,
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }} />
            <span style={{
              fontFamily: typography.monoFamily,
              fontSize: '9px',
              color: active ? colors.textSecondary : colors.textTertiary,
              letterSpacing: '0.04em',
              transition: 'color 0.15s ease',
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
