import type { PlatformRole, UserGrants } from "@engineering-notebook/shared";

export interface SessionUser {
  uid: string;
  email?: string;
  displayName?: string;
  platformRole?: PlatformRole;
  grants?: UserGrants;
}

export interface AuthPort {
  verifySession(token: string): Promise<SessionUser>;
}
