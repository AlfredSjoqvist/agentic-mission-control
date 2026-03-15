import React, { useState, useEffect, useRef } from 'react';
import { DEFAULT_STRATEGY, PHONE_COMMANDS } from '../strategyBehaviors.js';
import { typography, colors } from '../styles/designTokens.js';

// Strategy action groups — each has a label, key in strategy state, and options
const STRATEGY_GROUPS = [
  {
    label: 'OVERALL POSTURE',
    key: 'posture',
    options: [
      { value: 'offensive', label: 'Offensive', desc: 'Full suppression, push crews to fireline', cmd: 'strategy offensive' },
      { value: 'defensive', label: 'Defensive', desc: 'Protect structures, hold perimeter', cmd: 'strategy defensive' },
      { value: 'confine', label: 'Confine', desc: 'Let fire burn to natural barriers', cmd: 'strategy confine' },
      { value: 'transition', label: 'Transition', desc: 'Shifting posture, mixed tactics', cmd: 'strategy transition' },
    ],
  },
  {
    label: 'ATTACK MODE',
    key: 'attackMode',
    options: [
      { value: 'direct', label: 'Direct Attack', desc: 'Crews at fire edge, hose & hand tools', cmd: 'attack direct' },
      { value: 'parallel', label: 'Parallel Attack', desc: 'Line built close to but off the edge', cmd: 'attack parallel' },
      { value: 'indirect', label: 'Indirect Attack', desc: 'Line far ahead, burnout between', cmd: 'attack indirect' },
    ],
  },
  {
    label: 'FIRING OPS',
    key: 'firingAuth',
    options: [
      { value: 'none', label: 'No Firing', desc: 'No burnout or backfire authorized', cmd: 'fire cancel' },
      { value: 'burnout', label: 'Burnout', desc: 'Burn between line and fire edge', cmd: 'fire burnout' },
      { value: 'backfire', label: 'Backfire', desc: 'Large-scale counterfire (IC auth)', cmd: 'fire backfire', confirm: true },
    ],
  },
  {
    label: 'STRUCTURE PROTECTION',
    key: 'structMode',
    options: [
      { value: 'triage', label: 'Triage', desc: 'Assess & prioritize defensible structures', cmd: 'struct triage' },
      { value: 'protect', label: 'Protect All', desc: 'Defend every structure possible', cmd: 'struct protect' },
      { value: 'bump-and-run', label: 'Bump & Run', desc: 'Quick prep, move to next structure', cmd: 'struct bump-and-run' },
      { value: 'abandon', label: 'Abandon', desc: 'Pull back, structures not defensible', cmd: 'struct abandon' },
    ],
  },
  {
    label: 'AIR OPERATIONS',
    key: 'airPriority',
    options: [
      { value: 'head', label: 'Attack Head', desc: 'All air on fire head to slow spread', cmd: 'air priority head' },
      { value: 'structures', label: 'Structures', desc: 'Air drops on threatened structures', cmd: 'air priority structures' },
      { value: 'flanks', label: 'Flanks', desc: 'Suppress flanks to narrow perimeter', cmd: 'air priority flanks' },
      { value: 'hold', label: 'Hold / RTB', desc: 'Air ops paused or returning to base', cmd: 'air hold' },
    ],
  },
  {
    label: 'DRONE MODE',
    key: 'droneMode',
    options: [
      { value: 'recon', label: 'Recon', desc: 'Mapping, IR scanning, perimeter tracking', cmd: 'drone recon' },
      { value: 'safety', label: 'Safety Watch', desc: 'Monitor crews, detect entrapment risk', cmd: 'drone safety' },
    ],
  },
  {
    label: 'SAFETY',
    key: 'safetyStop',
    options: [
      { value: 'none', label: 'Normal Ops', desc: 'Standard safety protocols', cmd: 'safety resume' },
      { value: 'all', label: 'SAFETY STOP', desc: 'All operations halt immediately', cmd: 'safety stop all', confirm: true, danger: true },
    ],
  },
  {
    label: 'NIGHT OPS',
    key: 'opsNight',
    options: [
      { value: false, label: 'Day Only', desc: 'No night operations', cmd: 'night ops cancel' },
      { value: true, label: 'Night Authorized', desc: 'Crews cleared for night operations', cmd: 'night ops approve' },
    ],
  },
];

const POSTURE_COLORS = {
  offensive: '#EF4444',
  defensive: '#FBBF24',
  confine: '#22D3EE',
  transition: '#A78BFA',
};

export default function StrategyPanel({ strategy, onStrategyChange, sseUrl }) {
  const [expanded, setExpanded] = useState({});
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [sseLog, setSseLog] = useState([]);
  const sseRef = useRef(null);

  // SSE listener for OpenClaw commands
  useEffect(() => {
    if (!sseUrl) return;
    const es = new EventSource(sseUrl);
    es.addEventListener('strategy_change', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.changes) {
          onStrategyChange(data.changes);
          setSseLog(prev => [{
            time: new Date().toLocaleTimeString(),
            cmd: data.command || 'remote',
            source: 'O. Claw',
          }, ...prev].slice(0, 20));
        }
      } catch {}
    });
    sseRef.current = es;
    return () => es.close();
  }, [sseUrl, onStrategyChange]);

  // Also listen for postMessage strategy changes (from server or other sources)
  useEffect(() => {
    function onMsg(ev) {
      if (ev.data?.type === 'strategy_change' && ev.data.changes) {
        onStrategyChange(ev.data.changes);
        setSseLog(prev => [{
          time: new Date().toLocaleTimeString(),
          cmd: ev.data.command || 'remote',
          source: ev.data.source || 'O. Claw',
        }, ...prev].slice(0, 20));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onStrategyChange]);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const selectOption = (group, option) => {
    if (option.confirm && !pendingConfirm) {
      setPendingConfirm({ group, option });
      return;
    }
    setPendingConfirm(null);
    const changes = {};
    // Handle boolean keys
    if (typeof option.value === 'boolean') {
      changes[group.key] = option.value;
    } else {
      changes[group.key] = option.value;
    }
    // Special cases from PHONE_COMMANDS
    if (option.cmd === 'fire backfire') changes.firingApprovedBy = 'ic';
    if (option.cmd === 'fire cancel') changes.firingTarget = null;
    if (option.cmd === 'safety stop all') changes.lcesRequired = true;
    if (option.cmd === 'safety resume') changes.lcesRequired = false;

    onStrategyChange(changes);
  };

  const postureColor = POSTURE_COLORS[strategy.posture] || '#64748B';

  return (
    <div style={{
      width: 240, height: '100%', background: 'rgba(10,14,22,0.95)',
      borderRight: `1px solid ${colors.border}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: typography.monoFamily, fontSize: 9,
      backdropFilter: 'blur(12px)',
    }}>
      {/* IC Badge */}
      <div style={{
        padding: '10px 12px 8px', borderBottom: `1px solid ${colors.border}`,
        background: 'rgba(167,139,250,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${postureColor}30, ${postureColor}10)`,
            border: `1.5px solid ${postureColor}60`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>🦞</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#E2E8F0', letterSpacing: 0.5 }}>
              INCIDENT COMMANDER
            </div>
            <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginTop: 1 }}>
              O. Claw
            </div>
          </div>
        </div>
        {/* Current posture badge */}
        <div style={{
          marginTop: 8, padding: '3px 8px', borderRadius: 3,
          background: postureColor + '18', border: `1px solid ${postureColor}40`,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: postureColor, boxShadow: `0 0 6px ${postureColor}` }} />
          <span style={{ fontSize: 8, fontWeight: 700, color: postureColor, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {strategy.posture}
          </span>
        </div>
      </div>

      {/* Strategy Groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {STRATEGY_GROUPS.map(group => {
          const isOpen = expanded[group.key] !== false; // default open
          const currentVal = strategy[group.key];
          const currentOpt = group.options.find(o => o.value === currentVal);

          return (
            <div key={group.key} style={{ borderBottom: `1px solid ${colors.border}08` }}>
              {/* Group header */}
              <div
                onClick={() => toggle(group.key)}
                style={{
                  padding: '6px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{
                  fontSize: 7, color: '#475569', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)',
                  transition: 'transform 0.15s', display: 'inline-block',
                }}>▶</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#64748B', letterSpacing: 1.2, flex: 1 }}>
                  {group.label}
                </span>
                <span style={{
                  fontSize: 7, color: currentOpt ? '#94A3B8' : '#334155',
                  maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {currentOpt?.label || '—'}
                </span>
              </div>

              {/* Options */}
              {isOpen && (
                <div style={{ padding: '2px 8px 6px 20px' }}>
                  {group.options.map(opt => {
                    const isActive = currentVal === opt.value;
                    const isDanger = opt.danger;
                    const accent = isDanger ? '#EF4444' : isActive ? '#A78BFA' : '#475569';
                    const isPending = pendingConfirm?.option === opt;

                    return (
                      <div
                        key={String(opt.value)}
                        onClick={() => selectOption(group, opt)}
                        style={{
                          padding: '4px 8px', marginBottom: 2, borderRadius: 3, cursor: 'pointer',
                          background: isActive ? accent + '15' : isPending ? '#EF444420' : 'transparent',
                          border: `1px solid ${isActive ? accent + '40' : 'transparent'}`,
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: isActive ? accent : 'transparent',
                            border: `1.5px solid ${isActive ? accent : '#334155'}`,
                            boxShadow: isActive ? `0 0 4px ${accent}` : 'none',
                          }} />
                          <span style={{
                            fontSize: 9, fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#E2E8F0' : isDanger ? '#EF4444' : '#94A3B8',
                          }}>
                            {opt.label}
                          </span>
                          {isPending && (
                            <span style={{
                              fontSize: 7, color: '#EF4444', fontWeight: 700,
                              background: '#EF444420', padding: '1px 4px', borderRadius: 2,
                              marginLeft: 'auto',
                            }}>CONFIRM?</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 7, color: '#475569', marginTop: 1, paddingLeft: 11,
                          lineHeight: '10px',
                        }}>
                          {opt.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent commands from O. Claw */}
      {sseLog.length > 0 && (
        <div style={{
          borderTop: `1px solid ${colors.border}`, padding: '4px 8px',
          maxHeight: 80, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 7, color: '#475569', letterSpacing: 1, marginBottom: 3, fontWeight: 700 }}>
            REMOTE COMMANDS
          </div>
          {sseLog.map((e, i) => (
            <div key={i} style={{ fontSize: 7, color: '#64748B', lineHeight: '11px' }}>
              <span style={{ color: '#334155' }}>{e.time}</span>{' '}
              <span style={{ color: '#A78BFA' }}>{e.source}</span>{' → '}
              <span style={{ color: '#94A3B8' }}>{e.cmd}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
