FROM oven/bun AS builder
WORKDIR /app
COPY modules/game-server /app/modules/game-server
COPY package.json bun.lock ./
COPY modules/proto /app/modules/proto
COPY modules/utils /app/modules/utils
RUN bun install
RUN apt-get update && apt-get install -y protobuf-compiler
RUN bun run gen:proto
WORKDIR /app/modules/game-server
RUN bun run generate
#RUN if grep -q '"build"' package.json 2>/dev/null; then bun run build || true; fi
RUN bun build index.ts --compile --outfile game-server || true

FROM oven/bun
WORKDIR /app
COPY --from=builder /app/modules/game-server/game-server .
RUN chmod +x game-server || true
EXPOSE 3000
CMD ["./game-server"]
