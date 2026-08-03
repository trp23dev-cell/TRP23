#!/usr/bin/env node
// ============================================================================
// API SECURITY CHECK — the things that must never be true of a public deploy.
//
// /api/auth/register creates STAFF accounts and was, until it was found,
// completely unauthenticated: anyone could POST role:"admin" and take the CMS,
// the content and every player record. It shipped that way and nothing noticed.
// So it is a test now.
//
// The suite starts its OWN server on a spare port with a throwaway database.
// Run against a shared instance it defeats itself — the rate limiter it is
// checking counts the checks, so a second run inside the hour reports 429 where
// it expects 403 and the whole thing goes red for no reason. A test that cannot
// be run twice is not a test.
//
//   npm run check:api
//   API=https://your-app.up.railway.app npm run check:api   (against a deploy)
// ============================================================================

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOTSTRAP = "test-bootstrap-token-not-a-real-secret";

let failures = 0;
function check(name, ok, detail = "") {
  process.stdout.write(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? ` — ${detail}` : ""}\n`);
  if (!ok) failures += 1;
}

/**
 * Start a server with its own database, so the run is repeatable.
 *
 * Takes an existing data directory when given one, which is how the restart
 * check below brings the service back up on the same database — the whole
 * question being whether anything survived.
 */
async function startServer(existingDir = null) {
  const dir = existingDir || await mkdtemp(path.join(tmpdir(), "trp23-sec-"));
  const port = 8900 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, [path.join(ROOT, "server/mockApiServer.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ADMIN_BOOTSTRAP_TOKEN: BOOTSTRAP },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  // Killing the process and deleting the database are separate acts: a restart
  // needs the first without the second.
  const kill = async () => {
    child.kill();
    await new Promise((r) => setTimeout(r, 250));
  };
  const stop = async () => {
    await kill();
    await rm(dir, { recursive: true, force: true });
  };

  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return { base, stop, kill, dir };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  await stop();
  throw new Error("server did not start");
}

const main = async () => {
  const external = process.env.API;
  const server = external
    ? { base: external.replace(/\/$/, ""), stop: async () => {} }
    : await startServer();
  const API = server.base;
  let restarted = null;
  process.stdout.write(`checking ${API}${external ? "" : "  (throwaway instance)"}\n\n`);

  const post = async (p, body, headers = {}) => {
    const res = await fetch(`${API}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  };

  try {
    const stamp = Date.now();

    process.stdout.write("staff registration:\n");
    const anon = await post("/api/auth/register", {
      email: `sec-${stamp}@example.invalid`, password: "correcthorsebattery", role: "admin",
    });
    check("anonymous staff registration is refused", anon.status === 403,
      `HTTP ${anon.status} ${anon.json?.error || ""}`);

    const guessed = await post("/api/auth/register",
      { email: `sec2-${stamp}@example.invalid`, password: "correcthorsebattery", role: "admin" },
      { "x-bootstrap-token": "not-the-token" });
    check("a guessed bootstrap token is refused", guessed.status === 403, `HTTP ${guessed.status}`);

    const viewer = await post("/api/auth/register", {
      email: `sec3-${stamp}@example.invalid`, password: "correcthorsebattery", role: "viewer",
    });
    check("staff registration is closed for every role", viewer.status === 403, `HTTP ${viewer.status}`);

    // Only meaningful against a throwaway instance: a real deploy already has
    // an admin, and creating another is exactly what must not be possible.
    if (!external) {
      const short = await post("/api/auth/register",
        { email: `weak-${stamp}@example.invalid`, password: "short", role: "admin" },
        { "x-bootstrap-token": BOOTSTRAP });
      check("weak staff passwords are refused", short.status === 400, `HTTP ${short.status}`);

      const first = await post("/api/auth/register",
        { email: `boss-${stamp}@example.invalid`, password: "correcthorsebattery", role: "admin" },
        { "x-bootstrap-token": BOOTSTRAP });
      check("the real bootstrap token creates the FIRST admin", first.status === 201,
        `HTTP ${first.status} ${first.json?.error || ""}`);

      const second = await post("/api/auth/register",
        { email: `boss2-${stamp}@example.invalid`, password: "correcthorsebattery", role: "admin" },
        { "x-bootstrap-token": BOOTSTRAP });
      check("and stops working once an admin exists", second.status === 403, `HTTP ${second.status}`);
    }

    process.stdout.write("\nplayers:\n");
    const player = await post("/api/players/register", {
      username: `sec${stamp}`.slice(0, 18),
      email: `p-${stamp}@example.invalid`,
      password: "averylongpassword",
    });
    check("players can still register", player.json?.ok === true,
      `HTTP ${player.status} ${player.json?.error || ""}`);

    const other = await fetch(`${API}/api/player/somebody-elses-id`);
    check("player data needs authentication", other.status === 401 || other.status === 403,
      `HTTP ${other.status}`);

    process.stdout.write("\ncross-origin policy:\n");
    const evil = await fetch(`${API}/api/health`, { headers: { Origin: "https://evil.example.com" } });
    check("an unknown origin gets no CORS header",
      !evil.headers.get("access-control-allow-origin"),
      evil.headers.get("access-control-allow-origin") || "(none)");

    // The packaged mobile build runs on capacitor://localhost, not on the
    // site's domain. Break this and the app dies while the website is fine,
    // which is a miserable thing to debug.
    const cap = await fetch(`${API}/api/health`, { headers: { Origin: "capacitor://localhost" } });
    check("the mobile build's origin is allowed",
      cap.headers.get("access-control-allow-origin") === "capacitor://localhost",
      cap.headers.get("access-control-allow-origin") || "(none)");

    check("responses vary on Origin so caches do not cross the wires",
      (cap.headers.get("vary") || "").toLowerCase().includes("origin"),
      cap.headers.get("vary") || "(none)");

    process.stdout.write("\nrate limiting:\n");
    const victim = `victim-${stamp}@example.invalid`;
    await post("/api/players/register", {
      username: `vic${stamp}`.slice(0, 18), email: victim, password: "thecorrectpassword",
    });

    let locked = null;
    for (let i = 0; i < 16; i += 1) {
      const r = await post("/api/players/login", { identifier: victim, password: `wrong-${i}` });
      if (r.status === 429) { locked = i + 1; break; }
    }
    check("guessing one account's password locks it", locked !== null,
      locked ? `locked after ${locked} attempts` : "16 wrong passwords accepted without a lock");

    if (locked) {
      const correct = await post("/api/players/login", { identifier: victim, password: "thecorrectpassword" });
      check("the lockout is not bypassed by the correct password", correct.status === 429,
        `HTTP ${correct.status}`);
      check("a locked response says when to retry", Number(correct.json?.retryAfter) > 0,
        `retryAfter ${correct.json?.retryAfter}s`);
    }

    let regBlocked = null;
    for (let i = 0; i < 40; i += 1) {
      const r = await post("/api/players/register", {
        username: `fl${stamp}${i}`.slice(0, 18),
        email: `flood-${stamp}-${i}@example.invalid`,
        password: "averylongpassword",
      });
      if (r.status === 429) { regBlocked = i + 1; break; }
    }
    check("registration floods are throttled", regBlocked !== null,
      regBlocked ? `blocked after ${regBlocked}` : "40 accounts created without a limit");

    // Loose enough for shared connections: mobile carriers put thousands of
    // subscribers behind one address, and cutting them off after a handful of
    // signups looks like the game is broken rather than throttled.
    check("but not so tight it blocks a shared connection",
      regBlocked === null || regBlocked > 10,
      regBlocked ? `${regBlocked} allowed before throttling` : "no limit");

    // ------------------------------------------------------------------
    // ECONOMY INTEGRITY
    //
    // This section did not exist, and its absence is the whole story: every
    // check above passed, on every run, while /api/rewards/claim paid out
    // whatever number the caller put in the request body. Auth was tested.
    // CORS was tested. Rate limiting was tested. The money was not.
    //
    // The rule these enforce is one sentence: the client may say WHAT it did,
    // never what it is worth.
    // ------------------------------------------------------------------
    process.stdout.write("\neconomy integrity:\n");

    const econ = await post("/api/players/session", {});
    const econAuth = { Authorization: `Bearer ${econ.json.token}` };
    const econId = econ.json.playerId;

    const walletOf = async () => {
      const r = await fetch(`${API}/api/wallet/${econId}`, { headers: econAuth });
      return (await r.json())?.wallet?.coins ?? null;
    };

    const before = await walletOf();

    // lvl-01/walk is worth 150 in the shipped catalogue.
    const greedy = await post("/api/rewards/claim",
      { levelId: "lvl-01", missionId: "walk", rewardCoins: 999_999_999 }, econAuth);
    check("a reward pays the catalogue amount, not the amount asked for",
      greedy.json?.rewardCoins === 150,
      `claimed 999,999,999 and was granted ${greedy.json?.rewardCoins}`);

    const after = await walletOf();
    check("and the wallet moves by exactly that much",
      after - before === 150, `balance went ${before} -> ${after}`);

    check("the same mission cannot be claimed twice",
      (await post("/api/rewards/claim", { levelId: "lvl-01", missionId: "walk" }, econAuth)).status === 409,
      "second claim");

    check("a mission that does not exist is refused",
      (await post("/api/rewards/claim",
        { levelId: "lvl-01", missionId: "not-a-real-mission" }, econAuth)).status === 404,
      "invented missionId");

    // Claiming a non-stash mission must not hand out a chapter deal code.
    const codeGrab = await post("/api/rewards/claim",
      { levelId: "lvl-01", missionId: "board", discountCode: "TRAP-FREE-EVERYTHING" }, econAuth);
    check("a discount code cannot be granted by asking for one",
      !codeGrab.json?.discountCode,
      `granted ${codeGrab.json?.discountCode || "(none)"}`);

    // That last claim legitimately paid `board`'s catalogue value, so the
    // baseline for everything below is taken here rather than reused.
    const settled = await walletOf();

    // The faucet. Off unless ALLOW_DEV_TOPUP=1, which the suite does not set.
    const faucet = await post("/api/wallet/topup", { amount: 1_000_000 }, econAuth);
    check("coins cannot be conjured from nothing", faucet.status === 404,
      `HTTP ${faucet.status}`);

    check("the wallet is untouched by the attempt", (await walletOf()) === settled,
      `balance ${settled} -> ${await walletOf()}`);

    // A customer list, unauthenticated, with player ids attached.
    const orders = await fetch(`${API}/api/commerce/orders`);
    check("the order book is not readable by anonymous callers",
      orders.status === 401 || orders.status === 403, `HTTP ${orders.status}`);

    // ...and a signed-in player sees only their own, whatever they ask for.
    const peek = await fetch(`${API}/api/commerce/orders?playerId=somebody-else`, { headers: econAuth });
    const peeked = await peek.json();
    check("a player cannot read another player's orders",
      peek.status === 200 && (peeked.orders || []).every((o) => o.playerId === econId),
      `${(peeked.orders || []).length} orders returned`);

    // A balance must never be driveable below zero, whatever route is used.
    const overdraw = await post("/api/bank/deposit", { amount: 999_999_999 }, econAuth);
    check("a player cannot bank more than they hold", overdraw.status === 402,
      `HTTP ${overdraw.status}`);

    const overdrawn = await post("/api/bank/transfer",
      { toPlayerId: "some-other-player", amount: 999_999_999 }, econAuth);
    check("a player cannot send coins they do not have", overdrawn.status === 402,
      `HTTP ${overdrawn.status}`);

    check("the balance survived both attempts intact", (await walletOf()) === settled,
      `balance ${settled} -> ${await walletOf()}`);

    // ------------------------------------------------------------------
    // THE CASE FILE
    //
    // The statement a player writes about themselves. Private, and written
    // through a narrow route because the general profile route replaces
    // `progress` wholesale — a partial write there would destroy the save.
    // ------------------------------------------------------------------
    process.stdout.write("\nthe case file:\n");

    const cf = await post("/api/players/session", {});
    const cfAuth = { Authorization: `Bearer ${cf.json.token}` };
    const cfId = cf.json.playerId;

    const putCf = (body, headers) => fetch(`${API}/api/player/${cfId}/case-file`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

    await fetch(`${API}/api/player/${cfId}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...cfAuth },
      body: JSON.stringify({ profile: { progress: { currentLevel: 3, levelsCleared: 2, walked: 42 } } }),
    });

    await putCf({ trapStatement: "  the quick money  " }, cfAuth);
    const cfProfile = await fetch(`${API}/api/player/${cfId}`, { headers: cfAuth }).then((r) => r.json());
    const prog = cfProfile?.profile?.progress || {};

    check("writing the card does not wipe the rest of the save",
      prog.currentLevel === 3 && prog.levelsCleared === 2 && prog.walked === 42,
      `currentLevel ${prog.currentLevel}, levelsCleared ${prog.levelsCleared}, walked ${prog.walked}`);
    check("the statement is trimmed", prog.trapStatement === "the quick money",
      JSON.stringify(prog.trapStatement));

    const capped = await putCf({ trapStatement: "x".repeat(500) }, cfAuth);
    check("the statement is capped server-side, not just by maxlength",
      capped.json?.trapStatement?.length === 180, `stored ${capped.json?.trapStatement?.length}`);

    const junk = await putCf({ trapAnswer: "cleared" }, cfAuth);
    check("an invented answer is refused", junk.json?.trapAnswer === null,
      JSON.stringify(junk.json?.trapAnswer));
    const real = await putCf({ trapAnswer: "freed" }, cfAuth);
    check("a real answer is kept", real.json?.trapAnswer === "freed",
      JSON.stringify(real.json?.trapAnswer));

    check("the card needs authentication", (await putCf({ trapStatement: "x" }, {})).status === 401,
      "anonymous write");

    // Someone else's id in the URL must never reach their card. The route takes
    // the acting player from the token, so this writes to the CALLER's card.
    const intruder = await post("/api/players/session", {});
    await putCf({ trapStatement: "hacked" }, { Authorization: `Bearer ${intruder.json.token}` });
    const mine = await fetch(`${API}/api/player/${cfId}`, { headers: cfAuth }).then((r) => r.json());
    check("another player cannot write to your case file",
      mine?.profile?.progress?.trapStatement !== "hacked",
      JSON.stringify(mine?.profile?.progress?.trapStatement)?.slice(0, 40));

    // Only meaningful when there is a built front end to fall back TO. Asserted
    // rather than skipped silently, because "passes because it did not run" is
    // how the reward hole survived.
    const { existsSync } = await import("node:fs");
    if (existsSync(path.join(ROOT, "dist", "index.html"))) {
      process.stdout.write("\nserving:\n");
      const deep = await fetch(`${API}/chapter/01`);
      check("a deep link falls back to the game shell", deep.status === 200,
        `HTTP ${deep.status}`);
    }

    // The one that matters most, and the one that used to fail silently.
    //
    // The account lock lived in memory, so a redeploy forgot every failed
    // attempt and handed the attacker a fresh ten. Railway redeploys on push.
    // Nothing in the suite noticed, because nothing restarted the server.
    if (locked && !external && server.kill) {
      await server.kill();
      const again = await startServer(server.dir);
      restarted = again;

      const res = await fetch(`${again.base}/api/players/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: victim, password: "thecorrectpassword" }),
      });
      check("the account lock survives a restart", res.status === 429,
        `HTTP ${res.status} after restarting on the same database`);
    }
  } finally {
    // Whichever process is holding the database now.
    await (restarted ? restarted.stop() : server.stop());
    if (restarted) await server.stop();
  }

  process.stdout.write(`\n${failures ? `${failures} FAILED` : "all security checks passed"}\n`);
  process.exit(failures ? 1 : 0);
};

main().catch((err) => {
  process.stderr.write(`security check could not run: ${err.message}\n`);
  process.exit(1);
});
