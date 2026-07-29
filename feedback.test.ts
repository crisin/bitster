import { describe, expect, it } from "vitest";
import {
  applySubmission,
  MAX_ENTRIES,
  publicView,
  toggleVote,
  validateSubmission,
} from "./feedback.js";

const GOOD = {
  type: "idea",
  title: "More cowbell",
  body: "The reveal needs cowbell.",
  author: "krille",
  voterId: "device:abc",
};

function entryOf(over: Record<string, unknown> = {}) {
  const submitted = applySubmission(
    [],
    validateSubmission({ ...GOOD, ...over }) as never,
    "id-1",
    1_000,
  );
  return submitted!;
}

describe("validateSubmission", () => {
  it("cleans a good submission", () => {
    const result = validateSubmission({ ...GOOD, title: "  More cowbell  " });
    expect(result).toEqual(GOOD);
  });

  it.each([
    ["garbage", "nope"],
    ["a wrong type", { ...GOOD, type: "rant" }],
    ["a too-short title", { ...GOOD, title: "ab" }],
    ["a too-long title", { ...GOOD, title: "x".repeat(81) }],
    ["a too-long body", { ...GOOD, body: "x".repeat(501) }],
    ["a missing voter id", { ...GOOD, voterId: undefined }],
    ["an oversized voter id", { ...GOOD, voterId: "x".repeat(65) }],
  ])("rejects %s with a reason", (_label, raw) => {
    expect(typeof validateSubmission(raw)).toBe("string");
  });
});

describe("applySubmission", () => {
  it("appends with the author's own vote included", () => {
    const entries = entryOf();
    expect(entries).toHaveLength(1);
    expect(entries[0].voters).toEqual(["device:abc"]);
    expect(entries[0].createdAt).toBe(1_000);
  });

  it("refuses when the board is full", () => {
    const full = Array.from({ length: MAX_ENTRIES }, (_, i) => ({
      ...entryOf()[0],
      id: `e${i}`,
    }));
    expect(
      applySubmission(full, validateSubmission(GOOD) as never, "x", 2),
    ).toBeNull();
  });
});

describe("toggleVote", () => {
  it("adds, removes, and stays idempotent per voter", () => {
    let entries = entryOf();
    entries = toggleVote(entries, "id-1", "device:other")!;
    expect(entries[0].voters).toHaveLength(2);
    // Same voter again = un-vote, not a second vote
    entries = toggleVote(entries, "id-1", "device:other")!;
    expect(entries[0].voters).toEqual(["device:abc"]);
  });

  it("returns null for an unknown entry", () => {
    expect(toggleVote(entryOf(), "ghost", "device:x")).toBeNull();
  });
});

describe("publicView", () => {
  it("shows counts and the caller's own flag, never the voter list", () => {
    const entries = toggleVote(entryOf(), "id-1", "device:other")!;
    const view = publicView(entries, "device:other");
    expect(view[0].votes).toBe(2);
    expect(view[0].mine).toBe(true);
    expect("voters" in view[0]).toBe(false);
    expect(publicView(entries, "device:stranger")[0].mine).toBe(false);
  });

  it("sorts by votes, then recency", () => {
    let entries = entryOf();
    entries = applySubmission(
      entries,
      validateSubmission({ ...GOOD, title: "Newer but unloved" }) as never,
      "id-2",
      2_000,
    )!;
    entries = toggleVote(entries, "id-1", "device:other")!;
    const view = publicView(entries, "");
    expect(view.map((e: { id: string }) => e.id)).toEqual(["id-1", "id-2"]);
  });
});
