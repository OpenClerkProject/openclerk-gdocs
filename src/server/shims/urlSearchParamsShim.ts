/**
 * Minimal URLSearchParams polyfill for the Apps Script V8 runtime, which -- like `fetch` -- has
 * no WHATWG URL API globals (URLSearchParams is a browser/Node host API, not a JS language
 * feature, so V8 alone doesn't provide it). Only implements what openclerk-core's providers
 * actually use: constructing from a plain string-keyed object and serializing with toString(),
 * e.g. `new URLSearchParams({ text }).toString()` as a form-encoded request body.
 */
export class URLSearchParamsShim {
  private readonly pairs: [string, string][];

  constructor(init?: Record<string, string> | [string, string][]) {
    if (!init) {
      this.pairs = [];
    } else if (Array.isArray(init)) {
      this.pairs = init.map(([key, value]) => [key, value]);
    } else {
      this.pairs = Object.keys(init).map((key) => [key, init[key]]);
    }
  }

  toString(): string {
    return this.pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  }
}

/** Installs the shim as a global only when a real URLSearchParams isn't already present (e.g. under Node/Jest). */
export function installUrlSearchParamsShim(): void {
  if (typeof (globalThis as Record<string, unknown>).URLSearchParams === "undefined") {
    (globalThis as Record<string, unknown>).URLSearchParams = URLSearchParamsShim;
  }
}
