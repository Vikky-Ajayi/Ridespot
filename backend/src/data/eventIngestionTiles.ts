// Canonical UK-wide + Lagos + Abuja event-ingestion coverage grid. Single source of truth --
// both scripts/seed-event-ingestion-tiles.mjs and admin.service.ts's seedEventIngestionTiles()
// import this (the script imports the compiled dist/ output after `pnpm run build`).
// Coordinates are approximate city-center values -- fine for a 10-25km ingestion radius, not
// meant to be survey-grade.

export interface EventIngestionTileSeed {
  label: string;
  country: "Nigeria" | "UK";
  countryCode: "NG" | "GB";
  lat: number;
  lng: number;
  radiusMeters: number;
}

const GB = { country: "UK" as const, countryCode: "GB" as const };
const NG = { country: "Nigeria" as const, countryCode: "NG" as const };

// [label, lat, lng, radiusMeters]
const ENGLAND: Array<[string, number, number, number]> = [
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

const SCOTLAND: Array<[string, number, number, number]> = [
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

const WALES: Array<[string, number, number, number]> = [
  ["Cardiff", 51.4816, -3.1791, 16000],
  ["Swansea", 51.6214, -3.9436, 14000],
  ["Newport", 51.5842, -2.9977, 12000],
  ["Wrexham", 53.0478, -3.0, 10000],
  ["Bangor", 53.228, -4.1293, 8000],
  ["Aberystwyth", 52.4153, -4.0829, 8000]
];

const NORTHERN_IRELAND: Array<[string, number, number, number]> = [
  ["Belfast", 54.5973, -5.9301, 16000],
  ["Derry/Londonderry", 54.9966, -7.3086, 12000],
  ["Lisburn", 54.5104, -6.0367, 10000],
  ["Newry", 54.1751, -6.3402, 8000],
  ["Armagh", 54.3503, -6.6528, 8000]
];

const NIGERIA_TILES: Array<[string, number, number, number]> = [
  ["Lagos", 6.5244, 3.3792, 25000],
  ["Abuja", 9.0765, 7.3986, 20000]
];

export const EVENT_INGESTION_TILES: EventIngestionTileSeed[] = [
  ...[...ENGLAND, ...SCOTLAND, ...WALES, ...NORTHERN_IRELAND].map(([label, lat, lng, radiusMeters]) => ({
    ...GB,
    label,
    lat,
    lng,
    radiusMeters
  })),
  ...NIGERIA_TILES.map(([label, lat, lng, radiusMeters]) => ({ ...NG, label, lat, lng, radiusMeters }))
];
