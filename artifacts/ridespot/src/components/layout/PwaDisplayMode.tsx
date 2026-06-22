
import { useEffect } from "react";

function isInstalledDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const isIosStandalone = Boolean(navigatorWithStandalone.standalone);
  const matchesStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const matchesFullscreen = window.matchMedia?.("(display-mode: fullscreen)").matches;

  return Boolean(isIosStandalone || matchesStandalone || matchesFullscreen);
}

export function PwaDisplayMode() {
  useEffect(() => {
    const root = document.documentElement;
    const syncDisplayMode = () => {
      if (isInstalledDisplayMode()) {
        root.dataset.ridespotStandalone = "true";
      } else {
        delete root.dataset.ridespotStandalone;
      }
    };

    syncDisplayMode();

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const fullscreenQuery = window.matchMedia?.("(display-mode: fullscreen)");

    standaloneQuery?.addEventListener("change", syncDisplayMode);
    fullscreenQuery?.addEventListener("change", syncDisplayMode);

    return () => {
      standaloneQuery?.removeEventListener("change", syncDisplayMode);
      fullscreenQuery?.removeEventListener("change", syncDisplayMode);
      delete root.dataset.ridespotStandalone;
    };
  }, []);

  return null;
}
