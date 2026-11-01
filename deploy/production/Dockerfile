# Image de production de Jupiter Compta (API NestJS + interface Next.js).
# Étape 1 : construction depuis les sources. Étape 2 : exécution sans outils de construction, utilisateur non privilégié.
FROM node:22-bookworm AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
ARG API_URL=http://api:4000
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile \
 && for p in ledger statements fx tax-engine payroll licensing ai einvoice operations advisory connectors cost-accounting special-ops; do (cd packages/$p && npx tsc -p tsconfig.build.json) || exit 1; done \
 && cd apps/api && DATABASE_OWNER_URL=postgresql://build:build@localhost:5432/build npx prisma generate --no-hints && npx tsc -p tsconfig.build.json \
 && cd ../web && npx next build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
