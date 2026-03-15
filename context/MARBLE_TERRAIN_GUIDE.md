# Marble API — Generating Faithful Wildfire Terrain

## Critical Context

Marble was trained primarily on **indoor scenes and 3D renders**. Outdoor landscapes are a weaker domain. Photographic input (not text-only) is essential for faithful terrain. Expect "recognizably that place" fidelity, not survey-grade accuracy.

---

## Strategy: Image-to-3D with Satellite/Aerial Photos

Image input is the strongest path to faithful terrain. Text-only prompts force Marble to invent everything — use them only to steer interpretation of ambiguous areas.

### Step 1: Source the Best Input Image

**What to use:**
- Google Earth Pro screenshot (free, high-res, adjustable angle)
- Google Earth Studio export (can get oblique/45° angles)
- Sentinel-2 or Landsat satellite imagery (free, real, but flat nadir view)
- USGS aerial photography (high-res, real terrain)
- News helicopter footage stills from the actual Palisades fire

**Image requirements:**
- Format: JPG, PNG, or WebP
- Crop carefully — flat/blank borders become artifacts in 3D
- Photorealistic only — no annotated maps, no stylized renders
- Higher resolution = better (but Marble will resize internally)

**Best angle for 3D inference:**
- **Oblique/45° aerial view** (like Google Earth tilted) is MUCH better than straight-down nadir satellite view
- Marble needs visual depth cues (buildings casting shadows, hills showing slopes, roads curving around terrain) to infer 3D structure
- A straight-down flat satellite image gives Marble very little depth information — the result will be flatter and less accurate
- If you only have nadir imagery, combine it with a text prompt describing the terrain elevation

**Recommended approach for Palisades:**
1. Open Google Earth Pro → navigate to 34.045°N, 118.529°W (Palisades fire origin)
2. Tilt the view to ~45° angle showing the hillside, canyon, and neighborhood
3. Screenshot at maximum resolution
4. Crop to remove any Google Earth UI, watermarks, or blank sky borders
5. Use this as your image input

### Step 2: Combine Image + Text Prompt

Always pair the image with a text prompt. The text steers Marble's interpretation of what it can't see directly in the image.

**Template prompt for wildfire terrain:**

```
Photorealistic aerial view of [LOCATION NAME], California.
Steep chaparral-covered hillside with dry brown brush and scattered oak trees.
Mediterranean residential neighborhood with single-family homes on winding hillside roads.
Clear sky, harsh midday sunlight casting sharp shadows.
Elevation ranges from [LOW]ft to [HIGH]ft.
Canyon running [DIRECTION] with exposed rock faces.
```

**Example for Palisades:**

```
Photorealistic aerial view of Pacific Palisades, Los Angeles, California.
Steep chaparral-covered hillside descending into Topanga Canyon with dry brown brush
and scattered coastal live oak trees. Upscale residential neighborhood with
Mediterranean-style single-family homes on winding hillside roads.
Clear sky, harsh January sunlight, Santa Ana wind conditions with dry haze.
Elevation ranges from 200ft at the coast to 1400ft at the ridgeline.
Pacific Coast Highway visible along the southern edge near the ocean.
```

**Prompt rules:**
- Lead with "Photorealistic" — this steers the model away from stylized output
- Include specific vegetation types (chaparral, oak, brush) not just "trees"
- Mention the light conditions — shadows help Marble infer depth
- Include man-made structures (roads, homes) as landmarks — they anchor the 3D geometry
- Include elevation/slope language — "steep hillside", "canyon", "ridgeline"
- Do NOT include fire, smoke, or damage in the prompt — generate clean terrain first, overlay fire later
- Do NOT use poetic/artistic language — be descriptive and spatial

### Step 3: API Call Configuration

```python
import requests

API_KEY = "your-api-key"
HEADERS = {"WLT-Api-Key": API_KEY, "Content-Type": "application/json"}
BASE_URL = "https://api.worldlabs.ai/marble/v1"

# Option A: Image input (preferred for faithfulness)
payload = {
    "display_name": "Palisades Fire Zone - Sector NE",
    "model": "Marble 0.1-plus",        # Use plus for final, mini for iteration
    "world_prompt": {
        "type": "image",
        "text_prompt": "Photorealistic aerial view of Pacific Palisades, Los Angeles. Steep chaparral-covered hillside with dry brown brush, winding residential roads, Mediterranean homes. Clear sky, harsh sunlight. Elevation 200-1400ft.",
        "image_prompt": {
            "source": "uri",
            "uri": "https://your-hosted-image-url.com/palisades-aerial.jpg"
        }
    }
}

# Option B: Panorama input (highest fidelity if you have a 360 image)
# The panorama MUST be equirectangular, exactly 2:1 aspect ratio, full 180° vertical
payload_pano = {
    "display_name": "Palisades Fire Zone - Panoramic",
    "model": "Marble 0.1-plus",
    "world_prompt": {
        "type": "image",
        "text_prompt": "Photorealistic California hillside terrain with dry chaparral brush, residential neighborhood, canyon terrain. Harsh sunlight.",
        "image_prompt": {
            "source": "uri",
            "uri": "https://your-hosted-image-url.com/palisades-pano.jpg",
            "is_pano": True
        }
    }
}

# Submit generation
response = requests.post(f"{BASE_URL}/worlds:generate", json=payload, headers=HEADERS)
operation = response.json()
operation_id = operation["name"]  # e.g., "operations/op-abc123"

# Poll for completion
import time
while True:
    status = requests.get(f"{BASE_URL}/{operation_id}", headers=HEADERS).json()
    if status.get("done"):
        world = status["response"]
        break
    time.sleep(5)

# Get asset URLs
splats_500k = world["assets"]["splats"]["spz_urls"]["500k"]    # Best for PICO
splats_full = world["assets"]["splats"]["spz_urls"]["full_res"] # Best for desktop VR
collider_mesh = world["assets"]["mesh"]["collider_mesh_url"]    # For physics/collision
```

### Step 4: Iteration Workflow

Marble is non-deterministic — same input can produce different quality results. Iterate.

```
1. Generate 3-5 versions using Marble 0.1-mini (~30 sec each, 150 credits each)
   - Vary the text prompt slightly each time
   - Try different crop regions of the satellite image
   - Try different viewing angles (straight-down vs 45° oblique)

2. Preview each in the Marble web viewer (marble.worldlabs.ai)
   - Navigate around — check if terrain depth looks right
   - Check if buildings/roads are spatially coherent
   - Check if distant areas degrade too much

3. Pick the best result, regenerate with Marble 0.1-plus (~5 min, 1500 credits)
   - This is your hero terrain for the demo

4. Download the 500k SPZ file for PICO deployment
   - 500k splats ≈ 45MB, runs at ~12-19fps on standalone VR
   - Full res (2M splats) is desktop-only
```

### Step 5: Multi-Image Input (Most Control)

If you want maximum faithfulness, use multi-image prompting with photos from different angles.

```python
# Up to 4 images with manual direction, or up to 8 with auto-layout
payload_multi = {
    "display_name": "Palisades - Multi-Angle",
    "model": "Marble 0.1-plus",
    "world_prompt": {
        "type": "multi-image",
        "text_prompt": "Photorealistic Pacific Palisades hillside terrain, California. Dry chaparral, residential roads, canyon.",
        "multi_image_prompt": [
            {
                "azimuth": 0,      # Front (north-facing view)
                "content": {
                    "source": "uri",
                    "uri": "https://your-url.com/palisades-north.jpg"
                }
            },
            {
                "azimuth": 90,     # Right (east-facing view)
                "content": {
                    "source": "uri",
                    "uri": "https://your-url.com/palisades-east.jpg"
                }
            },
            {
                "azimuth": 180,    # Back (south-facing view)
                "content": {
                    "source": "uri",
                    "uri": "https://your-url.com/palisades-south.jpg"
                }
            },
            {
                "azimuth": 270,    # Left (west-facing view)
                "content": {
                    "source": "uri",
                    "uri": "https://your-url.com/palisades-west.jpg"
                }
            }
        ]
    }
}
```

**Multi-image rules:**
- All images must be the same resolution and aspect ratio
- Images should be from the same location, looking in different directions
- Some visual overlap between adjacent views improves coherence
- Google Earth Studio can export multiple angles of the same spot

---

## Covering a Larger Area: Chunk Strategy

Marble generates one "scene-sized" world per API call. For a larger fire zone, generate multiple chunks and compose them.

### Chunking approach:

```
Fire Zone Coverage (~3 mi × 2 mi)
┌──────────┬──────────┬──────────┐
│ Chunk A  │ Chunk B  │ Chunk C  │
│ (Ridge)  │ (Canyon) │ (Coast)  │
│          │          │          │
├──────────┼──────────┼──────────┤
│ Chunk D  │ Chunk E  │ Chunk F  │
│ (North   │ (Fire    │ (PCH     │
│  homes)  │  origin) │  area)   │
└──────────┴──────────┴──────────┘

For each chunk:
1. Screenshot that area from Google Earth at ~45° angle
2. Generate with Marble API (image + text prompt specific to that chunk)
3. Download 500k SPZ
```

### Composing chunks:

**Option A: Marble Studio Compose (UI-based)**
- Upload all chunks to Marble Studio
- Position with X/Y/Z coordinates, match floor heights
- Export composed scene

**Option B: Manual composition in your renderer (code-based)**
- Load each SPZ as a separate Gaussian splat object in Three.js / Unity
- Position them in a grid with matching offsets
- Seams between chunks will be visible — place your fire/UI overlays to mask them

**Option C (recommended for hackathon): Just use ONE chunk**
- Generate the most dramatic chunk (fire origin + nearby homes + canyon)
- This is enough for a 3-minute demo
- Avoids all composition complexity
- Judges care about the interaction loop, not geographic coverage

---

## Fallback Strategy

Pre-generate and cache terrain BEFORE the demo. Never depend on live API calls during a 3-minute demo.

```
Pre-demo preparation:
├── palisades_hero.spz          # Best quality, Marble 0.1-plus
├── palisades_backup1.spz       # Second-best generation
├── palisades_backup2.spz       # Alternative angle
└── palisades_mini_live.spz     # Quick-gen for "live API demo" moment
```

If you want to show the API working live during the demo:
1. Start loading the pre-cached hero terrain immediately
2. While user explores, kick off a Marble 0.1-mini generation in the background (~30 sec)
3. When it completes, offer to "swap to the fresh generation" — shows the API is real
4. If it fails or looks bad, you're already on the pre-cached terrain

---

## What NOT To Do

- Don't generate terrain from text-only prompts — too much invented, not faithful to real geography
- Don't use annotated maps, GIS overlays, or labeled imagery as input — Marble will try to reproduce the labels as 3D objects
- Don't include fire/smoke in the input image — generate clean terrain, overlay fire separately
- Don't use the full-res 2M splats on PICO — it will run at <10fps
- Don't generate terrain live during the demo without a cached fallback
- Don't try to stitch >3 chunks for the hackathon — diminishing returns, high complexity
- Don't use illustrations, artistic renders, or stylized images as input — Marble produces grainy/buggy results from non-photographic sources
