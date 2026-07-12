package client

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

type RestClient struct {
	baseURL   string
	apiKey    string
	apiSecret string
	client    *http.Client
}

func NewRestClient(baseURL, apiKey, apiSecret string) *RestClient {
	return &RestClient{
		baseURL:   baseURL,
		apiKey:    apiKey,
		apiSecret: apiSecret,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

type RestResponse struct {
	StatusCode int
	Headers    map[string]string
	Body       interface{}
}

type RestOpts struct {
	Body      interface{}
	Headers   map[string]string
	Signed    bool
	TimeoutMs int
	BaseURL   string
}

func (c *RestClient) Request(ctx context.Context, method, path string, opts RestOpts) (*RestResponse, error) {
	baseURL := c.baseURL
	if opts.BaseURL != "" {
		baseURL = opts.BaseURL
	}
	url := baseURL + path

	var bodyReader io.Reader
	if opts.Body != nil {
		b, err := json.Marshal(opts.Body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	for k, v := range opts.Headers {
		req.Header.Set(k, v)
	}

	if opts.Signed && c.apiKey != "" {
		ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
		req.Header.Set("X-Api-Key", c.apiKey)
		req.Header.Set("X-Timestamp", ts)

		mac := hmac.New(sha256.New, []byte(c.apiSecret))
		mac.Write([]byte(ts + method + path))
		sig := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-Signature", sig)
	}

	if opts.TimeoutMs > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(opts.TimeoutMs)*time.Millisecond)
		defer cancel()
		req = req.WithContext(ctx)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var parsed interface{}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		parsed = string(respBody)
	}

	headers := make(map[string]string)
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	return &RestResponse{
		StatusCode: resp.StatusCode,
		Headers:    headers,
		Body:       parsed,
	}, nil
}

func (c *RestClient) RequestWithRetry(ctx context.Context, method, path string, opts RestOpts, maxRetries int) (*RestResponse, error) {
	if maxRetries <= 0 {
		maxRetries = 3
	}

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		resp, err := c.Request(ctx, method, path, opts)
		if err == nil {
			if resp.StatusCode == 429 {
				retryAfter := 2 * (i + 1)
				time.Sleep(time.Duration(retryAfter) * time.Second)
				continue
			}
			return resp, nil
		}
		lastErr = err

		backoff := time.Duration(1<<uint(i)) * time.Second
		if backoff > 30*time.Second {
			backoff = 30 * time.Second
		}
		time.Sleep(backoff)
	}
	return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}
