// The impact opener: a field of square dots drifts as noise, then pulls
// together into one word after another. Drawn in code; purely decorative.
const WORDS = ["QUESTION", "DATA", "MODEL", "IMPACT"];
const HOLD = 2600; // ms a word stays assembled
const LAST_HOLD = 4200;
const GATHER = 900; // ms for the pull towards a new word to reach full strength
const COLOURS = ["#fffaf0", "#7cf0b8", "#ffd84a", "#a9b8ff"];
const SHARES = [0.68, 0.16, 0.1, 0.06];

export interface SignalControls {
  /** Re-read the site's motion setting. */
  sync(): void;
  destroy(): void;
}

export function signalScene() {
  return `<div class="impact-signal" data-signal aria-hidden="true" hidden><canvas></canvas><p class="signal-note mono"><span>Noise in</span><span data-signal-step>Signal out</span></p></div>`;
}

export function initSignal(isStill: () => boolean): SignalControls | null {
  const found = document.querySelector<HTMLElement>("[data-signal]");
  const canvas = found?.querySelector("canvas");
  const pen = canvas?.getContext("2d");
  if (!found || !canvas || !pen) return null;
  const root = found;
  const surface = canvas;
  const ctx = pen;
  const step = root.querySelector<HTMLElement>("[data-signal-step]");
  root.hidden = false;

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
  let word = -1; // -1 while the field is still noise
  let since = 0;
  let last = 0;
  let frame = 0;
  let visible = false;
  let seen = false;
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
    const size = Math.min((width * 0.86 * 100) / draw.measureText(text).width, height * 0.66);
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
    for (let i = 0; i < count; i++) {
      x[i] = Math.random() * width;
      y[i] = Math.random() * height;
    }
    let total = 0;
    bounds = SHARES.map((share) => Math.round((total += share) * count));
    bounds[bounds.length - 1] = count;
    ready = true;
    if (isStill()) settle();
    else {
      if (word >= 0) aim(word);
      paint();
      run();
    }
  }

  function paint() {
    ctx.clearRect(0, 0, width, height);
    const dot = Math.max(2, cell * 0.62);
    let i = 0;
    bounds.forEach((end, colour) => {
      ctx.fillStyle = COLOURS[colour];
      for (; i < end; i++) ctx.fillRect(x[i] - dot / 2, y[i] - dot / 2, dot, dot);
    });
  }

  /** The finished picture, for paused or reduced motion. */
  function settle() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!ready) return;
    word = WORDS.length - 1;
    aim(word);
    x.set(tx);
    y.set(ty);
    vx.fill(0);
    vy.fill(0);
    if (step) step.textContent = "Signal out";
    paint();
  }

  function show(index: number, now: number) {
    word = index;
    since = now;
    aim(index);
    // A kick outwards first, so each word forms out of a burst of noise.
    for (let i = 0; i < count; i++) {
      vx[i] += (Math.random() - 0.5) * cell * 5;
      vy[i] += (Math.random() - 0.5) * cell * 5;
    }
    if (step) step.textContent = `0${index + 1} / ${WORDS[index]}`;
  }

  function tick(now: number) {
    frame = 0;
    const scale = Math.min(2.5, (now - (last || now)) / 16.7) || 1;
    last = now;
    if (word < 0) {
      if (seen) show(0, now);
    } else if (now - since > (word === WORDS.length - 1 ? LAST_HOLD : HOLD)) show((word + 1) % WORDS.length, now);
    const pull = word < 0 ? 0 : Math.min(1, (now - since) / GATHER) ** 2 * 0.07;
    const reach = Math.max(70, width * 0.085);
    const drag = Math.pow(0.84, scale);
    for (let i = 0; i < count; i++) {
      if (word < 0) {
        vx[i] += (Math.random() - 0.5) * 0.3;
        vy[i] += (Math.random() - 0.5) * 0.3;
      } else {
        vx[i] += (tx[i] - x[i]) * pull * scale;
        vy[i] += (ty[i] - y[i]) * pull * scale;
      }
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
      if (word < 0) {
        if (x[i] < 0) x[i] += width;
        else if (x[i] > width) x[i] -= width;
        if (y[i] < 0) y[i] += height;
        else if (y[i] > height) y[i] -= height;
      }
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
      // Coming back from a pause, pick the cycle up where it stands.
      since = performance.now();
      run();
    }
  }

  const watch = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      visible = entry.isIntersecting;
      if (entry.intersectionRatio > 0.4) seen = true;
      if (visible) run();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
  }, { threshold: [0, 0.4] });
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
  // The words are set in the display face, so wait for it before sampling.
  const fonts = document.fonts;
  let alive = true;
  void Promise.race([fonts.load('900 100px "Big Shoulders"'), new Promise((done) => setTimeout(done, 1500))]).then(() => {
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
    },
  };
}
