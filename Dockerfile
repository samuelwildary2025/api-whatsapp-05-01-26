# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Set API URL to empty string for relative paths
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
# Install OpenSSL for Prisma and git for GitHub dependencies
RUN apk add --no-cache openssl openssl-dev git
COPY package*.json ./
RUN npm ci
COPY . .
# Remove frontend folder to avoid copying source
RUN rm -rf frontend
RUN npm run db:generate
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner

# Install dependencies for Puppeteer and Prisma
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    openssl

# Tell Puppeteer to skip downloading Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy Backend built files
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/prisma ./prisma

# Copy Frontend built files to public
COPY --from=frontend-builder /app/frontend/out ./public

# Sessions are now stored in the database, no local directory needed

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start server
CMD npx prisma db push --skip-generate && npm start
