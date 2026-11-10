/** @type {import('next').NextConfig} */
const nextConfig = {
experimental: {
    cpus: 1,
},
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
