# The bot bundled to a single file, then run on a bare Node image.
#
# Bundling in the build stage means the runtime image carries no node_modules
# and no package manager — the same reason the desktop build is one file. What
# ships is a few megabytes of JavaScript and nothing to install at boot.

FROM node:22-slim AS build
WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx esbuild src/bot-server.ts \
      --bundle --platform=node --target=node20 --format=cjs \
      --define:__BUILD_STAMP__="\"docker-$(date -u +%Y-%m-%dT%H-%M)\"" \
      --outfile=/src/bot.js

FROM node:22-slim
WORKDIR /app

# Digests and the MTProto session live here. Mount a volume on it — without
# one, a redeploy loses the session and everyone has to /connect again.
ENV DIGEST_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data

COPY --from=build /src/bot.js /app/bot.js

USER node
CMD ["node", "/app/bot.js"]
