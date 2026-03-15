// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ICSGraph.jsx — Force-directed ICS Command Chain visualization
//
// Renders all 45 ICS agents as a graph with particles, edges, tooltips.
// Receives the shared ICSEngine instance as a prop.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import React, { useEffect, useRef, useCallback } from 'react';
import { NODES, TYPE_COLORS } from '../icsEngine.js';

const NODE_IDS = Object.keys(NODES);

export default function ICSGraph({ icsEngine }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const animRef = useRef(null);
  const tooltipRef = useRef(null);

  // Initialize positions & physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (stateRef.current) {
        stateRef.current.W = rect.width;
        stateRef.current.H = rect.height;
      }
    }

    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const positions = {};
    const velocities = {};
    const particles = [];

    // Layout nodes by tier
    const tierY = { command: H * 0.08, staff: H * 0.22, branch: H * 0.42, tactical: H * 0.62, external: H * 0.82, ai: H * 0.18 };
    for (const id of NODE_IDS) {
      const n = NODES[id];
      const tierNodes = NODE_IDS.filter(i => NODES[i].tier === n.tier);
      const idx = tierNodes.indexOf(id);
      const count = tierNodes.length;
      if (n.tier === 'ai') {
        const sp = 55;
        positions[id] = { x: W * 0.88 + (Math.random() - 0.5) * 20, y: tierY.ai + idx * sp - (count - 1) * sp / 2 + (Math.random() - 0.5) * 10 };
      } else {
        const spacing = Math.min(120, W * 0.75 / count);
        const startX = W / 2 - (count - 1) * spacing / 2;
        positions[id] = { x: startX + idx * spacing + (Math.random() - 0.5) * 15, y: tierY[n.tier] + (Math.random() - 0.5) * 15 };
      }
      velocities[id] = { x: 0, y: 0 };
    }

    stateRef.current = { ctx, W, H, positions, velocities, particles, frame: 0, hoveredNode: null, dragging: null, dragOff: { x: 0, y: 0 }, lastParticleCheck: 0 };

    resize();
    window.addEventListener('resize', resize);

    // Start animation
    function draw() {
      const st = stateRef.current;
      if (!st) return;
      st.frame++;
      const { ctx: c, W: w, H: h, positions: pos, velocities: vel } = st;

      c.fillStyle = '#0A0E17';
      c.fillRect(0, 0, w, h);

      // Physics
      simulate(st);

      // Spawn particles from recent messages
      if (icsEngine && st.frame - st.lastParticleCheck > 5) {
        st.lastParticleCheck = st.frame;
        const msgs = icsEngine.getRecentMessages(5);
        for (const m of msgs) {
          if (m.t > icsEngine.simTime - 2 && pos[m.from] && pos[m.to]) {
            // Don't spam — only 1 particle set per message per 10 frames
            const key = m.from + m.to + Math.floor(m.t);
            if (!st['_p_' + key]) {
              st['_p_' + key] = true;
              for (let i = 0; i < 3; i++) {
                st.particles.push({
                  from: m.from, to: m.to, progress: -i * 0.06,
                  speed: 0.012 + Math.random() * 0.004,
                  color: TYPE_COLORS[m.type] || '#94A3B8',
                  size: 3 + Math.random() * 2,
                });
              }
              // Cleanup particle keys
              setTimeout(() => delete st['_p_' + key], 2000);
            }
          }
        }
      }

      const litNodes = icsEngine ? icsEngine.litNodes : new Set();
      const activeEdges = icsEngine ? icsEngine.getActiveEdges() : new Set();
      const simStarted = icsEngine && icsEngine.simTime > 0;

      // Draw edges
      for (const key of activeEdges) {
        const [from, to] = key.split('→');
        const a = pos[from], b = pos[to];
        if (!a || !b) continue;
        const lastMsg = icsEngine.agents[to]?.inbox.find(m => m.from === from);
        const tc = TYPE_COLORS[lastMsg?.type] || '#1E2636';
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
        c.strokeStyle = tc + '25'; c.lineWidth = 0.8; c.stroke();
      }

      // Draw particles
      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i];
        p.progress += p.speed;
        if (p.progress >= 1) { st.particles.splice(i, 1); continue; }
        const a = pos[p.from], b = pos[p.to];
        if (!a || !b) { st.particles.splice(i, 1); continue; }
        if (p.progress < 0) continue;
        const x = a.x + (b.x - a.x) * p.progress, y = a.y + (b.y - a.y) * p.progress;
        const alpha = p.progress < 0.1 ? p.progress * 10 : p.progress > 0.9 ? (1 - p.progress) * 10 : 1;
        c.beginPath(); c.arc(x, y, p.size, 0, Math.PI * 2);
        c.fillStyle = p.color + Math.round(alpha * 200).toString(16).padStart(2, '0');
        c.fill();
        const tx = a.x + (b.x - a.x) * Math.max(0, p.progress - 0.08);
        const ty = a.y + (b.y - a.y) * Math.max(0, p.progress - 0.08);
        c.beginPath(); c.moveTo(tx, ty); c.lineTo(x, y);
        c.strokeStyle = p.color + Math.round(alpha * 80).toString(16).padStart(2, '0');
        c.lineWidth = p.size * 0.6; c.stroke();
      }

      // Draw nodes
      for (const id of NODE_IDS) {
        const n = NODES[id], p = pos[id];
        if (!n || !p) continue;
        const isHovered = st.hoveredNode === id;
        const isLit = !simStarted || litNodes.has(id);
        const r = n.size * (isHovered ? 1.3 : 1);

        if (isLit) {
          if (isHovered || n.tier === 'command') {
            c.beginPath(); c.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
            c.fillStyle = n.color + '15'; c.fill();
          }
          c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
          c.fillStyle = n.color + (isHovered ? '40' : '20'); c.fill();
          c.strokeStyle = n.color + (isHovered ? 'FF' : '80');
          c.lineWidth = isHovered ? 2 : 1; c.stroke();
          if (n.tier === 'ai') {
            c.setLineDash([3, 3]); c.beginPath(); c.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
            c.strokeStyle = n.color + '40'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
          }
          c.fillStyle = isHovered ? '#FFFFFF' : n.color;
          c.font = `${isHovered ? 'bold ' : ''}${r < 14 ? 8 : 10}px -apple-system,sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(n.short, p.x, p.y);
          if (isHovered || r >= 18) {
            c.fillStyle = '#64748B'; c.font = '7px -apple-system,sans-serif';
            c.fillText(n.label.length > 25 ? n.label.substring(0, 22) + '...' : n.label, p.x, p.y + r + 10);
          }
        } else {
          c.beginPath(); c.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
          c.fillStyle = '#1E263640'; c.fill();
          c.strokeStyle = '#1E263680'; c.lineWidth = 0.5; c.stroke();
          c.fillStyle = '#1E2636';
          c.font = `${r < 14 ? 7 : 8}px -apple-system,sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(n.short, p.x, p.y);
        }
      }

      // Tier labels
      c.fillStyle = '#1E2636'; c.font = 'bold 9px -apple-system,sans-serif'; c.textAlign = 'left';
      const tierLabels = { command: 'COMMAND', staff: 'GENERAL STAFF', branch: 'BRANCHES / DIVISIONS', tactical: 'TACTICAL RESOURCES', external: 'EXTERNAL SYSTEMS', ai: 'AI AGENTS' };
      for (const [t, label] of Object.entries(tierLabels)) {
        const y = tierY[t] - 2;
        if (t === 'ai') {
          c.fillText(label, w * 0.78, y);
          c.setLineDash([4, 6]); c.beginPath(); c.moveTo(w * 0.76, tierY.command - 20);
          c.lineTo(w * 0.76, tierY.external + 30); c.strokeStyle = '#F472B620'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
        } else c.fillText(label, 16, y);
      }

      // Stats overlay
      if (icsEngine) {
        const phase = icsEngine.icsPhase;
        const phaseLabel = phase === 'standby' ? 'Standby' : phase === 'initial' ? 'Initial Attack' : phase === 'extended' ? 'Extended Attack' : phase === 'crisis' ? 'Crisis / Type 1' : 'Full ICS';
        c.fillStyle = '#A78BFA'; c.font = 'bold 10px -apple-system,sans-serif'; c.textAlign = 'right';
        c.fillText(`ICS Phase: ${phaseLabel}`, w - 16, 20);
        c.fillStyle = '#64748B'; c.font = '9px -apple-system,sans-serif';
        c.fillText(`${icsEngine.litNodes.size} active agents  |  ${activeEdges.size} info flows  |  ${icsEngine.formatSimTime(icsEngine.simTime)}`, w - 16, 36);
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [icsEngine]);

  // Mouse interaction
  const handleMouseMove = useCallback((e) => {
    const st = stateRef.current;
    if (!st) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Dragging
    if (st.dragging && st.positions[st.dragging]) {
      st.positions[st.dragging].x = mx + st.dragOff.x;
      st.positions[st.dragging].y = my + st.dragOff.y;
      st.velocities[st.dragging].x = 0;
      st.velocities[st.dragging].y = 0;
    }

    // Hover detection
    st.hoveredNode = null;
    for (const id of NODE_IDS) {
      const p = st.positions[id];
      if (!p) continue;
      if (Math.hypot(p.x - mx, p.y - my) < NODES[id].size + 8) {
        st.hoveredNode = id;
        break;
      }
    }

    // Tooltip
    const tt = tooltipRef.current;
    if (st.hoveredNode && icsEngine && tt) {
      const n = NODES[st.hoveredNode];
      const a = icsEngine.agents[st.hoveredNode];
      let html = `<div style="font-size:12px;font-weight:700;color:${n.color};margin-bottom:4px">${n.label}</div>`;
      html += `<div style="font-size:9px;color:#64748B;margin-bottom:6px">${n.role}</div>`;
      if (a.active) {
        html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1E2636"><div style="font-size:8px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Status: ACTIVE</div></div>`;
        const incoming = a.inbox.slice(-5);
        if (incoming.length) {
          html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1E2636"><div style="font-size:8px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Recent Messages (${a.inbox.length} total)</div>`;
          incoming.forEach(m => {
            html += `<div style="font-size:9px;color:${NODES[m.from]?.color || '#94A3B8'};line-height:1.4">← ${NODES[m.from]?.short}: ${m.msg.substring(0, 80)}${m.msg.length > 80 ? '...' : ''}</div>`;
          });
          html += `</div>`;
        }
      } else {
        html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1E2636"><div style="font-size:8px;color:#64748B">Status: INACTIVE — Awaiting activation in ICS chain</div></div>`;
      }
      tt.innerHTML = html;
      tt.style.display = 'block';
      tt.style.left = Math.min(mx + 16, st.W - 340) + 'px';
      tt.style.top = Math.max(my - 10, 4) + 'px';
    } else if (tt) {
      tt.style.display = 'none';
    }
  }, [icsEngine]);

  const handleMouseDown = useCallback((e) => {
    const st = stateRef.current;
    if (!st || !st.hoveredNode) return;
    st.dragging = st.hoveredNode;
    st.dragOff.x = st.positions[st.hoveredNode].x - (e.clientX - canvasRef.current.getBoundingClientRect().left);
    st.dragOff.y = st.positions[st.hoveredNode].y - (e.clientY - canvasRef.current.getBoundingClientRect().top);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (stateRef.current) stateRef.current.dragging = null;
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0A0E17', borderRadius: 14, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: stateRef.current?.hoveredNode ? 'pointer' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
      <div ref={tooltipRef} style={{
        position: 'absolute', display: 'none',
        background: 'rgba(17,24,39,.95)', border: '1px solid #1E2636',
        borderRadius: 6, padding: '10px 14px', fontSize: 10, maxWidth: 320,
        pointerEvents: 'none', boxShadow: '0 8px 32px rgba(0,0,0,.5)', zIndex: 100,
        color: '#E2E8F0',
      }} />

      {/* Message Log Overlay */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, width: 360, maxHeight: 300,
        background: 'rgba(17,24,39,.9)', border: '1px solid #1E2636',
        borderRadius: 8, padding: '10px 14px', fontSize: 9, overflow: 'hidden',
      }}>
        <div style={{ fontSize: 10, color: '#A78BFA', letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>MESSAGE FLOW</div>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {icsEngine && icsEngine.getRecentMessages(25).reverse().map((m, i) => {
            const fn = NODES[m.from], tn = NODES[m.to];
            return (
              <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid rgba(30,38,54,0.2)', lineHeight: 1.3 }}>
                <span style={{ color: '#64748B', fontSize: 8 }}>[{icsEngine.formatSimTime(m.t)}]</span>{' '}
                <span style={{ fontWeight: 600, color: fn?.color || '#fff' }}>{fn?.short || m.from}</span>
                <span style={{ color: '#64748B' }}> → {tn?.short || m.to}</span>
                <span style={{ color: '#94A3B8', display: 'block', marginTop: 1 }}>{m.msg}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'rgba(17,24,39,.9)', border: '1px solid #1E2636',
        borderRadius: 8, padding: '10px 14px', fontSize: 9, maxWidth: 260,
      }}>
        <div style={{ fontSize: 10, color: '#A78BFA', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>NODE TYPES</div>
        {[
          ['#EF4444', 'Command (IC / Unified Command)'],
          ['#A78BFA', 'General Staff (Section Chiefs)'],
          ['#FBBF24', 'Branch / Division / Group'],
          ['#22D3EE', 'Tactical Resources'],
          ['#34D399', 'External Systems (Sensors, Dispatch)'],
          ['#F472B6', 'AI Agents (FireSight)'],
        ].map(([c, l]) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0', color: '#94A3B8' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
            {l}
          </div>
        ))}
        <div style={{ fontSize: 10, color: '#A78BFA', letterSpacing: 1, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>EDGE TYPES</div>
        {[
          ['#FBBF24', 'Command / Orders'],
          ['#22D3EE', 'Intelligence / Reports'],
          ['#34D399', 'Coordination'],
          ['#F472B6', 'AI Augmentation'],
          ['#EF4444', 'Safety / Life Safety'],
        ].map(([c, l]) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0', color: '#94A3B8' }}>
            <div style={{ width: 20, height: 2, background: c, flexShrink: 0, borderRadius: 1 }} />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Force-directed physics ──────────────────────────────────────────────────
function simulate(st) {
  const { positions: pos, velocities: vel, W, H } = st;
  const damping = 0.85, repulsion = 8000, attraction = 0.003, idealDist = 120;
  const litNodes = st._icsEngine?.litNodes || new Set();

  for (let i = 0; i < NODE_IDS.length; i++) {
    for (let j = i + 1; j < NODE_IDS.length; j++) {
      const a = pos[NODE_IDS[i]], b = pos[NODE_IDS[j]];
      if (!a || !b) continue;
      let dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let f = repulsion / (dist * dist), fx = dx / dist * f, fy = dy / dist * f;
      vel[NODE_IDS[i]].x += fx; vel[NODE_IDS[i]].y += fy;
      vel[NODE_IDS[j]].x -= fx; vel[NODE_IDS[j]].y -= fy;
    }
  }

  // Tier gravity
  const tierY = { command: H * 0.08, staff: H * 0.22, branch: H * 0.42, tactical: H * 0.62, external: H * 0.82, ai: H * 0.18 };
  const cx = W / 2;
  for (const id of NODE_IDS) {
    const n = NODES[id]; if (!pos[id]) continue;
    vel[id].y += (tierY[n.tier] - pos[id].y) * 0.01;
    if (n.tier === 'ai') vel[id].x += (W * 0.88 - pos[id].x) * 0.008;
    else vel[id].x += (cx - pos[id].x) * 0.001;
    vel[id].x *= damping; vel[id].y *= damping;
    pos[id].x += vel[id].x; pos[id].y += vel[id].y;
    pos[id].x = Math.max(40, Math.min(W - 40, pos[id].x));
    pos[id].y = Math.max(40, Math.min(H - 40, pos[id].y));
  }
}
