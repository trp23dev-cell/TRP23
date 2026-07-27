// ============================================================================
// THE BLOCK — the free-roam hub the chapters sit on.
//
// Ported from the standalone "FP FREE ROAM TEST PHASE 1" spike and wired into the
// real game. The player walks the block, finds a chapter building, and enters it;
// the chapter interiors are unchanged.
//
// The sky and the street light brighten as chapters are cleared. That is the moral
// arc carried by the art (Bible Vol 3): the block you are trying to get out of
// visibly becomes somewhere legitimate as you do the work.
// ============================================================================

export const PLAYER_RADIUS = 0.6;
export const WORLD_BOUND = 150;
export const ENTER_DISTANCE = 4.6;

// Hub-and-spoke layout: the bank sits behind you at spawn, the chapters fan out.
const PLACE_LAYOUT = [
  { key: "bank", kind: "bank", pos: [0, -26], size: [12, 8, 8], color: 0x2a2317 },
  { key: 0, kind: "chapter", pos: [-30, -6], size: [9, 7, 8], color: 0x241d14 },
  { key: 1, kind: "chapter", pos: [30, -6], size: [9, 7, 8], color: 0x20241f },
  { key: 2, kind: "chapter", pos: [-34, 22], size: [9, 8, 8], color: 0x1c1f26 },
  { key: 3, kind: "chapter", pos: [34, 22], size: [10, 7, 8], color: 0x23201a },
  { key: 4, kind: "chapter", pos: [-16, 46], size: [9, 9, 8], color: 0x262019 },
  { key: 5, kind: "chapter", pos: [18, 48], size: [14, 8, 10], color: 0x1e1a15 },
];

const LAMP_SPOTS = [[-14, 6], [14, 6], [-14, 30], [14, 30], [0, 18], [-26, -14], [26, -14]];

const SKYLINE = [
  [-58, -55, 16, 14, 18], [-38, -58, 14, 14, 22], [-8, -60, 16, 16, 16],
  [20, -58, 16, 14, 20], [52, -56, 18, 16, 24], [60, -30, 16, 18, 20],
  [62, 0, 16, 18, 26], [60, 30, 16, 18, 18], [58, 54, 18, 16, 22],
  [30, 62, 16, 14, 16], [2, 64, 18, 16, 24], [-28, 62, 16, 14, 20],
  [-56, 58, 18, 16, 18], [-62, 28, 16, 18, 22], [-64, 0, 16, 18, 26],
  [-60, -28, 16, 16, 18],
];

const GOLD = 0xc9a06a;

// How the block looks at each stage of the journey. Index = chapters cleared.
// It starts at a street-lit dusk and ends in daylight.
//
// Deliberately NOT starting at night: the chapter interiors carry the darkness
// (chapter one is the darkest room in the game), but the block is where the player
// navigates, so it has to stay readable at zero progress. The arc is a lift from
// dusk to day, not from black to day.
const MOODS = [
  { bg: 0x2a2f3d, fog: [0x2a2f3d, 0.012], hemi: 1.3,  sun: 1.2,  amb: 0.42, exposure: 1.25, lamp: 1.6 },
  { bg: 0x333949, fog: [0x333949, 0.011], hemi: 1.5,  sun: 1.5,  amb: 0.46, exposure: 1.30, lamp: 1.4 },
  { bg: 0x3d4455, fog: [0x3d4455, 0.010], hemi: 1.75, sun: 1.8,  amb: 0.50, exposure: 1.35, lamp: 1.15 },
  { bg: 0x474f62, fog: [0x474f62, 0.009], hemi: 2.0,  sun: 2.1,  amb: 0.54, exposure: 1.40, lamp: 0.9 },
  { bg: 0x525b70, fog: [0x525b70, 0.008], hemi: 2.2,  sun: 2.35, amb: 0.57, exposure: 1.45, lamp: 0.6 },
  { bg: 0x5d677e, fog: [0x5d677e, 0.007], hemi: 2.4,  sun: 2.55, amb: 0.60, exposure: 1.50, lamp: 0.35 },
  { bg: 0x6a758d, fog: [0x6a758d, 0.006], hemi: 2.6,  sun: 2.8,  amb: 0.62, exposure: 1.55, lamp: 0.2 },
];

export function worldMood(cleared) {
  return MOODS[Math.max(0, Math.min(MOODS.length - 1, cleared | 0))];
}

/**
 * Builds the block into `group`.
 *
 * @param {object} opts
 * @param {object} opts.THREE           three namespace (the game owns the import)
 * @param {object} opts.group           THREE.Group to add everything to
 * @param {Array}  opts.chapters        LEVELS array - supplies names, so renames flow through
 * @param {number} opts.cleared         chapters cleared; drives unlocks and the sky
 * @param {Function} opts.canvasTex     game's canvas-texture helper (w,h,draw)=>Texture
 * @param {Function} [opts.setTextureQuality]
 * @param {Function} [opts.shadows]
 * @returns {{spawn:number[],yaw:number,mood:object,colliders:Array,places:Array}}
 */
export function buildFreeRoamWorld({ THREE, group, chapters, cleared = 0, canvasTex, setTextureQuality, shadows }) {
  const tune = (t) => { if (setTextureQuality) setTextureQuality(t); return t; };
  const mood = worldMood(cleared);
  const colliders = [];
  const places = [];

  // ---- ground ----
  const roadTex = tune(canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#2a2723"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${50 + Math.random() * 30},${46 + Math.random() * 26},40,${Math.random() * .35})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = "rgba(201,160,106,.16)"; g.lineWidth = 4;
    for (let x = 64; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  }));
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(24, 24);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: .95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- lights ----
  group.add(new THREE.HemisphereLight(0xd6dbf0, 0x555044, mood.hemi));
  const sun = new THREE.DirectionalLight(0xffffff, mood.sun);
  sun.position.set(-40, 60, -20);
  group.add(sun);
  group.add(new THREE.AmbientLight(0xffffff, mood.amb));

  // ---- signage ----
  function signTex(name, locked) {
    return tune(canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = "#0a0908"; g.fillRect(0, 0, w, h);
      g.strokeStyle = locked ? "rgba(150,140,125,.35)" : "rgba(201,160,106,.5)";
      g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = locked ? "#6d675d" : "#c9a06a";
      const size = name.length > 15 ? 38 : name.length > 11 ? 46 : 52;
      g.font = `bold ${size}px Georgia, serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(name, w / 2, h / 2 + 4);
    }));
  }

  // ---- the places you can walk into ----
  for (const spec of PLACE_LAYOUT) {
    const isBank = spec.kind === "bank";
    const index = isBank ? -1 : spec.key;
    const chapter = isBank ? null : chapters[index];
    if (!isBank && !chapter) continue;

    const locked = !isBank && index > cleared;
    const name = isBank ? "TRAP CENTRAL BANK" : chapter.name;
    const [px, pz] = spec.pos;
    const [w, h, d] = spec.size;

    const b = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: spec.color, roughness: .9 })
    );
    body.position.y = h / 2;
    b.add(body);

    // Door faces the middle of the block, so you always approach it from the street.
    const faceZ = pz > 0 ? -1 : 1;
    const doorZ = (d / 2) * faceZ + 0.02 * faceZ;
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 3.4),
      new THREE.MeshStandardMaterial({
        color: 0x120f0b,
        emissive: locked ? 0x3a352c : GOLD,
        emissiveIntensity: locked ? .12 : .35,
        roughness: .6,
      })
    );
    door.position.set(0, 1.7, doorZ);
    door.rotation.y = faceZ < 0 ? Math.PI : 0;
    b.add(door);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w - 1, 7), 1.4),
      new THREE.MeshBasicMaterial({ map: signTex(name, locked), transparent: true })
    );
    sign.position.set(0, h - 1.1, doorZ + 0.03 * faceZ);
    sign.rotation.y = faceZ < 0 ? Math.PI : 0;
    b.add(sign);

    const dl = new THREE.PointLight(locked ? 0x6b6355 : GOLD, (isBank ? 2 : 1.2) * (locked ? .3 : 1), 12, 1.6);
    dl.position.set(0, 3, doorZ + faceZ * 1.5);
    b.add(dl);

    b.position.set(px, 0, pz);
    if (shadows) shadows(b);
    group.add(b);

    colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
    places.push({
      kind: spec.kind,
      index,
      name,
      locked,
      sub: isBank ? "Deposit, withdraw, top up." : chapter.sub,
      // stand just outside the door
      x: px,
      z: pz + faceZ * (d / 2 + 1.6),
    });
  }

  // ---- street lamps ----
  for (const [x, z] of LAMP_SPOTS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(.08, .1, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: .6, roughness: .5 })
    );
    pole.position.y = 2.5; g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    bulb.position.y = 5; g.add(bulb);
    const l = new THREE.PointLight(0xffcf99, mood.lamp, 16, 1.8);
    l.position.y = 5; g.add(l);
    g.position.set(x, 0, z);
    group.add(g);
  }

  // ---- skyline that encloses the block ----
  const windowTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#0b0a0c"; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 8; y += 22) for (let x = 10; x < w - 8; x += 20) {
      const lit = Math.random() < 0.32;
      g.fillStyle = lit ? `rgba(201,160,106,${0.25 + Math.random() * 0.4})` : "rgba(28,26,24,0.6)";
      g.fillRect(x, y, 10, 12);
    }
  });
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  for (const [x, z, w, d, h] of SKYLINE) {
    const t = windowTex.clone();
    t.repeat.set(Math.max(1, w / 6), Math.max(1, h / 6));
    t.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ map: t, color: 0x15141a, roughness: .9 })
    );
    m.position.set(x, h / 2, z);
    group.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  // yaw 0 looks down -z, which puts the bank and the first two chapters in view on
  // arrival rather than the empty end of the block.
  return { spawn: [0, 14], yaw: 0, mood, colliders, places };
}

/** Push the player out of any building they have walked into, shallowest axis first. */
export function resolveWorldCollisions(position, colliders) {
  const p = position;
  p.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.x));
  p.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.z));
  for (const c of colliders) {
    if (p.x > c.minX - PLAYER_RADIUS && p.x < c.maxX + PLAYER_RADIUS &&
        p.z > c.minZ - PLAYER_RADIUS && p.z < c.maxZ + PLAYER_RADIUS) {
      const dxL = Math.abs(p.x - (c.minX - PLAYER_RADIUS));
      const dxR = Math.abs((c.maxX + PLAYER_RADIUS) - p.x);
      const dzT = Math.abs(p.z - (c.minZ - PLAYER_RADIUS));
      const dzB = Math.abs((c.maxZ + PLAYER_RADIUS) - p.z);
      const m = Math.min(dxL, dxR, dzT, dzB);
      if (m === dxL) p.x = c.minX - PLAYER_RADIUS;
      else if (m === dxR) p.x = c.maxX + PLAYER_RADIUS;
      else if (m === dzT) p.z = c.minZ - PLAYER_RADIUS;
      else p.z = c.maxZ + PLAYER_RADIUS;
    }
  }
}

/** Nearest place to the player, for the compass and the [E] prompt. */
export function nearestPlace(position, places) {
  let best = null, bd = Infinity;
  for (const pl of places) {
    const dist = Math.hypot(position.x - pl.x, position.z - pl.z);
    if (dist < bd) { bd = dist; best = pl; }
  }
  return best ? { place: best, dist: bd } : null;
}

/** Player-centred, north-up radar. */
export function drawMinimap(ctx, canvas, camera, colliders, places, near, THREE, dirVec) {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, ppm = 1.15;
  const px = camera.position.x, pz = camera.position.z;
  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(201,160,106,.10)";
  for (const r of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, r * ppm, 0, Math.PI * 2); ctx.stroke(); }

  for (const c of colliders) {
    const bx = ((c.minX + c.maxX) / 2 - px) * ppm, bz = ((c.minZ + c.maxZ) / 2 - pz) * ppm;
    const w = (c.maxX - c.minX) * ppm, h = (c.maxZ - c.minZ) * ppm;
    ctx.fillStyle = "rgba(201,160,106,.16)";
    ctx.fillRect(cx + bx - w / 2, cy + bz - h / 2, w, h);
  }

  for (const pl of places) {
    const sx = cx + (pl.x - px) * ppm, sy = cy + (pl.z - pz) * ppm;
    const isNear = near && near.place === pl;
    ctx.fillStyle = pl.locked ? "#6d675d" : pl.kind === "bank" ? "#e8c98a" : "#c9a06a";
    ctx.beginPath(); ctx.arc(sx, sy, isNear ? 4 : 2.6, 0, Math.PI * 2); ctx.fill();
    if (isNear) {
      ctx.strokeStyle = "rgba(201,160,106,.7)";
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.stroke();
    }
  }

  camera.getWorldDirection(dirVec);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(dirVec.z, dirVec.x) + Math.PI / 2);
  ctx.fillStyle = "#f4ecdd";
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
