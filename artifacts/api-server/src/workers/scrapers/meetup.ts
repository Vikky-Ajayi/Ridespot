import axios from "axios";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { logger } from "../../lib/logger.js";

const MEETUP_GQL = "https://api.meetup.com/gql";

const MEETUP_CITIES = [
  { lat: 6.5244, lng: 3.3792, city: "Lagos", country: "NG" },
  { lat: 51.5074, lng: -0.1278, city: "London", country: "GB" },
  { lat: 53.4808, lng: -2.2426, city: "Manchester", country: "GB" },
  { lat: 52.4862, lng: -1.8904, city: "Birmingham", country: "GB" },
  { lat: 55.8642, lng: -4.2518, city: "Glasgow", country: "GB" },
  { lat: 51.4545, lng: -2.5879, city: "Bristol", country: "GB" },
  { lat: 55.9533, lng: -3.1883, city: "Edinburgh", country: "GB" },
  { lat: 53.4084, lng: -2.9916, city: "Liverpool", country: "GB" },
];

const QUERY = `
  query($lat: Float!, $lon: Float!, $radius: Int!, $cursor: String) {
    keywordSearch(
      filter: { lat: $lat, lon: $lon, radius: $radius }
      input: { first: 100, after: $cursor }
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          result {
            ... on Event {
              id title eventUrl dateTime endTime
              venue { name lat lng address city }
              group { name }
              going
            }
          }
        }
      }
    }
  }
`;

interface MeetupVenue { name?: string; lat?: number; lng?: number; address?: string; city?: string }
interface MeetupEvent { id: string; title: string; eventUrl?: string; dateTime: string; endTime?: string; venue?: MeetupVenue; going?: number }

export async function runMeetupScraper(): Promise<number> {
  let total = 0;

  for (const loc of MEETUP_CITIES) {
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      try {
        const axiosRes = await axios.post(
          MEETUP_GQL,
          { query: QUERY, variables: { lat: loc.lat, lon: loc.lng, radius: 80, cursor } },
          { timeout: 15000 },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = axiosRes as any;
        const data = res.data?.data?.keywordSearch;
        if (!data) break;

        const events: MeetupEvent[] = data.edges
          .map((e: { node: { result: unknown } }) => e.node.result)
          .filter((e: unknown): e is MeetupEvent => {
            const ev = e as MeetupEvent | undefined;
            return !!ev?.venue?.lat;
          });

        const parsed = events.map((e) => ({
          externalId: e.id,
          source: "meetup" as const,
          title: e.title,
          venueName: e.venue?.name ?? null,
          venueAddress: `${e.venue?.address ?? ""}, ${e.venue?.city ?? ""}`,
          venueLat: e.venue!.lat!,
          venueLng: e.venue!.lng!,
          city: loc.city,
          country: loc.country,
          startTime: new Date(e.dateTime),
          endTime: e.endTime ? new Date(e.endTime) : null,
          expectedAttendance: e.going ?? 50,
          eventUrl: e.eventUrl ?? null,
          rawData: e as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        }));

        if (parsed.length > 0) {
          await db.insert(eventsTable)
            .values(parsed)
            .onConflictDoUpdate({
              target: [eventsTable.source, eventsTable.externalId],
              set: { updatedAt: new Date() },
            });
          total += parsed.length;
        }

        hasMore = data.pageInfo.hasNextPage as boolean;
        cursor = data.pageInfo.endCursor as string | null;
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        logger.error({ err, city: loc.city }, "Meetup scrape error");
        break;
      }
    }
  }

  return total;
}
