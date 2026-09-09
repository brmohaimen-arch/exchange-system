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
  async rewrites() {
    // IMPORTANT: this function runs once at `next build` time — its return value is
    // baked as a static destination into .next/routes-manifest.json. Setting
    // BACKEND_URL in the hosting platform's *runtime* environment variables (e.g.
    // cPanel's Node.js App panel) has no effect on this; it must be set in the
    // environment that actually runs `npm run build`, or the previous build-time
    // value (here, the localhost fallback) stays baked in regardless.
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      {
        // Proxy all /api/* requests to the backend service
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
