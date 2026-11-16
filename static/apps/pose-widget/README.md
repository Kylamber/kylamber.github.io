# Knee Load — drop-in browser widget

A client-side squat analyser that turns a phone or laptop camera into a live
pose overlay, knee-angle chart and estimated knee-load readout. No backend, no
build step, no upload.

It is a browser port of the physics in `biomech/`, using MediaPipe BlazePose as
the pose sensor instead of RTMPose.

The demo page and embedded widget use the same flat, light/dark visual language
as [imadrian.fyi](https://imadrian.fyi): Inter, hairline rules, square corners
and no decorative card chrome.

## What it shows

- Skeleton overlay with knee-flexion arc, shank moment arm and knee-force arrow
- Knee flexion (degrees)
- Knee compression (body weights and newtons)
- Quadriceps force (body weights)
- Shank moment arm `d` (cm)
- Vertical ground reaction force per leg (BW)
- Whole-body COM acceleration (m/s²)
- Rolling 12 s charts for angle and load
- Rep count, rep period and per-rep peak load
- CSV export of every analysed frame

Everything runs on the device. Video never leaves the browser.

## Deploy on GitHub Pages

Copy the whole `pose-widget/` directory into your GitHub Pages repository. If
the repository is `imadrian.github.io`, the folder is served at:

```
https://imadrian.fyi/pose-widget/
```

Enable **Settings → Pages → Deploy from a branch** and select the branch/folder
that contains `pose-widget/`.

No build, no Node, no server is needed — these are static files:

```
pose-widget/
  index.html            demo / landing page
  app.html              the widget UI (loaded in an iframe)
  embed.js              drop-in loader
  app.js                camera + calibration + loop
  styles.css
  demo.css
  src/
    core.js             angles, calibration, COM, knee load, reps
    pose.js             MediaPipe wrapper
    charts.js           rolling canvas charts
    overlay.js          skeleton / arrows on canvas
  assets/
    mediapipe/          vendored MediaPipe Tasks Vision + WASM
    models/             pose_landmarker_lite.task, _full.task
  tests/
    core.test.mjs       no-browser physics/geometry tests
  favicon.svg
  package.json          only for `node --test`; no runtime dependencies
  THIRD_PARTY_NOTICES.md
  LICENSE-APACHE-2.0.txt
```

If you host it under a different path, change the script URL in the snippet.
For a project page (for example `username.github.io/repo/`), the URL becomes
`https://username.github.io/repo/pose-widget/embed.js`. The demo page
auto-generates the correct snippet from its own location.

## Embed

The minimal version — exactly one div and one script:

```html
<div id="pose"></div>
<script src="https://imadrian.fyi/pose-widget/embed.js"></script>
```

`embed.js` replaces the div with a responsive iframe. This isolates the
widget's CSS from the host page and keeps the camera, WASM and model assets
same-origin with the app. The iframe reports its height back to the parent, so
the widget fits its content.

The widget follows the host page's theme automatically: it reads the host's
`data-theme` attribute, `.dark`/`.light` classes, `#theme-switcher` checkbox,
stored `theme` preference and finally the OS preference, and it switches the
iframe live when the host theme changes. Force a theme with
`data-theme="light"` or `data-theme="dark"`.

### Optional attributes

```html
<div
  id="pose"
  data-subject-height="175"
  data-mass="70"
  data-side="auto"
  data-theme="auto"
  data-height="860"
></div>
<script src="https://imadrian.fyi/pose-widget/embed.js"></script>
```

| attribute | meaning | default |
|---|---|---|
| `data-subject-height` | subject height in cm (or metres, e.g. `1.75`) | `175` |
| `data-mass` | body mass in kg | `70` |
| `data-side` | `auto`, `left`, `right` | `auto` |
| `data-theme` | `light`, `dark`, or `auto` to follow the host | host page theme |
| `data-height` | initial iframe height in px | `860` |
| `data-leg-share` | fraction of body weight on the analysed leg | `0.5` |
| `data-patellar-arm` | patellar tendon moment arm in metres | `0.045` |
| `data-model` | `lite` or `full` | `lite` |
| `data-title` | iframe accessible title | `Knee load analysis` |

To mount several widgets, use `data-pose` on each container instead of relying
on the `#pose` id:

```html
<div data-pose data-subject-height="180" data-mass="80"></div>
<div data-pose data-subject-height="165" data-mass="60"></div>
<script src="https://imadrian.fyi/pose-widget/embed.js"></script>
```

Containers added later by a framework are picked up automatically; you can
also call `PoseWidget.init()` or `PoseWidget.mount(element)` manually.

### Hugo shortcode

When the project is served from `https://imadrian.fyi/pose-widget/`, add this
shortcode to the Hugo site so a post can embed it with `{{< pose-widget >}}`.
Create `layouts/shortcodes/pose-widget.html`:

```html
<div
  data-pose
  {{ with .Get "theme" }}data-theme="{{ . }}"{{ end }}
  {{ with .Get "height" }}data-height="{{ . }}"{{ end }}
></div>
<script src="https://imadrian.fyi/pose-widget/embed.js"></script>
```

Use it in a blog post:

```go-html-template
{{< pose-widget >}}
{{< pose-widget height="1000" >}}
{{< pose-widget theme="dark" >}}
```

With no `theme` argument the widget follows the site's light/dark toggle.

### Direct mode

`app.html` also runs standalone (useful for debugging):

```
https://imadrian.fyi/pose-widget/app.html?mass=70&body_height=175&model=lite
```

Supported query parameters: `mass`, `body_height` (cm or m), `side`,
`leg_share`, `patellar_arm` (m), `model`, `theme`.

## Camera requirements

Browsers only expose `getUserMedia` in a **secure context**:

- HTTPS, or
- `http://localhost`

Opening `app.html` by double-clicking a `file://` path will not work reliably:
the camera permission, the WASM fetch and the ES modules are all restricted.
Use GitHub Pages, Netlify, Cloudflare Pages, or a local static server:

```bash
cd pose-widget
python3 -m http.server 8000
# open http://localhost:8000/
```

For phone use, put the phone in landscape on a tripod, 2–3 m away, at roughly
hip height, perpendicular to the lifter. Keep the whole body — head to feet —
in frame, with one side facing the camera. Good light and fitted clothing help.

Cross-origin embeds need the host page to allow camera delegation. The loader
sets `allow="camera; fullscreen; autoplay"` on the iframe, which is sufficient
for a normal top-level page. If the host page sets a restrictive
`Permissions-Policy`, camera access may still be blocked by the browser.

## How it works

1. **Camera** — `getUserMedia`, rear camera preferred, 1280 × 720 at up to
   30 fps.
2. **Pose** — MediaPipe Pose Landmarker in VIDEO mode returns 33 normalised
   landmarks. They are mapped onto the project's COCO-17 layout.
3. **Filter** — a per-keypoint One-Euro filter, then a local quadratic fit over
   the last 0.4 s for COM height and vertical acceleration.
4. **Calibrate** — the user stands tall for three seconds. Shank, thigh and
   shoulder-to-ankle lengths are compared with anthropometric ratios of
   stature. The frame's best estimate is kept, then the 10th percentile over
   the calibration window is used. This discards foreshortened frames.
5. **Physics** — per frame, in metres:

   ```
   F_grf    = m * leg_share * (g + a_com)
   tau_knee = F_grf * d          d = ankle.x - knee.x
   F_quad   = |tau_knee| / r     r = patellar tendon moment arm
   J        = -(R + T)
   |J|      = knee compression
   ```

   Results are reported in newtons and body weights.
6. **Product** — skeleton overlay, HUD, rolling charts, Schmitt-trigger rep
   counter, per-rep peaks, CSV export.

The scale is locked after calibration. If the camera or the subject moves
closer/farther away, press **Recalibrate**. Changing the subject height also
requires recalibration; changing mass or leg share does not.

## Model size and performance

- `lite`: 5.8 MB model, best for phones and older laptops.
- `full`: 9.4 MB model, slightly better landmark precision.
- MediaPipe WASM: ~14.7 MB, cached by the browser after the first load.

If you only use the default lite model, you can delete
`assets/models/pose_landmarker_full.task` to save ~9.4 MB. Keep the lite model
unless you always pass `data-model="full"`.

Expect roughly 15–30 fps on recent phones and 30–60 fps on a desktop with GPU
acceleration. The widget runs pose inference at up to 30 Hz and draws the
overlay/charts on `requestAnimationFrame`. If the GPU delegate is unavailable,
it falls back to CPU automatically.

The vendored runtime is `@mediapipe/tasks-vision` 1.2.3. No CDN is used at
runtime.

## Tests

The pure layer has no DOM or MediaPipe dependency, so it runs in Node:

```bash
cd pose-widget
node --test tests/
```

The tests cover angle math, static/dynamic knee loads, calibration recovery,
percentile behaviour, local quadratic acceleration, the Schmitt-trigger rep
counter, letterbox geometry and the MediaPipe → COCO mapping.

## Limitations

These are inherited from the Python model and are not fixed by the browser:

- **2D side view only.** A front or oblique view foreshortens the shank and
  under-reports the moment arm. The app warns about occlusion but cannot
  reconstruct out-of-plane geometry.
- **External load is not modelled.** A barbell or kettlebell is not in the
  free-body diagram. Folding implement mass into `data-mass` is a crude
  approximation and ignores the shifted centre of mass.
- **Quasi-static, single-segment shank.** No co-contraction, tendon
  elasticity, shank inertia or foot centre-of-pressure modelling. The GRF is
  applied at the ankle because the model uses the COCO-17 ankle point.
- **Population-average anthropometry.** Height and mass are user inputs, not
  measurements. The patellar tendon arm is a constant 4.5 cm.
- **Real-time acceleration is noisy.** The second derivative amplifies landmark
  jitter. The fit is clamped to ±25 m/s² and should be read as an estimate.
- **MediaPipe tracking can “stick”** during occlusion, producing plausible but
  wrong landmarks. The visibility threshold and occlusion warning help, but
  this is not a medical device.

Use it for teaching, demos and relative comparisons — not diagnosis or
load-prescription decisions.

## Attribution and licences

- Pose: [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
  and BlazePose, Apache-2.0. The vendored runtime and models are included in
  `assets/`.
- Physics and physiology constants: ported from `biomech/` in this repository;
  anthropometric ratios from Drillis & Contini (1966), as reproduced in Winter
  (2009).
- The widget code is part of the same seminar project. Add your preferred
  licence for the site if you publish it.
