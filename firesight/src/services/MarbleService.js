// ─── World Labs Marble API service ────────────────────────────────────────
const BASE = 'https://api.worldlabs.ai';
const POLL_INTERVAL_MS = 4000;

const WILDFIRE_PROMPT =
  'California wildfire terrain, rolling hills covered in dry chaparral and pine forest, ' +
  'El Dorado County foothills, late summer, aerial view, dramatic fire-scorched ridgelines, ' +
  'ash-covered slopes, rugged canyons with dry creek beds';

export { WILDFIRE_PROMPT };

export async function generateWorld(apiKey) {
  const res = await fetch(`${BASE}/marble/v1/worlds:generate`, {
    method: 'POST',
    headers: {
      'WLT-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      display_name: 'FireSight — Pine Ridge Complex',
      world_prompt: { type: 'text', text_prompt: WILDFIRE_PROMPT },
      model: 'Marble 0.1-mini',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Marble API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Response contains operation_id at top level or nested
  return data.operation_id || data.name?.split('/').pop();
}

export async function pollOperation(apiKey, operationId) {
  const res = await fetch(`${BASE}/marble/v1/operations/${operationId}`, {
    headers: { 'WLT-Api-Key': apiKey },
  });

  if (!res.ok) throw new Error(`Poll error ${res.status}`);
  return res.json(); // { done, world: { assets: { mesh, imagery, splats } } }
}

// Generates a world and polls until done. Calls onProgress(msg) periodically.
// Returns a normalized world object: { colliderMeshUrl, panoUrl, thumbnailUrl, worldId }
export async function generateAndWait(apiKey, onProgress) {
  onProgress('Requesting world model from Marble API…');
  const operationId = await generateWorld(apiKey);

  onProgress('Generation started — polling for completion…');

  let attempts = 0;
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    attempts++;

    const op = await pollOperation(apiKey, operationId);

    if (op.done) {
      const world = op.response || op.world || op;
      return normalizeWorld(world);
    }

    const elapsed = Math.round((attempts * POLL_INTERVAL_MS) / 1000);
    onProgress(`Marble generating terrain… ${elapsed}s`);

    if (attempts > 120) throw new Error('Marble generation timed out after 8 minutes');
  }
}

function normalizeWorld(world) {
  const assets = world.assets || world;
  const spzUrls = assets?.splats?.spz_urls || {};
  // Pick smallest available resolution for fast loading; fall back up chain
  const splatUrl = spzUrls['100k'] || spzUrls['500k'] || spzUrls['full_res'] || null;
  return {
    worldId:         world.world_id || world.name || null,
    colliderMeshUrl: assets?.mesh?.collider_mesh_url   || null,
    panoUrl:         assets?.imagery?.pano_url          || null,
    thumbnailUrl:    assets?.thumbnail_url              || null,
    splatUrl,
    splatUrls:       spzUrls,
    marbleViewUrl:   world.world_marble_url             || null,
    caption:         assets?.caption                    || null,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
