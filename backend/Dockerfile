FROM node:20-alpine AS backend-builder

WORKDIR /app

ENV NODE_OPTIONS="--max_old_space_size=4096"
# Puppeteer's bundled Chromium doesn't work on Alpine (musl libc) — the
# final image installs the system `chromium` package instead (see below),
# so skip the download here to avoid failing/wasting time on a binary that
# would never run.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev


FROM node:20-alpine

WORKDIR /app

# System Chromium for Puppeteer (used by html-pdf-node for Custodias/RRHH
# PDFs and the Personal module's contract templates) — Puppeteer's own
# bundled Chromium download is skipped above because it doesn't run on
# Alpine.
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# LibreOffice (headless) converts Ventas contract .docx templates straight to
# PDF, preserving the original document's layout/fonts/images instead of the
# lossy HTML-based pipeline used elsewhere. `soffice` ends up on PATH, so no
# LIBREOFFICE_PATH env var is needed (VentasContratosService defaults to it).
RUN apk add --no-cache libreoffice

COPY backend/package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=backend-builder /app/prisma.config.js ./prisma.config.js

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /app/uploads/templates /app/uploads/contracts /app/uploads/logos && chown -R appuser:appgroup /app/uploads
USER appuser

EXPOSE 8080

CMD ["node", "dist/main"]
