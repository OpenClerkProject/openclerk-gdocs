# Security audit — openclerk-gdocs

Date: 2026-07-12
Scope: `openclerk-gdocs` only — the Google Docs / Google Workspace Add-on
(Apps Script) built on `openclerk-core`. This is the first security audit
of this repo (it was an empty placeholder during the earlier audits of
`openclerk-core` and `openclerk-word`; see those repos' `SECURITY_AUDIT.md`
files for the shared citation/provider logic this add-on consumes from the
`openclerk-core` npm package). `openclerk-libreoffice` remains out of scope
(still only LICENSE + README, no code).

## Methodology

Full read-through of every source file plus targeted checks of: the
server↔sidebar trust boundary (`google.script.run` handlers in
`src/server/main.ts`), enterprise-provider credential flow
(`src/server/onlineLookup.ts`), hyperlink URL-scheme validation before
document mutation (`src/server/docs.ts`), the Apps Script V8 `fetch` /
`URLSearchParams` shims (`src/server/shims/`), the sidebar UI's DOM sinks
(`src/ui/sidebar.html`), the build/bundle step (`scripts/build.js`), the
OAuth scopes in `appsscript.json`, the CI workflow, and a search for
`eval`/dynamic code and credential-persistence/logging APIs. Dependencies
checked with `npm audit`.

## Findings fixed in this audit

None — no code defects were found that warranted a change. Details below.

## Verified clean (no findings)

- **No AI/LLM calls; no dynamic code.** No `eval`, `new Function`, or
  equivalent anywhere in `src/`. The exposed handlers are plain string/JSON
  in, plain JSON out.
- **Least-privilege OAuth scopes** (`appsscript.json`):
  `documents.currentonly` (only the open doc, not all of Drive),
  `script.container.ui` (the sidebar), and `script.external_request`
  (needed for provider lookups via `UrlFetchApp`). No broad `documents` or
  `drive` scope.
- **Server↔sidebar boundary** (`src/server/main.ts`): the five
  `google.script.run`-callable handlers (`getProviderList`,
  `runOnlineLookup`, `getBluebookEditionList`, `runBluebookCheck`,
  `goToCitationInDocument`) take only simple arguments (provider id,
  credentials object, edition id, citation string) and dispatch through
  fixed registry lookups — an attacker-supplied `providerId`/`editionId`
  that isn't in the allow-set is rejected (`resolveProvider` /
  `bluebookRuleSetRegistry.get` return undefined → handled error), never
  used to index dynamic behavior.
- **Credentials are never persisted server-side.** `runOnlineLookup`
  passes the credentials object straight to `provider.authenticate()` and
  holds it only for the duration of that one call. Confirmed by grep that
  there is **no** use of `PropertiesService`, `CacheService`,
  `ScriptProperties`/`UserProperties`, `Logger.log`, or `console.*`
  anywhere in `src/` — so credentials are never written to script
  properties, the cache, or logs. The sidebar's in-memory form is the only
  place they live, matching `openclerk-word`'s "never written to disk"
  model.
- **Hyperlink safety is enforced on every write.** The only call to
  `Text#setLinkUrl` is `src/server/docs.ts:89`, inside
  `hyperlinkOccurrences`. That function's sole caller is
  `src/server/onlineLookup.ts:118`, which is guarded by
  `!isSafeHyperlinkUrl(match.url)` at line 109 (imported from
  `openclerk-core`) — a provider result whose URL isn't `http(s)`/`mailto`
  is skipped, never linked. Traced all paths: there is no `setLinkUrl` that
  bypasses the scheme check.
- **Docs `findText` regex injection / ReDoS is guarded.** Unlike Word's
  literal-text `Range.search`, `Body#findText()` treats its argument as a
  RegExp. `src/server/docs.ts` escapes every search string with
  `escapeForFindText` (a full regex-metacharacter escape, identical in
  spirit to `openclerk-core`'s `escapeRegExp`) and caps search length at
  `MAX_SEARCH_TEXT_LENGTH = 500` before calling `findText()`, so a citation
  string containing `.`/`(`/`)` etc. can neither mis-match nor drive
  catastrophic backtracking.
- **Sidebar DOM injection surface** (`src/ui/sidebar.html`): all dynamic,
  server-derived values (provider names/descriptions, credential-field
  labels, citation text, Bluebook issue messages) are written via
  `textContent` and `document.createElement`. `innerHTML` is used only to
  **clear** containers (`= ""`), never with interpolated data. Inline
  `onclick`/`onchange` handlers call fixed local functions with no
  string-built code.
- **Build step** (`scripts/build.js`): esbuild bundles `src/server/main.ts`
  to an IIFE and copies `appsscript.json` + `sidebar.html` into `dist/`.
  No network fetch at build time, no dynamic execution.
- **CI has no deployment credentials.** `.github/workflows/ci.yml` runs
  `lint`/`build`/`test` only — it never runs `clasp push`. Pushing to Apps
  Script is a manual, local `npm run push` that reads `.clasprc.json`
  (gitignored); `.clasp.json.example` ships only a placeholder scriptId.

## Findings documented only (no code change)

### A. Dev-dependency advisories (not shipped, not exploitable as used)
`npm audit --omit=dev` reports **0 vulnerabilities**; the production
dependency tree (only `openclerk-core`) is clean. The full-tree audit
reports 6 moderate advisories, all in **devDependencies**:
- `esbuild <= 0.24.2` (GHSA-67mh-4wv8-2f99) — concerns esbuild's **dev
  server** allowing cross-origin requests. This project only uses esbuild
  as a bundler (`esbuild.build` / `context.watch` in `scripts/build.js`),
  never `esbuild serve`, so the advisory doesn't apply to how it's used.
- `@google/clasp` transitive advisories — `clasp` is a local, manually-run
  deploy tool, never invoked in CI or shipped to users.

Neither reaches the deployed Apps Script bundle (`dist/Code.js` +
`sidebar.html`) or any end user. Recommend bumping both on the next
dependency-maintenance pass (the fixes are breaking major bumps —
`esbuild@0.28`, `clasp@3` is already in use per `package.json`, so the
audit's `clasp@2.5.0` "fix" is a downgrade and should be ignored), but no
urgent action.

### B. `fetch` shim relies on core for HTTPS enforcement
`src/server/shims/fetchShim.ts` forwards to `UrlFetchApp.fetch` and does
not itself require `https://`. This is acceptable because the only code
that builds request URLs is `openclerk-core`'s providers, which enforce
`https://` on the user-supplied enterprise `apiBaseUrl`
(`base.ts` scheme check) and hardcode `https://` for CourtListener — the
shim is a pure transport that never originates a URL. Worth noting for a
reviewer: `UrlFetchApp` follows redirects by default, but any redirect
would be followed **server-side on Google's infrastructure** (not the
user's machine) toward a provider endpoint the user explicitly opted into,
so this is not a meaningful SSRF vector against the user. No change
recommended; flagged so the trust assumption (URL safety lives in core, not
the shim) is explicit.

### C. CI actions pinned to major-version tags, not commit SHAs
`.github/workflows/ci.yml` uses `actions/checkout@v4` / `actions/setup-node@v4`
(tags, not SHAs) — consistent with the other OpenClerk repos. Low priority:
this workflow holds no secrets and has no publish/deploy step.

## Out of scope

`openclerk-libreoffice` — still only `LICENSE` + `README.md` on `main`, no
code to audit. `openclerk-word` and `openclerk-core` were audited
separately (see their `SECURITY_AUDIT.md`); this pass did not re-audit the
`openclerk-core` package logic that this add-on imports, beyond confirming
it is consumed from the pinned npm release (`openclerk-core@^0.2.6`).
