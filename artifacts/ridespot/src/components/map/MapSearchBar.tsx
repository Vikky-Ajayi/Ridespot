

import { Search } from "lucide-react";
import type { PlaceSuggestion } from "@/lib/googlePlaces";

export interface MapSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: PlaceSuggestion[];
  isLoading?: boolean;
  error?: string | null;
  onSelectSuggestion?: (suggestion: PlaceSuggestion) => void;
}

export function MapSearchBar({
  value,
  onChange,
  suggestions = [],
  isLoading = false,
  error = null,
  onSelectSuggestion
}: MapSearchBarProps) {
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="pointer-events-auto relative">
      <div className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(17,24,39,0.16)]">
        <Search className="size-6 text-[#6B7280]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && suggestions[0] && onSelectSuggestion) {
              event.preventDefault();
              onSelectSuggestion(suggestions[0]);
            }
          }}
          placeholder="Search areas, streets, landmarks"
          className="w-full border-0 bg-transparent text-[1rem] text-ink outline-none placeholder:text-[#71717A]"
        />
      </div>

      {hasSuggestions || isLoading || error ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[18px] bg-white shadow-[0_12px_30px_rgba(17,24,39,0.18)]">
          {isLoading ? (
            <div className="px-4 py-3 text-[0.86rem] font-medium text-[#6B7280]">Searching...</div>
          ) : null}

          {!isLoading && error ? (
            <div className="px-4 py-3 text-[0.86rem] font-medium text-[#EF4444]">{error}</div>
          ) : null}

          {!isLoading && !error
            ? suggestions.map((suggestion) => (
                <button
                  key={suggestion.placeId}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectSuggestion?.(suggestion)}
                  className="block w-full border-b border-[#EEF0F3] px-4 py-3 text-left last:border-b-0 hover:bg-[#F6F7F9]"
                >
                  <span className="block truncate text-[0.92rem] font-semibold text-ink">
                    {suggestion.mainText}
                  </span>
                  {suggestion.secondaryText ? (
                    <span className="mt-1 block truncate text-[0.78rem] font-medium text-[#6B7280]">
                      {suggestion.secondaryText}
                    </span>
                  ) : null}
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
