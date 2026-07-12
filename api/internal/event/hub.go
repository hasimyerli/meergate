package event

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"nhooyr.io/websocket"
)

const (
	maxBufferedEvents = 500
	bufferTTL         = 30 * time.Minute
	clientSendBuffer  = 64
)

// Client represents a WebSocket connection subscribed to a run.
type Client struct {
	conn *websocket.Conn
	send chan []byte
	done chan struct{} // closed to signal WritePump to stop
	once sync.Once
}

func NewClient(conn *websocket.Conn) *Client {
	return &Client{
		conn: conn,
		send: make(chan []byte, clientSendBuffer),
		done: make(chan struct{}),
	}
}

// WritePump sends queued messages to the WebSocket connection.
func (c *Client) WritePump(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case msg := <-c.send:
			if msg == nil {
				return
			}
			if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
				return
			}
		}
	}
}

// Stop signals the client to stop its WritePump.
func (c *Client) Stop() {
	c.once.Do(func() { close(c.done) })
}

// runBuffer stores recent events for late-joining clients.
type runBuffer struct {
	events    []Event
	expiresAt time.Time
}

// Hub manages WebSocket clients per run and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	rooms   map[string]map[*Client]bool // runID -> set of clients
	buffers map[string]*runBuffer       // runID -> ring buffer
	logger  *slog.Logger
}

func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		rooms:   make(map[string]map[*Client]bool),
		buffers: make(map[string]*runBuffer),
		logger:  logger,
	}
}

// Subscribe adds a client to a run's room.
func (h *Hub) Subscribe(runID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.rooms[runID] == nil {
		h.rooms[runID] = make(map[*Client]bool)
	}
	h.rooms[runID][client] = true
}

// Unsubscribe removes a client from a run's room and signals it to stop.
func (h *Hub) Unsubscribe(runID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.rooms[runID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.rooms, runID)
		}
	}
	client.Stop()
}

// HasSubscribers returns true if any WebSocket clients are watching this run.
func (h *Hub) HasSubscribers(runID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[runID]) > 0
}

// Broadcast sends an event to all clients subscribed to a run.
func (h *Hub) Broadcast(runID string, evt Event) {
	data, err := json.Marshal(evt)
	if err != nil {
		h.logger.Error("failed to marshal event", "error", err)
		return
	}

	h.mu.Lock()
	// Buffer the event
	buf := h.buffers[runID]
	if buf == nil {
		buf = &runBuffer{events: make([]Event, 0, 64)}
		h.buffers[runID] = buf
	}
	if len(buf.events) < maxBufferedEvents {
		buf.events = append(buf.events, evt)
	}
	buf.expiresAt = time.Now().Add(bufferTTL)

	// Copy client list under lock to iterate safely
	clients := make([]*Client, 0, len(h.rooms[runID]))
	for client := range h.rooms[runID] {
		clients = append(clients, client)
	}
	h.mu.Unlock()

	for _, client := range clients {
		select {
		case <-client.done:
			// Client is shutting down, skip
		case client.send <- data:
		default:
			h.logger.Warn("dropping event for slow client", "run_id", runID)
		}
	}
}

// GetBufferedEvents returns cached events for a run (for late-joining clients).
func (h *Hub) GetBufferedEvents(runID string) []Event {
	h.mu.RLock()
	defer h.mu.RUnlock()

	buf := h.buffers[runID]
	if buf == nil {
		return nil
	}
	if time.Now().After(buf.expiresAt) {
		return nil
	}
	out := make([]Event, len(buf.events))
	copy(out, buf.events)
	return out
}

// CleanupExpiredBuffers removes stale event buffers. Call periodically.
func (h *Hub) CleanupExpiredBuffers() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	for runID, buf := range h.buffers {
		if now.After(buf.expiresAt) {
			delete(h.buffers, runID)
		}
	}
}

// StartCleanup runs a background goroutine that periodically cleans expired buffers.
func (h *Hub) StartCleanup(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.CleanupExpiredBuffers()
			}
		}
	}()
}
