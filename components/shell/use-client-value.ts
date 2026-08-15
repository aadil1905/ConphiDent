"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * A value only the browser can know — the clock, the platform — without a
 * mounted flag and the cascading render that comes with it. `serverValue` is
 * what the server render and the hydration pass both use.
 *
 * `read` must return a stable value (a primitive, or a memoised object).
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noSubscribe, read, () => serverValue);
}
