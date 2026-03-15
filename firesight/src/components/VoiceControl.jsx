import React, { useState, useRef, useCallback, useEffect } from 'react';
import { colors, typography, radii } from '../styles/designTokens.js';

// ─── Keyframes ─────────────────────────────────────────────────────────────
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
`;

// ─── Env vars ──────────────────────────────────────────────────────────────
const EL_KEY     = import.meta.env.VITE_ELEVENLABS_API_KEY;   // STT
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;       // TTS

// ─── Action metadata (labels + colors for UI) ──────────────────────────────
const ACTION_META = {
  pyro:    { label: 'PYRO ANALYSIS INITIATED', color: '#F59E0B' },
  swarm:   { label: 'DRONE SWARM DEPLOYED',    color: '#5B9BD5' },
  evac:    { label: 'EVAC ROUTES ACTIVATED',   color: '#3DB87A' },
  deploy:  { label: 'ASSETS DEPLOYED',         color: '#F27D26' },
  reset:   { label: 'COMMAND CYCLE RESET',     color: 'rgba(180,190,205,0.70)' },
  unknown: { label: 'COMMAND NOT RECOGNIZED',  color: colors.critical },
};

// ─── Regex fallback (used when Gemini key is absent) ───────────────────────
const FALLBACK_COMMANDS = [
  { test: /pyro|predict|analy[sz]|fire.?spread|simulat|spread/i,    action: 'pyro'    },
  { test: /swarm|drone|drones|uav|recon|scout/i,                    action: 'swarm'   },
  { test: /evac|evacuate|evacuation|route|routes|civilian/i,        action: 'evac'    },
  { test: /deploy|crew|crews|tanker|tankers|resource|assets|engine/i, action: 'deploy' },
  { test: /reset|clear|restart|standby|abort/i,                     action: 'reset'   },
];

// ─── Gemini NLU — natural language → { action, response } ─────────────────
const GEMINI_SYSTEM_PROMPT = `You are FireSight, an AI mission control system for wildfire incident response.
The incident commander has issued a voice command. Understand their intent and classify it.

Available actions:
- "pyro"   — fire spread analysis, prediction, simulation, or anything about how the fire is moving
- "swarm"  — deploy drones, get aerial recon, eyes on terrain, UAV coverage
- "evac"   — evacuate civilians, open escape routes, clear corridors, get people out
- "deploy" — send ground crews, air tankers, engines, deploy firefighting resources
- "reset"  — reset, clear, start over, abort current plan
- "unknown" — cannot determine intent

Respond ONLY with valid JSON, no markdown:
{"action":"<action>","response":"<1-2 sentence authoritative confirmation as FireSight AI>"}`;

async function parseIntent(transcript) {
  if (!GEMINI_KEY) {
    // Regex fallback
    const match = FALLBACK_COMMANDS.find(c => c.test.test(transcript));
    const action = match?.action ?? 'unknown';
    const fallbackResponses = {
      pyro:    'Pyro analysis initiated. Fire spread simulation running at 87 percent confidence.',
      swarm:   'Drone swarm deployed. 12 units online, coverage at 74 percent.',
      evac:    'Evacuation routes activated. 3 corridors clear, 2847 civilians en route to safe zones.',
      deploy:  'Assets deployed. 4 ground crews and 2 air tankers en route.',
      reset:   'Command cycle reset. All units standing by.',
      unknown: 'Command not recognized. Please try again.',
    };
    return { action, response: fallbackResponses[action] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
          { role: 'model', parts: [{ text: '{"action":"ready","response":"FireSight online. Awaiting orders."}' }] },
          { role: 'user', parts: [{ text: transcript }] },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini NLU error ${res.status}`);
  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(raw);
}

// ─── ElevenLabs STT ────────────────────────────────────────────────────────
async function transcribeAudio(audioBlob) {
  if (!EL_KEY) throw new Error('No ElevenLabs key');

  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('model_id', 'scribe_v1');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY },
    body: formData,
  });

  if (!res.ok) throw new Error(`EL STT error ${res.status}`);
  const data = await res.json();
  return data.text?.trim() ?? '';
}

// ─── Gemini TTS ────────────────────────────────────────────────────────────
// Gemini 2.5 Flash returns raw 16-bit PCM at 24kHz mono — wrap in WAV to play
function pcmToWav(pcmBase64, sampleRate = 24000) {
  const pcm    = Uint8Array.from(atob(pcmBase64), c => c.charCodeAt(0));
  const buf    = new ArrayBuffer(44 + pcm.length);
  const view   = new DataView(buf);
  const str    = (off, s) => [...s].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
  str(0,  'RIFF');  view.setUint32(4,  36 + pcm.length, true);
  str(8,  'WAVE');  str(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20,  1, true);          // format = PCM
  view.setUint16(22,  1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32,  2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');  view.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

let currentAudio = null;

async function speakGemini(text) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  // ── Gemini TTS ──────────────────────────────────────────────────────────
  if (GEMINI_KEY) {
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
              speechConfig: {
                voiceConfig: {
                  // Kore = firm & authoritative — perfect for mission control AI
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
          }),
        }
      );
      if (res.ok) {
        const data   = await res.json();
        const pcmB64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (pcmB64) {
          const wav  = pcmToWav(pcmB64);
          const url  = URL.createObjectURL(wav);
          const audio = new Audio(url);
          currentAudio = audio;
          audio.play();
          audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
          return;
        }
      }
    } catch (_) { /* fall through */ }
  }

  // ── Fallback: browser SpeechSynthesis ───────────────────────────────────
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.88; utt.pitch = 0.72; utt.volume = 1.0;
  window.speechSynthesis.speak(utt);
}

// ─── Hook ──────────────────────────────────────────────────────────────────
// status: 'idle' | 'recording' | 'transcribing'
export function useVoiceControl({ onPyro, onSwarm, onEvac, onDeploy, onReset } = {}) {
  const [status, setStatus]  = useState('idle');
  const [toast,  setToast]   = useState(null);
  const mediaRecRef  = useRef(null);
  const chunksRef    = useRef([]);
  const toastTimer   = useRef(null);
  const exitTimer    = useRef(null);
  const audioCtxRef  = useRef(null);
  const vadRafRef    = useRef(null);   // requestAnimationFrame id for VAD loop
  const silTimerRef  = useRef(null);   // silence countdown timer
  const maxTimerRef  = useRef(null);   // max-duration safety cutoff

  useEffect(() => {
    const id = 'voice-control-kf';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id; el.textContent = KEYFRAMES;
      document.head.appendChild(el);
    }
    return () => { clearTimeout(toastTimer.current); clearTimeout(exitTimer.current); };
  }, []);

  const showToast = useCallback((heard, label, color) => {
    clearTimeout(toastTimer.current); clearTimeout(exitTimer.current);
    setToast({ heard, label, color, exiting: false });
    toastTimer.current = setTimeout(() => {
      setToast(t => t ? { ...t, exiting: true } : null);
      exitTimer.current = setTimeout(() => setToast(null), 400);
    }, 2800);
  }, []);

  const handleTranscript = useCallback(async (transcript) => {
    if (!transcript) { showToast('', 'NO SPEECH DETECTED', colors.textTertiary); return; }

    let action = 'unknown', response = '';
    try {
      ({ action, response } = await parseIntent(transcript));
    } catch (err) {
      console.error('Intent parse error:', err);
      action = 'unknown';
      response = 'System error. Please try again.';
    }

    const meta = ACTION_META[action] ?? ACTION_META.unknown;
    showToast(transcript, meta.label, meta.color);
    speakGemini(response);

    if (action === 'pyro')   onPyro?.();
    if (action === 'swarm')  onSwarm?.();
    if (action === 'evac')   onEvac?.();
    if (action === 'deploy') onDeploy?.();
    if (action === 'reset')  onReset?.();
  }, [onPyro, onSwarm, onEvac, onDeploy, onReset, showToast]);

  // Cleans up VAD loop + timers without stopping the MediaRecorder
  const stopVAD = useCallback(() => {
    cancelAnimationFrame(vadRafRef.current);
    clearTimeout(silTimerRef.current);
    clearTimeout(maxTimerRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    stopVAD();
    if (mediaRecRef.current?.state === 'recording') {
      mediaRecRef.current.stop();
    }
    mediaRecRef.current = null;
  }, [stopVAD]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      // ── MediaRecorder ──────────────────────────────────────────────────
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopVAD();
        setStatus('transcribing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const text = await transcribeAudio(blob);
          await handleTranscript(text);
        } catch (err) {
          showToast('', 'TRANSCRIPTION FAILED', colors.critical);
          console.error('EL STT error:', err);
        } finally {
          setStatus('idle');
        }
      };
      rec.start();
      mediaRecRef.current = rec;
      setStatus('recording');

      // ── Voice Activity Detection ───────────────────────────────────────
      // Monitor mic levels → auto-stop after 1.5s of silence post-speech
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      let hasSpeech = false;

      const SPEECH_THRESHOLD = 12;   // avg frequency energy to count as speech
      const SILENCE_MS       = 1500; // ms of silence after speech before auto-stop
      const MAX_MS           = 15000; // hard cutoff — never record more than 15s

      // Safety: hard max duration
      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_MS);

      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;

        if (avg > SPEECH_THRESHOLD) {
          hasSpeech = true;
          clearTimeout(silTimerRef.current);
          silTimerRef.current = null;
        } else if (hasSpeech && !silTimerRef.current) {
          // Silence detected after real speech — start countdown
          silTimerRef.current = setTimeout(() => stopRecording(), SILENCE_MS);
        }

        vadRafRef.current = requestAnimationFrame(tick);
      };
      vadRafRef.current = requestAnimationFrame(tick);

    } catch (err) {
      showToast('', 'MIC ACCESS DENIED', colors.critical);
    }
  }, [handleTranscript, showToast, stopRecording, stopVAD]);

  const toggle = useCallback(() => {
    if (status === 'idle')      startRecording();
    if (status === 'recording') stopRecording();
    // 'transcribing' → ignore clicks
  }, [status, startRecording, stopRecording]);

  return { status, toast, toggle };
}

// ─── Mic Button ────────────────────────────────────────────────────────────
export function MicButton({ status, onToggle }) {
  const isRecording    = status === 'recording';
  const isTranscribing = status === 'transcribing';
  const isActive       = isRecording || isTranscribing;

  const label = isRecording ? 'RECORDING' : isTranscribing ? 'PROCESSING' : 'VOICE';
  const borderColor = isRecording
    ? 'rgba(224,64,64,0.40)'
    : isTranscribing
    ? 'rgba(91,155,213,0.40)'
    : colors.borderFocus;
  const bgColor = isRecording
    ? 'rgba(224,64,64,0.10)'
    : isTranscribing
    ? 'rgba(91,155,213,0.08)'
    : 'rgba(255,255,255,0.04)';
  const textColor = isRecording ? colors.critical : isTranscribing ? colors.accent : colors.textSecondary;

  return (
    <button
      onClick={onToggle}
      disabled={isTranscribing}
      title={isRecording ? 'Click to stop & transcribe' : 'Click to speak a command'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 11px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: radii.sm,
        cursor: isTranscribing ? 'default' : 'pointer',
        outline: 'none',
        flexShrink: 0,
        transition: 'all 0.2s ease',
        animation: isRecording ? 'micRing 1.2s ease-in-out infinite' : 'none',
        opacity: isTranscribing ? 0.7 : 1,
      }}
    >
      <MicIcon active={isActive} color={textColor} />
      <span style={{
        fontFamily: typography.monoFamily,
        fontSize: '9px',
        letterSpacing: '0.09em',
        color: textColor,
        transition: 'color 0.2s ease',
        userSelect: 'none',
      }}>
        {label}
      </span>
    </button>
  );
}

// ─── Voice Toast ───────────────────────────────────────────────────────────
export function VoiceToast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'absolute',
      top: 52,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '6px 18px',
      background: 'rgba(8,11,16,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${toast.color}35`,
      borderRadius: radii.full,
      boxShadow: `0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px ${toast.color}18`,
      animation: toast.exiting ? 'toastOut 0.4s ease forwards' : 'toastIn 0.22s ease',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>
      {toast.heard && (
        <>
          <span style={{
            fontFamily: typography.monoFamily,
            fontSize: '10px',
            color: colors.textSecondary,
            letterSpacing: '0.02em',
            opacity: 0.65,
          }}>
            "{toast.heard}"
          </span>
          <span style={{ fontFamily: typography.monoFamily, fontSize: '9px', color: colors.textMuted }}>
            →
          </span>
        </>
      )}
      <div style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: toast.color,
        flexShrink: 0,
        boxShadow: `0 0 6px ${toast.color}`,
      }} />
      <span style={{
        fontFamily: typography.monoFamily,
        fontSize: '10px',
        fontWeight: typography.weights.semibold,
        letterSpacing: '0.10em',
        color: toast.color,
      }}>
        {toast.label}
      </span>
    </div>
  );
}

// ─── Mic SVG icon ──────────────────────────────────────────────────────────
function MicIcon({ color }) {
  return (
    <svg width="10" height="13" viewBox="0 0 10 13" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="0.5" width="4" height="7" rx="2" fill={color} />
      <path d="M1 6C1 8.5 2.5 10 5 10C7.5 10 9 8.5 9 6"
        stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <line x1="5" y1="10" x2="5" y2="12" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="12" x2="7" y2="12" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
