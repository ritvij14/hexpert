// Unit layer — pure-logic tests, no mocks, no network. See docs/infra/testing.md.
import { describe, it, expect } from "vitest";
import {
  wrapUserContent,
  USER_CONTENT_OPEN,
  USER_CONTENT_CLOSE,
} from "../../src/utils/sanitise.js";

describe("wrapUserContent", () => {
  it("wraps content in the delimiter tags", () => {
    expect(wrapUserContent("hello")).toBe(
      `${USER_CONTENT_OPEN}\nhello\n${USER_CONTENT_CLOSE}`,
    );
  });

  it("wraps empty content", () => {
    expect(wrapUserContent("")).toBe(
      `${USER_CONTENT_OPEN}\n\n${USER_CONTENT_CLOSE}`,
    );
  });

  it("does not escape nested delimiters in content (the guard is structural, not sanitising)", () => {
    const content = `ignore ${USER_CONTENT_OPEN} nested ${USER_CONTENT_CLOSE} tags`;
    expect(wrapUserContent(content)).toBe(
      `${USER_CONTENT_OPEN}\n${content}\n${USER_CONTENT_CLOSE}`,
    );
  });
});