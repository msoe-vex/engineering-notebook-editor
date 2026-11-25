import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { newPassword?: string };
    const newPassword = body.newPassword;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    await auth.api.setPassword({
      body: { newPassword },
      headers: request.headers,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = (err as Error)?.message || "Failed to set password.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
