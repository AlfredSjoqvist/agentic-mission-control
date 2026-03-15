import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wind, Droplets, Thermometer } from 'lucide-react';
import {
  colors, typography, radii, shadows, panelStyle, buttonBase, buttonAccent, buttonGhost, buttonDanger,
} from '../styles/designTokens.js';

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

// ─── Panel title icons (16×16, thin stroke, muted) ──────────────────────
const TITLE_ICON_COLOR = '#7F8A94';

function SwarmTitleIcon({ opacity = 0.6 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity, transition: 'opacity 0.2s' }}>
      <circle cx="8" cy="8" r="6" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeDasharray="2.5 2" />
      <circle cx="8" cy="8" r="2.8" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" />
      <line x1="8" y1="5.2" x2="8" y2="2" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="0.8" fill={TITLE_ICON_COLOR} />
    </svg>
  );
}

function EvacTitleIcon({ opacity = 0.6 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity, transition: 'opacity 0.2s' }}>
      <path d="M3 12 L7 5 L10 8 L13 3" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 3 L13 3 L13 5" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeployTitleIcon({ opacity = 0.6 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity, transition: 'opacity 0.2s' }}>
      <path d="M8 2 L13.5 5 L13.5 11 L8 14 L2.5 11 L2.5 5 Z" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="8" y1="8" x2="8" y2="14" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2.5" y1="5" x2="8" y2="8" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13.5" y1="5" x2="8" y2="8" stroke={TITLE_ICON_COLOR} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Panel data — Palantir: all chrome uses accent blue or gray ──────────
const PANELS = {
  pyro: {
    title: 'Pyro Analysis',
    statusLabel: 'Analyzing',
    statusColor: colors.statusOk,

    criticalMetric: {
      label: 'Spotting Risk',
      value: 'Extreme',
      icon: SpottingRiskIcon,
    },

    gridMetrics: [
      { label: 'Wind',        value: '25 mph NW', icon: WindIcon,        annotation: 'Strong',   annotationColor: colors.textTertiary },
      { label: 'Humidity',    value: '12%',       icon: HumidityIcon,    annotation: 'Very Dry', annotationColor: colors.critical     },
      { label: 'Temperature', value: '94 °F',     icon: TemperatureIcon, annotation: 'High',     annotationColor: colors.critical     },
      { label: 'Slope',       value: '32°',       icon: SlopeIcon,       annotation: 'Steep',    annotationColor: colors.textTertiary },
    ],

    spreadMetric: {
      label: 'Rate of Spread',
      value: '2.4 ch/hr',
      annotation: 'Rapid',
      annotationColor: colors.critical,
      progress: 0.65,
      icon: SpreadIcon,
    },

    action: 'Predict Spread',
    actionVariant: 'accent',
  },

  swarm: {
    title: 'Swarm Intel',
    titleIcon: SwarmTitleIcon,
    statusLabel: 'Active',
    statusColor: colors.statusOk,
    metrics: [
      { label: 'Drones',   value: '12 / 14', icon: DroneIcon,    iconColor: colors.textTertiary },
      { label: 'Coverage', value: '74%',      icon: CoverageIcon, iconColor: colors.textTertiary },
    ],
    action: 'Dispatch',
    actionVariant: 'accent',
  },

  evac: {
    title: 'Evac Routes',
    titleIcon: EvacTitleIcon,
    statusLabel: '3 Open',
    statusColor: colors.statusOk,
    metrics: [
      { label: 'Civilians', value: '2,847', icon: PersonIcon,     iconColor: colors.textTertiary },
      { label: 'Evacuated', value: '1,203', icon: EvacPersonIcon, iconColor: colors.textTertiary },
    ],
    action: 'Open Route',
    actionVariant: 'ghost',
  },

  deploy: {
    title: 'Deploy Assets',
    titleIcon: DeployTitleIcon,
    statusLabel: 'Standby',
    statusColor: colors.textTertiary,
    metrics: [
      { label: 'Crews',       value: '4 active',  icon: CrewIcon,  iconColor: colors.textTertiary },
      { label: 'Air Tankers', value: '2 inbound', icon: PlaneIcon, iconColor: colors.textTertiary },
    ],
    action: 'Dispatch Crews',
    actionVariant: 'accent',
  },
};

// ─── Large panel variant (for Pyro — primary panel) ────────────────────────
export function LargeAgentPanel({ panelId, onSimulate, simulationMode, onFullDispatch, allDeployed }) {
  const panel = PANELS[panelId];
  const [actionState, setActionState] = useState('idle');
  const [pyroPhase, setPyroPhase] = useState(0);
  const [pyroVisibleRows, setPyroVisibleRows] = useState(0);
  const [alertPhase, setAlertPhase] = useState(0);
  const pyroTimers = useRef([]);

  const clearPyroTimers = useCallback(() => {
    pyroTimers.current.forEach(clearTimeout);
    pyroTimers.current = [];
  }, []);

  useEffect(() => clearPyroTimers, [clearPyroTimers]);

  // Critical Alert phased reveal on mount
  useEffect(() => {
    if (panelId !== 'pyro') return;
    const t1 = setTimeout(() => setAlertPhase(1), 800);
    const t2 = setTimeout(() => setAlertPhase(2), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [panelId]);

  const handleAction = () => {
    if (actionState !== 'idle' || simulationMode) return;
    setActionState('loading');
    setPyroPhase(1);
    setPyroVisibleRows(0);

    const t1 = setTimeout(() => setPyroPhase(2), 500);
    const t2 = setTimeout(() => {
      setPyroPhase(3);
      onSimulate?.();
    }, 1200);
    const t3 = setTimeout(() => setPyroVisibleRows(1), 1500);
    const t4 = setTimeout(() => setPyroVisibleRows(2), 1800);
    const t5 = setTimeout(() => setPyroVisibleRows(3), 2100);
    const t6 = setTimeout(() => {
      setActionState('done');
      setPyroPhase(4);
    }, 2500);
    const t7 = setTimeout(() => setActionState('idle'), 4500);
    pyroTimers.current = [t1, t2, t3, t4, t5, t6, t7];
  };

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
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isPyro && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
              <path d="M12 2C12 2 8 6 8 10C8 11.1 8.3 12.1 8.8 13C7.3 12.4 6 11 6 8.5C4 10.5 3 13 3 16C3 19.9 7.1 23 12 23C16.9 23 21 19.9 21 16C21 11 16 7 12 2Z"
                fill={colors.textTertiary} />
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

      {/* ① Critical Alert — phased reveal: scan → detect */}
      {isPyro && panel.criticalMetric && alertPhase >= 1 && (
        <div style={{
          borderLeft: `2px solid ${alertPhase >= 2 ? colors.critical : 'rgba(224, 64, 64, 0.3)'}`,
          background: alertPhase >= 2 ? 'rgba(224, 64, 64, 0.04)' : 'rgba(224, 64, 64, 0.02)',
          boxShadow: alertPhase >= 2 ? `inset 3px 0 12px rgba(224, 64, 64, 0.05)` : 'none',
          borderRadius: `0 ${radii.base} ${radii.base} 0`,
          padding: '10px 12px 12px 14px',
          transition: 'border-color 0.4s ease, background 0.4s ease, box-shadow 0.4s ease',
        }}>
          {alertPhase === 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <SpottingRiskIcon color={'rgba(224, 64, 64, 0.5)'} />
              <BlinkingText text="SCANNING THREAT LEVEL..." color={colors.critical} />
            </div>
          )}
          {alertPhase >= 2 && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px',
                opacity: 1, transform: 'translateY(0)',
                animation: 'fadeInUp 0.4s ease',
              }}>
                <SpottingRiskIcon color={colors.critical} />
                <span style={{
                  fontFamily: typography.sansFamily, fontSize: '9px',
                  color: colors.critical, letterSpacing: typography.letterSpacing.widest,
                  textTransform: 'uppercase', fontWeight: typography.weights.semibold,
                }}>
                  Critical Alert
                </span>
              </div>
              <div style={{
                fontFamily: typography.sansFamily, fontSize: '9px',
                color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                textTransform: 'uppercase', marginBottom: '2px',
                animation: 'fadeInUp 0.4s ease 0.1s both',
              }}>
                {panel.criticalMetric.label}
              </div>
              <div style={{
                fontFamily: typography.monoFamily, fontSize: '15px',
                color: colors.critical, fontWeight: typography.weights.semibold,
                letterSpacing: typography.letterSpacing.wide,
                textShadow: shadows.glowCritical,
                animation: 'fadeInUp 0.4s ease 0.2s both',
              }}>
                {panel.criticalMetric.value}
              </div>
            </>
          )}
        </div>
      )}

      {/* ② 2×2 Environmental Grid */}
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
                border: `1px solid rgba(224, 64, 64, 0.25)`,
                borderRadius: '3px', padding: '1px 5px', opacity: 0.85,
              }}>
                {sm.annotation}
              </span>
            </div>
            {/* Progress bar — blue accent, not orange-red */}
            <div style={{ height: '2px', background: 'rgba(140,160,190,0.08)', borderRadius: '1px' }}>
              <div style={{
                height: '100%', width: `${sm.progress * 100}%`,
                background: colors.accent,
                opacity: 0.7,
                borderRadius: '1px',
              }} />
            </div>
          </div>
        );
      })()}

      {/* Action button — above results so click → results appear below */}
      <button
        style={{
          ...buttonAccent,
          width: '100%',
          padding: isPyro ? '12px 0' : '10px 0',
          opacity: actionState === 'loading' ? 0.6 : 1,
          transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
          boxShadow: actionState === 'loading'
            ? `0 0 12px ${colors.accentDim}`
            : 'none',
          fontSize: isPyro ? '12px' : undefined,
        }}
        onClick={handleAction}
      >
        {actionState === 'done' ? '✓ Complete'
          : pyroPhase === 1 ? <><ProgressDots /> Analyzing</>
          : pyroPhase === 2 ? <><ProgressDots /> Running Simulation</>
          : simulationMode ? '✓ Complete'
          : panel.action}
      </button>

      {/* ④ Projected Fire Growth — phased reveal, appears below button */}
      {isPyro && (pyroPhase >= 1 || simulationMode) && (() => {
        const pyroRows = [
          { label: '+1 Hour',    numVal: 210, suffix: ' acres', color: colors.dataValue, idx: 0 },
          { label: '+3 Hours',   numVal: 480, suffix: ' acres', color: colors.dataValue, idx: 1 },
          { label: 'Confidence', numVal: 87,  suffix: '%',      color: colors.accent,    idx: 2 },
        ];
        const isScanning = pyroPhase >= 1 && pyroPhase <= 2;
        return (
          <div style={{
            border: `1px solid ${colors.border}`,
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: radii.base,
            padding: '10px 12px 12px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
              <SpreadIcon color={colors.textSecondary} />
              <span style={{
                fontFamily: typography.sansFamily, fontSize: '9px',
                color: colors.textSecondary, letterSpacing: typography.letterSpacing.widest,
                textTransform: 'uppercase', fontWeight: typography.weights.semibold,
              }}>
                Projected Fire Growth
              </span>
              <span style={{
                fontFamily: typography.monoFamily,
                fontSize: '8px',
                color: colors.accent,
                border: `1px solid ${colors.accentMid}`,
                borderRadius: '3px',
                padding: '1px 4px',
                letterSpacing: '0.08em',
                marginLeft: 'auto',
              }}>SIM</span>
            </div>
            {isScanning && (
              <div style={{ marginBottom: '6px' }}>
                <BlinkingText
                  text={pyroPhase === 1 ? 'ANALYZING TERRAIN...' : 'RUNNING SIMULATION...'}
                  color={colors.accent}
                />
                <div style={{
                  marginTop: '4px',
                  height: '1px',
                  background: 'rgba(140,160,190,0.08)',
                  borderRadius: '1px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    background: colors.accent,
                    opacity: 0.5,
                    width: '30%',
                    animation: 'shimmer 1.2s ease-in-out infinite',
                  }} />
                </div>
              </div>
            )}
            {pyroRows.map(row => {
              const visible = simulationMode && pyroPhase === 0
                ? true
                : pyroVisibleRows > row.idx;
              if (!visible && !isScanning) return null;
              if (isScanning) return null;
              return (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginBottom: '3px',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(6px)',
                  transition: 'opacity 0.4s ease, transform 0.4s ease',
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
                  }}>
                    {visible && (pyroPhase !== 0 || !simulationMode)
                      ? <AnimatedValue target={row.numVal} duration={800} suffix={row.suffix} />
                      : `${row.numVal}${row.suffix}`
                    }
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ⑤ Execute Recommended Plan — appears after simulation complete */}
      {isPyro && simulationMode && (pyroPhase === 0 || pyroPhase >= 4) && (
        <button
          style={{
            ...buttonAccent,
            width: '100%',
            padding: '12px 0',
            background: allDeployed ? 'rgba(61, 184, 122, 0.08)' : colors.accentDim,
            border: `1px solid ${allDeployed ? 'rgba(61, 184, 122, 0.25)' : colors.accentMid}`,
            color: allDeployed ? colors.statusOk : colors.accent,
            fontSize: '12px',
            letterSpacing: '0.10em',
            transition: 'all 0.3s ease',
          }}
          onClick={onFullDispatch}
          disabled={allDeployed}
        >
          {allDeployed ? '✓ All Units Deployed' : '▶ Execute Recommended Plan'}
        </button>
      )}
    </div>
  );
}

// ─── Animated number counter ──────────────────────────────────────────────
function AnimatedValue({ target, duration = 1200, suffix = '', prefix = '' }) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    const num = parseInt(target, 10) || 0;
    if (num === 0) { setCurrent(0); return; }
    startRef.current = performance.now();
    let raf;
    function tick(now) {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(eased * num));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return <>{prefix}{current}{suffix}</>;
}

// ─── Blinking text for loading phases ─────────────────────────────────────
function BlinkingText({ text, color }) {
  return (
    <span style={{
      fontFamily: typography.monoFamily, fontSize: '8px',
      color: color || colors.textTertiary,
      letterSpacing: typography.letterSpacing.widest,
      textTransform: 'uppercase',
      animation: 'pulse 1.2s ease-in-out infinite',
    }}>
      {text}
    </span>
  );
}

// ─── Progress dots animation ──────────────────────────────────────────────
function ProgressDots() {
  const [dots, setDots] = useState('.');
  useEffect(() => {
    const id = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.');
    }, 300);
    return () => clearInterval(id);
  }, []);
  return dots;
}

// ─── Feed phases per panel ────────────────────────────────────────────────
const FEED_PHASES = {
  swarm: [
    { text: 'INITIALIZING SWARM LINK', delay: 0 },
    { text: 'CONNECTING TO DRONE FLEET', delay: 600 },
  ],
  evac: [
    { text: 'SCANNING ROUTE NETWORK', delay: 0 },
    { text: 'VALIDATING CORRIDORS', delay: 600 },
  ],
  deploy: [
    { text: 'MOBILIZING RESOURCES', delay: 0 },
    { text: 'DISPATCHING UNITS', delay: 600 },
  ],
};

// ─── Active-state info — all use accent blue for consistency ──────────────
const ACTIVE_INFO = {
  swarm: {
    label: 'DRONES DEPLOYED',
    color: colors.statusOk,
    rows: [
      { label: 'Coverage',  value: '91%',      color: colors.statusOk },
      { label: 'Drones',    value: '12 active', color: colors.statusOk },
    ],
  },
  evac: {
    label: 'ROUTES ACTIVE',
    color: colors.statusOk,
    rows: [
      { label: 'Clear',   value: '2 routes', color: colors.statusOk },
      { label: 'Blocked', value: '1 route',  color: colors.critical },
    ],
  },
  deploy: {
    label: 'UNITS ACTIVE',
    color: colors.statusOk,
    rows: [
      { label: 'Crews',    value: '4 deployed', color: colors.statusOk },
      { label: 'Tankers',  value: '2 airborne', color: colors.statusOk },
    ],
  },
};

// ─── Compact panel variant (for Swarm, Evac, Deploy) ───────────────────────
export default function AgentPanel({ panelId, onActivate, isActive, triggerDispatch }) {
  const panel = PANELS[panelId];
  const [phase, setPhase] = useState(0);
  const [visibleRows, setVisibleRows] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRefs = useRef([]);

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  }, []);

  const handleAction = useCallback(() => {
    if (phase !== 0 || isActive) return;
    clearTimers();
    setPhase(1);
    setVisibleRows(0);
    setShowBadge(false);

    const t1 = setTimeout(() => setPhase(2), 600);
    const t2 = setTimeout(() => {
      setPhase(3);
      onActivate?.();
    }, 1400);
    const t3 = setTimeout(() => setVisibleRows(1), 1700);
    const t4 = setTimeout(() => setVisibleRows(2), 2000);
    const t5 = setTimeout(() => setShowBadge(true), 2200);
    const t6 = setTimeout(() => setPhase(4), 2500);
    const t7 = setTimeout(() => setPhase(0), 4500);
    timerRefs.current = [t1, t2, t3, t4, t5, t6, t7];
  }, [phase, isActive, clearTimers, onActivate]);

  // External trigger from "Execute Plan" button
  useEffect(() => {
    if (triggerDispatch && !isActive && phase === 0) {
      handleAction();
    }
  }, [triggerDispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearTimers, [clearTimers]);

  const activeInfo = ACTIVE_INFO[panelId];
  const feedPhases = FEED_PHASES[panelId];
  const isLoading = phase >= 1 && phase <= 2;
  const isRevealing = phase >= 3;

  let btnLabel = panel.action;
  if (phase === 1 || phase === 2) btnLabel = <><ProgressDots /></>;
  else if (phase === 4) btnLabel = '✓ Dispatched';
  else if (isActive) btnLabel = '✓ Dispatched';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...panelStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 14px',
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {panel.titleIcon && <panel.titleIcon opacity={hovered || isActive ? 0.8 : 0.6} />}
          <span style={{
            fontFamily: typography.sansFamily,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.semibold,
            color: colors.text,
            letterSpacing: typography.letterSpacing.tight,
          }}>
            {panel.title}
          </span>
        </div>
        <StatusDot
          label={showBadge && activeInfo ? activeInfo.label.split(' ')[0] : panel.statusLabel}
          color={showBadge && activeInfo ? activeInfo.color : panel.statusColor}
        />
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {panel.metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px',
              }}>
                {Icon && <Icon color={m.iconColor || colors.textTertiary} />}
                <span style={{
                  fontFamily: typography.sansFamily, fontSize: '9px',
                  color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                  textTransform: 'uppercase',
                }}>
                  {m.label}
                </span>
              </div>
              <div style={{
                fontFamily: typography.monoFamily, fontSize: typography.sizes.base,
                color: colors.text, fontWeight: typography.weights.medium,
              }}>
                {m.value}
              </div>
            </div>
          );
        })}
      </div>

      {isLoading && feedPhases && (
        <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, paddingTop: '6px' }}>
          <BlinkingText text={feedPhases[phase - 1]?.text + '...'} color={colors.accent} />
          <div style={{
            marginTop: '6px', height: '1px',
            background: 'rgba(140,160,190,0.08)', borderRadius: '1px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', background: colors.accent, opacity: 0.5,
              width: '30%', animation: 'shimmer 1.2s ease-in-out infinite',
            }} />
          </div>
        </div>
      )}

      {(isRevealing || isActive) && activeInfo && (
        <div style={{
          borderTop: `1px solid ${colors.borderSubtle}`,
          paddingTop: '6px',
          display: 'flex', flexDirection: 'column', gap: '3px',
        }}>
          {showBadge && (
            <span style={{
              fontFamily: typography.monoFamily, fontSize: '8px',
              color: colors.statusOk, letterSpacing: typography.letterSpacing.widest,
              textTransform: 'uppercase', marginBottom: '2px',
              opacity: showBadge ? 1 : 0, transition: 'opacity 0.4s ease',
            }}>
              {activeInfo.label}
            </span>
          )}
          {activeInfo.rows.map((row, idx) => {
            const visible = isActive && phase === 0 ? true : visibleRows > idx;
            if (!visible) return null;
            const numMatch = row.value.match(/^(\d+)/);
            const numPart = numMatch ? parseInt(numMatch[1], 10) : null;
            const textPart = numMatch ? row.value.slice(numMatch[0].length) : row.value;
            return (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(6px)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
              }}>
                <span style={{
                  fontFamily: typography.sansFamily, fontSize: '9px',
                  color: colors.textTertiary, letterSpacing: typography.letterSpacing.wider,
                  textTransform: 'uppercase',
                }}>
                  {row.label}
                </span>
                <span style={{
                  fontFamily: typography.monoFamily, fontSize: '11px',
                  color: row.color, fontWeight: typography.weights.medium,
                }}>
                  {numPart !== null && (phase !== 0 || !isActive)
                    ? <><AnimatedValue target={numPart} duration={800} />{textPart}</>
                    : row.value
                  }
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        style={{
          ...buttonAccent,
          width: '100%', padding: '7px 0', marginTop: 'auto',
          opacity: isLoading ? 0.6 : 1,
          transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
          boxShadow: isLoading ? `0 0 12px ${colors.accentDim}` : 'none',
        }}
        onClick={handleAction}
        disabled={isActive && phase === 0}
      >
        {btnLabel}
      </button>
    </div>
  );
}

// ─── Minimal status dot + label — semantic glow per color ───────────────
function StatusDot({ label, color }) {
  const glow = color === colors.critical ? shadows.glowCritical
    : color === colors.statusOk ? shadows.glowStatus
    : shadows.glowAccent;
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
