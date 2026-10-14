import { redirect } from "next/navigation";

/**
 * Legacy local/GitHub/temporary project UI lived here. Product storage is
 * Firestore + GCS with Hocuspocus realtime only — send everyone to /cloud.
 */
export default function CatchAllRedirect() {
  redirect("/cloud");
}
