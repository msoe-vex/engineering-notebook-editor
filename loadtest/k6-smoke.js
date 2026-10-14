import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "10s",
};

const token = __ENV.AUTH_TOKEN || "service-admin";
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

export default function () {
  const core = http.get("http://localhost:8080/health");
  check(core, { "core health 200": (r) => r.status === 200 });

  const agents = http.get("http://localhost:8000/health");
  check(agents, { "agents health 200": (r) => r.status === 200 });

  const session = http.get("http://localhost:8080/auth/session", { headers });
  check(session, { "auth session 200": (r) => r.status === 200 });

  const orgs = http.get("http://localhost:8080/orgs", { headers });
  check(orgs, { "list orgs 200": (r) => r.status === 200 });

  sleep(1);
}
