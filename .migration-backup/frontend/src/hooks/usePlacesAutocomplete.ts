"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fallbackPlaceSuggestions,
  getPlaceDetails,
  loadGooglePlaces,
  mapPrediction,
  marketPlaceSuggestions,
  type PlaceSuggestion,
  type SelectedPlace
} from "@/lib/googlePlaces";

export function usePlacesAutocomplete() {
  const [value, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const selectedDescriptionRef = useRef<string | null>(null);

  const setValue = useCallback((nextValue: string) => {
    selectedDescriptionRef.current = null;
    setSelectedPlace(null);
    setInputValue(nextValue);
  }, []);

  useEffect(() => {
    const query = value.trim();

    if (query.length < 2 || selectedDescriptionRef.current === query) {
      setSuggestions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const useFallbackSearch = async () => {
      const fallbackSuggestions = await fallbackPlaceSuggestions(query);
      if (cancelled) {
        return;
      }

      setSuggestions(fallbackSuggestions);
      setError(fallbackSuggestions.length ? null : "No matching areas found.");
      setIsLoading(false);
    };

    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      const marketSuggestions = marketPlaceSuggestions(query);
      if (marketSuggestions.length) {
        setSuggestions(marketSuggestions);
        setError(null);
        setIsLoading(false);
      }

      loadGooglePlaces()
        .then(() => {
          if (cancelled) {
            return;
          }

          sessionTokenRef.current ??= new google.maps.places.AutocompleteSessionToken();
          const service = new google.maps.places.AutocompleteService();

          service.getPlacePredictions(
            {
              input: query,
              componentRestrictions: { country: ["ng", "gb"] },
              sessionToken: sessionTokenRef.current
            },
            (predictions, status) => {
              if (cancelled) {
                return;
              }

              setIsLoading(false);

              if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                setSuggestions([]);
                return;
              }

              if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
                if (!marketSuggestions.length) {
                  void useFallbackSearch();
                }
                return;
              }

              setSuggestions(predictions.slice(0, 5).map(mapPrediction));
            }
          );
        })
        .catch(() => {
          if (!cancelled) {
            void useFallbackSearch();
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [value]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  const selectSuggestion = useCallback(async (suggestion: PlaceSuggestion) => {
    selectedDescriptionRef.current = suggestion.description;
    setInputValue(suggestion.description);
    setSuggestions([]);
    setError(null);
    setIsLoading(true);

    try {
      if (suggestion.location) {
        const place: SelectedPlace = {
          placeId: suggestion.placeId,
          name: suggestion.mainText,
          address: suggestion.description,
          location: suggestion.location
        };
        setSelectedPlace(place);
        sessionTokenRef.current = null;
        return place;
      }

      const place = await getPlaceDetails(suggestion.placeId);
      setSelectedPlace(place);
      sessionTokenRef.current = null;
      return place;
    } catch {
      const fallbackPlace: SelectedPlace = {
        placeId: suggestion.placeId,
        name: suggestion.mainText,
        address: suggestion.description,
        location: null
      };
      setSelectedPlace(fallbackPlace);
      return fallbackPlace;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    value,
    setValue,
    suggestions,
    selectedPlace,
    isLoading,
    error,
    clearSuggestions,
    selectSuggestion
  };
}
