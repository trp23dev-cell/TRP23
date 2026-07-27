import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

/* ============================================================================
   TRAP — FREE ROAM (Test Phase 1)
   A self-contained first-person sandbox. Walk the block, visit the bank, find
   the mission spots. Completely separate from the main game/site/backend.
   ========================================================================== */

const GOLD = 0xc9a06a;
const $ = (s) => document.querySelector(s);

// ---- World layout: physical places you walk to ----
const LOCATIONS = [
  { id: "bank",  name: "TRAP CENTRAL BANK", type: "bank",    pos: [0, -26],  size: [12, 8, 8], color: 0x2a2317, sign: GOLD },
  { id: "lvl1",  name: "THE COME UP",       type: "mission", pos: [-30, -6], size: [9, 7, 8],  color: 0x241d14, desc: "Every empire starts at the bottom." },
  { id: "lvl2",  name: "THE COOK UP",       type: "mission", pos: [30, -6],  size: [9, 7, 8],  color: 0x20241f, desc: "The kitchen is where plans get made." },
  { id: "lvl3",  name: "GRAVEYARD SHIFT",   type: "mission", pos: [-34, 22], size: [9, 8, 8],  color: 0x1c1f26, desc: "Money never sleeps. Neither do you." },
  { id: "lvl4",  name: "THE FRONT",         type: "mission", pos: [34, 22],  size: [10, 7, 8], color: 0x23201a, desc: "Look legit. Move different." },
  { id: "lvl5",  name: "TOP FLOOR",         type: "mission", pos: [-16, 46], size: [9, 9, 8],  color: 0x262019, desc: "New heights. Same hunger." },
  { id: "lvl6",  name: "THE WAREHOUSE",     type: "mission", pos: [18, 48],  size: [14, 8, 10],color: 0x1e1a15, desc: "Your name on the label now." },
];

// ---- Renderer / scene / camera ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3d4250);   // light neutral sky, no fog
// (no scene.fog — full visibility)

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 1.7, 12);

// ---- Lights (bright, simple) ----
scene.add(new THREE.HemisphereLight(0xd6dbf0, 0x555044, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-40, 60, -20);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// ---- Ground + roads ----
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
const roadTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#2a2723"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${50 + Math.random() * 30},${46 + Math.random() * 26},40,${Math.random() * .35})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = "rgba(201,160,106,.16)"; g.lineWidth = 4;
  for (let x = 64; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(24, 24);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ map: roadTex, roughness: .95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ---- Buildings (each a place you can enter) ----
const colliders = []; // {minX,maxX,minZ,maxZ}
const interactables = []; // {loc, x, z}

function signTex(name) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#0a0908"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(201,160,106,.5)"; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = "#c9a06a"; g.font = "bold 52px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(name, w / 2, h / 2 + 4);
  });
}

for (const loc of LOCATIONS) {
  const [px, pz] = loc.pos; const [w, h, d] = loc.size;
  const b = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: loc.color, roughness: .9 }));
  body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; b.add(body);

  // Door faces world centre (toward the streets / player).
  const faceZ = pz > 0 ? -1 : 1;          // door on the side toward origin
  const doorZ = (d / 2) * faceZ + 0.02 * faceZ;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), new THREE.MeshStandardMaterial({ color: 0x120f0b, emissive: loc.sign || 0x6b5a42, emissiveIntensity: .35, roughness: .6 }));
  door.position.set(0, 1.7, doorZ); door.rotation.y = faceZ < 0 ? Math.PI : 0; b.add(door);

  // Sign above the door.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 7), 1.4), new THREE.MeshBasicMaterial({ map: signTex(loc.name), transparent: true }));
  sign.position.set(0, h - 1.1, doorZ + 0.03 * faceZ); sign.rotation.y = faceZ < 0 ? Math.PI : 0; b.add(sign);

  // A warm doorway light.
  const dl = new THREE.PointLight(loc.sign || 0xffcaa0, loc.type === "bank" ? 2 : 1.2, 12, 1.6);
  dl.position.set(0, 3, doorZ + faceZ * 1.5); b.add(dl);

  b.position.set(px, 0, pz); scene.add(b);

  colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
  interactables.push({ loc, x: px, z: pz + faceZ * (d / 2 + 1.6) }); // interaction point just outside the door
}

// ---- Street lamps for atmosphere ----
function lamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: .6, roughness: .5 }));
  pole.position.y = 2.5; g.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  bulb.position.y = 5; g.add(bulb);
  const l = new THREE.PointLight(0xffcf99, 1.1, 16, 1.8); l.position.y = 5; g.add(l);
  g.position.set(x, 0, z); scene.add(g);
}
[[-14, 6], [14, 6], [-14, 30], [14, 30], [0, 18], [-26, -14], [26, -14]].forEach(([x, z]) => lamp(x, z));

// ---- Skyline: non-enterable perimeter buildings that enclose the block ----
const windowTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = "#0b0a0c"; g.fillRect(0, 0, w, h);
  for (let y = 12; y < h - 8; y += 22) for (let x = 10; x < w - 8; x += 20) {
    const lit = Math.random() < 0.32;
    g.fillStyle = lit ? `rgba(201,160,106,${0.25 + Math.random() * 0.4})` : "rgba(28,26,24,0.6)";
    g.fillRect(x, y, 10, 12);
  }
});
windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
function fillerBuilding(x, z, w, d, h) {
  const t = windowTex.clone(); t.repeat.set(Math.max(1, w / 6), Math.max(1, h / 6)); t.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: t, color: 0x15141a, roughness: .9 }));
  m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}
[
  [-58, -55, 16, 14, 18], [-38, -58, 14, 14, 22], [-8, -60, 16, 16, 16], [20, -58, 16, 14, 20], [52, -56, 18, 16, 24],
  [60, -30, 16, 18, 20], [62, 0, 16, 18, 26], [60, 30, 16, 18, 18], [58, 54, 18, 16, 22],
  [30, 62, 16, 14, 16], [2, 64, 18, 16, 24], [-28, 62, 16, 14, 20], [-56, 58, 18, 16, 18],
  [-62, 28, 16, 18, 22], [-64, 0, 16, 18, 26], [-60, -28, 16, 16, 18],
].forEach(([x, z, w, d, h]) => fillerBuilding(x, z, w, d, h));

// ---- Player controls ----
const controls = new PointerLockControls(camera, renderer.domElement);
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyE") tryInteract(); });
addEventListener("keyup", (e) => { keys[e.code] = false; });

$("#startBtn").addEventListener("click", () => controls.lock());
controls.addEventListener("lock", () => { $("#start").classList.add("off"); $("#hud").classList.remove("off"); });
controls.addEventListener("unlock", () => { if (!anyPanelOpen()) $("#start").classList.remove("off"); });

const PLAYER_R = 0.6, BOUND = 150;
function moveAndCollide(dt) {
  if (!controls.isLocked) return;
  const speed = (keys.ShiftLeft || keys.ShiftRight ? 12 : 6) * dt;
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1;
  if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (f) controls.moveForward(f * speed);
  if (s) controls.moveRight(s * speed);

  const p = camera.position; p.y = 1.7;
  p.x = Math.max(-BOUND, Math.min(BOUND, p.x));
  p.z = Math.max(-BOUND, Math.min(BOUND, p.z));
  // Resolve building collisions (push out along the shallowest axis).
  for (const c of colliders) {
    if (p.x > c.minX - PLAYER_R && p.x < c.maxX + PLAYER_R && p.z > c.minZ - PLAYER_R && p.z < c.maxZ + PLAYER_R) {
      const dxL = Math.abs(p.x - (c.minX - PLAYER_R)), dxR = Math.abs((c.maxX + PLAYER_R) - p.x);
      const dzT = Math.abs(p.z - (c.minZ - PLAYER_R)), dzB = Math.abs((c.maxZ + PLAYER_R) - p.z);
      const m = Math.min(dxL, dxR, dzT, dzB);
      if (m === dxL) p.x = c.minX - PLAYER_R; else if (m === dxR) p.x = c.maxX + PLAYER_R;
      else if (m === dzT) p.z = c.minZ - PLAYER_R; else p.z = c.maxZ + PLAYER_R;
    }
  }
}

// ---- Interaction ----
let nearest = null;
function updateNearest() {
  const p = camera.position; let best = null, bd = Infinity;
  for (const it of interactables) {
    const dx = p.x - it.x, dz = p.z - it.z; const dist = Math.hypot(dx, dz);
    if (dist < bd) { bd = dist; best = { it, dist }; }
  }
  nearest = best;
  // Compass (always shows nearest)
  $("#nearName").textContent = best ? best.it.loc.name : "—";
  $("#nearDist").textContent = best ? `· ${Math.round(best.dist)}m` : "";
  // Prompt (only when close enough to enter)
  const canEnter = best && best.dist < 4.2 && controls.isLocked;
  const prompt = $("#prompt");
  $("#crosshair").classList.toggle("hot", !!canEnter);
  if (canEnter) { prompt.classList.remove("off"); prompt.innerHTML = `<b>[E]</b> Enter ${best.it.loc.name}`; }
  else prompt.classList.add("off");
}
function tryInteract() {
  if (!nearest || nearest.dist >= 4.2 || !controls.isLocked) return;
  const loc = nearest.it.loc;
  if (loc.type === "bank") openBank();
  else openSpot(loc);
}

// ---- Economy (mock, local only) ----
let cash = 2000, bank = 0;
const fmt = (n) => n.toLocaleString("en-GB");
function refreshCoins() { $("#coinAmt").textContent = fmt(cash); $("#bkCash").textContent = fmt(cash); $("#bkSaved").textContent = fmt(bank); }

// ---- Panels ----
function anyPanelOpen() { return document.querySelector(".panel-wrap.open"); }
function openPanel(id) { $("#" + id).classList.add("open"); controls.unlock(); }
function closePanel(id) { $("#" + id).classList.remove("open"); if (!anyPanelOpen()) controls.lock(); }
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closePanel(b.dataset.close)));

function openBank() { refreshCoins(); bkMsg(""); openPanel("bankPanel"); }
function openSpot(loc) { $("#spotName").textContent = loc.name; $("#spotDesc").textContent = loc.desc || ""; openPanel("spotPanel"); }

function bkMsg(t, k) { const e = $("#bkMsg"); e.textContent = t || ""; e.className = "p-msg" + (k ? " " + k : ""); }
document.querySelectorAll(".buy").forEach((b) => b.addEventListener("click", () => {
  const c = +b.dataset.coins; cash += c; refreshCoins(); bkMsg(`Bought ${fmt(c)} Trap Coins. (mock — real payments later)`, "ok");
}));
$("#bkDeposit").addEventListener("click", () => {
  const a = Math.floor(+$("#bkAmount").value); if (!(a > 0)) return bkMsg("Enter a valid amount.", "err");
  if (a > cash) return bkMsg("Not enough cash.", "err");
  cash -= a; bank += a; refreshCoins(); bkMsg(`Deposited ${fmt(a)}.`, "ok");
});
$("#bkWithdraw").addEventListener("click", () => {
  const a = Math.floor(+$("#bkAmount").value); if (!(a > 0)) return bkMsg("Enter a valid amount.", "err");
  if (a > bank) return bkMsg("Not enough in the bank.", "err");
  bank -= a; cash += a; refreshCoins(); bkMsg(`Withdrew ${fmt(a)}.`, "ok");
});
addEventListener("keydown", (e) => { if (e.code === "Escape" && anyPanelOpen()) closePanel(anyPanelOpen().id); });

// ---- Minimap / radar (player-centred, north-up) ----
const _dir = new THREE.Vector3();
const miniCtx = $("#minimap").getContext("2d");
function drawMinimap() {
  const cv = $("#minimap"), g = miniCtx, W = cv.width, H = cv.height;
  const cx = W / 2, cy = H / 2, ppm = 1.15, px = camera.position.x, pz = camera.position.z;
  g.clearRect(0, 0, W, H);
  // range rings
  g.strokeStyle = "rgba(201,160,106,.10)";
  for (const r of [30, 60]) { g.beginPath(); g.arc(cx, cy, r * ppm, 0, Math.PI * 2); g.stroke(); }
  // buildings
  for (const c of colliders) {
    const bx = ((c.minX + c.maxX) / 2 - px) * ppm, bz = ((c.minZ + c.maxZ) / 2 - pz) * ppm;
    const w = (c.maxX - c.minX) * ppm, h = (c.maxZ - c.minZ) * ppm;
    g.fillStyle = "rgba(201,160,106,.16)";
    g.fillRect(cx + bx - w / 2, cy + bz - h / 2, w, h);
  }
  // destinations
  for (const it of interactables) {
    const sx = cx + (it.x - px) * ppm, sy = cy + (it.z - pz) * ppm;
    const near = nearest && nearest.it === it;
    g.fillStyle = it.loc.type === "bank" ? "#e8c98a" : "#c9a06a";
    g.beginPath(); g.arc(sx, sy, near ? 4 : 2.6, 0, Math.PI * 2); g.fill();
    if (near) { g.strokeStyle = "rgba(201,160,106,.7)"; g.beginPath(); g.arc(sx, sy, 7, 0, Math.PI * 2); g.stroke(); }
  }
  // player
  camera.getWorldDirection(_dir);
  g.save(); g.translate(cx, cy); g.rotate(Math.atan2(_dir.z, _dir.x) + Math.PI / 2);
  g.fillStyle = "#f4ecdd"; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
  g.restore();
}

// ---- Loop ----
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let last = performance.now();
refreshCoins();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  moveAndCollide(dt);
  updateNearest();
  drawMinimap();
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
