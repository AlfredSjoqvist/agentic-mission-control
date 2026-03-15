import React, { useRef, useEffect } from 'react';
import { colors, typography, radii, panelStyle, shadows } from '../styles/designTokens.js';

const MARKS = [
  { value: 0, label: 'Now' },
  { value: 50, label: '+1h' },
  { value: 100, label: '+3h' },
];

// Progression: mild → dangerous as fire spreads over time
const FIRE_COLORS = [colors.fireThreeHour, colors.fireOneHour, colors.fireNow];

// Fire severity legend (not time-based)
const SEVERITY = [
  { label: 'Low', color: colors.fireThreeHour },
  { label: 'Moderate', color: colors.fireOneHour },
  { label: 'Severe', color: colors.fireNow },
];

export function sliderToTimeSlot(val) {
  if (val < 33) return 0;
  if (val < 67) return 1;
  return 2;
}

// Get the gradient color at a given position (0-100)
function getBarColor(pct) {
  // 0-33: gold, 33-67: orange, 67-100: red
  if (pct < 33) return colors.fireThreeHour;
  if (pct < 67) return colors.fireOneHour;
  return colors.fireNow;
}

export default function Timeline({ value, onChange, timeSlot, simulationMode }) {
  const sliderRef = useRef(null);

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.setProperty('--val', `${value}%`);
    }
  }, [value]);

  // Build gradient string that fills only up to value%
  const gradientStops = value <= 0
    ? 'transparent 0%, transparent 100%'
    : `${colors.fireThreeHour} 0%, ${value > 33 ? colors.fireOneHour : colors.fireThreeHour} ${Math.min(value, 33)}%, ${value > 67 ? colors.fireNow : colors.fireOneHour} ${Math.min(value, 67)}%, ${getBarColor(value)} ${value}%, transparent ${value}%, transparent 100%`;

  return (
    <div style={{
      ...panelStyle,
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      padding: '10px 28px',
      height: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Label group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: simulationMode ? colors.accent : colors.textTertiary,
          boxShadow: simulationMode ? shadows.glowAccent : 'none',
          animation: simulationMode ? 'pulse 2s ease-in-out infinite' : 'none',
          transition: 'all 0.3s ease',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: typography.sansFamily,
          fontSize: '10px',
          color: simulationMode ? colors.text : colors.textTertiary,
          letterSpacing: typography.letterSpacing.wider,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          transition: 'color 0.3s ease',
        }}>
          Fire Projection
        </span>
        {simulationMode && (
          <span style={{
            fontFamily: typography.monoFamily,
            fontSize: '8px',
            color: colors.accent,
            border: `1px solid ${colors.accentMid}`,
            borderRadius: '3px',
            padding: '1px 4px',
            letterSpacing: '0.10em',
            opacity: 0.9,
          }}>
            ACTIVE
          </span>
        )}
      </div>

      {/* Slider region */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Filled progress bar — only fills to thumb position */}
        <div style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          transform: 'translateY(-50%)',
          height: '2px',
          borderRadius: '1px',
          pointerEvents: 'none',
          zIndex: 0,
          margin: '0 7px',
          background: value > 0
            ? `linear-gradient(to right, ${gradientStops})`
            : 'rgba(255,255,255,0.08)',
        }} />

        {/* Unfilled track background */}
        <div style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          transform: 'translateY(-50%)',
          height: '1px',
          borderRadius: '1px',
          pointerEvents: 'none',
          zIndex: 0,
          margin: '0 7px',
          background: 'rgba(255,255,255,0.08)',
        }} />

        <input
          ref={sliderRef}
          type="range"
          min={0} max={100} step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ position: 'relative', zIndex: 1, width: '100%', background: 'transparent' }}
        />

        {/* Time marks below slider */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', padding: '0 7px' }}>
          {MARKS.map((m, i) => {
            const active = timeSlot === i;
            return (
              <span
                key={m.value}
                onClick={() => onChange(m.value)}
                style={{
                  fontFamily: typography.monoFamily,
                  fontSize: '10px',
                  color: active ? FIRE_COLORS[i] : colors.textTertiary,
                  fontWeight: active ? typography.weights.semibold : typography.weights.regular,
                  textShadow: active ? `0 0 8px ${FIRE_COLORS[i]}44` : 'none',
                  cursor: 'pointer',
                  transition: 'color 0.2s',
                  letterSpacing: '0.02em',
                  textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
                }}
              >
                {m.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Legend — fire severity (not time) */}
      <div style={{ display: 'flex', gap: '14px', flexShrink: 0 }}>
        {SEVERITY.map(({ label, color }, i) => {
          const active = timeSlot >= i;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{
                width: 6, height: 6,
                borderRadius: '2px',
                background: color,
                opacity: active ? 1 : 0.3,
                boxShadow: simulationMode && active ? `0 0 4px ${color}66` : 'none',
                transition: 'opacity 0.3s, box-shadow 0.3s',
              }} />
              <span style={{
                fontFamily: typography.sansFamily,
                fontSize: '10px',
                color: active ? colors.textSecondary : colors.textTertiary,
                letterSpacing: '0.02em',
                transition: 'color 0.3s',
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
