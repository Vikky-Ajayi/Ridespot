

import { useEffect, useMemo, useRef, useState } from "react";
import { DemandPin } from "@/components/map/DemandPin";
import { DriverPin } from "@/components/map/DriverPin";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { RecenterButton } from "@/components/map/RecenterButton";
import { RIDESPOT_MAP_STYLE } from "@/lib/google-maps";
import { loadGooglePlaces, type PlaceSuggestion } from "@/lib/googlePlaces";
import { decodePolyline } from "@/lib/polyline";
import type { DriverLocation, Hotspot, NavigationStatus } from "@/types";

export interface MapContainerProps {
  hotspots: Hotspot[];
  driverLocation: DriverLocation | null;
  focusLocation?: DriverLocation | null;
  navigationOverlay?: NavigationOverlay | null;
  query: string;
  onQueryChange: (value: string) => void;
  searchSuggestions?: PlaceSuggestion[];
  isSearchLoading?: boolean;
  searchError?: string | null;
  onSelectSearchSuggestion?: (suggestion: PlaceSuggestion) => void;
  onSelectHotspot: (hotspot: Hotspot) => void;
  onRecenter: () => void;
}

export interface NavigationOverlay {
  status: Extract<NavigationStatus, "starting" | "active">;
  origin: DriverLocation;
  destination: DriverLocation;
  encodedPolyline?: string | null;
  arrivalTime?: string | null;
}

const DEFAULT_MAP_CENTER: DriverLocation = {
  lat: 51.5559,
  lng: -0.2793
};

const MAP_ZOOM = 13;
const TILE_SIZE = 256;

type PixelPosition = {
  left: number;
  top: number;
};

type MapSize = {
  width: number;
  height: number;
};

type OsmTile = {
  key: string;
  url: string;
  left: number;
  top: number;
};

interface RouteProjection {
  routePositions: PixelPosition[];
  originPosition: PixelPosition | null;
  destinationPosition: PixelPosition | null;
}

function isValidCoordinate(value: number) {
  return Number.isFinite(value) && value !== 0;
}

function isGoogleMapsErrorElement(element: HTMLElement) {
  const text = element.innerText.toLowerCase();

  return (
    text.includes("this page can't load google maps correctly") ||
    text.includes("this page didn't load google maps correctly") ||
    text.includes("oops! something went wrong") ||
    Boolean(element.querySelector(".gm-err-container, .gm-err-content, img[src*='icon_error']"))
  );
}

function toLatLngLiteral(location: DriverLocation): google.maps.LatLngLiteral {
  return {
    lat: location.lat,
    lng: location.lng
  };
}

function latLngToWorldPixel(location: DriverLocation, zoom: number) {
  const sinLat = Math.sin((Math.max(Math.min(location.lat, 85.05112878), -85.05112878) * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((location.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function projectStaticPosition(
  location: DriverLocation,
  center: DriverLocation,
  size: MapSize,
  zoom: number
): PixelPosition {
  const point = latLngToWorldPixel(location, zoom);
  const centerPoint = latLngToWorldPixel(center, zoom);

  return {
    left: size.width / 2 + point.x - centerPoint.x,
    top: size.height / 2 + point.y - centerPoint.y
  };
}

function interpolateLocation(
  origin: DriverLocation,
  destination: DriverLocation,
  progress: number
): DriverLocation {
  return {
    lat: origin.lat + (destination.lat - origin.lat) * progress,
    lng: origin.lng + (destination.lng - origin.lng) * progress
  };
}

function buildNavigationRoutePoints(overlay: NavigationOverlay | null | undefined) {
  if (!overlay) {
    return [];
  }

  if (overlay.status === "starting") {
    return [overlay.origin, interpolateLocation(overlay.origin, overlay.destination, 0.28)];
  }

  if (overlay.encodedPolyline) {
    const decoded = decodePolyline(overlay.encodedPolyline);
    if (decoded.length > 1) {
      return decoded;
    }
  }

  return [overlay.origin, overlay.destination];
}

function formatArrivalTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function pathFromPositions(positions: PixelPosition[]) {
  return positions
    .map((position, index) => `${index === 0 ? "M" : "L"} ${position.left.toFixed(1)} ${position.top.toFixed(1)}`)
    .join(" ");
}

function RouteOverlayLayer({
  overlay,
  projection
}: {
  overlay: NavigationOverlay | null | undefined;
  projection: RouteProjection;
}) {
  if (!overlay || !projection.originPosition || projection.routePositions.length < 2) {
    return null;
  }

  const arrival = formatArrivalTime(overlay.arrivalTime);
  const routePath = pathFromPositions(projection.routePositions);
  const showDestination = overlay.status === "active" && projection.destinationPosition;

  return (
    <div className="pointer-events-none absolute inset-0 z-[12]">
      <svg className="absolute inset-0 size-full overflow-visible">
        <path
          d={routePath}
          fill="none"
          stroke="#009B63"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1 8"
        />
      </svg>

      <div
        className="absolute"
        style={{
          left: projection.originPosition.left,
          top: projection.originPosition.top
        }}
      >
        <span className="absolute left-1/2 top-[-54px] -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1478FF] px-2 py-1.5 [font-family:Inter,sans-serif] text-[0.75rem] font-semibold leading-none tracking-[-0.03em] text-white shadow-[0_8px_18px_rgba(20,120,255,0.22)]">
          Your location
        </span>
        <span className="absolute left-1/2 top-[-40px] h-10 w-[3px] -translate-x-1/2 rounded-full bg-[#1478FF]" />
        <span className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-[#1478FF] bg-white shadow-[0_4px_12px_rgba(20,120,255,0.28)]" />
      </div>

      {showDestination ? (
        <div
          className="absolute"
          style={{
            left: projection.destinationPosition!.left,
            top: projection.destinationPosition!.top
          }}
        >
          {arrival ? (
            <span className="absolute left-1/2 top-[-48px] -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#009B63] px-2.5 py-1.5 [font-family:Inter,sans-serif] text-[0.75rem] font-semibold leading-none tracking-[-0.03em] text-white shadow-[0_8px_18px_rgba(0,155,99,0.22)]">
              Arrive by {arrival}
            </span>
          ) : null}
          <span className="absolute left-1/2 top-1/2 size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-[#009B63] bg-white shadow-[0_5px_16px_rgba(0,155,99,0.24)]" />
        </div>
      ) : null}
    </div>
  );
}

function buildOsmTiles(center: DriverLocation, size: MapSize, zoom: number): OsmTile[] {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const centerPoint = latLngToWorldPixel(center, zoom);
  const topLeft = {
    x: centerPoint.x - size.width / 2,
    y: centerPoint.y - size.height / 2
  };
  const minTileX = Math.floor(topLeft.x / TILE_SIZE) - 1;
  const maxTileX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1;
  const minTileY = Math.floor(topLeft.y / TILE_SIZE) - 1;
  const maxTileY = Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1;
  const tileCount = 2 ** zoom;
  const tiles: OsmTile[] = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileCount) {
        continue;
      }

      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}-${wrappedX}-${y}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - topLeft.x,
        top: y * TILE_SIZE - topLeft.y
      });
    }
  }

  return tiles.filter((tile) => tile.left > -TILE_SIZE && tile.left < size.width + TILE_SIZE && tile.top > -TILE_SIZE && tile.top < size.height + TILE_SIZE && Number.isFinite(worldSize));
}

export function MapContainer({
  hotspots,
  driverLocation,
  focusLocation = null,
  navigationOverlay = null,
  query,
  onQueryChange,
  searchSuggestions,
  isSearchLoading,
  searchError,
  onSelectSearchSuggestion,
  onSelectHotspot,
  onRecenter
}: MapContainerProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const hotspotsRef = useRef(hotspots);
  const driverLocationRef = useRef(driverLocation);
  const navigationOverlayRef = useRef(navigationOverlay);
  const routePointsRef = useRef<DriverLocation[]>([]);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapProvider, setMapProvider] = useState<"google" | "osm">("google");
  const [mapSize, setMapSize] = useState<MapSize>({ width: 390, height: 552 });
  const [pinPositions, setPinPositions] = useState<Record<string, PixelPosition>>({});
  const [driverPosition, setDriverPosition] = useState<PixelPosition | null>(null);
  const [routeProjection, setRouteProjection] = useState<RouteProjection>({
    routePositions: [],
    originPosition: null,
    destinationPosition: null
  });

  const mapCenter = useMemo<DriverLocation>(() => {
    if (
      navigationOverlay &&
      isValidCoordinate(navigationOverlay.origin.lat) &&
      isValidCoordinate(navigationOverlay.origin.lng) &&
      isValidCoordinate(navigationOverlay.destination.lat) &&
      isValidCoordinate(navigationOverlay.destination.lng)
    ) {
      return interpolateLocation(navigationOverlay.origin, navigationOverlay.destination, 0.5);
    }

    if (focusLocation && isValidCoordinate(focusLocation.lat) && isValidCoordinate(focusLocation.lng)) {
      return focusLocation;
    }

    if (driverLocation && isValidCoordinate(driverLocation.lat) && isValidCoordinate(driverLocation.lng)) {
      return driverLocation;
    }

    const firstHotspot = hotspots.find(
      (hotspot) => isValidCoordinate(hotspot.lat) && isValidCoordinate(hotspot.lng)
    );

    return firstHotspot ? { lat: firstHotspot.lat, lng: firstHotspot.lng } : DEFAULT_MAP_CENTER;
  }, [driverLocation, focusLocation, hotspots, navigationOverlay]);

  useEffect(() => {
    hotspotsRef.current = hotspots;
    driverLocationRef.current = driverLocation;
  }, [driverLocation, hotspots]);

  const routePoints = useMemo(
    () => buildNavigationRoutePoints(navigationOverlay),
    [navigationOverlay]
  );

  useEffect(() => {
    navigationOverlayRef.current = navigationOverlay;
    routePointsRef.current = routePoints;
  }, [navigationOverlay, routePoints]);

  const osmTiles = useMemo(
    () => buildOsmTiles(mapCenter, mapSize, MAP_ZOOM),
    [mapCenter, mapSize]
  );

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const updateSize = () => {
      const rect = mapElementRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setMapSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(mapElementRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let idleListener: google.maps.MapsEventListener | null = null;
    let boundsListener: google.maps.MapsEventListener | null = null;
    let authCheckTimer: number | null = null;
    let authFailureObserver: MutationObserver | null = null;

    const useTileFallback = () => {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      mapRef.current = null;
      setMapProvider("osm");
      setMapStatus("ready");
    };

    const hasGoogleAuthError = () =>
      Boolean(window.__ridespotGoogleMapsAuthFailed) ||
      Boolean(mapElementRef.current && isGoogleMapsErrorElement(mapElementRef.current));

    const handleGoogleAuthFailure = () => {
      if (!cancelled) {
        useTileFallback();
      }
    };

    const updateProjectedPositions = () => {
      const map = mapRef.current;
      const overlay = overlayRef.current;
      const projection = overlay?.getProjection();

      if (!map || !projection) {
        return;
      }

      const nextPositions: Record<string, PixelPosition> = {};

      hotspotsRef.current.forEach((hotspot) => {
        if (!isValidCoordinate(hotspot.lat) || !isValidCoordinate(hotspot.lng)) {
          return;
        }

        const point = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(hotspot.lat, hotspot.lng)
        );

        if (point) {
          nextPositions[hotspot.id] = {
            left: point.x,
            top: point.y
          };
        }
      });

      const currentDriverLocation = driverLocationRef.current;
      if (
        currentDriverLocation &&
        isValidCoordinate(currentDriverLocation.lat) &&
        isValidCoordinate(currentDriverLocation.lng)
      ) {
        const point = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(currentDriverLocation.lat, currentDriverLocation.lng)
        );
        setDriverPosition(point ? { left: point.x, top: point.y } : null);
      } else {
        setDriverPosition(null);
      }

      const currentNavigationOverlay = navigationOverlayRef.current;
      const currentRoutePoints = routePointsRef.current;
      if (currentNavigationOverlay && currentRoutePoints.length > 1) {
        const routePositions = currentRoutePoints
          .map((point) =>
            projection.fromLatLngToContainerPixel(new google.maps.LatLng(point.lat, point.lng))
          )
          .filter((point): point is google.maps.Point => Boolean(point))
          .map((point) => ({ left: point.x, top: point.y }));

        const originPoint = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(currentNavigationOverlay.origin.lat, currentNavigationOverlay.origin.lng)
        );
        const destinationPoint = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(
            currentNavigationOverlay.destination.lat,
            currentNavigationOverlay.destination.lng
          )
        );

        setRouteProjection({
          routePositions,
          originPosition: originPoint ? { left: originPoint.x, top: originPoint.y } : null,
          destinationPosition: destinationPoint
            ? { left: destinationPoint.x, top: destinationPoint.y }
            : null
        });
      } else {
        setRouteProjection({
          routePositions: [],
          originPosition: null,
          destinationPosition: null
        });
      }

      setPinPositions(nextPositions);
    };

    window.addEventListener("ridespot:google-maps-auth-failure", handleGoogleAuthFailure);

    if (mapElementRef.current) {
      authFailureObserver = new MutationObserver(() => {
        if (!cancelled && hasGoogleAuthError()) {
          useTileFallback();
        }
      });
      authFailureObserver.observe(mapElementRef.current, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    loadGooglePlaces()
      .then(() => {
        if (cancelled || !mapElementRef.current) {
          return;
        }

        if (hasGoogleAuthError()) {
          useTileFallback();
          return;
        }

        const map = new google.maps.Map(mapElementRef.current, {
          center: toLatLngLiteral(mapCenter),
          zoom: MAP_ZOOM,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: RIDESPOT_MAP_STYLE,
          backgroundColor: "#EDF1F7"
        });

        const overlay = new google.maps.OverlayView();
        overlay.onAdd = () => undefined;
        overlay.draw = updateProjectedPositions;
        overlay.onRemove = () => undefined;
        overlay.setMap(map);

        mapRef.current = map;
        overlayRef.current = overlay;
        idleListener = map.addListener("idle", updateProjectedPositions);
        boundsListener = map.addListener("bounds_changed", updateProjectedPositions);
        setMapStatus("ready");

        let authCheckCount = 0;
        authCheckTimer = window.setInterval(() => {
          if (cancelled || !mapElementRef.current) {
            return;
          }

          authCheckCount += 1;
          if (hasGoogleAuthError()) {
            useTileFallback();
            if (authCheckTimer) {
              window.clearInterval(authCheckTimer);
              authCheckTimer = null;
            }
          } else if (authCheckCount >= 10 && authCheckTimer) {
            window.clearInterval(authCheckTimer);
            authCheckTimer = null;
          }
        }, 1000);
      })
      .catch(() => {
        if (!cancelled) {
          useTileFallback();
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener("ridespot:google-maps-auth-failure", handleGoogleAuthFailure);
      authFailureObserver?.disconnect();
      idleListener?.remove();
      boundsListener?.remove();
      if (authCheckTimer) {
        window.clearInterval(authCheckTimer);
      }
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.panTo(toLatLngLiteral(mapCenter));
  }, [mapCenter]);

  useEffect(() => {
    const map = mapRef.current;
    const projection = overlayRef.current?.getProjection();

    if (!map || !projection) {
      return;
    }

    const nextPositions: Record<string, PixelPosition> = {};
    hotspots.forEach((hotspot) => {
      if (!isValidCoordinate(hotspot.lat) || !isValidCoordinate(hotspot.lng)) {
        return;
      }

      const point = projection.fromLatLngToContainerPixel(
        new google.maps.LatLng(hotspot.lat, hotspot.lng)
      );
      if (point) {
        nextPositions[hotspot.id] = {
          left: point.x,
          top: point.y
        };
      }
    });

    setPinPositions(nextPositions);

    if (driverLocation && isValidCoordinate(driverLocation.lat) && isValidCoordinate(driverLocation.lng)) {
      const point = projection.fromLatLngToContainerPixel(
        new google.maps.LatLng(driverLocation.lat, driverLocation.lng)
      );
      setDriverPosition(point ? { left: point.x, top: point.y } : null);
    } else {
      setDriverPosition(null);
    }

    if (navigationOverlay && routePoints.length > 1) {
      const nextRoutePositions = routePoints
        .map((point) =>
          projection.fromLatLngToContainerPixel(new google.maps.LatLng(point.lat, point.lng))
        )
        .filter((point): point is google.maps.Point => Boolean(point))
        .map((point) => ({ left: point.x, top: point.y }));
      const originPoint = projection.fromLatLngToContainerPixel(
        new google.maps.LatLng(navigationOverlay.origin.lat, navigationOverlay.origin.lng)
      );
      const destinationPoint = projection.fromLatLngToContainerPixel(
        new google.maps.LatLng(navigationOverlay.destination.lat, navigationOverlay.destination.lng)
      );

      setRouteProjection({
        routePositions: nextRoutePositions,
        originPosition: originPoint ? { left: originPoint.x, top: originPoint.y } : null,
        destinationPosition: destinationPoint
          ? { left: destinationPoint.x, top: destinationPoint.y }
          : null
      });
    } else {
      setRouteProjection({
        routePositions: [],
        originPosition: null,
        destinationPosition: null
      });
    }
  }, [driverLocation, hotspots, mapStatus, navigationOverlay, routePoints]);

  useEffect(() => {
    if (mapProvider !== "osm") {
      return;
    }

    const nextPositions: Record<string, PixelPosition> = {};
    hotspots.forEach((hotspot) => {
      if (!isValidCoordinate(hotspot.lat) || !isValidCoordinate(hotspot.lng)) {
        return;
      }

      nextPositions[hotspot.id] = projectStaticPosition(
        { lat: hotspot.lat, lng: hotspot.lng },
        mapCenter,
        mapSize,
        MAP_ZOOM
      );
    });

    setPinPositions(nextPositions);

    if (driverLocation && isValidCoordinate(driverLocation.lat) && isValidCoordinate(driverLocation.lng)) {
      setDriverPosition(projectStaticPosition(driverLocation, mapCenter, mapSize, MAP_ZOOM));
    } else {
      setDriverPosition(null);
    }

    if (navigationOverlay && routePoints.length > 1) {
      setRouteProjection({
        routePositions: routePoints.map((point) =>
          projectStaticPosition(point, mapCenter, mapSize, MAP_ZOOM)
        ),
        originPosition: projectStaticPosition(navigationOverlay.origin, mapCenter, mapSize, MAP_ZOOM),
        destinationPosition: projectStaticPosition(
          navigationOverlay.destination,
          mapCenter,
          mapSize,
          MAP_ZOOM
        )
      });
    } else {
      setRouteProjection({
        routePositions: [],
        originPosition: null,
        destinationPosition: null
      });
    }
  }, [driverLocation, hotspots, mapCenter, mapProvider, mapSize, navigationOverlay, routePoints]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#EDF1F7]">
      <div ref={mapElementRef} className={mapProvider === "google" ? "absolute inset-0" : "absolute inset-0 opacity-0"} />

      {mapProvider === "osm" ? (
        <div className="absolute inset-0 bg-[#E7EEF4]">
          {osmTiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              aria-hidden="true"
              className="absolute size-64 select-none"
              draggable={false}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
          <div className="pointer-events-none absolute inset-0 bg-white/10" />
          <div className="absolute bottom-24 left-4 rounded-full bg-white/90 px-2 py-1 text-[0.62rem] font-semibold text-[#6B7280] shadow-sm">
            Live map fallback
          </div>
        </div>
      ) : null}

      {mapStatus === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#EDF1F7] text-[0.84rem] font-semibold text-[#6B7280]">
          Loading live map...
        </div>
      ) : null}

      {mapStatus === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#EDF1F7] px-6 text-center text-[0.84rem] font-semibold text-[#6B7280]">
          Live map is temporarily unavailable. Hotspot data is still available below.
        </div>
      ) : null}

      <div className="absolute inset-x-4 top-3 z-20">
        <MapSearchBar
          value={query}
          onChange={onQueryChange}
          suggestions={searchSuggestions}
          isLoading={isSearchLoading}
          error={searchError}
          onSelectSuggestion={onSelectSearchSuggestion}
        />
      </div>

      <RouteOverlayLayer overlay={navigationOverlay} projection={routeProjection} />

      <div className="pointer-events-none absolute inset-0 z-10">
        {hotspots.map((hotspot) => {
          const position = pinPositions[hotspot.id];
          if (!position) {
            return null;
          }

          return (
            <DemandPin
              key={hotspot.id}
              hotspot={hotspot}
              className="pointer-events-auto -translate-x-1/2 -translate-y-full"
              style={position}
              onClick={onSelectHotspot}
            />
          );
        })}

        {driverPosition ? (
          <DriverPin
            className="pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={driverPosition}
          />
        ) : null}
      </div>

      <div className="absolute right-4 z-30" style={{ bottom: "calc(31% + 0.75rem)" }}>
        <RecenterButton onClick={onRecenter} />
      </div>
    </div>
  );
}
