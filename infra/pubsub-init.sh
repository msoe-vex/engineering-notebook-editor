#!/bin/sh
# Create Pub/Sub topics + subscriptions on the emulator (idempotent).
set -eu
HOST="${PUBSUB_EMULATOR_HOST:-pubsub:8085}"
PROJECT="${GOOGLE_CLOUD_PROJECT:-demo-engineering-notebook}"
BASE="http://${HOST}/v1/projects/${PROJECT}"

create_topic() {
  name="$1"
  code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${BASE}/topics/${name}" || true)
  echo "topic ${name}: HTTP ${code}"
}

create_sub() {
  sub="$1"
  topic="$2"
  code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${BASE}/subscriptions/${sub}" \
    -H "Content-Type: application/json" \
    -d "{\"topic\":\"projects/${PROJECT}/topics/${topic}\"}" || true)
  echo "subscription ${sub}: HTTP ${code}"
}

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -sf "http://${HOST}" >/dev/null 2>&1 || curl -sf "http://${HOST}/v1/projects/${PROJECT}/topics" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

create_topic "notebook-jobs-compile"
create_topic "notebook-jobs-judge"
create_sub "notebook-jobs-compile-worker" "notebook-jobs-compile"
create_sub "notebook-jobs-judge-worker" "notebook-jobs-judge"
echo "pubsub-init done"
