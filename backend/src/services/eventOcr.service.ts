import axios from "axios";
import { env } from "../config/env.js";
import { canonicalMarketCountry } from "../utils/country.js";
import { AppError } from "../utils/http.js";

export interface OcrUpload {
  buffer: Buffer;
  filename?: string;
  mimetype?: string;
}

interface ExtractedEvent {
  name: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  endTime: string | null;
  expectedAttendance: number | null;
  eventType: string | null;
  eventCategory: string | null;
  confidence: number;
  missingFields: string[];
}

function emptyExtraction(rawText: string, diagnostics: Record<string, unknown>) {
  return {
    extractedEvent: {
      name: null,
      venueName: null,
      address: null,
      city: null,
      country: null,
      lat: null,
      lng: null,
      startTime: null,
      endTime: null,
      expectedAttendance: null,
      eventType: null,
      eventCategory: null,
      confidence: 0,
      missingFields: [
        "name",
        "venueName",
        "address",
        "city",
        "country",
        "startTime"
      ]
    },
    confidence: 0,
    missingFields: ["name", "venueName", "address", "city", "country", "startTime"],
    rawText,
    providerDiagnostics: diagnostics
  };
}

function normaliseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  }
  return null;
}

function normaliseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseIsoString(value: unknown) {
  const text = normaliseString(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
  }
}

async function extractTextWithGoogleVision(upload: OcrUpload) {
  if (!env.GOOGLE_VISION_API_KEY) {
    throw new AppError(
      503,
      "OCR_UNAVAILABLE",
      "GOOGLE_VISION_API_KEY is not configured for flyer OCR."
    );
  }

  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
      env.GOOGLE_VISION_API_KEY
    )}`,
    {
      requests: [
        {
          image: {
            content: upload.buffer.toString("base64")
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION"
            }
          ]
        }
      ]
    },
    {
      timeout: 15000
    }
  );

  const firstResponse = (response.data as { responses?: Array<Record<string, unknown>> }).responses?.[0];
  const error = firstResponse?.error as { message?: string } | undefined;
  if (error?.message) {
    throw new AppError(502, "OCR_PROVIDER_ERROR", error.message);
  }

  const fullTextAnnotation = firstResponse?.fullTextAnnotation as { text?: unknown } | undefined;
  const text = normaliseString(fullTextAnnotation?.text);
  if (!text) {
    throw new AppError(422, "OCR_NO_TEXT", "No readable text was found in the uploaded flyer.");
  }

  return text;
}

async function structureWithGroq(rawText: string): Promise<ExtractedEvent | null> {
  if (!env.GROQ_API_KEY) {
    return null;
  }

  const prompt = `
Extract a RideSpot event from this flyer OCR text.
Return only JSON with keys:
name, venueName, address, city, country, startTime, endTime, expectedAttendance, eventType, eventCategory, confidence, missingFields.
Use ISO 8601 UTC strings for startTime/endTime when possible.
Country must be "Nigeria" or "UK" if inferable; otherwise null.
Use null for unknown values. Confidence must be 0..1.

OCR text:
${rawText.slice(0, 12000)}
`.trim();

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: env.GROQ_OCR_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract structured event data for an admin review screen. Never invent exact dates, addresses, or attendance."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: {
        type: "json_object"
      },
      temperature: 0
    },
    {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const content = (response.data as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices?.[0]?.message?.content;
  const data = parseJsonObject(typeof content === "string" ? content : "{}");

  const country = canonicalMarketCountry(normaliseString(data.country));
  const candidate: ExtractedEvent = {
    name: normaliseString(data.name),
    venueName: normaliseString(data.venueName ?? data.venue_name),
    address: normaliseString(data.address),
    city: normaliseString(data.city),
    country: country === "Nigeria" || country === "UK" ? country : null,
    lat: null,
    lng: null,
    startTime: normaliseIsoString(data.startTime ?? data.start_time),
    endTime: normaliseIsoString(data.endTime ?? data.end_time),
    expectedAttendance: normaliseNumber(data.expectedAttendance ?? data.expected_attendance),
    eventType: normaliseString(data.eventType ?? data.event_type),
    eventCategory: normaliseString(data.eventCategory ?? data.event_category),
    confidence:
      typeof data.confidence === "number" && Number.isFinite(data.confidence)
        ? Math.max(0, Math.min(1, data.confidence))
        : 0.5,
    missingFields: Array.isArray(data.missingFields)
      ? data.missingFields.filter((field): field is string => typeof field === "string")
      : []
  };

  const requiredFields: Array<keyof ExtractedEvent> = [
    "name",
    "venueName",
    "address",
    "city",
    "country",
    "startTime"
  ];
  const missing = new Set(candidate.missingFields);
  for (const field of requiredFields) {
    if (!candidate[field]) {
      missing.add(field);
    }
  }
  candidate.missingFields = Array.from(missing);
  candidate.confidence = Math.max(0, Math.min(1, candidate.confidence));

  return candidate;
}

async function geocodeExtractedEvent(event: ExtractedEvent) {
  if (!env.GOOGLE_MAPS_API_KEY || !event.address) {
    return { event, status: env.GOOGLE_MAPS_API_KEY ? "no_address" : "not_configured" };
  }

  const address = [event.address, event.city, event.country].filter(Boolean).join(", ");
  try {
    const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      timeout: 8000,
      params: {
        address,
        key: env.GOOGLE_MAPS_API_KEY
      }
    });
    const data = response.data as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: unknown; lng?: unknown } } }>;
    };
    const location = data.results?.[0]?.geometry?.location;
    if (typeof location?.lat === "number" && typeof location.lng === "number") {
      return {
        event: {
          ...event,
          lat: location.lat,
          lng: location.lng
        },
        status: data.status ?? "OK"
      };
    }

    return { event, status: data.status ?? "no_result" };
  } catch (error) {
    return {
      event,
      status: error instanceof Error ? error.message : "geocoding_failed"
    };
  }
}

export async function extractEventFromFlyer(upload: OcrUpload) {
  const rawText = await extractTextWithGoogleVision(upload);
  const diagnostics: Record<string, unknown> = {
    googleVision: "ok",
    groqModel: env.GROQ_OCR_MODEL,
    fileName: upload.filename ?? null,
    mimeType: upload.mimetype ?? null,
    byteSize: upload.buffer.length
  };

  try {
    const structuredEvent = await structureWithGroq(rawText);
    if (!structuredEvent) {
      return emptyExtraction(rawText, {
        ...diagnostics,
        groq: "not_configured"
      });
    }
    const geocoded = await geocodeExtractedEvent(structuredEvent);
    const extractedEvent = geocoded.event;

    return {
      extractedEvent,
      confidence: extractedEvent.confidence,
      missingFields: extractedEvent.missingFields,
      rawText,
      providerDiagnostics: {
        ...diagnostics,
        groq: "ok",
        googleGeocoding: geocoded.status
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Groq extraction failed";
    return emptyExtraction(rawText, {
      ...diagnostics,
      groq: "failed",
      groqError: message
    });
  }
}
