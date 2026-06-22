export interface LatLng {
  lat: number;
  lng: number;
}

function encodeCoordinate(value: number) {
  let coordinate = value < 0 ? ~(value << 1) : value << 1;
  let output = "";

  while (coordinate >= 0x20) {
    output += String.fromCharCode((0x20 | (coordinate & 0x1f)) + 63);
    coordinate >>= 5;
  }

  output += String.fromCharCode(coordinate + 63);
  return output;
}

export function encodePolyline(points: LatLng[]) {
  let previousLat = 0;
  let previousLng = 0;
  let output = "";

  points.forEach((point) => {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);

    output += encodeCoordinate(lat - previousLat);
    output += encodeCoordinate(lng - previousLng);

    previousLat = lat;
    previousLng = lng;
  });

  return output;
}
