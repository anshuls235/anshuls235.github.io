// Generative "flux" fields for project art: one particle cloud that settles
// into a different formation per project and morphs between them. Decorative
// only; the illustrated vignette stays in the markup as the no-script fallback.
const TAU = Math.PI * 2;
const INK = "#0d0f1a";
const MORPH_SECONDS = 1.5;

interface Formation {
  label: string;
  tilt: number;
  yaw(t: number): number;
  /** Writes particle i's position into px/py/pz. */
  at(i: number, n: number, r1: number, r2: number, r3: number, t: number): void;
}
let px = 0;
let py = 0;
let pz = 0;

const FORMATIONS: Record<string, Formation> = {
  // Three arms winding into a funnel: many searches, one answer.
  spiral: {
    label: "Spiral flux",
    tilt: 0.95,
    yaw: (t) => t * 0.05,
    at(i, _n, r1, r2, r3, t) {
      const rad = 0.06 + Math.pow(r1, 0.7) * 1.05;
      const ang = (i % 3) * 2.094 + rad * 4.2 - t * (0.18 + 0.17 / (0.3 + rad)) + (r2 - 0.5) * 0.5 * (1 - rad * 0.5);
      px = Math.cos(ang) * rad;
      pz = Math.sin(ang) * rad;
      py = (r3 - 0.5) * 0.1 * (1.2 - rad) - 0.45 * Math.exp(-rad * 3.2) + 0.12;
    },
  },
  // A breathing globe of documents with a retrieval ring.
  sphere: {
    label: "Knowledge sphere",
    tilt: 0.35,
    yaw: (t) => t * 0.18,
    at(i, n, r1, r2, r3, t) {
      if (r3 < 0.14) {
        const ang = r1 * TAU + t * 0.4;
        const ring = 1.08 + (r2 - 0.5) * 0.06;
        px = Math.cos(ang) * ring;
        pz = Math.sin(ang) * ring;
        py = (r2 - 0.5) * 0.03;
        return;
      }
      const y = 1 - (2 * i) / n;
      const band = Math.sqrt(1 - y * y);
      const ang = i * 2.39996 + t * 0.1;
      const radius = 0.78 + 0.05 * Math.sin(y * 9 - t * 1.6);
      px = Math.cos(ang) * band * radius;
      pz = Math.sin(ang) * band * radius;
      py = y * radius;
    },
  },
  // Three strands flowing left to right around a core stream.
  helix: {
    label: "Pipeline helix",
    tilt: 0.25,
    yaw: (t) => -0.4 + 0.25 * Math.sin(t * 0.3),
    at(i, n, r1, r2, r3, t) {
      const along = (i / n + t * 0.02) % 1;
      px = (along * 2 - 1) * 1.25;
      if (r3 < 0.2) {
        py = (r1 - 0.5) * 0.08;
        pz = (r2 - 0.5) * 0.08;
        return;
      }
      const ang = px * 5 + (i % 3) * 2.094 + t * 0.9;
      const radius = 0.34 + 0.1 * Math.sin(px * 2.5 - t);
      py = Math.cos(ang) * radius + (r1 - 0.5) * 0.03;
      pz = Math.sin(ang) * radius + (r2 - 0.5) * 0.03;
    },
  },
  // A rippling surface that climbs: signal turning into a decision.
  terrain: {
    label: "Signal terrain",
    tilt: 0.5,
    yaw: (t) => -0.5 + 0.2 * Math.sin(t * 0.25),
    at(i, n, _r1, _r2, _r3, t) {
      const cols = Math.ceil(Math.sqrt(n * 1.6));
      const rows = Math.ceil(n / cols);
      px = (((i % cols) / (cols - 1)) * 2 - 1) * 1.25;
      pz = ((Math.floor(i / cols) / (rows - 1)) * 2 - 1) * 0.8;
      const grow = (px + 1.25) / 2.5;
      py = -0.45 + grow * grow * 0.55 + 0.16 * Math.sin(px * 3.2 + t * 0.9) * Math.cos(pz * 3.4 - t * 0.6) * (0.35 + grow);
    },
  },
  // Counter-rotating rings, like a lens finding focus.
  iris: {
    label: "Vision iris",
    tilt: 0.1,
    yaw: (t) => 0.35 * Math.sin(t * 0.4),
    at(_i, _n, r1, r2, r3, t) {
      const ring = Math.floor(r1 * 8);
      const ang = r2 * TAU + (ring % 2 ? 1 : -1) * t * (0.25 + 0.03 * ring);
      const rad = (0.14 + ring * 0.125 + (r3 - 0.5) * 0.02) * (1 + 0.06 * Math.sin(ang * 6 + t));
      px = Math.cos(ang) * rad;
      py = Math.sin(ang) * rad;
      pz = 0.25 * Math.sin(rad * 5 - t * 1.2);
    },
  },
  // A core with agents circling it on tilted orbits.
  orbits: {
    label: "Agent orbits",
    tilt: 0.3,
    yaw: (t) => t * 0.12,
    at(i, _n, r1, r2, r3, t) {
      if (r3 < 0.3) {
        const y = 1 - 2 * r1;
        const band = Math.sqrt(1 - y * y);
        const ang = r2 * TAU + t * 0.5;
        const radius = 0.26 * (1 + 0.08 * Math.sin(t * 2 + i));
        px = Math.cos(ang) * band * radius;
        pz = Math.sin(ang) * band * radius;
        py = y * radius;
        return;
      }
      const k = i % 4;
      const speed = 0.5 - k * 0.08;
      const ang = r2 < 0.35 ? t * speed + k * 1.7 + (r1 - 0.5) * 0.35 : r1 * TAU + t * speed;
      const radius = 0.55 + k * 0.17;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      const y = (r2 - 0.5) * 0.02;
      const tiltX = (k - 1.5) * 0.5;
      const tiltZ = k * 0.4;
      const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX);
      pz = y * Math.sin(tiltX) + z * Math.cos(tiltX);
      px = x * Math.cos(tiltZ) - y1 * Math.sin(tiltZ);
      py = x * Math.sin(tiltZ) + y1 * Math.cos(tiltZ);
    },
  },
};
const BY_KIND: Record<string, string[]> = {
  search: ["spiral"],
  retrieval: ["sphere", "orbits"],
  pipeline: ["helix"],
  chart: ["terrain"],
  vision: ["iris"],
};

/** Projects of the same kind take turns through that kind's formations. */
export function fluxFormation(kind: string, variant = 0) {
  const options = BY_KIND[kind] ?? ["orbits"];
  return options[variant % options.length];
}
export function fluxCanvas(formation: string) {
  return `<canvas class="flux-canvas" data-flux="${formation}" aria-hidden="true"></canvas><span class="flux-label mono" aria-hidden="true">${FORMATIONS[formation].label}</span>`;
}

interface Field {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  host: HTMLElement;
  card: HTMLElement | null;
  to: Formation;
  from: Formation | null;
  morph: number;
  colors: string[];
  seeds: Float32Array;
  count: number;
  visible: boolean;
  dirty: boolean;
  lookX: number;
  lookY: number;
  aimX: number;
  aimY: number;
}
const fields = new Map<HTMLCanvasElement, Field>();
let still = false;
let frame = 0;
let last = 0;
let clock = 0;
let energy = 0;
let swirl = 0;
let lastScroll = 0;

// Created on first mount so the markup helpers above stay importable at build time.
let visibility: IntersectionObserver;
let sizes: ResizeObserver;
function observe() {
  if (visibility) return;
  visibility = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const field = fields.get(entry.target as HTMLCanvasElement);
      if (field) field.visible = entry.isIntersecting;
    });
    schedule();
  });
  sizes = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const field = fields.get(entry.target as HTMLCanvasElement);
      if (field) fit(field);
    });
    schedule();
  });
  // Scrolling stirs the field: faster scrolling spins it up, then it settles.
  window.addEventListener(
    "scroll",
    () => {
      energy = Math.min(2.5, energy + Math.abs(scrollY - lastScroll) / 500);
      lastScroll = scrollY;
      schedule();
    },
    { passive: true },
  );
}

function fit(field: Field) {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(field.canvas.clientWidth * ratio);
  const height = Math.round(field.canvas.clientHeight * ratio);
  if (!width || !height || (field.canvas.width === width && field.canvas.height === height)) return;
  field.canvas.width = width;
  field.canvas.height = height;
  field.dirty = true;
}

function draw(field: Field, t: number) {
  const { ctx, canvas, seeds, count, to, from } = field;
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  // A translucent wash leaves short trails while moving; still frames are crisp.
  ctx.globalAlpha = still || field.dirty ? 1 : 0.34;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  field.dirty = false;

  const m = from ? field.morph : 1;
  const ease = m < 0.5 ? 4 * m * m * m : 1 - Math.pow(-2 * m + 2, 3) / 2;
  const burst = from ? Math.sin(Math.PI * m) : 0;
  const tilt = (from ? from.tilt + (to.tilt - from.tilt) * ease : to.tilt) + field.lookY * 0.3;
  const yaw = (from ? from.yaw(t) + (to.yaw(t) - from.yaw(t)) * ease : to.yaw(t)) + swirl + field.lookX * 0.5;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosX = Math.cos(tilt);
  const sinX = Math.sin(tilt);
  const unit = Math.min(w, h * 1.15) * 0.32 * (1 + Math.min(energy, 1) * 0.05);
  const cx = w / 2;
  const cy = h * 0.48;
  const dot = Math.max(1, w / 440);

  for (let c = 0; c < field.colors.length; c++) {
    ctx.fillStyle = field.colors[c];
    for (let i = c; i < count; i += field.colors.length) {
      const r1 = seeds[i * 3];
      const r2 = seeds[i * 3 + 1];
      const r3 = seeds[i * 3 + 2];
      to.at(i, count, r1, r2, r3, t);
      let x = px;
      let y = py;
      let z = pz;
      if (from) {
        from.at(i, count, r1, r2, r3, t);
        // Mid-morph the cloud loosens and twists before it settles again.
        const loose = 1 + burst * 0.45 * (r1 - 0.3);
        x = (px + (x - px) * ease) * loose;
        y = (py + (y - py) * ease) * loose;
        z = (pz + (z - pz) * ease) * loose;
        const twist = burst * 1.4 * r2;
        const tx = x * Math.cos(twist) - z * Math.sin(twist);
        z = x * Math.sin(twist) + z * Math.cos(twist);
        x = tx;
      }
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const ry = y * cosX - rz * sinX;
      const depth = 3.2 + y * sinX + rz * cosX;
      const scale = 3.2 / depth;
      const size = Math.max(1, Math.round(dot * (0.6 + (scale - 0.72) * 3)));
      ctx.globalAlpha = Math.min(1, Math.max(0.18, 0.3 + (scale - 0.8) * 1.7));
      ctx.fillRect(Math.round(cx + rx * scale * unit), Math.round(cy - ry * scale * unit), size, size);
    }
  }
  ctx.globalAlpha = 1;
}

function shown(field: Field) {
  return field.visible && field.card?.getAttribute("aria-hidden") !== "true";
}
function tick(now: number) {
  frame = 0;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;
  if (!still) {
    clock += dt * (1 + Math.min(energy, 2));
    energy *= Math.pow(0.04, dt);
    swirl += (Math.min(energy, 1.5) * 0.45 - swirl) * 0.08;
  }
  let moving = false;
  fields.forEach((field, canvas) => {
    if (!canvas.isConnected) {
      visibility.unobserve(canvas);
      sizes.unobserve(canvas);
      fields.delete(canvas);
      return;
    }
    if (!shown(field)) return;
    if (field.from) {
      field.morph = still ? 1 : field.morph + dt / MORPH_SECONDS;
      if (field.morph >= 1) field.from = null;
    }
    field.lookX += (field.aimX - field.lookX) * 0.06;
    field.lookY += (field.aimY - field.lookY) * 0.06;
    if (still && !field.dirty) return;
    draw(field, clock + 40);
    moving = true;
  });
  if (moving && !still) schedule();
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function mount(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const host = canvas.parentElement;
  const formation = FORMATIONS[canvas.dataset.flux ?? ""];
  if (!ctx || !host || !formation) return;
  observe();
  const count = innerWidth < 700 ? 1500 : 2800;
  const seeds = new Float32Array(count * 3);
  // A fixed sequence keeps every visit, and every still frame, identical.
  let seed = 0x2f6e2b1;
  for (let i = 0; i < seeds.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    seeds[i] = (seed >>> 8) / 0x1000000;
  }
  const accent = getComputedStyle(host).getPropertyValue("--flux-accent").trim() || "#a9b8ff";
  const field: Field = {
    canvas,
    ctx,
    host,
    card: host.closest<HTMLElement>(".project-card"),
    to: formation,
    from: null,
    morph: 1,
    colors: [accent, accent, "#fffaf0", accent, "#7cf0b8", "#5b72ff"],
    seeds,
    count,
    visible: false,
    dirty: true,
    lookX: 0,
    lookY: 0,
    aimX: 0,
    aimY: 0,
  };
  fields.set(canvas, field);
  host.classList.add("has-flux");
  host.addEventListener("pointermove", (event) => {
    const box = host.getBoundingClientRect();
    field.aimX = (event.clientX - box.left) / box.width - 0.5;
    field.aimY = (event.clientY - box.top) / box.height - 0.5;
  });
  host.addEventListener("pointerleave", () => {
    field.aimX = 0;
    field.aimY = 0;
  });
  fit(field);
  visibility.observe(canvas);
  sizes.observe(canvas);
}

/** Attach a field to every flux canvas that does not have one yet. */
export function mountFlux(root: ParentNode = document) {
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-flux]").forEach((canvas) => {
    if (!fields.has(canvas)) mount(canvas);
  });
  schedule();
}
/** The incoming card's field starts from the outgoing card's formation. */
export function morphFlux(outgoing: Element | undefined, incoming: Element | undefined) {
  const a = fields.get(outgoing?.querySelector<HTMLCanvasElement>("canvas[data-flux]") as HTMLCanvasElement);
  const b = fields.get(incoming?.querySelector<HTMLCanvasElement>("canvas[data-flux]") as HTMLCanvasElement);
  if (!a || !b || a === b) return;
  b.from = a.to;
  b.morph = 0;
  b.dirty = true;
  schedule();
}
export function setFluxStill(value: boolean) {
  still = value;
  fields.forEach((field) => (field.dirty = true));
  schedule();
}
