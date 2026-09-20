export interface SessionUser {
  uid: string;
  email?: string;
  platformRole?: "service_admin";
  grants?: Record<string, boolean>;
}

export interface AuthPort {
  verifySession(token: string): Promise<SessionUser>;
}
