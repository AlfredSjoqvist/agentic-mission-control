#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pre-generate grid — Generates Marble worlds for every cell in the fire zone
// and caches splats to assets/grid/ so they load instantly at runtime.
//
// Usage:
//   node server/pre-generate-grid.js          # core 4×5 area (20 cells)
//   node server/pre-generate-grid.js --full   # full 7×9 area (63 cells)
//   node server/pre-generate-grid.js --tiny   # 2×2 test area (4 cells)
//
// Skips cells that already have cached splats. Safe to re-run.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const API_BASE = 'https://api.worldlabs.ai/marble/v1';
const API_KEY = process.env.MARBLE_API_KEY;
const GRID_DIR = resolve(__dirname, '..', 'assets', 'grid');
const WORLDS_DIR = resolve(__dirname, '..', 'assets', 'worlds');

if (!API_KEY) { console.error('MARBLE_API_KEY not found in .env'); process.exit(1); }
if (!existsSync(GRID_DIR)) mkdirSync(GRID_DIR, { recursive: true });

const headers = { 'WLT-Api-Key': API_KEY, 'Content-Type': 'application/json' };

// ─── Grid config ──────────────────────────────────────────────────────
const GRID_SIZE = 0.008;
const PALISADES = { lat: 34.045, lng: -118.529 };

// Grid extents for different modes
const EXTENTS = {
  tiny: { // 2×2 = 4 cells (quick test)
    minRow: Math.floor(PALISADES.lat / GRID_SIZE) - 0,
    maxRow: Math.floor(PALISADES.lat / GRID_SIZE) + 1,
    minCol: Math.floor(PALISADES.lng / GRID_SIZE) - 0,
    maxCol: Math.floor(PALISADES.lng / GRID_SIZE) + 1,
  },
  '3x3': { // 3×3 = 9 cells centered on fire
    minRow: Math.floor(PALISADES.lat / GRID_SIZE) - 1,
    maxRow: Math.floor(PALISADES.lat / GRID_SIZE) + 1,
    minCol: Math.floor(PALISADES.lng / GRID_SIZE) - 1,
    maxCol: Math.floor(PALISADES.lng / GRID_SIZE) + 1,
  },
  '6x6': { // 6×6 = 36 cells — mixed terrain (coast, mountains, fire, urban)
    minRow: Math.floor(PALISADES.lat / GRID_SIZE) - 3,
    maxRow: Math.floor(PALISADES.lat / GRID_SIZE) + 2,
    minCol: Math.floor(PALISADES.lng / GRID_SIZE) - 3,
    maxCol: Math.floor(PALISADES.lng / GRID_SIZE) + 2,
  },
  core: { // 4×5 = 20 cells (main fire area)
    minRow: Math.floor(PALISADES.lat / GRID_SIZE) - 2,
    maxRow: Math.floor(PALISADES.lat / GRID_SIZE) + 2,
    minCol: Math.floor(PALISADES.lng / GRID_SIZE) - 2,
    maxCol: Math.floor(PALISADES.lng / GRID_SIZE) + 2,
  },
  full: { // 7×9 = 63 cells (entire fire perimeter)
    minRow: Math.floor(34.020 / GRID_SIZE),
    maxRow: Math.floor(34.068 / GRID_SIZE),
    minCol: Math.floor(-118.555 / GRID_SIZE),
    maxCol: Math.floor(-118.490 / GRID_SIZE),
  },
};

const mode = process.argv.includes('--full') ? 'full' : process.argv.includes('--6x6') ? '6x6' : process.argv.includes('--tiny') ? 'tiny' : process.argv.includes('--3x3') ? '3x3' : 'core';
const extent = EXTENTS[mode];

// ─── Load existing cache ──────────────────────────────────────────────
function loadIndex() {
  const indexPath = resolve(GRID_DIR, 'index.json');
  if (existsSync(indexPath)) {
    try { return JSON.parse(readFileSync(indexPath, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function saveIndex(index) {
  writeFileSync(resolve(GRID_DIR, 'index.json'), JSON.stringify(index, null, 2));
}

function isCellCached(id, index) {
  // Check grid cache
  if (index[id]?.state === 'ready' && index[id].splatFile && existsSync(resolve(GRID_DIR, index[id].splatFile))) {
    return true;
  }
  // Check if it's the pre-generated world from manifest
  const manifestPath = resolve(WORLDS_DIR, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      for (const w of manifest.worlds || []) {
        if (w.center && w.splat) {
          const wId = `${Math.floor(w.center.lat / GRID_SIZE)}_${Math.floor(w.center.lng / GRID_SIZE)}`;
          if (wId === id && existsSync(resolve(WORLDS_DIR, w.splat))) return true;
        }
      }
    } catch {}
  }
  return false;
}

// ─── Satellite tile URL builder ───────────────────────────────────────
// Uses Esri World Imagery (public, no key needed) — gives Marble real satellite images
function getSatelliteTileUrl(lat, lng, zoom = 16) {
  // Convert lat/lng to slippy map tile coords
  const n = Math.pow(2, zoom);
  const tileX = Math.floor((lng + 180) / 360 * n);
  const tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`;
}

// ─── Location-aware text prompt builder ──────────────────────────────
function buildTextPrompt(lat, lng) {
  const isCoastal = lng < -118.52;
  const isHilly = lat > 34.04;
  const isBurned = lat > 34.025 && lat < 34.065 && lng > -118.56 && lng < -118.49;
  const isUrban = lat < 34.04 && lng > -118.53;

  let desc = `Satellite view of Pacific Palisades, Los Angeles area at ${lat.toFixed(4)}°N, ${Math.abs(lng).toFixed(4)}°W. `;
  if (isBurned) desc += 'Wildfire-damaged terrain with charred hillsides and burn scars. ';
  if (isCoastal) desc += 'Pacific coast, beaches, ocean shoreline. ';
  if (isHilly) desc += 'Santa Monica Mountain ridges, canyons. ';
  if (isUrban) desc += 'Residential neighborhood, houses, streets. ';
  desc += 'Photorealistic aerial terrain.';
  return desc;
}

// ─── Generate one world ──────────────────────────────────────────────
async function generateWorld(cellId, lat, lng) {
  const tileUrl = getSatelliteTileUrl(lat, lng, 16);
  const textPrompt = buildTextPrompt(lat, lng);
  console.log(`    Satellite tile: ${tileUrl}`);

  // Use IMAGE prompt with real satellite tile for geographic consistency
  const genRes = await fetch(`${API_BASE}/worlds:generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      display_name: `Grid ${cellId} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
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
    throw new Error(`API ${genRes.status}: ${err}`);
  }

  const { operation_id } = await genRes.json();

  // Poll
  let attempts = 0;
  while (attempts < 150) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;

    const pollRes = await fetch(`${API_BASE}/operations/${operation_id}`, {
      headers: { 'WLT-Api-Key': API_KEY },
    });
    const poll = await pollRes.json();

    const status = poll.metadata?.progress?.description || poll.metadata?.progress?.status || '';
    if (status) process.stdout.write(`\r    Status: ${status.padEnd(50)}`);

    if (poll.done) {
      process.stdout.write('\r' + ' '.repeat(70) + '\r');
      if (poll.error) throw new Error(JSON.stringify(poll.error));

      const worldId = poll.metadata?.world_id || poll.response?.world_id;

      // Get world details
      const worldRes = await fetch(`${API_BASE}/worlds/${worldId}`, {
        headers: { 'WLT-Api-Key': API_KEY },
      });
      const worldData = await worldRes.json();

      // Find splat URL
      const spzUrls = worldData.assets?.splats?.spz_urls;
      const splatUrl = spzUrls?.['500k'] || spzUrls?.['full_res'] || spzUrls?.['100k'];
      if (!splatUrl) throw new Error('No splat URL in response');

      // Download splat
      const splatFile = `${cellId}.spz`;
      const splatPath = resolve(GRID_DIR, splatFile);
      const splatRes = await fetch(splatUrl);
      if (!splatRes.ok) throw new Error(`Download failed: ${splatRes.status}`);
      const buffer = Buffer.from(await splatRes.arrayBuffer());
      writeFileSync(splatPath, buffer);

      return {
        state: 'ready',
        worldId,
        splatUrl: `/assets/grid/${splatFile}`,
        splatFile,
        lat, lng,
        sizeMB: (buffer.length / 1024 / 1024).toFixed(1),
      };
    }
  }

  throw new Error('Timed out');
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  const index = loadIndex();

  // Build list of cells to generate
  const cells = [];
  for (let row = extent.minRow; row <= extent.maxRow; row++) {
    for (let col = extent.minCol; col <= extent.maxCol; col++) {
      const id = `${row}_${col}`;
      const lat = (row + 0.5) * GRID_SIZE;
      const lng = (col + 0.5) * GRID_SIZE;
      cells.push({ id, row, col, lat, lng });
    }
  }

  const cached = cells.filter(c => isCellCached(c.id, index));
  const toGenerate = cells.filter(c => !isCellCached(c.id, index));

  console.log(`\n━━━ FireSight Grid Pre-Generator ━━━`);
  console.log(`Mode: ${mode}`);
  console.log(`Grid: rows ${extent.minRow}–${extent.maxRow}, cols ${extent.minCol}–${extent.maxCol}`);
  console.log(`Total cells: ${cells.length}`);
  console.log(`Already cached: ${cached.length}`);
  console.log(`To generate: ${toGenerate.length}`);
  console.log(`Est. time: ~${toGenerate.length * 2} minutes\n`);

  if (toGenerate.length === 0) {
    console.log('All cells are already cached! Nothing to do.');
    return;
  }

  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const cell of toGenerate) {
    const progress = `[${completed + failed + 1}/${toGenerate.length}]`;
    console.log(`${progress} Generating cell ${cell.id} (${cell.lat.toFixed(4)}, ${cell.lng.toFixed(4)})...`);

    try {
      const result = await generateWorld(cell.id, cell.lat, cell.lng);
      index[cell.id] = result;
      saveIndex(index);
      completed++;
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`  ✓ Done — ${result.sizeMB}MB, worldId: ${result.worldId} (${elapsed}min elapsed)`);
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed: ${err.message}`);
      index[cell.id] = { state: 'error', error: err.message, lat: cell.lat, lng: cell.lng };
      saveIndex(index);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n━━━ Complete ━━━`);
  console.log(`Generated: ${completed}, Failed: ${failed}, Total time: ${totalTime} min`);
  console.log(`Cache: ${resolve(GRID_DIR, 'index.json')}`);
  console.log(`\nRestart the server to load the new cells.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
