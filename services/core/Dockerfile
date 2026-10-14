FROM node:20-alpine AS build
WORKDIR /app
COPY packages/shared ./packages/shared
COPY services/core/package.json ./services/core/package.json
WORKDIR /app/packages/shared
RUN npm install && npm run build
WORKDIR /app/services/core
RUN npm install --install-links=false \
  && mkdir -p node_modules/@engineering-notebook \
  && rm -rf node_modules/@engineering-notebook/shared \
  && cp -R /app/packages/shared node_modules/@engineering-notebook/shared
COPY services/core/tsconfig.json ./
COPY services/core/src ./src

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/core ./
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "run", "start"]
