// PRD §4.4 — file reader. Passthrough that returns raw Solidity content for
// LLM consumption. Called directly by the audit subgraph's readContract node
// (not an LLM-initiated tool call), so it's a plain function, not a tool().

/**
 * Returns the raw Solidity file content verbatim. The caller is responsible
 * for wrapping it with wrapUserContent before it enters any prompt.
 */
export function readSolidity(content: string): string {
  return content;
}