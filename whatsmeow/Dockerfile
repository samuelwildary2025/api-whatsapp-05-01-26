# Dockerfile for Whatsmeow Go service
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies for CGO (sqlite) and git
RUN apk add --no-cache gcc musl-dev sqlite-dev git

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=1 GOOS=linux go build -o whatsmeow-server .

# Runner stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache sqlite-libs ca-certificates

WORKDIR /app

# Copy binary
COPY --from=builder /app/whatsmeow-server .

# Create data directory
RUN mkdir -p /app/data

ENV WHATSMEOW_PORT=8081
ENV WHATSMEOW_DATA_DIR=/app/data

EXPOSE 8081

CMD ["./whatsmeow-server"]
