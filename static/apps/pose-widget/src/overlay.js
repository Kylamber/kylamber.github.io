/**
 * Canvas overlay: skeleton, knee-angle arc, moment arm and force arrow.
 * All drawing is in CSS pixels; the canvas backing store is DPR-scaled.
 */

import { COCO, SIDES, contentRect } from "./core.js";

const BASE = "rgba(255,255,255,0.32)";
const ACCENT = "#cae0a7";
const FORCE = "#ffffff";
const MOMENT = "rgba(255,255,255,0.60)";

const EDGES = [
  [COCO.left_eye, COCO.right_eye],
  [COCO.nose, COCO.left_eye],
  [COCO.nose, COCO.right_eye],
  [COCO.left_ear, COCO.left_eye],
  [COCO.right_ear, COCO.right_eye],
  [COCO.left_shoulder, COCO.right_shoulder],
  [COCO.left_shoulder, COCO.left_ear],
  [COCO.right_shoulder, COCO.right_ear],
  [COCO.left_shoulder, COCO.left_elbow],
  [COCO.left_elbow, COCO.left_wrist],
  [COCO.right_shoulder, COCO.right_elbow],
  [COCO.right_elbow, COCO.right_wrist],
  [COCO.left_shoulder, COCO.left_hip],
  [COCO.right_shoulder, COCO.right_hip],
  [COCO.left_hip, COCO.right_hip],
  [COCO.left_hip, COCO.left_knee],
  [COCO.left_knee, COCO.left_ankle],
  [COCO.right_hip, COCO.right_knee],
  [COCO.right_knee, COCO.right_ankle],
];

const SIDE_EDGES = {
  left: [
    [COCO.left_shoulder, COCO.left_elbow],
    [COCO.left_elbow, COCO.left_wrist],
    [COCO.left_shoulder, COCO.left_hip],
    [COCO.left_hip, COCO.left_knee],
    [COCO.left_knee, COCO.left_ankle],
  ],
  right: [
    [COCO.right_shoulder, COCO.right_elbow],
    [COCO.right_elbow, COCO.right_wrist],
    [COCO.right_shoulder, COCO.right_hip],
    [COCO.right_hip, COCO.right_knee],
    [COCO.right_knee, COCO.right_ankle],
  ],
};

function valid(kpts, i, thr = 0.3) {
  const p = kpts?.[i];
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.score >= thr
    ? p
    : null;
}

function label(ctx, text, x, y, color, align = "center") {
  ctx.font =
    "500 12px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
  const padX = 6;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 20;
  let bx = x - w / 2;
  if (align === "left") bx = x;
  if (align === "right") bx = x - w;
  const by = y - h / 2;
  ctx.fillStyle = "rgba(5, 10, 14, 0.82)";
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + padX, y + 0.5);
}

function dashedLine(ctx, x1, y1, x2, y2, color, dash = 6, gap = 5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([dash, gap]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function arrow(ctx, x, y, dx, dy, length, color, width = 3) {
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n;
  const uy = dy / n;
  const tx = x + ux * length;
  const ty = y + uy * length;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  const head = Math.min(14, 5 + width * 2.5);
  const angle = Math.atan2(uy, ux);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(
    tx - head * Math.cos(angle - 0.42),
    ty - head * Math.sin(angle - 0.42),
  );
  ctx.lineTo(
    tx - head * Math.cos(angle + 0.42),
    ty - head * Math.sin(angle + 0.42),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw one frame of the overlay.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {Array} opts.kpts COCO-17 pixel keypoints (video coordinates)
 * @param {number} opts.videoW
 * @param {number} opts.videoH
 * @param {"left"|"right"} opts.side
 * @param {object} opts.angles
 * @param {object|null} opts.load
 */
export function drawOverlay(canvas, opts) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { kpts, videoW, videoH, side, angles, load } = opts;
  if (!kpts || !videoW || !videoH) return;
  const rect = contentRect(cssW, cssH, videoW, videoH);
  const map = (p) => ({
    x: rect.x + (p.x / videoW) * rect.w,
    y: rect.y + (p.y / videoH) * rect.h,
  });
  const shown = kpts.map((p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return p.score >= 0.3 ? map(p) : null;
  });

  // full skeleton, dim, with a dark halo so it survives a bright sky
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [a, b] of EDGES) {
    const pa = shown[a];
    const pb = shown[b];
    if (!pa || !pb) continue;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.strokeStyle = BASE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // analysed side, highlighted
  for (const [a, b] of SIDE_EDGES[side]) {
    const pa = shown[a];
    const pb = shown[b];
    if (!pa || !pb) continue;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // joints
  for (let i = 0; i < shown.length; i++) {
    const p = shown[i];
    if (!p) continue;
    const isSide = Object.values(SIDES[side]).includes(i);
    const radius = isSide ? 3.2 : 2.2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isSide ? ACCENT : "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const key = SIDES[side];
  const hip = shown[key.hip];
  const knee = shown[key.knee];
  const ankle = shown[key.ankle];

  // flexion arc: between the thigh and the shank extended beyond the knee
  if (hip && knee && ankle && Number.isFinite(angles?.knee)) {
    const shankX = ankle.x - knee.x;
    const shankY = ankle.y - knee.y;
    const shankLen = Math.hypot(shankX, shankY) || 1;
    const extX = knee.x - (shankX / shankLen) * 40;
    const extY = knee.y - (shankY / shankLen) * 40;
    dashedLine(ctx, knee.x, knee.y, extX, extY, "rgba(255,255,255,0.25)", 4, 5);

    const a1 = Math.atan2(hip.y - knee.y, hip.x - knee.x);
    const a2 = Math.atan2(extY - knee.y, extX - knee.x);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const flexDeg = 180 - angles.knee;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(knee.x, knee.y, 24, a1, a1 + diff, diff < 0);
    ctx.stroke();
    ctx.restore();

    const mid = a1 + diff / 2;
    const lx = knee.x + Math.cos(mid) * 42;
    const ly = knee.y + Math.sin(mid) * 42;
    label(ctx, `${flexDeg.toFixed(0)}° flex`, lx, ly, ACCENT);
  }

  if (load && knee && ankle) {
    // moment arm: horizontal distance from knee to the ankle's vertical GRF
    dashedLine(ctx, knee.x, ankle.y, ankle.x, ankle.y, MOMENT, 7, 5);
    label(
      ctx,
      `d ${Math.abs(load.armM).toFixed(2)} m`,
      (knee.x + ankle.x) / 2,
      ankle.y + 16,
      MOMENT,
    );

    // knee compression arrow
    const length = Math.min(110, Math.max(18, load.jointBW * 38));
    arrow(ctx, knee.x, knee.y, 0, -1, length, FORCE, 4);
    label(
      ctx,
      `F_knee ${load.jointBW.toFixed(1)} BW`,
      knee.x,
      knee.y - length - 16,
      FORCE,
    );
  }
}
