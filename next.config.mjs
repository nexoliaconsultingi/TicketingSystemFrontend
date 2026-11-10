/** @type {import('next').NextConfig} */

const nextConfig = {
  trailingSlash: true,

  // Réduit le nombre de processus utilisés pendant le build
  experimental: {
    cpus: 1,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;