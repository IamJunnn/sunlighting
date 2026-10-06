# SunLighting

A web app for seeing how sunlight and shadows play across any place on Earth, hour by hour and season by season. Pick a point on the map and get:

- **3D buildings mode (default)**: CesiumJS streaming Google Photorealistic 3D Tiles (real building models) and Cesium World Terrain, lit by the sun for the chosen date and time with cast shadows. Click the exact window on a building and the app ray-casts from that spot towards the sun every 10 minutes of the day, through every neighbouring building, to report direct-sun hours, first and last light, and a month-by-month chart. This mode needs a free [Cesium ion](https://ion.cesium.com/signup) access token, pasted into the Controls panel (it is stored in the browser only). After signing up, add **Google Photorealistic 3D Tiles** (asset 2275207) from the Asset Depot to your account. The free Community plan is for non-commercial use and includes 1,000 Google root-tile loads a month.
- **Terrain mode**: everything below, keyless.

- **3D terrain view** built from real elevation data, draped with satellite imagery and lit by the sun's true position for the chosen date and time, with cast shadows.
- **3D sun path dome** showing the sun's arc for the selected day (with hour markers) plus the solstice and equinox arcs for comparison, and a compass.
- **Terrain-aware sunlight analysis at the property**: astronomical vs. *effective* sunrise/sunset (first and last moment the sun clears the surrounding skyline), hours of direct sun vs. hours lost to terrain, a 24-hour timeline, a month-by-month chart for the whole year, and a skyline-vs-sun-path chart.
- **Sun-hours heatmap**: a layer colouring the whole terrain by how many hours of direct sun each spot receives on the chosen day (computed in a web worker).
- **Playback** through a day at adjustable speed, season presets, and shareable URLs that encode location, date, time and layer.

## Keys

Copy `.env.example` to `.env.local` and fill in the two keys (both free tiers). Restrict each key to your site's URL in its console so it cannot be used elsewhere, even though it ships in the page. Without the Google key, search by business name falls back to OpenStreetMap geocoding; without the Cesium token, the 3D buildings do not load.

## Deploying (Cloudflare Workers)

`wrangler.jsonc` serves `dist/` as a single-page app. The keys are read at build time, so build with `.env.local` present, then deploy:

```bash
npm run build
npx wrangler deploy
```

Add the production hostname to the Google key's website restrictions and to the Cesium token's allowed URLs.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
```

No API keys are needed. Data comes from public tile services:

| Data | Source |
|---|---|
| 3D buildings & terrain (buildings mode) | **Google Photorealistic 3D Tiles** and **Cesium World Terrain** via Cesium ion (token required) |
| Elevation (terrain mode) | Mapzen / AWS Open Data **Terrain Tiles** (Terrarium encoding) |
| Imagery | **Esri World Imagery** tiles |
| Picker map | **Esri World Imagery** + Esri Boundaries & Places labels |
| Geocoding | **Nominatim** and **Photon** (OpenStreetMap); optional **Google Places (New)** for business/complex names when `VITE_GOOGLE_MAPS_KEY` or a key pasted in the picker is present |
| Sun position | [`suncalc`](https://github.com/mourner/suncalc) |
| Time zones | [`tz-lookup`](https://github.com/photostructure/tz-lookup) |

Please check each provider's usage terms before deploying publicly; Esri imagery and Nominatim in particular have usage policies for production traffic.

## How it works

- `src/lib/elevation.ts` stitches a 3×3 block of elevation tiles (and a 6×6 block of imagery one zoom level finer) and crops a square centred exactly on the chosen point. The "Terrain area" control chooses the zoom level (~5, ~10 or ~20 km across).
- `src/lib/horizon.ts` scans outward from the property in 360 directions to build a **horizon profile** (the elevation angle of the terrain skyline). A day is then sampled every two minutes: the sun is "direct" when its altitude exceeds the skyline angle in its direction. The same profile drives the monthly chart (15th of each month).
- `src/workers/sunhours.worker.ts` ray-marches from every grid cell towards the sun for each 12-minute step of the day to produce the sun-hours heatmap.
- `src/components/Scene.tsx` renders the terrain with react-three-fiber. The scene frame is local metres: x = east, y = up, z = south. A directional light placed along the sun vector casts shadows from a 4096² shadow map.
- All times are shown in the **location's** time zone, not the browser's.

## Dev helpers

`node scripts/audit.mjs <dir>` and `node scripts/audit2.mjs <dir>` press every control in the app headlessly and print what happened. Each run loads Google 3D tiles once, which counts against the free Cesium ion quota, so don't loop them.

`node scripts/drive-window.mjs <url> <out.png>` clicks a window in the 3D buildings view, runs the analysis and screenshots the result.

`node scripts/screenshot.mjs <url> <out.png> [waitSelector] [extraWaitMs]` renders a page headlessly (uses the Chrome build from Puppeteer's cache). Set `VIEWPORT=390x844` for a phone-sized capture.

## Deep links

`/#<lat>,<lon>,<name>&d=YYYY-MM-DD&t=HH:MM&layer=sunhours`
