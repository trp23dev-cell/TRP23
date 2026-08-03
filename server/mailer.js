// ============================================================================
// MAIL
//
// There is no email provider yet, and account recovery cannot wait for one —
// without it, forgetting a password locks a player out of their account, their
// progress and their wallet permanently.
//
// So this is a real interface with a development transport behind it, shaped so
// that adding Postmark, Resend or SES later is a function body rather than a
// refactor. See docs/05-operations/REAL-WORLD-INTEGRATION-REGISTER.md §5.2.
//
// THE RULE THIS FOLLOWS: a stub must fail loudly, never silently succeed.
//
// The wallet top-up route created a million coins from nothing on a live deploy
// for two weeks because a placeholder was helpful and quiet. A mailer that
// pretends to send is the same mistake wearing different clothes: password
// resets would appear to work, nobody would receive anything, and the logs
// would say everything was fine.
//
// Configure with:
//   MAIL_TRANSPORT=console   development. Writes the message to stdout.
//   MAIL_TRANSPORT=file      writes to .mail/ so tests can read it.
//   MAIL_TRANSPORT=none      refuses to send at all, loudly. The default in
//                            production, so an unconfigured deploy is obvious.
// ============================================================================

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TRANSPORT = process.env.MAIL_TRANSPORT
  || (process.env.NODE_ENV === "production" ? "none" : "console");

const FROM = process.env.MAIL_FROM || "TRAP MADE IT <no-reply@trapmadeit.local>";
const MAIL_DIR = process.env.MAIL_DIR || ".mail";

/**
 * Send a message.
 *
 * Resolves `{ ok, transport, id }` or `{ ok: false, error }`. It deliberately
 * does NOT throw: the routes that use it must answer identically whether or not
 * an address exists, and an exception here would leak that difference through a
 * 500. The caller logs the failure; the player is told the same thing either way.
 */
export async function sendMail({ to, subject, text }) {
  const id = `mail_${Date.now().toString(36)}`;

  if (TRANSPORT === "none") {
    // Loudly. An unconfigured production deploy silently swallowing password
    // resets is exactly the failure this file exists to prevent.
    console.error(
      `[mail] NOT SENT — no transport configured. Set MAIL_TRANSPORT.\n`
      + `[mail]   to: ${to}\n[mail]   subject: ${subject}`,
    );
    return { ok: false, error: "no mail transport configured" };
  }

  if (TRANSPORT === "file") {
    try {
      await mkdir(MAIL_DIR, { recursive: true });
      const file = path.join(MAIL_DIR, `${id}.txt`);
      await writeFile(file, `To: ${to}\nFrom: ${FROM}\nSubject: ${subject}\n\n${text}\n`, "utf8");
      return { ok: true, transport: "file", id, file };
    } catch (error) {
      console.error(`[mail] could not write to ${MAIL_DIR}: ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  // console
  console.log(
    `\n[mail] ─────────────────────────────────────────────\n`
    + `[mail] To:      ${to}\n[mail] From:    ${FROM}\n[mail] Subject: ${subject}\n[mail]\n`
    + text.split("\n").map((l) => `[mail] ${l}`).join("\n")
    + `\n[mail] ─────────────────────────────────────────────\n`,
  );
  return { ok: true, transport: "console", id };
}

/** Whether mail can actually be delivered. Reported by /api/health, so a
 *  misconfigured deploy is visible from outside rather than discovered by a
 *  player who never got their reset link. */
export function mailReady() {
  return TRANSPORT !== "none";
}

export function mailTransport() {
  return TRANSPORT;
}
