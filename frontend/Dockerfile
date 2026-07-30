# Zacca frontend (pay.zacca.ai) -- static Vite/React build served by nginx.
# Build context: frontend/. VITE_API_BASE_URL is baked in at build time
# (Vite env vars are compile-time, not runtime) -- set it as a build arg
# in Coolify to point at the deployed backend (pay-api.zacca.ai).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=https://pay-api.zacca.ai
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
