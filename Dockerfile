FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node package*.json next.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node scripts/create-admin.mjs ./scripts/create-admin.mjs
COPY --chown=node:node src/lib/security/content-security-policy.ts ./src/lib/security/content-security-policy.ts

RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz >/dev/null || exit 1
CMD ["npm", "run", "start"]
