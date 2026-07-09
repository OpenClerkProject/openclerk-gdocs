/**
 * openclerk-core's providers (courtListenerProvider.ts, base.ts, etc.) call the global `fetch`
 * directly -- there's no injectable HTTP client in its public API, since it was written assuming
 * a browser/Node host (that's true for openclerk-word's webpack/browser build, but not for Apps
 * Script's V8 runtime, which has no `fetch` at all). Rather than fork openclerk-core to add an
 * injectable client, this installs a `fetch`-shaped global backed by UrlFetchApp, so core's
 * provider code runs completely unmodified.
 *
 * Two behavioral details matter for parity with real fetch():
 * - `muteHttpExceptions: true` -- UrlFetchApp throws on non-2xx responses by default; fetch()
 *   instead resolves with `response.ok === false`. Providers rely on inspecting `response.status`
 *   (e.g. courtListenerProvider checks for 401/403/429 explicitly), so throwing here would break
 *   that logic.
 * - The body openclerk-core passes is either a plain string or something with a `toString()`
 *   (a real URLSearchParams, or this project's URLSearchParamsShim) -- both are handled by
 *   `String(body)`.
 */

interface ShimRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface ShimResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

function buildResponse(httpResponse: GoogleAppsScript.URL_Fetch.HTTPResponse): ShimResponse {
  const status = httpResponse.getResponseCode();
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(httpResponse.getContentText());
    },
    async text() {
      return httpResponse.getContentText();
    },
  };
}

async function shimFetch(url: string, init: ShimRequestInit = {}): Promise<ShimResponse> {
  const headers = init.headers || {};
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: (init.method || "GET").toLowerCase() as GoogleAppsScript.URL_Fetch.HttpMethod,
    headers,
    muteHttpExceptions: true,
  };

  if (headers["Content-Type"]) {
    options.contentType = headers["Content-Type"];
  }

  if (init.body !== undefined) {
    options.payload = typeof init.body === "string" ? init.body : String(init.body);
  }

  const httpResponse = UrlFetchApp.fetch(url, options);
  return buildResponse(httpResponse);
}

/** Installs the shim as a global only when a real fetch isn't already present (e.g. under Node/Jest). */
export function installFetchShim(): void {
  if (typeof (globalThis as Record<string, unknown>).fetch === "undefined") {
    (globalThis as Record<string, unknown>).fetch = shimFetch as unknown as typeof fetch;
  }
}

// Exported for direct testing without depending on global installation order.
export { shimFetch };
