/**
 * A small in-memory fake of the DocumentApp surface docs.ts actually uses -- not a
 * reimplementation of Google's document model, just enough to exercise findAllOccurrences,
 * hyperlinkOccurrences, getOccurrenceStatus, and navigateToText with real assertions instead of
 * requiring a live Google Doc for every test.
 *
 * One deliberate fidelity choice: the real Body#findText() never matches text spanning two
 * different Text elements (Google Docs splits body content into Text runs at formatting/edit
 * boundaries, and a search never crosses that boundary). This fake models the body as an ordered
 * list of independent Text elements for exactly that reason -- it's a real, documented gotcha
 * worth having a test lock in, not an implementation shortcut.
 */

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
  constructor(private readonly texts: FakeText[]) {}

  getText(): string {
    return this.texts.map((t) => t.content).join("");
  }

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
