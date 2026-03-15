import React, { useEffect } from 'react';
import { colors, typography, panelStyle, radii } from '../styles/designTokens.js';

// ─── Keyframes (injected once) ─────────────────────────────────────────────
const KEYFRAMES = `
@keyframes signalDown {
  from { background-position: 0 0; }
  to   { background-position: 0 24px; }
}
@keyframes nodeBlink {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50%       { box-shadow: 0 0 6px 2px var(--node-color); }
}
@keyframes branchIn {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

// ─── Node definitions ──────────────────────────────────────────────────────
const MAIN_NODES = [
  {
    id: 'fire',
    label: 'FIRE DETECTED',
    detail: 'Pine Ridge Complex ignition',
    color: colors.critical,
    isActive: () => true,
    always: true,
  },
  {
    id: 'ic',
    label: 'IC ACTIVATED',
    detail: 'Incident Commander on-site',
    color: colors.statusOk,
    isActive: () => true,
    always: true,
  },
  {
    id: 'pyro',
    label: 'PYRO ANALYSIS',
    detail: '87% conf · 480 ac / 3h',
    color: '#F59E0B',
    isActive: (p) => p.simulationMode,
  },
];

const BRANCH_NODES = [
  {
    id: 'swarm',
    label: 'DRONE SWARM',
    detail: '12 drones · 74% coverage',
    color: colors.accent,        // cold blue
    isActive: (p) => p.swarmActive,
    isLast: false,
  },
  {
    id: 'evac',
    label: 'EVAC ROUTES',
    detail: '3 routes · 2,847 civilians',
    color: colors.statusOk,      // muted green
    isActive: (p) => p.evacActive,
    isLast: false,
  },
  {
    id: 'deploy',
    label: 'DEPLOY ASSETS',
    detail: '4 crews · 2 air tankers',
    color: colors.fireOneHour,   // orange — data layer ok in agent panels
    isActive: (p) => p.deployActive,
    isLast: true,
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────

function Dot({ color, active, always }) {
  return (
    <div style={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      flexShrink: 0,
      background: active ? color : 'transparent',
      border: `1.5px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
      transition: 'background 0.4s ease, border-color 0.4s ease',
      '--node-color': color,
      animation: active && !always ? 'nodeBlink 2s ease-in-out infinite' : 'none',
    }} />
  );
}

function VerticalConnector({ active, color }) {
  const isOn = active;
  return (
    <div style={{
      width: 1,
      height: 20,
      marginLeft: 3.5,        // center under the 8px dot
      flexShrink: 0,
      background: isOn
        ? `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)`
        : `repeating-linear-gradient(to bottom, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 3px, transparent 3px, transparent 8px)`,
      backgroundSize: isOn ? '1px 8px' : '1px 8px',
      animation: isOn ? 'signalDown 0.6s linear infinite' : 'none',
      transition: 'background 0.4s ease',
    }} />
  );
}

function NodeRow({ node, active, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, ...style }}>
      <div style={{ paddingTop: 1, flexShrink: 0 }}>
        <Dot color={node.color} active={active} always={node.always} />
      </div>
      <div>
        <div style={{
          fontFamily: typography.monoFamily,
          fontSize: '10px',
          fontWeight: typography.weights.semibold,
          letterSpacing: '0.08em',
          color: active ? node.color : 'rgba(145,155,170,0.50)',
          transition: 'color 0.4s ease',
          lineHeight: 1.2,
        }}>
          {node.label}
        </div>
        {active && (
          <div style={{
            fontFamily: typography.monoFamily,
            fontSize: '9px',
            color: 'rgba(160,170,190,0.55)',
            letterSpacing: '0.03em',
            marginTop: 2,
            animation: node.always ? 'none' : 'branchIn 0.35s ease',
          }}>
            {node.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchSection({ props, simulationMode }) {
  const anyActive = props.swarmActive || props.evacActive || props.deployActive;

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* Left gutter: branch vertical bar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 8, flexShrink: 0, marginRight: 8 }}>
        <div style={{
          width: 1,
          flex: 1,
          background: simulationMode
            ? `repeating-linear-gradient(to bottom, ${colors.accent} 0px, ${colors.accent} 4px, transparent 4px, transparent 8px)`
            : 'rgba(255,255,255,0.08)',
          backgroundSize: '1px 8px',
          animation: simulationMode ? 'signalDown 0.6s linear infinite' : 'none',
          transition: 'background 0.4s ease',
          minHeight: 12,
        }} />
      </div>

      {/* Branch node list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {BRANCH_NODES.map((node, idx) => {
          const active = node.isActive(props);
          const isLast = idx === BRANCH_NODES.length - 1;
          return (
            <div key={node.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                {/* Horizontal elbow */}
                <div style={{
                  width: 10,
                  height: 1,
                  marginTop: 5,
                  flexShrink: 0,
                  background: active ? node.color : 'rgba(255,255,255,0.10)',
                  transition: 'background 0.4s ease',
                }} />
                <NodeRow
                  node={node}
                  active={active}
                />
              </div>
              {!isLast && <div style={{ height: 10 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function CommandChain({ simulationMode, swarmActive, evacActive, deployActive }) {
  const props = { simulationMode, swarmActive, evacActive, deployActive };

  // Inject keyframes once
  useEffect(() => {
    const id = 'cmd-chain-kf';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = KEYFRAMES;
      document.head.appendChild(el);
    }
  }, []);

  // Which connector is active between main nodes:
  // FIRE→IC: always  |  IC→PYRO: once IC is always active, show active
  const connectorActive = [true, true];

  return (
    <div style={{
      ...panelStyle,
      padding: '14px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{
          fontFamily: typography.monoFamily,
          fontSize: '9px',
          fontWeight: typography.weights.semibold,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: colors.textTertiary,
        }}>
          Command Chain
        </span>
        {/* Active count badge */}
        <ActiveBadge props={props} />
      </div>

      {/* ── Main chain: FIRE → IC → PYRO ── */}
      {MAIN_NODES.map((node, idx) => {
        const active = node.isActive(props);
        const isLast = idx === MAIN_NODES.length - 1;

        return (
          <React.Fragment key={node.id}>
            <NodeRow node={node} active={active} />

            {/* Connector below this main node */}
            {!isLast && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <VerticalConnector
                  active={connectorActive[idx]}
                  color={MAIN_NODES[idx + 1].color}
                />
              </div>
            )}

            {/* Branch section hangs below PYRO (last main node) */}
            {isLast && (
              <>
                <VerticalConnector active={simulationMode} color={colors.accent} />
                <BranchSection props={props} simulationMode={simulationMode} />
              </>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Active badge ──────────────────────────────────────────────────────────

function ActiveBadge({ props }) {
  const count = [
    props.simulationMode,
    props.swarmActive,
    props.evacActive,
    props.deployActive,
  ].filter(Boolean).length;

  if (count === 0) return null;

  return (
    <div style={{
      fontFamily: typography.monoFamily,
      fontSize: '9px',
      letterSpacing: '0.06em',
      color: colors.statusOk,
      background: 'rgba(61,184,122,0.10)',
      border: `1px solid rgba(61,184,122,0.20)`,
      borderRadius: radii.sm,
      padding: '2px 6px',
    }}>
      {count} ACTIVE
    </div>
  );
}
