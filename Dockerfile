# syntax=docker/dockerfile:1

# ============================================================
# Stage 1 — Build the Angular frontend
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy sources and build for production
COPY . .
RUN npm run build:prod

# The Angular build output goes to dist/<project>/browser with @angular/build.
# We normalize it to a predictable /app/www folder.
RUN mkdir -p /app/www \
    && cp -r dist/librespeed-frontend/browser/* /app/www/ 2>/dev/null \
    || cp -r dist/*/browser/* /app/www/

# ============================================================
# Stage 2 — Runtime: Nginx + PHP-FPM (LibreSpeed backend)
# ============================================================
FROM php:8.3-fpm-alpine AS runtime

# Install nginx + supervisor to run both processes
RUN apk add --no-cache nginx supervisor curl \
    && mkdir -p /run/nginx /var/www/html

# --- Frontend static files ---
COPY --from=frontend-build /app/www /var/www/html

# --- LibreSpeed PHP backend ---
RUN mkdir -p /var/www/html/backend \
    && curl -fsSL https://raw.githubusercontent.com/librespeed/speedtest/master/backend/garbage.php -o /var/www/html/backend/garbage.php \
    && curl -fsSL https://raw.githubusercontent.com/librespeed/speedtest/master/backend/empty.php   -o /var/www/html/backend/empty.php \
    && curl -fsSL https://raw.githubusercontent.com/librespeed/speedtest/master/backend/getIP.php    -o /var/www/html/backend/getIP.php

# --- Config files ---
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Permissions
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80

# Simple healthcheck hitting the backend empty endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:80/backend/empty.php || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]