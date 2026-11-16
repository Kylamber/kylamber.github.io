/**
 * MediaPipe Pose Landmarker wrapper.
 *
 * MediaPipe handles person detection, landmark regression and temporal
 * tracking internally; we only feed it video frames and a monotonic timestamp.
 */

import {
  FilesetResolver,
  PoseLandmarker,
} from "../assets/mediapipe/vision_bundle.js";

const MODELS = {
  lite: "pose_landmarker_lite.task",
  full: "pose_landmarker_full.task",
};

export class PoseEngine {
  constructor({ model = "lite", delegate = "GPU" } = {}) {
    this.model = MODELS[model] ? model : "lite";
    this.delegate = delegate;
    this.landmarker = null;
    this.activeDelegate = null;
    this._lastTs = 0;
  }

  async init() {
    const wasmPath = new URL(
      "../assets/mediapipe/wasm",
      import.meta.url,
    ).href;
    const modelPath = new URL(
      `../assets/models/${MODELS[this.model]}`,
      import.meta.url,
    ).href;
    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    const create = async (delegate) => {
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate,
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
    };

    if (this.delegate === "CPU") {
      this.landmarker = await create("CPU");
      this.activeDelegate = "CPU";
      return this;
    }

    try {
      this.landmarker = await create("GPU");
      this.activeDelegate = "GPU";
    } catch (err) {
      console.warn("MediaPipe GPU delegate unavailable, falling back to CPU", err);
      this.landmarker = await create("CPU");
      this.activeDelegate = "CPU";
    }
    return this;
  }

  /**
   * Run one VIDEO-mode detection.
   * @returns {{landmarks: Array, worldLandmarks: Array}|null}
   */
  detect(video, timestampMs) {
    if (!this.landmarker) throw new Error("pose engine not initialised");
    // MediaPipe requires strictly increasing integer timestamps.
    let ts = Math.round(timestampMs);
    if (!(ts > this._lastTs)) ts = this._lastTs + 1;
    this._lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    if (!result || !result.landmarks || result.landmarks.length === 0) {
      return null;
    }
    return {
      landmarks: result.landmarks[0],
      worldLandmarks: result.worldLandmarks?.[0] || null,
    };
  }

  close() {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
