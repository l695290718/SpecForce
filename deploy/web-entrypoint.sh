#!/bin/sh
set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"

if [ -z "${DATABASE_URL:-}" ]; then
  : "${POSTGRES_USER:?POSTGRES_USER is required when DATABASE_URL is unset}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required when DATABASE_URL is unset}"
  : "${POSTGRES_DB:?POSTGRES_DB is required when DATABASE_URL is unset}"
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PGHOST}:${PGPORT}/${POSTGRES_DB}?schema=public"
fi

until node -e 'const net=require("net"); const socket=net.connect({host:process.env.PGHOST,port:Number(process.env.PGPORT)}); socket.once("connect",()=>process.exit(0)); socket.once("error",()=>process.exit(1)); setTimeout(()=>process.exit(1),1000);'; do
  sleep 1
done

exec node /app/apps/web/server.js
