FROM node:20-alpine AS build

WORKDIR /app
COPY webapp/package.json webapp/package-lock.json ./
# npm ci refuses to run if the lockfile's platform-specific optional deps
# (native bindings for esbuild/lightningcss etc.) don't exactly match the
# build platform — the lockfile here was generated on Windows, so a strict
# ci install fails on Linux even though the dependency graph itself is
# fine. npm install resolves/installs correctly for whichever platform
# it's actually running on.
RUN npm install
COPY webapp ./
RUN npm run build

FROM caddy:2-alpine

COPY --from=build /app/dist /srv/webapp
COPY infra/Caddyfile /etc/caddy/Caddyfile
