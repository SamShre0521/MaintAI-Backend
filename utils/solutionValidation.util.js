// Reject empty placeholders and explicit profanity; manager review remains required.
export function validSolutionText(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/^(null|undefined|n\/a|none)$/i.test(value.trim()) &&
    !/\b(fuck(?:ing)?|shit|asshole)\b/i.test(value)
  );
}
