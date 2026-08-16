import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  let targetUrl = req.nextUrl.searchParams.get('url');

  if (!targetUrl) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      targetUrl = parsed.searchParams.get('url');
    } catch {
      // ignore
    }
  }

  // Fallback: If rewritten from /busytex/... or /latex/..., reconstruct from pathname
  if (!targetUrl) {
    const pathname = req.nextUrl.pathname;
    if (pathname.startsWith('/busytex/') || pathname.startsWith('/latex/')) {
      const filename = pathname.split('/').slice(2).join('/');
      const version = process.env.NEXT_PUBLIC_APP_VERSION || 'v0.2.0';
      targetUrl = `https://github.com/msoe-vex/engineering-notebook-editor/releases/download/${version}/${filename}`;
    }
  }

  if (!targetUrl) {
    console.error('[busytex-proxy] Missing target URL. req.url:', req.url, 'pathname:', req.nextUrl.pathname);
    return new Response('Missing URL parameter', { status: 400 });
  }

  // Only allow proxying from our own GitHub repo for security
  if (!targetUrl.startsWith('https://github.com/msoe-vex/engineering-notebook-editor/')) {
    return new Response('Unauthorized proxy target', { status: 403 });
  }

  console.log(`[busytex-proxy] Proxying request: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Engineering-Notebook-Editor-Proxy',
      }
    });
    
    if (!response.ok) {
      console.error(`[busytex-proxy] GitHub returned ${response.status} ${response.statusText} for URL: ${targetUrl}`);
      return new Response(`Failed to fetch from GitHub (${response.status} ${response.statusText}): ${targetUrl}`, { status: response.status });
    }

    // Determine the correct Content-Type based on the extension
    let contentType = 'application/octet-stream';
    if (targetUrl.endsWith('.js')) {
      contentType = 'application/javascript';
    } else if (targetUrl.endsWith('.wasm')) {
      contentType = 'application/wasm';
    } else if (targetUrl.endsWith('.json')) {
      contentType = 'application/json';
    } else if (targetUrl.endsWith('.tex') || targetUrl.endsWith('.sty') || targetUrl.endsWith('.cls') || targetUrl.endsWith('.def')) {
      contentType = 'text/plain; charset=utf-8';
    }

    // Stream the response back to the client with CORS headers
    return new Response(response.body, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
        'Content-Length': response.headers.get('Content-Length') || '',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[busytex-proxy] Fetch error for ${targetUrl}:`, error);
    return new Response(`Proxy error: ${errorMessage}`, { status: 500 });
  }
}
