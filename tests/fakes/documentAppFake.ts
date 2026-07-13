/**
 * A small in-memory fake of the DocumentApp surface docs.ts actually uses -- not a
 * reimplementation of Google's document model, just enough to exercise findAllOccurrences,
 * hyperlinkOccurrences, getOccurrenceStatus, and navigateToText with real assertions instead of
 * requiring a live Google Doc for every test.
 *
 * Models two distinct search surfaces, matching the real API's two distinct behaviors:
 *  - Body#findText() matches independently against each underlying Text element and never finds
 *    a match spanning two of them (Google Docs splits body content into Text runs at
 *    formatting/edit boundaries) -- modeled here as FakeBody's own findText, still exposed
 *    directly for tests that want to document that raw behavior.
 *  - Body#editAsText() returns a flattened Text view of the whole body that treats it as one
 *    continuous string, crossing those boundaries -- modeled as FakeBody.editAsText(), which docs.ts
 *    actually uses for exactly that reason. The flattened view is cached per FakeBody so repeated
 *    editAsText() calls within a test observe links set by earlier ones, matching how the real API
 *    always reflects the same underlying document regardless of how many times you ask for a view
 *    into it.
 */

function findInString(content: string, pattern: string, fromOffset: number): { start: number; end: number } | null {
  const regex = new RegExp(pattern);
  const match = regex.exec(content.slice(fromOffset));
  if (!match || match[0].length === 0) {
    return null;
  }
  const start = fromOffset + match.index;
  return { start, end: start + match[0].length - 1 };
}

class FakeText {
  content: string;
  private links: (string | null)[];

  constructor(content: string) {
    this.content = content;
    this.links = new Array(content.length).fill(null);
  }

  asText(): FakeText {
    return this;
  }

  getLinkUrl(offset: number): string | null {
    return this.links[offset] ?? null;
  }

  setLinkUrl(startOffset: number, endOffsetInclusive: number, url: string): void {
    for (let i = startOffset; i <= endOffsetInclusive; i++) {
      this.links[i] = url;
    }
  }

  findText(pattern: string, from?: FakeRangeElement): FakeRangeElement | null {
    const fromOffset = from ? from.getEndOffsetInclusive() + 1 : 0;
    const match = findInString(this.content, pattern, fromOffset);
    return match ? new FakeRangeElement(this, match.start, match.end) : null;
  }
}

class FakeRangeElement {
  constructor(
    private readonly element: FakeText,
    private readonly startOffset: number,
    private readonly endOffsetInclusive: number
  ) {}

  getElement(): FakeText {
    return this.element;
  }

  getStartOffset(): number {
    return this.startOffset;
  }

  getEndOffsetInclusive(): number {
    return this.endOffsetInclusive;
  }
}

class FakeBody {
  private flattened: FakeText | null = null;

  constructor(private readonly texts: FakeText[]) {}

  getText(): string {
    return this.texts.map((t) => t.content).join("");
  }

  /** Models Body#findText()'s real limitation: never matches across Text-element boundaries. */
  findText(pattern: string, from?: FakeRangeElement): FakeRangeElement | null {
    const regex = new RegExp(pattern);
    const startElementIndex = from ? this.texts.indexOf(from.getElement()) : 0;
    const resumeOffset = from ? from.getEndOffsetInclusive() + 1 : 0;

    for (let i = Math.max(startElementIndex, 0); i < this.texts.length; i++) {
      const text = this.texts[i];
      const searchFrom = i === startElementIndex ? resumeOffset : 0;
      const match = regex.exec(text.content.slice(searchFrom));
      if (match && match[0].length > 0) {
        const start = searchFrom + match.index;
        const end = start + match[0].length - 1;
        return new FakeRangeElement(text, start, end);
      }
    }
    return null;
  }

  /** Models Body#editAsText(): a flattened view crossing Text-element boundaries. Cached so
   * repeated calls see the same links. */
  editAsText(): FakeText {
    if (!this.flattened) {
      this.flattened = new FakeText(this.getText());
    }
    return this.flattened;
  }
}

class FakePosition {
  constructor(
    public readonly element: FakeText,
    public readonly offset: number
  ) {}
}

class FakeDocument {
  cursor: FakePosition | null = null;

  constructor(private readonly body: FakeBody) {}

  getBody(): FakeBody {
    return this.body;
  }

  newPosition(element: FakeText, offset: number): FakePosition {
    return new FakePosition(element, offset);
  }

  setCursor(position: FakePosition): void {
    this.cursor = position;
  }
}

/** One entry per Text element the fake body should contain, in order. */
export function createFakeDocumentApp(paragraphs: string[]) {
  const texts = paragraphs.map((p) => new FakeText(p));
  const body = new FakeBody(texts);
  const document = new FakeDocument(body);

  return {
    getActiveDocument: () => document,
    __document: document,
    __texts: texts,
  };
}
