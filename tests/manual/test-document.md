# Manual test document

Paste the block below into a scratch Google Doc for exercising Online Lookup and Bluebook Check
against a real document via `clasp push` (see README.md > Development). Every citation here was
run through `extractCaseCitations`/`parseCaseCitation`/the Bluebook rule-checker directly (not
guessed) to confirm what each one actually does before including it.

## Paste this into the Doc

```
Fourteenth Amendment doctrine begins with Brown v. Board of Education, 347 U.S. 483 (1954),
which the Court later relied on in Miranda v. Arizona, 384 U.S. 436 (1966), specifically the
passage at 384 U.S. 436, 444-45 (1966) discussing custodial interrogation. The foundational
case for judicial review itself is Marbury v. Madison, 5 U.S. 137 (1803).

For comparison, Smith v. Jones, 999 U.S. 999 (2099) does not correspond to any real decision.

Two citations below have deliberate Bluebook formatting problems: Roe v. Wade, 410 U. S. 113
(1973) uses a non-standard reporter form, and Gideon v Wainwright, 372 U.S. 335 (1963) is
missing the period after "v". This fictional citation, Doe v. Laboratory Corp., 100 U.S. 200
(2000), is only here to test edition-switching.
```

**One formatting step you have to do by hand** (this is the point of the test): in the Doc,
select just the case name **"Brown v. Board of Education"** in the first sentence and italicize
it (Ctrl+I / Cmd+I), leaving the rest of that citation plain. Google Docs will split that citation
across at least two underlying Text elements right there — this is what
`fix/findtext-cross-element-citations` (PR #4) exists to handle. If Online Lookup or "jump to
citation" silently fails on that specific citation but works on the others, the `editAsText()` fix
didn't actually take effect in what you deployed.

## What each citation is for

| Citation | Verified result | What it tests |
| --- | --- | --- |
| Brown v. Board of Education, 347 U.S. 483 (1954) | Bluebook: 2 warnings ("Board"→"Bd.", "Education"→"Educ.", Table T6) | Case-name abbreviation warnings; **also the italicized/cross-element case above** |
| Miranda v. Arizona, 384 U.S. 436 (1966) | Bluebook: clean | Baseline -- should resolve via CourtListener and show no flags |
| Miranda v. Arizona, 384 U.S. 436, 444-45 (1966) | Bluebook: clean, pincite parses as `444-45` | Pincite parsing |
| Marbury v. Madison, 5 U.S. 137 (1803) | Bluebook: clean | Old/low volume number, still a real, resolvable case |
| Smith v. Jones, 999 U.S. 999 (2099) | Parses fine, obviously fabricated | Online Lookup's "not found" path -- should show up in `skippedCount`, not crash |
| Roe v. Wade, 410 U. S. 113 (1973) | Bluebook: 1 error (non-standard "U. S." reporter form) + 1 warning (court abbreviation expected) | An error- and warning-severity issue on the same citation |
| Gideon v Wainwright, 372 U.S. 335 (1963) | Bluebook: 1 error (missing period after "v") | Single clean error case |
| Doe v. Laboratory Corp., 100 U.S. 200 (2000) | 20th edition: clean. 21st/22nd: 1 warning ("Laboratory"→"Lab'y") | Edition-gated abbreviation (the 21st-edition T6/T13.2 table merger) -- fictional citation, don't expect it to resolve in Online Lookup |

## Other things to exercise while you're in there

- **Bluebook Check → click a result row** for each citation above and confirm the cursor actually
  jumps to it in the document (`goToCitationInDocument` → `navigateToText`).
- **Run Online Lookup twice in a row** with CourtListener selected -- the second run should report
  the already-linked citations without re-querying the provider (`getOccurrenceStatus`'s
  `allLinked` short-circuit).
- **Scan quickly several times in succession** to see CourtListener's free-tier rate limit
  (5 requests/minute) actually surface as `rateLimitedCount` rather than being misreported as
  "not found."
- Switch the Bluebook edition selector between 20th/21st/22nd and re-run -- `Doe v. Laboratory
  Corp.`'s "Laboratory" warning is edition-gated (the T6/T13.2 table merger in the 21st edition,
  see `caseNameAbbreviations.ts` in openclerk-core): clean under the 20th edition, one warning
  under 21st/22nd.
