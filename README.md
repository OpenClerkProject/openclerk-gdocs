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
- **`openclerk-core`** is consumed as a git dependency (`openclerk-core: github:OpenClerkProject/openclerk-core#v0.1.0`,
  not published to npm) for citation parsing, the Bluebook rule-checker, and the citation-lookup
  provider registry — completely unmodified.
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
npx clasp create --type docs --title "OpenClerk (dev)"   # or: cp .clasp.json.example .clasp.json and fill in an existing project ID
npm run push       # builds, then clasp push
```

Open the bound Doc, reload it, and use **Extensions → OpenClerk → Open OpenClerk** (or the
add-on's custom menu) to open the sidebar.

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
