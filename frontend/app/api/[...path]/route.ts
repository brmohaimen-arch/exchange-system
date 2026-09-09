// Hand-written proxy to the FastAPI backend, replacing next.config.mjs's rewrites()-based
// proxy. That approach baked BACKEND_URL into a static build-time manifest and, separately,
// mishandled headers (e.g. Host) when relaying to a different origin, causing the backend's
// Apache front end to reject the request with a bare 400. A Route Handler reads
// process.env.BACKEND_URL fresh on every request (works correctly at runtime, no rebuild
// needed to change it) and we build the outgoing fetch() ourselves, so its Host header is
// naturally correct for the destination instead of inherited from the incoming request.
import { NextRequest, NextResponse } from 'next/server'

// Allowlist, not a blocklist: forwarding everything the browser sent (as the previous
// version did) also forwards Next.js's own internal routing headers — rsc,
// next-router-state-tree, next-router-prefetch, next-router-segment-prefetch — onto the
// backend. Their values are URL-encoded, bracket/quote-heavy serialized route trees that
// generic WAF signatures on the backend's own Apache/ModSecurity read as suspicious
// payloads and reject with a bare 400. The backend only ever needs these two.
const FORWARDED_REQUEST_HEADERS = ['content-type', 'authorization']
const HOP_BY_HOP_RESPONSE_HEADERS = new Set(['connection', 'content-encoding', 'transfer-encoding'])

async function proxy(request: NextRequest, params: { path: string[] }) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const targetPath = params.path.join('/')
  const search = request.nextUrl.search
  const targetUrl = `${backendUrl}/api/${targetPath}${search}`
  console.log(`[proxy] ${request.method} ${targetUrl} — handler invoked`)

  try {
    const headers = new Headers()
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }

    const hasBody = !['GET', 'HEAD'].includes(request.method)
    const body = hasBody ? await request.arrayBuffer() : undefined

    const backendRes = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    })
    console.log(`[proxy] ${request.method} ${targetUrl} — backend responded ${backendRes.status}`)

    const resHeaders = new Headers()
    backendRes.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value)
    })

    const resBody = await backendRes.arrayBuffer()
    return new NextResponse(resBody, { status: backendRes.status, headers: resHeaders })
  } catch (err) {
    console.error(`[proxy] ${request.method} ${targetUrl} — FAILED:`, err)
    return NextResponse.json({ proxyError: String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 502 })
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params)
}
export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params)
}
export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params)
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params)
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params)
}
