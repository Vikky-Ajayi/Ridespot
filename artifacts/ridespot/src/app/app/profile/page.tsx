

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  CircleHelp,
  Flame,
  LogOut,
  LockKeyhole,
  Mail,
  Moon
} from "lucide-react";
import { useLocation } from "wouter";
import { DesktopShell } from "@/components/app/DesktopShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { NotificationToggle } from "@/components/profile/NotificationToggle";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { withPreviewParam } from "@/lib/appPreview";
import { paymentRepository, profileRepository } from "@/services/repositories";
import { useModalStore } from "@/store/modal-store";
import { useProfileStore } from "@/store/profile-store";
import type { AuthUser, Profile } from "@/types";
import { cn } from "@/lib/utils";

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-4 text-[0.84rem] font-medium uppercase tracking-[0.06em] text-[#6B7280]">
      {children}
    </p>
  );
}

function Row({
  icon,
  title,
  subtitle,
  right,
  onClick,
  asDiv,
  className
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
  asDiv?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <span className="flex size-10 items-center justify-center rounded-full bg-[#F5F6F8] text-[#111827]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.12rem] font-bold text-ink">{title}</span>
        {subtitle ? (
          <span className="mt-1 block text-[0.9rem] font-medium text-[#6B7280]">{subtitle}</span>
        ) : null}
      </span>
      {right}
    </>
  );

  if (asDiv) {
    return (
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(event) => {
          if (!onClick) {
            return;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        className={cn("flex w-full items-center gap-3 px-4 py-4 text-left", className)}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 px-4 py-4 text-left", className)}
    >
      {content}
    </button>
  );
}

function profileFromAuthUser(user: AuthUser | null): Profile | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    country: user.country ?? null,
    avatarUrl: user.avatarUrl ?? null,
    planTier: user.planTier,
    isEmailVerified: user.isEmailVerified ?? false,
    notificationPreferences: {
      mailNotifications: true,
      demandNotifications: false,
      nightModeAlerts: false
    }
  };
}

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const searchParams = useLocationSearchParams();
  const preview = searchParams.get("preview") === "app";
  const { user, login, syncUser } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const openSubscription = useModalStore((state) => state.openSubscription);
  const openLogout = useModalStore((state) => state.openLogout);
  const mailNotifications = useProfileStore((state) => state.mailNotifications);
  const demandNotifications = useProfileStore((state) => state.demandNotifications);
  const nightModeAlerts = useProfileStore((state) => state.nightModeAlerts);
  const setPreferences = useProfileStore((state) => state.setPreferences);

  useEffect(() => {
    let cancelled = false;

    profileRepository
      .getProfile()
      .then((nextProfile) => {
        if (cancelled) {
          return;
        }

        setProfile(nextProfile);
        setPreferences(nextProfile.notificationPreferences);

        if (user) {
          syncUser({
            ...user,
            fullName: nextProfile.fullName,
            email: nextProfile.email,
            phone: nextProfile.phone ?? null,
            country: nextProfile.country ?? null,
            avatarUrl: nextProfile.avatarUrl ?? null,
            planTier: nextProfile.planTier,
            isEmailVerified: nextProfile.isEmailVerified
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          const authProfile = profileFromAuthUser(user);
          setProfile(authProfile);

          if (authProfile) {
            setPreferences(authProfile.notificationPreferences);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setPreferences, syncUser, user]);

  useEffect(() => {
    if (searchParams.get("payment") !== "success") {
      return;
    }

    let cancelled = false;

    paymentRepository
      .getStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        login({ token: status.token, user: status.driver });
        showToast({ title: "Subscription updated", variant: "success" });
      })
      .catch(() => {
        if (!cancelled) {
          showToast({ title: "Unable to refresh subscription", variant: "alert" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [login, searchParams, showToast]);

  const activeProfile = profile ?? profileFromAuthUser(user);
  const activePlanLabel =
    activeProfile?.planTier === "fleet"
      ? "Fleet Plan"
      : activeProfile?.planTier === "pro"
        ? "Pro Plan"
        : "Free Plan";

  const notificationState = useMemo(
    () => ({
      mailNotifications,
      demandNotifications,
      nightModeAlerts
    }),
    [demandNotifications, mailNotifications, nightModeAlerts]
  );

  const persistNotificationPreferences = async (nextState: typeof notificationState) => {
    setPreferences(nextState);

    try {
      await profileRepository.updateNotificationPreferences(nextState);
    } catch {
      setPreferences(notificationState);
    }
  };

  const toPreviewHref = (href: string) => withPreviewParam(href, preview);

  return (
    <DesktopShell className="bg-[#F7F8FA]">
      <div className="flex h-full min-h-0 flex-col bg-[#F7F8FA] pb-[76px]">
        <AppHeader variant="profile" />

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-5 pt-4">
          <ProfileCard
            name={activeProfile?.fullName || user?.fullName || "Your profile"}
            email={activeProfile?.email || user?.email || ""}
            onEdit={() => navigate(toPreviewHref("/app/profile/edit"))}
          />

          <div className="space-y-4">
            <SectionLabel>Account</SectionLabel>
            <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
              <Row
                icon={<Mail className="size-5" />}
                title={
                  <span>
                    Subscription
                    <span className="font-medium text-[#6B7280]"> - {activePlanLabel}</span>
                  </span>
                }
                onClick={openSubscription}
                right={
                  <span className="flex items-center gap-3">
                    <span className="rounded-full bg-[#E9F9EF] px-3 py-1 text-[0.95rem] font-semibold text-[#00A856]">
                      Upgrade
                    </span>
                    <ChevronRight className="size-5 text-[#6B7280]" />
                  </span>
                }
              />
              <div className="mx-4 h-px bg-[#E7E8EC]" />
              <Row
                icon={<LockKeyhole className="size-5" />}
                title="Change Password"
                onClick={() => navigate(toPreviewHref("/app/profile/password"))}
                right={<ChevronRight className="size-5 text-[#6B7280]" />}
              />
            </div>
          </div>

          <div className="space-y-4">
            <SectionLabel>Notification Settings</SectionLabel>
            <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
              <Row
                icon={<Mail className="size-5" />}
                title="Mail notifications"
                subtitle="Choose if you want notifications by email"
                asDiv
                onClick={() =>
                  void persistNotificationPreferences({
                    ...notificationState,
                    mailNotifications: !mailNotifications
                  })
                }
                right={
                  <NotificationToggle
                    checked={mailNotifications}
                    onChange={() =>
                      void persistNotificationPreferences({
                        ...notificationState,
                        mailNotifications: !mailNotifications
                      })
                    }
                  />
                }
              />
              <div className="mx-4 h-px bg-[#E7E8EC]" />
              <Row
                icon={<Flame className="size-5" />}
                title="Demand Notifications"
                subtitle="Alert when new hotspot activates"
                asDiv
                onClick={() =>
                  void persistNotificationPreferences({
                    ...notificationState,
                    demandNotifications: !demandNotifications
                  })
                }
                right={
                  <NotificationToggle
                    checked={demandNotifications}
                    onChange={() =>
                      void persistNotificationPreferences({
                        ...notificationState,
                        demandNotifications: !demandNotifications
                      })
                    }
                  />
                }
              />
              <div className="mx-4 h-px bg-[#E7E8EC]" />
              <Row
                icon={<Moon className="size-5" />}
                title="Night Mode Alerts"
                subtitle="Alerts during late-night hours"
                asDiv
                onClick={() =>
                  void persistNotificationPreferences({
                    ...notificationState,
                    nightModeAlerts: !nightModeAlerts
                  })
                }
                right={
                  <NotificationToggle
                    checked={nightModeAlerts}
                    onChange={() =>
                      void persistNotificationPreferences({
                        ...notificationState,
                        nightModeAlerts: !nightModeAlerts
                      })
                    }
                  />
                }
              />
            </div>
          </div>

          <div className="space-y-4">
            <SectionLabel>More</SectionLabel>
            <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
              <Row
                icon={<CircleHelp className="size-5" />}
                title="FAQs"
                onClick={() => navigate("/#faq")}
                right={<ChevronRight className="size-5 text-[#6B7280]" />}
              />
              <div className="mx-4 h-px bg-[#E7E8EC]" />
              <Row
                icon={<LogOut className="size-5 text-[#EF4444]" />}
                title={<span className="text-[#EF4444]">Log Out</span>}
                onClick={openLogout}
                right={<ChevronRight className="size-5 text-[#6B7280]" />}
              />
            </div>
          </div>
        </div>

        <BottomNav active="profile" />
      </div>
    </DesktopShell>
  );
}
