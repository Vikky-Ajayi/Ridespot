
import { Link } from "wouter";
import { useLocation } from "wouter";
import { useEffect, type ReactNode } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  Flame,
  LogOut,
  MapPinned,
  RadioTower,
  Settings2,
  Users,
  type LucideIcon
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";
import { useAdminAuthStore } from "@/store/admin-auth-store";

const navItems = [
  { href: "/admin/hotspots", label: "Hotspots", icon: Flame },
  { href: "/admin/drivers", label: "Drivers", icon: Users },
  { href: "/admin/config/markets", label: "Markets", icon: Settings2 },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/ml", label: "ML Status", icon: Activity }
];

export interface AdminShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  action?: ReactNode;
}

export function AdminShell({ title, subtitle, children, action }: AdminShellProps) {
  const [pathname, setLocation] = useLocation();
  const token = useAdminAuthStore((state) => state.token);
  const admin = useAdminAuthStore((state) => state.admin);
  const hydrated = useAdminAuthStore((state) => state.hydrated);
  const logout = useAdminAuthStore((state) => state.logout);

  useEffect(() => {
    if (hydrated && !token) {
      setLocation("/admin/login");
    }
  }, [hydrated, router, token]);

  if (!hydrated || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F6F8] text-sm font-semibold text-[#667085]">
        Loading admin session
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F6F8] text-ink">
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[276px] border-r border-[#E4E7EC] bg-white px-5 py-5 lg:block">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between">
              <Logo href="/admin/hotspots" />
              <span className="rounded-md bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">
                Admin
              </span>
            </div>

            <nav className="mt-8 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#667085]",
                      active && "bg-ink text-white"
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">
                  {admin?.name?.charAt(0) ?? "A"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{admin?.name ?? "Admin"}</p>
                  <p className="truncate text-xs font-medium text-[#667085]">{admin?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setLocation("/admin/login");
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-[#344054] ring-1 ring-[#E4E7EC]"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 lg:pl-[276px]">
          <header className="sticky top-0 z-20 border-b border-[#E4E7EC] bg-white/95 px-4 pb-4 pwa-safe-top backdrop-blur md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 lg:hidden">
                  <Logo href="/admin/hotspots" />
                  <span className="rounded-md bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">
                    Admin
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-bold md:mt-0">{title}</h1>
                <p className="mt-1 text-sm font-medium text-[#667085]">{subtitle}</p>
              </div>
              {action ? <div className="w-full md:w-auto [&>button]:w-full md:[&>button]:w-auto">{action}</div> : null}
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-bold text-[#667085]",
                      active && "border-ink bg-ink text-white"
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </header>

          <div className="px-4 py-6 md:px-8">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function AdminMetricCard({
  label,
  value,
  icon: Icon = RadioTower,
  tone = "default"
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#667085]">{label}</p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone === "success" && "bg-success-soft text-success",
            tone === "danger" && "bg-danger-soft text-danger",
            tone === "default" && "bg-[#F2F4F7] text-[#344054]"
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

export function AdminEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#D0D5DD] bg-white p-8 text-center">
      <MapPinned className="mx-auto size-8 text-[#98A2B3]" />
      <p className="mt-3 text-sm font-bold">{title}</p>
      <p className="mt-1 text-sm font-medium text-[#667085]">{body}</p>
    </div>
  );
}
