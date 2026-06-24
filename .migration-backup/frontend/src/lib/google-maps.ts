import type { Libraries } from "@react-google-maps/api";

export const GOOGLE_MAP_LIBRARIES: Libraries = ["places"];

export const RIDESPOT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#f1f2f6" }]
  },
  {
    featureType: "water",
    stylers: [{ color: "#dbe8ff" }]
  },
  {
    featureType: "landscape",
    stylers: [{ color: "#fbfcfd" }]
  }
];
