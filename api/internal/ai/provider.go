package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/hasimyerli/meergate/internal/config"
	"github.com/hasimyerli/meergate/internal/model"
)

func callOpenAI(ctx context.Context, cfg *config.Config, messages []model.ChatMessage, model string) (string, error) {
	if model == "" {
		model = cfg.AIModel
	}

	type msg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	var msgs []msg
	for _, m := range messages {
		msgs = append(msgs, msg{Role: m.Role, Content: m.Content})
	}

	payload := map[string]interface{}{
		"model":       model,
		"messages":    msgs,
		"temperature": 0.3,
		"max_tokens":  4096,
	}

	b, _ := json.Marshal(payload)
	url := cfg.AIAPIUrl + "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.AIAPIKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("openai error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from openai")
	}
	return result.Choices[0].Message.Content, nil
}

func callAnthropic(ctx context.Context, cfg *config.Config, messages []model.ChatMessage, model string) (string, error) {
	if model == "" {
		model = cfg.AIModel
	}
	if model == "" {
		model = "claude-opus-4-8"
	}

	type msg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	var systemMsg string
	var userMsgs []msg
	for _, m := range messages {
		if m.Role == "system" {
			systemMsg = m.Content
		} else {
			userMsgs = append(userMsgs, msg{Role: m.Role, Content: m.Content})
		}
	}

	payload := map[string]interface{}{
		"model":      model,
		"max_tokens": 4096,
		"messages":   userMsgs,
	}
	if systemMsg != "" {
		payload["system"] = systemMsg
	}

	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", cfg.AIAnthropicAPIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("anthropic error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if len(result.Content) == 0 {
		return "", fmt.Errorf("no response from anthropic")
	}
	return result.Content[0].Text, nil
}

func CallLLM(ctx context.Context, cfg *config.Config, messages []model.ChatMessage, model string) (string, error) {
	switch cfg.AIProvider {
	case "openai":
		return callOpenAI(ctx, cfg, messages, model)
	case "anthropic":
		return callAnthropic(ctx, cfg, messages, model)
	default:
		return "", fmt.Errorf("unsupported AI provider: %s", cfg.AIProvider)
	}
}
