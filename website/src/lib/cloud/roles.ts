/** Product-facing role labels (locked plan vocabulary). */

export type OrgRoleId = "owner" | "admin" | "member";

export function orgRoleLabel(role: string | undefined | null): string {
  switch (role) {
    case "owner":
      return "Org Owner";
    case "admin":
      return "Org Admin";
    case "member":
      return "Org Member";
    default:
      return role || "Member";
  }
}

export function platformRoleLabel(role: string | undefined | null): string {
  if (role === "service_admin") return "Service Administrator";
  return "User";
}

export function isOrgAdminRole(role: string | undefined | null): boolean {
  return role === "owner" || role === "admin";
}
