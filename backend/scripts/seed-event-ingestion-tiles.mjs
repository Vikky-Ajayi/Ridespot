// Seeds event_ingestion_tiles with a UK-wide town/city grid + Lagos + Abuja, replacing the
// old hardcoded 3-UK-city + 2-Nigeria-city SUPPORTED_MARKETS list. Coordinates are
// approximate city-center values -- fine for a 10-25km ingestion radius, not meant to be
// survey-grade. Safe to re-run: upserts on tile_key, never duplicates.
//
// Usage: node scripts/seed-event-ingestion-tiles.mjs   (run after `pnpm run build`, or point
// DATABASE_URL at the target DB directly -- this script talks to Postgres directly and does
// not require the compiled backend).

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked backend/.env and process env). Aborting.");
  process.exit(1);
}

function isLocalDatabaseUrl(databaseUrl) {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".railway.internal");
  } catch {
    return false;
  }
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabaseUrl(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false }
});

function slug(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const NG = { country: "Nigeria", countryCode: "NG" };
const GB = { country: "UK", countryCode: "GB" };

// [label, lat, lng, radiusMeters]
const ENGLAND = [
  ["London", 51.5072, -0.1276, 25000],
  ["Birmingham", 52.4862, -1.8904, 20000],
  ["Manchester", 53.4808, -2.2426, 18000],
  ["Leeds", 53.8008, -1.5491, 18000],
  ["Liverpool", 53.4084, -2.9916, 18000],
  ["Sheffield", 53.3811, -1.4701, 16000],
  ["Bristol", 51.4545, -2.5879, 16000],
  ["Newcastle upon Tyne", 54.9783, -1.6178, 16000],
  ["Nottingham", 52.9548, -1.1581, 14000],
  ["Leicester", 52.6369, -1.1398, 14000],
  ["Southampton", 50.9097, -1.4044, 14000],
  ["Portsmouth", 50.8198, -1.088, 12000],
  ["Brighton", 50.8225, -0.1372, 12000],
  ["Plymouth", 50.3755, -4.1427, 14000],
  ["Derby", 52.9225, -1.4746, 12000],
  ["Stoke-on-Trent", 53.0027, -2.1794, 12000],
  ["Wolverhampton", 52.587, -2.1288, 12000],
  ["Coventry", 52.4068, -1.5197, 14000],
  ["Sunderland", 54.9061, -1.3811, 12000],
  ["Bradford", 53.796, -1.7594, 14000],
  ["Kingston upon Hull", 53.7457, -0.3367, 14000],
  ["Preston", 53.7632, -2.7031, 12000],
  ["Milton Keynes", 52.0406, -0.7594, 14000],
  ["Northampton", 52.2405, -0.9027, 12000],
  ["Norwich", 52.6309, 1.2974, 14000],
  ["Luton", 51.8787, -0.42, 12000],
  ["Swindon", 51.5558, -1.7797, 12000],
  ["Southend-on-Sea", 51.5459, 0.7077, 12000],
  ["Reading", 51.4543, -0.9781, 12000],
  ["Ipswich", 52.0567, 1.1482, 12000],
  ["Oxford", 51.752, -1.2577, 12000],
  ["Cambridge", 52.2053, 0.1218, 12000],
  ["York", 53.96, -1.0873, 12000],
  ["Exeter", 50.7184, -3.5339, 12000],
  ["Gloucester", 51.8642, -2.238, 10000],
  ["Blackpool", 53.8175, -3.0357, 12000],
  ["Middlesbrough", 54.5742, -1.235, 12000],
  ["Bournemouth", 50.7192, -1.8808, 14000],
  ["Peterborough", 52.5695, -0.2405, 12000],
  ["Colchester", 51.8959, 0.8919, 10000],
  ["Chelmsford", 51.7356, 0.4685, 10000],
  ["Slough", 51.5105, -0.595, 10000],
  ["Basildon", 51.5761, 0.488, 10000],
  ["Watford", 51.6565, -0.3903, 10000],
  ["Woking", 51.3168, -0.56, 10000],
  ["Maidstone", 51.2704, 0.5227, 10000],
  ["Canterbury", 51.2802, 1.0789, 10000],
  ["Bath", 51.3811, -2.359, 10000],
  ["Cheltenham", 51.8994, -2.0783, 10000],
  ["Worcester", 52.1936, -2.2215, 10000],
  ["Warwick", 52.2823, -1.5849, 8000],
  ["Lincoln", 53.2307, -0.5406, 10000],
  ["Chester", 53.1934, -2.8931, 10000],
  ["Blackburn", 53.7486, -2.4823, 10000],
  ["Bolton", 53.5769, -2.4282, 10000],
  ["Stockport", 53.4106, -2.1575, 10000],
  ["Oldham", 53.5409, -2.1114, 10000],
  ["Rochdale", 53.6097, -2.1561, 10000],
  ["Wigan", 53.545, -2.6318, 10000],
  ["Warrington", 53.39, -2.597, 10000],
  ["Telford", 52.6784, -2.4453, 10000],
  ["Doncaster", 53.5228, -1.1285, 10000],
  ["Rotherham", 53.43, -1.3568, 10000],
  ["Barnsley", 53.5526, -1.4797, 10000],
  ["Wakefield", 53.6833, -1.4977, 10000],
  ["Huddersfield", 53.6458, -1.785, 10000],
  ["Halifax", 53.7218, -1.8622, 10000],
  ["Grimsby", 53.5675, -0.0803, 10000],
  ["Scunthorpe", 53.5877, -0.6472, 10000],
  ["Carlisle", 54.8925, -2.9329, 10000],
  ["Lancaster", 54.0466, -2.8007, 10000],
  ["Darlington", 54.5253, -1.5563, 10000],
  ["Hartlepool", 54.6862, -1.2131, 10000],
  ["Gateshead", 54.9526, -1.6033, 10000],
  ["South Shields", 54.9986, -1.4315, 10000]
];

const SCOTLAND = [
  ["Glasgow", 55.8642, -4.2518, 20000],
  ["Edinburgh", 55.9533, -3.1883, 18000],
  ["Aberdeen", 57.1497, -2.0943, 15000],
  ["Dundee", 56.462, -2.9707, 12000],
  ["Inverness", 57.4778, -4.2247, 12000],
  ["Stirling", 56.1165, -3.9369, 10000],
  ["Perth", 56.395, -3.4308, 10000],
  ["Paisley", 55.8456, -4.4239, 10000],
  ["East Kilbride", 55.7642, -4.177, 10000],
  ["Livingston", 55.883, -3.5225, 10000],
  ["Falkirk", 56.0019, -3.7839, 10000],
  ["Ayr", 55.4586, -4.6292, 10000],
  ["Kilmarnock", 55.6111, -4.4956, 10000],
  ["Dunfermline", 56.0719, -3.452, 10000],
  ["Kirkcaldy", 56.1165, -3.159, 10000]
];

const WALES = [
  ["Cardiff", 51.4816, -3.1791, 16000],
  ["Swansea", 51.6214, -3.9436, 14000],
  ["Newport", 51.5842, -2.9977, 12000],
  ["Wrexham", 53.0478, -3.0, 10000],
  ["Bangor", 53.228, -4.1293, 8000],
  ["Aberystwyth", 52.4153, -4.0829, 8000]
];

const NORTHERN_IRELAND = [
  ["Belfast", 54.5973, -5.9301, 16000],
  ["Derry/Londonderry", 54.9966, -7.3086, 12000],
  ["Lisburn", 54.5104, -6.0367, 10000],
  ["Newry", 54.1751, -6.3402, 8000],
  ["Armagh", 54.3503, -6.6528, 8000]
];

const NIGERIA_TILES = [
  ["Lagos", 6.5244, 3.3792, 25000],
  ["Abuja", 9.0765, 7.3986, 20000]
];

const tiles = [
  ...[...ENGLAND, ...SCOTLAND, ...WALES, ...NORTHERN_IRELAND].map(([label, lat, lng, radius]) => ({
    ...GB,
    label,
    lat,
    lng,
    radius
  })),
  ...NIGERIA_TILES.map(([label, lat, lng, radius]) => ({ ...NG, label, lat, lng, radius }))
];

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const tile of tiles) {
    const tileKey = `${tile.countryCode.toLowerCase()}-${slug(tile.label)}`;
    const result = await pool.query(
      `INSERT INTO event_ingestion_tiles (tile_key, label, country, country_code, lat, lng, radius_meters, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT (tile_key) DO UPDATE SET
         label = EXCLUDED.label,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         radius_meters = EXCLUDED.radius_meters,
         is_active = TRUE
       RETURNING (xmax = 0) AS inserted`,
      [tileKey, tile.label, tile.country, tile.countryCode, tile.lat, tile.lng, tile.radius]
    );

    if (result.rows[0]?.inserted) {
      inserted += 1;
    } else {
      updated += 1;
    }
  }

  console.log(JSON.stringify({ passed: true, totalTiles: tiles.length, inserted, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
