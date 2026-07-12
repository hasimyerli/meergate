/**
 * Shared helpers that convert a Service Catalog entry (gRPC method or REST
 * endpoint) into a builder step `config` object. Used by both the builder's
 * StepConfigPanel (picking a method/endpoint from a live picker) and the
 * Service Catalog page's "Create test" deep-link (which pre-fills a fresh
 * canvas node from a catalog method/endpoint).
 */
import type { ProtoMethodInfo } from '@/components/builder/grpc-service-picker';
import type { RestServiceInfo, RestEndpointInfo } from '@/components/builder/rest-endpoint-picker';

/** Builds the `config` patch for an `apiCall` step from a REST endpoint. */
export function restEndpointToStepConfig(
  service: RestServiceInfo,
  endpoint: RestEndpointInfo,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    method: endpoint.method,
    path: endpoint.path,
    baseUrl: service.target,
    _catalogService: service.id,
  };
  if (endpoint.requestBody) {
    const schema = endpoint.requestBody as Record<string, unknown>;
    if (schema.properties && typeof schema.properties === 'object') {
      const body: Record<string, string> = {};
      for (const [k] of Object.entries(schema.properties as Record<string, unknown>)) {
        body[k] = '';
      }
      updates.body = body;
    }
  }
  return updates;
}

/** Builds the `config` patch for a `grpcCall` step from a proto method (excludes `service`). */
export function grpcMethodToStepConfig(method: ProtoMethodInfo): Record<string, unknown> {
  const defaultMsg: Record<string, unknown> = {};
  if (method.requestFields) {
    for (const f of method.requestFields) {
      if (f.type === 'string') defaultMsg[f.name] = '';
      else if (f.type === 'bool') defaultMsg[f.name] = false;
      else if (f.type === 'message') defaultMsg[f.name] = {};
      else if (f.repeated) defaultMsg[f.name] = [];
      else defaultMsg[f.name] = '';
    }
  }
  const updates: Record<string, unknown> = { rpcMethod: method.name, message: defaultMsg };
  if (method.protoFile) updates.protoFile = method.protoFile;
  return updates;
}

/** Builds a full `config` object (incl. `service`) for a brand-new grpcCall node — used by deep-links. */
export function grpcMethodToFullStepConfig(serviceFqn: string, method: ProtoMethodInfo): Record<string, unknown> {
  return { service: serviceFqn, ...grpcMethodToStepConfig(method) };
}
