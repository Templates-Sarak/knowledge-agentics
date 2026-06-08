# Go — binário estático + runtime distroless (quase vazio, já roda como nonroot). Porta via ENV.
# --- build ---
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/app ./...

# --- runtime ---
FROM gcr.io/distroless/static:nonroot AS runtime
ENV PORT=8080
COPY --from=build /bin/app /app
USER nonroot:nonroot
EXPOSE 8080
# distroless não tem shell/curl: o healthcheck fica no orquestrador (compose/k8s) batendo em /health.
ENTRYPOINT ["/app"]
