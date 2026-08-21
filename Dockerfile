# The service has no dependencies, so there is nothing to install and no build
# step — the image is the runtime plus seven source files. That is why this
# replaces the multi-stage Dockerfile Fly Launch generated: npm install, the
# build-essential toolchain and the throw-away build stage all install nothing.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Leads are appended here before delivery. Without a Fly volume mounted at
# /app/data this is lost when the machine restarts; Telegram and the site's
# database are the durable copies, this one is the local safety net.
RUN mkdir -p /app/data

ENV NODE_ENV=production
# Must match internal_port in fly.toml: the proxy connects to this port and
# nothing else. The old default (8787) is what left the app unreachable.
ENV PORT=8080
EXPOSE 8080

# Not `npm run start`: node as PID 1 receives SIGTERM directly, so the shutdown
# handler runs and deploys stay quick instead of waiting out a kill timeout.
CMD ["node", "src/index.js"]
