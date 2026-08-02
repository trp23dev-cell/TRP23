// ============================================================================
// RATE LIMITING — for the endpoints someone will actually attack.
//
// Login and registration are open by definition: they have to work before
// anyone is authenticated. On a public URL that makes them the obvious targets
// — credential stuffing against login, junk-account floods against register.
//
// Two different limits are needed, because they stop different attacks:
//
//   per IP       one machine hammering one endpoint
//   per account  a distributed attempt at ONE account from many addresses,
//                which a per-IP limit never sees
//
// Deliberately in memory. This runs as a single instance, and a Redis
// dependency for a game that has not launched is the wrong trade. It is the
// first thing to revisit if the service is ever scaled out, because each
// instance would then hold its own counts and the effective limit multiplies.
// ============================================================================

const MINUTE = 60 * 1000;

/**
 * Fixed-window counter. Cheaper and more predictable than a sliding window,
 * and the edge case it is criticised for — double the limit across a window
 * boundary — does not matter at these numbers.
 */
function createCounter() {
  const hits = new Map(); // key -> { count, resetAt }

  // Old entries would otherwise accumulate for every address ever seen.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, 5 * MINUTE);
  sweep.unref?.();

  return {
    /** @returns {{ok:boolean, retryAfter:number, remaining:number}} */
    take(key, limit, windowMs) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      const ok = entry.count <= limit;
      return {
        ok,
        remaining: Math.max(0, limit - entry.count),
        retryAfter: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000),
      };
    },
    /** Ask without counting. */
    peek(key, limit) {
      const entry = hits.get(key);
      const now = Date.now();
      if (!entry || entry.resetAt <= now) return { ok: true, remaining: limit, retryAfter: 0 };
      return {
        ok: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfter: entry.count <= limit ? 0 : Math.ceil((entry.resetAt - now) / 1000),
      };
    },
    /** Wipe a key — used to forget failures once someone logs in properly. */
    clear(key) {
      hits.delete(key);
    },
    get size() {
      return hits.size;
    },
  };
}

/**
 * The address to attribute a request to.
 *
 * Behind Railway's proxy every request arrives from the proxy, so the socket
 * address is useless and X-Forwarded-For is the real client. That header is
 * trivially forged when NOT behind a proxy, which would let an attacker rotate
 * it and bypass the limit entirely — so it is only trusted when TRUST_PROXY
 * says there is a proxy in front.
 */
export function clientAddress(req, trustProxy = process.env.TRUST_PROXY === "1") {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.socket?.remoteAddress || "unknown";
}

// The limits themselves.
//
// Per-IP limits have to be LOOSE, and this is the part that is easy to get
// wrong. Mobile carriers put thousands of subscribers behind one address, as do
// schools, offices and any shared wifi. A tight per-IP cap does not stop a
// determined attacker — they have many addresses — it just locks out a whole
// carrier's worth of real players, silently, and looks like the game is broken.
//
// The tight control is per ACCOUNT, below. That is the one that actually stops
// password guessing, and it cannot hurt a bystander because it is scoped to the
// account being attacked.
export const LIMITS = {
  login: { limit: 40, windowMs: 15 * MINUTE },
  register: { limit: 20, windowMs: 60 * MINUTE },
  write: { limit: 240, windowMs: 5 * MINUTE },
};

// Failed sign-ins against a SINGLE account, from any address. This is the real
// protection: ten wrong passwords in fifteen minutes is nobody's bad day, and
// scoping it to the account means a shared IP cannot lock out strangers.
export const ACCOUNT_LOCK = { limit: 10, windowMs: 15 * MINUTE };

export function createRateLimiter() {
  const byAddress = createCounter();
  const byAccount = createCounter();

  return {
    /**
     * @param {string} bucket  a key from LIMITS
     * @param {string} address from clientAddress()
     */
    checkAddress(bucket, address) {
      const rule = LIMITS[bucket] || LIMITS.write;
      return byAddress.take(`${bucket}:${address}`, rule.limit, rule.windowMs);
    },

    /** Count a failed sign-in against the account it targeted. */
    failAccount(identifier) {
      const key = `acct:${String(identifier || "").toLowerCase()}`;
      return byAccount.take(key, ACCOUNT_LOCK.limit, ACCOUNT_LOCK.windowMs);
    },

    /** Ask whether an account is locked, WITHOUT counting the question as an
     *  attempt — otherwise checking would itself lock the account out. */
    accountLocked(identifier) {
      return byAccount.peek(`acct:${String(identifier || "").toLowerCase()}`, ACCOUNT_LOCK.limit);
    },

    /** A correct password clears the account's failure count. */
    succeeded(identifier) {
      byAccount.clear(`acct:${String(identifier || "").toLowerCase()}`);
    },

    stats() {
      return { addresses: byAddress.size, accounts: byAccount.size };
    },
  };
}
