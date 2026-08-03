#!/usr/bin/env node
// ============================================================================
// THE TRAP CARD — state machine checks, run against BOTH clients.
//
// The card the player writes in Chapter 01 and is asked about in the final
// chapter is the emotional spine of the game, and its behaviour is almost
// entirely about WHEN it appears and whether it can still be changed. Getting
// that wrong is not cosmetic: showing the edit box in the final chapter would
// let a player quietly rewrite what they said before being asked about it,
// which destroys the only moment the mechanic exists for.
//
// The logic exists twice — once in JS for the web build, once in C# for Unity.
// Rather than trust that two hand-written copies agree, both are run against
// ONE shared table (src/data/trapCard.cases.json). That is the direct fix for
// the drift the audit flagged as D9.
//
//   npm run check:trap          both, if dotnet is available
//   npm run check:trap -- --js  JS only
// ============================================================================

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trapCardState, normaliseTrapStatement, normaliseTrapAnswer, TRAP_MAX } from "../src/data/trapCard.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(ROOT, "src/data/trapCard.cases.json"), "utf8"));

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`}\n`);
  if (!ok) failures += 1;
}

// ---------------------------------------------------------------- JavaScript
process.stdout.write("the trap card — web (src/data/trapCard.js):\n");

for (const c of cases.states) {
  check(c.name, trapCardState({
    level: c.level, lastLevel: cases.lastLevel, statement: c.statement, answer: c.answer,
  }), c.expect);
}
for (const c of cases.statements) check(c.name, normaliseTrapStatement(c.in), c.expect);
for (const c of cases.answers) check(c.name, normaliseTrapAnswer(c.in), c.expect);

check(`statements are capped at ${TRAP_MAX}`, normaliseTrapStatement("x".repeat(500)).length, TRAP_MAX);

// ---------------------------------------------------------------- C# / Unity
// Skipped rather than failed when dotnet is absent — but SAID, loudly. A check
// that quietly does not run is worse than one that is not there, because it
// reports success either way.
if (process.argv.includes("--js")) {
  process.stdout.write("\nunity: skipped (--js)\n");
} else {
  const probe = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    process.stdout.write("\nunity: SKIPPED — dotnet not installed, so the C# copy was NOT checked\n");
  } else {
    process.stdout.write("\nthe trap card — unity (TrapCardState.cs):\n");
    const run = spawnSync("dotnet", [
      "run", "--project", path.join(ROOT, "tools/trapcard-check/check.csproj"),
      "-c", "Release", "-v", "q", "--nologo",
    ], { encoding: "utf8", cwd: ROOT });

    const out = (run.stdout || "").trim();
    if (out) process.stdout.write(out + "\n");
    if (run.status !== 0) {
      failures += 1;
      const err = (run.stderr || "").trim();
      if (err) process.stdout.write(err.split("\n").slice(0, 12).join("\n") + "\n");
    }
  }
}

process.stdout.write(`\n${failures ? `${failures} FAILED` : "all trap card checks passed"}\n`);
process.exit(failures ? 1 : 0);
