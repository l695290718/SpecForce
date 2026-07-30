ARG GO_BUILDER_IMAGE=golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651

FROM ${GO_BUILDER_IMAGE} AS builder

WORKDIR /workspace/apps/graph-gateway

COPY apps/graph-gateway/go.mod apps/graph-gateway/go.sum ./
RUN go mod download

COPY apps/graph-gateway ./
COPY deploy/graph/gateway-healthcheck.go /tmp/gateway-healthcheck.go

RUN CGO_ENABLED=0 GOOS=linux go build \
  -trimpath \
  -buildvcs=false \
  -ldflags="-s -w" \
  -o /out/graph-gateway \
  ./cmd/server

RUN CGO_ENABLED=0 GOOS=linux go build \
  -trimpath \
  -buildvcs=false \
  -ldflags="-s -w" \
  -o /out/graph-gateway-healthcheck \
  /tmp/gateway-healthcheck.go

FROM scratch AS runtime

COPY --from=builder /out/graph-gateway /usr/local/bin/graph-gateway
COPY --from=builder /out/graph-gateway-healthcheck /usr/local/bin/graph-gateway-healthcheck

USER 10001

EXPOSE 8088

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=20s \
  CMD ["/usr/local/bin/graph-gateway-healthcheck"]

ENTRYPOINT ["/usr/local/bin/graph-gateway"]
