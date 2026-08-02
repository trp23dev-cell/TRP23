#!/usr/bin/env node
// ============================================================================
// CHECK DEPLOY — is the live deployment actually configured correctly?
//
// Every failure this catches is SILENT. A misconfigured deploy answers 200,
// serves the game, and looks fine — right up until a redeploy wipes every
// account, or a handful of logins locks out the world. None of it shows up
// until it has already cost something.
//
//   npm run check:deploy -- --url https://your-app.up.railway.app
// ============================================================================

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = (arg("url") || process.env.DEPLOY_URL || "").replace(/\/$/, "");
if (!url) {
  process.stderr.write("usage: npm run check:deploy -- --url https://your-app.up.railway.app\n");
  process.exit(1);
}

let failures = 0;
let warnings = 0;
function check(name, ok, detail = "", fatal = true) {
  const tag = ok ? "  ok  " : fatal ? "FAIL  " : "warn  ";
  process.stdout.write(`${tag}${name}${detail ? ` — ${detail}` : ""}\n`);
  if (!ok) {
    if (fatal) failures += 1;
    else warnings += 1;
  }
}

const main = async () => {
  process.stdout.write(`checking ${url}\n\n`);

  const res = await fetch(`${url}/api/health`);
  if (!res.ok) {
    process.stderr.write(`the service is not answering: HTTP ${res.status}\n`);
    process.exit(1);
  }
  const health = await res.json();
  const d = health.deploy || {};

  process.stdout.write("configuration:\n");
  check("the database is on a persistent volume", d.persistentStorage === true,
    d.persistentStorage ? "DATA_DIR is set" : "DATA_DIR is NOT set — every redeploy wipes all accounts");

  check("the proxy is trusted", d.trustProxy === true,
    d.trustProxy ? "TRUST_PROXY=1" : "TRUST_PROXY is NOT set — every player shares one rate-limit bucket");

  check("running in production mode", d.production === true,
    d.production ? "NODE_ENV=production" : "NODE_ENV is not production", false);

  process.stdout.write("\nthe map:\n");
  check("the map is present", (d.mapTiles || 0) > 0,
    `${d.mapTiles} tiles` + (d.mapTiles ? "" : " — the world will not load"));

  const manifest = await fetch(`${url}/api/map/manifest`);
  check("the manifest is served", manifest.ok, `HTTP ${manifest.status}`);
  if (manifest.ok) {
    const m = await manifest.json();
    check("the story locations are pinned", (m.anchors || []).length >= 4,
      (m.anchors || []).map((a) => a.name).join(", "));
    check("tiles are revalidated, not blindly cached",
      /no-cache|max-age=0/.test(manifest.headers.get("cache-control") || ""),
      manifest.headers.get("cache-control") || "(none)");
  }

  process.stdout.write("\nsecurity:\n");
  const anon = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `probe-${Date.now()}@example.invalid`,
      password: "correcthorsebattery",
      role: "admin",
    }),
  });
  check("staff registration is closed", anon.status === 403 || anon.status === 429,
    `HTTP ${anon.status}`);

  if ((d.staffAccounts || 0) === 0) {
    check("the bootstrap token is set, so the first admin can be created",
      d.bootstrapReady === true,
      d.bootstrapReady
        ? "ready — run npm run admin:create"
        : "ADMIN_BOOTSTRAP_TOKEN is NOT set on the server, so nothing can create the first admin",
      false);
  }

  check("a staff account exists", (d.staffAccounts || 0) > 0,
    d.staffAccounts
      ? `${d.staffAccounts}`
      : "none yet — run npm run admin:create, then remove ADMIN_BOOTSTRAP_TOKEN",
    false);

  // The bootstrap token must not be left set once an admin exists. It cannot
  // create a second account, but leaving a credential lying about is a habit
  // worth not having.
  if ((d.staffAccounts || 0) > 0) {
    process.stdout.write(
      "\nreminder: if ADMIN_BOOTSTRAP_TOKEN is still set in Railway, remove it.\n"
    );
  }

  process.stdout.write(
    `\n${failures ? `${failures} FAILED` : "deployment looks correct"}` +
    `${warnings ? `, ${warnings} warning(s)` : ""}\n`
  );
  process.exit(failures ? 1 : 0);
};

main().catch((err) => {
  process.stderr.write(`could not check the deployment: ${err.message}\n`);
  process.exit(1);
});
