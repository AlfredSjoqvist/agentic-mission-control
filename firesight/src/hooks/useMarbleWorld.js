import { useState, useEffect } from 'react';
import { generateAndWait, WILDFIRE_PROMPT } from '../services/MarbleService.js';

const CACHE_KEY = 'marble_world_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROMPT_HASH = btoa(WILDFIRE_PROMPT).slice(0, 16); // stable cache key

// ─── Hook ──────────────────────────────────────────────────────────────────
// status: 'idle' | 'generating' | 'ready' | 'error'
// world:  { colliderMeshUrl, panoUrl, thumbnailUrl, splatUrls, worldId }
export default function useMarbleWorld(apiKey) {
  const [status,   setStatus]   = useState('idle');
  const [progress, setProgress] = useState('');
  const [world,    setWorld]    = useState(null);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!apiKey) return; // no key → stay idle, use procedural terrain

    // Check localStorage cache first
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (
          cached.promptHash === PROMPT_HASH &&
          Date.now() - cached.timestamp < CACHE_TTL_MS &&
          cached.world?.colliderMeshUrl
        ) {
          setWorld(cached.world);
          setStatus('ready');
          setProgress('Loaded from cache');
          return;
        }
      }
    } catch (_) {
      // ignore bad cache
    }

    // Generate fresh world
    let cancelled = false;
    setStatus('generating');

    generateAndWait(apiKey, (msg) => {
      if (!cancelled) setProgress(msg);
    })
      .then((w) => {
        if (cancelled) return;
        setWorld(w);
        setStatus('ready');
        setProgress('');
        // Persist to cache
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ promptHash: PROMPT_HASH, world: w, timestamp: Date.now() })
          );
        } catch (_) {}
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Marble] generation failed:', err);
        setError(err.message);
        setStatus('error');
      });

    return () => { cancelled = true; };
  }, [apiKey]);

  return { status, progress, world, error };
}
