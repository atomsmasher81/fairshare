# FairShare — self-hosted expense tracking + splitting.
# docker compose up -d   → http://localhost:3000
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/fairshare.db \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
RUN chmod +x docker/entrypoint.sh
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["npm", "start"]
