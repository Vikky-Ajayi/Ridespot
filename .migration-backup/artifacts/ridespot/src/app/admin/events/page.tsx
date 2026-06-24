
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { AdminEmptyState, AdminMetricCard, AdminShell } from "@/components/admin/AdminShell";
import { MARKET_COUNTRIES } from "@/lib/markets";
import {
  adminRepository,
  type AdminEvent,
  type AdminEventInput,
  type EventOcrResult
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
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<EventOcrResult | null>(null);
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
    setOcrResult(null);
  }

  async function extractFlyer(file: File | null) {
    if (!file) {
      return;
    }

    setOcrLoading(true);
    setError(null);

    try {
      const result = await adminRepository.extractEventFromFlyer(file);
      setOcrResult(result);
      const extracted = result.extractedEvent;

      setForm((current) => ({
        ...current,
        name: extracted.name ?? current.name,
        venueName: extracted.venueName ?? current.venueName,
        address: extracted.address ?? current.address,
        city: extracted.city ?? current.city,
        country: extracted.country ?? current.country,
        lat: typeof extracted.lat === "number" ? String(extracted.lat) : current.lat,
        lng: typeof extracted.lng === "number" ? String(extracted.lng) : current.lng,
        startTime: extracted.startTime ? toLocalDateTimeInput(extracted.startTime) : current.startTime,
        endTime: extracted.endTime ? toLocalDateTimeInput(extracted.endTime) : current.endTime,
        expectedAttendance:
          typeof extracted.expectedAttendance === "number"
            ? String(extracted.expectedAttendance)
            : current.expectedAttendance,
        eventType: extracted.eventType ?? current.eventType,
        eventCategory: extracted.eventCategory ?? current.eventCategory
      }));
    } catch {
      setError("Unable to extract event details from flyer. Check OCR env keys and image quality.");
    } finally {
      setOcrLoading(false);
    }
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

          <div className="mt-4 rounded-xl border border-dashed border-[#D0D5DD] bg-[#F9FAFB] p-4">
            <p className="text-sm font-bold">Extract from flyer</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#667085]">
              Upload an event flyer. OCR fills this form, then you review and save manually.
            </p>
            <label className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-lg bg-ink px-4 text-sm font-bold text-white">
              {ocrLoading ? "Extracting..." : "Upload flyer image"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={ocrLoading}
                onChange={(event) => {
                  void extractFlyer(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {ocrResult ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-white p-3 ring-1 ring-[#E4E7EC]">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#667085]">
                    Extraction confidence
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {Math.round(ocrResult.confidence * 100)}%
                  </p>
                </div>
                {ocrResult.missingFields.length > 0 ? (
                  <div className="rounded-lg bg-[#FFF7ED] p-3 text-xs font-semibold text-[#B54708]">
                    Missing fields: {ocrResult.missingFields.join(", ")}
                  </div>
                ) : null}
                <details className="rounded-lg bg-white p-3 ring-1 ring-[#E4E7EC]">
                  <summary className="cursor-pointer text-xs font-bold text-[#344054]">
                    View raw OCR text
                  </summary>
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[#667085]">
                    {ocrResult.rawText}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>

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
            <>
            <div className="hidden overflow-x-auto md:block">
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
                        <p className="text-xs font-medium text-[#667085]">
                          {event.venueName ?? event.address ?? "Venue pending"}
                        </p>
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
            <div className="divide-y divide-[#E4E7EC] md:hidden">
              {events.map((event) => (
                <article key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{event.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[#667085]">
                        {event.venueName ?? event.address ?? "Venue pending"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-[#F2F4F7] px-2 py-1 text-[10px] font-bold uppercase text-[#344054]">
                      {event.source}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs font-semibold text-[#344054]">
                    <p>
                      Market: {event.city}, {event.country}
                    </p>
                    <p>Attendance: {event.expectedAttendance ?? 0}</p>
                    <p>Start: {formatEventTime(event.startTime)}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(event)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-[#D0D5DD] bg-white text-xs font-bold"
                    >
                      <Pencil className="size-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteEvent(event.id)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-danger-soft bg-danger-soft text-xs font-bold text-danger"
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
