FROM oven/bun AS builder
WORKDIR /app
COPY modules/game-server /app/modules/game-server
COPY package.json bun.lock ./
COPY modules/proto /app/modules/proto
COPY modules/utils /app/modules/utils
RUN bun install
WORKDIR /app/modules/game-server
RUN if grep -q '"generate"' package.json 2>/dev/null; then bun run generate || true; fi
RUN if grep -q '"build"' package.json 2>/dev/null; then bun run build || true; fi
RUN bun build index.ts --compile --outfile game-server || true

FROM oven/bun
WORKDIR /app
COPY --from=builder /app/modules/game-server/game-server .
RUN chmod +x game-server || true
EXPOSE 3000
CMD ["./game-server"]
