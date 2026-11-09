/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {cpus: 2},
  typescript: {tsconfigPath: process.env.NEXT_TSCONFIG || 'tsconfig.json'},
  images: { unoptimized: true },
};

module.exports = nextConfig;
