# Replaces the Nixpacks build: Nixpacks pins Node to an old 22.x, while the
# official image picks up Node security patches on every rebuild.
FROM node:24-alpine AS base

# --- Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Production ---
# Same layout as the Nixpacks image (full /app, runs as root) so the start
# script and mounted volumes keep working unchanged.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "run", "start"]
