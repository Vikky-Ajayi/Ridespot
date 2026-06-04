"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { AdminEmptyState, AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { MARKET_COUNTRIES } from "@/lib/markets";
import {
  adminRepository,
  type AdminEvent,
  type AdminEventInput
} from "@/services/repositories/admin.repository";

const emptyForm = {
  name: "",
  venueName: "",
  lat: "51.556",
  lng: "-0.2796",
  address: "",
  city: "London",
  country: "UK",
  startTime: "",
  endTime: "",
  expectedAttendance: "1000",
  eventType: "Concert",
  eventCategory: "Entertainment"
};

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    try {
      const response = await adminRepository.getEvents(150);
      setEvents(response);
      setError(null);
    } catch {
      setError("Unable to load events. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  const manualEvents = useMemo(
    () => events.filter((event) => event.source === "manual").length,
    [events]
  );

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEditing(event: AdminEvent) {
    setEditingId(event.id);
    setForm({
      name: event.name,
      venueName: event.venueName ?? "",
      lat: String(event.location.lat),
      lng: String(event.location.lng),
      address: event.address ?? "",
      city: event.city,
      country: event.country,
      startTime: toLocalDateTimeInput(event.startTime),
      endTime: toLocalDateTimeInput(event.endTime),
      expectedAttendance: String(event.expectedAttendance ?? 0),
      eventType: event.eventType ?? "",
      eventCategory: event.eventCategory ?? ""
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: AdminEventInput = {
        name: form.name,
        venueName: form.venueName || null,
        lat: Number(form.lat),
        lng: Number(form.lng),
        address: form.address || null,
        city: form.city,
        country: form.country,
        startTime: toIso(form.startTime),
        endTime: form.endTime ? toIso(form.endTime) : null,
        expectedAttendance: Number(form.expectedAttendance || 0),
        eventType: form.eventType || null,
        eventCategory: form.eventCategory || null
      };

      if (editingId) {
        await adminRepository.updateEvent(editingId, payload);
      } else {
        await adminRepository.createEvent(payload);
      }

      resetForm();
      await loadEvents();
    } catch {
      setError("Unable to save event. Check required fields and backend status.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEvent(id: string) {
    try {
      await adminRepository.deleteEvent(id);
      await loadEvents();
    } catch {
      setError("Unable to delete event.");
    }
  }

  return (
    <AdminShell
      title="Event Management"
      subtitle="Create and manage manual events that feed hotspot prediction."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetricCard label="Total events" value={events.length} icon={CalendarPlus} />
        <AdminMetricCard label="Manual events" value={manualEvents} />
        <AdminMetricCard label="External events" value={events.length - manualEvents} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-lg border border-[#E4E7EC] bg-white p-4">
          <h2 className="text-sm font-bold">{editingId ? "Edit event" : "Create manual event"}</h2>
          {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}

          <form onSubmit={submitEvent} className="mt-4 space-y-3">
            {[
              ["name", "Event name", "text"],
              ["venueName", "Venue", "text"],
              ["address", "Address", "text"],
              ["city", "City", "text"],
              ["eventType", "Event type", "text"],
              ["eventCategory", "Category", "text"]
            ].map(([field, label, type]) => (
              <label key={field} className="block">
                <span className="text-xs font-bold text-[#667085]">{label}</span>
                <input
                  value={form[field as keyof typeof emptyForm]}
                  onChange={(event) => updateField(field as keyof typeof emptyForm, event.target.value)}
                  type={type}
                  required={field === "name" || field === "city" || field === "country"}
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
                />
              </label>
            ))}

            <label className="block">
              <span className="text-xs font-bold text-[#667085]">Country</span>
              <select
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                required
                className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
              >
                {MARKET_COUNTRIES.map((country) => (
                  <option key={country.value} value={country.value}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-[#667085]">Latitude</span>
                <input
                  value={form.lat}
                  onChange={(event) => updateField("lat", event.target.value)}
                  type="number"
                  step="0.0001"
                  required
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#667085]">Longitude</span>
                <input
                  value={form.lng}
                  onChange={(event) => updateField("lng", event.target.value)}
                  type="number"
                  step="0.0001"
                  required
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-[#667085]">Start time</span>
                <input
                  value={form.startTime}
                  onChange={(event) => updateField("startTime", event.target.value)}
                  type="datetime-local"
                  required
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#667085]">End time</span>
                <input
                  value={form.endTime}
                  onChange={(event) => updateField("endTime", event.target.value)}
                  type="datetime-local"
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-[#667085]">Expected attendance</span>
              <input
                value={form.expectedAttendance}
                onChange={(event) => updateField("expectedAttendance", event.target.value)}
                type="number"
                min="0"
                className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm font-semibold outline-none focus:border-ink"
              />
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-ink px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {submitting ? "Saving" : editingId ? "Update event" : "Create event"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 rounded-lg border border-[#D0D5DD] bg-white px-4 text-sm font-bold"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-[#E4E7EC] bg-white">
          <div className="border-b border-[#E4E7EC] px-4 py-3">
            <h2 className="text-sm font-bold">Event inventory</h2>
          </div>

          {loading ? (
            <div className="p-5 text-sm font-semibold text-[#667085]">Loading events</div>
          ) : events.length === 0 ? (
            <div className="p-4">
              <AdminEmptyState
                title="No events yet"
                body="Create a manual event or run ingestion to populate this table."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead className="bg-[#F9FAFB] text-xs font-bold uppercase text-[#667085]">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Market</th>
                    <th className="px-4 py-3">Attendance</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7EC]">
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold">{event.name}</p>
                        <p className="text-xs font-medium text-[#667085]">{event.venueName ?? "No venue"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">
                        {event.city}, {event.country}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">
                        {event.expectedAttendance ?? 0}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#344054]">
                        {formatEventTime(event.startTime)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[#F2F4F7] px-2 py-1 text-xs font-bold uppercase text-[#344054]">
                          {event.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(event)}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-[#D0D5DD] bg-white"
                            aria-label="Edit event"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteEvent(event.id)}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-danger-soft bg-danger-soft text-danger"
                            aria-label="Delete event"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
