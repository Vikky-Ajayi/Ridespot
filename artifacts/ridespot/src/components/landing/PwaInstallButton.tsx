"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallButtonProps {
  className?: string;
  placement?: "desktop-nav" | "mobile-menu";
}

function isIosBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
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

export function PwaInstallButton({
  className,
  placement = "desktop-nav"
}: PwaInstallButtonProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      setConfirmOpen(false);
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
      setConfirmOpen(false);
      setFallbackOpen(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
    setConfirmOpen(false);
  };

  const isMobileMenu = placement === "mobile-menu";

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 transition",
          isMobileMenu
            ? "text-lg font-medium text-ink hover:text-brand"
            : "text-sm text-ink-muted hover:text-ink",
          className
        )}
        aria-haspopup="dialog"
      >
        <Download className={isMobileMenu ? "size-5" : "size-4"} aria-hidden="true" />
        Install App
      </button>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm RideSpot installation"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
        >
          <div className="w-full max-w-[22rem] rounded-[1.5rem] bg-white p-5 text-left text-ink shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[1.15rem] font-semibold leading-none tracking-[-0.03em]">
                  Install RideSpot?
                </p>
                <p className="mt-3 text-sm leading-5 text-ink-muted">
                  RideSpot will install on this device so you can open it like a
                  mobile app from your home screen.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close install confirmation"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f5f7] text-ink-muted transition hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#eef0f4] px-4 text-sm font-semibold text-ink transition hover:bg-[#e3e6eb]"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-4 text-sm font-semibold text-ink transition hover:bg-brand/90"
              >
                Yes, install
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fallbackOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install RideSpot instructions"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
        >
          <div className="w-full max-w-[22rem] rounded-[1.5rem] bg-white p-5 text-left text-ink shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[1.15rem] font-semibold leading-none tracking-[-0.03em]">
                  Install from your browser
                </p>
                <p className="mt-3 text-sm leading-5 text-ink-muted">
                  {isIosBrowser()
                    ? "This browser does not allow websites to start installation directly. Tap Share, then choose Add to Home Screen."
                    : "This browser has not made direct installation available yet. Use the browser menu and choose Install app or Add to Home screen."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setFallbackOpen(false)}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f5f7] text-ink-muted transition hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFallbackOpen(false)}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink-soft"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
