import {
  memberPath,
  type OrgRole,
  type PlatformRole,
} from "@engineering-notebook/shared";
import type { SessionUser } from "./auth/authPort.js";
import { getFirestore } from "./db/firestore.js";

const ROLE_RANK: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function isServiceAdmin(user: SessionUser): boolean {
  return user.platformRole === "service_admin";
}

export async function getOrgRole(orgId: string, uid: string): Promise<OrgRole | null> {
  const snap = await getFirestore().doc(memberPath(orgId, uid)).get();
  if (!snap.exists) return null;
  return (snap.data()?.role as OrgRole) ?? null;
}

export async function requireOrgMember(
  user: SessionUser,
  orgId: string,
  minRole: OrgRole = "member"
): Promise<OrgRole> {
  if (isServiceAdmin(user)) return "owner";
  const role = await getOrgRole(orgId, user.uid);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return role;
}

export function requireServiceAdmin(user: SessionUser): void {
  if (!isServiceAdmin(user)) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

export type { PlatformRole };
