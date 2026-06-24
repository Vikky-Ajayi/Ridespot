

import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Flame, Zap } from "lucide-react";
import { useNotificationStore } from "@/store/notification-store";
import type { AppNotificationType } from "@/types";

function resolveIcon(type?: AppNotificationType) {
  if (type === "hotspot_alert") return Flame;
  if (type === "surge_alert") return Zap;
  return BellRing;
}

export function NotificationPopup() {
  const notification = useNotificationStore((state) => state.activePopup);
  const openCenter = useNotificationStore((state) => state.openCenter);
  const clearPopup = useNotificationStore((state) => state.clearPopup);
  const Icon = resolveIcon(notification?.type);

  return (
    <AnimatePresence>
      {notification ? (
        <motion.button
          type="button"
          key={notification.id}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 360, damping: 28 }}
          onClick={openCenter}
          onPointerLeave={clearPopup}
          className="fixed inset-x-0 top-4 z-[70] mx-auto flex w-[calc(100%-2rem)] max-w-[390px] items-start gap-3 rounded-[28px] border border-white/70 bg-white/95 p-3 text-left shadow-[0_18px_45px_rgba(15,23,42,0.24)] backdrop-blur-xl"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[18px] bg-[#0B0B0B] text-white">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                RideSpot
              </span>
              <span className="text-[0.7rem] font-semibold text-[#98A2B3]">now</span>
            </span>
            <span className="mt-1 block truncate text-[0.9rem] font-semibold leading-tight tracking-[-0.03em] text-ink">
              {notification.title}
            </span>
            <span className="mt-1 line-clamp-2 block text-[0.78rem] font-medium leading-snug text-[#667085]">
              {notification.body}
            </span>
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
