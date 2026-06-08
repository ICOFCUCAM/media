/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint is enforced separately in CI; don't fail the Vercel build on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
