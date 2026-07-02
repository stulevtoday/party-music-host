import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Device, RequestHistoryEntry, Track } from "./types.js";

const RATE_LIMIT_MS = 5000;

/**
 * In-memory storage for devices, votes metadata and request history.
 * History is additionally appended to a JSONL file so it survives restarts.
 */
export class Store {
  private devices = new Map<string, Device>();
  private lastRequestAt = new Map<string, number>();
  readonly history: RequestHistoryEntry[] = [];
  private historyFile: string | null;

  constructor(dataDir: string | null = null) {
    if (dataDir) {
      mkdirSync(dataDir, { recursive: true });
      this.historyFile = path.join(dataDir, "history.jsonl");
    } else {
      this.historyFile = null;
    }
  }

  touchDevice(deviceId: string, name = ""): void {
    const existing = this.devices.get(deviceId);
    this.devices.set(deviceId, {
      deviceId,
      name: name || existing?.name || "",
      lastSeenAt: Date.now()
    });
  }

  get deviceList(): Device[] {
    return [...this.devices.values()];
  }

  /** Rate limit: at most one request per RATE_LIMIT_MS per device. */
  canRequest(deviceId: string): boolean {
    const last = this.lastRequestAt.get(deviceId) ?? 0;
    return Date.now() - last >= RATE_LIMIT_MS;
  }

  recordRequest(track: Track, deviceId: string, requestedBy: string, accepted: boolean, reason?: string): void {
    if (accepted) this.lastRequestAt.set(deviceId, Date.now());
    const entry: RequestHistoryEntry = {
      track,
      deviceId,
      requestedBy,
      requestedAt: Date.now(),
      accepted,
      ...(reason ? { reason } : {})
    };
    this.history.push(entry);
    if (this.historyFile) {
      try {
        appendFileSync(this.historyFile, JSON.stringify(entry) + "\n");
      } catch {
        // history persistence is best-effort
      }
    }
  }
}
