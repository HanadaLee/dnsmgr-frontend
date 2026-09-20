# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=dnsmgr-frontend-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline

COPY VERSION .oxlintrc.json index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public/ ./public/
COPY src/ ./src/

ENV VITE_BASE_PATH=/

RUN node --input-type=module -e \
      "import fs from 'node:fs'; const version = fs.readFileSync('VERSION', 'utf8').trim().replace(/^v/, ''); const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version; if (version !== packageVersion) throw new Error('VERSION (' + version + ') must match package.json (' + packageVersion + ')')" \
    && npm run lint \
    && npm test \
    && npm run build


FROM nginx:stable-alpine-slim AS runtime

ARG APP_VERSION=dev

LABEL org.opencontainers.image.title="dnsmgr-frontend" \
      org.opencontainers.image.description="Static shadcn/ui web console for dnsmgr" \
      org.opencontainers.image.version="${APP_VERSION}"

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx --from=build /app/dist/ /usr/share/nginx/html/

RUN rm -rf /docker-entrypoint.d /etc/nginx/conf.d /etc/nginx/templates \
    && rm -f /docker-entrypoint.sh /usr/share/nginx/html/50x.html \
    && mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi \
    && chown -R nginx:nginx /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi \
    && nginx -t \
    && rm -f /tmp/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

ENTRYPOINT ["/usr/sbin/nginx"]
CMD ["-g", "daemon off;"]
