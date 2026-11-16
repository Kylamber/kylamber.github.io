import test from "node:test";
import assert from "node:assert/strict";

import {
  G,
  COCO,
  angleDeg,
  kneeLoad,
  percentile,
  scaleFromCandidates,
  AccelerationTracker,
  RepCounter,
  contentRect,
  mediapipeToCoco,
  scaleCandidate,
  SHANK_RATIO,
} from "../src/core.js";

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (eps ${eps})`);

test("interior angle: extended and flexed", () => {
  close(angleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: -1 }), 180);
  close(angleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90);
  assert.ok(Number.isNaN(angleDeg(null, { x: 0, y: 0 }, { x: 1, y: 0 })));
});

test("static knee load matches hand calculation", () => {
  const load = kneeLoad(
    { x: 0, y: 0.4 },
    { x: 0, y: 0 },
    { x: 0.2, y: 0 },
    70,
    0,
    0.5,
    0.045,
  );
  const grf = 70 * 0.5 * G;
  close(load.grfN, grf);
  close(load.armM, 0.2);
  close(load.torqueNm, grf * 0.2);
  close(load.quadN, (grf * 0.2) / 0.045);
  close(load.jointN, grf + (grf * 0.2) / 0.045);
  close(load.jointBW, load.jointN / (70 * G));
});

test("standing with zero lever arm: compression is half body weight", () => {
  const load = kneeLoad(
    { x: 0, y: 0.4 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    80,
    0,
    0.5,
  );
  close(load.quadN, 0);
  close(load.jointBW, 0.5);
});

test("dynamic term adds to ground reaction", () => {
  const base = kneeLoad(
    { x: 0, y: 0.4 },
    { x: 0, y: 0 },
    { x: 0.2, y: 0 },
    70,
    0,
  );
  const accel = kneeLoad(
    { x: 0, y: 0.4 },
    { x: 0, y: 0 },
    { x: 0.2, y: 0 },
    70,
    5,
  );
  close(accel.grfN - base.grfN, 70 * 0.5 * 5);
  assert.ok(accel.jointN > base.jointN);
});

test("missing keypoint returns null", () => {
  assert.equal(
    kneeLoad(null, { x: 0, y: 0 }, { x: 0.2, y: 0 }, 70),
    null,
  );
});

test("percentile matches numpy linear interpolation", () => {
  close(percentile([1, 2, 3, 4], 50), 2.5);
  close(percentile([1, 2, 3, 4], 10), 1.3);
  close(percentile([5], 10), 5);
  assert.ok(Number.isNaN(percentile([], 10)));
});

test("height calibration recovers a synthetic scale", () => {
  const heightM = 1.75;
  const scale = 0.002; // m/px
  const shankPx = (SHANK_RATIO * heightM) / scale;
  const kpts = Array.from({ length: 17 }, () => ({
    x: 0,
    y: 0,
    score: 1,
  }));
  kpts[COCO.left_knee] = { x: 300, y: 400, score: 1 };
  kpts[COCO.left_ankle] = { x: 300, y: 400 + shankPx, score: 1 };
  kpts[COCO.left_hip] = {
    x: 300,
    y: 400 - (0.245 * heightM) / scale,
    score: 1,
  };
  kpts[COCO.left_shoulder] = {
    x: 300,
    y: 400 + shankPx - (0.779 * heightM) / scale,
    score: 1,
  };
  close(scaleCandidate(kpts, heightM), scale, 1e-9);
  close(
    scaleFromCandidates([scale, scale, scale, scale, scale * 1.1], 10),
    scale,
    1e-9,
  );
});

test("local quadratic fit recovers acceleration", () => {
  const tracker = new AccelerationTracker(0.4);
  const a = -3.2;
  const t0 = 10;
  for (let i = 0; i < 20; i++) {
    const t = t0 + i / 30;
    tracker.add(t, 1.2 + 0.05 * (t - t0) + 0.5 * a * (t - t0) ** 2);
  }
  const est = tracker.estimate(t0 + 19 / 30);
  assert.equal(est.ok, true);
  close(est.a, a, 1e-3);
});

test("rep counter uses a Schmitt trigger", () => {
  const rc = new RepCounter(30, 110);
  assert.equal(rc.update(0, 0).reps, 0);
  assert.equal(rc.update(100, 0.5).event, null);
  assert.equal(rc.update(115, 1).event, "high");
  assert.equal(rc.reps, 1);
  assert.equal(rc.update(100, 1.5).event, null);
  assert.equal(rc.update(25, 2).event, "low");
  assert.equal(rc.update(115, 3).event, "high");
  assert.equal(rc.reps, 2);
  close(rc.lastPeriod, 2);
});

test("contain rect letterboxes correctly", () => {
  assert.deepEqual(contentRect(800, 600, 1280, 720), {
    x: 0,
    y: 75,
    w: 800,
    h: 450,
  });
});

test("mediapipe landmarks map to coco indices", () => {
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
    presence: 1,
  }));
  lm[25] = { x: 0.25, y: 0.75, visibility: 0.9, presence: 0.8 };
  const k = mediapipeToCoco(lm, 1000, 500);
  close(k[COCO.left_knee].x, 250);
  close(k[COCO.left_knee].y, 375);
  close(k[COCO.left_knee].score, 0.8);
});
