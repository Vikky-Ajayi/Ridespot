"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw, Server } from "lucide-react";
import { AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { adminRepository, type MlStatus } from "@/services/repositories/admin.repository";

export default function AdminMlPage() {
  const [status, setStatus] = useState<MlStatus | null>(null);
  const [retrainResult, setRetrainResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await adminRepository.getMlStatus();
      setStatus(response);
      setError(null);
    } catch {
      setError("Unable to load ML service status. Check backend and ML service configuration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function triggerRetrain() {
    setRetraining(true);
    setError(null);
    try {
      const response = await adminRepository.triggerMlRetrain();
      setRetrainResult(response);
      await loadStatus();
    } catch {
      setError("Unable to trigger retraining. The ML service may be offline.");
    } finally {
      setRetraining(false);
    }
  }

  const accuracyLabel =
    typeof status?.accuracy === "number" ? `${Math.round(status.accuracy * 10000) / 100}%` : "N/A";

  return (
    <AdminShell
      title="ML Model Status"
      subtitle="Monitor model availability and trigger controlled retraining."
      action={
        <button
          type="button"
          onClick={() => void triggerRetrain()}
          disabled={retraining}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          <RefreshCw className="size-4" />
          {retraining ? "Retraining" : "Trigger retrain"}
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetricCard
          label="Model loaded"
          value={loading ? "..." : status?.loaded ? "Yes" : "No"}
          icon={Server}
          tone={status?.loaded ? "success" : "danger"}
        />
        <AdminMetricCard label="Accuracy" value={accuracyLabel} icon={Activity} />
        <AdminMetricCard
          label="Threshold"
          value={typeof status?.accuracy === "number" && status.accuracy >= 0.85 ? "Met" : "Check"}
          tone={typeof status?.accuracy === "number" && status.accuracy >= 0.85 ? "success" : "danger"}
        />
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-danger-soft bg-danger-soft p-5 text-sm font-semibold text-danger">
          {error}
        </div>
      ) : null}

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5">
        <h2 className="text-sm font-bold">Retraining result</h2>
        <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg bg-[#101828] p-4 text-xs font-semibold leading-6 text-white">
          {JSON.stringify(
            retrainResult ?? {
              status: "idle",
              message: "No retraining run has been triggered from this dashboard session."
            },
            null,
            2
          )}
        </pre>
      </section>
    </AdminShell>
  );
}
