
import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, MousePointerClick } from "lucide-react";
import { AdminEmptyState, AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { adminRepository, type NotificationLog } from "@/services/repositories/admin.repository";

function formatSentAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function AdminNotificationsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      setLoading(true);
      try {
        const response = await adminRepository.getNotificationLogs(150);
        if (!cancelled) {
          setLogs(response);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load notification logs. Check that the backend is running.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLogs();
    const interval = window.setInterval(loadLogs, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const delivered = useMemo(() => logs.filter((log) => log.wasDelivered).length, [logs]);
  const actedOn = useMemo(() => logs.filter((log) => log.wasActedOn).length, [logs]);

  return (
    <AdminShell
      title="Notification Logs"
      subtitle="Review hotspot alerts, coverage suppression, and surge sends."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetricCard label="Recent logs" value={logs.length} icon={Bell} />
        <AdminMetricCard label="Delivered" value={delivered} icon={CheckCircle2} tone="success" />
        <AdminMetricCard label="Acted on" value={actedOn} icon={MousePointerClick} />
      </div>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white">
        <div className="border-b border-[#E4E7EC] px-4 py-3">
          <h2 className="text-sm font-bold">Recent notification activity</h2>
        </div>

        {error ? (
          <div className="p-5 text-sm font-semibold text-danger">{error}</div>
        ) : loading ? (
          <div className="p-5 text-sm font-semibold text-[#667085]">Loading notification logs</div>
        ) : logs.length === 0 ? (
          <div className="p-4">
            <AdminEmptyState
              title="No notifications sent"
              body="The smart notification engine will populate this once zones need coverage."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-[#F9FAFB] text-xs font-bold uppercase text-[#667085]">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Hotspot</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC]">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[#F2F4F7] px-2 py-1 text-xs font-bold uppercase text-[#344054]">
                        {log.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="text-sm font-bold">{log.title ?? "Untitled"}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-medium text-[#667085]">
                        {log.body ?? "No message body"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#344054]">
                      {log.driverName ?? "Broadcast"}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#344054]">
                      {log.hotspotName ?? "None"}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      {log.wasDelivered ? "Delivered" : "Pending"}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#344054]">
                      {formatSentAt(log.sentAt)}
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
