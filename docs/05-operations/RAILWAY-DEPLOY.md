# Deploying to Railway

Two things have to be right or the deploy is either broken or unsafe: the
database must live on a volume, and staff registration must be locked.

## 1. Mount a volume for the database

The game stores accounts, wallets, progress and the ledger in SQLite. Without a
volume that file lives inside the deployment, and **every redeploy destroys it**
— all accounts, all balances, gone, with no error.

In the Railway service:

1. **Variables → New Variable**

   | Variable | Value |
   |---|---|
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |
   | `TRUST_PROXY` | `1` |

   `TRUST_PROXY` is not optional on Railway. Every request arrives via the
   platform's proxy, so without it the rate limiter sees one address for the
   whole world and **all players share a single bucket** — a handful of logins
   would lock out everyone. With it set, the limiter reads `X-Forwarded-For`.

   It is off by default because that header is trivially forged when there is
   *no* proxy in front, which would let an attacker rotate it and bypass the
   limit entirely. Set it when deployed behind a proxy; leave it unset locally.

2. **Settings → Volumes → Add Volume**, mount path `/data`.

The server writes `trapmadeit.db` there and creates it on first boot. It warns
loudly in the logs if `NODE_ENV=production` and `DATA_DIR` is unset, because
silent data loss is the worst kind.

The **map** does not live on the volume. It ships with the code as
`server/storage/map-export.json.gz` and is imported on boot whenever it is newer
than what the database holds, so a deploy always comes up with the map that was
tested and never fetches anything at start-up. Rebuilding the map is:

```bash
npm run map:build     # fetch OSM + LIDAR, build tiles   (~45s)
npm run map:export    # write the artefact that ships
npm run map:verify    # 60-odd checks over the built map
```

## 2. Create the first staff account

`/api/auth/register` creates **staff** accounts — admin, ops, product, viewer —
and is not the same thing as player signup. It is closed: creating staff needs
an existing admin.

For the first account on a fresh deployment there is no admin to authorise it,
so it takes a bootstrap token supplied out of band:

1. Set `ADMIN_BOOTSTRAP_TOKEN` in Railway to a long random string:

   ```bash
   openssl rand -hex 32
   ```

2. Create the first admin, once, from your own machine:

   ```bash
   export ADMIN_BOOTSTRAP_TOKEN=<the same token you set in Railway>
   npm run admin:create -- --url https://<your-app>.up.railway.app --email you@example.com
   ```

   It prompts for the password rather than taking it as an argument, so it
   does not end up in your shell history. On success:

   ```
   created admin you@example.com on https://<your-app>.up.railway.app
   ```

   If it answers `403 only an admin can create staff accounts`, an admin
   already exists — sign in and create further staff from there.

3. **Delete `ADMIN_BOOTSTRAP_TOKEN` from the variables.** It only works while
   zero admins exist, but there is no reason to leave it lying around.

After that, further staff accounts are created by an admin using their session.

## 3. Check it from outside

```bash
npm run check:deploy -- --url https://<your-app>.up.railway.app
```

Every failure this catches is silent. A misconfigured deploy answers 200, serves
the game and looks completely fine — until a redeploy wipes every account, or a
handful of logins locks out the world. Run it after the first deploy and after
any change to the variables.

```
configuration:
  ok  the database is on a persistent volume — DATA_DIR is set
  ok  the proxy is trusted — TRUST_PROXY=1
  ok  running in production mode — NODE_ENV=production
```

## 4. Before you invite anyone real

- [ ] Volume mounted and `DATA_DIR` set — otherwise accounts vanish on redeploy
- [ ] `ADMIN_BOOTSTRAP_TOKEN` removed after first use
- [ ] `npm run check:repo` passes — no keys, keystores or databases tracked
- [ ] `npm run check:deploy -- --url https://<your-app>.up.railway.app` is clean
- [ ] `npm run check:api` passes against the deployed URL:
      `API=https://<your-app>.up.railway.app npm run check:api`
- [ ] Any credential that was ever committed has been **revoked and reissued**,
      not just deleted. Deleting a file does not remove it from git history —
      revocation is the fix, and it is the only one that works after the fact.
      (The Apple key committed in 6057dba4 was revoked by its owner on
      2026-07-31. iOS release will need a Developer account of our own.)
- [ ] The three admin passwords whose hashes were in the public database have
      been changed.

## What is deliberately not here

**CORS is an allowlist, not `*`.** The web game is served from the same origin
as the API, so it never uses CORS at all — a same-origin request does not carry
an `Origin` header. The allowlist exists for the packaged mobile build, which
runs on `capacitor://localhost`, and for local development.

Add `ALLOWED_ORIGINS` (comma separated) if the game is ever served from a
different domain to the API. A refused origin is logged, so a mistake looks like
a mistake rather than an outage.

**Unity:** a native player is not a browser and ignores CORS entirely, so a
desktop or mobile Unity build needs nothing here. A Unity **WebGL** build does —
it runs in a browser and is subject to these same rules, so whatever origin it
is hosted on must go in `ALLOWED_ORIGINS`.

**Rate limiting is in memory.** It holds counts in the process, which is right
for a single instance and wrong the moment the service is scaled to more than
one — each instance would keep its own counts and the effective limit would
multiply by the instance count. Revisit with a shared store if you scale out.

The limits are deliberately loose per IP (40 logins / 15 min, 20 registrations
/ hour) and tight per account (10 failed sign-ins / 15 min). Mobile carriers put
thousands of subscribers behind one address, so a tight per-IP cap locks out
real players without stopping an attacker who has many addresses. The per-account
lock is the control that actually stops password guessing.
