import { escapeForFindText } from "../src/server/docs";

// escapeForFindText is the only piece of docs.ts that's practical to unit test in isolation --
// everything else is a thin wrapper around DocumentApp's live document object model, which has
// no meaningful fake short of reimplementing Google's own document model. What matters here is
// that citation text (routinely containing regex metacharacters) round-trips through
// Body#findText(), which treats its argument as a regular expression rather than literal text.
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
