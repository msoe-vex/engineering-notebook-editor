# Firebase Auth + Firestore emulators for local compose.
# Bake tools at image build so container start does not re-run npm install -g
# (that path hits ENOTEMPTY / broken firebase binaries on restart).
FROM node:20-bookworm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g firebase-tools@13.35.1 \
  && firebase --version

WORKDIR /app
