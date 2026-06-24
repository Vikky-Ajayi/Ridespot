# RideSpot

Real-time demand intelligence for ride-hailing drivers in Nigeria — shows hotspots, surge zones, and peak hours so every kilometer driven counts.

## Run & Operate

- `pnpm --filter @workspace/ridespot run dev` — run the frontend (artifacts/ridespot)
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/ridespot)
- Routing: wouter
- Styling: Tailwind CSS v4
- State: Zustand
- Forms: react-hook-form + zod
- Maps: @react-google-maps/api + @googlemaps/js-api-loader
- Real-time: socket.io-client
- Fonts: @fontsource/inter, @fontsource/manrope
- API: Express 5 (artifacts/api-server, largely unused — app calls external backend)

## Where things live

- `artifacts/ridespot/src/App.tsx` — main router (wouter Switch/Route)
- `artifacts/ridespot/src/app/` — page components (Next.js App Router structure preserved)
- `artifacts/ridespot/src/components/` — shared UI, layout, admin, landing components
- `artifacts/ridespot/src/hooks/` — custom hooks (useAuth, useHotspots, useDriverLocation, etc.)
- `artifacts/ridespot/src/store/` — Zustand stores (auth, hotspot, modal, navigation)
- `artifacts/ridespot/src/services/` — API service repositories
- `artifacts/ridespot/src/index.css` — Tailwind v4 theme + brand colors
- `artifacts/ridespot/src/app/globals.css` — original global CSS (imported by App.tsx)

## Architecture decisions

- Migrated from Next.js App Router to Vite + React with wouter routing.
- `next/link` → `<Link>` from wouter; `next/image` → `<img>`; `useRouter` → `useLocation` from wouter.
- All NEXT_PUBLIC_ env vars renamed to VITE_ equivalents.
- The app calls an external backend API (configured via VITE_API_URL env var) — no internal API routes.
- `"use client"` directives stripped throughout (not needed in Vite).

## Product

- Landing page with pricing, features, how-it-works, FAQ, testimonials
- Driver auth flow: register, login, OTP verification, forgot/reset password
- Authenticated app: real-time hotspot map, demand heatmap, profile management
- Admin panel: hotspot management, driver overview, events, notifications, ML status, market config

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- App uses an external backend API (not the internal api-server). Set VITE_API_URL secret to your backend URL.
- Firebase push notifications require VITE_FIREBASE_* environment variables.
- Google Maps requires VITE_GOOGLE_MAPS_API_KEY environment variable.
- The app is a PWA — service worker is only registered in production builds.
- Do NOT run `pnpm dev` or `pnpm run dev` at workspace root — use `pnpm --filter @workspace/ridespot run dev`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
