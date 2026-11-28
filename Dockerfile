FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS base
WORKDIR /opt/merit

FROM base AS manifests
RUN npm install --global --ignore-scripts pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents ./app/package.json ./foundation/*/package.json ./interfaces/*/package.json ./capabilities/access/package.json ./capabilities/*/*/package.json ./tooling/*/package.json ./

FROM manifests AS build
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# Public browser settings are compiled into the application.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
RUN cd app && ../node_modules/.bin/vp build

FROM manifests AS dependencies
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm --filter @merit/app... install --prod --frozen-lockfile --ignore-scripts

FROM base
COPY app app
COPY capabilities capabilities
COPY foundation foundation
COPY interfaces interfaces
COPY tsconfig.base.json ./
# The worker imports JSX email templates across workspace package boundaries.
ENV NODE_ENV=production PORT=3000 TSX_TSCONFIG_PATH=/opt/merit/app/runtime/tsconfig.json
COPY --from=dependencies /opt/merit/app /opt/merit/app
COPY --from=dependencies /opt/merit/capabilities /opt/merit/capabilities
COPY --from=dependencies /opt/merit/interfaces /opt/merit/interfaces
COPY --from=dependencies /opt/merit/foundation /opt/merit/foundation
COPY --from=dependencies /opt/merit/node_modules /opt/merit/node_modules
COPY --from=build /opt/merit/app/dist /opt/merit/app/dist
WORKDIR /opt/merit/app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --start-period=30s --start-interval=2s --timeout=3s CMD ["node", "--input-type=module", "-e", "const response = await fetch('http://127.0.0.1:' + process.env.PORT + '/_ready'); process.exit(response.status === 204 ? 0 : 1)"]
ENTRYPOINT ["./runtime/start"]
CMD ["web"]
