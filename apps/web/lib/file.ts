// .sol attachment validation (client-side, before upload).
// PRD §3.3: .sol files only, max 64KB (raised per ADR-007 so a max contract
// fits the first-turn payload).

export const MAX_SOL_BYTES = 64 * 1024;

export type SolFile = { name: string; content: string };

export type ValidationResult =
  | { ok: true; file: SolFile }
  | { ok: false; error: string };

export function validateSolFile(file: File): ValidationResult {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".sol")) {
    return { ok: false, error: "Only .sol files are supported." };
  }
  if (file.size > MAX_SOL_BYTES) {
    return { ok: false, error: `File exceeds the 64KB limit (${file.size} bytes).` };
  }
  return { ok: true, file: { name: file.name, content: "" } };
}

/** Read a validated .sol file as text. */
export function readSolText(file: File): Promise<string> {
  return file.text();
}