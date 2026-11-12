// The impact opener: a field of square dots that scrolling pulls out of noise
// into one word after another. Drawn in code; purely decorative.
const WORDS = ["QUESTION", "DATA", "MODEL", "IMPACT"];
// Dot colours for the night and day themes, most common first.
const NIGHT = ["#f4f1e8", "#8fa0ff"];
const DAY = ["#0d0f1a", "#2b45ff"];
const SHARES = [0.74, 0.26];

export interface SignalControls {
  /** Re-read the site's motion setting. */
  sync(): void;
  destroy(): void;
}

export function signalScene() {
  return `<div class="impact-signal" data-signal aria-hidden="true" hidden><div class="signal-pin"><canvas></canvas><p class="signal-note mono"><span>How every project runs</span><span class="signal-steps">${WORDS.map((word, i) => `<span data-signal-step><b>0${i + 1}</b> ${word}</span>`).join("")}</span></p></div></div>`;
}

const smooth = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

export function initSignal(isStill: () => boolean): SignalControls | null {
  const outer = document.querySelector<HTMLElement>("[data-signal]");
  const found = outer?.querySelector<HTMLElement>(".signal-pin");
  const canvas = found?.querySelector("canvas");
  const pen = canvas?.getContext("2d");
  if (!outer || !found || !canvas || !pen) return null;
  const track = outer;
  const root = found;
  const surface = canvas;
  const ctx = pen;
  const steps = [...root.querySelectorAll<HTMLElement>("[data-signal-step]")];
  const mark = (index: number) => steps.forEach((step, i) => step.classList.toggle("is-on", i === index));
  track.hidden = false;

  let width = 0;
  let height = 0;
  let cell = 6;
  let count = 0;
  let x = new Float32Array(0);
  let y = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let tx = new Float32Array(0); // where each dot sits in the current word
  let ty = new Float32Array(0);
  let hx = new Float32Array(0); // where it drifts while the field is noise
  let hy = new Float32Array(0);
  let shapes: Float32Array[] = [];
  let bounds: number[] = []; // where each colour's run of dots ends
  let word = -1;
  let last = 0;
  let frame = 0;
  let visible = false;
  let ready = false;
  let pointerX = -9999;
  let pointerY = -9999;

  /** Dot positions that spell one word, as x,y pairs in a random order. */
  function sample(text: string) {
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const draw = off.getContext("2d", { willReadFrequently: true })!;
    const family = '"Big Shoulders", Impact, "Arial Narrow", sans-serif';
    draw.font = `900 100px ${family}`;
    const size = Math.min((width * 0.86 * 100) / draw.measureText(text).width, height * 0.6);
    draw.font = `900 ${size}px ${family}`;
    draw.textAlign = "center";
    draw.textBaseline = "middle";
    draw.fillText(text, width / 2, height * 0.47 + size * 0.04);
    const data = draw.getImageData(0, 0, width, height).data;
    const points: number[] = [];
    for (let py = cell / 2; py < height; py += cell)
      for (let px = cell / 2; px < width; px += cell)
        if (data[(Math.floor(py) * width + Math.floor(px)) * 4 + 3] > 128) points.push(px, py);
    for (let i = points.length / 2 - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i * 2], points[j * 2]] = [points[j * 2], points[i * 2]];
      [points[i * 2 + 1], points[j * 2 + 1]] = [points[j * 2 + 1], points[i * 2 + 1]];
    }
    return new Float32Array(points);
  }

  function aim(index: number) {
    word = index;
    const shape = shapes[index];
    const points = shape.length / 2;
    for (let i = 0; i < count; i++) {
      tx[i] = shape[(i % points) * 2];
      ty[i] = shape[(i % points) * 2 + 1];
    }
  }

  function build() {
    width = Math.round(root.clientWidth);
    height = Math.round(root.clientHeight);
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    surface.width = width * ratio;
    surface.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    cell = Math.max(4, Math.round(width / 210));
    shapes = WORDS.map(sample);
    count = Math.max(...shapes.map((shape) => shape.length / 2));
    x = new Float32Array(count);
    y = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);
    tx = new Float32Array(count);
    ty = new Float32Array(count);
    hx = new Float32Array(count);
    hy = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      x[i] = hx[i] = Math.random() * width;
      y[i] = hy[i] = Math.random() * height;
    }
    let total = 0;
    bounds = SHARES.map((share) => Math.round((total += share) * count));
    bounds[bounds.length - 1] = count;
    ready = true;
    aim(0);
    if (isStill()) settle();
    else {
      paint();
      run();
    }
  }

  function paint() {
    const colours = document.documentElement.dataset.theme === "dark" ? NIGHT : DAY;
    ctx.clearRect(0, 0, width, height);
    const dot = Math.max(2, cell * 0.62);
    let i = 0;
    bounds.forEach((end, colour) => {
      ctx.fillStyle = colours[colour];
      for (; i < end; i++) ctx.fillRect(x[i] - dot / 2, y[i] - dot / 2, dot, dot);
    });
  }

  /** The finished picture, for paused or reduced motion. */
  function settle() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!ready) return;
    aim(WORDS.length - 1);
    x.set(tx);
    y.set(ty);
    vx.fill(0);
    vy.fill(0);
    mark(word);
    paint();
  }

  /** How far the page has scrolled through the pinned stretch, from 0 to 1. */
  function progress() {
    const box = track.getBoundingClientRect();
    const travel = box.height - root.offsetHeight;
    if (travel < 2) return 1;
    const top = parseFloat(getComputedStyle(root).top) || 0;
    return Math.max(0, Math.min(1, (top - box.top) / travel));
  }

  function tick(now: number) {
    frame = 0;
    const scale = Math.min(2.5, (now - (last || now)) / 16.7) || 1;
    last = now;
    // Each word owns an equal share of the scroll: it gathers, holds, then
    // breaks back into noise before the next one. The last word stays.
    const along = progress() * WORDS.length;
    const index = Math.min(WORDS.length - 1, Math.floor(along));
    const within = along - index;
    if (index !== word) aim(index);
    const leaving = index === WORDS.length - 1 ? 0 : smooth(0.74, 1, within);
    const loose = Math.max(1 - smooth(0, 0.34, within), leaving);
    mark(loose < 0.5 ? index : -1);
    const reach = Math.max(70, width * 0.085);
    const drag = Math.pow(0.84, scale);
    for (let i = 0; i < count; i++) {
      const goalX = tx[i] + (hx[i] - tx[i]) * loose;
      const goalY = ty[i] + (hy[i] - ty[i]) * loose;
      vx[i] += ((goalX - x[i]) * 0.07 + (Math.random() - 0.5) * 0.5 * loose) * scale;
      vy[i] += ((goalY - y[i]) * 0.07 + (Math.random() - 0.5) * 0.5 * loose) * scale;
      const dx = x[i] - pointerX;
      const dy = y[i] - pointerY;
      const near = dx * dx + dy * dy;
      if (near < reach * reach) {
        const distance = Math.sqrt(near) || 1;
        const push = (1 - distance / reach) * 5 * scale;
        vx[i] += (dx / distance) * push;
        vy[i] += (dy / distance) * push;
      }
      vx[i] *= drag;
      vy[i] *= drag;
      x[i] += vx[i] * scale;
      y[i] += vy[i] * scale;
    }
    paint();
    run();
  }

  function run() {
    if (frame || !ready || !visible || document.hidden || isStill()) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (isStill()) settle();
    else run();
  }

  const watch = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      visible = entry.isIntersecting;
      if (visible) run();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
  });
  watch.observe(root);
  let sizeTimer = 0;
  const sizes = new ResizeObserver(() => {
    if (Math.round(root.clientWidth) === width && Math.round(root.clientHeight) === height) return;
    clearTimeout(sizeTimer);
    sizeTimer = window.setTimeout(build, ready ? 150 : 0);
  });
  function move(event: PointerEvent) {
    const box = root.getBoundingClientRect();
    pointerX = event.clientX - box.left;
    pointerY = event.clientY - box.top;
  }
  function leave() {
    pointerX = pointerY = -9999;
  }
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", run);
  const recolour = () => {
    if (ready) paint();
  };
  window.addEventListener("portfolio-theme-change", recolour);
  // The words are set in the display face, so wait for it before sampling.
  let alive = true;
  void Promise.race([document.fonts.load('900 100px "Big Shoulders"'), new Promise((done) => setTimeout(done, 1500))]).then(() => {
    if (!alive) return;
    build();
    sizes.observe(root);
  });

  return {
    sync,
    destroy() {
      alive = false;
      cancelAnimationFrame(frame);
      clearTimeout(sizeTimer);
      watch.disconnect();
      sizes.disconnect();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("portfolio-theme-change", recolour);
    },
  };
}
