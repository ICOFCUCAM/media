/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint is enforced separately in CI; don't fail the Vercel build on it.
  eslint: { ignoreDuringBuilds: true },
  // The Ads Studio's website analysis (app/api/ads/analyse, docs/47) runs the
  // shared intelligence layer, which ships as TypeScript source.
  transpilePackages: ["@cineforge/movie"],
};

export default nextConfig;
