# Third-party notices

This widget vendors the following third-party components. They are not covered
by the project's own licence.

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision` 1.2.3
- Files:
  - `assets/mediapipe/vision_bundle.js`
  - `assets/mediapipe/wasm/vision_wasm_internal.js`
  - `assets/mediapipe/wasm/vision_wasm_internal.wasm`
- Copyright: Google LLC and the MediaPipe authors
- Licence: Apache License 2.0 (see `LICENSE-APACHE-2.0.txt`)
- Project: https://github.com/google-ai-edge/mediapipe
- Documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- The upstream package and binary may include additional third-party notices;
  consult the `@mediapipe/tasks-vision` distribution for the complete list.

## BlazePose Pose Landmarker models

- Files:
  - `assets/models/pose_landmarker_lite.task`
  - `assets/models/pose_landmarker_full.task`
- Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/
- Copyright: Google LLC and the MediaPipe authors
- Licence: Apache License 2.0 (see `LICENSE-APACHE-2.0.txt`)
- Model card and documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

## Anthropometric constants and physics

The knee-load equations and segment ratios are ported from the `biomech/`
Python demo in this repository. The anthropometric ratios originate from
Drillis & Contini (1966), as reproduced in Winter, *Biomechanics and Motor
Control of Human Movement* (2009). They are population averages, not
measurements of an individual.

## Inter and Fira Code

- Inter: Copyright Rasmus Andersson, SIL Open Font License 1.1.
  Loaded from https://rsms.me/inter/.
- Fira Code: Copyright The Fira Code Project Authors, SIL Open Font License
  1.1. Loaded from https://github.com/tonsky/FiraCode via jsDelivr.
- These fonts are not vendored; the pages request the upstream stylesheets at
  runtime and fall back to system fonts if they are unavailable.
