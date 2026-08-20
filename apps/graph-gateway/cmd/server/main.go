package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/nebula"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/postgres"
)

func main() {
	address := env("SPECFORGE_NEBULA_ADDRESS", "127.0.0.1:9669")
	username := env("SPECFORGE_NEBULA_USER", "root")
	password := os.Getenv("SPECFORGE_NEBULA_PASSWORD")
	space := env("SPECFORGE_NEBULA_SPACE", "specforge_graph")
	port := env("SPECFORGE_GRAPH_GATEWAY_PORT", "8088")
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("graph gateway requires DATABASE_URL for ACTIVE Manifest resolution")
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatal("graph gateway cannot configure PostgreSQL resolver")
	}
	defer database.Close()
	if err := database.PingContext(context.Background()); err != nil {
		log.Fatal("graph gateway cannot connect to PostgreSQL")
	}

	client, closeClient, err := nebula.Connect(address, username, password, space, 10*time.Second)
	if err != nil {
		log.Fatal("graph gateway cannot connect to Nebula")
	}
	defer closeClient()
	log.Fatal(http.ListenAndServe(":"+port, httpapi.NewHandlerWithResolver(client, postgres.NewActiveManifestResolver(database))))
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
