import React, { useState, useEffect } from 'react';
import { colors, typography } from '../styles/designTokens.js';

const indicators = [
  { label: 'SAT', value: 'ONLINE', color: colors.statusOk },
  { label: 'WIND', value: '25 NW', color: colors.statusOk },
  { label: 'CREWS', value: '4', color: colors.statusOk },
  { label: 'AIR', value: '2', color: colors.statusOk },
  { label: 'COMMS', value: 'OK', color: colors.statusOk },
];

export default function StatusBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '18px',
      height: '100%',
    }}>
      {indicators.map((ind) => (
        <div key={ind.label} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}>
          <div style={{
            width: 5, height: 5,
            borderRadius: '50%',
            background: ind.color,
            opacity: 0.8,
          }} />
          <span style={{
            fontFamily: typography.sansFamily,
            fontSize: '10px',
            color: colors.textSecondary,
            letterSpacing: typography.letterSpacing.wider,
            fontWeight: typography.weights.medium,
          }}>
            {ind.label}
          </span>
          <span style={{
            fontFamily: typography.monoFamily,
            fontSize: '10px',
            color: colors.text,
            fontWeight: typography.weights.medium,
            letterSpacing: '0.02em',
          }}>
            {ind.value}
          </span>
        </div>
      ))}

      {/* Clock */}
      <span style={{
        fontFamily: typography.monoFamily,
        fontSize: '13px',
        fontWeight: typography.weights.medium,
        color: colors.textSecondary,
        letterSpacing: '0.03em',
        marginLeft: '4px',
        flexShrink: 0,
      }}>
        {timeStr}
      </span>
    </div>
  );
}
