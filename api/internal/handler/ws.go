package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/hasimyerli/meergate/internal/event"
	"nhooyr.io/websocket"
)

type connectedMessage struct {
	Type           string        `json:"type"`
	RunID          string        `json:"run_id"`
	BufferedEvents []event.Event `json:"buffered_events"`
}

// parseRunIDFromPath extracts the run ID from paths like /api/runs/{id}/ws
func parseRunIDFromPath(path string) string {
	// /api/runs/{id}/ws
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	// parts: ["api", "runs", "{id}", "ws"]
	if len(parts) >= 4 && parts[0] == "api" && parts[1] == "runs" && parts[3] == "ws" {
		return parts[2]
	}
	return ""
}

func RunWebSocketHandler(hub *event.Hub, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := parseRunIDFromPath(r.URL.Path)
		if runID == "" {
			http.Error(w, "missing run id", http.StatusBadRequest)
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			logger.Error("ws accept failed", "error", err)
			return
		}

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		client := event.NewClient(conn)
		hub.Subscribe(runID, client)
		defer hub.Unsubscribe(runID, client)

		// Send buffered events for catchup
		buffered := hub.GetBufferedEvents(runID)
		msg := connectedMessage{
			Type:           "connected",
			RunID:          runID,
			BufferedEvents: buffered,
		}
		data, _ := json.Marshal(msg)
		_ = conn.Write(ctx, websocket.MessageText, data)

		// Start write pump in background
		go client.WritePump(ctx)

		// Read pump: handle ping/pong and detect disconnect
		for {
			_, msgBytes, err := conn.Read(ctx)
			if err != nil {
				break
			}
			var incoming map[string]string
			if json.Unmarshal(msgBytes, &incoming) == nil {
				if incoming["type"] == "ping" {
					pong, _ := json.Marshal(map[string]string{"type": "pong", "ts": time.Now().UTC().Format(time.RFC3339)})
					_ = conn.Write(ctx, websocket.MessageText, pong)
				}
			}
		}

		conn.Close(websocket.StatusNormalClosure, "")
	}
}
