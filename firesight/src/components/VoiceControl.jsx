import React, { useState, useRef, useCallback, useEffect } from 'react';
import { colors, typography, radii } from '../styles/designTokens.js';
import { PHONE_COMMANDS } from '../strategyBehaviors.js';

// ─── Config ─────────────────────────────────────────────────────────────────
const EL_KEY     = import.meta.env.VITE_ELEVENLABS_API_KEY || 'sk_54b1c8e4cf6543790bb9e81dc51d3aeb2def5878ffc74a2a';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyCvHl5a_DFDhcLLBW_u9v4vN1f3vL7Yl_o';
const API        = 'http://localhost:3001';

// ─── Keyframes ──────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes toastOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes micRing {
  0%   { box-shadow: 0 0 0 0 rgba(224, 64, 64, 0.55); }
  70%  { box-shadow: 0 0 0 7px rgba(224, 64, 64, 0); }
  100% { box-shadow: 0 0 0 0 rgba(224, 64, 64, 0); }
}
@keyframes micPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

// ─── IC acks — 1-2 short sentences ──────────────────────────────────────────
const IC_ACK = {
  'strategy offensive': 'Copy, going offensive. All units full suppression.',
  'strategy defensive': 'Copy, defensive posture. Hold lines, protect structures.',
  'strategy confine': 'Copy, confinement strategy. Monitor perimeter only.',
  'strategy transition': 'Copy, transitioning. All crews reposition to safety zones.',
  'attack direct': 'Copy, direct attack. Crews engaging the fire edge.',
  'attack parallel': 'Copy, parallel attack. Line offset with burnout authorized.',
  'attack indirect': 'Copy, indirect attack. Working the natural barriers.',
  'fire burnout': 'Copy, burnout authorized. Burn from the control line.',
  'fire backfire': 'Copy, backfire authorized. Written approval on record.',
  'fire cancel': 'Copy, firing cancelled. No ignition authorized.',
  'struct triage': 'Copy, structure triage. Assessing defensibility now.',
  'struct protect': 'Copy, structure protection. Engines deploying to buildings.',
  'struct abandon': 'Copy, structures abandoned. All crews withdraw immediately.',
  'struct bump-and-run': 'Copy, bump and run. Rapid prep then move to next.',
  'air priority head': 'Copy, air priority on the head. Tankers rolling.',
  'air priority structures': 'Copy, air priority structures. Retardant around buildings.',
  'air priority flanks': 'Copy, air on flanks. Split force both sides.',
  'air hold': 'Copy, all aircraft grounded. Air hold in effect.',
  'air medevac': 'Copy, medevac dispatched. Clear the helispot.',
  'drone recon': 'Copy, drones on recon. Grid coverage established.',
  'drone safety': 'Copy, drones on safety overwatch. Monitoring crew positions.',
  'night ops approve': 'Copy, night ops authorized. Maintain situational awareness.',
  'night ops cancel': 'Copy, night ops cancelled. All crews to camp at sunset.',
  'safety stop all': 'All stop, all stop. Cease operations, move to safety zones.',
  'safety resume': 'Copy, operations resumed. Normal tempo restored.',
  'lces check': 'Copy, LCES check ordered. Verify lookouts, comms, escape routes.',
  'mutual aid': 'Copy, mutual aid requested. Resources inbound through dispatch.',
  'iap approve': 'Copy, IAP approved. New operational period in effect.',
  'crew rotate': 'Copy, crew rotation ordered. Relief deploying from staging.',
  'crew extend': 'Copy, extension authorized. Monitor fatigue closely.',
};
const IC_ACK_DEFAULT = 'Copy, command received. All units stand by.';

// ─── NL → ICS command mapping ───────────────────────────────────────────────
const NL_RULES = [
  { test: /\b(go|switch|set)\s+(to\s+)?offensive\b|full\s+attack|hit\s+it\s+hard|go\s+aggressive/i, cmd: 'strategy offensive' },
  { test: /\b(go|switch|set)\s+(to\s+)?defensive\b|pull\s+back|hold\s+(the\s+)?line|protect\s+mode|defend/i, cmd: 'strategy defensive' },
  { test: /\b(go|switch|set)\s+(to\s+)?confine\b|let\s+it\s+burn|contain\s+(to|it)|confine/i, cmd: 'strategy confine' },
  { test: /\btransition\b|reposition|shift\s+strategy/i, cmd: 'strategy transition' },
  { test: /\bdirect\s+attack\b|attack\s+direct\b|crews?\s+(on|at)\s+(the\s+)?edge/i, cmd: 'attack direct' },
  { test: /\bparallel\s+attack\b|attack\s+parallel\b|offset\s+line/i, cmd: 'attack parallel' },
  { test: /\bindirect\s+attack\b|attack\s+indirect\b|natural\s+barrier/i, cmd: 'attack indirect' },
  { test: /\bburnout\b|burn\s+out\b|burn\s+from\s+(the\s+)?line/i, cmd: 'fire burnout' },
  { test: /\bbackfire\b|back\s+fire\b/i, cmd: 'fire backfire' },
  { test: /\bcancel\s+(all\s+)?fir(e|ing)\b|no\s+(more\s+)?burn/i, cmd: 'fire cancel' },
  { test: /\btriage\b|assess\s+(the\s+)?structur/i, cmd: 'struct triage' },
  { test: /\bprotect\s+(the\s+)?structur|\bstructure\s+protect\b|defend\s+(the\s+)?build/i, cmd: 'struct protect' },
  { test: /\babandon\s+(the\s+)?structur|\bstructure\s+abandon\b|leave\s+(the\s+)?build/i, cmd: 'struct abandon' },
  { test: /\bbump\s*(and|&|n)\s*run\b/i, cmd: 'struct bump-and-run' },
  { test: /\b(air|tanker|retardant)\s+(on|priority|to)\s+(the\s+)?head\b|hit\s+(the\s+)?head/i, cmd: 'air priority head' },
  { test: /\b(air|tanker|retardant)\s+(on|priority|to)\s+(the\s+)?structur|retardant\s+(around|on)\s+(the\s+)?build/i, cmd: 'air priority structures' },
  { test: /\b(air|tanker|retardant)\s+(on|priority|to)\s+(the\s+)?flank/i, cmd: 'air priority flanks' },
  { test: /\bground\s+(the\s+)?(air|aircraft|helicopter|chopper)|air\s+hold\b|hold\s+(all\s+)?air/i, cmd: 'air hold' },
  { test: /\bmedevac\b|medical\s+(evacuat|emergenc)/i, cmd: 'air medevac' },
  { test: /\bdrone.?\s*recon\b|send\s+(the\s+)?drone|drone.?\s*scout|eyes\s+in\s+(the\s+)?sky/i, cmd: 'drone recon' },
  { test: /\bdrone.?\s*safety\b|drone.?\s*overwatch\b|watch\s+(the\s+)?crew/i, cmd: 'drone safety' },
  { test: /\bnight\s+ops?\s+(approve|authorize|go)\b|approve\s+night/i, cmd: 'night ops approve' },
  { test: /\bnight\s+ops?\s+(cancel|stop|no)\b|cancel\s+night|no\s+night/i, cmd: 'night ops cancel' },
  { test: /\bstop\s+every(thing|one)|\ball\s+stop\b|safety\s+stop\s+all\b|cease\s+(all\s+)?op/i, cmd: 'safety stop all' },
  { test: /\bresume\s+(op|normal)|safety\s+resume\b|clear\s+to\s+proceed/i, cmd: 'safety resume' },
  { test: /\blces\b|check\s+(lookout|escape|safety\s+zone)/i, cmd: 'lces check' },
  { test: /\bmutual\s+aid\b|need\s+more\s+(people|resource|crew|help)|request\s+(more\s+)?resource/i, cmd: 'mutual aid' },
  { test: /\brotate\s+(the\s+)?(hotshot|crew)|pull\s+(back\s+)?(the\s+)?hotshot|hotshot.?\s*rotat/i, cmd: 'crew rotate hotshots' },
  { test: /\bextend\s+(the\s+)?(hotshot|crew)|hotshot.?\s*extend|keep\s+(the\s+)?crew/i, cmd: 'crew extend hotshots' },
  { test: /\biap\s+approve\b|approve\s+(the\s+)?plan\b/i, cmd: 'iap approve' },
  { test: /\bevacuat.*order\b|mandatory\s+evac/i, cmd: 'evac order', zone: true },
  { test: /\bevacuat.*warn(ing)?\b|warn\s+.*zone/i, cmd: 'evac warning', zone: true },
  { test: /\bevacuat|\bget\s+(every|them|people)\s+out\b/i, cmd: 'evac warning', zone: true },
];

const KEYWORD_FALLBACK = [
  { w: 'offensive', cmd: 'strategy offensive' }, { w: 'defensive', cmd: 'strategy defensive' },
  { w: 'confine', cmd: 'strategy confine' }, { w: 'direct', cmd: 'attack direct' },
  { w: 'parallel', cmd: 'attack parallel' }, { w: 'indirect', cmd: 'attack indirect' },
  { w: 'burnout', cmd: 'fire burnout' }, { w: 'backfire', cmd: 'fire backfire' },
  { w: 'triage', cmd: 'struct triage' }, { w: 'medevac', cmd: 'air medevac' },
  { w: 'recon', cmd: 'drone recon' },
];

const CMD_CATEGORY = {
  'strategy offensive': 'p', 'strategy defensive': 'p', 'strategy confine': 'p', 'strategy transition': 'p',
  'attack direct': 'a', 'attack parallel': 'a', 'attack indirect': 'a',
  'fire burnout': 'f', 'fire backfire': 'f', 'fire cancel': 'f',
  'struct triage': 's', 'struct protect': 's', 'struct abandon': 's', 'struct bump-and-run': 's',
  'air priority head': 'r', 'air priority structures': 'r', 'air priority flanks': 'r', 'air hold': 'r',
  'air medevac': 'm', 'drone recon': 'd', 'drone safety': 'd',
  'night ops approve': 'n', 'night ops cancel': 'n',
  'safety stop all': 'x', 'safety resume': 'x', 'lces check': 'l', 'mutual aid': 'u', 'iap approve': 'i',
};

const ZONE_RE = /\b(OR-?\d+|zone\s*\w+|[A-Z]{1,3}-?\d{1,3})\b/i;

const ALL_CMDS = Object.keys(PHONE_COMMANDS).sort((a, b) => b.length - a.length);

function nlToCommands(transcript) {
  const lower = transcript.toLowerCase();
  const clean = lower.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const found = [];
  const cats = new Set();
  const add = (cmd) => { const c = CMD_CATEGORY[cmd] || cmd; if (!cats.has(c)) { cats.add(c); found.push(cmd); } };

  // Exact ICS strings
  for (const c of ALL_CMDS) { if (clean.includes(c) || lower.includes(c)) add(c); }
  // NL rules
  for (const r of NL_RULES) {
    if (r.test.test(transcript) || r.test.test(clean)) {
      if (r.zone) { const zm = transcript.match(ZONE_RE); add(r.cmd + ' ' + (zm ? zm[1].replace(/\s+/g, '') : 'OR-1')); }
      else add(r.cmd);
    }
  }
  // Keyword fallback
  if (!found.length) for (const k of KEYWORD_FALLBACK) { if (clean.includes(k.w)) add(k.cmd); }
  if (!found.length) found.push(transcript);
  return found;
}

// ─── PCM → WAV ─────────────────────────────────────────────────────────────
function pcmToWav(pcmBase64, sr = 24000) {
  const pcm = Uint8Array.from(atob(pcmBase64), c => c.charCodeAt(0));
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true);
  s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

// ─── ElevenLabs STT ─────────────────────────────────────────────────────────
async function transcribeAudio(blob) {
  if (!EL_KEY) throw new Error('No ElevenLabs key');
  const fd = new FormData();
  fd.append('file', blob, 'recording.webm');
  fd.append('model_id', 'scribe_v1');
  fd.append('language_code', 'eng');
  fd.append('prompt', 'Wildfire incident commander issuing tactical commands: go defensive, go offensive, strategy confine, attack direct, attack parallel, fire burnout, struct protect, air priority head, drone recon, evacuate, medevac, mutual aid, safety stop, lces check, pull back, hit it hard, protect the structures');
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': EL_KEY }, body: fd,
  });
  if (!res.ok) throw new Error(`STT error ${res.status}`);
  const data = await res.json();
  return data.text?.trim() ?? '';
}

// ─── Gemini TTS ─────────────────────────────────────────────────────────────
let currentAudio = null;

function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
}

async function speakIC(text) {
  stopAudio();
  if (!GEMINI_KEY) return;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sadaltager' } } },
          },
        }),
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    const pcmB64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!pcmB64) return;
    stopAudio();
    const wav = pcmToWav(pcmB64);
    const url = URL.createObjectURL(wav);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.play();
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
  } catch (e) { console.error('TTS error:', e); }
}

// ═════════════════════════════════════════════════════════════════════════════
// HOOK: useVoiceControl
// ═════════════════════════════════════════════════════════════════════════════
export function useVoiceControl({ onStrategyChange } = {}) {
  const [status, setStatus] = useState('idle'); // idle | recording | processing
  const statusRef = useRef('idle');
  const [toast, setToast] = useState(null);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const toastTimer = useRef(null);

  // Keep ref in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  // Inject keyframes
  useEffect(() => {
    if (!document.getElementById('vc-kf')) {
      const el = document.createElement('style');
      el.id = 'vc-kf'; el.textContent = KEYFRAMES;
      document.head.appendChild(el);
    }
  }, []);

  const showToast = useCallback((heard, label, color) => {
    clearTimeout(toastTimer.current);
    setToast({ heard, label, color, exiting: false });
    toastTimer.current = setTimeout(() => {
      setToast(t => t ? { ...t, exiting: true } : null);
      setTimeout(() => setToast(null), 400);
    }, 3000);
  }, []);

  const stopRecording = useCallback(() => {
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (mediaRecRef.current?.state === 'recording') mediaRecRef.current.stop();
    mediaRecRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (statusRef.current !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setStatus('processing');

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const text = await transcribeAudio(blob);
          if (!text) { showToast('', 'NO SPEECH DETECTED', '#64748B'); setStatus('idle'); return; }

          const cmds = nlToCommands(text);
          console.log('[VOICE] transcript:', text, '→', cmds);
          showToast(text, cmds.length + ' COMMAND' + (cmds.length > 1 ? 'S' : ''), '#A78BFA');

          // Send all to server
          const results = await Promise.all(cmds.map(cmd =>
            fetch(`${API}/api/command`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd, source: 'voice', confirmed: false }),
            }).then(r => r.json()).catch(() => ({ status: 'error' }))
          ));

          // Apply strategy changes locally
          for (const data of results) {
            if (data.status === 'ok' && data.changes && onStrategyChange) {
              onStrategyChange(data.changes);
            }
          }

          // Build combined ack
          const acks = [];
          for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'ok') {
              acks.push(IC_ACK[results[i].command || cmds[i]] || IC_ACK_DEFAULT);
            }
          }

          if (acks.length > 0) {
            showToast(text, acks.length + ' EXECUTED', '#22C55E');
            let speech = acks.join(' ');
            if (acks.length > 1) speech += " That's " + acks.length + ' orders confirmed, all units acknowledge.';
            speakIC(speech);
          } else {
            showToast(text, 'COMMAND FAILED', '#EF4444');
            speakIC('Command not recognized. Say again.');
          }
        } catch (err) {
          console.error('Voice error:', err);
          showToast('', 'VOICE ERROR', '#EF4444');
        }
        setStatus('idle');
      };

      rec.start();
      mediaRecRef.current = rec;
      setStatus('recording');
    } catch {
      showToast('', 'MIC ACCESS DENIED', '#EF4444');
    }
  }, [status, onStrategyChange, showToast]);

  // Hold V to record, release to send — uses refs to avoid stale closures
  const startRef = useRef(startRecording);
  const stopRef = useRef(stopRecording);
  useEffect(() => { startRef.current = startRecording; }, [startRecording]);
  useEffect(() => { stopRef.current = stopRecording; }, [stopRecording]);

  useEffect(() => {
    let vHeld = false;
    const down = (e) => {
      if (e.key !== 'v' && e.key !== 'V') return;
      if (e.repeat) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (vHeld) return;
      vHeld = true;
      startRef.current();
    };
    const up = (e) => {
      if ((e.key === 'v' || e.key === 'V') && vHeld) {
        vHeld = false;
        stopRef.current();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []); // stable — no deps, uses refs

  return { status, toast, startRecording, stopRecording };
}

// ═════════════════════════════════════════════════════════════════════════════
// UI: VoiceHint — bottom bar showing "Hold V to talk" + status
// ═════════════════════════════════════════════════════════════════════════════
export function VoiceHint({ status }) {
  const isRec = status === 'recording';
  const isProc = status === 'processing';

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 400, display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 16px',
      background: isRec ? 'rgba(224,64,64,0.15)' : 'rgba(10,14,22,0.85)',
      border: `1px solid ${isRec ? 'rgba(224,64,64,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 20, backdropFilter: 'blur(12px)',
      animation: isRec ? 'micRing 1.2s ease-in-out infinite' : 'none',
      transition: 'all 0.2s',
    }}>
      {/* Mic icon */}
      <svg width="12" height="16" viewBox="0 0 10 13" fill="none">
        <rect x="3" y="0.5" width="4" height="7" rx="2"
          fill={isRec ? '#EF4444' : isProc ? '#5B9BD5' : '#64748B'} />
        <path d="M1 6C1 8.5 2.5 10 5 10C7.5 10 9 8.5 9 6"
          stroke={isRec ? '#EF4444' : isProc ? '#5B9BD5' : '#64748B'}
          strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <line x1="5" y1="10" x2="5" y2="12"
          stroke={isRec ? '#EF4444' : isProc ? '#5B9BD5' : '#64748B'}
          strokeWidth="1.2" strokeLinecap="round" />
        <line x1="3" y1="12" x2="7" y2="12"
          stroke={isRec ? '#EF4444' : isProc ? '#5B9BD5' : '#64748B'}
          strokeWidth="1.2" strokeLinecap="round" />
      </svg>

      <span style={{
        fontFamily: typography.monoFamily, fontSize: 10, letterSpacing: '0.08em',
        color: isRec ? '#EF4444' : isProc ? '#5B9BD5' : '#94A3B8',
        animation: isRec ? 'micPulse 0.8s ease infinite' : 'none',
        userSelect: 'none',
      }}>
        {isRec ? 'RECORDING — RELEASE V TO SEND' : isProc ? 'PROCESSING...' : 'HOLD V TO TALK TO IC'}
      </span>

      {/* V key badge */}
      {!isRec && !isProc && (
        <span style={{
          fontSize: 9, fontFamily: typography.monoFamily, fontWeight: 700,
          color: '#64748B', background: 'rgba(255,255,255,0.06)',
          padding: '1px 6px', borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.1)',
        }}>V</span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// UI: VoiceToast — floating toast showing transcription + result
// ═════════════════════════════════════════════════════════════════════════════
export function VoiceToast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
      zIndex: 500, display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 18px', background: 'rgba(8,11,16,0.92)',
      backdropFilter: 'blur(20px)', borderRadius: 20,
      border: `1px solid ${toast.color}35`,
      boxShadow: `0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px ${toast.color}18`,
      animation: toast.exiting ? 'toastOut 0.4s ease forwards' : 'toastIn 0.22s ease',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {toast.heard && (
        <>
          <span style={{ fontFamily: typography.monoFamily, fontSize: 10, color: '#94A3B8', opacity: 0.65 }}>
            "{toast.heard}"
          </span>
          <span style={{ fontFamily: typography.monoFamily, fontSize: 9, color: '#475569' }}>&rarr;</span>
        </>
      )}
      <div style={{
        width: 5, height: 5, borderRadius: '50%', background: toast.color, flexShrink: 0,
        boxShadow: `0 0 6px ${toast.color}`,
      }} />
      <span style={{
        fontFamily: typography.monoFamily, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.1em', color: toast.color,
      }}>{toast.label}</span>
    </div>
  );
}
