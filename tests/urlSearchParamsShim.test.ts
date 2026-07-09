import { URLSearchParamsShim, installUrlSearchParamsShim } from "../src/server/shims/urlSearchParamsShim";

describe("URLSearchParamsShim", () => {
  it("serializes a plain object as a form-encoded string", () => {
    const params = new URLSearchParamsShim({ text: "1 U.S. 1", grant_type: "client_credentials" });
    expect(params.toString()).toBe("text=1%20U.S.%201&grant_type=client_credentials");
  });

  it("URL-encodes special characters in keys and values", () => {
    const params = new URLSearchParamsShim({ "a b": "c&d=e" });
    expect(params.toString()).toBe("a%20b=c%26d%3De");
  });

  it("produces an empty string with no arguments", () => {
    expect(new URLSearchParamsShim().toString()).toBe("");
  });
});

describe("installUrlSearchParamsShim", () => {
  const original = (globalThis as Record<string, unknown>).URLSearchParams;

  afterEach(() => {
    (globalThis as Record<string, unknown>).URLSearchParams = original;
  });

  it("does not override an existing global URLSearchParams", () => {
    const sentinel = function Sentinel() {} as unknown;
    (globalThis as Record<string, unknown>).URLSearchParams = sentinel;

    installUrlSearchParamsShim();

    expect((globalThis as Record<string, unknown>).URLSearchParams).toBe(sentinel);
  });
});
