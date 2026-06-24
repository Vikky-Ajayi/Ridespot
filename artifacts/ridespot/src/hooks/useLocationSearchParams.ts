

import { useMemo, useSyncExternalStore } from "react";

const LOCATION_CHANGE_EVENT = "ridespot:location-change";

let historyPatched = false;

function patchHistoryEvents() {
  if (historyPatched || typeof window === "undefined") {
    return;
  }

  historyPatched = true;

  const wrapHistoryMethod = (method: "pushState" | "replaceState") => {
    const original = window.history[method];

    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  patchHistoryEvents();

  window.addEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("popstate", onStoreChange);

  return () => {
    window.removeEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

function getSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function useLocationSearchParams() {
  const search = useSyncExternalStore(subscribe, getSnapshot, () => "");

  return useMemo(() => new URLSearchParams(search), [search]);
}
