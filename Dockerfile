FROM node:24-bookworm-slim AS admin-builder

WORKDIR /frontend

COPY admin-frontend/package.json admin-frontend/package-lock.json ./
RUN npm ci

COPY admin-frontend/ ./
RUN npm run build

FROM rust:1.91 AS builder

WORKDIR /app

COPY . .
COPY --from=admin-builder /static/admin /app/static/admin

RUN cargo build --release

FROM debian:stable-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/mrpack_api /app/mrpack_api
COPY --from=builder /app/static /app/static
# Inject credentials at runtime with environment variables or --env-file.

EXPOSE 8000

CMD ["/app/mrpack_api"]
