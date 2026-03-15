import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import TerrainScene from './components/TerrainScene.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import StrategyPanel from './components/StrategyPanel.jsx';
import { colors, typography, radii } from './styles/designTokens.js';
import { createPalisadesScenario } from './fireSpreadEngine.js';
import { ICSEngine } from './icsEngine.js';
import { DEFAULT_STRATEGY } from './strategyBehaviors.js';
import { useVoiceControl, VoiceHint, VoiceToast } from './components/VoiceControl.jsx';

const TW = 1440;
const TH = 900;
const DRONE_VIEW_URL = typeof __DRONE_VIEW_URL__ !== 'undefined' ? __DRONE_VIEW_URL__ : 'http://localhost:5176';

const TYPE_COLORS = {
  command: '#FBBF24', intel: '#22D3EE', coord: '#34D399', ai: '#F472B6', safety: '#EF4444',
};

export default function App() {
  const [tab, setTab] = useState('map');
  const [contextMenu, setContextMenu] = useState(null);
  const [simulationMode, setSimulationMode] = useState(false);
  const [commsLog, setCommsLog] = useState([]);
  const logIdRef = useRef(0);
  const [highlightedNode, setHighlightedNode] = useState(null);
  const droneViewRef = useRef(null);
  const [strategy, setStrategy] = useState({ ...DEFAULT_STRATEGY });
  const [showStrategy, setShowStrategy] = useState(true);

  // Voice control — hold V to talk
  const handleStrategyChangeRef = useRef(null);
  const { status: voiceStatus, toast: voiceToast } = useVoiceControl({
    onStrategyChange: useCallback((changes) => {
      handleStrategyChangeRef.current?.(changes);
    }, []),
  });

  const handleStrategyChange = useCallback((changes) => {
    setStrategy(prev => {
      const next = { ...prev, ...changes };
      // Broadcast to TerrainScene and 3D view
      window.postMessage({ type: 'strategy_update', strategy: next, changes }, '*');
      // Forward to 3D iframe
      const iframe = droneViewRef.current;
      if (iframe?.contentWindow) {
        try { iframe.contentWindow.postMessage({ type: 'strategy_update', strategy: next, changes }, '*'); } catch {}
      }
      // Log to comms
      const desc = Object.entries(changes).map(([k, v]) => `${k}: ${v}`).join(', ');
      setCommsLog(prev => [{
        id: ++logIdRef.current,
        from: 'IC', to: 'ALL',
        msg: `STRATEGY UPDATE — ${desc}`,
        msgType: 'command', time: new Date().toLocaleTimeString(), isDecision: true,
      }, ...prev].slice(0, 200));
      return next;
    });
  }, []);
  handleStrategyChangeRef.current = handleStrategyChange;

  // Listen for ALL messages from ICS graph iframe, drone-view iframe, and TerrainScene
  useEffect(() => {
    function onMsg(ev) {
      if (!ev.data) return;
      // ICS agent messages → comms log
      if (ev.data.type === 'ics_message_batch' && ev.data.messages) {
        const entries = ev.data.messages.map(m => ({
          id: ++logIdRef.current,
          from: m.from, to: m.to, fromId: m.fromId, toId: m.toId,
          msg: m.msg, msgType: m.type, time: m.t,
        }));
        setCommsLog(prev => [...entries, ...prev].slice(0, 200));
      }
      // ICS graph hover → highlight on map
      if (ev.data.type === 'ics_hover') {
        setHighlightedNode(ev.data.nodeId || null);
      }
      // IC decisions
      if (ev.data.type === 'ic_decision_prompt') {
        setCommsLog(prev => [{
          id: ++logIdRef.current,
          from: ev.data.from, to: 'IC',
          msg: 'DECISION REQUIRED: ' + ev.data.title,
          msgType: 'safety', time: ev.data.simTime, isDecision: true,
        }, ...prev].slice(0, 200));
      }
      if (ev.data.type === 'ic_decision_resolved') {
        setCommsLog(prev => [{
          id: ++logIdRef.current,
          from: 'IC', to: 'ALL',
          msg: 'DECIDED: ' + ev.data.choice,
          msgType: 'command', time: '', isDecision: true,
        }, ...prev].slice(0, 200));
      }
      // Map-side events (fire detection, dispatch, evacuation, etc.)
      if (ev.data.type === 'map_event') {
        setCommsLog(prev => [{
          id: ++logIdRef.current,
          from: ev.data.from, to: 'ALL',
          msg: ev.data.msg, msgType: ev.data.msgType || 'ai',
          time: '', isMapEvent: true,
        }, ...prev].slice(0, 200));
      }
      // === Manual position update from 3D → forward to TerrainScene ===
      if (ev.data.type === 'manual_position_update') {
        window.postMessage(ev.data, '*');
      }
      // === Toggle strategy panel from 3D iframe ===
      if (ev.data.type === 'toggle_strategy') {
        setShowStrategy(s => !s);
      }
      // === Tab switch from 3D iframe ===
      if (ev.data.type === 'tab_switch' && ev.data.key) {
        if (ev.data.key === '1') setTab('3d');
        else if (ev.data.key === '2') setTab('map');
        else if (ev.data.key === '3') setTab('command');
      }
      // === BRIDGE: fire_ignite from 3D → forward to TerrainScene ===
      if (ev.data.type === 'fire_ignite_from_3d') {
        // TerrainScene listens for this on window
        window.postMessage({ type: 'fire_ignite', lat: ev.data.lat, lng: ev.data.lng }, '*');
      }
      // === BRIDGE: fire_ignite from 2D TerrainScene → forward to 3D iframe ===
      if (ev.data.type === 'fire_ignite_to_3d') {
        const iframe = droneViewRef.current;
        console.log('[App BRIDGE] fire_ignite_to_3d received, lat:', ev.data.lat, 'lng:', ev.data.lng, 'iframe:', !!iframe, 'contentWindow:', !!iframe?.contentWindow);
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'fire_ignite', lat: ev.data.lat, lng: ev.data.lng }, '*');
          console.log('[App BRIDGE] forwarded fire_ignite to 3D iframe');
        }
      }
      // === BRIDGE: mount_vehicle from 2D → switch to 3D tab + enter FPV ===
      if (ev.data.type === 'mount_vehicle' && ev.data.vehicleId) {
        setTab('3d');
        // Small delay so the 3D iframe becomes visible/interactive before we send enter_fpv
        setTimeout(() => {
          const iframe = droneViewRef.current;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'enter_fpv', vehicleId: ev.data.vehicleId }, '*');
          }
        }, 300);
      }
      // === BRIDGE: minimap snapshot from TerrainScene → forward to 3D iframe ===
      if (ev.data.type === 'minimap_snapshot' && ev.source === window) {
        const iframe = droneViewRef.current;
        if (iframe?.contentWindow) {
          try { iframe.contentWindow.postMessage(ev.data, '*'); } catch(e) {}
        }
      }
      // === BRIDGE: unit_positions from TerrainScene → forward to 3D iframe ===
      if (ev.data.type === 'unit_positions' && ev.source === window) {
        const iframe = droneViewRef.current;
        if (iframe?.contentWindow) {
          try {
            iframe.contentWindow.postMessage(ev.data, '*');
          } catch (e) {
            console.warn('[App] postMessage to iframe failed:', e.message);
          }
        } else {
          console.warn('[App] unit_positions: iframe ref not ready');
        }
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const handleMapHover = useCallback((nodeId) => {
    setHighlightedNode(nodeId);
    const iframe = document.querySelector('iframe[title="ICS Command Chain"]');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'map_hover', nodeId }, '*');
    }
  }, []);

  const icsEngineRef = useRef(null);
  if (!icsEngineRef.current) icsEngineRef.current = new ICSEngine();

  const [liveData, setLiveData] = useState(null);
  const [activeLayers, setActiveLayers] = useState({
    fireSpread: true, wind: false, slope: false, embers: false,
  });
  const [projections, setProjections] = useState(null);
  const timeSlot = 0;
  const currentFireData = useMemo(() => projections?.now || null, [projections]);

  const handleTerrainClick = useCallback((info) => {
    if (info) {
      setContextMenu({ ...info, screenX: info.screenX, screenY: info.screenY });
    }
  }, []);
  const closeMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    function onKey(ev) {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
      if (ev.key === 'Tab') {
        ev.preventDefault();
        setTab(t => {
          const next = t === '3d' ? 'map' : t === 'map' ? 'command' : '3d';
          if (next === '3d') setTimeout(() => { const iframe = droneViewRef.current; if (iframe) { iframe.focus(); iframe.contentWindow?.postMessage({ type: 'request_pointer_lock' }, '*'); } }, 50);
          return next;
        });
      }
      else if (ev.key === '1') { setTab('3d'); setTimeout(() => { const iframe = droneViewRef.current; if (iframe) { iframe.focus(); iframe.contentWindow?.postMessage({ type: 'request_pointer_lock' }, '*'); } }, 50); }
      else if (ev.key === '2') setTab('map');
      else if (ev.key === '3') setTab('command');
      else if (ev.key.toLowerCase() === 'z') setShowStrategy(s => !s); // Z still toggles via keyboard
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isMap = tab === 'map';
  const isCmd = tab === 'command';
  const is3d = tab === '3d';

  const PANEL_W = 240;
  const panelVisible = (isMap || is3d) && showStrategy;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: colors.bg, display: 'flex' }}>
      {/* Main content area — fills everything left of the strategy panel */}
      <div style={{ flex: 1, position: 'relative', height: '100vh', overflow: 'hidden' }}>

        {/* Tab Switcher — always on top, centered in content area */}
        <div enable-xr="" style={{
          position: 'absolute', top: 8,
          left: '50%',
          transform: 'translateX(-50%) translateZ(40px)',
          zIndex: 300, display: 'flex', gap: 2,
          background: 'rgba(10,14,22,0.85)', borderRadius: 6,
          border: `1px solid ${colors.border}`, padding: 2,
          backdropFilter: 'blur(12px)',
        }}>
          <TabBtn active={is3d} onClick={() => { setTab('3d'); setTimeout(() => { const iframe = droneViewRef.current; if (iframe) { iframe.focus(); iframe.contentWindow?.postMessage({ type: 'request_pointer_lock' }, '*'); } }, 50); }} label="3D VIEW" shortcut="1" />
          <TabBtn active={isMap} onClick={() => setTab('map')} label="MAP" shortcut="2" />
          <TabBtn active={isCmd} onClick={() => setTab('command')} label="COMMAND" shortcut="3" />
        </div>

        {/* === 3D VIEW: drone-view iframe (always mounted, visibility toggled) === */}
        <iframe
          ref={droneViewRef}
          src={DRONE_VIEW_URL}
          title="3D Drone View"
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            border: 'none',
            zIndex: is3d ? 200 : -1,
            opacity: is3d ? 1 : 0,
            pointerEvents: is3d ? 'auto' : 'none',
          }}
        />

        {/* TerrainScene — 2D map (fills content area on map tab, small inset on command tab) */}
        <div enable-xr="" style={{
          position: 'absolute',
          top: 0, left: 0,
          width: isMap ? '100%' : isCmd ? '34%' : '100%',
          height: isMap ? '100%' : isCmd ? '50%' : '100%',
          ...(isCmd ? { left: 'auto', right: 0, top: 0 } : {}),
          overflow: 'hidden', transition: 'all 0.3s ease',
          zIndex: isMap ? 1 : is3d ? -2 : 10,
          border: isMap || is3d ? 'none' : `1px solid ${colors.border}`,
          opacity: is3d ? 0 : 1,
          pointerEvents: is3d ? 'none' : 'auto',
          transform: isCmd ? 'translateZ(15px)' : undefined,
        }}>
          <TerrainScene
            timeSlot={timeSlot}
            onTerrainClick={isMap ? handleTerrainClick : () => {}}
            simulationMode={simulationMode}
            activeLayers={activeLayers}
            swarmActive={false} evacActive={false} deployActive={false}
            fireData={currentFireData}
            icsEngine={icsEngineRef.current}
            onLiveData={setLiveData}
            highlightedNode={highlightedNode}
            onNodeHover={handleMapHover}
            strategy={strategy}
          />
          {isCmd && (
            <div style={{
              position: 'absolute', top: 6, left: 8, zIndex: 5,
              fontSize: 8, color: '#64748B', fontFamily: typography.monoFamily,
              letterSpacing: 1, textTransform: 'uppercase',
              background: 'rgba(10,14,22,0.7)', padding: '2px 6px', borderRadius: 3,
              pointerEvents: 'none',
            }}>SITUATION MAP</div>
          )}
        </div>

        {contextMenu && isMap && (
          <ContextMenu x={contextMenu.screenX + 14} y={contextMenu.screenY - 6}
            worldPos={contextMenu.worldPos} onClose={closeMenu} />
        )}

        {/* Command View */}
        {isCmd && (
          <>
            <div enable-xr="" style={{
              position: 'absolute', top: 0, left: 0,
              width: '66%', height: '100%',
              overflow: 'hidden', borderRight: `1px solid ${colors.border}`, zIndex: 5,
              transform: 'translateZ(10px)',
            }}>
              <iframe src="/ics-graph.html"
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="ICS Command Chain" />
            </div>

            {/* Bottom-right: Comms Log */}
            <div enable-xr="" style={{
              position: 'absolute',
              top: '50%', right: 0,
              width: '34%', height: '50%',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              background: 'rgba(10,14,22,0.95)',
              borderTop: `1px solid ${colors.border}`, zIndex: 10,
              transform: 'translateZ(20px)',
            }}>
              <CommsLogPanel entries={commsLog} />
            </div>
          </>
        )}
      </div>

      {/* Voice control UI */}
      <VoiceToast toast={voiceToast} />
      <VoiceHint status={voiceStatus} />

      {/* Strategy Panel — RIGHT sidebar (outside the content area) */}
      {(isMap || is3d) && showStrategy && (
        <div enable-xr="" style={{
          width: PANEL_W, height: '100vh', flexShrink: 0,
          zIndex: 250, transform: 'translateZ(30px)',
        }}>
          <StrategyPanel
            strategy={strategy}
            onStrategyChange={handleStrategyChange}
            sseUrl="/api/strategy/stream"
          />
        </div>
      )}

    </div>
  );
}

function TabBtn({ active, onClick, label, shortcut }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(167,139,250,0.15)' : 'transparent',
      border: 'none', borderRadius: 4, padding: '5px 16px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: active ? '#A78BFA' : '#64748B',
        fontFamily: typography.monoFamily, letterSpacing: 1,
      }}>{label}</span>
      <span style={{
        fontSize: 8, color: active ? '#7C3AED' : '#334155', fontFamily: typography.monoFamily,
        background: active ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)',
        padding: '1px 4px', borderRadius: 2, border: `1px solid ${active ? '#7C3AED40' : '#1E2636'}`,
      }}>{shortcut}</span>
    </button>
  );
}

function CommsLogPanel({ entries }) {
  return (
    <>
      <div style={{
        padding: '6px 10px 4px', borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: entries.length > 0 ? '#22D3EE' : '#334155',
          boxShadow: entries.length > 0 ? '0 0 6px #22D3EE' : 'none',
        }} />
        <span style={{
          fontSize: 8, color: '#64748B', fontFamily: typography.monoFamily,
          letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700,
        }}>ICS COMMS LOG</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 7, color: '#334155', fontFamily: typography.monoFamily }}>
          {entries.length} msgs
        </span>
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '2px 4px',
        fontFamily: typography.monoFamily, fontSize: 8,
      }}>
        {entries.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 24,
            fontSize: 9, color: '#1E2636', fontFamily: typography.sansFamily,
          }}>Waiting for ICS traffic...</div>
        )}
        {entries.map(e => <CommsLine key={e.id} entry={e} />)}
      </div>
    </>
  );
}

function CommsLine({ entry }) {
  const c = TYPE_COLORS[entry.msgType] || '#64748B';
  const isHighlight = entry.isDecision || entry.isMapEvent;
  return (
    <div style={{
      padding: '2px 4px', borderBottom: '1px solid #0D1117',
      lineHeight: '12px', opacity: isHighlight ? 1 : 0.85,
      background: isHighlight ? `${c}08` : 'transparent',
      borderLeft: entry.isMapEvent ? `2px solid ${c}` : 'none',
    }}>
      <span style={{ color: '#334155' }}>{entry.time} </span>
      <span style={{ color: c, fontWeight: 700 }}>{entry.from}</span>
      <span style={{ color: '#334155' }}>{' > '}</span>
      <span style={{ color: c, fontWeight: 600, opacity: 0.7 }}>{entry.to}</span>
      <span style={{ color: '#334155' }}>{' : '}</span>
      <span style={{ color: '#94A3B8', fontFamily: typography.sansFamily, fontSize: 8 }}>{entry.msg}</span>
    </div>
  );
}
