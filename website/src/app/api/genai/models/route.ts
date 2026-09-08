import { NextResponse } from "next/server";
import { isGenAIProviderId, runProviderListModels } from "@/lib/genai";

export async function POST(request: Request) {
  let body: { provider?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const provider = isGenAIProviderId(body.provider) ? body.provider : null;
  if (!provider) {
    return NextResponse.json({ error: "Unknown AI provider." }, { status: 400 });
  }
  if (!body.apiKey || typeof body.apiKey !== "string") {
    return NextResponse.json({ error: "An API key is required." }, { status: 400 });
  }

  try {
    const models = await runProviderListModels(provider, body.apiKey);
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
