package scheduler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

type Notifier struct {
	logger *slog.Logger
}

func NewNotifier(logger *slog.Logger) *Notifier {
	return &Notifier{logger: logger}
}

type WebhookPayload struct {
	ScheduleName string                   `json:"schedule_name"`
	Total        int                      `json:"total"`
	Passed       int                      `json:"passed"`
	Failed       int                      `json:"failed"`
	Errors       int                      `json:"errors"`
	Runs         []map[string]interface{} `json:"runs"`
}

func (n *Notifier) SendWebhook(url string, payload WebhookPayload) error {
	color := "good"
	if payload.Failed > 0 || payload.Errors > 0 {
		color = "danger"
	}

	// Format for Slack
	slackPayload := map[string]interface{}{
		"attachments": []map[string]interface{}{
			{
				"color": color,
				"title": fmt.Sprintf("Schedule: %s", payload.ScheduleName),
				"text":  fmt.Sprintf("Total: %d | Passed: %d | Failed: %d | Errors: %d", payload.Total, payload.Passed, payload.Failed, payload.Errors),
				"ts":    time.Now().Unix(),
			},
		},
	}

	b, err := json.Marshal(slackPayload)
	if err != nil {
		return err
	}

	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		n.logger.Error("webhook failed", "url", url, "error", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}
