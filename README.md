# Hibou Board

A small planning board with portfolio, issue board, timeline, dependency risk,
owner decisions and a conflict-aware **mock** calendar adapter. The bundled
Atlas, Beacon and Workshop projects, future dates and evidence references are
fictional demonstrations. No live calendar or notification integration runs.

## Run locally

Use Node.js 22.13+ (Node 22 and 24 are tested in CI).

```sh
npm ci
npm test
npm run build
npm start
```

Open the loopback URL printed at startup. Set `PORT=3000` for a fixed port.
Demo mode requires no login and binds to loopback only. Do not expose demo mode
through a proxy. Its SQLite files live under ignored `runtime/private/demo/`.
`npm run build` recreates `dist/` from an explicit public-file allowlist; run
`node dist/server.mjs` after installing dependencies in the project root.
The build never copies runtime state. `node:sqlite` may emit an experimental
warning on some supported Node versions.

## Runtime and authentication

Production mode requires `HIBOU_MODE=production`, `HIBOU_ORIGIN` (an exact HTTPS
origin), `HIBOU_RP_ID` (the same hostname), and a dedicated `HIBOU_DATA_DIR`.
The application still binds to loopback. An operator must supply a TLS reverse
proxy that preserves the configured Host. Forwarded headers are not trusted.
See `.env.example` and `deploy/` for inert templates; no deploy automation runs.
The app reads environment variables, not `.env` files automatically.

Passkey registration and authentication use `@simplewebauthn/server`, checking
challenge, origin, RP ID and user verification. To enroll the first owner,
provide a high-entropy `HIBOU_ENROLLMENT_TOKEN` through a private environment,
open initial setup in the UI, and enter it there. Registration closes as soon
as the first credential exists, including concurrent attempts. Remove the
enrollment token from the runtime environment afterward. No secret is generated
or shipped by this repository. Additional owner enrollment, recovery and
credential management are not yet implemented; keep an operator-controlled,
protected database backup and validate recovery before deployment.

Sessions expire after eight hours, store only a token digest, and use a Secure,
HttpOnly, SameSite=Strict `__Host-` cookie. Browser writes require both the exact
Origin and a per-session CSRF token. Sign out revokes the session. Service
principals use separately provisioned bearer tokens; the ignored JSON file
specified by `HIBOU_SERVICES_FILE` contains an array of records with `id`,
`tokenHash` (SHA-256 hex), `scopes` (`board:read` and/or `board:write`), and
`expires` (Unix milliseconds). Scope checks apply on every request. Rotate or
revoke these records privately, then restart the process. Service tokens cannot
enroll Passkeys or create human sessions.

Authentication challenges expire after five minutes, are single-use and have
a bounded outstanding count. A public deployment also needs proxy rate limits,
TLS, supervised startup, backups and operator validation. SQLite stores board
state with revision compare-and-swap, principals, credentials, sessions and
challenges. Runtime directories/files use restrictive permissions and a
single-process lock. After a crash, verify the owning process has stopped
before removing a stale runtime lock.

The PWA installs a manifest and an offline page. Its service worker caches only
the offline page and icon, never board data, API responses or credentials.

## Private data boundary

`seed.mjs` and `planning-import.mjs` are synthetic fixtures. Existing demo
migration, calendar ownership and conflict tests use only these fixtures.
`sourceRef` is an optional schema field for runtime evidence, not a calendar
ownership link; public fixtures use synthetic references only.

Private state can be supplied explicitly in production with
`HIBOU_PRIVATE_IMPORT`, pointing to a UTF-8 JSON state document using schema
version 3. It is imported only when the SQLite board is empty, never merged or
reimported on restart. Use the structure of `promotePlanning(seed())` as a
schema example, replace it privately, and use generic actor kinds `human`,
`ai`, `collab` or `unknown`. Existing JSON runtime files are never discovered or
imported automatically. Demo mode rejects private import and service files.

Keep runtime exports, real plans, source event IDs, credentials, environment
files, databases, backups and deployment addresses out of Git. `.gitignore`
excludes those locations. The HTTP server serves an explicit static allowlist.
Never place private files in the source tree's public files or `dist/`.

## Verification and maintenance

```sh
npm test
npm run build
npm run audit:public
```

The publication audit inspects **Git index bytes**, and optionally also the
build (`--dist`), for forbidden files, private paths, credential patterns,
non-demo evidence, network addresses and non-allowlisted hostnames. A local,
ignored `private/audit-deny.json` may contain known private identifiers to
check without printing their values. Audit findings show only rule and count.
This is a layered publication check, not a guarantee that arbitrary future
text is safe; review changes before publishing.

GitHub Actions runs tests/build/public audit on Node 22 and 24, plus CodeQL.
Dependabot opens weekly npm and Actions update PRs. No auto-deploy or auto-merge
is configured. Authentication tests exercise a fake verifier at the abstraction
boundary and real HTTP rejection paths; a physical Passkey/TLS browser ceremony
has not yet been validated for a production deployment.

MIT licensed. See [LICENSE](LICENSE).
