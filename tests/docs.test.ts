import { escapeForFindText, hyperlinkOccurrences, getOccurrenceStatus, navigateToText, getBodyText } from "../src/server/docs";
import { createFakeDocumentApp } from "./fakes/documentAppFake";

// escapeForFindText's own unit tests -- see fakes/documentAppFake.ts for the rest of this file,
// which exercises hyperlinkOccurrences/getOccurrenceStatus/navigateToText against a small
// in-memory DocumentApp fake rather than skipping them for lack of a live Google Doc. What
// matters here is that citation text (routinely containing regex metacharacters) round-trips
// through Body#findText(), which treats its argument as a regular expression rather than literal
// text.
describe("escapeForFindText", () => {
  it("escapes periods so they don't match any character", () => {
    expect(escapeForFindText("444 U.S. 490")).toBe("444 U\\.S\\. 490");
  });

  it("escapes parentheses so they don't form a capture group", () => {
    expect(escapeForFindText("(U.S.Ill., 1980)")).toBe("\\(U\\.S\\.Ill\\., 1980\\)");
  });

  it("escapes the rest of the regex metacharacter set", () => {
    expect(escapeForFindText("a+b*c?d^e$f{g}h|i[j]k\\l")).toBe(
      "a\\+b\\*c\\?d\\^e\\$f\\{g\\}h\\|i\\[j\\]k\\\\l"
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeForFindText("Norfolk and W Ry Co v Liepelt")).toBe("Norfolk and W Ry Co v Liepelt");
  });
});

const CITATION = "444 U.S. 490 (U.S.Ill., 1980)";

function installFakeDocument(paragraphs: string[]) {
  const fake = createFakeDocumentApp(paragraphs);
  (globalThis as unknown as { DocumentApp: unknown }).DocumentApp = fake;
  return fake;
}

describe("hyperlinkOccurrences", () => {
  it("hyperlinks a single not-yet-linked occurrence", () => {
    installFakeDocument([`See ${CITATION} for the holding.`]);
    const result = hyperlinkOccurrences(CITATION, "https://example.com/case");
    expect(result).toEqual({ linkedCount: 1, found: true });
    expect(getOccurrenceStatus(CITATION)).toEqual({ found: true, allLinked: true });
  });

  it("counts an already-linked occurrence without re-setting it", () => {
    const fake = installFakeDocument([`${CITATION} and ${CITATION} again.`]);
    hyperlinkOccurrences(CITATION, "https://example.com/case");
    const spy = jest.spyOn(fake.__texts[0], "setLinkUrl");
    const result = hyperlinkOccurrences(CITATION, "https://example.com/case");
    expect(result).toEqual({ linkedCount: 2, found: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it("links only the not-yet-linked occurrence when one of two is already linked", () => {
    const fake = installFakeDocument([`${CITATION} and ${CITATION} again.`]);
    // Manually link just the first occurrence via the same flattened view docs.ts itself uses,
    // simulating a prior partial run (e.g. interrupted by a provider rate limit) rather than going
    // through hyperlinkOccurrences for setup.
    const flattened = fake.__document.getBody().editAsText();
    const firstMatch = flattened.findText(escapeForFindText(CITATION))!;
    firstMatch.getElement().setLinkUrl(firstMatch.getStartOffset(), firstMatch.getEndOffsetInclusive(), "https://example.com/case-a");

    const result = hyperlinkOccurrences(CITATION, "https://example.com/case-b");
    expect(result).toEqual({ linkedCount: 2, found: true });
    // The already-linked occurrence keeps its original URL; only the second one changes.
    expect(firstMatch.getElement().getLinkUrl(firstMatch.getStartOffset())).toBe("https://example.com/case-a");
    const secondMatch = flattened.findText(escapeForFindText(CITATION), firstMatch)!;
    expect(secondMatch.getElement().getLinkUrl(secondMatch.getStartOffset())).toBe("https://example.com/case-b");
  });

  it("reports not found when the citation isn't in the document", () => {
    installFakeDocument(["Nothing relevant here."]);
    expect(hyperlinkOccurrences(CITATION, "https://example.com/case")).toEqual({
      linkedCount: 0,
      found: false,
    });
  });

  it("still finds and hyperlinks a citation split across two Text elements", () => {
    // A citation whose case name is italicized (conventional Bluebook style) commonly lands right
    // on a Text-element boundary, since Google Docs splits body content into a new element at
    // every formatting boundary. docs.ts searches via Body#editAsText()'s flattened view
    // specifically so this still works instead of silently skipping the citation -- see the fake's
    // own findText() (the raw, non-flattened one) for the boundary this sidesteps.
    const half = CITATION.length / 2;
    installFakeDocument([CITATION.slice(0, half), CITATION.slice(half)]);
    expect(hyperlinkOccurrences(CITATION, "https://example.com/case")).toEqual({
      linkedCount: 1,
      found: true,
    });
    expect(getOccurrenceStatus(CITATION)).toEqual({ found: true, allLinked: true });
  });

  it("documents that the raw (non-flattened) Body#findText never crosses a Text-element boundary", () => {
    const half = CITATION.length / 2;
    const fake = createFakeDocumentApp([CITATION.slice(0, half), CITATION.slice(half)]);
    expect(fake.__document.getBody().findText(escapeForFindText(CITATION))).toBeNull();
  });

  it("guards against a citation string longer than MAX_SEARCH_TEXT_LENGTH", () => {
    const huge = "444 U.S. ".repeat(100);
    installFakeDocument([huge]);
    expect(hyperlinkOccurrences(huge, "https://example.com/case")).toEqual({
      linkedCount: 0,
      found: false,
    });
  });

  it("guards against an empty search string", () => {
    installFakeDocument([CITATION]);
    expect(hyperlinkOccurrences("", "https://example.com/case")).toEqual({
      linkedCount: 0,
      found: false,
    });
  });
});

describe("getOccurrenceStatus", () => {
  it("reports allLinked: false when only some occurrences are linked", () => {
    installFakeDocument([`${CITATION} and ${CITATION} again.`]);
    expect(getOccurrenceStatus(CITATION)).toEqual({ found: true, allLinked: false });
  });

  it("reports allLinked: true once every occurrence is linked", () => {
    installFakeDocument([`${CITATION} and ${CITATION} again.`]);
    hyperlinkOccurrences(CITATION, "https://example.com/case");
    expect(getOccurrenceStatus(CITATION)).toEqual({ found: true, allLinked: true });
  });

  it("reports found: false, allLinked: false when absent", () => {
    installFakeDocument(["Nothing relevant here."]);
    expect(getOccurrenceStatus(CITATION)).toEqual({ found: false, allLinked: false });
  });
});

describe("navigateToText", () => {
  it("moves the cursor to the first occurrence and returns true", () => {
    const fake = installFakeDocument([`Intro. ${CITATION} and ${CITATION} again.`]);
    expect(navigateToText(CITATION)).toBe(true);
    const cursor = fake.__document.cursor;
    expect(cursor).not.toBeNull();
    expect(cursor!.element).toBe(fake.__document.getBody().editAsText());
    expect(cursor!.offset).toBe(`Intro. `.length);
  });

  it("returns false and leaves the cursor untouched when not found", () => {
    const fake = installFakeDocument(["Nothing relevant here."]);
    expect(navigateToText(CITATION)).toBe(false);
    expect(fake.__document.cursor).toBeNull();
  });
});

describe("getBodyText", () => {
  it("concatenates every Text element in order", () => {
    installFakeDocument(["First paragraph. ", "Second paragraph."]);
    expect(getBodyText()).toBe("First paragraph. Second paragraph.");
  });
});
