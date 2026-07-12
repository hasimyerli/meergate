package adapter

import "github.com/hasimyerli/meergine/client"

// RestResponse is a normalized REST response.
type RestResponse struct {
	StatusCode int
	Headers    map[string]string
	Body       interface{}
}

// GrpcStatus is a normalized gRPC status.
type GrpcStatus struct {
	Code    int
	Details string
}

// GrpcResponse is a normalized gRPC response.
type GrpcResponse struct {
	Status     GrpcStatus
	Message    interface{}
	Metadata   map[string]string
	DurationMs int
}

// WsMessage is a single message received on a WebSocket connection.
type WsMessage struct {
	Channel   string
	Data      interface{}
	Timestamp int64
}

// WsConnection wraps a live WebSocket connection.
type WsConnection struct {
	Channel  string
	live     *client.WsConnection
	wsClient *client.WsClient
}

// ProtocolAdapter is the interface all protocol adapters must implement.
type ProtocolAdapter interface {
	Name() string
	Rest(method, path string, opts *RestOpts) (*RestResponse, error)
	GRPC(service, method string, message map[string]interface{}, opts *GRPCOpts) (*GrpcResponse, error)
	WsConnect(url, channel string) (*WsConnection, error)
	WsWaitForMessage(conn *WsConnection, predicate func(*WsMessage) bool, timeoutMs int) (*WsMessage, error)
	WsClose(conn *WsConnection)
}

type RestOpts struct {
	Body      map[string]interface{}
	Headers   map[string]string
	TimeoutMs int
	BaseURL   string
}

type GRPCOpts struct {
	ProtoFile  string
	Metadata   map[string]string
	DeadlineMs int
	Target     string
	TLS        *bool // explicit transport when Target is set (overrides the heuristic)
}
