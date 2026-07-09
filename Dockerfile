# Ultra-minimal canary image — no TypeScript build required.
# Proves Railway networking. Full app can be re-enabled after /health works.
FROM node:20-alpine
WORKDIR /app

# Run as root for canary (avoids permission surprises); switch back later if needed
ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY server.cjs ./server.cjs
COPY public ./public

# Optional: full app if present (won't fail if missing)
# Not copying dist in this canary-only image

EXPOSE 3000
CMD ["node", "server.cjs"]
