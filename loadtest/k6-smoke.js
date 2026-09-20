import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "10s",
};

export default function () {
  const core = http.get("http://localhost:8080/health");
  check(core, { "core health 200": (r) => r.status === 200 });

  const agents = http.get("http://localhost:8000/health");
  check(agents, { "agents health 200": (r) => r.status === 200 });

  sleep(1);
}
