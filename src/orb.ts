// Chapter 02: the knowledge orb. Topics sit on a globe as hubs, their skills
// cluster around them, and skills that shipped together in the same project
// are joined by great-circle arcs. Drag to turn it; the paper plane flies
// through the middle. Drawn on a 2D canvas with a hand-rolled projection, so
// the chapter costs no 3D library.

export interface OrbNode {
  id: number;
  label: string;
  topic: number;
  hub: boolean;
  projects: string[];
}
export interface OrbData {
  topics: string[];
  nodes: OrbNode[];
  links: [number, number][];
}
export interface OrbControls {
  sync(): void;
  /** Light up a node (or nothing) from outside, as if it were clicked. */
  focus(id: number | null): void;
  destroy(): void;
}

type V3 = [number, number, number];
const normalize = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const slerp = (a: V3, b: V3, t: number): V3 => {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-4) return a;
  const s = Math.sin(omega);
  const k1 = Math.sin((1 - t) * omega) / s;
  const k2 = Math.sin(t * omega) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
};

/** Hubs on a tetrahedron; each skill on a small cap around its hub (golden-angle spiral). */
function layout(data: OrbData) {
  const hubs: V3[] = [normalize([1, 1, 1]), normalize([-1, -1, 1]), normalize([-1, 1, -1]), normalize([1, -1, -1])];
  const pos: V3[] = [];
  const counts = data.topics.map(() => 0);
  const totals = data.topics.map((_, t) => data.nodes.filter((n) => n.topic === t && !n.hub).length);
  for (const n of data.nodes) {
    const hub = hubs[n.topic % hubs.length];
    if (n.hub) {
      pos[n.id] = hub;
      continue;
    }
    const k = counts[n.topic]++;
    const total = totals[n.topic];
    // A tangent frame at the hub
    const ref: V3 = Math.abs(hub[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalize([hub[1] * ref[2] - hub[2] * ref[1], hub[2] * ref[0] - hub[0] * ref[2], hub[0] * ref[1] - hub[1] * ref[0]]);
    const w: V3 = [hub[1] * u[2] - hub[2] * u[1], hub[2] * u[0] - hub[0] * u[2], hub[0] * u[1] - hub[1] * u[0]];
    const angle = k * 2.39996;
    const radius = 0.32 + 0.5 * Math.sqrt((k + 0.5) / total);
    const off: V3 = [u[0] * Math.cos(angle) + w[0] * Math.sin(angle), u[1] * Math.cos(angle) + w[1] * Math.sin(angle), u[2] * Math.cos(angle) + w[2] * Math.sin(angle)];
    pos[n.id] = normalize([hub[0] + off[0] * radius, hub[1] + off[1] * radius, hub[2] + off[2] * radius]);
  }
  return pos;
}

export function initOrb(root: HTMLElement, data: OrbData, isStill: () => boolean, onPick: (node: OrbNode | null) => void): OrbControls | null {
  const canvas = root.querySelector<HTMLCanvasElement>("canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const pos = layout(data);
  const arcs = data.links.map(([a, b]) => ({ a, b, pts: Array.from({ length: 17 }, (_, i) => slerp(pos[a], pos[b], i / 16)) }));
  const spokes = data.nodes.filter((n) => !n.hub).map((n) => {
    const hub = data.nodes.find((h) => h.hub && h.topic === n.topic)!;
    return { a: hub.id, b: n.id, pts: Array.from({ length: 9 }, (_, i) => slerp(pos[hub.id], pos[n.id], i / 8)) };
  });
  const neighbours = new Map<number, Set<number>>();
  for (const { a, b } of [...arcs, ...spokes]) {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a)!.add(b);
    neighbours.get(b)!.add(a);
  }

  let yaw = 0.6;
  let pitch = -0.25;
  // When something is picked, the globe turns to face it.
  let aim: { yaw: number; pitch: number } | null = null;
  const face = (id: number) => {
    const p = pos[id];
    const y = Math.atan2(-p[0], p[2]);
    const z1 = -p[0] * Math.sin(y) + p[2] * Math.cos(y);
    // Keep the turn short: pick the equivalent yaw closest to where we are.
    const target = y + Math.round((yaw - y) / (Math.PI * 2)) * Math.PI * 2;
    aim = { yaw: target, pitch: Math.max(-1.1, Math.min(1.1, Math.atan2(p[1], z1))) };
  };
  let spin = 0.0025;
  let frame = 0;
  let visible = false;
  let hover = -1;
  let picked = -1;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let width = 0;
  let height = 0;
  let radius = 100;
  let t = 0;
  let colours = { fg: "#0d0f1a", muted: "#5b5d6b", accent: "#ff4d1c", bg: "#f4f1e8", panel: "#fffaf0" };
  const screen: { x: number; y: number; z: number; r: number }[] = [];

  function readColours() {
    day = document.documentElement.dataset.theme !== "dark";
    const css = getComputedStyle(root);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    colours = { fg: v("--fg", colours.fg), muted: v("--muted", colours.muted), accent: v("--hot", colours.accent), bg: v("--bg", colours.bg), panel: v("--panel", colours.panel) };
  }

  function project(p: V3) {
    // Turn the globe: yaw about Y, then pitch about X.
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = p[0] * cy + p[2] * sy;
    const z1 = -p[0] * sy + p[2] * cy;
    const y2 = p[1] * cp - z1 * sp;
    const z2 = p[1] * sp + z1 * cp;
    const persp = 3.2 / (3.2 - z2);
    return { x: width / 2 + x1 * radius * persp, y: height / 2 - y2 * radius * persp, z: z2, s: persp };
  }

  function resize() {
    const box = root.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = Math.min(width, height) * 0.36;
    draw();
  }

  // Each topic has its own colour; everything else is light on a night sky.
  const NIGHT_HUES = ["#ff5a2b", "#ffb02e", "#7cf0b8", "#8fb4ff"];
  const DAY_HUES = ["#e0461a", "#c27400", "#11916a", "#2f5fd0"];
  let day = document.documentElement.dataset.theme !== "dark";
  const hue = (topic: number) => (day ? DAY_HUES : NIGHT_HUES)[topic % 4];
  // Ink, halos and light for each time of day.
  const look = () =>
    day
      ? { ink: "#12141f", label: "rgba(18,20,31,0.82)", halo: "rgba(255,255,255,0.92)", grid: "#2a3f8a", trail: "rgba(18,20,31,", blend: "source-over" as GlobalCompositeOperation }
      : { ink: "#fff4dc", label: "rgba(233,238,255,0.85)", halo: "rgba(7,11,34,0.85)", grid: "#9fb0ff", trail: "rgba(255,244,220,", blend: "lighter" as GlobalCompositeOperation };
  const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  // A fixed starfield behind the globe.
  const stars = Array.from({ length: 140 }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    const q = Math.sin(i * 78.233) * 12345.6789;
    return { x: r - Math.floor(r), y: q - Math.floor(q), s: 0.4 + ((i * 7) % 10) / 10, tw: i * 0.37 };
  });
  // Light travels along the links between skills that shipped together.
  const pulses = arcs.map((_, i) => ({ arc: i, at: (i * 0.137) % 1, speed: 0.0035 + ((i * 31) % 10) * 0.0004 }));

  function path(pts: V3[]) {
    const out = pts.map(project);
    return out;
  }
  function stroke(pts: { x: number; y: number; z: number }[], colour: string, alpha: number, widthPx: number) {
    for (let i = 1; i < pts.length; i++) {
      const depth = (pts[i - 1].z + pts[i].z) / 2;
      ctx!.globalAlpha = alpha * (0.12 + 0.88 * ((depth + 1) / 2) ** 1.5);
      ctx!.strokeStyle = colour;
      ctx!.lineWidth = widthPx;
      ctx!.beginPath();
      ctx!.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx!.lineTo(pts[i].x, pts[i].y);
      ctx!.stroke();
    }
    ctx!.globalAlpha = 1;
  }

  /** The paper plane's path weaves in and out through the core. */
  function planeAt(time: number): V3 {
    return [1.55 * Math.cos(time), 0.35 * Math.sin(2 * time), 0.95 * Math.sin(time)];
  }

  function drawPlane(behind: boolean) {
    const p = planeAt(t);
    const a = project(p);
    if (behind !== a.z < 0) return;
    const ahead = project(planeAt(t + 0.02));
    const angle = Math.atan2(ahead.y - a.y, ahead.x - a.x);
    // A glowing contrail that fades behind the plane
    ctx!.lineCap = "round";
    for (let i = 0; i < 30; i++) {
      const q0 = project(planeAt(t - i * 0.022));
      const q1 = project(planeAt(t - (i + 1) * 0.022));
      ctx!.globalAlpha = (1 - i / 30) * 0.7;
      ctx!.strokeStyle = `${look().trail}1)`;
      ctx!.lineWidth = 2.6 * (1 - i / 30) * q0.s;
      ctx!.beginPath();
      ctx!.moveTo(q0.x, q0.y);
      ctx!.lineTo(q1.x, q1.y);
      ctx!.stroke();
    }
    ctx!.globalAlpha = 1;
    const s = 12 * a.s;
    ctx!.save();
    ctx!.translate(a.x, a.y);
    ctx!.rotate(angle);
    ctx!.shadowColor = day ? "rgba(18,20,31,0.35)" : "rgba(255,244,220,0.9)";
    ctx!.shadowBlur = day ? 6 : 14;
    ctx!.beginPath();
    ctx!.moveTo(1.6 * s, 0);
    ctx!.lineTo(-1.3 * s, -1 * s);
    ctx!.lineTo(-0.7 * s, 0);
    ctx!.lineTo(-1.3 * s, 1 * s);
    ctx!.closePath();
    ctx!.fillStyle = "#fffaf0";
    ctx!.fill();
    ctx!.shadowBlur = 0;
    if (day) {
      ctx!.strokeStyle = "#12141f";
      ctx!.lineWidth = 1.4;
      ctx!.stroke();
    }
    ctx!.beginPath();
    ctx!.moveTo(-0.7 * s, 0);
    ctx!.lineTo(1.6 * s, 0);
    ctx!.strokeStyle = "#ff5a2b";
    ctx!.lineWidth = 1.6;
    ctx!.stroke();
    ctx!.restore();
  }

  function pill(text: string, x: number, y: number, fill: string, ink: string, size: number) {
    ctx!.font = `800 ${size}px "Big Shoulders", Impact, sans-serif`;
    const w = ctx!.measureText(text).width + size * 0.9;
    const h = size * 1.45;
    const r = h / 2;
    ctx!.beginPath();
    ctx!.moveTo(x + r, y - h / 2);
    ctx!.arcTo(x + w, y - h / 2, x + w, y + h / 2, r);
    ctx!.arcTo(x + w, y + h / 2, x, y + h / 2, r);
    ctx!.arcTo(x, y + h / 2, x, y - h / 2, r);
    ctx!.arcTo(x, y - h / 2, x + w, y - h / 2, r);
    ctx!.closePath();
    ctx!.fillStyle = fill;
    ctx!.fill();
    ctx!.fillStyle = ink;
    ctx!.fillText(text, x + size * 0.45, y + size * 0.36);
  }

  function draw() {
    if (!width) return;
    const cx = width / 2;
    const cy = height / 2;
    ctx!.clearRect(0, 0, width, height);
    const L = look();
    // Stars by night; by day the sky is clear.
    if (!day) for (const st of stars) {
      ctx!.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 + st.tw));
      ctx!.fillStyle = "#e9eeff";
      ctx!.fillRect(st.x * width, st.y * height, st.s * 1.6, st.s * 1.6);
    }
    ctx!.globalAlpha = 1;
    // Atmosphere: a soft halo beyond the rim
    const halo = ctx!.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.32);
    halo.addColorStop(0, day ? "rgba(255,255,255,0.85)" : "rgba(120,140,255,0.28)");
    halo.addColorStop(0.45, day ? "rgba(255,200,150,0.25)" : "rgba(255,90,43,0.10)");
    halo.addColorStop(1, day ? "rgba(255,255,255,0)" : "rgba(120,140,255,0)");
    ctx!.fillStyle = halo;
    ctx!.beginPath();
    ctx!.arc(cx, cy, radius * 1.32, 0, Math.PI * 2);
    ctx!.fill();
    // The globe: deep blue glass, lit from the upper left
    const body = ctx!.createRadialGradient(cx - radius * 0.38, cy - radius * 0.42, radius * 0.05, cx, cy, radius * 1.02);
    body.addColorStop(0, day ? "#ffffff" : "#2a3a8a");
    body.addColorStop(0.45, day ? "#e6eefc" : "#141d4f");
    body.addColorStop(1, day ? "#b3c6ee" : "#070b22");
    ctx!.fillStyle = body;
    ctx!.beginPath();
    ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.strokeStyle = day ? "rgba(42,63,138,0.35)" : "rgba(170,185,255,0.55)";
    ctx!.lineWidth = 1.5;
    ctx!.stroke();
    // Graticule, lit on the near side
    for (let m = 0; m < 8; m++) {
      const lon = (m / 8) * Math.PI;
      const pts: V3[] = Array.from({ length: 41 }, (_, i) => {
        const lat = -Math.PI / 2 + (i / 40) * Math.PI;
        return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      });
      stroke(path(pts), L.grid, day ? 0.12 : 0.16, 1);
    }
    for (const lat of [-1.05, -0.55, 0, 0.55, 1.05]) {
      const pts: V3[] = Array.from({ length: 61 }, (_, i) => {
        const lon = (i / 60) * Math.PI * 2;
        return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      });
      stroke(path(pts), L.grid, day ? 0.12 : 0.16, 1);
    }
    drawPlane(true);
    const focus = picked >= 0 ? picked : hover;
    const lit = focus >= 0 ? neighbours.get(focus) ?? new Set<number>() : null;
    ctx!.globalCompositeOperation = L.blend;
    for (const sp of spokes) {
      const on = lit && (sp.a === focus || sp.b === focus);
      const colour = hue(data.nodes[sp.b].topic);
      stroke(path(sp.pts), colour, on ? 0.95 : lit ? 0.08 : 0.38, on ? 2.2 : 1.1);
    }
    arcs.forEach((arc) => {
      const on = lit && (arc.a === focus || arc.b === focus);
      const pts = path(arc.pts);
      const colour = hue(data.nodes[arc.a].topic);
      stroke(pts, colour, on ? 0.9 : lit ? 0.05 : 0.22, on ? 2.6 : 1.2);
    });
    // Pulses
    for (const pulse of pulses) {
      const arc = arcs[pulse.arc];
      const dim = lit && !(arc.a === focus || arc.b === focus);
      if (dim) continue;
      const k = pulse.at * (arc.pts.length - 1);
      const i = Math.floor(k);
      const f = k - i;
      const a = arc.pts[i];
      const b = arc.pts[Math.min(i + 1, arc.pts.length - 1)];
      const p = project([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      const front = (p.z + 1) / 2;
      const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7 * p.s);
      g.addColorStop(0, day ? rgba(hue(data.nodes[arc.a].topic), 0.95 * front) : rgba("#fff4dc", 0.9 * front));
      g.addColorStop(1, rgba(hue(data.nodes[arc.a].topic), 0));
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 7 * p.s, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalCompositeOperation = "source-over";
    // Nodes, back to front
    const order = data.nodes.map((n) => ({ n, p: project(pos[n.id]) })).sort((a, b) => a.p.z - b.p.z);
    for (const { n, p } of order) {
      const front = (p.z + 1) / 2;
      const colour = hue(n.topic);
      const shipped = n.projects.length > 0;
      const r = (n.hub ? 12 : shipped ? 4.5 + Math.min(4, n.projects.length * 0.8) : 3.2) * p.s;
      screen[n.id] = { x: p.x, y: p.y, z: p.z, r: Math.max(r + 4, 11) };
      const dim = lit && n.id !== focus && !lit.has(n.id);
      const alpha = (dim ? 0.2 : 1) * (0.28 + 0.72 * front ** 1.2);
      ctx!.globalAlpha = alpha;
      // Glow
      const glow = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * (n.hub ? 3.4 : 3));
      glow.addColorStop(0, rgba(colour, n.hub ? 0.55 : shipped ? 0.45 : 0.18));
      glow.addColorStop(1, rgba(colour, 0));
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, r * (n.hub ? 3.4 : 3), 0, Math.PI * 2);
      ctx!.fill();
      // Core
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (n.hub) {
        const core = ctx!.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
        core.addColorStop(0, day ? "#ffffff" : "#fff4dc");
        core.addColorStop(0.35, colour);
        core.addColorStop(1, rgba(colour, 0.85));
        ctx!.fillStyle = core;
        ctx!.fill();
      } else if (shipped) {
        ctx!.fillStyle = colour;
        ctx!.fill();
      } else {
        ctx!.lineWidth = 1.4;
        ctx!.strokeStyle = colour;
        ctx!.stroke();
      }
      if (n.id === focus) {
        ctx!.lineWidth = 2;
        ctx!.strokeStyle = L.ink;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r + 5 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
        ctx!.stroke();
      }
      // Labels: hubs as pills; skills on the near side, or anything in focus.
      const roomy = width > 560;
      if (n.hub && p.z > -0.55) pill(n.label.toUpperCase(), p.x + r + 6, p.y, colour, day ? "#ffffff" : "#0b0d1a", Math.round((roomy ? 15 : 12) * p.s));
      else if (!n.hub && (n.id === focus || lit?.has(n.id) || (roomy ? p.z > 0.2 && shipped : p.z > 0.45 && shipped))) {
        ctx!.font = `600 ${Math.round((roomy ? 11.5 : 10) * p.s)}px "JetBrains Mono", monospace`;
        ctx!.lineWidth = 3;
        ctx!.strokeStyle = L.halo;
        ctx!.strokeText(n.label, p.x + r + 5, p.y + 4);
        ctx!.fillStyle = n.id === focus || lit?.has(n.id) ? L.ink : L.label;
        ctx!.fillText(n.label, p.x + r + 5, p.y + 4);
      }
      ctx!.globalAlpha = 1;
    }
    drawPlane(false);
  }

  function tick() {
    frame = 0;
    if (!visible || isStill()) return;
    if (!dragging) {
      if (aim && picked >= 0) {
        yaw += (aim.yaw - yaw) * 0.08;
        pitch += (aim.pitch - pitch) * 0.08;
      } else {
        yaw += spin;
        spin += (0.0025 - spin) * 0.02; // inertia settles back to a slow turn
      }
    }
    t += 0.008;
    for (const pulse of pulses) pulse.at = (pulse.at + pulse.speed) % 1;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!frame && visible && !isStill()) frame = requestAnimationFrame(tick);
  }

  function nodeAt(x: number, y: number) {
    let best = -1;
    let bestZ = -Infinity;
    screen.forEach((s, id) => {
      if (s && Math.hypot(s.x - x, s.y - y) <= s.r && s.z > bestZ) [best, bestZ] = [id, s.z];
    });
    return best;
  }
  const local = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top] as const;
  };
  let moved = 0;
  const down = (e: PointerEvent) => {
    dragging = true;
    aim = null;
    moved = 0;
    [lastX, lastY] = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      yaw += dx * 0.006;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.006));
      spin = dx * 0.006;
      [lastX, lastY] = [e.clientX, e.clientY];
      if (isStill()) draw();
      return;
    }
    const [x, y] = local(e);
    const next = nodeAt(x, y);
    if (next !== hover) {
      hover = next;
      canvas.style.cursor = next >= 0 ? "pointer" : "grab";
      if (isStill() || !frame) draw();
    }
  };
  const up = (e: PointerEvent) => {
    dragging = false;
    if (moved < 6) {
      const [x, y] = local(e);
      const hit = nodeAt(x, y);
      picked = hit === picked ? -1 : hit;
      if (picked >= 0) face(picked);
      else aim = null;
      onPick(picked >= 0 ? data.nodes[picked] : null);
      draw();
    }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointerleave", () => {
    hover = -1;
    if (!frame) draw();
  });
  const sizes = new ResizeObserver(resize);
  sizes.observe(root);
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start();
  });
  seen.observe(root);
  const theme = () => {
    readColours();
    draw();
  };
  window.addEventListener("portfolio-theme-change", theme);
  readColours();
  resize();

  return {
    sync() {
      if (isStill()) {
        cancelAnimationFrame(frame);
        frame = 0;
        draw();
      } else start();
    },
    focus(id) {
      picked = id ?? -1;
      if (picked >= 0) face(picked);
      else aim = null;
      onPick(picked >= 0 ? data.nodes[picked] : null);
      draw();
    },
    destroy() {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      seen.disconnect();
      window.removeEventListener("portfolio-theme-change", theme);
    },
  };
}
