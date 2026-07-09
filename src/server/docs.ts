/**
 * Google Docs glue layer -- the DocumentApp-based equivalent of openclerk-word's word.ts. Holds
 * every call into the document object model so the server handlers (onlineLookup.ts,
 * bluebookCheck.ts) only ever deal with plain strings and openclerk-core types.
 *
 * One Docs-specific wrinkle that has no Word equivalent: DocumentApp.Body#findText() treats its
 * search argument as a regular expression, not literal text (Word's Range.search() takes literal
 * text plus matchCase/matchWholeWord options). Citation strings routinely contain regex
 * metacharacters -- periods, parentheses, e.g. "444 U.S. 490 (U.S.Ill., 1980)" -- so every search
 * string must be escaped before being handed to findText(), or it will both mismatch and can
 * throw on unbalanced-paren citation fragments.
 */

// Defensive cap mirroring openclerk-word's MAX_SEARCH_TEXT_LENGTH -- a citation string should
// never be anywhere near this long; this just guards against a parser bug feeding findText()
// a pathological regex built from a huge string.
export const MAX_SEARCH_TEXT_LENGTH = 500;

export function escapeForFindText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Occurrence {
  element: GoogleAppsScript.Document.Text;
  start: number;
  end: number;
}

function findAllOccurrences(body: GoogleAppsScript.Document.Body, searchText: string): Occurrence[] {
  if (!searchText || searchText.length > MAX_SEARCH_TEXT_LENGTH) {
    return [];
  }

  const pattern = escapeForFindText(searchText);
  const occurrences: Occurrence[] = [];
  let result = body.findText(pattern);

  while (result !== null) {
    occurrences.push({
      element: result.getElement().asText(),
      start: result.getStartOffset(),
      end: result.getEndOffsetInclusive(),
    });
    result = body.findText(pattern, result);
  }

  return occurrences;
}

function isAlreadyLinked(occurrence: Occurrence): boolean {
  return occurrence.element.getLinkUrl(occurrence.start) !== null;
}

export function getBodyText(): string {
  return DocumentApp.getActiveDocument().getBody().getText();
}

/**
 * Hyperlinks every not-already-linked occurrence of `searchText` in the document body.
 * Returns how many occurrences now have a link (whether just applied or already present),
 * mirroring word.ts's "skip citations that already have a hyperlink" behavior so re-running a
 * scan after a partial run (e.g. after a provider rate limit) doesn't re-spend API quota
 * re-verifying citations that are already done.
 */
export function hyperlinkOccurrences(searchText: string, url: string): { linkedCount: number; found: boolean } {
  const body = DocumentApp.getActiveDocument().getBody();
  const occurrences = findAllOccurrences(body, searchText);
  if (occurrences.length === 0) {
    return { linkedCount: 0, found: false };
  }

  let linkedCount = 0;
  for (const occurrence of occurrences) {
    if (isAlreadyLinked(occurrence)) {
      linkedCount += 1;
      continue;
    }
    occurrence.element.setLinkUrl(occurrence.start, occurrence.end, url);
    linkedCount += 1;
  }

  return { linkedCount, found: true };
}

/**
 * Reports whether `searchText` appears in the document, and if so whether every occurrence
 * already has a hyperlink. Callers use this to decide whether a lookup provider call is needed
 * at all -- if every instance is already linked, skip the API call entirely (see
 * hyperlinkOccurrences's doc comment for why that matters against tight provider rate limits).
 */
export function getOccurrenceStatus(searchText: string): { found: boolean; allLinked: boolean } {
  const body = DocumentApp.getActiveDocument().getBody();
  const occurrences = findAllOccurrences(body, searchText);
  return {
    found: occurrences.length > 0,
    allLinked: occurrences.length > 0 && occurrences.every(isAlreadyLinked),
  };
}

/** Moves the document's cursor to the first occurrence of `searchText`, "jumping to" it for the user. */
export function navigateToText(searchText: string): boolean {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const occurrences = findAllOccurrences(body, searchText);
  if (occurrences.length === 0) {
    return false;
  }

  const first = occurrences[0];
  doc.setCursor(doc.newPosition(first.element, first.start));
  return true;
}
