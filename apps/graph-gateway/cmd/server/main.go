package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/nebula"
)

func main() {
	address := env("SPECFORGE_NEBULA_ADDRESS", "127.0.0.1:9669")
	username := env("SPECFORGE_NEBULA_USER", "root")
	password := os.Getenv("SPECFORGE_NEBULA_PASSWORD")
	space := env("SPECFORGE_NEBULA_SPACE", "specforge_graph")
	port := env("SPECFORGE_GRAPH_GATEWAY_PORT", "8088")

	client, closeClient, err := nebula.Connect(address, username, password, space, 10*time.Second)
	if err != nil {
		log.Fatal("graph gateway cannot connect to Nebula")
	}
	defer closeClient()
	log.Fatal(http.ListenAndServe(":"+port, httpapi.NewHandler(client)))
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
