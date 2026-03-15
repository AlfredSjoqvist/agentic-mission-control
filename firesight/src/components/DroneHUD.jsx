import React, { useEffect, useState } from 'react';
import { colors, typography, radii } from '../styles/designTokens.js';

// ─── Keyframes ─────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes hudIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scanLine {
  0%   { top: 0%; }
  100% { top: 100%; }
}
@keyframes recBlink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
@keyframes hudCornerIn {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}
`;

// Drone 0-indexed, each with a fake "id" label and some varied stats
const DRONE_DATA = [
  { id: 'DR-01', alt: 198, heading: 247, speed: 0, battery: 82, proximity: '1.2km' },
  { id: 'DR-02', alt: 214, heading: 112, speed: 0, battery: 76, proximity: '0.8km' },
  { id: 'DR-03', alt: 203, heading: 315, speed: 0, battery: 91, proximity: '2.1km' },
  { id: 'DR-04', alt: 187, heading: 58,  speed: 0, battery: 68, proximity: '1.5km' },
  { id: 'DR-05', alt: 221, heading: 180, speed: 0, battery: 84, proximity: '0.6km' },
  { id: 'DR-06', alt: 195, heading: 90,  speed: 0, battery: 79, proximity: '1.9km' },
  { id: 'DR-07', alt: 209, heading: 225, speed: 0, battery: 55, proximity: '3.0km' },
  { id: 'DR-08', alt: 217, heading: 337, speed: 0, battery: 93, proximity: '1.1km' },
];

export default function DroneHUD({ droneIndex, onExit }) {
  const [visible, setVisible] = useState(false);
  const drone = DRONE_DATA[droneIndex] ?? DRONE_DATA[0];

  useEffect(() => {
    // Inject keyframes once
    const id = 'drone-hud-kf';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id; el.textContent = KEYFRAMES;
      document.head.appendChild(el);
    }
    // Small delay for animation
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  if (droneIndex === null || droneIndex === undefined) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 300,
      background: 'transparent',
      animation: 'hudIn 0.35s ease',
      overflow: 'hidden',
      fontFamily: typography.monoFamily,
    }}>
      {/* Scan line */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        height: 1,
        background: 'rgba(91,155,213,0.15)',
        animation: 'scanLine 4s linear infinite',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* Corner brackets */}
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {/* Center reticle */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 48, height: 48,
        pointerEvents: 'none',
      }}>
        {/* Cross */}
        <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'rgba(91,155,213,0.6)', transform:'translateY(-50%)' }} />
        <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(91,155,213,0.6)', transform:'translateX(-50%)' }} />
        {/* Corner ticks */}
        {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],i) => (
          <div key={i} style={{
            position:'absolute',
            width:8, height:8,
            top: sy < 0 ? 0 : 'auto',
            bottom: sy > 0 ? 0 : 'auto',
            left: sx < 0 ? 0 : 'auto',
            right: sx > 0 ? 0 : 'auto',
            borderTop:    sy < 0 ? '1.5px solid rgba(91,155,213,0.8)' : 'none',
            borderBottom: sy > 0 ? '1.5px solid rgba(91,155,213,0.8)' : 'none',
            borderLeft:   sx < 0 ? '1.5px solid rgba(91,155,213,0.8)' : 'none',
            borderRight:  sx > 0 ? '1.5px solid rgba(91,155,213,0.8)' : 'none',
          }} />
        ))}
      </div>

      {/* ── TOP BAR ── */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
      }}>
        {/* Left: live badge + drone id */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(224,64,64,0.12)',
            border: '1px solid rgba(224,64,64,0.30)',
            borderRadius: radii.sm,
            padding: '3px 8px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: colors.critical,
              animation: 'recBlink 1s ease-in-out infinite',
            }} />
            <span style={{ fontSize: '9px', letterSpacing: '0.10em', color: colors.critical }}>
              LIVE
            </span>
          </div>
          <span style={{ fontSize: '13px', letterSpacing: '0.08em', color: colors.text, fontWeight: 600 }}>
            {drone.id}
          </span>
          <span style={{ fontSize: '10px', color: colors.textTertiary, letterSpacing: '0.05em' }}>
            DRONE FEED
          </span>
        </div>

        {/* Center: incident label */}
        <span style={{ fontSize: '10px', color: colors.textSecondary, letterSpacing: '0.06em' }}>
          PINE RIDGE COMPLEX — EL DORADO COUNTY
        </span>

        {/* Right: exit */}
        <button
          onClick={onExit}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(4,6,10,0.72)',
            border: `1px solid rgba(91,155,213,0.70)`,
            borderRadius: radii.sm,
            padding: '6px 14px',
            cursor: 'pointer',
            outline: 'none',
            color: '#e8f0fa',
            fontSize: '10px',
            letterSpacing: '0.10em',
            fontFamily: typography.monoFamily,
            fontWeight: 600,
            transition: 'all 0.15s ease',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            pointerEvents: 'auto',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(91,155,213,0.25)';
            e.currentTarget.style.borderColor = 'rgba(91,155,213,1)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(4,6,10,0.72)';
            e.currentTarget.style.borderColor = 'rgba(91,155,213,0.70)';
            e.currentTarget.style.color = '#e8f0fa';
          }}
        >
          ← EXIT DRONE VIEW
        </button>
      </div>

      {/* ── BOTTOM STATS BAR ── */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'linear-gradient(to top, rgba(4,6,10,0.85) 0%, transparent 100%)',
      }}>
        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StatPill label="ALT"      value={`${drone.alt}m`}     />
          <StatPill label="HEADING"  value={`${String(drone.heading).padStart(3,'0')}°`} />
          <StatPill label="SPEED"    value={`${drone.speed} kts`} />
          <StatPill label="BATTERY"  value={`${drone.battery}%`}  color={drone.battery < 60 ? colors.critical : colors.statusOk} />
        </div>

        {/* Fire proximity */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StatPill label="FIRE PROXIMITY" value={drone.proximity} color={colors.fireOneHour} />
          <StatPill label="COVERAGE ZONE"  value="74%"             color={colors.accent}      />
        </div>
      </div>

      {/* ── SIDE: compass strip (right) ── */}
      <CompassStrip heading={drone.heading} />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${colors.border}`,
      borderRadius: radii.sm,
      padding: '5px 12px',
      minWidth: 64,
    }}>
      <span style={{ fontSize: '8px', letterSpacing: '0.10em', color: colors.textTertiary, marginBottom: 2 }}>
        {label}
      </span>
      <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em', color: color ?? colors.dataValue }}>
        {value}
      </span>
    </div>
  );
}

function Corner({ pos }) {
  const SIZE = 24;
  const OFFSET = 16;
  const style = {
    position: 'absolute',
    width: SIZE, height: SIZE,
    animation: 'hudCornerIn 0.4s ease',
  };
  const borderColor = 'rgba(91,155,213,0.55)';
  const T = '2px solid ' + borderColor;
  if (pos === 'tl') return <div style={{ ...style, top: OFFSET, left: OFFSET, borderTop: T, borderLeft: T }} />;
  if (pos === 'tr') return <div style={{ ...style, top: OFFSET, right: OFFSET, borderTop: T, borderRight: T }} />;
  if (pos === 'bl') return <div style={{ ...style, bottom: OFFSET, left: OFFSET, borderBottom: T, borderLeft: T }} />;
  return                   <div style={{ ...style, bottom: OFFSET, right: OFFSET, borderBottom: T, borderRight: T }} />;
}

function CompassStrip({ heading }) {
  const ticks = [];
  for (let i = -5; i <= 5; i++) {
    const deg = ((heading + i * 10) + 360) % 360;
    const isMajor = deg % 90 === 0;
    const label = isMajor ? ['N','E','S','W'][deg / 90] : (deg % 30 === 0 ? deg : null);
    ticks.push({ deg, label, isMajor, offset: i });
  }
  return (
    <div style={{
      position: 'absolute',
      top: '50%', right: 20,
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      height: 160,
      justifyContent: 'space-between',
    }}>
      {ticks.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: '8px', letterSpacing: '0.05em', width: 20, textAlign: 'right',
            color: t.offset === 0 ? colors.accent : colors.textMuted,
            fontWeight: t.offset === 0 ? 600 : 400,
          }}>
            {t.label ?? ''}
          </span>
          <div style={{
            width: t.offset === 0 ? 12 : t.isMajor ? 8 : 4,
            height: 1,
            background: t.offset === 0 ? colors.accent : 'rgba(255,255,255,0.15)',
          }} />
        </div>
      ))}
    </div>
  );
}
