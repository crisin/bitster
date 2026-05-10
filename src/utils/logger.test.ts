import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("expo-file-system", () => ({
  Paths: { cache: "/tmp/" },
  File: vi.fn().mockImplementation(() => ({ uri: "/tmp/test.log", text: "" })),
}));
vi.mock("expo-sharing", () => ({
  shareAsync: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { log, interceptConsole, restoreConsole } from "./logger";

beforeEach(() => {
  log.clear();
  log.setMinLevel("debug");
});

describe("log", () => {
  it("stores entries in the buffer", () => {
    log.info("Test", "hello");
    expect(log.getEntries()).toHaveLength(1);
    expect(log.getEntries()[0].message).toBe("hello");
    expect(log.getEntries()[0].tag).toBe("Test");
    expect(log.getEntries()[0].level).toBe("info");
  });

  it("stores all log levels", () => {
    log.debug("T", "d");
    log.info("T", "i");
    log.warn("T", "w");
    log.error("T", "e");
    expect(log.getEntries()).toHaveLength(4);
    expect(log.getEntries().map((e) => e.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
  });

  it("respects min level", () => {
    log.setMinLevel("warn");
    log.debug("T", "d");
    log.info("T", "i");
    log.warn("T", "w");
    log.error("T", "e");
    expect(log.getEntries()).toHaveLength(2);
  });

  it("caps at MAX_ENTRIES", () => {
    for (let i = 0; i < 2100; i++) {
      log.info("T", `msg-${i}`);
    }
    expect(log.getEntries()).toHaveLength(2000);
    expect(log.getEntries()[0].message).toBe("msg-100");
  });

  it("clears the buffer", () => {
    log.info("T", "hello");
    log.clear();
    expect(log.getEntries()).toHaveLength(0);
  });

  it("includes data in dump", () => {
    log.info("T", "with data", { key: "value" });
    const dump = log.dump();
    expect(dump).toContain('{"key":"value"}');
  });

  it("handles unserializable data gracefully", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    log.info("T", "circular", circular);
    const dump = log.dump();
    expect(dump).toContain("[unserializable]");
  });

  it("dump formats entries as lines", () => {
    log.info("P2P", "connected");
    log.error("Spotify", "token expired");
    const lines = log.dump().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("[P2P]");
    expect(lines[0]).toContain("connected");
    expect(lines[1]).toContain("[Spotify]");
    expect(lines[1]).toContain("ERROR");
  });
});

describe("interceptConsole", () => {
  it("captures console.log calls", () => {
    interceptConsole();
    console.log("intercepted message");
    restoreConsole();
    const entries = log.getEntries();
    const found = entries.find((e) => e.message.includes("intercepted message"));
    expect(found).toBeDefined();
    expect(found!.tag).toBe("console");
  });

  it("captures console.error calls", () => {
    interceptConsole();
    console.error("error message");
    restoreConsole();
    const found = log.getEntries().find((e) => e.message.includes("error message"));
    expect(found).toBeDefined();
    expect(found!.level).toBe("error");
  });
});
