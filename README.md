# openclerk-gdocs

OpenClerk for Google Docs — Bluebook citation checking and citation lookups via a Google
Workspace (Editor) Add-on, built on
[openclerk-core](https://github.com/OpenClerkProject/openclerk-core).

## Scope

Only two of [openclerk-word](https://github.com/OpenClerkProject/openclerk-word)'s four
workflows are implemented here for now:

- **Online Lookup** — scans the document for case citations and hyperlinks the ones a selected
  provider (CourtListener, LexisNexis, Westlaw, Bloomberg Law) resolves to exactly one case.
- **Bluebook Check** — scans case citations for common Bluebook mechanical formatting problems
  (20th/21st/22nd editions), with click-to-navigate results.

**Not implemented (out of scope for now):**

- **Case Law** (copying hyperlinks from a source `.docx` by parsing its OOXML with JSZip) — has
  no clean Google Docs equivalent; a Doc isn't a zip you can parse client-side the way a `.docx`
  is.
- **Embed Cited Text** (Word comments carrying cited opinion text) — Apps Script's `DocumentApp`
  has no comment-creation API; it would need the Drive API Advanced Service and its own OAuth
  scope, which is deliberately left out to keep this add-on's permissions minimal.

## Architecture

- **Editor Add-on**, not the newer Card-based Workspace Add-on framework — an `onOpen` menu item
  opens an `HtmlService` sidebar, the closest UX parity to Word's task pane.
- **`DocumentApp`** for reading the document body and applying hyperlinks (`src/server/docs.ts`),
  the equivalent of openclerk-word's `word.ts`.
- **`openclerk-core`** is consumed as a normal npm registry dependency (`openclerk-core: ^0.2.6`)
  for citation parsing, the Bluebook rule-checker, and the citation-lookup provider registry —
  completely unmodified. (Earlier versions pinned it as a git dependency instead; abandoned
  because installing a git dependency requires its `prepare` script to run at install time on
  *this* machine, which some npm setups block behind an `allowScripts` allowlist that a fresh git
  dependency can't satisfy due to a known npm/cli bug. Registry installs don't have this problem.)
- **Bundling**: Apps Script's V8 runtime has no `require`/ES module loader at runtime, so
  `scripts/build.js` uses esbuild to bundle everything into a single `dist/Code.js`, then
  explicitly assigns the handful of entry points (`onOpen`, `showSidebar`,
  `runOnlineLookup`, ...) onto `globalThis` in a footer — see the comment in that file for why a
  plain IIFE bundle isn't enough on its own (Apps Script only recognizes top-level function
  declarations / explicit `globalThis.foo =` assignments as callable script functions, not
  `const`/`let` bindings).
- **Deploy**: [`clasp`](https://github.com/google/clasp) pushes the contents of `dist/` to an
  Apps Script project. Copy `.clasp.json.example` to `.clasp.json` and fill in your own Apps
  Script project ID (not committed — it's per-deployment).

### The fetch/URLSearchParams shims

`openclerk-core`'s providers call the global `fetch()` and `new URLSearchParams()` directly (see
`courtListenerProvider.ts`, `base.ts`) — reasonable for a library written assuming a browser/Node
host, but Apps Script's V8 runtime provides neither; those are host APIs, not JS language
features. Rather than fork `openclerk-core` to add an injectable HTTP client, `src/server/shims/`
installs `fetch`/`URLSearchParams` globals backed by `UrlFetchApp` before any handler runs (see
`main.ts`), so the provider code from `openclerk-core` runs completely unmodified. Notably, the
shim sets `muteHttpExceptions: true` so a non-2xx response resolves with `response.ok === false`
(matching real `fetch()`) instead of `UrlFetchApp`'s default of throwing.

### Credentials are not persisted server-side

Apps Script gives no guarantee that in-memory state survives between separate
`google.script.run` calls (each may run in a fresh execution context), so unlike
`openclerk-word` — which authenticates once and keeps the provider instance alive for the rest of
the browser session — `runOnlineLookup` re-authenticates on every scan, with credentials supplied
fresh by the sidebar each time. The sidebar's own browser-side JS is what holds credentials in
memory for the session; nothing is written to `PropertiesService` or any other persistent store,
preserving the same "session-only, never to disk" model `openclerk-word` documents.

### Docs' `findText` is a regex, not literal text

Word's `Range.search()` takes literal text plus `matchCase`/`matchWholeWord` options; Google
Docs' `Body#findText()` treats its argument as a regular expression. Citation strings routinely
contain regex metacharacters (`444 U.S. 490 (U.S.Ill., 1980)`), so every search string is escaped
via `escapeForFindText()` in `src/server/docs.ts` before being handed to `findText()`.

### Searches go through `editAsText()`, not the raw `Body`

`Body#findText()` matches independently against each underlying Text element, and Google Docs
splits body content into a new Text element at every formatting boundary -- so it silently fails
to find a citation whose text spans two elements. That's common in practice, not just a
theoretical edge case: Bluebook citations conventionally italicize the case name, which is exactly
the kind of formatting change that creates an element boundary right in the middle of a citation.
`docs.ts` searches via `Body#editAsText()` instead, which returns a flattened `Text` view treating
the whole body as one continuous string -- `findText()`/`getLinkUrl()`/`setLinkUrl()` on results
from it cross those boundaries transparently. `tests/docs.test.ts` has a regression test for this
using a citation deliberately split across two Text elements in `tests/fakes/documentAppFake.ts`.

## Development

Prerequisites: Node.js 20+, npm, and a Google account to create an Apps Script project against.

```bash
npm install
npm test          # jest — shims, docs.ts against the DocumentApp fake, escapeForFindText
npm run lint       # tsc --noEmit
npm run build      # bundles src/ -> dist/Code.js, copies appsscript.json + sidebar.html
```

To deploy to an Apps Script project for manual testing in a real Google Doc:

```bash
npx clasp login
npx clasp create --type docs --title "OpenClerk (dev)" --rootDir dist   # or: cp .clasp.json.example .clasp.json and fill in an existing project ID
npm run push       # builds, then clasp push
```

Open the bound Doc, reload it, and use **Extensions → OpenClerk → Open OpenClerk** (or the
add-on's custom menu) to open the sidebar.

### Keeping the dev deployment in sync automatically

`.github/workflows/push-dev.yml` runs `clasp push` against the same "OpenClerk (dev)" project on
every push to `main`, so the sidebar has the latest code on the next reload without a manual `npm
run push`. It needs two repo secrets (Settings -> Secrets and variables -> Actions), both produced
by the manual steps above:

- **`CLASPRC_JSON`** -- the contents of `~/.clasprc.json`, written by `clasp login`
- **`CLASP_JSON`** -- the contents of `.clasp.json`, written by `clasp create` (or your own copy of
  `.clasp.json.example`)

`clasp login`'s refresh token can expire; if the workflow starts failing with an auth error,
re-run `clasp login` locally and update the `CLASPRC_JSON` secret with the new file contents. Once
this is set up, avoid hand-editing code directly in the Apps Script web IDE -- the workflow force-
pushes on every merge, so `main` is the only thing that actually sticks.

[`tests/manual/test-document.md`](tests/manual/test-document.md) has a ready-to-paste block of
citations (each one verified against the actual parsing/rule-checking logic beforehand, not
guessed) covering both tabs and the edge cases most worth checking by hand -- an already-fabricated
citation, an edition-gated abbreviation, and a citation you deliberately italicize to test that
searches still find text spanning a Text-element boundary.

## Testing limitations

`tests/fakes/documentAppFake.ts` is a small in-memory model of the specific `DocumentApp` surface
`docs.ts` actually calls (`Body#findText`, `Text#getLinkUrl`/`setLinkUrl`, cursor positioning) —
not a reimplementation of Google's document model, just enough to exercise
`hyperlinkOccurrences`/`getOccurrenceStatus`/`navigateToText` with real assertions instead of
skipping them for lack of a live Doc. It models the body as an ordered list of independent Text
elements specifically to capture a real API gotcha: `findText()` never matches text spanning two
different Text elements (Google Docs splits body content into runs at formatting/edit
boundaries), which `tests/docs.test.ts` locks in as a test case rather than an assumption.

What the fake *doesn't* cover: anything about how Google actually splits real document content
into Text elements in practice, `HtmlService` sidebar behavior, or `google.script.run`'s
client/server bridge. Those still require exercising the add-in against a real Google Doc via
`clasp push`.

## License

MIT
