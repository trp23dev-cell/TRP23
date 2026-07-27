// ============================================================================
// THE BIG MAP — the whole block, laid out flat.
//
// The minimap is a 60m radar for not walking into things. This is the map you
// open when you do not know where you are going: the entire city centre, every
// street named on it, with the story doors marked and a waypoint you can drop
// anywhere.
//
// It draws from every tile the server has, not just the three-by-three block
// currently streamed in for rendering, so the far side of the city is on it
// before you have ever walked there.
//
// Data © OpenStreetMap contributors, ODbL.
// ============================================================================

import { MAP_ATTRIBUTION } from "./geo.js";

const GOLD = "#c9a06a";
const BONE = "#f4ecdd";

// Zoom is pixels-per-metre. The default frames a few streets either side.
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

export function createBigMap({ canvas, onWaypoint }) {
  const ctx = canvas.getContext("2d");
  let data = { buildings: [], roads: [] };
  let places = [];
  let player = { x: 0, z: 0, yaw: 0 };
  let waypoint = null;

  let zoom = 1.1;
  let centre = { x: 0, z: 0 };
  let followPlayer = true; // until the user pans away

  // --- coordinate transforms -------------------------------------------------
  const toScreen = (x, z) => ({
    x: canvas.width / 2 + (x - centre.x) * zoom,
    y: canvas.height / 2 + (z - centre.z) * zoom,
  });
  const toWorld = (sx, sy) => ({
    x: centre.x + (sx - canvas.width / 2) / zoom,
    z: centre.z + (sy - canvas.height / 2) / zoom,
  });

  // --- drawing ---------------------------------------------------------------
  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, W, H);

    // Only draw what is actually on screen. At full zoom-out this is the whole
    // city, and at street level it is a handful of buildings.
    const pad = 40 / zoom;
    const view = {
      minX: centre.x - W / 2 / zoom - pad,
      maxX: centre.x + W / 2 / zoom + pad,
      minZ: centre.z - H / 2 / zoom - pad,
      maxZ: centre.z + H / 2 / zoom + pad,
    };

    // Roads first: they are what you navigate by.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const r of data.roads) {
      const width = Math.max(1, r.w * zoom * 0.85);
      ctx.strokeStyle = r.k === "footway" || r.k === "path" || r.k === "steps"
        ? "rgba(201,160,106,.14)"
        : "rgba(201,160,106,.30)";
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < r.p.length; i += 2) {
        const s = toScreen(r.p[i], r.p[i + 1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }

    // Buildings.
    ctx.strokeStyle = "rgba(201,160,106,.28)";
    ctx.lineWidth = 1;
    const strokeThem = zoom > 0.7;
    for (const b of data.buildings) {
      if (b.maxX < view.minX || b.minX > view.maxX || b.maxZ < view.minZ || b.minZ > view.maxZ) continue;
      ctx.fillStyle = "rgba(201,160,106,.13)";
      ctx.beginPath();
      for (let i = 0; i < b.ring.length; i += 2) {
        const s = toScreen(b.ring[i], b.ring[i + 1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fill();
      if (strokeThem) ctx.stroke();
    }

    // Scale bar: a map without one is a picture.
    drawScaleBar(ctx, W, H, zoom);

    // Waypoint, under the place pins so a pin is never hidden by it.
    if (waypoint) {
      const s = toScreen(waypoint.x, waypoint.z);
      ctx.strokeStyle = BONE;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - 14, s.y); ctx.lineTo(s.x - 4, s.y);
      ctx.moveTo(s.x + 4, s.y); ctx.lineTo(s.x + 14, s.y);
      ctx.moveTo(s.x, s.y - 14); ctx.lineTo(s.x, s.y - 4);
      ctx.moveTo(s.x, s.y + 4); ctx.lineTo(s.x, s.y + 14);
      ctx.stroke();
    }

    // Story doors.
    for (const p of places) {
      const s = toScreen(p.x, p.z);
      const colour = p.locked ? "#6d675d" : p.kind === "bank" ? "#e8c98a" : GOLD;
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(10,9,8,.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (zoom > 0.45) {
        ctx.fillStyle = colour;
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(10,9,8,.95)";
        ctx.lineWidth = 3;
        ctx.strokeText(p.name, s.x + 10, s.y);
        ctx.fillText(p.name, s.x + 10, s.y);
      }
    }

    // The player, pointing where they are actually looking.
    const ps = toScreen(player.x, player.z);
    ctx.save();
    ctx.translate(ps.x, ps.y);
    ctx.rotate(player.yaw);
    ctx.fillStyle = BONE;
    ctx.strokeStyle = "rgba(10,9,8,.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(244,236,221,.32)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(MAP_ATTRIBUTION, W - 8, H - 8);
  }

  function drawScaleBar(ctx, W, H, zoom) {
    // Pick a round number of metres that lands near 120px.
    const targets = [10, 20, 50, 100, 200, 500, 1000];
    const metres = targets.find((m) => m * zoom > 90) || 1000;
    const px = metres * zoom;
    const x = 16;
    const y = H - 20;
    ctx.strokeStyle = "rgba(244,236,221,.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5);
    ctx.stroke();
    ctx.fillStyle = "rgba(244,236,221,.6)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${metres} m`, x + px / 2, y - 3);
  }

  // --- interaction -----------------------------------------------------------
  let dragging = false;
  let dragged = 0;
  let lastPointer = null;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragged = 0;
    lastPointer = { x: e.offsetX, y: e.offsetY };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.offsetX - lastPointer.x;
    const dy = e.offsetY - lastPointer.y;
    dragged += Math.abs(dx) + Math.abs(dy);
    centre.x -= dx / zoom;
    centre.z -= dy / zoom;
    followPlayer = false;
    lastPointer = { x: e.offsetX, y: e.offsetY };
    draw();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    // A drag pans; only a genuine tap drops a waypoint.
    if (dragged < 6) {
      const w = toWorld(e.offsetX, e.offsetY);
      setWaypoint({ x: w.x, z: w.z, name: "Marked spot" });
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    // Zoom about the cursor, so you can dive into the corner you are looking at.
    const before = toWorld(e.offsetX, e.offsetY);
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    const after = toWorld(e.offsetX, e.offsetY);
    centre.x += before.x - after.x;
    centre.z += before.z - after.z;
    followPlayer = false;
    draw();
  }, { passive: false });

  // --- pinch zoom, for the phone --------------------------------------------
  const touches = new Map();
  let pinchStart = null;
  canvas.addEventListener("pointerdown", (e) => touches.set(e.pointerId, e));
  canvas.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, e);
    if (touches.size !== 2) return;
    dragging = false; // a second finger cancels the pan-and-tap
    const [a, b] = [...touches.values()];
    const dist = Math.hypot(a.offsetX - b.offsetX, a.offsetY - b.offsetY);
    if (pinchStart == null) { pinchStart = { dist, zoom }; return; }
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStart.zoom * (dist / pinchStart.dist)));
    followPlayer = false;
    draw();
  });
  const endTouch = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchStart = null;
  };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);

  // --- api -------------------------------------------------------------------
  function setWaypoint(wp) {
    waypoint = wp;
    if (onWaypoint) onWaypoint(wp);
    draw();
  }

  function resize() {
    // Match the backing store to the CSS box so nothing is blurry on a phone.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    draw();
  }

  return {
    setData(d) { data = d; draw(); },
    setPlaces(p) { places = p; draw(); },
    setPlayer(p) {
      player = p;
      if (followPlayer) centre = { x: p.x, z: p.z };
      draw();
    },
    setWaypoint,
    getWaypoint: () => waypoint,
    recentre() { followPlayer = true; centre = { x: player.x, z: player.z }; draw(); },
    resize,
    draw,
  };
}
