# Image d'essai de Jupiter Compta (API NestJS + interface Next.js), construite depuis les sources.
# Image Node complète : OpenSSL (moteur de migration Prisma) et certificats déjà présents.
FROM node:22-bookworm
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
# Adresse de l'API vue par le serveur web (réécritures Next.js figées à la construction).
ARG API_URL=http://api:4000
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile \
 && for p in ledger statements fx tax-engine payroll licensing ai einvoice operations advisory connectors cost-accounting; do (cd packages/$p && npx tsc -p tsconfig.build.json) || exit 1; done \
 && cd apps/api && DATABASE_OWNER_URL=postgresql://build:build@localhost:5432/build npx prisma generate --no-hints && npx tsc -p tsconfig.build.json \
 && cd ../web && npx next build
EXPOSE 3000 4000
