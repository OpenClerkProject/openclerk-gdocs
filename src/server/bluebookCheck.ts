import { bluebookRuleSetRegistry, extractCaseCitations, parseCaseCitation, BluebookIssue } from "openclerk-core";
import { getBodyText, navigateToText } from "./docs";

export interface BluebookEditionSummary {
  id: string;
  name: string;
  description: string;
}

export function getBluebookEditionList(): BluebookEditionSummary[] {
  return bluebookRuleSetRegistry.list().map((ruleSet) => ({
    id: ruleSet.id,
    name: ruleSet.name,
    description: ruleSet.description,
  }));
}

export interface BluebookCitationResult {
  raw: string;
  parseFailed: boolean;
  issues: BluebookIssue[];
}

export interface BluebookCheckResult {
  ok: boolean;
  error?: string;
  editionName?: string;
  totalCitations?: number;
  flaggedCount?: number;
  errorCount?: number;
  warningCount?: number;
  results?: BluebookCitationResult[];
}

export function runBluebookCheck(editionId: string): BluebookCheckResult {
  const ruleSet = bluebookRuleSetRegistry.get(editionId);
  if (!ruleSet) {
    return { ok: false, error: "Unknown Bluebook edition." };
  }

  const bodyText = getBodyText();
  const candidates = extractCaseCitations(bodyText);

  const results: BluebookCitationResult[] = candidates.map((raw) => {
    const parsed = parseCaseCitation(raw);
    return {
      raw,
      parseFailed: parsed === null,
      issues: parsed ? ruleSet.checkCitation(parsed) : [],
    };
  });

  const flaggedCount = results.filter((result) => result.parseFailed || result.issues.length > 0).length;
  const errorCount = results.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "error").length,
    0
  );
  const warningCount = results.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "warning").length,
    0
  );

  return {
    ok: true,
    editionName: ruleSet.name,
    totalCitations: candidates.length,
    flaggedCount,
    errorCount,
    warningCount,
    results,
  };
}

/** Moves the document cursor to the first occurrence of a flagged citation. */
export function goToCitationInDocument(citationText: string): boolean {
  return navigateToText(citationText);
}
