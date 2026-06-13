FROM alpine:3.21 AS builder
WORKDIR /site
COPY index.html products.html admin.html sw.js manifest.json \
     favicon.ico favicon.svg favicon-32.png _headers ./
COPY css/   ./css/
COPY js/    ./js/
COPY icons/ ./icons/

FROM nginxinc/nginx-unprivileged:1.28-alpine

# Patch OS packages to clear fixable CVEs inherited from the base image.
# Needs root; we drop back to the unprivileged nginx user before runtime.
USER root
RUN apk upgrade --no-cache

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /site /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
