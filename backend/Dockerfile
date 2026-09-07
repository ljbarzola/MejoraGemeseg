FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build


FROM node:20-alpine AS backend-builder

WORKDIR /app

ENV NODE_OPTIONS="--max_old_space_size=4096"

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev


FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=backend-builder /app/prisma.config.js ./prisma.config.js
COPY --from=frontend-builder /app/frontend/dist ./public

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8080

CMD ["node", "dist/main"]
