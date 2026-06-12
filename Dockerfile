FROM rust:1.91 AS builder

WORKDIR /app

COPY . .

RUN cargo build --release

FROM debian:stable-slim

WORKDIR /app

COPY --from=builder /app/target/release/mrpack_api /app/mrpack_api
COPY static /app/static
COPY .env /app/.env

EXPOSE 8000

CMD ["/app/mrpack_api"]
