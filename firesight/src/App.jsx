import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
import TerrainScene from './components/TerrainScene.jsx';
import AgentPanel, { LargeAgentPanel } from './components/AgentPanel.jsx';
import Timeline, { sliderToTimeSlot } from './components/Timeline.jsx';
import StatusBar from './components/StatusBar.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import { colors, typography, radii, panelStyle } from './styles/designTokens.js';

// Design target — layout is authored at this size and proportionally scaled
const TW = 1440;
const TH = 900;

export default function App() {
  const [sliderValue, setSliderValue] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const [simulationMode, setSimulationMode] = useState(false);
  const [activeLayers, setActiveLayers] = useState({
    fireSpread: true,
    wind: false,
    slope: false,
    embers: false,
  });
  const [swarmActive,  setSwarmActive]  = useState(false);
  const [evacActive,   setEvacActive]   = useState(false);
  const [deployActive, setDeployActive] = useState(false);

  const toggleLayer = useCallback((key) => {
    setActiveLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const timeSlot = sliderToTimeSlot(sliderValue);

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
        display: 'grid',
        gridTemplateRows: '44px 1fr 56px',
        gridTemplateColumns: '240px 1fr 210px',
        gridTemplateAreas: `
          "header  header  header"
          "left    terrain right"
          "timeline timeline timeline"
        `,
        gap: '8px',
        padding: '8px',
        boxSizing: 'border-box',
        background: colors.bg,
      }}>

        {/* ── HEADER BAR ──────────────────────────────────────── */}
        <header style={{
          gridArea: 'header',
          ...panelStyle,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '16px',
          overflow: 'hidden',
        }}>
          {/* Brand */}
          <span style={{
            fontFamily: typography.sansFamily,
            fontSize: '15px',
            fontWeight: typography.weights.semibold,
            color: colors.text,
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}>
            FireSight
          </span>

          <Separator />

          {/* Incident — only warm highlight in the bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            flexShrink: 0,
          }}>
            <div style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background: colors.danger,
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{
              fontFamily: typography.sansFamily,
              fontSize: '12px',
              color: colors.danger,
              fontWeight: typography.weights.medium,
            }}>
              Active Incident
            </span>
          </div>

          <span style={{
            fontFamily: typography.sansFamily,
            fontSize: '12px',
            color: colors.textSecondary,
            flexShrink: 0,
          }}>
            Pine Ridge Complex — El Dorado County, CA
          </span>

          <div style={{ flex: 1 }} />

          <StatusBar />
        </header>

        {/* ── LEFT: Pyro (large primary panel) ────────────────── */}
        <aside style={{ gridArea: 'left', minHeight: 0 }}>
          <LargeAgentPanel
            panelId="pyro"
            simulationMode={simulationMode}
            onSimulate={() => setSimulationMode(true)}
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
            simulationMode={simulationMode}
            activeLayers={activeLayers}
            swarmActive={swarmActive}
            evacActive={evacActive}
            deployActive={deployActive}
          />
          <TimeframePill timeSlot={timeSlot} simulationMode={simulationMode} />
          {simulationMode && (
            <LayerControl activeLayers={activeLayers} onToggle={toggleLayer} />
          )}
        </main>

        {/* ── RIGHT: 3 compact stacked panels ────────────────── */}
        <aside style={{
          gridArea: 'right',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          <AgentPanel panelId="swarm"  onActivate={() => setSwarmActive(true)}  isActive={swarmActive}  />
          <AgentPanel panelId="evac"   onActivate={() => setEvacActive(true)}   isActive={evacActive}   />
          <AgentPanel panelId="deploy" onActivate={() => setDeployActive(true)} isActive={deployActive} />
        </aside>

        {/* ── TIMELINE ────────────────────────────────────────── */}
        <footer style={{ gridArea: 'timeline', minHeight: 0 }}>
          <Timeline
            value={sliderValue}
            onChange={setSliderValue}
            timeSlot={timeSlot}
            simulationMode={simulationMode}
          />
        </footer>

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
