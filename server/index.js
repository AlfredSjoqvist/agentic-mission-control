import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { mountCommandApi } from './commandApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const API_BASE = 'https://api.worldlabs.ai/marble/v1';
const API_KEY = process.env.MARBLE_API_KEY;
const apiHeaders = {
  'WLT-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

const GRID_DIR = resolve(__dirname, '..', 'assets', 'grid');
if (!existsSync(GRID_DIR)) mkdirSync(GRID_DIR, { recursive: true });

// ─── Grid cell size (degrees) ─────────────────────────────────────────
const GRID_SIZE = 0.008; // ~800m per cell

function cellId(lat, lng) {
  const row = Math.floor(lat / GRID_SIZE);
  const col = Math.floor(lng / GRID_SIZE);
  return `${row}_${col}`;
}

function cellCenter(lat, lng) {
  const row = Math.floor(lat / GRID_SIZE);
  const col = Math.floor(lng / GRID_SIZE);
  return {
    lat: (row + 0.5) * GRID_SIZE,
    lng: (col + 0.5) * GRID_SIZE,
  };
}

// ─── In-memory grid cache ─────────────────────────────────────────────
// States: 'generating' | 'ready' | 'error'
const gridCache = new Map(); // cellId → { state, worldId, splatUrl, operationId, progress, error }

// Load any previously cached cells from disk
function loadCacheFromDisk() {
  const indexPath = resolve(GRID_DIR, 'index.json');
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
      for (const [id, entry] of Object.entries(data)) {
        // Only load 'ready' entries — re-check that the splat file exists
        if (entry.state === 'ready' && entry.splatFile && existsSync(resolve(GRID_DIR, entry.splatFile))) {
          gridCache.set(id, entry);
        }
      }
      console.log(`Loaded ${gridCache.size} cached grid cells from disk`);
    } catch (e) {
      console.warn('Failed to load grid cache:', e.message);
    }
  }
}
loadCacheFromDisk();

function saveCacheToDisk() {
  const indexPath = resolve(GRID_DIR, 'index.json');
  const data = {};
  for (const [id, entry] of gridCache.entries()) {
    if (entry.state === 'ready') data[id] = entry;
  }
  writeFileSync(indexPath, JSON.stringify(data, null, 2));
}

// Also register the pre-generated world from manifest as the cell it belongs to
function registerPreGenerated() {
  const manifestPath = resolve(__dirname, '..', 'assets', 'worlds', 'manifest.json');
  if (!existsSync(manifestPath)) return;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    for (const world of manifest.worlds || []) {
      if (world.splat && world.center) {
        const id = cellId(world.center.lat, world.center.lng);
        if (!gridCache.has(id)) {
          gridCache.set(id, {
            state: 'ready',
            worldId: world.worldId,
            splatUrl: `/assets/worlds/${world.splat}`,
            splatFile: null, // served from /assets/worlds/ not /assets/grid/
            lat: world.center.lat,
            lng: world.center.lng,
          });
          console.log(`Pre-registered world "${world.name}" as cell ${id}`);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to register pre-generated worlds:', e.message);
  }
}
registerPreGenerated();

// ─── Generate a world for a grid cell ─────────────────────────────────
async function generateCell(id, lat, lng) {
  const center = cellCenter(lat, lng);
  console.log(`\n[Grid] Generating cell ${id} at (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`);

  gridCache.set(id, { state: 'generating', progress: 'Starting...', lat: center.lat, lng: center.lng });

  try {
    // Use real satellite image for geographic consistency
    const tileUrl = getSatelliteTileUrl(center.lat, center.lng, 16);
    const textPrompt = buildLocationPrompt(center.lat, center.lng);
    console.log(`[Grid] Satellite tile: ${tileUrl}`);

    const genRes = await fetch(`${API_BASE}/worlds:generate`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        display_name: `Grid ${id} — ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`,
        model: 'Marble 0.1-mini',
        world_prompt: {
          type: 'image',
          image_prompt: { source: 'uri', uri: tileUrl },
          text_prompt: textPrompt,
        },
      }),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      throw new Error(`Generation API error: ${genRes.status} ${err}`);
    }

    const genData = await genRes.json();
    const operationId = genData.operation_id;
    console.log(`[Grid] Cell ${id} operation: ${operationId}`);

    gridCache.set(id, { ...gridCache.get(id), operationId, progress: 'Queued...' });

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 min max
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;

      const pollRes = await fetch(`${API_BASE}/operations/${operationId}`, {
        headers: { 'WLT-Api-Key': API_KEY },
      });
      const pollData = await pollRes.json();

      const progressText = pollData.metadata?.progress?.description
        || pollData.metadata?.progress?.status
        || `Working... (${attempts * 5}s)`;

      const cached = gridCache.get(id);
      if (cached) cached.progress = progressText;

      if (pollData.done) {
        if (pollData.error) {
          throw new Error(JSON.stringify(pollData.error));
        }

        const worldId = pollData.metadata?.world_id || pollData.response?.world_id;
        console.log(`[Grid] Cell ${id} done! World: ${worldId}`);

        // Get world details
        const worldRes = await fetch(`${API_BASE}/worlds/${worldId}`, {
          headers: { 'WLT-Api-Key': API_KEY },
        });
        const worldData = await worldRes.json();

        // Find splat URL
        const spzUrls = worldData.assets?.splats?.spz_urls;
        const splatCdnUrl = spzUrls?.['500k'] || spzUrls?.['full_res'] || spzUrls?.['100k'];

        if (!splatCdnUrl) {
          throw new Error('No splat URL in world data');
        }

        // Download splat to grid cache
        const splatFile = `${id}.spz`;
        const splatPath = resolve(GRID_DIR, splatFile);
        console.log(`[Grid] Downloading splat for cell ${id}...`);
        const splatRes = await fetch(splatCdnUrl);
        if (!splatRes.ok) throw new Error(`Splat download failed: ${splatRes.status}`);
        const splatBuffer = Buffer.from(await splatRes.arrayBuffer());
        writeFileSync(splatPath, splatBuffer);
        console.log(`[Grid] Saved ${(splatBuffer.length / 1024 / 1024).toFixed(1)}MB → ${splatFile}`);

        gridCache.set(id, {
          state: 'ready',
          worldId,
          splatUrl: `/assets/grid/${splatFile}`,
          splatFile,
          lat: center.lat,
          lng: center.lng,
        });
        saveCacheToDisk();
        return;
      }
    }

    throw new Error('Generation timed out');
  } catch (err) {
    console.error(`[Grid] Cell ${id} error:`, err.message);
    gridCache.set(id, { state: 'error', error: err.message, lat, lng });
  }
}

// Convert lat/lng to Esri satellite tile URL
function getSatelliteTileUrl(lat, lng, zoom = 16) {
  const n = Math.pow(2, zoom);
  const tileX = Math.floor((lng + 180) / 360 * n);
  const tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`;
}

function buildLocationPrompt(lat, lng) {
  const isCoastal = lng < -118.52;
  const isHilly = lat > 34.04;
  const isBurned = lat > 34.03 && lat < 34.06 && lng > -118.56 && lng < -118.49;

  let description = `Satellite view of Pacific Palisades, Los Angeles at ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°W. `;
  if (isBurned) description += 'Wildfire-damaged terrain with burn scars. ';
  if (isCoastal) description += 'Pacific coast, ocean shoreline. ';
  if (isHilly) description += 'Santa Monica Mountain ridges. ';
  description += 'Photorealistic aerial terrain.';
  return description;
}

// ─── API Routes ───────────────────────────────────────────────────────

// Serve pre-generated assets
app.use('/assets', express.static(resolve(__dirname, '..', 'assets')));

// Get grid state — all cells and their status
app.get('/api/grid', (req, res) => {
  const cells = {};
  for (const [id, entry] of gridCache.entries()) {
    cells[id] = {
      state: entry.state,
      lat: entry.lat,
      lng: entry.lng,
      splatUrl: entry.state === 'ready' ? entry.splatUrl : undefined,
      progress: entry.state === 'generating' ? entry.progress : undefined,
      error: entry.state === 'error' ? entry.error : undefined,
    };
  }
  res.json({ gridSize: GRID_SIZE, cells });
});

// Get single cell status
app.get('/api/grid/:cellId', (req, res) => {
  const entry = gridCache.get(req.params.cellId);
  if (!entry) return res.json({ state: 'empty' });
  res.json({
    state: entry.state,
    lat: entry.lat,
    lng: entry.lng,
    splatUrl: entry.state === 'ready' ? entry.splatUrl : undefined,
    progress: entry.state === 'generating' ? entry.progress : undefined,
    error: entry.state === 'error' ? entry.error : undefined,
  });
});

// Request generation of a cell (or return existing)
app.post('/api/grid/generate', (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });

  const id = cellId(lat, lng);
  const existing = gridCache.get(id);

  if (existing?.state === 'ready') {
    return res.json({ cellId: id, state: 'ready', splatUrl: existing.splatUrl, lat: existing.lat, lng: existing.lng });
  }
  if (existing?.state === 'generating') {
    return res.json({ cellId: id, state: 'generating', progress: existing.progress });
  }

  // Start generation in background
  generateCell(id, lat, lng);
  res.json({ cellId: id, state: 'generating', progress: 'Starting...' });
});

// Request generation of multiple adjacent cells
app.post('/api/grid/generate-adjacent', (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });

  const centerRow = Math.floor(lat / GRID_SIZE);
  const centerCol = Math.floor(lng / GRID_SIZE);
  const queued = [];

  // Generate 3x3 grid around the center
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = centerRow + dr;
      const c = centerCol + dc;
      const id = `${r}_${c}`;
      const cellLat = (r + 0.5) * GRID_SIZE;
      const cellLng = (c + 0.5) * GRID_SIZE;

      const existing = gridCache.get(id);
      if (!existing || existing.state === 'error') {
        generateCell(id, cellLat, cellLng);
        queued.push(id);
      }
    }
  }

  res.json({ queued, message: `Queued ${queued.length} cells for generation` });
});

// ─── Existing Marble API proxies ──────────────────────────────────────

app.post('/api/worlds/generate', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/worlds:generate`, {
      method: 'POST', headers: apiHeaders, body: JSON.stringify(req.body),
    });
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/operations/:id', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/operations/${req.params.id}`, {
      headers: { 'WLT-Api-Key': API_KEY },
    });
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/worlds/:id', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/worlds/${req.params.id}`, {
      headers: { 'WLT-Api-Key': API_KEY },
    });
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/worlds', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/worlds`, {
      headers: { 'WLT-Api-Key': API_KEY },
    });
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/proxy-asset', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url param required' });
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'upstream error' });
    res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Client-side log relay (browser → server terminal) ────────────────
app.post('/api/log', (req, res) => {
  const entries = req.body;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const lvl = (e.level || 'log').toUpperCase().padEnd(5);
      console.log(`[CLIENT ${lvl}] ${e.msg}`);
    }
  } else if (entries && entries.msg) {
    console.log(`[CLIENT] ${entries.msg}`);
  }
  res.json({ ok: true });
});

// ─── Command API (OpenClaw / Telegram interface) ─────────────────────────────
// getEngineState returns a snapshot of the ICS engine for status queries.
// In production this would connect to the shared ICSEngine instance.
// For now it returns empty state — the frontend pushes state via POST /api/engine-state.
let latestEngineState = {};
app.post('/api/engine-state', (req, res) => {
  latestEngineState = req.body;
  res.json({ ok: true });
});
mountCommandApi(app, () => latestEngineState);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`FireSight server running on http://localhost:${PORT}`);
  console.log(`Marble API key: ${API_KEY ? 'loaded' : 'MISSING'}`);
  console.log(`Grid cache: ${gridCache.size} cells loaded`);
  console.log(`Command API: http://localhost:${PORT}/api/command (OpenClaw/Telegram)`);
  console.log(`Strategy SSE: http://localhost:${PORT}/api/strategy/stream`);
});
