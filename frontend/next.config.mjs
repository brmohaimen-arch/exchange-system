import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // /api/* is proxied to the backend by app/api/[...path]/route.ts instead of a
  // rewrites() config — that approach resolved BACKEND_URL at build time (frozen into
  // routes-manifest.json, ignoring the hosting platform's runtime env vars) and could
  // mishandle headers like Host when relaying cross-origin. A Route Handler reads
  // process.env.BACKEND_URL fresh per request and builds the outgoing request itself.
}

export default nextConfig
