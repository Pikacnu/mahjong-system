FROM oven/bun AS builder
WORKDIR /app
COPY modules/api-server /app/modules/api-server
COPY package.json bun.lock ./
COPY modules/proto /app/modules/proto
COPY modules/utils /app/modules/utils
RUN bun install
RUN apt-get update && apt-get install -y protobuf-compiler
RUN bun run gen:proto
WORKDIR /app/modules/api-server
RUN bun run generate
RUN bun build index.ts --compile --outfile api-server

FROM oven/bun
WORKDIR /app
COPY --from=builder /app/modules/api-server/api-server .
# Ensure generated migrations are available at runtime
COPY --from=builder /app/modules/api-server/db ./db
RUN chmod +x api-server
EXPOSE 3000
CMD ["./api-server"]
