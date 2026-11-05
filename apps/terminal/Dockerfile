FROM node:22-alpine AS deps
WORKDIR /usr/src/app
# better-sqlite3 falls back to compiling from source if no prebuilt binary
# matches this platform (musl/alpine); these make the fallback actually work.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx nest build terminal

FROM node:22-alpine AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/dist/apps/terminal ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
