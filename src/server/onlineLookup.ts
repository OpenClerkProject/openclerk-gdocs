import {
  citationProviderRegistry,
  extractCaseCitations,
  isSafeHyperlinkUrl,
  parseCaseCitation,
  supportsRateLimitAwareness,
  CitationProvider,
  ProviderCredentialField,
} from "openclerk-core";
import { getBodyText, getOccurrenceStatus, hyperlinkOccurrences } from "./docs";

// The registry also carries a USPTO Patent Center entry, but it's a documented no-op placeholder
// for openclerk-core's Non-patent Literature workflow (always reports "not found") -- gdocs
// doesn't implement that workflow, and this list is specifically for case-law citation lookup,
// so showing it here would just be a dead end for the user.
const CASE_LAW_PROVIDER_IDS = new Set(["courtlistener", "lexisnexis", "westlaw", "bloomberg-law"]);

export interface ProviderSummary {
  id: string;
  name: string;
  description: string;
  requiresAuth: boolean;
  credentialFields: ProviderCredentialField[];
}

export function getProviderList(): ProviderSummary[] {
  return citationProviderRegistry
    .list()
    .filter((provider) => CASE_LAW_PROVIDER_IDS.has(provider.id))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      requiresAuth: provider.requiresAuth,
      credentialFields: provider.credentialFields,
    }));
}

export interface OnlineLookupResult {
  ok: boolean;
  error?: string;
  providerName?: string;
  totalCitations?: number;
  linkedCount?: number;
  skippedCount?: number;
  rateLimitedCount?: number;
}

function resolveProvider(providerId: string): CitationProvider | undefined {
  const provider = citationProviderRegistry.get(providerId);
  return provider && CASE_LAW_PROVIDER_IDS.has(provider.id) ? provider : undefined;
}

/**
 * Scans the document for case citations and hyperlinks the ones the selected provider resolves.
 * Credentials are supplied fresh on every call and never persisted server-side: Apps Script gives
 * no guarantee that in-memory state survives between separate google.script.run invocations (each
 * may run in a new execution context), so unlike openclerk-word -- which authenticates once and
 * keeps the provider instance alive for the rest of the browser session -- this re-authenticates
 * on every scan. The sidebar itself is what holds credentials in memory for the session, the same
 * "never written to disk" model, just shifted from the task pane's JS context to the browser
 * sidebar's.
 */
export async function runOnlineLookup(providerId: string, credentials: Record<string, string>): Promise<OnlineLookupResult> {
  const provider = resolveProvider(providerId);
  if (!provider) {
    return { ok: false, error: "Unknown or unsupported provider." };
  }

  if (provider.requiresAuth) {
    try {
      await provider.authenticate(credentials || {});
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const bodyText = getBodyText();
  const candidates = extractCaseCitations(bodyText);
  if (candidates.length === 0) {
    return { ok: true, providerName: provider.name, totalCitations: 0, linkedCount: 0, skippedCount: 0, rateLimitedCount: 0 };
  }

  let linkedCount = 0;
  let skippedCount = 0;
  let rateLimitedCount = 0;

  // Sequential, not parallel -- stays within each provider's rate limits (CourtListener's free
  // tier default is a tight 5 requests/minute), same reasoning as openclerk-word's Online Lookup.
  for (const raw of candidates) {
    const status = getOccurrenceStatus(raw);
    if (!status.found) {
      skippedCount += 1;
      continue;
    }
    if (status.allLinked) {
      linkedCount += 1;
      continue;
    }

    const parsed = parseCaseCitation(raw) || { raw };
    let match;
    try {
      match = await provider.lookupCitation(parsed);
    } catch {
      match = null;
    }

    if (!match || !isSafeHyperlinkUrl(match.url)) {
      if (supportsRateLimitAwareness(provider) && provider.wasLastRequestRateLimited()) {
        rateLimitedCount += 1;
      } else {
        skippedCount += 1;
      }
      continue;
    }

    hyperlinkOccurrences(raw, match.url);
    linkedCount += 1;
  }

  return {
    ok: true,
    providerName: provider.name,
    totalCitations: candidates.length,
    linkedCount,
    skippedCount,
    rateLimitedCount,
  };
}
