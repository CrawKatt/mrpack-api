FROM rust:1.91 AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY . .

RUN cargo build --release

FROM debian:stable-slim

WORKDIR /app
COPY --from=builder /app/target/release/mrpack_api /app/app

EXPOSE 8000

CMD ["./app"]
