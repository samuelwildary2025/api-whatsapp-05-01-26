# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
RUN apk add --no-cache openssl openssl-dev git
COPY package*.json ./
RUN npm ci
COPY . .
RUN rm -rf frontend whatsmeow
RUN npm run db:generate
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner

# Only need openssl for Prisma (no more Puppeteer!)
RUN apk add --no-cache openssl ca-certificates

WORKDIR /app

# Copy Backend built files
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/prisma ./prisma

# Copy Frontend built files to public
COPY --from=frontend-builder /app/frontend/out ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD npx prisma db push --skip-generate && npm start
