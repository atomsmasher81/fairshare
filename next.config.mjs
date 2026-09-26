/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build run next to `next dev` without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
