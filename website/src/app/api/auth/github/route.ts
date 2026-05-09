import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { code } = await request.json();

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('GitHub OAuth Configuration Error: Missing NEXT_PUBLIC_GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
    return NextResponse.json({ error: 'GitHub OAuth environment variables not configured.' }, { status: 500 });
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return NextResponse.json({ error: data.error_description || data.error }, { status: 400 });
    }

    return NextResponse.json({ access_token: data.access_token });
  } catch (error) {
    console.error('GitHub OAuth Exchange Exception:', error);
    const message = error instanceof Error ? error.message : 'Failed to exchange code for token';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
