# Security Policy

OpenClerk for Google Docs is a Google Workspace add-on (a Google Apps Script project) for legal
citation work. It runs inside Google's Apps Script runtime as a sidebar on the document you open,
has no backend server of its own, and asks for only the narrow OAuth scopes it needs (see
[`appsscript.json`](appsscript.json) and the README's development notes). Because it is used in
legal work, we treat citation-verification accuracy and safe hyperlink insertion as security
properties, not just correctness concerns.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull
requests.** Public disclosure before a fix exists puts users at risk.

Instead, report privately through GitHub's private vulnerability reporting:

1. Open the [**Security** tab](https://github.com/OpenClerkProject/openclerk-gdocs/security) of this
   repository.
2. Click **"Report a vulnerability"** to open an advisory visible only to the maintainers.

> **Maintainer note:** if the "Report a vulnerability" button isn't visible, enable it once under
> **Settings → Code security and analysis → Private vulnerability reporting**.

Please include enough detail to reproduce and assess the issue:

- the affected feature, file, and version or commit,
- steps to reproduce, or a proof of concept,
- the impact you believe it has (what data or action it exposes).

OpenClerk is maintained by an individual, in the open, on a **best-effort basis** — there is no paid
support line or guaranteed response time. You can expect an acknowledgment as soon as the maintainer
is able, followed by coordination on a fix and a disclosure timeline.

## Coordinated disclosure

Please give the maintainer a reasonable opportunity to release a fix before disclosing publicly.
Once a fix ships, the advisory can be published and credit given to the reporter (if wanted). There
is no bug-bounty program.

## Supported versions

The add-on is deployed to an Apps Script project and users always run whatever is currently
deployed — there is no pinned older version to run. Security fixes are made against the latest
`main` only.

| Version | Supported |
| --- | --- |
| Latest deployed (`main`) | ✅ |
| Older commits | ❌ (redeploy from the latest `main`) |

## Scope

**In scope** — the add-on code in this repository (`src/`, `appsscript.json`, and the build/deploy
tooling under `scripts/` and `.github/workflows/`). The security-sensitive areas, specifically:

- **Citation verification / hallucination detection** — a check must never report a fabricated
  citation as "verified" (the project's core trust property).
- **Hyperlink insertion into the document** — every provider-supplied URL is revalidated
  (`isSafeHyperlinkUrl` from `openclerk-core`) before it is applied as a link.
- **OAuth scope minimalism** — the add-on requests only
  `documents.currentonly` (the open document, not the user's Drive),
  `script.container.ui` (the sidebar), and
  `script.external_request` (outbound lookups to CourtListener / user-configured providers).
  A change that broadens these scopes is a security-relevant change.

**Out of scope:**

- **Third-party services** OpenClerk can talk to (CourtListener, Westlaw, LexisNexis, Bloomberg
  Law) — report issues in how *they* handle data to those vendors directly.
- **[`openclerk-core`](https://github.com/OpenClerkProject/openclerk-core)** — the shared citation /
  Bluebook logic lives in a separate repository; report issues in that logic there.
- **Google Apps Script / Google Workspace platform** itself — report those to Google.

## Existing security posture

A point-in-time manual audit is recorded in [SECURITY_AUDIT.md](SECURITY_AUDIT.md), and the
[README](README.md) documents the add-on's data flow and the OAuth scopes it requests.
