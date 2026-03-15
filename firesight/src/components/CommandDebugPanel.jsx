import React, { useState, useEffect, useRef } from 'react';
import { colors, typography, radii } from '../styles/designTokens.js';

// ── Full command reference with roles and descriptions ─────────────────────
const COMMAND_REF = [
  // Overall Strategy
  { category: 'Strategy', cmd: 'strategy offensive', role: 'IC', description: 'All resources attack the fire head-on. Maximum aggression. Used when fire is small or resources are overwhelming.' },
  { category: 'Strategy', cmd: 'strategy defensive', role: 'IC', description: 'Hold existing lines, protect structures. No new fireline construction. Used when fire behavior exceeds suppression capability.' },
  { category: 'Strategy', cmd: 'strategy confine', role: 'IC', description: 'Allow fire to burn within a containment box defined by natural barriers. Minimal direct engagement.' },
  { category: 'Strategy', cmd: 'strategy transition', role: 'IC / Safety', description: 'All crews safely reposition. Temporary hold during strategy change. No one engages fire.' },

  // Attack Mode
  { category: 'Attack Mode', cmd: 'attack direct', role: 'Ops Chief', description: 'Crews work directly at the fire edge. Fastest suppression but highest exposure. Hot, dirty, dangerous.' },
  { category: 'Attack parallel', cmd: 'attack parallel', role: 'Ops Chief', description: 'Fireline built 30-100ft from fire edge. Burnout between line and fire. Balances speed with safety.' },
  { category: 'Attack Mode', cmd: 'attack indirect', role: 'Ops Chief', description: 'Line built far from fire at natural barriers (roads, ridges). Backfire burns fuel between line and main fire.' },

  // Firing Operations
  { category: 'Firing Ops', cmd: 'fire burnout', role: 'Div Supervisor', description: 'Authorized burnout from existing fireline. Low-intensity firing to remove fuel between line and fire edge.' },
  { category: 'Firing Ops', cmd: 'fire backfire', role: 'IC (written approval)', description: 'SAFETY-CRITICAL. Intentional large fire set to draw main fire. High risk — if wind shifts, backfire adds to main fire. Requires IC written authorization.', confirm: true },
  { category: 'Firing Ops', cmd: 'fire cancel', role: 'IC / Safety', description: 'Cancel all firing operations immediately. All ignition devices secured.' },

  // Structure Protection
  { category: 'Structure', cmd: 'struct triage', role: 'Struct Group Sup', description: 'Assess all structures: defensible, marginal, or non-defensible. Spray-paint priority markings. No active protection yet.' },
  { category: 'Structure', cmd: 'struct protect', role: 'Struct Group Sup', description: 'Active structure protection. Engines deploy, foam, gel, sprinklers. Crews stay and defend defensible structures.' },
  { category: 'Structure', cmd: 'struct abandon', role: 'Div Supervisor', description: 'Zone abandoned — all resources withdraw immediately. Structures in this zone are lost. Used when defense is untenable.' },
  { category: 'Structure', cmd: 'struct bump-and-run', role: 'Engine Boss', description: 'Rapid structure prep: quick foam/gel spray, move to next structure. No staying to defend. Used when too many structures for available engines.' },

  // Evacuation
  { category: 'Evacuation', cmd: 'evac advisory [zone]', role: 'IC → LE Liaison', description: 'Voluntary evacuation suggested. Residents advised to prepare. No road closures yet. Media notified.' },
  { category: 'Evacuation', cmd: 'evac warning [zone]', role: 'IC → LE Liaison', description: 'Evacuation imminent. Vulnerable populations (elderly, disabled, livestock) should leave now. Contraflow may activate.' },
  { category: 'Evacuation', cmd: 'evac order [zone]', role: 'IC → Sheriff', description: 'SAFETY-CRITICAL. Mandatory evacuation. Law enforcement goes door-to-door. All roads one-way out. Massive traffic impact.', confirm: true },
  { category: 'Evacuation', cmd: 'evac rescue [zone]', role: 'IC → Sheriff', description: 'SAFETY-CRITICAL. Rescue-only mode — orderly evacuation has failed. Only rescue teams enter zone. Remaining residents shelter in place.', confirm: true },
  { category: 'Evacuation', cmd: 'evac lift [zone]', role: 'IC', description: 'Evacuation lifted for zone. Residents may return. Roads reopen. Damage assessment teams enter.' },

  // Air Operations
  { category: 'Air Ops', cmd: 'air priority head', role: 'Air Ops Branch Dir', description: 'All air resources target fire head. VLAT drops retardant ahead of spread. Helicopters bucket-drop on advancing front.' },
  { category: 'Air Ops', cmd: 'air priority structures', role: 'Air Ops Branch Dir', description: 'Retardant lines around threatened structures. Helicopters water-drop on structure groups. Coordinate with ground engines.' },
  { category: 'Air Ops', cmd: 'air priority flanks', role: 'Air Ops Branch Dir', description: 'Split air force between flanks. Contain lateral spread. Used when head is uncontrollable but flanks can be held.' },
  { category: 'Air Ops', cmd: 'air hold', role: 'IC / Safety', description: 'All aircraft grounded. Used for safety (wind, visibility), airspace conflict (civilian helicopter), or night.' },
  { category: 'Air Ops', cmd: 'air medevac', role: 'Safety Officer', description: 'Helicopter diverted to medical evacuation. Overrides all other air priorities. Trauma flight to nearest burn center.' },

  // Drone Operations
  { category: 'Drones', cmd: 'drone recon', role: 'Plans Chief', description: 'Drone fleet in distributed recon grid. IR + visual mapping. Feed goes to fire behavior analyst for spread prediction.' },
  { category: 'Drones', cmd: 'drone safety', role: 'Safety Officer', description: 'Drones overwatch crew positions. Alert if fire approaches escape routes. Real-time LCES verification from above.' },

  // Resource Management
  { category: 'Resources', cmd: 'crew rotate [resource]', role: 'Ops Chief', description: 'Order crew rotation. Resource completes current assignment then returns to camp. Replacement dispatched from staging.' },
  { category: 'Resources', cmd: 'crew extend [resource]', role: 'IC', description: 'Authorize extended shift beyond 16hr limit. NWCG requires documented justification. Fatigue risk increases dramatically.' },
  { category: 'Resources', cmd: 'mutual aid', role: 'IC → IROC', description: 'Request mutual aid through Interagency Resource Ordering Capability. Regional/national resources dispatched.' },

  // Planning
  { category: 'Planning', cmd: 'iap approve', role: 'IC', description: 'Approve the current Incident Action Plan. All section chiefs briefed. Operational period begins.' },
  { category: 'Planning', cmd: 'night ops approve', role: 'IC', description: 'Authorize night operations. Requires adequate lighting, communications, and safety zones verified. High risk.' },
  { category: 'Planning', cmd: 'night ops cancel', role: 'IC', description: 'Cancel night operations. All crews return to camp at sunset. Only lookouts remain.' },

  // Safety
  { category: 'Safety', cmd: 'safety stop all', role: 'Safety Officer', description: 'SAFETY-CRITICAL. FULL SAFETY STOP. Every crew ceases ALL operations and moves to safety zones. Only for imminent life threat. Bypasses chain of command.', confirm: true },
  { category: 'Safety', cmd: 'safety stop [div]', role: 'Safety Officer', description: 'Safety stop for specific division. Crews in that division cease work and verify LCES. Other divisions continue.' },
  { category: 'Safety', cmd: 'safety resume', role: 'IC', description: 'Clear safety stop. All crews verify escape routes then resume operations.' },
  { category: 'Safety', cmd: 'lces check', role: 'Safety Officer', description: 'Order LCES (Lookouts, Communications, Escape Routes, Safety Zones) verification for all crews. Standard protocol after conditions change.' },
];

const CATEGORIES = [...new Set(COMMAND_REF.map(c => c.category))];

const CAT_COLORS = {
  'Strategy': '#A78BFA',
  'Attack Mode': '#F59E0B',
  'Firing Ops': '#EF4444',
  'Structure': '#F97316',
  'Evacuation': '#22D3EE',
  'Air Ops': '#60A5FA',
  'Drones': '#818CF8',
  'Resources': '#34D399',
  'Planning': '#A3A3A3',
  'Safety': '#EF4444',
};

export default function CommandDebugPanel() {
  const [lastCommand, setLastCommand] = useState(null);
  const [commandLog, setCommandLog] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [filter, setFilter] = useState('all');
  const [connected, setConnected] = useState(false);
  const tooltipRef = useRef(null);

  // Subscribe to SSE for real-time command updates
  useEffect(() => {
    let es;
    try {
      es = new EventSource('http://localhost:3001/api/strategy/stream');
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);

      es.addEventListener('command', (ev) => {
        const data = JSON.parse(ev.data);
        setLastCommand(data.command);
        setCommandLog(prev => [{
          command: data.command,
          source: data.source,
          commander: data.commander,
          time: new Date().toLocaleTimeString(),
          confirmed: data.confirmed,
        }, ...prev].slice(0, 50));
      });

      es.addEventListener('reset', () => {
        setLastCommand('RESET');
        setCommandLog(prev => [{
          command: 'strategy reset',
          source: 'system',
          time: new Date().toLocaleTimeString(),
        }, ...prev].slice(0, 50));
      });

      // Init event
      es.onmessage = (ev) => {
        // default event
      };
    } catch (e) {
      console.warn('SSE connect failed:', e);
    }
    return () => es?.close();
  }, []);

  const filteredCmds = filter === 'all'
    ? COMMAND_REF
    : COMMAND_REF.filter(c => c.category === filter);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 380, height: '100vh',
      background: '#0A0D11', borderLeft: `1px solid ${colors.border}`,
      display: 'flex', flexDirection: 'column', zIndex: 9999,
      fontFamily: typography.monoFamily, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px 10px', borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: connected ? '#22C55E' : '#EF4444',
          boxShadow: connected ? '0 0 8px #22C55E' : '0 0 8px #EF4444',
        }} />
        <span style={{
          fontSize: 9, color: '#64748B', letterSpacing: 1.5,
          textTransform: 'uppercase', fontWeight: 700,
        }}>OPENCLAW COMMAND DEBUG</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 8, color: connected ? '#22C55E' : '#EF4444',
          letterSpacing: 0.5,
        }}>{connected ? 'SSE LIVE' : 'DISCONNECTED'}</span>
      </div>

      {/* Last Command Highlight */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
        background: lastCommand ? 'rgba(167,139,250,0.06)' : 'transparent',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 8, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>
          LAST COMMAND FROM BOT
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
          color: lastCommand ? '#A78BFA' : '#334155',
        }}>
          {lastCommand || 'Waiting for Telegram command...'}
        </div>
        {commandLog.length > 0 && (
          <div style={{ fontSize: 8, color: '#475569', marginTop: 3 }}>
            via {commandLog[0]?.source || '?'} at {commandLog[0]?.time}
            {commandLog[0]?.confirmed && <span style={{ color: '#EF4444', marginLeft: 6 }}>CONFIRMED</span>}
          </div>
        )}
      </div>

      {/* Recent Command Log */}
      {commandLog.length > 0 && (
        <div style={{
          padding: '8px 14px', borderBottom: `1px solid ${colors.border}`,
          maxHeight: 100, overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{ fontSize: 8, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>
            COMMAND HISTORY ({commandLog.length})
          </div>
          {commandLog.slice(0, 8).map((entry, i) => (
            <div key={i} style={{
              fontSize: 9, padding: '2px 0', display: 'flex', gap: 6,
              color: i === 0 ? '#A78BFA' : '#475569',
              borderLeft: i === 0 ? '2px solid #A78BFA' : '2px solid transparent',
              paddingLeft: 6,
            }}>
              <span style={{ color: '#334155', width: 52, flexShrink: 0 }}>{entry.time}</span>
              <span style={{ fontWeight: i === 0 ? 700 : 400 }}>{entry.command}</span>
            </div>
          ))}
        </div>
      )}

      {/* Category Filter */}
      <div style={{
        padding: '8px 14px 6px', borderBottom: `1px solid ${colors.border}`,
        display: 'flex', flexWrap: 'wrap', gap: 3, flexShrink: 0,
      }}>
        <FilterBtn label="ALL" active={filter === 'all'} color="#64748B" onClick={() => setFilter('all')} />
        {CATEGORIES.map(cat => (
          <FilterBtn
            key={cat}
            label={cat.toUpperCase()}
            active={filter === cat}
            color={CAT_COLORS[cat]}
            onClick={() => setFilter(filter === cat ? 'all' : cat)}
          />
        ))}
      </div>

      {/* Command List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filteredCmds.map((cmd, i) => {
          const isActive = lastCommand === cmd.cmd || lastCommand === cmd.cmd.split(' [')[0];
          const catColor = CAT_COLORS[cmd.category] || '#64748B';

          return (
            <div
              key={i}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({ cmd, x: rect.left - 320, y: rect.top });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                padding: '6px 14px',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'default',
                background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                borderLeft: isActive ? '3px solid #A78BFA' : '3px solid transparent',
                borderBottom: `1px solid ${colors.borderSubtle}`,
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = isActive ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.02)'}
              onMouseOut={(e) => e.currentTarget.style.background = isActive ? 'rgba(167,139,250,0.12)' : 'transparent'}
            >
              {/* Active indicator */}
              <div style={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: isActive ? '#A78BFA' : 'transparent',
                border: `1px solid ${isActive ? '#A78BFA' : '#1E2636'}`,
                boxShadow: isActive ? '0 0 8px #A78BFA' : 'none',
              }} />

              {/* Command name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                  color: isActive ? '#A78BFA' : '#94A3B8',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {cmd.cmd}
                </div>
              </div>

              {/* Role badge */}
              <div style={{
                fontSize: 7, letterSpacing: 0.5,
                color: catColor, opacity: 0.8,
                background: `${catColor}15`,
                border: `1px solid ${catColor}30`,
                padding: '1px 5px', borderRadius: 3,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {cmd.role}
              </div>

              {/* Confirm badge */}
              {cmd.confirm && (
                <div style={{
                  fontSize: 7, letterSpacing: 0.5,
                  color: '#EF4444',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  padding: '1px 4px', borderRadius: 3,
                  flexShrink: 0,
                }}>
                  CONFIRM
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: Math.max(10, tooltip.x),
          top: Math.min(tooltip.y, window.innerHeight - 140),
          width: 300, padding: '10px 12px',
          background: '#151920', border: `1px solid ${colors.border}`,
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 10000, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#D4DAE3', marginBottom: 4, letterSpacing: 0.5 }}>
            {tooltip.cmd.cmd}
          </div>
          <div style={{
            fontSize: 8, color: CAT_COLORS[tooltip.cmd.category] || '#64748B',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
          }}>
            {tooltip.cmd.category} — {tooltip.cmd.role}
          </div>
          <div style={{
            fontSize: 10, color: '#94A3B8', lineHeight: 1.5,
            fontFamily: typography.sansFamily,
          }}>
            {tooltip.cmd.description}
          </div>
          {tooltip.cmd.confirm && (
            <div style={{
              fontSize: 9, color: '#EF4444', marginTop: 6,
              padding: '3px 6px', background: 'rgba(239,68,68,0.08)',
              borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)',
            }}>
              Requires explicit confirmation before execution
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 7, letterSpacing: 0.8, fontWeight: 700,
      fontFamily: typography.monoFamily,
      color: active ? color : '#475569',
      background: active ? `${color}18` : 'transparent',
      border: `1px solid ${active ? `${color}40` : '#1E2636'}`,
      borderRadius: 3, padding: '2px 6px', cursor: 'pointer',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}
