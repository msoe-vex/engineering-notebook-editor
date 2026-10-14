FROM node:20-alpine AS build
WORKDIR /app
COPY packages/shared ./packages/shared
COPY services/collab/package.json ./services/collab/package.json
WORKDIR /app/packages/shared
RUN npm install && npm run build
WORKDIR /app/services/collab
RUN npm install --install-links=false \
  && mkdir -p node_modules/@engineering-notebook \
  && rm -rf node_modules/@engineering-notebook/shared \
  && cp -R /app/packages/shared node_modules/@engineering-notebook/shared
COPY services/collab/tsconfig.json ./
COPY services/collab/src ./src

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/collab ./
ENV PORT=1234
EXPOSE 1234
CMD ["npm", "run", "start"]
