// PRD §4.5 — prompt-injection guard.
// All user-supplied content is wrapped in delimiter tags before it enters any
// prompt. Prompt templates must instruct the model to treat content within
// these tags as data only, not instructions.

export const USER_CONTENT_OPEN = "<<USER_CONTENT>>";
export const USER_CONTENT_CLOSE = "<</USER_CONTENT>>";

/** Wrap raw user content in delimiter tags so the LLM treats it as data. */
export function wrapUserContent(content: string): string {
  return `${USER_CONTENT_OPEN}\n${content}\n${USER_CONTENT_CLOSE}`;
}