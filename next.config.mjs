/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build run next to `next dev` without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Keep pages you've just visited for 30s so switching tabs back is instant.
    // Anything you change calls router.refresh(), and pull-to-refresh forces fresh data.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
