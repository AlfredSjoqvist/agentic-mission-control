import React, { useRef, useEffect } from 'react';
import { colors, typography, radii, panelStyle, shadows } from '../styles/designTokens.js';

const MARKS = [
  { value: 0, label: 'Now' },
  { value: 50, label: '+1h' },
  { value: 100, label: '+3h' },
];

const FIRE_COLORS = [colors.fireNow, colors.fireOneHour, colors.fireThreeHour];

export function sliderToTimeSlot(val) {
  if (val < 33) return 0;
  if (val < 67) return 1;
  return 2;
}

export default function Timeline({ value, onChange, timeSlot, simulationMode }) {
  const sliderRef = useRef(null);

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.setProperty('--val', `${value}%`);
    }
  }, [value]);

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
        {/* LED status dot — green pulse when sim active */}
        <div style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: simulationMode ? colors.safe : colors.textTertiary,
          boxShadow: simulationMode ? shadows.glowSafe : 'none',
          animation: simulationMode ? 'pulse 2s ease-in-out infinite' : 'none',
          transition: 'all 0.3s ease',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: typography.sansFamily,
          fontSize: '10px',
          color: simulationMode ? colors.fireOneHour : colors.textTertiary,
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
            color: colors.fireOneHour,
            border: `1px solid rgba(242, 125, 38, 0.35)`,
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
        {/* Colored segment bar behind the slider */}
        <div style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          transform: 'translateY(-50%)',
          height: '1.5px',
          borderRadius: '1px',
          display: 'flex',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 0,
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              flex: 1,
              background: FIRE_COLORS[i],
              opacity: timeSlot >= i ? 0.7 : 0.12,
              transition: 'opacity 0.3s',
            }} />
          ))}
        </div>

        <input
          ref={sliderRef}
          type="range"
          min={0} max={100} step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ position: 'relative', zIndex: 1, width: '100%', background: 'transparent' }}
        />

        {/* Marks */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
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

      {/* Legend — minimal */}
      <div style={{ display: 'flex', gap: '14px', flexShrink: 0 }}>
        {['Current', '+1 Hour', '+3 Hours'].map((lbl, i) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{
              width: 6, height: 6,
              borderRadius: '2px',
              background: FIRE_COLORS[i],
              opacity: timeSlot >= i ? (simulationMode ? 1 : 0.85) : (simulationMode ? 0.45 : 0.3),
              boxShadow: simulationMode && timeSlot >= i ? `0 0 4px ${FIRE_COLORS[i]}88` : 'none',
              transition: 'opacity 0.3s, box-shadow 0.3s',
            }} />
            <span style={{
              fontFamily: typography.sansFamily,
              fontSize: '10px',
              color: simulationMode && timeSlot >= i ? colors.textSecondary : colors.textTertiary,
              letterSpacing: '0.02em',
              transition: 'color 0.3s',
            }}>
              {lbl}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
