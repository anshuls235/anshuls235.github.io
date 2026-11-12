// Skills drawn as a small neural network. The layout is plain HTML/CSS, so
// it reflows naturally; the canvas only reads node positions and draws the
// weights and the "forward pass" signals between them.
const TONES: Record<string, string> = {
  mint: "#ff6a3d",
  yellow: "#ff6a3d",
  coral: "#ff6a3d",
  sky: "#ff6a3d",
  lilac: "#ff6a3d",
  lime: "#ff6a3d",
};
interface Box {
  el: HTMLElement;
  cat: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Edge {
  a: Box;
  b: Box;
  cat: number;
  layer: number;
  p: number[]; // cubic bezier: x0 y0 x1 y1 x2 y2 x3 y3
}
interface Pulse {
  edge: Edge;
  t: number;
  speed: number;
}
export interface NetworkControls {
  setPaused(paused: boolean): void;
  destroy(): void;
}

export function initNetwork(
  root: HTMLElement,
  isStill: () => boolean,
): NetworkControls | null {
  const canvas = root.querySelector<HTMLCanvasElement>(".network-canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const section = root.closest("section");
  const readout = section?.querySelector<HTMLElement>("[data-readout]");
  const status = section?.querySelector<HTMLElement>("[data-network-status]");
  const epochEl = section?.querySelector<HTMLElement>("[data-epoch]");
  const lossEl = section?.querySelector<HTMLElement>("[data-loss]");
  const spark = section?.querySelector<SVGPathElement>("[data-loss-spark]");
  const inputEls = [...root.querySelectorAll<HTMLButtonElement>(".node-input")];
  const [h1Layer, h2Layer] = [...root.querySelectorAll<HTMLElement>(".layer-hidden")];
  const outputEls = [...root.querySelectorAll<HTMLElement>(".node-output")];
  const lightTones: Record<string, string> = {mint: "#e0400f", yellow: "#e0400f", coral: "#e0400f", sky: "#e0400f", lilac: "#e0400f", lime: "#e0400f"};
  let wire = "#8f95b8";
  const readTones = () => inputEls.map((b) => {
    const tone = [...b.classList].find((c) => c.startsWith("tone-"))?.slice(5) ?? "mint";
    const palette = document.documentElement.dataset.theme === "dark" ? TONES : lightTones;
    return palette[tone] ?? palette.mint;
  });
  let tones = readTones();
  const names = inputEls.map((b) => b.querySelector(".node-name")?.textContent ?? "");

  let inputs: Box[] = [];
  let h1: Box[] = [];
  let h2: Box[] = [];
  let outputs: Box[] = [];
  let edges: Edge[] = [];
  let pulses: Pulse[] = [];
  let active = -1;
  let selected = -1;
  let visited = new Set<HTMLElement>();
  let frame = 0;
  let visible = false;
  let paused = false;
  let cycleTimer: ReturnType<typeof setTimeout> | undefined;
  let autoIndex = 0;
  let epoch = 1;
  const losses: number[] = [];
  let dpr = 1;
  let vertical = false;
  let width = 0;
  let height = 0;

  const box = (el: HTMLElement, origin: DOMRect): Box => {
    const r = el.getBoundingClientRect();
    return {
      el,
      cat: Number(el.dataset.cat ?? -1),
      x: r.left - origin.left,
      y: r.top - origin.top,
      w: r.width,
      h: r.height,
    };
  };

  function curve(a: Box, b: Box): number[] {
    const horizontal = b.x > a.x + a.w - 2;
    if (horizontal) {
      const x0 = a.x + a.w;
      const y0 = a.y + a.h / 2;
      const x3 = b.x;
      const y3 = b.y + b.h / 2;
      const k = (x3 - x0) * 0.5;
      return [x0, y0, x0 + k, y0, x3 - k, y3, x3, y3];
    }
    const x0 = a.x + a.w / 2;
    const y0 = a.y + a.h;
    const x3 = b.x + b.w / 2;
    const y3 = b.y;
    const k = Math.max(20, (y3 - y0) * 0.5);
    return [x0, y0, x0, y0 + k, x3, y3 - k, x3, y3];
  }

  function layout() {
    const origin = root.getBoundingClientRect();
    width = origin.width;
    height = origin.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
    inputs = inputEls.map((el) => box(el, origin));
    h1 = [...h1Layer.querySelectorAll<HTMLElement>(".node-skill")].map((el) => box(el, origin));
    h2 = [...h2Layer.querySelectorAll<HTMLElement>(".node-skill")].map((el) => box(el, origin));
    outputs = outputEls.map((el) => box(el, origin));
    vertical = h1.length > 0 && inputs.length > 0 && h1[0].x < inputs[0].x + inputs[0].w;
    edges = [];
    const add = (a: Box, b: Box, cat: number, layer: number) =>
      edges.push({ a, b, cat, layer, p: curve(a, b) });
    inputs.forEach((input, i) => h1.filter((n) => n.cat === i).forEach((n) => add(input, n, i, 0)));
    h1.forEach((a, index) => {
      h2.filter((b) => b.cat === a.cat).forEach((b) => add(a, b, a.cat, 1));
      // A sparse, deterministic cross-connection between neighbouring skill groups.
      const others = h2.filter((b) => b.cat !== a.cat);
      if (others.length && index % 2 === 0) add(a, others[(index * 7) % others.length], -1, 1);
    });
    h2.forEach((a) => outputs.forEach((o) => add(a, o, a.cat, 2)));
    draw();
  }

  const point = (p: number[], t: number) => {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
  };

  function draw() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    ctx!.lineCap = "round";
    for (const edge of edges) {
      const lit = active >= 0 && edge.cat === active;
      // Stacked (mobile) layouts only draw the live path, so labels stay legible.
      if (vertical && !lit) continue;
      ctx!.beginPath();
      ctx!.moveTo(edge.p[0], edge.p[1]);
      ctx!.bezierCurveTo(edge.p[2], edge.p[3], edge.p[4], edge.p[5], edge.p[6], edge.p[7]);
      if (lit) {
        ctx!.strokeStyle = tones[active];
        ctx!.globalAlpha = edge.layer === 2 ? 0.32 : 0.55;
        ctx!.lineWidth = 1.6;
      } else {
        ctx!.strokeStyle = wire;
        ctx!.globalAlpha = active >= 0 ? 0.06 : 0.13;
        ctx!.lineWidth = 1;
      }
      ctx!.stroke();
    }
    for (const pulse of pulses) {
      const [x, y] = point(pulse.edge.p, Math.min(pulse.t, 1));
      const color = tones[pulse.edge.cat] ?? "#ffffff";
      ctx!.globalAlpha = 0.25;
      ctx!.fillStyle = color;
      ctx!.beginPath();
      ctx!.arc(x, y, 7, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;
      ctx!.beginPath();
      ctx!.arc(x, y, 3, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  function light(el: HTMLElement) {
    el.classList.add("is-lit");
  }
  function clearLights() {
    root.querySelectorAll(".is-lit").forEach((el) => el.classList.remove("is-lit"));
  }
  function spawnFrom(node: Box | HTMLElement, layer: number) {
    const el = node instanceof HTMLElement ? node : node.el;
    if (visited.has(el)) return;
    visited.add(el);
    edges
      .filter((e) => e.layer === layer && e.a.el === el && e.cat === active)
      .forEach((edge) => pulses.push({ edge, t: 0, speed: 0.022 + Math.random() * 0.014 }));
  }

  function updateHud() {
    epoch += 1;
    const loss = 0.018 + 0.675 * Math.exp(-epoch / 7) + Math.random() * 0.012;
    losses.push(loss);
    if (losses.length > 32) losses.shift();
    if (epochEl) epochEl.textContent = String(epoch).padStart(3, "0");
    if (lossEl) lossEl.textContent = loss.toFixed(3);
    if (spark && losses.length > 1) {
      const max = Math.max(...losses);
      const min = Math.min(...losses);
      const d = losses
        .map((v, i) => `${i ? "L" : "M"}${((i / (losses.length - 1)) * 120).toFixed(1)} ${(4 + ((max - v) / Math.max(max - min, 1e-6)) * 28).toFixed(1)}`)
        .join("");
      spark.setAttribute("d", d);
    }
  }

  function pass(cat: number, announce = false) {
    active = cat;
    visited = new Set();
    pulses = [];
    clearLights();
    root.classList.toggle("has-focus", cat >= 0);
    inputEls.forEach((b, i) => b.setAttribute("aria-pressed", String(i === selected)));
    if (cat < 0) {
      if (readout) readout.textContent = `${h1.length + h2.length} skills · ${inputs.length} input layers · ready for a forward pass`;
      draw();
      return;
    }
    const count = h1.filter((n) => n.cat === cat).length + h2.filter((n) => n.cat === cat).length;
    if (readout)
      readout.innerHTML = `Forward pass · <strong></strong> → ${count} skills activated → shipped products, better decisions, measured impact`;
    readout?.querySelector("strong")?.append(names[cat]);
    if (announce && status) status.textContent = `${names[cat]}: ${count} skills highlighted.`;
    updateHud();
    if (isStill() || paused) {
      // Without motion, show the finished pass in a single frame.
      [...h1, ...h2].filter((n) => n.cat === cat).forEach((n) => light(n.el));
      outputs.forEach((o) => light(o.el));
      draw();
      return;
    }
    spawnFrom(inputEls[cat], 0);
    start();
  }

  function tick() {
    frame = 0;
    const done: Pulse[] = [];
    for (const pulse of pulses) {
      pulse.t += pulse.speed;
      if (pulse.t >= 1) done.push(pulse);
    }
    if (done.length) {
      pulses = pulses.filter((p) => p.t < 1);
      for (const pulse of done) {
        light(pulse.edge.b.el);
        if (pulse.edge.layer < 2) spawnFrom(pulse.edge.b, pulse.edge.layer + 1);
      }
    }
    draw();
    if (pulses.length && visible) frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!frame && visible) frame = requestAnimationFrame(tick);
  }

  function scheduleCycle() {
    clearTimeout(cycleTimer);
    if (selected >= 0 || paused || isStill() || !visible) return;
    cycleTimer = setTimeout(() => {
      if (selected >= 0 || paused || isStill() || !visible) return;
      pass(autoIndex % inputs.length);
      autoIndex += 1;
      scheduleCycle();
    }, active < 0 ? 600 : 4200);
  }

  const onClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(".node-input");
    if (!button) return;
    const cat = Number(button.dataset.cat);
    selected = selected === cat ? -1 : cat;
    if (selected < 0) {
      if (status) status.textContent = "Showing the whole network.";
      pass(-1);
      scheduleCycle();
    } else {
      clearTimeout(cycleTimer);
      pass(selected, true);
    }
  };
  const onEnter = (event: Event) => {
    if (selected >= 0 || !matchMedia("(hover: hover)").matches) return;
    const button = (event.target as Element).closest<HTMLButtonElement>(".node-input");
    if (!button) return;
    clearTimeout(cycleTimer);
    const cat = Number(button.dataset.cat);
    if (cat !== active) pass(cat);
  };
  const onLeave = () => {
    if (selected < 0) scheduleCycle();
  };
  root.addEventListener("click", onClick);
  inputEls.forEach((b) => {
    b.addEventListener("pointerenter", onEnter);
    b.addEventListener("pointerleave", onLeave);
  });

  const refreshTheme = () => {
    tones = readTones();
    wire = getComputedStyle(root).getPropertyValue('--model-wire').trim() || '#8f95b8';
    draw();
  };
  window.addEventListener('portfolio-theme-change', refreshTheme);
  refreshTheme();
  const resize = new ResizeObserver(() => layout());
  resize.observe(root);
  const seen = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) {
        start();
        scheduleCycle();
      } else {
        clearTimeout(cycleTimer);
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    // Tall mobile networks may only occupy a small visible fraction.
    { threshold: 0 },
  );
  seen.observe(root);
  document.fonts?.ready.then(() => layout());
  layout();

  return {
    setPaused(value: boolean) {
      paused = value;
      if (paused) {
        clearTimeout(cycleTimer);
        if (active >= 0) {
          pulses = [];
          [...h1, ...h2].filter((n) => n.cat === active).forEach((n) => light(n.el));
          outputs.forEach((o) => light(o.el));
          draw();
        }
      } else scheduleCycle();
    },
    destroy() {
      clearTimeout(cycleTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('portfolio-theme-change', refreshTheme);
      resize.disconnect();
      seen.disconnect();
      root.removeEventListener("click", onClick);
    },
  };
}
