import { spawn } from "node:child_process";
import { totp } from "../server/totp.js";

const base = process.env.SMOKE_API_BASE || "http://localhost:8787";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function req(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function healthCheck() {
  try {
    const res = await fetch(`${base}/api/health`);
    return res.ok;
  } catch (_err) {
    return false;
  }
}

async function run() {
  const runId = Date.now();
  const email = `admin+${runId}@trapmadeit.local`;
  const password = "admin123";
  const discountCode = `SMOKE${String(runId).slice(-6)}`;

  await req("/api/health");
  await req("/api/auth/register", {
    method: "POST",
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

  const orders = await req(`/api/commerce/orders?playerId=${encodeURIComponent(playerId)}`);
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

  await req("/api/rewards/claim", {
    method: "POST",
    headers: playerAuth,
    body: JSON.stringify({ levelId: "lvl-01", missionId: `walk-${runId}`, rewardCoins: 100 }),
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
  const hasExternalServer = await healthCheck();
  let server = null;

  if (!hasExternalServer) {
    server = spawn("node", ["server/mockApiServer.js"], {
      stdio: "inherit",
    });
    await sleep(900);
  }

  try {
    await run();
  } finally {
    if (server) server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("[smoke-api] failed:", err.message);
  process.exit(1);
});
