# Production backend image.
# Stage 1 installs production-only dependencies. Keeping this separate lets the
# runtime image avoid dev dependencies while still reusing Docker cache.
FROM --platform=linux/amd64 ubuntu:24.04 AS prod-deps
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
WORKDIR /build
RUN apt-get update && apt-get install -y curl ca-certificates openssl tzdata && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --legacy-peer-deps

# Stage 2 installs full dependencies, generates Prisma Client, and compiles TS.
FROM --platform=linux/amd64 ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
WORKDIR /build
RUN apt-get update && apt-get install -y curl ca-certificates openssl tzdata && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
RUN npx prisma generate && npm run build

# Stage 3 is the runtime image. It contains compiled JS, Prisma Client, Prisma
# schema/migrations, and production node_modules.
FROM --platform=linux/amd64 ubuntu:24.04 AS runner
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
WORKDIR /app
RUN apt-get update && apt-get install -y curl ca-certificates openssl tzdata && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY --from=prod-deps /build/node_modules       ./node_modules
COPY --from=builder   /build/dist               ./dist
COPY --from=builder   /build/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Default port the API binds. Overridden at runtime by PORT in the env file —
# docker-compose.yml maps 6000:6000, so PORT must match the published port.
ENV PORT=6000
EXPOSE 6000

# Node 24 has built-in fetch, so the healthcheck does not need curl/wget.
# Probes ${PORT} rather than a literal: hardcoding 6000 here made the container
# report unhealthy forever, because the app binds whatever PORT says.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["/bin/sh", "-c", "node -e \"fetch('http://127.0.0.1:'+(process.env.PORT||6000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]

CMD ["node", "dist/server.js"]
