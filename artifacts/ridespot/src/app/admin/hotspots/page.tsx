

import { useEffect, useMemo, useState } from "react";
import { Flame, Gauge, ShieldCheck } from "lucide-react";
import { AdminEmptyState, AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { adminRepository, type AdminHotspot } from "@/services/repositories/admin.repository";
import { getDemandColor } from "@/lib/demandColors";

function coveragePercent(hotspot: AdminHotspot) {
  return Math.min(100, Math.round((hotspot.drivers_in_zone / Math.max(hotspot.drivers_needed, 1)) * 100));
}

export default function AdminHotspotsPage() {
  const [hotspots, setHotspots] = useState<AdminHotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHotspots() {
      setLoading(true);
      try {
        const response = await adminRepository.getActiveHotspots();
        if (!cancelled) {
          setHotspots(response);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load active hotspots. Check that the backend is running.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHotspots();
    const interval = window.setInterval(loadHotspots, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const coveredCount = useMemo(
    () => hotspots.filter((hotspot) => hotspot.isCovered).length,
    [hotspots]
  );

  return (
    <AdminShell
      title="Active Hotspots"
      subtitle="Track live demand zones, coverage health, and driver supply."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetricCard label="Active zones" value={hotspots.length} icon={Flame} />
        <AdminMetricCard label="Covered zones" value={coveredCount} icon={ShieldCheck} tone="success" />
        <AdminMetricCard
          label="Under-covered"
          value={hotspots.length - coveredCount}
          icon={Gauge}
          tone={hotspots.length - coveredCount > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {error ? (
          <div className="rounded-lg border border-danger-soft bg-danger-soft p-6 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#667085]">
            Loading hotspots
          </div>
        ) : hotspots.length === 0 ? (
          <AdminEmptyState
            title="No active hotspots"
            body="Hotspots will appear after the refresh worker generates predictions from active events."
          />
        ) : (
          hotspots.map((hotspot) => {
            const demand = getDemandColor(hotspot.demand_level);
            const percent = coveragePercent(hotspot);

            return (
              <section key={hotspot.id} className="rounded-lg border border-[#E4E7EC] bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#667085]">
                      {hotspot.city ?? "Unknown city"} / {hotspot.country ?? "Unknown market"}
                    </p>
                    <h2 className="mt-1 text-lg font-bold">{hotspot.name}</h2>
                  </div>
                  <span
                    className="rounded-md px-2 py-1 text-xs font-bold"
                    style={{ backgroundColor: demand.badge, color: demand.text }}
                  >
                    {demand.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-[#F9FAFB] p-3">
                    <p className="text-xs font-bold text-[#667085]">Demand score</p>
                    <p className="mt-1 text-2xl font-bold">{Math.round(hotspot.demand_score)}</p>
                  </div>
                  <div className="rounded-lg bg-[#F9FAFB] p-3">
                    <p className="text-xs font-bold text-[#667085]">Drivers</p>
                    <p className="mt-1 text-2xl font-bold">
                      {hotspot.drivers_in_zone}/{hotspot.drivers_needed}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#F9FAFB] p-3">
                    <p className="text-xs font-bold text-[#667085]">Radius</p>
                    <p className="mt-1 text-2xl font-bold">{hotspot.radius_meters}m</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs font-bold text-[#667085]">
                    <span>Coverage</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#EAECF0]">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <p className="mt-4 text-sm font-medium leading-6 text-[#667085]">
                  {hotspot.insight_text ?? "No insight text available yet."}
                </p>
              </section>
            );
          })
        )}
      </div>
    </AdminShell>
  );
}
