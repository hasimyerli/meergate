package client

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"nhooyr.io/websocket"
)

type WsClient struct {
	url string
}

func NewWsClient(url string) *WsClient {
	return &WsClient{url: url}
}

type WsConnection struct {
	conn *websocket.Conn
}

type WsMessage struct {
	Channel string      `json:"channel"`
	Data    interface{} `json:"data"`
}

func (c *WsClient) Connect(ctx context.Context, channel string, timeoutMs int) (*WsConnection, error) {
	dialCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	conn, _, err := websocket.Dial(dialCtx, c.url, nil)
	if err != nil {
		return nil, fmt.Errorf("ws dial failed: %w", err)
	}

	// Subscribe to channel
	sub := map[string]interface{}{
		"type":    "subscribe",
		"channel": channel,
	}
	b, _ := json.Marshal(sub)
	if err := conn.Write(ctx, websocket.MessageText, b); err != nil {
		conn.Close(websocket.StatusNormalClosure, "")
		return nil, fmt.Errorf("ws subscribe failed: %w", err)
	}

	return &WsConnection{conn: conn}, nil
}

func (c *WsClient) WaitForMessage(ctx context.Context, conn *WsConnection, predicate func(*WsMessage) bool, timeoutMs int) (*WsMessage, error) {
	deadline := time.Now().Add(time.Duration(timeoutMs) * time.Millisecond)
	for time.Now().Before(deadline) {
		readCtx, cancel := context.WithDeadline(ctx, deadline)
		_, data, err := conn.conn.Read(readCtx)
		cancel()
		if err != nil {
			return nil, err
		}

		// Decode the whole payload as the message Data so assertions/extracts
		// can JSONPath into it. If a "channel" key exists, surface it too.
		var raw interface{}
		if err := json.Unmarshal(data, &raw); err != nil {
			raw = string(data)
		}
		msg := WsMessage{Data: raw}
		if m, ok := raw.(map[string]interface{}); ok {
			if ch, ok := m["channel"].(string); ok {
				msg.Channel = ch
			}
		}

		if predicate == nil || predicate(&msg) {
			return &msg, nil
		}
	}
	return nil, fmt.Errorf("ws timeout waiting for message")
}

func (c *WsClient) Close(conn *WsConnection) {
	if conn != nil && conn.conn != nil {
		conn.conn.Close(websocket.StatusNormalClosure, "done")
	}
}
