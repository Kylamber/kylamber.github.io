/**
 * Small dependency-free rolling charts on a 2D canvas.
 */

const THEMES = {
  dark: {
    grid: "rgba(204,204,204,0.16)",
    text: "rgba(204,204,204,0.60)",
    threshold: "rgba(204,204,204,0.30)",
    accent: "#cae0a7",
    accent2: "#79a688",
    amber: "#d9a05b",
    dim: "rgba(204,204,204,0.40)",
  },
  light: {
    grid: "rgba(51,51,51,0.14)",
    text: "rgba(51,51,51,0.62)",
    threshold: "rgba(51,51,51,0.28)",
    accent: "#0000ee",
    accent2: "#663399",
    amber: "#9a5700",
    dim: "rgba(51,51,51,0.40)",
  },
};

const PAD = { left: 38, right: 10, top: 10, bottom: 18 };

export class RollingChart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {number} opts.windowS
   * @param {boolean} opts.fixedY
   * @param {number} opts.yMin
   * @param {number} opts.yMax
   * @param {Array<{key:string,color:string,width?:number,dash?:number[]}>} opts.series
   * @param {Array<{value:number,color?:string,label?:string}>} opts.thresholds
   * @param {(v:number)=>string} opts.format
   * @param {"dark"|"light"} opts.theme
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.windowS = opts.windowS ?? 12;
    this.fixedY = opts.fixedY ?? false;
    this.yMin = opts.yMin ?? 0;
    this.yMax = opts.yMax ?? 4;
    this.series = opts.series ?? [];
    this.thresholds = opts.thresholds ?? [];
    this.format = opts.format ?? ((v) => v.toFixed(1));
    this.colors = THEMES[opts.theme] || THEMES.light;
    this.samples = [];
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setTheme(theme) {
    this.colors = THEMES[theme] || THEMES.light;
  }

  _color(value, fallback) {
    if (!value) return fallback;
    return this.colors[value] || value;
  }

  push(t, sample) {
    this.samples.push({ t, ...sample });
    const cutoff = t - this.windowS - 2;
    while (this.samples.length && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  clear() {
    this.samples.length = 0;
  }

  _yMax(now) {
    if (this.fixedY) return this.yMax;
    let max = this.yMin;
    for (const s of this.samples) {
      if (s.t < now - this.windowS) continue;
      for (const series of this.series) {
        const v = s[series.key];
        if (Number.isFinite(v)) max = Math.max(max, v);
      }
    }
    return Math.max(this.yMax, Math.ceil(max * 1.15 * 2) / 2);
  }

  draw(now) {
    const ctx = this.ctx;
    if (!this.w || !this.h) return;
    const { left, right, top, bottom } = PAD;
    const plotW = Math.max(1, this.w - left - right);
    const plotH = Math.max(1, this.h - top - bottom);
    const t0 = now - this.windowS;
    const yMax = this._yMax(now);
    const yMin = this.yMin;
    const x = (t) => left + ((t - t0) / this.windowS) * plotW;
    const y = (v) => top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

    ctx.clearRect(0, 0, this.w, this.h);

    // horizontal grid + y labels
    ctx.font =
      "10px 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4;
      const py = y(v);
      ctx.strokeStyle = this.colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, py + 0.5);
      ctx.lineTo(left + plotW, py + 0.5);
      ctx.stroke();
      ctx.fillStyle = this.colors.text;
      ctx.fillText(this.format(v), left - 6, py);
    }

    // x labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const marks = [0, 0.5, 1];
    for (const m of marks) {
      const t = t0 + this.windowS * m;
      const px = x(t);
      ctx.fillStyle = this.colors.text;
      ctx.fillText(
        m === 1 ? "now" : `${Math.round(-this.windowS * (1 - m))}s`,
        px,
        this.h - bottom + 4,
      );
    }

    // thresholds
    for (const th of this.thresholds) {
      if (th.value < yMin || th.value > yMax) continue;
      const py = y(th.value);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this._color(th.color, this.colors.threshold);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(left + plotW, py);
      ctx.stroke();
      ctx.restore();
    }

    // series
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, plotW, plotH);
    ctx.clip();
    for (const series of this.series) {
      const color = this._color(series.color, this.colors.accent);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = series.width ?? 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (series.dash) ctx.setLineDash(series.dash);
      let started = false;
      for (const s of this.samples) {
        if (s.t < t0) continue;
        const v = s[series.key];
        if (!Number.isFinite(v)) {
          started = false;
          continue;
        }
        const px = x(s.t);
        const py = y(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // leading dot
      for (let i = this.samples.length - 1; i >= 0; i--) {
        const s = this.samples[i];
        if (s.t < t0) break;
        const v = s[series.key];
        if (Number.isFinite(v)) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x(s.t), y(v), 2.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.restore();
  }
}

export { THEMES };
