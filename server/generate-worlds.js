import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const API_BASE = 'https://api.worldlabs.ai/marble/v1';
const API_KEY = process.env.MARBLE_API_KEY;
const ASSETS_DIR = resolve(__dirname, '..', 'assets', 'worlds');

if (!API_KEY) {
  console.error('MARBLE_API_KEY not found in .env');
  process.exit(1);
}

const headers = {
  'WLT-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

// Palisades fire zone — NASA satellite imagery (public domain)
const WORLDS_TO_GENERATE = [
  {
    name: 'palisades-fire-satellite',
    request: {
      display_name: 'Palisades Fire Zone - Satellite View',
      model: 'Marble 0.1-mini',
      world_prompt: {
        type: 'image',
        image_prompt: {
          source: 'uri',
          uri: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/153000/153793/palisadesfire_msi_20250107_lrg.jpg',
        },
        text_prompt: 'Aerial satellite view of the Palisades wildfire zone in Los Angeles, California. Mountainous terrain with Pacific Palisades neighborhood, Santa Monica Mountains, dry chaparral hillside, smoke and active fire visible. January 2025.',
      },
    },
  },
  {
    name: 'palisades-fire-natural',
    request: {
      display_name: 'Palisades Fire Zone - Natural Color',
      model: 'Marble 0.1-mini',
      world_prompt: {
        type: 'image',
        image_prompt: {
          source: 'uri',
          uri: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/153000/153831/lafires_oli2_20250114_lrg.jpg',
        },
        text_prompt: 'Natural color satellite view of the Los Angeles Palisades fire aftermath. Burn scars visible on mountainous terrain, Pacific coast, Santa Monica Mountains. Wildfire damage zone aerial view.',
      },
    },
  },
  {
    name: 'palisades-fire-text',
    request: {
      display_name: 'Palisades Fire Zone - Generated',
      model: 'Marble 0.1-mini',
      world_prompt: {
        type: 'text',
        text_prompt: 'Aerial view looking down at the Pacific Palisades neighborhood in Los Angeles during the January 2025 wildfire. Mountainous terrain with dry brown chaparral, burning hillsides with orange flames and smoke columns, the Pacific Ocean visible in the background, winding roads through steep canyon terrain. Dramatic wildfire scene from above.',
      },
    },
  },
];

async function generateWorld(worldConfig) {
  console.log(`\nGenerating: ${worldConfig.name}`);
  console.log(`  Model: ${worldConfig.request.model}`);
  console.log(`  Type: ${worldConfig.request.world_prompt.type}`);

  // Step 1: Start generation
  const genResponse = await fetch(`${API_BASE}/worlds:generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(worldConfig.request),
  });

  if (!genResponse.ok) {
    const err = await genResponse.text();
    console.error(`  Generation failed: ${genResponse.status} ${err}`);
    return null;
  }

  const genData = await genResponse.json();
  const operationId = genData.operation_id;
  console.log(`  Operation ID: ${operationId}`);

  // Step 2: Poll until done
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000)); // poll every 5s
    attempts++;

    const pollResponse = await fetch(`${API_BASE}/operations/${operationId}`, {
      headers: { 'WLT-Api-Key': API_KEY },
    });
    const pollData = await pollResponse.json();

    if (pollData.metadata?.progress) {
      console.log(`  Progress: ${pollData.metadata.progress.description || pollData.metadata.progress.status || 'working...'}`);
    }

    if (pollData.done) {
      if (pollData.error) {
        console.error(`  Error: ${JSON.stringify(pollData.error)}`);
        return null;
      }

      const worldId = pollData.metadata?.world_id || pollData.response?.world_id;
      console.log(`  Done! World ID: ${worldId}`);

      // Step 3: Get world details
      const worldResponse = await fetch(`${API_BASE}/worlds/${worldId}`, {
        headers: { 'WLT-Api-Key': API_KEY },
      });
      const worldData = await worldResponse.json();

      // Save full response for debugging
      writeFileSync(
        resolve(ASSETS_DIR, `${worldConfig.name}-response.json`),
        JSON.stringify(worldData, null, 2)
      );
      console.log(`  Saved response to ${worldConfig.name}-response.json`);

      return {
        name: worldConfig.name,
        displayName: worldConfig.request.display_name,
        worldId,
        worldData,
      };
    }
  }

  console.error(`  Timed out after ${maxAttempts * 5}s`);
  return null;
}

async function downloadAsset(url, filepath) {
  console.log(`  Downloading: ${filepath}`);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  Download failed: ${response.status}`);
    return false;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(filepath, buffer);
  console.log(`  Saved (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return true;
}

async function main() {
  if (!existsSync(ASSETS_DIR)) {
    mkdirSync(ASSETS_DIR, { recursive: true });
  }

  console.log('=== FireSight World Generator ===');
  console.log(`API Key: ${API_KEY.slice(0, 8)}...`);
  console.log(`Output: ${ASSETS_DIR}`);

  // Parse CLI args — generate specific world or all
  const targetIndex = process.argv[2] ? parseInt(process.argv[2]) : null;
  const worldsToGen = targetIndex !== null
    ? [WORLDS_TO_GENERATE[targetIndex]]
    : WORLDS_TO_GENERATE;

  const manifest = { worlds: [] };

  for (const worldConfig of worldsToGen) {
    if (!worldConfig) continue;
    const result = await generateWorld(worldConfig);
    if (!result) continue;

    // Try to find and download splat + collider from the world data
    const worldData = result.worldData;

    // The world data structure varies — look for assets
    const assets = worldData.assets || worldData.exports || {};
    console.log(`  Available assets: ${JSON.stringify(Object.keys(worldData), null, 2)}`);

    const manifestEntry = {
      name: result.displayName,
      worldId: result.worldId,
      marbleUrl: `https://marble.worldlabs.ai/world/${result.worldId}`,
    };

    // Download splat file — actual structure: assets.splats.spz_urls.{500k, full_res, 100k}
    const spzUrls = assets.splats?.spz_urls;
    if (spzUrls) {
      const splatUrl = spzUrls['500k'] || spzUrls['full_res'] || spzUrls['100k'];
      if (splatUrl) {
        const filename = `${result.name}.spz`;
        await downloadAsset(splatUrl, resolve(ASSETS_DIR, filename));
        manifestEntry.splat = filename;
      }
    }

    // Download collider mesh if available (requires Pro plan)
    const colliderUrl = assets.mesh?.collider_mesh_url;
    if (colliderUrl) {
      const filename = `${result.name}.glb`;
      await downloadAsset(colliderUrl, resolve(ASSETS_DIR, filename));
      manifestEntry.collider = filename;
    }

    manifest.worlds.push(manifestEntry);
  }

  // Save manifest
  writeFileSync(
    resolve(ASSETS_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`\nManifest saved with ${manifest.worlds.length} worlds`);
  console.log('\nDone! Check the -response.json files for full API output and asset URLs.');
}

main().catch(console.error);
