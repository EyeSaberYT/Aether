/**
 * `useState` that keeps its value in localStorage.
 *
 * For preferences that only affect presentation and never need to reach the
 * backend — layout choices, sort order, panel widths — so they survive a
 * restart without a round trip.
 */
import { useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      // A missing key is the common case. A malformed one falls through to the
      // catch below, so a bad value can never take the screen down.
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // A full or unavailable store only costs us the preference.
    }
  }, [key, value]);

  return [value, setValue];
}
