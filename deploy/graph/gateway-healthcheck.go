package main

import (
	"io"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("SPECFORGE_GRAPH_GATEWAY_PORT")
	if port == "" {
		port = "8088"
	}
	client := http.Client{Timeout: 4 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		os.Exit(1)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}
