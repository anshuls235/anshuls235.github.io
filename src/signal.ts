// The impact stage: a field of square dots gathers into each reported result
// in turn, while the matching project is shown beneath it. The figures come
// from the published cards; the canvas only draws them.
const DWELL = 5200; // ms each result stays up before the next one forms
const NIGHT = ["#f4f1e8", "#ff5a2b"];
const DAY = ["#0d0f1a", "#ff4d1c"];
const SHARES = [0.72, 0.28];

export interface SignalControls {
  /** Re-read the site's motion setting. */
  sync(): void;
  destroy(): void;
}

export function signalScene() {
  return `<div class="impact-signal" data-signal aria-hidden="true" hidden><canvas></canvas></div>`;
}

export function initSignal(isStill: () => boolean): SignalControls | null {
  const section = document.querySelector<HTMLElement>("#impact");
  const found = section?.querySelector<HTMLElement>("[data-signal]");
  const canvas = found?.querySelector("canvas");
  const pen = canvas?.getContext("2d");
  const cards = [...(section?.querySelectorAll<HTMLElement>(".impact-card[data-metric]") ?? [])];
  if (!section || !found || !canvas || !pen || !cards.length) return null;
  const root = found;
  const surface = canvas;
  const ctx = pen;
  const tabs = [...section.querySelectorAll<HTMLButtonElement>("[data-impact-tab]")];
  const figures = cards.map((card) => card.dataset.metric ?? "");
  root.hidden = false;
  section.classList.add("is-live");

  let width = 0;
  let height = 0;
  let cell = 6;
  let count = 0;
  let x = new Float32Array(0);
  let y = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let tx = new Float32Array(0);
  let ty = new Float32Array(0);
  let shapes: Float32Array[] = [];
  let bounds: number[] = []; // where each colour's run of dots ends
  let current = 0;
  let auto = true; // stops once the visitor picks a result
  let since = 0;
  let last = 0;
  let frame = 0;
  let visible = false;
  let ready = false;
  let pointerX = -9999;
  let pointerY = -9999;

  /** Dot positions that spell one figure, as x,y pairs in a random order. */
  function sample(text: string) {
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const draw = off.getContext("2d", { willReadFrequently: true })!;
    const family = '"Big Shoulders", Impact, "Arial Narrow", sans-serif';
    draw.font = `900 100px ${family}`;
    const size = Math.min((width * 0.88 * 100) / draw.measureText(text).width, height * 0.78);
    draw.font = `900 ${size}px ${family}`;
    draw.textAlign = "center";
    draw.textBaseline = "middle";
    draw.fillText(text, width / 2, height / 2 + size * 0.04);
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
    shapes = figures.map(sample);
    count = Math.max(...shapes.map((shape) => shape.length / 2));
    x = new Float32Array(count);
    y = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);
    tx = new Float32Array(count);
    ty = new Float32Array(count);
    // The field starts as noise and gathers when it first comes into view.
    for (let i = 0; i < count; i++) {
      x[i] = Math.random() * width;
      y[i] = Math.random() * height;
    }
    let total = 0;
    bounds = SHARES.map((share) => Math.round((total += share) * count));
    bounds[bounds.length - 1] = count;
    ready = true;
    aim(current);
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

  /** The finished figure, for paused or reduced motion. */
  function settle() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!ready) return;
    x.set(tx);
    y.set(ty);
    vx.fill(0);
    vy.fill(0);
    paint();
  }

  /** Show one result: its card, its tab and its figure in the dots. */
  function select(index: number, burst = true) {
    current = (index + cards.length) % cards.length;
    cards.forEach((card, i) => {
      card.classList.toggle("is-current", i === current);
      card.inert = i !== current;
    });
    tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(i === current)));
    since = performance.now();
    if (!ready) return;
    aim(current);
    if (isStill()) return settle();
    // A kick outwards first, so each figure forms out of a burst of noise.
    if (burst)
      for (let i = 0; i < count; i++) {
        vx[i] += (Math.random() - 0.5) * cell * 6;
        vy[i] += (Math.random() - 0.5) * cell * 6;
      }
    run();
  }

  function tick(now: number) {
    frame = 0;
    const scale = Math.min(2.5, (now - (last || now)) / 16.7) || 1;
    last = now;
    if (auto && cards.length > 1 && now - since > DWELL) select(current + 1);
    const reach = Math.max(70, width * 0.085);
    const drag = Math.pow(0.84, scale);
    for (let i = 0; i < count; i++) {
      vx[i] += (tx[i] - x[i]) * 0.06 * scale;
      vy[i] += (ty[i] - y[i]) * 0.06 * scale;
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
    else {
      since = performance.now();
      run();
    }
  }

  const watch = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) since = performance.now();
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
  function pick(event: Event) {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-impact-tab]") : null;
    if (!tab) return;
    auto = false;
    select(Number(tab.dataset.impactTab));
  }
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerleave", leave);
  section.addEventListener("click", pick);
  document.addEventListener("visibilitychange", run);
  const recolour = () => {
    if (ready) paint();
  };
  window.addEventListener("portfolio-theme-change", recolour);
  select(0, false);
  // The figures are set in the display face, so wait for it before sampling.
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
      section.removeEventListener("click", pick);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("portfolio-theme-change", recolour);
    },
  };
}
