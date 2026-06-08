"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallButtonProps {
  className?: string;
  variant?: "dark" | "light";
}

function isIosSafari() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(window.navigator.userAgent);
  return isIos && isSafari;
}

function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean(window.navigator.standalone))
  );
}

export function PwaInstallButton({ className, variant = "dark" }: PwaInstallButtonProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setFallbackOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed) {
    return null;
  }

  const handleInstall = async () => {
    if (!installPrompt) {
      setFallbackOpen(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
  };

  const isLight = variant === "light";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleInstall}
        className={cn(
          "inline-flex min-h-[3.8rem] w-full items-center justify-center gap-2 rounded-[0.85rem] px-7 text-[1rem] font-semibold transition lg:min-h-[3rem] lg:w-auto lg:min-w-[190px] lg:px-6 lg:text-[0.95rem]",
          isLight
            ? "bg-white text-ink hover:bg-white/90"
            : "bg-brand text-ink hover:bg-brand/90",
          className
        )}
        aria-haspopup={!installPrompt ? "dialog" : undefined}
      >
        <Download className="size-5" aria-hidden="true" />
        Install App
      </button>

      {fallbackOpen ? (
        <div
          role="dialog"
          aria-label="Install RideSpot"
          className="absolute left-0 z-30 mt-3 w-full min-w-[18rem] rounded-2xl border border-line bg-white p-4 text-left text-sm leading-5 text-ink shadow-[0_18px_40px_rgba(15,23,42,0.16)] lg:w-[22rem]"
        >
          <p className="font-semibold">Install RideSpot on your phone</p>
          <p className="mt-2 text-ink-muted">
            {isIosSafari()
              ? "Tap the Safari share button, then choose Add to Home Screen."
              : "Open your browser menu and choose Install app or Add to Home screen."}
          </p>
          <button
            type="button"
            onClick={() => setFallbackOpen(false)}
            className="mt-3 text-sm font-semibold text-brand"
          >
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}
