import { useSyncExternalStore } from "react";
import { setDataChangeCallback } from "@/data/mockData";

/**
 * Lightweight reactive data layer.
 * After any call to persistData(), all components using useDataRefresh() re-render.
 */

let version = 0;
const listeners = new Set<() => void>();

function emitDataRefresh() {
  version++;
  listeners.forEach(fn => fn());
}

// Wire into persistData automatically
setDataChangeCallback(emitDataRefresh);

export { emitDataRefresh };

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return version;
}

/**
 * Hook that forces re-render whenever persistData() is called.
 */
export function useDataRefresh(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
