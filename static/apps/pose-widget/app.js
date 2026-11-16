/**
 * Knee Load — drop-in browser widget.
 *
 * The widget runs entirely client-side:
 *   camera -> MediaPipe Pose Landmarker -> filtered keypoints -> calibration
 *   -> joint angles / COM acceleration -> quasi-static knee load -> UI.
 */

import {
  COCO,
  SIDES,
  KPT_THR,
  DEFAULT_LEG_SHARE,
  DEFAULT_PATELLAR_ARM_M,
  DEFAULT_REP_LOW,
  DEFAULT_REP_HIGH,
  mediapipeToCoco,
  jointAngles,
  flexion,
  chooseSide,
  sideVisibility,
  point,
  KeypointFilter,
  scaleCandidate,
  scaleFromCandidates,
  plausibleScale,
  toWorld,
  comPixel,
  AccelerationTracker,
  kneeLoad,
  RepCounter,
} from "./src/core.js";
import { RollingChart } from "./src/charts.js";
import { drawOverlay } from "./src/overlay.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "knee-load-widget:v1";
const DEFAULT_HINT =
  "Side view · whole body in frame · camera at hip height";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function numberOr(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function heightCmFrom(value, fallbackCm) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return fallbackCm;
  // Accept metres (1.75) or centimetres (175) from URL/data attributes.
  return clamp(n < 3 ? n * 100 : n, 100, 230);
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

const params = new URLSearchParams(window.location.search);
const stored = readStored();
const initial = {
  heightCm: heightCmFrom(params.get("body_height") ?? stored.heightCm, 175),
  massKg: clamp(
    numberOr(params.get("mass") ?? stored.massKg, 70),
    30,
    250,
  ),
  sidePref: ["auto", "left", "right"].includes(params.get("side"))
    ? params.get("side")
    : ["auto", "left", "right"].includes(stored.sidePref)
      ? stored.sidePref
      : "auto",
  legShare: clamp(
    numberOr(params.get("leg_share") ?? stored.legShare, DEFAULT_LEG_SHARE),
    0.1,
    1,
  ),
  patellarArmM: clamp(
    numberOr(
      params.get("patellar_arm") ?? stored.patellarArmM,
      DEFAULT_PATELLAR_ARM_M,
    ),
    0.02,
    0.08,
  ),
  model: params.get("model") === "full" ? "full" : "lite",
};

const themeParam = params.get("theme");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const theme =
  themeParam === "light" || themeParam === "dark"
    ? themeParam
    : systemTheme.matches
      ? "dark"
      : "light";
document.documentElement.dataset.theme = theme;

const els = {
  widget: $("widget"),
  video: $("video"),
  overlay: $("overlay"),
  stage: $("stage"),
  stageOverlay: $("stageOverlay"),
  startCard: $("startCard"),
  calibrateCard: $("calibrateCard"),
  errorCard: $("errorCard"),
  startBtn: $("startBtn"),
  calBtn: $("calBtn"),
  retryBtn: $("retryBtn"),
  errTitle: $("errTitle"),
  errText: $("errText"),
  calTitle: $("calTitle"),
  calText: $("calText"),
  calHint: $("calHint"),
  calBar: $("calBar"),
  calProgress: $("calProgress"),
  calProgressBar: $("calProgressBar"),
  stageNote: $("stageNote"),
  status: $("status"),
  statusText: $("statusText"),
  liveBadge: $("liveBadge"),
  hint: $("hint"),
  mFlex: $("mFlex"),
  mKnee: $("mKnee"),
  mKneeN: $("mKneeN"),
  mQuad: $("mQuad"),
  mArm: $("mArm"),
  mGrf: $("mGrf"),
  mAccel: $("mAccel"),
  heightCm: $("heightCm"),
  massKg: $("massKg"),
  side: $("side"),
  legShare: $("legShare"),
  patellarArm: $("patellarArm"),
  recalBtn: $("recalBtn"),
  stopBtn: $("stopBtn"),
  csvBtn: $("csvBtn"),
  resetBtn: $("resetBtn"),
  fsBtn: $("fsBtn"),
  angleChart: $("angleChart"),
  forceChart: $("forceChart"),
  repCount: $("repCount"),
  repPeriod: $("repPeriod"),
  repList: $("repList"),
  engineInfo: $("engineInfo"),
};

// Reflect URL/localStorage settings in the controls before anything starts.
els.heightCm.value = String(Math.round(initial.heightCm));
els.massKg.value = String(Math.round(initial.massKg));
els.side.value = initial.sidePref;
els.legShare.value = String(initial.legShare.toFixed(2));
els.patellarArm.value = String((initial.patellarArmM * 100).toFixed(1));

const angleChart = new RollingChart(els.angleChart, {
  windowS: 12,
  fixedY: true,
  yMin: 0,
  yMax: 180,
  theme,
  series: [{ key: "flexion", color: "accent", width: 2.2 }],
  thresholds: [
    { value: DEFAULT_REP_HIGH },
    { value: DEFAULT_REP_LOW },
  ],
  format: (v) => v.toFixed(0),
});
const forceChart = new RollingChart(els.forceChart, {
  windowS: 12,
  fixedY: false,
  yMin: 0,
  yMax: 4,
  theme,
  series: [
    { key: "kneeBW", color: "accent", width: 2.3 },
    { key: "quadBW", color: "accent2", width: 1.6 },
  ],
  format: (v) => v.toFixed(1),
});

// The embed loader can switch the iframe theme live when the host page's
// theme toggle changes. Direct visits follow the OS while they stay open.
function applyTheme(next) {
  const resolved = next === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = resolved;
  angleChart.setTheme(resolved);
  forceChart.setTheme(resolved);
  const now = performance.now() / 1000;
  angleChart.draw(now);
  forceChart.draw(now);
}

window.addEventListener("message", function (event) {
  const data = event.data;
  if (!data || data.type !== "pose-widget:theme") return;
  applyTheme(data.theme);
});

if (window.parent === window && themeParam !== "light" && themeParam !== "dark") {
  const onSystemTheme = function (event) {
    applyTheme(event.matches ? "dark" : "light");
  };
  if (systemTheme.addEventListener) {
    systemTheme.addEventListener("change", onSystemTheme);
  } else if (systemTheme.addListener) {
    systemTheme.addListener(onSystemTheme);
  }
}

const state = {
  running: false,
  starting: false,
  stream: null,
  engine: null,
  calibrated: false,
  scale: null,
  side: null,
  sidePref: initial.sidePref,
  heightM: initial.heightCm / 100,
  massKg: initial.massKg,
  legShare: initial.legShare,
  patellarArmM: initial.patellarArmM,
  model: initial.model,
  filter: new KeypointFilter(17, {
    minCutoff: 1.4,
    beta: 0.45,
    dCutoff: 1.0,
  }),
  accel: new AccelerationTracker(0.4),
  repCounter: new RepCounter(DEFAULT_REP_LOW, DEFAULT_REP_HIGH),
  currentRep: null,
  completedReps: [],
  repDirty: true,
  calib: { active: false, elapsed: 0, lastT: null, samples: [] },
  csvRows: [],
  sessionStart: 0,
  lastInfer: 0,
  lastVideoTime: -1,
  lastUi: 0,
  lastChart: 0,
  noPersonSince: -1,
  lastStatus: "",
  lastHint: "",
};

const CARDS = [els.startCard, els.calibrateCard, els.errorCard];

function setStatus(text, kind = "idle") {
  if (state.lastStatus === `${kind}:${text}`) return;
  state.lastStatus = `${kind}:${text}`;
  els.status.dataset.kind = kind;
  els.statusText.textContent = text;
}

function setHint(text, kind = "") {
  if (state.lastHint === `${kind}:${text}`) return;
  state.lastHint = `${kind}:${text}`;
  els.hint.textContent = text;
  if (kind) els.hint.dataset.kind = kind;
  else delete els.hint.dataset.kind;
}

function showCard(card) {
  for (const c of CARDS) c.classList.toggle("hidden", c !== card);
  els.stageOverlay.classList.toggle("hidden", !card);
  postHeight();
}

function showCalProgress(show) {
  els.calProgress.classList.toggle("hidden", !show);
}

function setCalProgress(progress) {
  const pct = `${(Math.max(0, Math.min(1, progress)) * 100).toFixed(1)}%`;
  els.calBar.style.width = pct;
  els.calProgressBar.style.width = pct;
}

function setStageNote(text) {
  if (text) {
    if (els.stageNote.textContent !== text) {
      els.stageNote.textContent = text;
    }
    els.stageNote.classList.remove("hidden");
  } else {
    els.stageNote.classList.add("hidden");
  }
}

function setUiEnabled() {
  els.startBtn.disabled = state.starting || state.running;
  els.startBtn.textContent = state.starting
    ? "Starting…"
    : state.running
      ? "Camera on"
      : "Start camera";
  els.stopBtn.disabled = !state.running;
  els.recalBtn.disabled = !state.running || state.calib.active;
  els.csvBtn.disabled = state.csvRows.length === 0;
  els.resetBtn.disabled = !state.running;
}

function resetReadouts() {
  els.mFlex.textContent = "--";
  els.mKnee.textContent = "--";
  els.mKneeN.textContent = "-- N";
  els.mQuad.textContent = "--";
  els.mArm.textContent = "--";
  els.mGrf.textContent = "--";
  els.mAccel.textContent = "--";
}

function fmt(value, digits, fallback = "--") {
  return Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        heightCm: state.heightM * 100,
        massKg: state.massKg,
        sidePref: state.sidePref,
        legShare: state.legShare,
        patellarArmM: state.patellarArmM,
      }),
    );
  } catch {
    // Storage can be unavailable in private/embedded contexts; not critical.
  }
}

function clearOverlay() {
  const ctx = els.overlay.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
}

function friendlyError(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was blocked. Allow camera access for this page and try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found. Connect a webcam or use a phone with a rear camera.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is already in use by another app or tab.";
    case "OverconstrainedError":
      return "The requested camera mode is not supported on this device.";
    case "AbortError":
      return "The camera could not start. Try again or reload the page.";
    default:
      if (err?.message && /fetch|load|import|module/i.test(err.message)) {
        return "Could not load the pose model or runtime. Make sure the whole pose-widget/assets/ folder was deployed.";
      }
      return (
        err?.message ||
        "Camera unavailable. Check permissions and that this page is served over HTTPS."
      );
  }
}

function showError(title, text) {
  showCalProgress(false);
  setStageNote("");
  els.errTitle.textContent = title;
  els.errText.textContent = text;
  showCard(els.errorCard);
  setStatus("Error", "error");
  setHint(text, "error");
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "This browser does not expose camera access. Use a recent Chrome, Safari, Edge or Firefox over HTTPS.",
    );
  }
  const videoBase = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
  const canFallback = (err) =>
    err?.name === "OverconstrainedError" ||
    err?.name === "TypeError" ||
    err?.name === "NotFoundError";

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...videoBase, facingMode: { exact: "environment" } },
    });
  } catch (err) {
    if (!canFallback(err)) throw err;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...videoBase, facingMode: { ideal: "environment" } },
    });
  } catch (err) {
    if (!canFallback(err)) throw err;
  }

  return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
}

function stopTracks() {
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
    state.stream = null;
  }
  els.video.pause();
  els.video.srcObject = null;
}

async function start() {
  if (state.running || state.starting) return;
  if (!window.isSecureContext) {
    showError(
      "HTTPS required",
      "Browsers only allow camera access on HTTPS pages or localhost. Host this folder on GitHub Pages, Netlify or Cloudflare Pages.",
    );
    return;
  }

  state.starting = true;
  setUiEnabled();
  setStatus("Starting camera…", "busy");
  setHint("Allow camera access, then stand side-on in frame.", "");
  els.startBtn.textContent = "Starting…";

  try {
    const stream = await openCamera();
    state.stream = stream;
    els.video.srcObject = stream;
    try {
      await els.video.play();
    } catch {
      throw new Error(
        "The camera stream could not start. Tap Start camera again.",
      );
    }

    setStatus("Loading pose model…", "busy");
    setHint(
      "Loading MediaPipe Pose Landmarker. The first run downloads the model, then it is cached.",
    );

    const { PoseEngine } = await import("./src/pose.js");
    const engine = new PoseEngine({ model: state.model });
    await engine.init();
    state.engine = engine;
    els.engineInfo.textContent = `Pose engine: MediaPipe BlazePose ${engine.model} · ${engine.activeDelegate}`;

    state.running = true;
    state.starting = false;
    state.calibrated = false;
    state.scale = null;
    state.side = null;
    state.filter = new KeypointFilter(17, {
      minCutoff: 1.4,
      beta: 0.45,
      dCutoff: 1.0,
    });
    state.accel.reset();
    state.repCounter.reset();
    state.currentRep = null;
    state.completedReps = [];
    state.repDirty = true;
    state.csvRows = [];
    state.lastInfer = 0;
    state.lastVideoTime = -1;
    state.lastUi = 0;
    state.lastChart = 0;
    state.noPersonSince = -1;
    state.calib = { active: false, elapsed: 0, lastT: null, samples: [] };
    angleChart.clear();
    forceChart.clear();
    const chartNow = performance.now() / 1000;
    angleChart.draw(chartNow);
    forceChart.draw(chartNow);
    resetReadouts();
    renderReps();
    setUiEnabled();

    els.calTitle.textContent = "Stand tall, side-on";
    els.calText.textContent =
      "Keep your whole body in frame and stand upright. This measures pixels per metre from your height.";
    els.calBtn.textContent = "Start calibration";
    els.calBtn.disabled = false;
    els.calHint.textContent =
      "Camera at hip height, perpendicular to you, 2–3 m away.";
    setCalProgress(0);
    showCalProgress(false);
    setStageNote("");
    els.liveBadge.classList.add("hidden");
    showCard(els.calibrateCard);
    setStatus("Ready · calibrate", "warn");
    setHint(
      `Pose ready on ${engine.activeDelegate}. Stand tall, then press “Start calibration”.`,
    );

    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    state.starting = false;
    stopTracks();
    state.running = false;
    showError("Couldn't start", friendlyError(err));
    setUiEnabled();
  }
}

function stop() {
  state.running = false;
  state.starting = false;
  state.calibrated = false;
  state.scale = null;
  state.side = null;
  state.calib.active = false;
  state.noPersonSince = -1;
  if (state.engine) {
    state.engine.close();
    state.engine = null;
  }
  stopTracks();
  clearOverlay();
  state.accel.reset();
  resetReadouts();
  // Keep the last session's charts, rep summary and CSV rows so the user can
  // press Stop and still download the data. Starting again clears them.
  state.currentRep = null;
  state.repDirty = true;
  renderReps();
  state.lastStatus = "";
  showCalProgress(false);
  setStageNote("");
  els.liveBadge.classList.add("hidden");
  els.engineInfo.textContent = "Pose engine: MediaPipe BlazePose";
  showCard(els.startCard);
  setStatus("Camera off", "idle");
  setHint(
    state.csvRows.length
      ? "Camera stopped · last session is still available as CSV."
      : DEFAULT_HINT,
  );
  setUiEnabled();
}

function beginCalibration() {
  if (!state.running) return;
  state.calibrated = false;
  state.scale = null;
  state.side = null;
  state.calib = { active: false, elapsed: 0, lastT: null, samples: [] };
  state.accel.reset();
  state.repCounter.reset();
  state.currentRep = null;
  state.completedReps = [];
  state.repDirty = true;
  state.csvRows = [];
  angleChart.clear();
  forceChart.clear();
  resetReadouts();
  renderReps();
  state.lastStatus = "";
  els.liveBadge.classList.add("hidden");
  els.calTitle.textContent = "Stand tall, side-on";
  els.calText.textContent =
    "Keep your whole body in frame and stand upright. This measures pixels per metre from your height.";
  els.calBtn.textContent = "Start calibration";
  els.calBtn.disabled = false;
  els.calHint.textContent =
    "Camera at hip height, perpendicular to you, 2–3 m away.";
  setCalProgress(0);
  showCalProgress(false);
  setStageNote("");
  showCard(els.calibrateCard);
  setStatus("Recalibrate", "warn");
  setHint("Stand upright with your whole body visible, then start calibration.");
  setUiEnabled();
}

function startCalibration() {
  if (!state.running || state.calib.active) return;
  state.calibrated = false;
  state.scale = null;
  state.calib = { active: true, elapsed: 0, lastT: null, samples: [] };
  state.filter = new KeypointFilter(17, {
    minCutoff: 1.4,
    beta: 0.45,
    dCutoff: 1.0,
  });
  state.accel.reset();
  state.repCounter.reset();
  state.currentRep = null;
  state.completedReps = [];
  state.repDirty = true;
  state.csvRows = [];
  angleChart.clear();
  forceChart.clear();
  resetReadouts();
  renderReps();
  els.calTitle.textContent = "Stand tall";
  els.calText.textContent = "Collecting calibration frames…";
  els.calBtn.textContent = "Calibrating…";
  els.calBtn.disabled = true;
  els.calHint.textContent = "Hold still, whole body in frame.";
  setCalProgress(0);
  showCard(null);
  showCalProgress(true);
  setStageNote("Stand tall · calibrating");
  setStatus("Calibrating…", "busy");
  setHint("Calibrating · hold still · 3s");
  setUiEnabled();
}

function finishCalibration(now, kf) {
  const samples = state.calib.samples;
  const scale = scaleFromCandidates(samples, 10);
  state.calib.active = false;
  els.calBtn.disabled = false;

  if (samples.length >= 8 && plausibleScale(scale)) {
    state.scale = scale;
    state.calibrated = true;
    state.sessionStart = now;
    state.accel.reset();
    state.repCounter.reset();
    state.currentRep = null;
    state.completedReps = [];
    state.repDirty = true;
    state.csvRows = [];
    state.side =
      state.sidePref === "auto" ? chooseSide(kf, "auto") : state.sidePref;
    setCalProgress(1);
    showCalProgress(false);
    setStageNote("");
    els.liveBadge.classList.remove("hidden");
    showCard(null);
    setStatus("Live", "live");
    setHint(
      `Calibrated · ${(scale * 1000).toFixed(2)} mm/px · ${state.side} leg · pose on ${state.engine?.activeDelegate ?? "?"}`,
    );
    renderReps();
    setUiEnabled();
    return;
  }

  els.calTitle.textContent = "Couldn't calibrate";
  els.calText.textContent =
    "Make sure your whole body — head to feet — is visible, then try again.";
  els.calBtn.textContent = "Try again";
  els.calHint.textContent =
    "Step back, keep the camera level, and stay side-on.";
  setCalProgress(0);
  showCalProgress(false);
  setStageNote("");
  showCard(els.calibrateCard);
  setStatus("Calibration failed", "error");
  setHint(
    "Calibration failed. Step back so your whole body is in frame and try again.",
    "warn",
  );
  setUiEnabled();
}

function handleCalibration(now, kf) {
  const c = state.calib;
  if (!c.active) return;
  const visibility = Math.max(
    sideVisibility(kf, "left"),
    sideVisibility(kf, "right"),
  );
  if (visibility < 0.3) {
    els.calHint.textContent = "Step into frame — head to feet visible.";
    setStatus("No person", "warn");
    c.lastT = now;
    return;
  }
  if (!els.calHint.textContent.startsWith("Hold still")) {
    els.calHint.textContent = "Hold still, whole body in frame.";
  }
  setStatus("Calibrating…", "busy");
  if (c.lastT !== null) {
    c.elapsed += Math.min(0.2, Math.max(0, now - c.lastT));
  }
  c.lastT = now;
  const cand = scaleCandidate(kf, state.heightM);
  if (Number.isFinite(cand) && cand > 2e-4 && cand < 2e-2) {
    c.samples.push(cand);
  }
  const progress = Math.min(1, c.elapsed / 3);
  setCalProgress(progress);
  const remaining = Math.max(1, Math.ceil(3 - c.elapsed));
  els.calText.textContent = `Collecting calibration frames… ${remaining}`;
  setHint(`Calibrating · hold still · ${remaining}s`);
  setStageNote(`Calibrating · hold still · ${remaining}s`);
  if (progress >= 1) finishCalibration(now, kf);
}

function updateReps(flexionDeg, load, now) {
  const result = state.repCounter.update(flexionDeg, now);
  if (result.event === "high") {
    state.currentRep = {
      n: state.repCounter.reps,
      depth: Number.isFinite(flexionDeg) ? flexionDeg : 0,
      peakKnee: load?.jointBW ?? 0,
      peakQuad: load?.quadBW ?? 0,
      t: now,
    };
    state.repDirty = true;
  }
  if (state.currentRep && Number.isFinite(flexionDeg)) {
    state.currentRep.depth = Math.max(state.currentRep.depth, flexionDeg);
    if (load) {
      state.currentRep.peakKnee = Math.max(
        state.currentRep.peakKnee,
        load.jointBW,
      );
      state.currentRep.peakQuad = Math.max(
        state.currentRep.peakQuad,
        load.quadBW,
      );
    }
  }
  if (result.event === "low" && state.currentRep) {
    state.completedReps.push(state.currentRep);
    if (state.completedReps.length > 30) state.completedReps.shift();
    state.currentRep = null;
    state.repDirty = true;
  }
}

function renderReps() {
  els.repCount.textContent = String(state.repCounter.reps);
  els.repPeriod.textContent = Number.isFinite(state.repCounter.lastPeriod)
    ? `${state.repCounter.lastPeriod.toFixed(1)} s / rep`
    : "-- s / rep";

  if (!state.repDirty) return;
  state.repDirty = false;
  els.repList.replaceChildren();

  const recent = state.completedReps.slice(-4);
  const items = recent.map((r) => ({ ...r, current: false }));
  if (state.currentRep) items.push({ ...state.currentRep, current: true });

  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "rep-empty";
    empty.textContent = "Reps appear here after calibration.";
    els.repList.append(empty);
    return;
  }

  for (const rep of items) {
    const chip = document.createElement("span");
    chip.className = "rep-chip";
    const num = document.createElement("b");
    num.textContent = rep.current ? "now" : `#${rep.n}`;
    const depth = document.createElement("span");
    depth.textContent = `${Math.round(rep.depth)}°`;
    const peak = document.createElement("em");
    peak.textContent = `${rep.peakKnee.toFixed(1)} BW`;
    chip.append(num, depth, peak);
    els.repList.append(chip);
  }
}

function updateHud(now, { flex, load, aCom, aComReady }) {
  if (now - state.lastUi < 0.08) return;
  state.lastUi = now;

  els.mFlex.textContent = fmt(flex, 0);
  els.mKnee.textContent = load ? load.jointBW.toFixed(2) : "--";
  els.mKneeN.textContent = load
    ? `${Math.round(load.jointN).toLocaleString()} N`
    : "-- N";
  els.mQuad.textContent = load ? load.quadBW.toFixed(2) : "--";
  els.mArm.textContent = load
    ? (Math.abs(load.armM) * 100).toFixed(1)
    : "--";
  els.mGrf.textContent = load ? load.grfBW.toFixed(2) : "--";
  els.mAccel.textContent = aComReady
    ? `${aCom >= 0 ? "+" : ""}${aCom.toFixed(1)}`
    : "--";

  renderReps();
}

function drawCharts(now) {
  if (now - state.lastChart < 0.05) return;
  state.lastChart = now;
  angleChart.draw(now);
  forceChart.draw(now);
}

function scheduleHeight() {
  postHeight();
}

function loop(ts) {
  if (!state.running) return;
  requestAnimationFrame(loop);

  const video = els.video;
  if (video.readyState < 2 || !video.videoWidth) return;
  if (ts - state.lastInfer < 1000 / 30) return;
  if (video.currentTime === state.lastVideoTime) return;
  state.lastVideoTime = video.currentTime;
  state.lastInfer = ts;
  const now = ts / 1000;

  let result;
  try {
    result = state.engine.detect(video, ts);
  } catch (err) {
    console.error(err);
    setHint("Pose inference failed. Try stopping and starting the camera.", "error");
    return;
  }

  if (!result || !result.landmarks) {
    if (state.noPersonSince < 0) state.noPersonSince = now;
    state.accel.reset();
    if (now - state.noPersonSince > 0.25) {
      setStatus("No person", "warn");
      if (state.calib.active) {
        els.calHint.textContent = "Step into frame — head to feet visible.";
        els.calText.textContent = "Waiting for you to step into frame…";
        setHint("Step into frame — head to feet visible.", "warn");
        setStageNote("Step into frame — head to feet visible");
      } else {
        setHint("Step into frame — head to feet, side-on.", "warn");
        setStageNote("Step into frame");
      }
      clearOverlay();
      resetReadouts();
    }
    drawCharts(now);
    return;
  }
  state.noPersonSince = -1;

  const raw = mediapipeToCoco(
    result.landmarks,
    video.videoWidth,
    video.videoHeight,
  );
  const kf = state.filter.update(raw, now);

  const visible = Math.max(
    sideVisibility(kf, "left"),
    sideVisibility(kf, "right"),
  );
  if (visible < 0.3) {
    setStatus("Occluded", "warn");
    if (state.calib.active) {
      els.calHint.textContent = "Step into frame — head to feet visible.";
      setHint("Step into frame — head to feet visible.", "warn");
      setStageNote("Step into frame — head to feet visible");
    } else {
      setHint(
        "Can't see enough of you. Step back, keep your whole body side-on.",
        "warn",
      );
      setStageNote("Can't see enough of you — step back");
    }
    clearOverlay();
    resetReadouts();
    drawCharts(now);
    return;
  }

  if (state.sidePref !== "auto") state.side = state.sidePref;
  else if (!state.side) state.side = chooseSide(kf, "auto");
  const side = state.side;

  const angles = jointAngles(kf, side);
  const flex = flexion(angles.knee);

  if (state.calib.active) {
    handleCalibration(now, kf);
    if (Number.isFinite(flex)) angleChart.push(now, { flexion: flex });
    drawOverlay(els.overlay, {
      kpts: kf,
      videoW: video.videoWidth,
      videoH: video.videoHeight,
      side,
      angles,
      load: null,
    });
    updateHud(now, { flex, load: null, aCom: 0, aComReady: false });
    drawCharts(now);
    return;
  }

  if (!state.calibrated) {
    if (
      els.statusText.textContent === "No person" ||
      els.statusText.textContent === "Occluded"
    ) {
      setStatus("Ready · calibrate", "warn");
    }
    setStageNote("");
    if (Number.isFinite(flex)) angleChart.push(now, { flexion: flex });
    drawOverlay(els.overlay, {
      kpts: kf,
      videoW: video.videoWidth,
      videoH: video.videoHeight,
      side,
      angles,
      load: null,
    });
    updateHud(now, { flex, load: null, aCom: 0, aComReady: false });
    drawCharts(now);
    return;
  }

  // ---- calibrated: physics ----
  const key = SIDES[side];
  const world = toWorld(kf, state.scale, video.videoHeight);
  const hip = point(world, null, key.hip, KPT_THR);
  const knee = point(world, null, key.knee, KPT_THR);
  const ankle = point(world, null, key.ankle, KPT_THR);

  let aCom = 0;
  let aComReady = false;
  const com = comPixel(kf);
  if (com) {
    const comY = (video.videoHeight - com.y) * state.scale;
    state.accel.add(now, comY);
    const acceleration = state.accel.estimate(now);
    aComReady = acceleration.ok;
    aCom = acceleration.ok ? acceleration.a : 0;
  }

  const load = kneeLoad(
    hip,
    knee,
    ankle,
    state.massKg,
    aCom,
    state.legShare,
    state.patellarArmM,
  );

  if (Number.isFinite(flex)) {
    updateReps(flex, load, now);
    angleChart.push(now, { flexion: flex });
    forceChart.push(now, {
      kneeBW: load?.jointBW ?? NaN,
      quadBW: load?.quadBW ?? NaN,
    });
    state.csvRows.push([
      now - state.sessionStart,
      flex,
      angles.hip,
      load?.grfBW ?? NaN,
      load?.armM ?? NaN,
      load?.torqueNm ?? NaN,
      load?.quadBW ?? NaN,
      load?.jointBW ?? NaN,
      load?.jointN ?? NaN,
      aComReady ? aCom : NaN,
      state.scale,
      state.repCounter.reps,
      state.massKg,
      state.heightM * 100,
      side,
      state.legShare,
      state.patellarArmM,
    ]);
    if (state.csvRows.length > 120000) state.csvRows.shift();
  }

  if (load) {
    setStatus("Live", "live");
    setStageNote("");
    if (
      els.hint.dataset.kind === "warn" ||
      els.hint.dataset.kind === "error"
    ) {
      setHint(`Side view · ${side} leg · BW = body weights`);
    }
  } else {
    setStatus("Occluded", "warn");
    setHint(
      `Can't see the ${side} hip/knee/ankle. Turn slightly or switch leg.`,
      "warn",
    );
    setStageNote("Leg occluded — turn slightly or switch leg");
  }

  drawOverlay(els.overlay, {
    kpts: kf,
    videoW: video.videoWidth,
    videoH: video.videoHeight,
    side,
    angles,
    load,
  });
  updateHud(now, { flex, load, aCom, aComReady });
  drawCharts(now);
  setUiEnabled();
}

function downloadCsv() {
  if (!state.csvRows.length) {
    setHint("No frames recorded yet. Calibrate and do a rep first.", "warn");
    return;
  }
  const header = [
    "time_s",
    "knee_flexion_deg",
    "hip_angle_deg",
    "grf_per_leg_bw",
    "arm_m",
    "torque_nm",
    "quad_force_bw",
    "knee_force_bw",
    "knee_force_n",
    "com_acc_m_s2",
    "scale_m_per_px",
    "reps",
    "mass_kg",
    "height_cm",
    "side",
    "leg_share",
    "patellar_arm_m",
  ];
  const value = (v, digits = 4) =>
    Number.isFinite(v) ? v.toFixed(digits) : "";
  const lines = [header.join(",")];
  for (const row of state.csvRows) {
    lines.push(
      row
        .map((v, i) => {
          if (typeof v === "string") return v;
          if (i === 0) return value(v, 3);
          if (i === 11) return String(v);
          if (i === 12) return value(v, 1);
          if (i === 13) return value(v, 0);
          if (i === 15) return value(v, 2);
          if (i === 16) return value(v, 3);
          return value(v);
        })
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `knee-load-${stamp}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setHint(`CSV downloaded · ${state.csvRows.length} frames.`);
}

function resetReps() {
  state.repCounter.reset();
  state.currentRep = null;
  state.completedReps = [];
  state.repDirty = true;
  renderReps();
  setHint("Rep count reset.");
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await els.widget.requestFullscreen();
  } catch {
    setHint("Fullscreen is not available in this embedding.", "warn");
  }
}

// ---- settings ----
function onHeightChange() {
  const cm = heightCmFrom(els.heightCm.value, state.heightM * 100);
  state.heightM = cm / 100;
  els.heightCm.value = String(Math.round(cm));
  persist();
  if (state.running) {
    setHint("Height changed — recalibrate to update the scale.", "warn");
    beginCalibration();
  }
}

function onMassChange() {
  const kg = clamp(numberOr(els.massKg.value, state.massKg), 30, 250);
  state.massKg = kg;
  els.massKg.value = String(Math.round(kg));
  persist();
}

function onSideChange() {
  state.sidePref = els.side.value;
  state.side = state.sidePref === "auto" ? null : state.sidePref;
  persist();
}

function onLegShareChange() {
  const v = clamp(numberOr(els.legShare.value, state.legShare), 0.1, 1);
  state.legShare = v;
  els.legShare.value = v.toFixed(2);
  persist();
}

function onPatellarArmChange() {
  const cm = clamp(
    numberOr(els.patellarArm.value, state.patellarArmM * 100),
    2,
    8,
  );
  state.patellarArmM = cm / 100;
  els.patellarArm.value = cm.toFixed(1);
  persist();
}

els.startBtn.addEventListener("click", start);
els.retryBtn.addEventListener("click", start);
els.calBtn.addEventListener("click", startCalibration);
els.recalBtn.addEventListener("click", beginCalibration);
els.stopBtn.addEventListener("click", stop);
els.csvBtn.addEventListener("click", downloadCsv);
els.resetBtn.addEventListener("click", resetReps);
els.fsBtn.addEventListener("click", toggleFullscreen);
els.heightCm.addEventListener("change", onHeightChange);
els.massKg.addEventListener("change", onMassChange);
els.side.addEventListener("change", onSideChange);
els.legShare.addEventListener("change", onLegShareChange);
els.patellarArm.addEventListener("change", onPatellarArmChange);

// ---- responsive height for embedding ----
let heightRaf = 0;
function postHeight() {
  if (heightRaf) return;
  heightRaf = requestAnimationFrame(() => {
    heightRaf = 0;
    if (window.parent === window) return;
    const height =
      Math.ceil(document.body.getBoundingClientRect().height) + 2;
    if (height > 0) {
      window.parent.postMessage(
        { type: "pose-widget:height", height },
        "*",
      );
    }
  });
}

const chartObserver = new ResizeObserver(() => {
  angleChart.resize();
  forceChart.resize();
  angleChart.draw(performance.now() / 1000);
  forceChart.draw(performance.now() / 1000);
});
chartObserver.observe(els.angleChart);
chartObserver.observe(els.forceChart);

const bodyObserver = new ResizeObserver(scheduleHeight);
bodyObserver.observe(document.body);

window.addEventListener("resize", () => {
  postHeight();
});
window.addEventListener("pageshow", postHeight);
window.addEventListener("beforeunload", stopTracks);

// initial paint
showCard(els.startCard);
setStatus("Camera off", "idle");
setHint(DEFAULT_HINT);
resetReadouts();
renderReps();
setUiEnabled();
postHeight();
