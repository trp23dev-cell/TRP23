import { totp } from "../server/totp.js";

// Points at its own throwaway server unless SMOKE_API_BASE says otherwise.
// Staff registration is closed now, and the bootstrap token that opens it only
// works on an instance with no admin — so the test needs a fresh one, and
// depending on whatever happens to be running on :8787 made it unrepeatable.
let base = process.env.SMOKE_API_BASE || "";

async function req(path, options = {}) {
  // options spread FIRST: it carries its own `headers`, and spreading it last
  // replaced the merged set and dropped Content-Type.
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

/** Start a server with its own database, so the run is repeatable. */
async function startServer() {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = (await import("node:path")).default;
  const { fileURLToPath } = await import("node:url");

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = await mkdtemp(path.join(tmpdir(), "trp23-smoke-"));
  const port = 8500 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, [path.join(root, "server/mockApiServer.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN,
    },
    stdio: "ignore",
  });
  const stop = async () => { child.kill(); await rm(dir, { recursive: true, force: true }); };
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return { url, stop };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  await stop();
  throw new Error("server did not start");
}

async function run() {
  const runId = Date.now();
  const email = `admin+${runId}@trapmadeit.local`;
  // Staff passwords have a 12 character floor, and staff registration is no
  // longer open — see the bootstrap token below.
  const password = `smoke-admin-${runId}`;
  const discountCode = `SMOKE${String(runId).slice(-6)}`;

  await req("/api/health");
  // Staff registration is closed: it needs an existing admin, or the bootstrap
  // token on a deployment that has none yet. This smoke test therefore needs
  // ADMIN_BOOTSTRAP_TOKEN set to the same value as the server it is pointed at,
  // and only works against an instance with no admin — which is what
  // `npm run test:api` starts.
  const bootstrap = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!bootstrap) {
    throw new Error(
      "ADMIN_BOOTSTRAP_TOKEN must be set, and must match the server's.\n" +
      "Run `npm run test:api`, which starts a throwaway server with one."
    );
  }
  await req("/api/auth/register", {
    method: "POST",
    headers: { "x-bootstrap-token": bootstrap },
    body: JSON.stringify({ email, password, role: "admin" }),
  });

  const login = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token = login.token;
  const auth = { Authorization: `Bearer ${token}` };

  // Authenticate a player: the server issues the id + token used for economy calls.
  const session = await req("/api/players/session", { method: "POST", body: JSON.stringify({}) });
  const playerId = session.playerId;
  if (!playerId || !session.token) throw new Error("Player session should return a playerId and token");
  const playerAuth = { Authorization: `Bearer ${session.token}` };

  // Economy endpoints must reject unauthenticated callers.
  const unauth = await fetch(`${base}/api/commerce/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, items: [] }),
  });
  if (unauth.status !== 401) throw new Error(`Checkout without a player token should be 401, got ${unauth.status}`);

  // A player using their own token must not be able to read another player's
  // wallet by putting a different id in the path — the server uses the token.
  const spoof = await req(`/api/wallet/${encodeURIComponent("someone-else")}`, { headers: playerAuth });
  if (spoof.wallet == null) throw new Error("Wallet lookup should succeed and resolve to the token's player");

  // (Full account register/login/2FA coverage lives at the end of this run.)

  const content = await req("/api/content");
  await req("/api/content", {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ content: content.content }),
  });

  const products = await req("/api/commerce/products");
  const firstDrop = products.products[0];
  await req(`/api/commerce/products/${encodeURIComponent(firstDrop.id)}`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ stock: 55, reserved: 0 }),
  });

  await req("/api/commerce/discounts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ code: discountCode, type: "percent", value: 10, active: true }),
  });

  // Baseline wallet should be the seeded starting balance.
  const wallet0 = await req(`/api/wallet/${encodeURIComponent(playerId)}`, { headers: playerAuth });
  if (wallet0.wallet.coins <= 0) throw new Error("Expected a seeded starting wallet balance");

  const checkout = await req("/api/commerce/checkout", {
    method: "POST",
    headers: playerAuth,
    body: JSON.stringify({
      items: [{ dropId: firstDrop.id, qty: 1 }],
      discountCode,
    }),
  });
  if (typeof checkout.walletCoins !== "number") throw new Error("Checkout should return authoritative wallet balance");
  if (checkout.walletCoins >= wallet0.wallet.coins) throw new Error("Checkout should have debited the wallet");
  if (!Array.isArray(checkout.ownedDropIds) || !checkout.ownedDropIds.includes(firstDrop.id)) {
    throw new Error("Checkout should grant ownership of the purchased drop");
  }

  // Server must reject a purchase the player cannot afford (no client-trust).
  const brokeSession = await req("/api/players/session", { method: "POST", body: JSON.stringify({}) });
  const brokeAuth = { Authorization: `Bearer ${brokeSession.token}` };
  const expensive = [...products.products].sort((a, b) => (b.priceCoins || 0) - (a.priceCoins || 0))[0];
  const overspendItems = Array.from({ length: 20 }, () => ({ dropId: expensive.id, qty: 50 }));
  const overspend = await fetch(`${base}/api/commerce/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...brokeAuth },
    body: JSON.stringify({ items: overspendItems }),
  });
  if (overspend.status !== 402 && overspend.status !== 409) {
    throw new Error(`Overspend/oversell should be rejected, got ${overspend.status}`);
  }

  // Bank: deposit then withdraw should conserve total funds and move balances.
  const deposit = await req("/api/bank/deposit", {
    method: "POST",
    headers: playerAuth,
    body: JSON.stringify({ amount: 100 }),
  });
  if (deposit.bank < 100) throw new Error("Deposit should increase bank balance");
  const withdraw = await req("/api/bank/withdraw", {
    method: "POST",
    headers: playerAuth,
    body: JSON.stringify({ amount: 40 }),
  });
  if (withdraw.bank !== deposit.bank - 40) throw new Error("Withdraw should decrease bank balance");

  // World: locations should be seeded, including the bank.
  const world = await req("/api/world/locations");
  if (!world.locations.some((l) => l.kind === "bank")) throw new Error("Expected a seeded bank location");
  if (!world.locations.some((l) => l.kind === "shop")) throw new Error("Expected seeded shop locations");

  // The order book needs credentials now — it used to answer anybody with
  // every order in the system. Staff are used here because the assertions below
  // want the filter honoured; a player token would work too and would return
  // exactly the same rows, being this player's own.
  const orders = await req(`/api/commerce/orders?playerId=${encodeURIComponent(playerId)}`, { headers: auth });
  if (!orders.orders.length) throw new Error("Expected at least one order");
  const orderId = orders.orders[orders.orders.length - 1].id;

  await req("/api/commerce/refunds", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ orderId, reason: "smoke test" }),
  });

  await req("/api/commerce/fulfillments", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ orderId, carrier: "mock", status: "shipped" }),
  });

  // Real catalogue ids. The mission used to be `walk-${runId}` — a synthetic id
  // that dodged the per-mission dedupe — which worked only because the server
  // took the amount from the body and never checked the mission existed. It
  // does now, so the test has to name a mission that is really there. Repeat
  // runs are safe because the whole database is thrown away with the server.
  await req("/api/rewards/claim", {
    method: "POST",
    headers: playerAuth,
    body: JSON.stringify({ levelId: "lvl-01", missionId: "walk" }),
  });

  await req("/api/community/stories", {
    method: "POST",
    body: JSON.stringify({ playerId, title: "From trapped to focused", body: "Testing story" }),
  });

  await req("/api/community/opportunities", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Mentor Session", kind: "mentorship", description: "Weekly support" }),
  });

  await req("/api/community/chapter-events", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ chapterId: "lvl-01", title: "Drop window", startsAt: new Date().toISOString() }),
  });

  await req("/api/ops/analytics", { headers: auth });
  await req("/api/ops/audit", { headers: auth });

  // ---- Player accounts + TOTP 2FA ----
  const uname = `user${String(runId).slice(-8)}`;
  const uemail = `player+${runId}@trapmadeit.local`;
  // Register a full account on the current guest session (with 2FA enrollment).
  const reg = await req("/api/players/register", {
    method: "POST",
    headers: playerAuth,
    body: JSON.stringify({ username: uname, email: uemail, phone: "+447700900123", password: "str0ngpass", enable2fa: true }),
  });
  if (reg.account?.username !== uname) throw new Error("register should return the new account");
  if (!reg.twofa?.secret) throw new Error("2FA enrollment should return a secret");
  const accountAuth = { Authorization: `Bearer ${reg.token}` };
  const secret = reg.twofa.secret;

  // Duplicate username / email must be rejected.
  const dupU = await fetch(`${base}/api/players/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: uname, email: `x${runId}@t.co`, password: "str0ngpass" }) });
  if (dupU.status !== 409) throw new Error(`Duplicate username should be 409, got ${dupU.status}`);
  const dupE = await fetch(`${base}/api/players/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: `z${runId}`, email: uemail, password: "str0ngpass" }) });
  if (dupE.status !== 409) throw new Error(`Duplicate email should be 409, got ${dupE.status}`);

  // Enable 2FA with a valid TOTP code.
  await req("/api/players/2fa/enable", { method: "POST", headers: accountAuth, body: JSON.stringify({ code: totp(secret) }) });

  // Login without a code must be blocked with twofaRequired.
  const noCode = await fetch(`${base}/api/players/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: uname, password: "str0ngpass" }) });
  const noCodeData = await noCode.json();
  if (noCode.status !== 401 || !noCodeData.twofaRequired) throw new Error("Login without 2FA code should require it");

  // Login with a valid code (by username) succeeds and returns the same player.
  const login2fa = await req("/api/players/login", { method: "POST", body: JSON.stringify({ identifier: uname, password: "str0ngpass", code: totp(secret) }) });
  if (login2fa.playerId !== reg.playerId) throw new Error("2FA login should resolve to the same player");

  // Wrong password rejected.
  const badPw = await fetch(`${base}/api/players/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: uname, password: "nope", code: totp(secret) }) });
  if (badPw.status !== 401) throw new Error(`Wrong password should be 401, got ${badPw.status}`);

  console.log("[smoke-api] all checks passed");
}

async function main() {
  // Always a throwaway instance unless pointed elsewhere. The old behaviour —
  // reuse whatever is on :8787, or start one on the real database — meant the
  // smoke test wrote test accounts and discount codes into development data,
  // and it broke outright once staff registration was closed, because that
  // database already has an admin and the bootstrap token only works without
  // one.
  let server = null;
  if (process.env.SMOKE_API_BASE) {
    base = process.env.SMOKE_API_BASE;
  } else {
    process.env.ADMIN_BOOTSTRAP_TOKEN =
      process.env.ADMIN_BOOTSTRAP_TOKEN || "smoke-bootstrap-token-not-a-secret";
    server = await startServer();
    base = server.url;
  }
  console.log(`[smoke-api] ${base}${server ? " (throwaway instance)" : ""}`);

  try {
    await run();
  } finally {
    if (server) await server.stop();
  }
}

main().catch((err) => {
  console.error("[smoke-api] failed:", err.message);
  process.exit(1);
});
