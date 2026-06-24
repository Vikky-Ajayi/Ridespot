const runtimeCaching = require("next-pwa/cache");
const disablePwa =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_DISABLE_PWA === "true";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: disablePwa,
  register: false,
  skipWaiting: true,
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    ...runtimeCaching,
    {
      urlPattern: /^https?:\/\/.*\/services\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "ridespot-api-cache",
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: 60 * 60 * 24
        },
        networkTimeoutSeconds: 8
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "true"
  },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  images: {
    remotePatterns: []
  }
};

module.exports = withPWA(nextConfig);
