import { NextRequest } from 'next/server';

export const runtime = 'edge'; // Edge runtime supports streaming large responses without the 10MB limit

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  
  if (!url) {
    return new Response('Missing URL parameter', { status: 400 });
  }

  // Only allow proxying from our own GitHub repo for security
  if (!url.startsWith('https://github.com/msoe-vex/engineering-notebook-editor/')) {
    return new Response('Unauthorized proxy target', { status: 403 });
  }

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      return new Response(`Failed to fetch from GitHub: ${response.statusText}`, { status: response.status });
    }

    // Determine the correct Content-Type based on the extension
    let contentType = 'application/octet-stream';
    if (url.endsWith('.js')) {
      contentType = 'application/javascript';
    } else if (url.endsWith('.wasm')) {
      contentType = 'application/wasm';
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
  } catch (error: any) {
    return new Response(`Proxy error: ${error.message}`, { status: 500 });
  }
}
