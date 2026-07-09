import { shimFetch, installFetchShim } from "../src/server/shims/fetchShim";
import { URLSearchParamsShim } from "../src/server/shims/urlSearchParamsShim";

function mockUrlFetchApp(responseCode: number, contentText: string) {
  const fetchMock = jest.fn().mockReturnValue({
    getResponseCode: () => responseCode,
    getContentText: () => contentText,
  });
  (globalThis as Record<string, unknown>).UrlFetchApp = { fetch: fetchMock };
  return fetchMock;
}

describe("shimFetch", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).UrlFetchApp;
  });

  it("maps a 2xx UrlFetchApp response to an ok Response-like object", async () => {
    mockUrlFetchApp(200, JSON.stringify({ hello: "world" }));

    const response = await shimFetch("https://example.com/api");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hello: "world" });
    expect(await response.text()).toBe(JSON.stringify({ hello: "world" }));
  });

  it("reports ok: false for a non-2xx response instead of throwing (matches fetch(), not UrlFetchApp's default)", async () => {
    mockUrlFetchApp(401, "unauthorized");

    const response = await shimFetch("https://example.com/api");

    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
  });

  it("always sets muteHttpExceptions so UrlFetchApp doesn't throw on error status codes", async () => {
    const fetchMock = mockUrlFetchApp(429, "");

    await shimFetch("https://example.com/api");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ muteHttpExceptions: true });
  });

  it("lowercases the HTTP method for UrlFetchApp", async () => {
    const fetchMock = mockUrlFetchApp(200, "{}");

    await shimFetch("https://example.com/api", { method: "POST" });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "post" });
  });

  it("serializes a URLSearchParams-like body via toString() into the payload", async () => {
    const fetchMock = mockUrlFetchApp(200, "{}");
    const body = new URLSearchParamsShim({ text: "1 U.S. 1" });

    await shimFetch("https://example.com/api", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      payload: "text=1%20U.S.%201",
      contentType: "application/x-www-form-urlencoded",
    });
  });

  it("passes headers straight through to UrlFetchApp", async () => {
    const fetchMock = mockUrlFetchApp(200, "{}");

    await shimFetch("https://example.com/api", { headers: { Authorization: "Token abc123" } });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Token abc123" } });
  });
});

describe("installFetchShim", () => {
  const original = (globalThis as Record<string, unknown>).fetch;

  afterEach(() => {
    (globalThis as Record<string, unknown>).fetch = original;
  });

  it("does not override an existing global fetch", () => {
    const sentinel = () => Promise.resolve();
    (globalThis as Record<string, unknown>).fetch = sentinel;

    installFetchShim();

    expect((globalThis as Record<string, unknown>).fetch).toBe(sentinel);
  });
});
