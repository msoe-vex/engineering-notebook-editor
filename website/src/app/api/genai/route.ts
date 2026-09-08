import { NextResponse } from "next/server";
import { isGenAIProviderId, runProviderGenerate } from "@/lib/genai";

const MAX_PROMPT = 12_000;

export async function POST(request: Request) {
  let body: {
    provider?: string;
    apiKey?: string;
    model?: string;
    prompt?: string;
    temperature?: number;
    images?: Array<{ mimeType?: string; base64?: string }>;
  };
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
  if (!body.model || typeof body.model !== "string" || !body.model.trim()) {
    return NextResponse.json({ error: "Choose a model in Settings before generating titles and captions." }, { status: 400 });
  }
  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  const prompt = body.prompt.slice(0, MAX_PROMPT);
  const images = (body.images || [])
    .filter((image): image is { mimeType: string; base64: string } =>
      typeof image?.mimeType === "string" && typeof image?.base64 === "string",
    )
    .slice(0, 1);

  try {
    const text = await runProviderGenerate(
      provider,
      body.apiKey,
      typeof body.model === "string" ? body.model : "",
      prompt,
      images,
      typeof body.temperature === "number" ? body.temperature : undefined,
    );
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
