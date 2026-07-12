package adapter

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/golang/protobuf/jsonpb"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	"github.com/hasimyerli/meergine/client"
)

// ServiceTarget holds connection info resolved from the service catalog.
type ServiceTarget struct {
	Target string
	TLS    bool
}

// ServiceResolver maps a fully-qualified gRPC service name to its target.
type ServiceResolver func(serviceFQN string) (*ServiceTarget, error)

// NetworkAdapter is the only ProtocolAdapter today: it makes real HTTP/gRPC/WS
// calls over the network (using the pkg/client wrappers). Targets come per-step
// (from the service catalog) — there is no global base URL or credentials. The
// ProtocolAdapter interface is kept as a seam so the engine stays
// transport-agnostic (e.g. a fake adapter for offline engine tests, or a
// record/replay adapter, can be added without touching the engine).
type NetworkAdapter struct {
	httpClient      *http.Client
	serviceResolver ServiceResolver
}

func NewNetworkAdapter(opts ...func(*NetworkAdapter)) *NetworkAdapter {
	l := &NetworkAdapter{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, opt := range opts {
		opt(l)
	}
	return l
}

func WithServiceResolver(resolver ServiceResolver) func(*NetworkAdapter) {
	return func(l *NetworkAdapter) {
		l.serviceResolver = resolver
	}
}

func (l *NetworkAdapter) Name() string { return "live" }

func (l *NetworkAdapter) Rest(method, path string, opts *RestOpts) (*RestResponse, error) {
	if opts == nil || opts.BaseURL == "" {
		return nil, fmt.Errorf("rest: no base URL — select a catalog endpoint or set the step's base URL")
	}
	baseURL := strings.TrimRight(opts.BaseURL, "/")
	url := baseURL + path

	var bodyReader io.Reader
	if opts.Body != nil {
		b, err := json.Marshal(opts.Body)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(strings.ToUpper(method), url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	if opts.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range opts.Headers {
		req.Header.Set(k, v)
	}

	resp, err := l.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var bodyJSON interface{}
	if err := json.Unmarshal(bodyBytes, &bodyJSON); err != nil {
		bodyJSON = string(bodyBytes)
	}

	headers := make(map[string]string)
	for k, vs := range resp.Header {
		if len(vs) > 0 {
			headers[strings.ToLower(k)] = vs[0]
		}
	}

	return &RestResponse{
		StatusCode: resp.StatusCode,
		Headers:    headers,
		Body:       bodyJSON,
	}, nil
}

func (l *NetworkAdapter) GRPC(service, method string, message map[string]interface{}, opts *GRPCOpts) (*GrpcResponse, error) {
	start := time.Now()

	target, useTLS, err := l.resolveGRPCTarget(service, opts)
	if err != nil {
		return nil, fmt.Errorf("resolve gRPC target for %s: %w", service, err)
	}

	var dialOpts []grpc.DialOption
	if useTLS {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{})))
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.NewClient(target, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", target, err)
	}
	defer func() { _ = conn.Close() }()

	ctx := context.Background()
	deadline := 10000
	if opts != nil && opts.DeadlineMs > 0 {
		deadline = opts.DeadlineMs
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(deadline)*time.Millisecond)
	defer cancel()

	if opts != nil && opts.Metadata != nil {
		md := metadata.New(opts.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	refClient := grpcreflect.NewClientAuto(ctx, conn)
	defer refClient.Reset()

	svcDesc, err := refClient.ResolveService(service)
	if err != nil {
		return nil, fmt.Errorf("resolve service %s via reflection: %w", service, err)
	}

	methodDesc := svcDesc.FindMethodByName(method)
	if methodDesc == nil {
		return nil, fmt.Errorf("method %s not found on service %s", method, service)
	}

	reqMsg := dynamic.NewMessage(methodDesc.GetInputType())
	if message != nil {
		msgJSON, err := json.Marshal(message)
		if err != nil {
			return nil, fmt.Errorf("marshal request message: %w", err)
		}
		unmarshaler := &jsonpb.Unmarshaler{AllowUnknownFields: true}
		if err := reqMsg.UnmarshalJSONPB(unmarshaler, msgJSON); err != nil {
			return nil, fmt.Errorf("unmarshal request into proto: %w", err)
		}
	}

	respMsg := dynamic.NewMessage(methodDesc.GetOutputType())

	fullMethod := fmt.Sprintf("/%s/%s", service, method)
	if err := conn.Invoke(ctx, fullMethod, reqMsg, respMsg); err != nil {
		return nil, fmt.Errorf("grpc invoke %s: %w", fullMethod, err)
	}

	marshaler := &jsonpb.Marshaler{OrigName: true, EmitDefaults: true}
	respJSON, err := respMsg.MarshalJSONPB(marshaler)
	if err != nil {
		return nil, fmt.Errorf("marshal grpc response: %w", err)
	}

	var respBody interface{}
	if err := json.Unmarshal(respJSON, &respBody); err != nil {
		respBody = string(respJSON)
	}

	duration := time.Since(start).Milliseconds()

	return &GrpcResponse{
		Status:     GrpcStatus{Code: 0, Details: "OK"},
		Message:    respBody,
		Metadata:   map[string]string{},
		DurationMs: int(duration),
	}, nil
}

func (l *NetworkAdapter) resolveGRPCTarget(service string, opts *GRPCOpts) (target string, useTLS bool, err error) {
	if opts != nil && opts.Target != "" {
		target = opts.Target
		useTLS = !strings.Contains(target, "localhost") && !strings.HasSuffix(target, ":50051")
		if opts.TLS != nil {
			useTLS = *opts.TLS
		}
		return target, useTLS, nil
	}

	if l.serviceResolver != nil {
		st, err := l.serviceResolver(service)
		if err != nil {
			return "", false, err
		}
		return st.Target, st.TLS, nil
	}

	return "", false, fmt.Errorf("no target for service %s: set step.target or configure the service catalog", service)
}

func (l *NetworkAdapter) WsConnect(url, channel string) (*WsConnection, error) {
	if url == "" {
		return nil, fmt.Errorf("ws: no URL — set the step's WebSocket URL")
	}
	c := client.NewWsClient(url)
	live, err := c.Connect(context.Background(), channel, 10000)
	if err != nil {
		return nil, err
	}
	return &WsConnection{Channel: channel, live: live, wsClient: c}, nil
}

func (l *NetworkAdapter) WsWaitForMessage(conn *WsConnection, predicate func(*WsMessage) bool, timeoutMs int) (*WsMessage, error) {
	if conn == nil || conn.wsClient == nil {
		return nil, fmt.Errorf("ws: no active connection")
	}
	var pred func(*client.WsMessage) bool
	if predicate != nil {
		pred = func(m *client.WsMessage) bool {
			return predicate(&WsMessage{Channel: m.Channel, Data: m.Data})
		}
	}
	msg, err := conn.wsClient.WaitForMessage(context.Background(), conn.live, pred, timeoutMs)
	if err != nil {
		return nil, err
	}
	return &WsMessage{Channel: msg.Channel, Data: msg.Data, Timestamp: time.Now().UnixMilli()}, nil
}

func (l *NetworkAdapter) WsClose(conn *WsConnection) {
	if conn != nil && conn.wsClient != nil {
		conn.wsClient.Close(conn.live)
	}
}
