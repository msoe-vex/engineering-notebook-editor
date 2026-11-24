import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ error: "Missing uid parameter" }, { status: 400 });
  }

  // Only allow in non-production or when DEV_ADMIN_DELETE is enabled
  const isDev = process.env.NODE_ENV !== "production" || process.env.DEV_ADMIN_DELETE === "true";
  if (!isDev) {
    return NextResponse.json(
      { error: "User deletion is only available in development mode" },
      { status: 403 },
    );
  }

  try {
    const ctx = await auth.$context;
    // Delete user and cascade delete their accounts and sessions in Better Auth
    await ctx.internalAdapter.deleteUser(uid);
    return NextResponse.json({ status: "deleted", uid });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user in Better Auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
