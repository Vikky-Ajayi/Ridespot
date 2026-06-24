"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, MapPin, Users } from "lucide-react";
import { AdminEmptyState, AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { adminRepository, type OnlineDriver } from "@/services/repositories/admin.repository";

function formatLastSeen(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<OnlineDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDrivers() {
      setLoading(true);
      try {
        const response = await adminRepository.getOnlineDrivers();
        if (!cancelled) {
          setDrivers(response);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load online drivers. Check that the backend is running.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDrivers();
    const interval = window.setInterval(loadDrivers, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const planCounts = useMemo(
    () =>
      drivers.reduce<Record<string, number>>((acc, driver) => {
        acc[driver.planTier] = (acc[driver.planTier] ?? 0) + 1;
        return acc;
      }, {}),
    [drivers]
  );

  return (
    <AdminShell
      title="Online Drivers"
      subtitle="Monitor live driver positions and zone coverage membership."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetricCard label="Online now" value={drivers.length} icon={Users} tone="success" />
        <AdminMetricCard label="Pro or fleet" value={(planCounts.pro ?? 0) + (planCounts.fleet ?? 0)} />
        <AdminMetricCard label="Covering zones" value={drivers.filter((driver) => driver.zonesIn.length).length} />
      </div>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white">
        <div className="flex items-center justify-between border-b border-[#E4E7EC] px-4 py-3">
          <h2 className="text-sm font-bold">Live driver table</h2>
          <span className="text-xs font-semibold text-[#667085]">
            Refreshes every 30 seconds
          </span>
        </div>

        {error ? (
          <div className="p-5 text-sm font-semibold text-danger">{error}</div>
        ) : loading ? (
          <div className="p-5 text-sm font-semibold text-[#667085]">Loading drivers</div>
        ) : drivers.length === 0 ? (
          <div className="p-4">
            <AdminEmptyState
              title="No online drivers"
              body="Drivers will appear here once their app starts sending GPS pings."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-[#F9FAFB] text-xs font-bold uppercase text-[#667085]">
                <tr>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Zones in</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC]">
                {drivers.map((driver) => (
                  <tr key={driver.id}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold">{driver.fullName}</p>
                      <p className="text-xs font-medium text-[#667085]">{driver.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[#F2F4F7] px-2 py-1 text-xs font-bold uppercase text-[#344054]">
                        {driver.planTier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#344054]">
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="size-4 text-brand-deep" />
                        {driver.location.lat.toFixed(4)}, {driver.location.lng.toFixed(4)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">{driver.zonesIn.length}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#344054]">
                      <span className="inline-flex items-center gap-2">
                        <Clock className="size-4 text-[#98A2B3]" />
                        {formatLastSeen(driver.lastSeen)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
