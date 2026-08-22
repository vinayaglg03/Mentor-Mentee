# Multi-stage: the build stage carries the full toolchain, the runtime stage
# carries only what is needed to serve requests.

FROM node:22-alpine AS deps
WORKDIR /app

# Only the manifests, so this layer is reused whenever the source changes but
# the dependencies do not.
COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` runs the postinstall that generates the Prisma client.
RUN npm ci

FROM node:22-alpine AS runtime
WORKDIR /app

# Never run as root in a container that faces the internet.
RUN addgroup -S amis && adduser -S amis -G amis

# Prisma's query engine needs OpenSSL on Alpine; tini reaps zombies and
# forwards signals so the container stops cleanly.
RUN apk add --no-cache openssl tini

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=amis:amis package.json ./
COPY --chown=amis:amis prisma ./prisma
COPY --chown=amis:amis src ./src
COPY --chown=amis:amis index.js ./
COPY --chown=amis:amis docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && mkdir -p /app/archive && chown -R amis:amis /app/archive

USER amis

EXPOSE 5000

# The readiness endpoint checks the database and that migrations are applied,
# which is what "healthy" actually means here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "index.js"]
