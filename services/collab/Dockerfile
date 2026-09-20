FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
ENV PORT=1234
EXPOSE 1234
CMD ["npm", "run", "start"]
