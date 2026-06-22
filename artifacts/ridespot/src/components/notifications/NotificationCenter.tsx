
import { BellRing, CheckCheck, Flame, Info, TestTube2, X, Zap } from "lucide-react";
import { ModalSheet } from "@/components/app/ModalSheet";
import { notificationRepository } from "@/services/repositories";
import { useNotificationStore } from "@/store/notification-store";
import { cn } from "@/lib/utils";
import type { AppNotification, AppNotificationType } from "@/types";

function notificationTone(type: AppNotificationType) {
  if (type === "hotspot_alert") {
    return {
      icon: Flame,
      iconClassName: "bg-[#FFF1F1] text-[#E84142]"
    };
  }

  if (type === "surge_alert") {
    return {
      icon: Zap,
      iconClassName: "bg-[#ECFDF3] text-[#00A856]"
    };
  }

  if (type === "coverage_sufficient") {
    return {
      icon: CheckCheck,
      iconClassName: "bg-[#EFF6FF] text-[#1478FF]"
    };
  }

  if (type === "test") {
    return {
      icon: TestTube2,
      iconClassName: "bg-[#F4F6F8] text-[#111827]"
    };
  }

  return {
    icon: Info,
    iconClassName: "bg-[#F4F6F8] text-[#111827]"
  };
}

function formatNotificationTime(value: string) {
  const sentAt = new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - sentAt) / 1000));

  if (diffSeconds < 60) return "now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function NotificationRow({
  notification,
  onRead
}: {
  notification: AppNotification;
  onRead: (notification: AppNotification) => void;
}) {
  const tone = notificationTone(notification.type);
  const Icon = tone.icon;

  return (
    <button
      type="button"
      onClick={() => onRead(notification)}
      className="flex w-full gap-3 px-4 py-3 text-left"
    >
      <span
        className={cn(
          "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl",
          tone.iconClassName
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="text-[0.94rem] font-semibold leading-tight tracking-[-0.03em] text-ink">
            {notification.title}
          </span>
          <span className="shrink-0 text-[0.72rem] font-semibold leading-none text-[#98A2B3]">
            {formatNotificationTime(notification.sentAt)}
          </span>
        </span>
        <span className="mt-1 block text-[0.82rem] font-medium leading-snug text-[#667085]">
          {notification.body}
        </span>
      </span>
      {!notification.isRead ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-[#00A856]" />
      ) : null}
    </button>
  );
}

export function NotificationCenter() {
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const isOpen = useNotificationStore((state) => state.isOpen);
  const closeCenter = useNotificationStore((state) => state.closeCenter);
  const markReadLocal = useNotificationStore((state) => state.markReadLocal);
  const markAllReadLocal = useNotificationStore((state) => state.markAllReadLocal);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const handleRead = (notification: AppNotification) => {
    if (!notification.isRead) {
      markReadLocal(notification.id);
      void notificationRepository.markRead(notification.id).catch(() => undefined);
    }
  };

  const handleMarkAllRead = () => {
    markAllReadLocal();
    void notificationRepository.markAllRead().catch(() => undefined);
  };

  const handleTestNotification = () => {
    void notificationRepository
      .sendTestNotification()
      .then((notification) => addNotification(notification, { showPopup: true }))
      .catch(() => undefined);
  };

  return (
    <ModalSheet
      open={isOpen}
      onClose={closeCenter}
      panelClassName="max-h-[82vh] overflow-hidden"
    >
      <div className="flex max-h-[82vh] flex-col">
        <div className="flex items-center justify-between px-4 pb-3 pt-5">
          <div>
            <h2 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
              Notifications
            </h2>
            <p className="mt-1 text-[0.78rem] font-medium leading-none text-[#667085]">
              {unreadCount ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}` : "All caught up"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="rounded-full bg-[#F4F6F8] px-3 py-2 text-[0.72rem] font-semibold leading-none text-ink disabled:opacity-40"
              disabled={!unreadCount}
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={closeCenter}
              className="flex size-10 items-center justify-center rounded-full bg-[#F4F6F8] text-ink"
              aria-label="Close notifications"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="mx-4 rounded-3xl bg-[#0B0B0B] p-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-white/12">
              <BellRing className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9rem] font-semibold leading-tight tracking-[-0.03em]">
                Mobile-style alerts are active
              </p>
              <p className="mt-1 text-[0.76rem] font-medium leading-snug text-white/70">
                Demand, surge, and coverage updates appear here and as push notifications when enabled.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTestNotification}
            className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-[0.82rem] font-semibold text-ink"
          >
            Send test notification
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-5">
          {notifications.length ? (
            <div className="divide-y divide-[#EEF0F3]">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onRead={handleRead}
                />
              ))}
            </div>
          ) : (
            <div className="mx-4 rounded-3xl bg-[#F4F6F8] px-4 py-8 text-center">
              <BellRing className="mx-auto size-8 text-[#98A2B3]" />
              <p className="mt-3 text-[0.92rem] font-semibold tracking-[-0.03em] text-ink">
                No notifications yet
              </p>
              <p className="mt-1 text-[0.8rem] font-medium leading-snug text-[#667085]">
                Hotspot alerts, surge warnings, and coverage updates will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModalSheet>
  );
}
