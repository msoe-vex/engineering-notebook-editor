FROM node:20-alpine AS deps
WORKDIR /app
COPY packages/shared ./packages/shared
COPY website/package.json website/package-lock.json* ./website/
WORKDIR /app/packages/shared
RUN npm install && npm run build
WORKDIR /app/website
RUN npm install \
  && mkdir -p node_modules/@engineering-notebook \
  && rm -rf node_modules/@engineering-notebook/shared \
  && cp -R /app/packages/shared node_modules/@engineering-notebook/shared

FROM node:20-alpine AS builder
WORKDIR /app/website
COPY --from=deps /app/website/node_modules ./node_modules
COPY website/ ./
COPY --from=deps /app/packages/shared /app/packages/shared
RUN mkdir -p node_modules/@engineering-notebook \
  && rm -rf node_modules/@engineering-notebook/shared \
  && cp -R /app/packages/shared node_modules/@engineering-notebook/shared
ARG NEXT_PUBLIC_CORE_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_AGENTS_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
ARG NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-engineering-notebook.firebaseapp.com
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
ARG NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
ARG NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
ENV NEXT_PUBLIC_CORE_API_URL=$NEXT_PUBLIC_CORE_API_URL \
    NEXT_PUBLIC_AGENTS_API_URL=$NEXT_PUBLIC_AGENTS_API_URL \
    NEXT_PUBLIC_COLLAB_WS_URL=$NEXT_PUBLIC_COLLAB_WS_URL \
    NEXT_PUBLIC_ASSETS_BASE_URL=$NEXT_PUBLIC_ASSETS_BASE_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_USE_FIREBASE_EMULATOR=$NEXT_PUBLIC_USE_FIREBASE_EMULATOR \
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=$NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/website/package*.json ./
COPY --from=builder /app/website/node_modules ./node_modules
COPY --from=builder /app/website/.next ./.next
COPY --from=builder /app/website/public ./public
COPY --from=builder /app/website/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
