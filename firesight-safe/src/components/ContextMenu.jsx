import React, { useEffect, useRef, useState } from 'react';
import { colors, typography, radii, panelStyle } from '../styles/designTokens.js';

// ─── Action icons (14×14, crisp monochrome) ──────────────────────────────────
function DroneMenuIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="1.6" stroke={color} strokeWidth="1.1" />
      <line x1="7" y1="1.5" x2="7" y2="5.4" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="7" y1="8.6" x2="7" y2="12.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="1.5" y1="7" x2="5.4" y2="7" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="8.6" y1="7" x2="12.5" y2="7" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <circle cx="7" cy="1.5" r="1" stroke={color} strokeWidth="0.8" />
      <circle cx="7" cy="12.5" r="1" stroke={color} strokeWidth="0.8" />
      <circle cx="1.5" cy="7" r="1" stroke={color} strokeWidth="0.8" />
      <circle cx="12.5" cy="7" r="1" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

function EvacMenuIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 11 L7 5 L10 7.5 L12 3" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 3 L12 3 L12 4.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="3" cy="11" r="1.2" stroke={color} strokeWidth="0.9" />
    </svg>
  );
}

function CrewMenuIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="3.5" r="2" stroke={color} strokeWidth="1.1" />
      <path d="M2.5 12.5 C2.5 9.5 4.5 7.5 7 7.5 C9.5 7.5 11.5 9.5 11.5 12.5" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 7.5 L5.5 10 L11 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ACTION_ICONS = {
  drone: DroneMenuIcon,
  evac: EvacMenuIcon,
  crew: CrewMenuIcon,
};

const ACTIONS = [
  { id: 'drone', label: 'Send Drone', desc: 'Deploy UAV recon', color: colors.accent },
  { id: 'evac', label: 'Check Evac Route', desc: 'Nearest clear path', color: colors.statusOk },
  { id: 'crew', label: 'Deploy Crew', desc: 'Assign ground team', color: colors.fireOneHour },
];

const DONE_LABELS = {
  drone: 'Drone Deployed',
  evac: 'Route Checked',
  crew: 'Crew Assigned',
};

export default function ContextMenu({ x, y, worldPos, onClose, onPlaceUnit }) {
  const menuRef = useRef(null);
  const [activeAction, setActiveAction] = useState(null);
  const [doneActions, setDoneActions] = useState(new Set());

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
    if (activeAction || doneActions.has(action.id)) return;
    setActiveAction(action.id);
    setTimeout(() => {
      setDoneActions(prev => new Set(prev).add(action.id));
      setActiveAction(null);
      // Place the unit on the map
      onPlaceUnit?.(action.id, worldPos);
    }, 900);
  };

  const coords = worldPos ? `${worldPos.x.toFixed(1)}, ${worldPos.z.toFixed(1)}` : '—';

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        left: Math.min(x, 1440 - 220),
        top: Math.min(y, 900 - 200),
        zIndex: 1000,
        ...panelStyle,
        padding: 0,
        minWidth: 200,
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
          const done = doneActions.has(action.id);
          const disabled = (!!activeAction && !loading) || done;
          const Icon = ACTION_ICONS[action.id];

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
                opacity: disabled && !done ? 0.35 : 1,
                transition: 'background 0.15s, opacity 0.3s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Icon */}
              <div style={{
                width: 28, height: 28,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: done
                  ? `${action.color}15`
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? `${action.color}30` : colors.border}`,
                flexShrink: 0,
                transition: 'all 0.3s ease',
              }}>
                {done
                  ? <CheckIcon color={action.color} />
                  : loading
                    ? <LoadingSpinner color={action.color} />
                    : <Icon color={done ? action.color : colors.textSecondary} />
                }
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: typography.sansFamily,
                  fontSize: typography.sizes.base,
                  color: done ? action.color : colors.text,
                  fontWeight: typography.weights.medium,
                  lineHeight: 1,
                  transition: 'color 0.3s ease',
                }}>
                  {done ? DONE_LABELS[action.id] : action.label}
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

function LoadingSpinner({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, animation: 'spin 0.8s linear infinite' }}>
      <circle cx="7" cy="7" r="5" stroke={color} strokeWidth="1.5" fill="none" strokeDasharray="20 12" strokeLinecap="round" />
    </svg>
  );
}
