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
// Where the counts live is a per-bucket decision, not a global one:
//
//   per IP       IN MEMORY. Deliberately loose (see LIMITS), so losing the
//                counts on restart costs nothing, and writing every request to
//                disk would cost something.
//   per account  ON DISK, in the SQLite volume. This is the limit that actually
//                stops password guessing, and in memory it meant nine wrong
//                passwords, a deploy, and the attacker starts again from zero.
//                On a platform that redeploys on push that is not a rare event,
//                and an attacker need not even predict one -- they can keep
//                going and take whichever windows they are handed.
//
// Neither is shared BETWEEN instances. This runs as one, and a Redis dependency
// for a game that has not launched is the wrong trade. It is the first thing to
// revisit if the service is ever scaled out, because each instance would then
// hold its own per-IP counts and the effective limit multiplies.
// ============================================================================

const MINUTE = 60 * 1000;

/**
 * Fixed-window counter. Cheaper and more predictable than a sliding window,
 * and the edge case it is criticised for — double the limit across a window
 * boundary — does not matter at these numbers.
 */
function createCounter(persistence = null) {
  const hits = new Map(); // key -> { count, resetAt }

  // One shape for both backings, so take/peek/clear below do not care which
  // they are talking to. The persistent one reads through to SQLite every time
  // rather than caching: these are single-digit calls per sign-in, and a cache
  // is one more thing that can disagree with the truth.
  const read = persistence
    ? (key) => persistence.read(key)
    : (key) => {
        const entry = hits.get(key);
        return entry && entry.resetAt > Date.now() ? entry : null;
      };
  const write = persistence
    ? (key, entry) => persistence.write(key, entry.count, entry.resetAt)
    : (key, entry) => hits.set(key, entry);
  const drop = persistence ? (key) => persistence.clear(key) : (key) => hits.delete(key);

  // Old entries would otherwise accumulate for every address ever seen.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
    persistence?.sweep(now);
  }, 5 * MINUTE);
  sweep.unref?.();

  return {
    /** @returns {{ok:boolean, retryAfter:number, remaining:number}} */
    take(key, limit, windowMs) {
      const now = Date.now();
      let entry = read(key);
      if (!entry) entry = { count: 0, resetAt: now + windowMs };
      entry.count += 1;
      write(key, entry);
      const ok = entry.count <= limit;
      return {
        ok,
        remaining: Math.max(0, limit - entry.count),
        retryAfter: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000),
      };
    },
    /** Ask without counting. */
    peek(key, limit) {
      const entry = read(key);
      const now = Date.now();
      if (!entry) return { ok: true, remaining: limit, retryAfter: 0 };
      return {
        ok: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfter: entry.count <= limit ? 0 : Math.ceil((entry.resetAt - now) / 1000),
      };
    },
    /** Wipe a key — used to forget failures once someone logs in properly. */
    clear(key) {
      drop(key);
    },
    get size() {
      return persistence ? persistence.size() : hits.size;
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

/**
 * @param {object} [store] the SQLite store. Given one, failed sign-ins survive
 *   a restart; without one they do not, which is right for tests and for
 *   `npm run dev` but wrong in production.
 */
export function createRateLimiter(store = null) {
  const byAddress = createCounter();
  const byAccount = createCounter(
    store?.readAuthFailure
      ? {
          read: (key) => store.readAuthFailure(key),
          write: (key, count, resetAt) => store.writeAuthFailure(key, count, resetAt),
          clear: (key) => store.clearAuthFailure(key),
          sweep: (now) => store.sweepAuthFailures(now),
          size: () => -1,   // not worth a COUNT(*) on every stats call
        }
      : null
  );

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
