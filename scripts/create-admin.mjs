#!/usr/bin/env node
// ============================================================================
// CREATE ADMIN — make the first staff account on a deployment.
//
// Staff registration is closed: creating staff needs an existing admin. On a
// fresh deployment there is no admin to authorise the first one, so it takes a
// bootstrap token, which is only honoured while zero admins exist.
//
//   ADMIN_BOOTSTRAP_TOKEN=... npm run admin:create -- \
//     --url https://your-app.up.railway.app --email you@example.com
//
// The password is typed at a prompt rather than passed as an argument, because
// arguments end up in shell history and in the process list.
// ============================================================================

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = (arg("url") || "http://localhost:8787").replace(/\/$/, "");
const email = arg("email");
const role = arg("role", "admin");
const token = process.env.ADMIN_BOOTSTRAP_TOKEN;

if (!email) {
  process.stderr.write(
    "usage: npm run admin:create -- --email you@example.com [--url https://...] [--role admin]\n"
  );
  process.exit(1);
}

if (!token) {
  process.stderr.write(
    "ADMIN_BOOTSTRAP_TOKEN is not set.\n\n" +
    "Generate one, set it in the Railway variables, and export the same value here:\n" +
    "  openssl rand -hex 32\n"
  );
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question("password (20+ characters recommended, input is visible): ");
rl.close();

if (password.length < 12) {
  process.stderr.write("refused: staff passwords must be at least 12 characters\n");
  process.exit(1);
}

const res = await fetch(`${url}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-bootstrap-token": token },
  body: JSON.stringify({ email, password, role }),
});
const body = await res.json().catch(() => null);

if (res.status === 201) {
  process.stdout.write(
    `\ncreated ${body.user.role} ${body.user.email} on ${url}\n\n` +
    "Now DELETE ADMIN_BOOTSTRAP_TOKEN from the Railway variables. It cannot\n" +
    "create a second account, but there is no reason to leave it set.\n"
  );
  process.exit(0);
}

process.stderr.write(`\nfailed: HTTP ${res.status} ${body?.error || ""}\n`);
if (res.status === 403) {
  process.stderr.write(
    "\nEither an admin already exists — in which case sign in and create staff\n" +
    "from there — or the token does not match the one set on the server.\n"
  );
}
process.exit(1);
