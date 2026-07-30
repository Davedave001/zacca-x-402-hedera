# Zacca Credit Intelligence API -- backend (pay-api.zacca.ai)
# Build context: repo root. Runs via tsx (same as `npm start` locally) --
# no separate compile step, matching the existing dev/start scripts.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# src/chain/deployment.ts reads this file via a relative path at runtime --
# it's Zacca's own contract addresses (no secrets), see contracts/README.md.
COPY contracts/deployments ./contracts/deployments

EXPOSE 4021
CMD ["npm", "start"]
