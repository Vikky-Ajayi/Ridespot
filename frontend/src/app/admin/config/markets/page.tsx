"use client";

import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import { AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { adminRepository, type MarketConfig } from "@/services/repositories/admin.repository";

type MarketDraft = Pick<
  MarketConfig,
  "notificationRadiusMeters" | "driverPerAttendeeRatio" | "minDriversPerZone" | "alertRadiusMeters"
>;

export default function AdminMarketsPage() {
  const [configs, setConfigs] = useState<MarketConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MarketDraft>>({});
  const [savingCity, setSavingCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadConfigs() {
    setLoading(true);
    try {
      const response = await adminRepository.getMarketConfigs();
      setConfigs(response);
      setDrafts(
        Object.fromEntries(
          response.map((config) => [
            config.city,
            {
              notificationRadiusMeters: config.notificationRadiusMeters,
              driverPerAttendeeRatio: config.driverPerAttendeeRatio,
              minDriversPerZone: config.minDriversPerZone,
              alertRadiusMeters: config.alertRadiusMeters
            }
          ])
        )
      );
      setError(null);
    } catch {
      setError("Unable to load market configuration. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfigs();
  }, []);

  async function saveConfig(city: string) {
    const draft = drafts[city];
    if (!draft) {
      return;
    }

    setSavingCity(city);
    try {
      const updated = await adminRepository.updateMarketConfig(city, draft);
      setConfigs((current) => current.map((config) => (config.city === city ? updated : config)));
      setError(null);
    } catch {
      setError(`Unable to save ${city} configuration.`);
    } finally {
      setSavingCity(null);
    }
  }

  return (
    <AdminShell
      title="Market Configuration"
      subtitle="Tune notification radius and driver coverage thresholds per launch city."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetricCard label="Configured cities" value={configs.length} icon={Settings2} />
        <AdminMetricCard
          label="Nigeria markets"
          value={configs.filter((config) => config.country === "Nigeria").length}
        />
        <AdminMetricCard
          label="UK markets"
          value={configs.filter((config) => config.country === "UK").length}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {error ? (
          <div className="rounded-lg border border-danger-soft bg-danger-soft p-6 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#667085]">
            Loading market configs
          </div>
        ) : (
          configs.map((config) => {
            const draft = drafts[config.city];

            return (
              <section key={config.id} className="rounded-lg border border-[#E4E7EC] bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">{config.city}</h2>
                    <p className="text-sm font-medium text-[#667085]">{config.country}</p>
                  </div>
                  <span className="rounded-md bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">
                    {config.isActive ? "Active" : "Paused"}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["notificationRadiusMeters", "Notification radius", "m"],
                    ["alertRadiusMeters", "Alert radius", "m"],
                    ["driverPerAttendeeRatio", "Driver ratio", "attendees"],
                    ["minDriversPerZone", "Minimum drivers", "drivers"]
                  ].map(([key, label, suffix]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-bold text-[#667085]">{label}</span>
                      <div className="mt-1 flex h-11 items-center rounded-lg border border-[#D0D5DD] bg-white px-3">
                        <input
                          value={draft?.[key as keyof MarketDraft] ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [config.city]: {
                                ...current[config.city],
                                [key]: Number(event.target.value)
                              }
                            }))
                          }
                          type="number"
                          className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                        />
                        <span className="text-xs font-semibold text-[#98A2B3]">{suffix}</span>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void saveConfig(config.city)}
                  disabled={savingCity === config.city}
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  <Save className="size-4" />
                  {savingCity === config.city ? "Saving" : "Save config"}
                </button>
              </section>
            );
          })
        )}
      </div>
    </AdminShell>
  );
}
