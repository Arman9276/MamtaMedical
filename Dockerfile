FROM alpine:3.24 AS builder
WORKDIR /site
COPY index.html products.html admin.html sw.js manifest.json \
     favicon.ico favicon.svg favicon-32.png _headers ./
COPY css/   ./css/
COPY js/    ./js/
COPY icons/ ./icons/

FROM nginxinc/nginx-unprivileged:1.31-alpine

# Patch OS packages, then drop curl. A static-file nginx never calls curl at
# runtime (the healthcheck uses busybox wget), so removing it clears the curl
# CVEs and trims attack surface. Kept in ONE RUN layer so no new layer is added
# and the image size stays flat. '|| true' keeps the build green if curl turns
# out to be a pinned dependency that apk refuses to remove.
#
# `apk upgrade` already pulls the newest patched versions of every installed
# package. The explicit `apk add --upgrade busybox freetype` afterwards is a
# belt-and-braces step: it forces those two specific packages (flagged by
# Docker Scout — CVE-2025-60876 in busybox wget, CVE-2026-23865 in freetype)
# to the latest available version, and fails loudly if the repo somehow can't
# provide them, instead of silently leaving a stale copy.
USER root
# hadolint ignore=DL3018
RUN apk upgrade --no-cache \
 && apk add --no-cache --upgrade busybox freetype \
 && (apk del curl 2>/dev/null && echo "curl removed" \
     || echo "curl NOT removed (likely a dependency) — leaving it in place")

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /site /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]