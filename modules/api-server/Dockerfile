FROM oven/bun AS builder
WORKDIR /app
COPY modules/api-server /app/modules/api-server
COPY package.json bun.lock ./
COPY modules/proto /app/modules/proto
COPY modules/utils /app/modules/utils
RUN bun install
WORKDIR /app/modules/api-server
RUN if grep -q '"generate"' package.json 2>/dev/null; then bun run generate || true; fi
RUN if grep -q '"build"' package.json 2>/dev/null; then bun run build || true; fi
RUN bun build index.ts --compile --outfile api-server || true

FROM oven/bun
WORKDIR /app
COPY --from=builder /app/modules/api-server/api-server .
# Ensure generated migrations are available at runtime
COPY --from=builder /app/modules/api-server/db ./db
RUN chmod +x api-server || true
EXPOSE 3000
CMD ["./api-server"]
