FROM node:22-alpine AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build:restock-request-consumer

FROM node:22-alpine AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/dist/apps/restock-request-consumer ./dist
EXPOSE 3005
CMD ["node", "dist/main.js"]
