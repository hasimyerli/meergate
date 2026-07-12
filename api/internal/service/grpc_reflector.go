package service

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

type ReflectedMethod struct {
	Name           string          `json:"name"`
	RequestType    string          `json:"requestType"`
	ResponseType   string          `json:"responseType"`
	RequestFields  json.RawMessage `json:"requestFields"`
	ResponseFields json.RawMessage `json:"responseFields"`
}

type ReflectedService struct {
	FQN     string            `json:"fqn"`
	Methods []ReflectedMethod `json:"methods"`
}

type ProtoField struct {
	Name          string       `json:"name"`
	Type          string       `json:"type"`
	Repeated      bool         `json:"repeated"`
	MessageFields []ProtoField `json:"messageFields,omitempty"`
}

var filteredPrefixes = []string{
	"grpc.reflection.",
	"grpc.health.",
}

// ReflectTargetAuto tries the preferred transport first, then falls back to the
// other (TLS <-> plaintext) so callers don't need to know whether the server
// speaks TLS. Returns the services and the transport (useTLS) that actually worked.
func ReflectTargetAuto(ctx context.Context, target string, preferTLS bool) ([]ReflectedService, bool, error) {
	svcs, err := ReflectTarget(ctx, target, preferTLS)
	if err == nil {
		return svcs, preferTLS, nil
	}
	svcs2, err2 := ReflectTarget(ctx, target, !preferTLS)
	if err2 == nil {
		return svcs2, !preferTLS, nil
	}
	return nil, preferTLS, err
}

// ReflectTarget connects to a gRPC server and discovers services/methods/fields via reflection.
// Returns JSON catalog in the format: {"methods": [...]}
// Each entry in the returned slice is a service with its methods.
func ReflectTarget(ctx context.Context, target string, useTLS bool) ([]ReflectedService, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var dialOpts []grpc.DialOption
	if useTLS {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{})))
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.NewClient(target, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", target, err)
	}
	defer conn.Close()

	client := grpcreflect.NewClientAuto(ctx, conn)
	defer client.Reset()

	serviceNames, err := client.ListServices()
	if err != nil {
		return nil, fmt.Errorf("list services on %s: %w", target, err)
	}

	var services []ReflectedService
	for _, svcName := range serviceNames {
		if isFiltered(svcName) {
			continue
		}

		svcDesc, err := client.ResolveService(svcName)
		if err != nil {
			continue
		}

		var methods []ReflectedMethod
		for _, md := range svcDesc.GetMethods() {
			reqFields := extractFields(md.GetInputType(), 0)
			respFields := extractFields(md.GetOutputType(), 0)

			reqJSON, _ := json.Marshal(reqFields)
			respJSON, _ := json.Marshal(respFields)

			methods = append(methods, ReflectedMethod{
				Name:           md.GetName(),
				RequestType:    md.GetInputType().GetFullyQualifiedName(),
				ResponseType:   md.GetOutputType().GetFullyQualifiedName(),
				RequestFields:  reqJSON,
				ResponseFields: respJSON,
			})
		}

		sort.Slice(methods, func(i, j int) bool {
			return methods[i].Name < methods[j].Name
		})

		services = append(services, ReflectedService{
			FQN:     svcName,
			Methods: methods,
		})
	}

	sort.Slice(services, func(i, j int) bool {
		return services[i].FQN < services[j].FQN
	})

	return services, nil
}

const maxFieldDepth = 4

func extractFields(msgDesc *desc.MessageDescriptor, depth int) []ProtoField {
	if msgDesc == nil || depth > maxFieldDepth {
		return nil
	}

	var fields []ProtoField
	for _, fd := range msgDesc.GetFields() {
		pf := ProtoField{
			Name:     fd.GetName(),
			Type:     fd.GetType().String(),
			Repeated: fd.IsRepeated(),
		}

		if fd.GetMessageType() != nil {
			pf.Type = "message"
			pf.MessageFields = extractFields(fd.GetMessageType(), depth+1)
		} else if fd.GetEnumType() != nil {
			pf.Type = "enum"
		}

		fields = append(fields, pf)
	}
	return fields
}

func isFiltered(name string) bool {
	for _, prefix := range filteredPrefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}
