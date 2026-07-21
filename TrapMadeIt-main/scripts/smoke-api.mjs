import { spawn } from "node:child_process";

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
  const playerId = `smoke-player-${runId}`;
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

  await req("/api/commerce/checkout", {
    method: "POST",
    body: JSON.stringify({
      playerId,
      items: [{ dropId: firstDrop.id, qty: 1 }],
      discountCode,
    }),
  });

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
    body: JSON.stringify({ playerId, levelId: "lvl-01", missionId: `walk-${runId}`, rewardCoins: 100 }),
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
