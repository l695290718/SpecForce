#!/bin/sh
set -eu

nebula-console \
  -addr nebula-graphd \
  -port 9669 \
  -u "$SPECFORGE_NEBULA_USER" \
  -p "$SPECFORGE_NEBULA_PASSWORD" \
  -f /bootstrap/bootstrap-local.ngql || true

until nebula-console \
  -addr nebula-graphd \
  -port 9669 \
  -u "$SPECFORGE_NEBULA_USER" \
  -p "$SPECFORGE_NEBULA_PASSWORD" \
  -e 'SHOW HOSTS;' | grep -q '"ONLINE"'; do
  sleep 2
done
