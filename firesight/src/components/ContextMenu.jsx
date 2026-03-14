import React, { useEffect, useRef, useState } from 'react';
import { colors, typography, radii, panelStyle } from '../styles/designTokens.js';

const ACTIONS = [
  { id: 'drone', label: 'Send Drone', desc: 'Deploy UAV recon', color: colors.accent },
  { id: 'evac', label: 'Check Evac Route', desc: 'Nearest clear path', color: colors.safe },
  { id: 'crew', label: 'Deploy Crew', desc: 'Assign ground team', color: colors.warning },
];

export default function ContextMenu({ x, y, worldPos, onClose }) {
  const menuRef = useRef(null);
  const [activeAction, setActiveAction] = useState(null);
  const [doneAction, setDoneAction] = useState(null);

  // Close on outside click or Esc
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 50);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const handleAction = (action) => {
    if (activeAction) return;
    setActiveAction(action.id);
    setTimeout(() => {
      setDoneAction(action.id);
      setActiveAction(null);
      setTimeout(onClose, 1000);
    }, 900);
  };

  const coords = worldPos ? `${worldPos.x.toFixed(1)}, ${worldPos.z.toFixed(1)}` : '—';

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: Math.min(x, window.innerWidth - 200),
        top: Math.min(y, window.innerHeight - 180),
        zIndex: 1000,
        ...panelStyle,
        padding: 0,
        minWidth: 190,
        animation: 'fadeInUp 0.15s ease',
        borderColor: colors.borderFocus,
      }}
    >
      {/* Coord header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <span style={{
          fontFamily: typography.monoFamily,
          fontSize: '11px',
          color: colors.textSecondary,
        }}>
          {coords}
        </span>
      </div>

      {/* Actions */}
      <div style={{ padding: '4px' }}>
        {ACTIONS.map((action) => {
          const loading = activeAction === action.id;
          const done = doneAction === action.id;
          const disabled = !!activeAction && !loading;

          return (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '9px 10px',
                background: loading ? 'rgba(255,255,255,0.03)' : 'transparent',
                border: 'none',
                borderRadius: radii.sm,
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.35 : 1,
                transition: 'background 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                width: 5, height: 5,
                borderRadius: '50%',
                background: done ? colors.safe : action.color,
                opacity: 0.75,
                flexShrink: 0,
              }} />
              <div>
                <div style={{
                  fontFamily: typography.sansFamily,
                  fontSize: typography.sizes.base,
                  color: done ? colors.safe : colors.text,
                  fontWeight: typography.weights.medium,
                  lineHeight: 1,
                }}>
                  {done ? 'Sent' : loading ? '...' : action.label}
                </div>
                <div style={{
                  fontFamily: typography.sansFamily,
                  fontSize: '10px',
                  color: colors.textTertiary,
                  marginTop: '2px',
                }}>
                  {action.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
