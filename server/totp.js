import { createHmac, randomBytes } from "node:crypto";

// RFC 4648 base32 (no padding needed for authenticator apps).
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input) {
  const str = String(input).replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Generate a fresh base32 TOTP secret (default 20 bytes / 160 bits).
export function generateTotpSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

// HMAC-based one-time password (RFC 4226).
function hotp(keyBuffer, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac("sha1", keyBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

// Time-based one-time password (RFC 6238).
export function totp(secret, { step = 30, digits = 6, t = Date.now() } = {}) {
  const counter = Math.floor(t / 1000 / step);
  return hotp(base32Decode(secret), counter, digits);
}

// Verify a submitted code, tolerating ±`window` time steps for clock drift.
export function verifyTotp(secret, token, { window = 1, step = 30, digits = 6, t = Date.now() } = {}) {
  if (!secret || token == null) return false;
  const code = String(token).trim().replace(/\s/g, "").padStart(digits, "0");
  if (code.length !== digits) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(t / 1000 / step);
  for (let err = -window; err <= window; err += 1) {
    if (hotp(key, counter + err, digits) === code) return true;
  }
  return false;
}

// otpauth:// provisioning URI for authenticator apps / QR codes.
export function otpauthUrl({ secret, label, issuer = "TRAP MADE IT" }) {
  const acct = encodeURIComponent(label || "player");
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${iss}:${acct}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}
