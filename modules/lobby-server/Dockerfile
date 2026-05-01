FROM oven/bun AS builder
WORKDIR /app
COPY modules/lobby-server /app/modules/lobby-server
COPY package.json bun.lock ./
COPY modules/proto /app/modules/proto
COPY modules/utils /app/modules/utils
RUN bun install
RUN apt-get update && apt-get install -y protobuf-compiler
RUN bun run gen:proto
WORKDIR /app/modules/lobby-server
#RUN if grep -q '"generate"' package.json 2>/dev/null; then bun run generate || true; fi
RUN bun build index.ts --compile --outfile lobby-server || true

FROM oven/bun
WORKDIR /app
COPY --from=builder /app/modules/lobby-server/lobby-server .
RUN chmod +x lobby-server || true
EXPOSE 3001
CMD ["./lobby-server"]
