import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

const MAX_ENTRIES = 2000;
const buffer: LogEntry[] = [];

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = "debug";

function now(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function push(level: LogLevel, tag: string, message: string, data?: unknown) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const entry: LogEntry = { timestamp: now(), level, tag, message, data };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }

  // Also output to browser console for real-time debugging
  const formatted = formatEntry(entry);
  const consoleFn = level === "error" ? originalConsole.error
    : level === "warn" ? originalConsole.warn
    : level === "debug" ? originalConsole.debug
    : originalConsole.log;
  consoleFn(formatted);
}

function formatEntry(e: LogEntry): string {
  const lvl = e.level.toUpperCase().padEnd(5);
  const base = `${e.timestamp} ${lvl} [${e.tag}] ${e.message}`;
  if (e.data === undefined) return base;
  try {
    return `${base} ${JSON.stringify(e.data)}`;
  } catch {
    return `${base} [unserializable]`;
  }
}

export const log = {
  debug: (tag: string, message: string, data?: unknown) =>
    push("debug", tag, message, data),
  info: (tag: string, message: string, data?: unknown) =>
    push("info", tag, message, data),
  warn: (tag: string, message: string, data?: unknown) =>
    push("warn", tag, message, data),
  error: (tag: string, message: string, data?: unknown) =>
    push("error", tag, message, data),

  setMinLevel: (level: LogLevel) => {
    minLevel = level;
  },

  getEntries: (): readonly LogEntry[] => buffer,

  clear: () => {
    buffer.length = 0;
  },

  dump: (): string => buffer.map(formatEntry).join("\n"),

  exportToFile: async (): Promise<void> => {
    const content = buffer.map(formatEntry).join("\n");
    const filename = `hitster-log-${Date.now()}.log`;

    if (Platform.OS === "web") {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const file = new File(Paths.cache, filename);
    file.create();
    file.write(content);
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/plain",
      dialogTitle: "Export Logs",
    });
  },
};

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

export function interceptConsole() {
  console.log = (...args: unknown[]) => {
    push("info", "console", args.map(String).join(" "));
    originalConsole.log(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", "console", args.map(String).join(" "));
    originalConsole.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    push("error", "console", args.map(String).join(" "));
    originalConsole.error(...args);
  };
  console.debug = (...args: unknown[]) => {
    push("debug", "console", args.map(String).join(" "));
    originalConsole.debug(...args);
  };
}

export function restoreConsole() {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}
