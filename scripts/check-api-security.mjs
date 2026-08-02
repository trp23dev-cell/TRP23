#!/usr/bin/env node
// ============================================================================
// API SECURITY CHECK — the things that must never be true of a public deploy.
//
// /api/auth/register creates STAFF accounts and was, until it was found,
// completely unauthenticated: anyone could POST role:"admin" and take the CMS,
// the content and every player record. It shipped that way and nothing would
// have noticed. So it is a test now.
//
//   npm run check:api                 (expects the API on :8787)
//   API=http://localhost:8799 npm run check:api
// ============================================================================

const API = process.env.API || "http://localhost:8787";
let failures = 0;

function check(name, ok, detail = "") {
  process.stdout.write(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? ` — ${detail}` : ""}\n`);
  if (!ok) failures += 1;
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

const main = async () => {
  const stamp = Date.now();

  // The one that mattered.
  const anon = await post("/api/auth/register", {
    email: `sec-${stamp}@example.invalid`, password: "correcthorsebattery", role: "admin",
  });
  check("anonymous staff registration is refused", anon.status === 403,
    `HTTP ${anon.status} ${anon.json?.error || ""}`);

  const guessed = await post("/api/auth/register",
    { email: `sec2-${stamp}@example.invalid`, password: "correcthorsebattery", role: "admin" },
    { "x-bootstrap-token": "not-the-token" });
  check("a guessed bootstrap token is refused", guessed.status === 403,
    `HTTP ${guessed.status}`);

  // Privilege escalation by asking nicely for a role.
  const viewer = await post("/api/auth/register", {
    email: `sec3-${stamp}@example.invalid`, password: "correcthorsebattery", role: "viewer",
  });
  check("staff registration is closed for every role", viewer.status === 403,
    `HTTP ${viewer.status}`);

  // Players must still be able to sign up — this is a game, not a fortress.
  const player = await post("/api/players/register", {
    username: `sec${stamp}`.slice(0, 18),
    email: `p-${stamp}@example.invalid`,
    password: "averylongpassword",
  });
  check("players can still register", player.json?.ok === true,
    `HTTP ${player.status} ${player.json?.error || ""}`);

  // Someone else's data must not be readable without their token.
  const other = await fetch(`${API}/api/player/somebody-elses-id`);
  check("player data needs authentication", other.status === 401 || other.status === 403,
    `HTTP ${other.status}`);

  // --- rate limiting ---
  // Login and registration are open by definition, which makes them the
  // targets. These assert that hammering them actually stops.
  process.stdout.write("\nrate limiting:\n");

  // Per-account lockout: many attempts at ONE account. This is the one a
  // per-IP limit never catches when the attempt is distributed.
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
    locked ? `locked after ${locked} attempts` : "still accepting attempts after 16 wrong passwords");

  // A locked account must stay locked even for the RIGHT password, or the
  // lockout is trivially bypassed by simply guessing correctly.
  if (locked) {
    const correct = await post("/api/players/login", { identifier: victim, password: "thecorrectpassword" });
    check("the lockout is not bypassed by the correct password", correct.status === 429,
      `HTTP ${correct.status}`);
  }

  // Registration flood from one address.
  let regBlocked = null;
  for (let i = 0; i < 26; i += 1) {
    const r = await post("/api/players/register", {
      username: `flood${stamp}${i}`.slice(0, 18),
      email: `flood-${stamp}-${i}@example.invalid`,
      password: "averylongpassword",
    });
    if (r.status === 429) { regBlocked = i + 1; break; }
  }
  check("registration floods are throttled", regBlocked !== null,
    regBlocked ? `blocked after ${regBlocked}` : "26 accounts created without a limit");

  // A 429 has to say when to come back, or clients cannot behave.
  const again = await post("/api/players/register", {
    username: `x${stamp}`.slice(0, 18), email: `x-${stamp}@example.invalid`, password: "averylongpassword",
  });
  check("throttled responses say when to retry",
    again.status !== 429 || Number(again.json?.retryAfter) > 0,
    again.status === 429 ? `retryAfter ${again.json?.retryAfter}s` : "not throttled");

  process.stdout.write(`\n${failures ? `${failures} FAILED` : "all security checks passed"}\n`);
  process.exit(failures ? 1 : 0);
};

main().catch((err) => {
  process.stderr.write(`security check could not run: ${err.message}\n`);
  process.exit(1);
});
