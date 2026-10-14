FROM node:20-alpine AS build
WORKDIR /app
COPY packages/shared ./packages/shared
COPY services/agents/package.json ./services/agents/package.json
WORKDIR /app/packages/shared
RUN npm install && npm run build
WORKDIR /app/services/agents
RUN npm install --install-links=false \
  && mkdir -p node_modules/@engineering-notebook \
  && rm -rf node_modules/@engineering-notebook/shared \
  && cp -R /app/packages/shared node_modules/@engineering-notebook/shared
COPY services/agents/tsconfig.json ./
COPY services/agents/src ./src

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/agents ./
ENV PORT=8000
EXPOSE 8000
CMD ["npm", "run", "start"]
