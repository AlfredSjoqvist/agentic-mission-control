import React, { useState, useEffect } from 'react';
import { Wind, Droplets, Thermometer } from 'lucide-react';
import {
  colors, typography, radii, shadows, panelStyle, buttonBase, buttonAccent, buttonGhost, buttonDanger,
} from '../styles/designTokens.js';

// ─── Semantic color roles ───────────────────────────────────────────────────
// neutral  = environmental / terrain data → accent blue
// warning  = elevated fire risk           → orange
// critical = dangerous / emergency state  → red
const sem = {
  neutral:  colors.accent,        // #6EA8D7
  warning:  colors.fireOneHour,   // #E87B2F
  critical: colors.fireNow,       // #E84430
};

// ─── Lucide icon wrappers (12×12, matches existing icon API) ───────────────
function WindIcon({ color }) {
  return <Wind size={12} color={color} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.6 }} />;
}
function HumidityIcon({ color }) {
  return <Droplets size={12} color={color} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.6 }} />;
}
function TemperatureIcon({ color }) {
  return <Thermometer size={12} color={color} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.6 }} />;
}

function SlopeIcon({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1.5 10 L10 2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 2.5 L10 5.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 2.5 L7 2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SpreadIcon({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 6 L10 6" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7.5 4 L10 6 L7.5 8" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 3 L5 6 L2 9" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  );
}

function SpottingRiskIcon({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path d="M6 1.5 L11 10 L1 10 Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="6" y1="5" x2="6" y2="7.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.6" fill={color} />
    </svg>
  );
}

// ─── Compact panel metric icons (10×10, monochrome) ────────────────────────
function DroneIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="1.2" stroke={color} strokeWidth="1" />
      <line x1="5" y1="1" x2="5" y2="3.8" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="5" y1="6.2" x2="5" y2="9" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="1" y1="5" x2="3.8" y2="5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="6.2" y1="5" x2="9" y2="5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <circle cx="5" cy="1" r="0.8" stroke={color} strokeWidth="0.8" />
      <circle cx="5" cy="9" r="0.8" stroke={color} strokeWidth="0.8" />
      <circle cx="1" cy="5" r="0.8" stroke={color} strokeWidth="0.8" />
      <circle cx="9" cy="5" r="0.8" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

function CoverageIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 7.5 C1 4.5 3 2.5 5 2.5 C7 2.5 9 4.5 9 7.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M2.8 7.5 C2.8 5.8 3.8 4.5 5 4.5 C6.2 4.5 7.2 5.8 7.2 7.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <circle cx="5" cy="7.5" r="0.8" fill={color} />
    </svg>
  );
}

function PersonIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="2.5" r="1.5" stroke={color} strokeWidth="1" />
      <path d="M2 9 C2 6.8 3.3 5.5 5 5.5 C6.7 5.5 8 6.8 8 9" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function EvacPersonIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="3.5" cy="2" r="1.2" stroke={color} strokeWidth="1" />
      <path d="M1.5 8.5 C1.5 6.5 2.5 5 3.5 5 C4 5 4.5 5.3 5 6 L6.5 7.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M6 6 L8.5 5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M7.5 4.5 L8.5 5 L7.5 5.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrewIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 5.5 C2 4 3.3 3 5 3 C6.7 3 8 4 8 5.5 L8 6 L2 6 Z" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <rect x="1.5" y="5.8" width="7" height="1" rx="0.4" stroke={color} strokeWidth="0.9" />
      <path d="M3.5 3 C3.5 2.2 4.1 1.5 5 1.5 C5.9 1.5 6.5 2.2 6.5 3" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="3" y1="7" x2="3" y2="9" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="7" y1="7" x2="7" y2="9" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function PlaneIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1.5 5.5 L5 2 L8.5 5.5" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 5.5 L3.5 8 L5 7.2 L6.5 8 L6.5 5.5" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="5" y1="2" x2="5" y2="7.2" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// ─── Panel data ────────────────────────────────────────────────────────────
const PANELS = {
  pyro: {
    title: 'Pyro Analysis',
    statusLabel: 'Analyzing',
    statusColor: colors.warning,

    // ① Critical banner — pulled out of the grid for prominence
    criticalMetric: {
      label: 'Spotting Risk',
      value: 'Extreme',
      icon: SpottingRiskIcon,
    },

    // ② 2×2 environmental grid
    gridMetrics: [
      { label: 'Wind',        value: '25 mph NW', icon: WindIcon,        annotation: 'Strong',   annotationColor: colors.textTertiary },
      { label: 'Humidity',    value: '12%',       icon: HumidityIcon,    annotation: 'Very Dry', annotationColor: sem.warning         },
      { label: 'Temperature', value: '94 °F',     icon: TemperatureIcon, annotation: 'High',     annotationColor: sem.warning         },
      { label: 'Slope',       value: '32°',       icon: SlopeIcon,       annotation: 'Steep',    annotationColor: colors.textTertiary },
    ],

    // ③ Behavior prediction strip
    spreadMetric: {
      label: 'Rate of Spread',
      value: '2.4 ch/hr',
      annotation: 'Rapid',
      annotationColor: sem.warning,
      progress: 0.65,
      icon: SpreadIcon,
    },

    action: 'Predict Spread',
    actionVariant: 'danger',
  },

  swarm: {
    title: 'Swarm Intel',
    statusLabel: 'Active',
    statusColor: colors.safe,
    metrics: [
      { label: 'Drones',   value: '12 / 14', icon: DroneIcon,    iconColor: colors.textTertiary },
      { label: 'Coverage', value: '74%',      icon: CoverageIcon, iconColor: colors.textTertiary },
    ],
    action: 'Dispatch',
    actionVariant: 'accent',
  },

  evac: {
    title: 'Evac Routes',
    statusLabel: '3 Open',
    statusColor: colors.safe,
    metrics: [
      { label: 'Civilians', value: '2,847', icon: PersonIcon,     iconColor: colors.textTertiary },
      { label: 'Evacuated', value: '1,203', icon: EvacPersonIcon, iconColor: colors.textTertiary },
    ],
    action: 'Open Route',
    actionVariant: 'ghost',
  },

  deploy: {
    title: 'Deploy Assets',
    statusLabel: 'Standby',
    statusColor: colors.warning,
    metrics: [
      { label: 'Crews',       value: '4 active',  icon: CrewIcon,  iconColor: colors.textTertiary },
      { label: 'Air Tankers', value: '2 inbound', icon: PlaneIcon, iconColor: colors.textTertiary },
    ],
    action: 'Dispatch Crews',
    actionVariant: 'accent',
  },
};

// ─── Large panel variant (for Pyro — primary panel) ────────────────────────
export function LargeAgentPanel({ panelId, onSimulate, simulationMode, fireStats }) {
  const panel = PANELS[panelId];
  const [actionState, setActionState] = useState('idle');

  const handleAction = () => {
    if (actionState !== 'idle') return;
    setActionState('loading');
    setTimeout(() => {
      setActionState('done');
      onSimulate?.();
      setTimeout(() => setActionState('idle'), 2000);
    }, 1000);
  };

  const btnStyle = {
    accent: buttonAccent, ghost: buttonGhost, danger: buttonDanger,
  }[panel.actionVariant];

  const isPyro = panelId === 'pyro';

  return (
    <div style={{
      ...panelStyle,
      display: 'flex',
      flexDirection: 'column',
      gap: isPyro ? '14px' : '10px',
      padding: isPyro ? '20px 20px 24px' : '20px',
      height: '100%',
      boxSizing: 'border-box',
      // Pyro gets a subtle warm left accent
      borderLeft: isPyro ? '2px solid rgba(212, 80, 50, 0.25)' : undefined,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isPyro && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.85 }}>
              <path d="M12 2C12 2 8 6 8 10C8 11.1 8.3 12.1 8.8 13C7.3 12.4 6 11 6 8.5C4 10.5 3 13 3 16C3 19.9 7.1 23 12 23C16.9 23 21 19.9 21 16C21 11 16 7 12 2Z"
                fill="url(#pyroGrad)" />
              <defs>
                <linearGradient id="pyroGrad" x1="12" y1="2" x2="12" y2="23" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D44040" />
                  <stop offset="100%" stopColor="#E87B2F" />
                </linearGradient>
              </defs>
            </svg>
          )}
          <span style={{
            fontFamily: typography.sansFamily,
            fontSize: isPyro ? '17px' : typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.text,
            letterSpacing: typography.letterSpacing.tight,
          }}>
            {panel.title}
          </span>
        </div>
        <StatusDot label={panel.statusLabel} color={panel.statusColor} />
      </div>

      {/* ① Critical Alert — hazard stripe: left border only, backlit glow */}
      {isPyro && panel.criticalMetric && (
        <div style={{
          borderLeft: `2px solid ${sem.critical}`,
          background: 'rgba(255, 68, 68, 0.04)',
          boxShadow: `inset 3px 0 12px rgba(255, 68, 68, 0.06)`,
          borderRadius: `0 ${radii.base} ${radii.base} 0`,
          padding: '10px 12px 12px 14px',
        }}>
          {/* ⚠ CRITICAL ALERT row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
            <SpottingRiskIcon color={sem.critical} />
            <span style={{
              fontFamily: typography.sansFamily, fontSize: '9px',
              color: sem.critical, letterSpacing: typography.letterSpacing.widest,
              textTransform: 'uppercase', fontWeight: typography.weights.semibold,
            }}>
              Critical Alert
            </span>
          </div>
          {/* metric label */}
          <div style={{
            fontFamily: typography.sansFamily, fontSize: '9px',
            color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
            textTransform: 'uppercase', marginBottom: '2px',
          }}>
            {panel.criticalMetric.label}
          </div>
          {/* value — backlit red text-shadow, like a lit display */}
          <div style={{
            fontFamily: typography.monoFamily, fontSize: '15px',
            color: sem.critical, fontWeight: typography.weights.semibold,
            letterSpacing: typography.letterSpacing.wide,
            textShadow: shadows.glowCritical,
          }}>
            {panel.criticalMetric.value}
          </div>
        </div>
      )}

      {/* ② 2×2 Environmental Grid — gridAutoRows forces all 4 cells equal height */}
      {isPyro && panel.gridMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '76px', gap: '6px' }}>
          {panel.gridMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} style={{
                background: colors.bgInset,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.base,
                padding: '8px 10px',
                boxSizing: 'border-box',
                height: '100%',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  {Icon && <Icon color={colors.textTertiary} />}
                  <span style={{
                    fontFamily: typography.sansFamily, fontSize: '9px',
                    color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                    textTransform: 'uppercase',
                  }}>
                    {m.label}
                  </span>
                </div>
                <div style={{
                  fontFamily: typography.monoFamily, fontSize: '13px',
                  color: colors.dataValue, fontWeight: typography.weights.medium,
                  marginBottom: '2px',
                }}>
                  {m.value}
                </div>
                {m.annotation && (
                  <div style={{
                    fontFamily: typography.monoFamily, fontSize: '9px',
                    color: m.annotationColor || colors.textTertiary, opacity: 0.85,
                  }}>
                    [{m.annotation}]
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ③ Behavior Prediction Strip */}
      {isPyro && panel.spreadMetric && (() => {
        const sm = panel.spreadMetric;
        const Icon = sm.icon;
        return (
          <div style={{
            background: colors.bgInset,
            border: `1px solid ${colors.border}`,
            borderRadius: radii.base,
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '5px' }}>
              {Icon && <Icon color={colors.textTertiary} />}
              <span style={{
                fontFamily: typography.sansFamily, fontSize: '9px',
                color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                textTransform: 'uppercase',
              }}>
                Behavior Prediction
              </span>
            </div>
            <div style={{
              fontFamily: typography.sansFamily, fontSize: '9px',
              color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
              textTransform: 'uppercase', marginBottom: '3px',
            }}>
              {sm.label}
            </div>
            <div style={{
              display: 'flex', alignItems: 'baseline',
              justifyContent: 'space-between', marginBottom: '7px',
            }}>
              <span style={{
                fontFamily: typography.monoFamily, fontSize: '15px',
                color: colors.dataValue, fontWeight: typography.weights.medium,
              }}>
                {sm.value}
              </span>
              <span style={{
                fontFamily: typography.monoFamily, fontSize: '9px',
                color: sm.annotationColor,
                border: `1px solid ${sm.annotationColor}`,
                borderRadius: '3px', padding: '1px 5px', opacity: 0.85,
              }}>
                {sm.annotation}
              </span>
            </div>
            <div style={{ height: '2px', background: 'rgba(140,160,190,0.12)', borderRadius: '1px' }}>
              <div style={{
                height: '100%', width: `${sm.progress * 100}%`,
                background: `linear-gradient(90deg, ${sem.warning}, ${sem.critical})`,
                borderRadius: '1px',
              }} />
            </div>
          </div>
        );
      })()}

      {/* Fallback: non-pyro flat list */}
      {!isPyro && panel.metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {panel.metrics.map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={m.label} style={{
                display: 'flex', flexDirection: 'column', padding: '7px 0',
                borderBottom: i < panel.metrics.length - 1 ? '1px solid rgba(140,160,190,0.10)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {Icon && <Icon color={m.iconColor || colors.textTertiary} />}
                  <span style={{
                    fontFamily: typography.sansFamily, fontSize: '10px',
                    color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                    textTransform: 'uppercase',
                  }}>
                    {m.label}
                  </span>
                </div>
                <div style={{
                  fontFamily: typography.monoFamily, fontSize: '13px',
                  color: colors.dataValue, fontWeight: typography.weights.medium,
                  marginTop: '2px', paddingLeft: '17px', whiteSpace: 'nowrap',
                }}>
                  {m.value}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ④ Projected Fire Growth — only visible after simulation triggered */}
      {isPyro && simulationMode && (
        <div style={{
          border: '1px solid rgba(242, 125, 38, 0.20)',
          background: 'rgba(0, 0, 0, 0.30)',
          boxShadow: '0 0 0 1px rgba(242, 125, 38, 0.06)',
          borderRadius: radii.base,
          padding: '10px 12px 12px 12px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
            <SpreadIcon color={sem.warning} />
            <span style={{
              fontFamily: typography.sansFamily, fontSize: '9px',
              color: sem.warning, letterSpacing: typography.letterSpacing.widest,
              textTransform: 'uppercase', fontWeight: typography.weights.semibold,
            }}>
              Projected Fire Growth
            </span>
            {/* SIM badge — blue accent signals AI-computed output, not a live sensor */}
            <span style={{
              fontFamily: typography.monoFamily,
              fontSize: '8px',
              color: colors.accent,
              border: '1px solid rgba(110, 168, 215, 0.30)',
              borderRadius: '3px',
              padding: '1px 4px',
              letterSpacing: '0.08em',
              marginLeft: 'auto',
            }}>SIM</span>
          </div>
          {/* Rows */}
          {[
            { label: '+1 Hour',    value: fireStats ? `${Math.round(fireStats.totalAcres * 3.5)} acres` : '210 acres', color: sem.warning  },
            { label: '+3 Hours',   value: fireStats ? `${Math.round(fireStats.totalAcres * 8)} acres` : '480 acres', color: sem.warning  },
            { label: 'ROS',        value: fireStats ? `${fireStats.rosChainPerHour} ch/hr` : '2.4 ch/hr', color: sem.neutral  },
          ].map(row => (
            <div key={row.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: '3px',
            }}>
              <span style={{
                fontFamily: typography.sansFamily, fontSize: '9px',
                color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                textTransform: 'uppercase',
              }}>
                {row.label}
              </span>
              <span style={{
                fontFamily: typography.monoFamily, fontSize: '12px',
                color: row.color, fontWeight: typography.weights.medium,
                textShadow: row.color === sem.warning
                  ? '0 0 6px rgba(242, 125, 38, 0.35)'
                  : 'none',
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action — Pyro button is the primary CTA */}
      <button
        style={{
          ...(isPyro ? {
            ...buttonBase,
            background: 'linear-gradient(135deg, rgba(212,64,64,0.18), rgba(232,123,47,0.12))',
            border: '1px solid rgba(212,80,50,0.28)',
            color: '#E87B2F',
          } : btnStyle),
          width: '100%',
          padding: isPyro ? '12px 0' : '10px 0',
          marginTop: isPyro ? 'auto' : undefined,
          opacity: actionState === 'loading' ? 0.6 : 1,
          fontSize: isPyro ? '12px' : undefined,
        }}
        onClick={handleAction}
      >
        {actionState === 'done' ? 'Complete' : actionState === 'loading' ? 'Processing...' : panel.action}
      </button>
    </div>
  );
}

// ─── Active-state info per panel ───────────────────────────────────────────
const ACTIVE_INFO = {
  swarm: {
    label: 'DRONES DEPLOYED',
    color: colors.accent,
    rows: [
      { label: 'Coverage',  value: '91%',      color: colors.accent  },
      { label: 'Drones',    value: '12 active', color: colors.text    },
    ],
  },
  evac: {
    label: 'ROUTES ACTIVE',
    color: colors.safe,
    rows: [
      { label: 'Clear',   value: '2 routes', color: colors.safe   },
      { label: 'Blocked', value: '1 route',  color: colors.danger },
    ],
  },
  deploy: {
    label: 'UNITS ACTIVE',
    color: colors.warning,
    rows: [
      { label: 'Crews',    value: '4 deployed', color: colors.warning },
      { label: 'Tankers',  value: '2 airborne', color: colors.accent  },
    ],
  },
};

// ─── Compact panel variant (for Swarm, Evac, Deploy) ───────────────────────
export default function AgentPanel({ panelId, onActivate, isActive, liveData }) {
  const panel = PANELS[panelId];
  const [actionState, setActionState] = useState('idle');

  // Override hardcoded metrics with live simulation data
  const liveMetrics = (() => {
    if (!liveData) return panel.metrics;
    if (panelId === 'swarm' && liveData.swarm) {
      return [
        { label: 'Drones', value: `${liveData.swarm.launched} / ${liveData.swarm.total}`, icon: DroneIcon, iconColor: colors.textTertiary },
        { label: 'Coverage', value: `${liveData.swarm.coverage}%`, icon: CoverageIcon, iconColor: colors.textTertiary },
      ];
    }
    if (panelId === 'evac' && liveData.evac) {
      return [
        { label: 'Civilians', value: liveData.evac.totalPop.toLocaleString(), icon: PersonIcon, iconColor: colors.textTertiary },
        { label: 'Evacuated', value: liveData.evac.evacuated.toLocaleString(), icon: EvacPersonIcon, iconColor: colors.textTertiary },
      ];
    }
    if (panelId === 'deploy' && liveData.deploy) {
      return [
        { label: 'Crews', value: `${liveData.deploy.crews} active`, icon: CrewIcon, iconColor: colors.textTertiary },
        { label: 'Aircraft', value: `${liveData.deploy.aircraft} airborne`, icon: PlaneIcon, iconColor: colors.textTertiary },
      ];
    }
    return panel.metrics;
  })();

  const liveStatus = (() => {
    if (!liveData) return { label: panel.statusLabel, color: panel.statusColor };
    if (panelId === 'swarm' && liveData.swarm) {
      return { label: liveData.swarm.launched > 6 ? 'Deployed' : 'Patrol', color: liveData.swarm.launched > 6 ? colors.warning : colors.safe };
    }
    if (panelId === 'evac' && liveData.evac) {
      const blocked = liveData.evac.blocked || 0;
      return { label: blocked > 0 ? `${3-blocked} Open` : '3 Open', color: blocked > 0 ? colors.danger : colors.safe };
    }
    if (panelId === 'deploy' && liveData.deploy) {
      return { label: liveData.deploy.crews > 0 ? 'Active' : 'Standby', color: liveData.deploy.crews > 0 ? colors.safe : colors.warning };
    }
    return { label: panel.statusLabel, color: panel.statusColor };
  })();

  const handleAction = () => {
    if (actionState !== 'idle') return;
    setActionState('loading');
    setTimeout(() => {
      setActionState('done');
      onActivate?.();
      setTimeout(() => setActionState('idle'), 2000);
    }, 900);
  };

  const btnStyle = {
    accent: buttonAccent, ghost: buttonGhost, danger: buttonDanger,
  }[panel.actionVariant];

  const activeInfo = ACTIVE_INFO[panelId];

  return (
    <div style={{
      ...panelStyle,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '14px 16px',
      flex: 1,
      minHeight: 0,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: typography.sansFamily,
          fontSize: typography.sizes.md,
          fontWeight: typography.weights.semibold,
          color: colors.text,
          letterSpacing: typography.letterSpacing.tight,
        }}>
          {panel.title}
        </span>
        <StatusDot
          label={isActive && activeInfo ? activeInfo.label.split(' ')[0] : liveStatus.label}
          color={isActive && activeInfo ? activeInfo.color : liveStatus.color}
        />
      </div>

      {/* Inline metrics */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {liveMetrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                marginBottom: '2px',
              }}>
                {Icon && <Icon color={m.iconColor || colors.textTertiary} />}
                <span style={{
                  fontFamily: typography.sansFamily,
                  fontSize: '9px',
                  color: colors.textTertiary,
                  letterSpacing: typography.letterSpacing.wider,
                  textTransform: 'uppercase',
                }}>
                  {m.label}
                </span>
              </div>
              <div style={{
                fontFamily: typography.monoFamily,
                fontSize: typography.sizes.base,
                color: colors.text,
                fontWeight: typography.weights.medium,
              }}>
                {m.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active status section — shown after dispatch */}
      {isActive && activeInfo && (
        <div style={{
          borderTop: `1px solid ${colors.borderSubtle}`,
          paddingTop: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}>
          <span style={{
            fontFamily: typography.monoFamily,
            fontSize: '8px',
            color: activeInfo.color,
            letterSpacing: typography.letterSpacing.widest,
            textTransform: 'uppercase',
            marginBottom: '2px',
          }}>
            {activeInfo.label}
          </span>
          {activeInfo.rows.map(row => (
            <div key={row.label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}>
              <span style={{
                fontFamily: typography.sansFamily,
                fontSize: '9px',
                color: colors.textTertiary,
                letterSpacing: typography.letterSpacing.wider,
                textTransform: 'uppercase',
              }}>
                {row.label}
              </span>
              <span style={{
                fontFamily: typography.monoFamily,
                fontSize: '11px',
                color: row.color,
                fontWeight: typography.weights.medium,
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Agent reasoning feed */}
      {liveData?.reasoning && liveData.reasoning[panelId] && (
        <div style={{
          borderTop: `1px solid ${colors.borderSubtle}`,
          paddingTop: '4px',
          maxHeight: 36,
          overflow: 'hidden',
        }}>
          <span style={{
            fontFamily: typography.monoFamily,
            fontSize: '7px',
            color: '#F472B6',
            letterSpacing: '0.06em',
          }}>
            {liveData.reasoning[panelId]}
          </span>
        </div>
      )}

      {/* Action */}
      <button
        style={{
          ...btnStyle,
          width: '100%',
          padding: '7px 0',
          marginTop: 'auto',
          opacity: actionState === 'loading' ? 0.6 : 1,
        }}
        onClick={handleAction}
      >
        {actionState === 'done' ? '✓ Dispatched' : actionState === 'loading' ? '...' : panel.action}
      </button>
    </div>
  );
}

// ─── Minimal status dot + label ────────────────────────────────────────────
function StatusDot({ label, color }) {
  // Map color to appropriate glow
  const glowMap = {
    [colors.safe]:    shadows.glowSafe,
    [colors.warning]: shadows.glowWarning,
    [colors.danger]:  shadows.glowCritical,
  };
  const glow = glowMap[color] || shadows.glowAccent;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: color,
        boxShadow: glow,
      }} />
      <span style={{
        fontFamily: typography.sansFamily,
        fontSize: '10px',
        color: colors.textSecondary,
        fontWeight: typography.weights.medium,
        letterSpacing: typography.letterSpacing.wide,
      }}>
        {label}
      </span>
    </div>
  );
}
