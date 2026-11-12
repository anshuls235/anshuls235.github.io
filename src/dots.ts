// A field of square dots that gathers into one piece of lettering at a time.
// The impact stage and the contact greeting both draw with it.
const LATIN = '"Big Shoulders", Impact, "Arial Narrow", sans-serif';

export interface DotFieldOptions {
  texts: string[];
  /** Two colours: most of the dots, then the highlighted share. */
  colours: () => string[];
  isStill: () => boolean;
  /** Fit to the drawn letterforms rather than the type size, for mixed scripts. */
  fitInk?: boolean;
  /** How long one text stays up before `onTurn` is asked for the next. */
  dwell?: number;
  onTurn?: () => void;
}

export interface DotField {
  /** Gather the dots into one of the texts. */
  show(index: number, burst?: boolean): void;
  /** Turn the automatic change of text on or off. */
  setAuto(on: boolean): void;
  /** Re-read the site's motion setting. */
  sync(): void;
  repaint(): void;
  destroy(): void;
}

export function dotField(root: HTMLElement, options: DotFieldOptions): DotField | null {
  const canvas = root.querySelector("canvas");
  const pen = canvas?.getContext("2d");
  if (!canvas || !pen || !options.texts.length) return null;
  const surface = canvas;
  const ctx = pen;
  const { texts, colours, isStill, dwell = 0 } = options;

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
  let active = 0; // dots the current text needs; the rest tuck in behind them
  let current = 0;
  let auto = dwell > 0;
  let since = 0;
  let last = 0;
  let frame = 0;
  let visible = false;
  let ready = false;
  let pointerX = -9999;
  let pointerY = -9999;

  /** Dot positions that spell one text, as x,y pairs in a random order. */
  function sample(text: string) {
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const draw = off.getContext("2d", { willReadFrequently: true })!;
    draw.font = `900 100px ${LATIN}`;
    draw.textAlign = "center";
    const measured = draw.measureText(text);
    if (options.fitInk) {
      const up = measured.actualBoundingBoxAscent;
      const down = measured.actualBoundingBoxDescent;
      const size = Math.min((width * 0.9 * 100) / measured.width, (height * 0.8 * 100) / (up + down));
      draw.font = `900 ${size}px ${LATIN}`;
      draw.textBaseline = "alphabetic";
      draw.fillText(text, width / 2, height / 2 + ((up - down) / 2) * (size / 100));
    } else {
      const size = Math.min((width * 0.88 * 100) / measured.width, height * 0.78);
      draw.font = `900 ${size}px ${LATIN}`;
      draw.textBaseline = "middle";
      draw.fillText(text, width / 2, height / 2 + size * 0.04);
    }
    const data = draw.getImageData(0, 0, width, height).data;
    const points: number[] = [];
    for (let py = cell / 2; py < height; py += cell)
      for (let px = cell / 2; px < width; px += cell)
        if (data[(Math.floor(py) * width + Math.floor(px)) * 4 + 3] > 128) points.push(px, py);
    if (!points.length) points.push(width / 2, height / 2);
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
    active = points;
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
    shapes = texts.map(sample);
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
    ready = true;
    aim(current);
    if (isStill()) settle();
    else {
      paint();
      run();
    }
  }

  function paint() {
    const palette = colours();
    ctx.clearRect(0, 0, width, height);
    const dot = Math.max(2, cell * 0.62);
    // Seven dots in every twenty-five take the highlight colour.
    palette.forEach((colour, pass) => {
      ctx.fillStyle = colour;
      for (let i = 0; i < count; i++) {
        if (Number(i % 25 < 7) !== pass) continue;
        // Spare dots disappear once they have landed, so short texts keep their mix.
        if (i >= active && Math.abs(x[i] - tx[i]) + Math.abs(y[i] - ty[i]) < 1.5) continue;
        ctx.fillRect(x[i] - dot / 2, y[i] - dot / 2, dot, dot);
      }
    });
  }

  /** The finished lettering, for paused or reduced motion. */
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

  function show(index: number, burst = true) {
    current = (index + texts.length) % texts.length;
    since = performance.now();
    if (!ready) return;
    aim(current);
    if (isStill()) return settle();
    // A kick outwards first, so each text forms out of a burst of noise.
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
    if (auto && now - since > dwell) {
      since = now;
      options.onTurn?.();
    }
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
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", run);
  // The lettering is set in the display face, so wait for it before sampling.
  let alive = true;
  void Promise.race([document.fonts.load('900 100px "Big Shoulders"'), new Promise((done) => setTimeout(done, 1500))]).then(() => {
    if (!alive) return;
    build();
    sizes.observe(root);
  });

  return {
    show,
    setAuto(on) {
      auto = on && dwell > 0;
      since = performance.now();
    },
    sync,
    repaint() {
      if (ready) paint();
    },
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
