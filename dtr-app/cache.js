// cache.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// Two-layer cache:
//   • memory     — instant, survives screen navigation
//   • AsyncStorage — survives app restarts, cleared by TTL
// ─────────────────────────────────────────────────────────────

const PREFIX = 'dtr:cache:';

// In-memory store: key → { data, savedAt }
const mem = new Map();

// Default: a week/month DTR cache is valid for 5 minutes.
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

// ─── Read ────────────────────────────────────────────────────
// Returns the cached data if fresh, otherwise null.
export async function getCached(key, ttlMs = DEFAULT_TTL_MS) {
  // Memory hit?
  const memEntry = mem.get(key);
  if (memEntry && Date.now() - memEntry.savedAt < ttlMs) {
    return memEntry.data;
  }

  // Storage hit?
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw); // { data, savedAt }
      if (parsed && Date.now() - parsed.savedAt < ttlMs) {
        mem.set(key, parsed);          // promote to memory
        return parsed.data;
      }
      // Stale → clear it
      await AsyncStorage.removeItem(PREFIX + key);
    }
  } catch {
    // Storage failure shouldn't break the app
  }

  if (memEntry) mem.delete(key);       // drop stale memory entry
  return null;
}

// ─── Write ───────────────────────────────────────────────────
export async function setCached(key, data) {
  const entry = { data, savedAt: Date.now() };
  mem.set(key, entry);
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full / unavailable → memory cache still works
  }
}

// ─── Invalidate one or all ───────────────────────────────────
export async function invalidate(key) {
  mem.delete(key);
  try { await AsyncStorage.removeItem(PREFIX + key); } catch {}
}

export async function invalidateAll() {
  mem.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ourKeys = keys.filter((k) => k.startsWith(PREFIX));
    if (ourKeys.length) await AsyncStorage.multiRemove(ourKeys);
  } catch {}
}

// ─── In-flight dedupe ────────────────────────────────────────
// If two identical requests fire back-to-back, only one hits the server.
const inflight = new Map();

export function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}