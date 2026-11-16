/**
 * Pure signal + biomechanics layer for the browser widget.
 *
 * This is a direct port of the Python demo in biomech/:
 *   - keypoint helpers / joint angles
 *   - one-euro filtering
 *   - height-based pixel -> metre calibration
 *   - whole-body COM and vertical acceleration
 *   - quasi-static knee load model
 *   - Schmitt-trigger rep counter
 *
 * No DOM, no MediaPipe, no camera. Everything here is unit-testable.
 */

export const G = 9.81;

// Anthropometric ratios as a fraction of stature.
// Drillis & Contini (1966), reproduced in Winter (2009). Population averages.
export const SHOULDER_HEIGHT_RATIO = 0.818;
export const HIP_HEIGHT_RATIO = 0.530;
export const KNEE_HEIGHT_RATIO = 0.285;
export const ANKLE_HEIGHT_RATIO = 0.039;
export const SHOULDER_ANKLE_RATIO =
  SHOULDER_HEIGHT_RATIO - ANKLE_HEIGHT_RATIO; // 0.779
export const THIGH_RATIO = HIP_HEIGHT_RATIO - KNEE_HEIGHT_RATIO; // 0.245
export const SHANK_RATIO = KNEE_HEIGHT_RATIO - ANKLE_HEIGHT_RATIO; // 0.246

export const DEFAULT_PATELLAR_ARM_M = 0.045;
export const DEFAULT_LEG_SHARE = 0.5;
export const DEFAULT_REP_LOW = 30;
export const DEFAULT_REP_HIGH = 110;
export const KPT_THR = 0.3;

/** COCO-17 order used everywhere in this project. */
export const COCO_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

export const COCO = Object.fromEntries(COCO_NAMES.map((name, i) => [name, i]));

export const SIDES = {
  left: {
    shoulder: COCO.left_shoulder,
    elbow: COCO.left_elbow,
    wrist: COCO.left_wrist,
    hip: COCO.left_hip,
    knee: COCO.left_knee,
    ankle: COCO.left_ankle,
  },
  right: {
    shoulder: COCO.right_shoulder,
    elbow: COCO.right_elbow,
    wrist: COCO.right_wrist,
    hip: COCO.right_hip,
    knee: COCO.right_knee,
    ankle: COCO.right_ankle,
  },
};

/**
 * MediaPipe BlazePose (33 landmarks) -> COCO-17 indices.
 * Left/right are anatomical, matching COCO.
 */
export const MEDIAPIPE_TO_COCO = [
  COCO.nose, // 0 nose
  COCO.left_eye, // 1 left eye inner
  COCO.left_eye, // 2 left eye
  COCO.left_eye, // 3 left eye outer
  COCO.right_eye, // 4 right eye inner
  COCO.right_eye, // 5 right eye
  COCO.right_eye, // 6 right eye outer
  COCO.left_ear, // 7 left ear
  COCO.right_ear, // 8 right ear
  -1, // 9 mouth left
  -1, // 10 mouth right
  COCO.left_shoulder, // 11
  COCO.right_shoulder, // 12
  COCO.left_elbow, // 13
  COCO.right_elbow, // 14
  COCO.left_wrist, // 15
  COCO.right_wrist, // 16
  -1, // 17 left pinky
  -1, // 18 right pinky
  -1, // 19 left index
  -1, // 20 right index
  -1, // 21 left thumb
  -1, // 22 right thumb
  COCO.left_hip, // 23
  COCO.right_hip, // 24
  COCO.left_knee, // 25
  COCO.right_knee, // 26
  COCO.left_ankle, // 27
  COCO.right_ankle, // 28
  -1, // 29 left heel
  -1, // 30 right heel
  -1, // 31 left foot index
  -1, // 32 right foot index
];

/**
 * Convert MediaPipe normalised landmarks into COCO-17 pixel keypoints.
 * Returns { x, y, score } per COCO index. Unmapped entries get score 0.
 */
export function mediapipeToCoco(landmarks, width, height) {
  const out = COCO_NAMES.map(() => ({ x: NaN, y: NaN, score: 0 }));
  if (!landmarks) return out;
  for (let i = 0; i < MEDIAPIPE_TO_COCO.length; i++) {
    const target = MEDIAPIPE_TO_COCO[i];
    if (target < 0) continue;
    const lm = landmarks[i];
    if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) continue;
    const visibility = Number.isFinite(lm.visibility) ? lm.visibility : 1;
    const presence = Number.isFinite(lm.presence) ? lm.presence : 1;
    out[target] = {
      x: lm.x * width,
      y: lm.y * height,
      score: Math.min(visibility, presence),
    };
  }
  return out;
}

export function point(kpts, scores, idx, thr = KPT_THR) {
  if (!kpts || idx == null || idx < 0) return null;
  const p = kpts[idx];
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const score = scores ? scores[idx] : p.score;
  if (scores && (!Number.isFinite(score) || score < thr)) return null;
  if (!scores && Number.isFinite(p.score) && p.score < thr) return null;
  return { x: p.x, y: p.y, score: p.score ?? score };
}

export function midpoint(a, b) {
  if (!a && !b) return null;
  if (!a) return { ...b };
  if (!b) return { ...a };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Interior angle at b for the chain a-b-c, in degrees. NaN if unavailable. */
export function angleDeg(a, b, c) {
  if (!a || !b || !c) return NaN;
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-9 || n2 < 1e-9) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angles at hip, knee and elbow for one side. 180 deg = extended. */
export function jointAngles(kpts, side, thr = KPT_THR) {
  const key = SIDES[side];
  const shoulder = point(kpts, null, key.shoulder, thr);
  const elbow = point(kpts, null, key.elbow, thr);
  const wrist = point(kpts, null, key.wrist, thr);
  const hip = point(kpts, null, key.hip, thr);
  const knee = point(kpts, null, key.knee, thr);
  const ankle = point(kpts, null, key.ankle, thr);
  return {
    hip: angleDeg(shoulder, hip, knee),
    knee: angleDeg(hip, knee, ankle),
    elbow: angleDeg(shoulder, elbow, wrist),
    ankle: NaN,
  };
}

/** 180 - interior angle. */
export function flexion(interiorAngleDeg) {
  return Number.isFinite(interiorAngleDeg) ? 180 - interiorAngleDeg : NaN;
}

/** Mean visibility of the four landmarks needed to analyse a side. */
export function sideVisibility(kpts, side) {
  const key = SIDES[side];
  const vals = [key.shoulder, key.hip, key.knee, key.ankle]
    .map((i) => kpts?.[i]?.score)
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function chooseSide(kpts, preferred = "auto") {
  if (preferred === "left" || preferred === "right") return preferred;
  return sideVisibility(kpts, "left") >= sideVisibility(kpts, "right")
    ? "left"
    : "right";
}

// ---------------------------------------------------------------------------
// One-Euro filter
// ---------------------------------------------------------------------------

class LowPass {
  constructor() {
    this.y = null;
  }

  filter(x, alpha) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
}

/**
 * Speed-adaptive low-pass filter (Casiez et al., 2012).
 * Accepts a per-sample dt so dropped frames do not bend the time constant.
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.5, beta = 0.5, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this._x = new LowPass();
    this._dx = new LowPass();
    this._prev = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, dt = 1 / 30) {
    if (!Number.isFinite(x)) return x;
    if (!(dt > 0)) dt = 1 / 30;
    const dx = this._prev === null ? 0 : (x - this._prev) / dt;
    const edx = this._dx.filter(dx, OneEuroFilter.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const y = this._x.filter(x, OneEuroFilter.alpha(cutoff, dt));
    this._prev = x;
    return y;
  }

  reset() {
    this._x = new LowPass();
    this._dx = new LowPass();
    this._prev = null;
  }
}

/** Per-keypoint x/y filters. Resets after a long gap. */
export class KeypointFilter {
  constructor(count = COCO_NAMES.length, opts = {}) {
    this.filters = Array.from({ length: count }, () => ({
      x: new OneEuroFilter(opts),
      y: new OneEuroFilter(opts),
    }));
    this.lastT = null;
  }

  update(kpts, t) {
    const dt = this.lastT === null ? 1 / 30 : t - this.lastT;
    if (dt > 0.5) {
      for (const f of this.filters) {
        f.x.reset();
        f.y.reset();
      }
    }
    this.lastT = t;
    return kpts.map((p, i) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        return { x: NaN, y: NaN, score: p?.score ?? 0 };
      }
      const f = this.filters[i];
      return {
        x: f.x.filter(p.x, dt),
        y: f.y.filter(p.y, dt),
        score: p.score,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Calibration: pixels -> metres using stature and segment ratios
// ---------------------------------------------------------------------------

export const RULERS = [
  { a: "knee", b: "ankle", ratio: SHANK_RATIO },
  { a: "hip", b: "knee", ratio: THIGH_RATIO },
  { a: "shoulder", b: "ankle", ratio: SHOULDER_ANKLE_RATIO },
];

/**
 * One frame's best scale estimate [m/px].
 *
 * Apparent segment length can only be shortened by perspective/rotation, so
 * every estimate is an overestimate; taking the frame maximum discards the
 * most foreshortened ruler. The caller aggregates over time.
 */
export function scaleCandidate(kpts, heightM, thr = KPT_THR) {
  let best = 0;
  for (const side of ["left", "right"]) {
    const key = SIDES[side];
    for (const ruler of RULERS) {
      const pa = point(kpts, null, key[ruler.a], thr);
      const pb = point(kpts, null, key[ruler.b], thr);
      if (!pa || !pb) continue;
      const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (dist > 1e-6) {
        best = Math.max(best, (ruler.ratio * heightM) / dist);
      }
    }
  }
  return best > 0 ? best : NaN;
}

/** numpy-style linear-interpolated percentile. */
export function percentile(values, p) {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  if (a.length === 1) return a[0];
  const rank = (p / 100) * (a.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return a[lo] + (a[hi] - a[lo]) * (rank - lo);
}

/** Scale from a calibration buffer, matching scaling.py's 10th percentile. */
export function scaleFromCandidates(values, p = 10) {
  return percentile(values, p);
}

export function plausibleScale(scale) {
  return Number.isFinite(scale) && scale > 2e-4 && scale < 2e-2;
}

// ---------------------------------------------------------------------------
// World coordinates, COM, acceleration
// ---------------------------------------------------------------------------

/** Pixels -> metres, y up. Origin is the bottom-left of the frame. */
export function toWorld(kpts, scale, heightPx) {
  return kpts.map((p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { x: NaN, y: NaN, score: p?.score ?? 0 };
    }
    return {
      x: p.x * scale,
      y: (heightPx - p.y) * scale,
      score: p.score ?? 0,
    };
  });
}

const COM_GROUPS = [
  { names: ["nose"], w: 0.081 },
  { names: ["left_shoulder", "right_shoulder"], w: 0.386 },
  { names: ["left_hip", "right_hip"], w: 0.14 },
  { names: ["left_elbow", "right_elbow"], w: 0.056 },
  { names: ["left_wrist", "right_wrist"], w: 0.044 },
  { names: ["left_knee", "right_knee"], w: 0.2 },
  { names: ["left_ankle", "right_ankle"], w: 0.093 },
];

/** Weighted centroid of visible keypoints in pixels, or null. */
export function comPixel(kpts, thr = KPT_THR) {
  if (!kpts) return null;
  let x = 0;
  let y = 0;
  let wsum = 0;
  for (const group of COM_GROUPS) {
    const pts = group.names.map((name) => point(kpts, null, COCO[name], thr));
    const mid = pts.length === 1 ? pts[0] : midpoint(pts[0], pts[1]);
    if (mid) {
      x += group.w * mid.x;
      y += group.w * mid.y;
      wsum += group.w;
    }
  }
  if (wsum < 0.5) return null;
  return { x: x / wsum, y: y / wsum };
}

function solve3(A, b) {
  // Gaussian elimination with partial pivoting. A is 3x3, b is 3.
  const M = A.map((row, i) => [row[0], row[1], row[2], b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col];
    for (let c = col; c < 4; c++) M[col][c] /= div;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (!f) continue;
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

/**
 * Local quadratic fit of COM height vs time.
 *
 * Replaces scipy's savgol_filter for irregular camera timestamps. Fits
 * y = c0 + c1*u + c2*u^2 over the last window, with u normalised to [-1, 1].
 * Acceleration is the second derivative at the current time.
 */
export class AccelerationTracker {
  constructor(windowS = 0.4) {
    this.windowS = windowS;
    this.samples = [];
  }

  add(t, y) {
    if (!Number.isFinite(t) || !Number.isFinite(y)) return;
    this.samples.push({ t, y });
    const cutoff = t - Math.max(5, this.windowS * 4);
    while (this.samples.length && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  reset() {
    this.samples.length = 0;
  }

  /** Returns { y, a, ok } at time `now`. */
  estimate(now) {
    if (this.samples.length < 5) {
      const last = this.samples[this.samples.length - 1];
      return { y: last ? last.y : NaN, a: 0, ok: false };
    }
    let pts = this.samples.filter((s) => s.t >= now - this.windowS);
    if (pts.length < 5) pts = this.samples.slice(-Math.min(5, this.samples.length));
    const tMin = pts[0].t;
    const tMax = pts[pts.length - 1].t;
    const span = tMax - tMin;
    if (!(span > 0.05)) {
      return { y: pts[pts.length - 1].y, a: 0, ok: false };
    }
    const tBar = (tMin + tMax) / 2;
    const half = span / 2;
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const b = [0, 0, 0];
    for (const s of pts) {
      const u = (s.t - tBar) / half;
      const basis = [1, u, u * u];
      for (let i = 0; i < 3; i++) {
        b[i] += basis[i] * s.y;
        for (let j = 0; j < 3; j++) A[i][j] += basis[i] * basis[j];
      }
    }
    const c = solve3(A, b);
    if (!c) {
      return { y: pts[pts.length - 1].y, a: 0, ok: false };
    }
    const uNow = (now - tBar) / half;
    const y = c[0] + c[1] * uNow + c[2] * uNow * uNow;
    const a = (2 * c[2]) / (half * half);
    return { y, a: Math.max(-25, Math.min(25, a)), ok: true };
  }
}

// ---------------------------------------------------------------------------
// Knee load model (the physics)
// ---------------------------------------------------------------------------

/**
 * Quasi-static sagittal-plane knee model.
 *
 *   F_grf    = m * leg_share * (g + a_com)
 *   tau      = F_grf * d,  d = ankle.x - knee.x
 *   F_quad   = |tau| / r
 *   J        = -(R + T)
 *
 * Returns null when a required point is missing.
 */
export function kneeLoad(
  hip,
  knee,
  ankle,
  massKg,
  aCom = 0,
  legShare = DEFAULT_LEG_SHARE,
  rPatellar = DEFAULT_PATELLAR_ARM_M,
  g = G,
) {
  if (!hip || !knee || !ankle) return null;
  if (![hip.x, hip.y, knee.x, knee.y, ankle.x, ankle.y].every(Number.isFinite)) {
    return null;
  }
  if (!(rPatellar > 0)) throw new Error("patellar moment arm must be positive");
  const bodyWeightN = massKg * g;
  const grfN = Math.max(massKg * legShare * (g + aCom), 0);
  const armM = ankle.x - knee.x;
  const torqueNm = grfN * armM;
  const quadN = Math.abs(torqueNm) / rPatellar;

  let ux = hip.x - knee.x;
  let uy = hip.y - knee.y;
  const n = Math.hypot(ux, uy);
  if (n > 1e-9) {
    ux /= n;
    uy /= n;
  } else {
    ux = 0;
    uy = 1;
  }
  const jx = quadN * ux;
  const jy = grfN + quadN * uy;
  const jointN = Math.hypot(jx, jy);

  return {
    grfN,
    grfBW: bodyWeightN > 0 ? grfN / bodyWeightN : NaN,
    armM,
    torqueNm,
    quadN,
    quadBW: bodyWeightN > 0 ? quadN / bodyWeightN : NaN,
    jointN,
    jointBW: bodyWeightN > 0 ? jointN / bodyWeightN : NaN,
  };
}

// ---------------------------------------------------------------------------
// Rep counter
// ---------------------------------------------------------------------------

export class SchmittTrigger {
  constructor(lowThr, highThr, initial = "low") {
    if (!(lowThr < highThr)) throw new Error("require lowThr < highThr");
    this.lowThr = lowThr;
    this.highThr = highThr;
    this.state = initial;
  }

  update(value) {
    if (!Number.isFinite(value)) return null;
    if (this.state === "low" && value >= this.highThr) {
      this.state = "high";
      return "high";
    }
    if (this.state === "high" && value <= this.lowThr) {
      this.state = "low";
      return "low";
    }
    return null;
  }

  reset() {
    this.state = "low";
  }
}

export class RepCounter {
  constructor(lowThr = DEFAULT_REP_LOW, highThr = DEFAULT_REP_HIGH) {
    this.trigger = new SchmittTrigger(lowThr, highThr);
    this.reps = 0;
    this.lastPeriod = NaN;
    this.periods = [];
    this.lastRepT = null;
  }

  /** Returns { event, reps, period, cadence }. */
  update(flexionDeg, t) {
    const event = this.trigger.update(flexionDeg);
    let period = NaN;
    if (event === "high") {
      if (this.lastRepT !== null) {
        period = t - this.lastRepT;
        this.lastPeriod = period;
        this.periods.push(period);
      }
      this.lastRepT = t;
      this.reps += 1;
    }
    return {
      event,
      reps: this.reps,
      period,
      cadence: this.cadence,
    };
  }

  get cadence() {
    if (!this.periods.length) return NaN;
    return this.periods.reduce((a, b) => a + b, 0) / this.periods.length;
  }

  reset() {
    this.trigger.reset();
    this.reps = 0;
    this.lastPeriod = NaN;
    this.periods = [];
    this.lastRepT = null;
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers for the overlay
// ---------------------------------------------------------------------------

/**
 * Rect occupied by a `contain`-fitted video inside a canvas.
 */
export function contentRect(canvasW, canvasH, videoW, videoH) {
  if (!(canvasW > 0 && canvasH > 0 && videoW > 0 && videoH > 0)) {
    return { x: 0, y: 0, w: canvasW, h: canvasH };
  }
  const scale = Math.min(canvasW / videoW, canvasH / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
}
