// IndexedDB persistence for chat threads (R10 F3). One object store `sessions`
// keyed by `sessionId`, holding the full Thread (UiMessage[] incl.
// meta / auditReport / walletProfile / hitl) so a reload reproduces the rich
// views — not just the minimal StoredMessage. API keys stay in sessionStorage
// (never unified with threads). All calls are best-effort: a failure (private
// mode, quota) silently falls back to in-memory-only operation.

import type { Thread } from "../stores/chatStore";

const DB_NAME = "hexpert";
const DB_VERSION = 1;
const STORE = "sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("openDB failed"));
  });
}

/** Load every persisted thread, newest activity first. */
export async function loadAllSessions(): Promise<Thread[]> {
  const db = await openDB();
  try {
    return await new Promise<Thread[]>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as Thread[];
        resolve(rows.sort((a, b) => b.lastActivity - a.lastActivity));
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Upsert a thread by sessionId. */
export async function saveSession(thread: Thread): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const req = t.objectStore(STORE).put(thread);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Delete a thread by sessionId. */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const req = t.objectStore(STORE).delete(sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}