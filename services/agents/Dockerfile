FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
ENV PORT=8000
EXPOSE 8000
CMD ["npm", "run", "start"]
