# WP-009 · Account recovery

| | |
|---|---|
| **Horizon** | 0 |
| **Owner** | AI |
| **Effort** | M |
| **Status** | ✅ done — 3 August 2026 |
| **Branch** | `wp/004-continuous-integration` (folded in) |

## Why

There was no account recovery of any kind. No password reset, no username reminder, no way past two-factor if the authenticator was lost. Forget your password and you lost the account, the progress and the wallet — permanently, with real accounts on a live deploy.

Surfaced by the docs restructure as a gap that was in nobody's plan.

## What was built

| Route | Purpose |
|---|---|
| `POST /api/players/forgot-password` | Emails a single-use link, 30-minute expiry |
| `POST /api/players/reset-password` | Consumes the token, sets the password, signs every device out |
| `POST /api/players/forgot-username` | Emails the username to a known address |
| `POST /api/players/2fa/recovery-codes` | Issues 10 one-time codes (requires a current TOTP) |
| `GET /api/players/2fa/recovery-codes` | How many remain — never the codes |
| `POST /api/players/login` | Now accepts `recoveryCode` in place of `code` |

Plus `server/mailer.js`, migration 7 (`auth_tokens`, `recovery_codes`), and `mail` / `mailTransport` on `/api/health`.

## Design decisions

**A reset must not become a 2FA bypass.** Somebody who has taken over an inbox has one factor. If the reset also cleared two-factor they would have both, and 2FA would be decoration. The reset changes the password and nothing else — and there is a test named after exactly that.

**No enumeration.** Every recovery route answers identically whether or not the account exists. A form that says *"no such email"* is a way to find out who has an account, and for a game about people's private circumstances that deserves more care than usual.

**Secrets hashed at rest.** A reset token in the clear is a password equivalent. SHA-256 rather than scrypt: these are server-generated randomness, not user-chosen secrets, so there is nothing to brute-force and no reason to be slow.

**Reset signs every device out.** If the reset happened because somebody else was in the account, leaving their session alive achieves nothing.

**Recovery codes use an unambiguous alphabet** — no `O`/`0`, no `I`/`1`/`l`. They get written on paper and read back by somebody who has just lost their phone.

**The mailer fails loudly.** A stub that pretends to send is how the coin faucet survived two weeks. Unconfigured, it refuses and logs; `/api/health` reports whether mail can be delivered at all.

## Not included

A real email provider (**H-11**) · email address verification · admin-assisted recovery · UI in either client.

## Acceptance criteria

- [x] Reset works end to end, single-use, expiring
- [x] Old password stops working, new one starts
- [x] **A reset does not get past two-factor**
- [x] Recovery codes work once each, and need the password too
- [x] No route reveals whether an account exists
- [x] Mail failure is loud, never silent

## Verification

```bash
npm run check:api   # 52 checks, 15 of them account recovery
```

## Done

3 August 2026. All 15 recovery checks pass, including `**a password reset does not get you past two-factor**`.

**One surprise:** the first run failed because the rate-limiting section floods registration until it throttles — so the recovery accounts registered *after* it were silently getting 429s and the test failed for entirely the wrong reason. The section now runs before it, with a comment saying why.
