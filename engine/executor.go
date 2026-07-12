package meergine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergine/adapter"
	"github.com/hasimyerli/meergine/event"
	"github.com/hasimyerli/meergine/model"
	"github.com/hasimyerli/meergine/util"
)

// Executor runs a single step: interpolation, the protocol call, extraction and
// assertions. It never touches a database — results are returned in the
// StepResult and surfaced live through the emitter. Persistence is the caller's
// job (see Runner + RunRequest.OnStep).
type Executor struct {
	cfg     Config
	adapter adapter.ProtocolAdapter
	emitter event.Emitter
	logger  *slog.Logger

	// Shared browser for all browserAction steps in a run (lazy-started;
	// torn down by CloseBrowser). Keeps page/cookie/DOM state across steps.
	browserCtx    context.Context
	browserCancel context.CancelFunc
	allocCancel   context.CancelFunc
}

// NewExecutor builds an executor bound to one run's adapter and emitter.
func NewExecutor(cfg Config, adp adapter.ProtocolAdapter, emitter event.Emitter, logger *slog.Logger) *Executor {
	return &Executor{
		cfg:     cfg,
		adapter: adp,
		emitter: emitter,
		logger:  logger,
	}
}

// ExecuteStep runs one step to completion and returns its result. It emits
// step_started / step_completed (and assertion/extract) events along the way,
// but does not persist anything.
func (e *Executor) ExecuteStep(ctx context.Context, step *model.TestStep, stepIndex int, interpCtx *util.InterpolateContext, phase string) *model.StepResult {
	startedAt := time.Now().UTC().Format(time.RFC3339)
	result := &model.StepResult{
		ID:        util.GenerateStepResultID(),
		StepIndex: stepIndex,
		StepName:  step.Name,
		StepType:  step.Type,
		Status:    "running",
		StartedAt: &startedAt,
		CreatedAt: startedAt,
	}

	e.emitter.Emit(event.EventStepStarted, event.StepStartedPayload{
		StepIndex: stepIndex,
		StepName:  step.Name,
		StepType:  step.Type,
		Phase:     phase,
	})

	// Skip when the step's `when` condition is false.
	if step.When != "" && !util.EvaluateCondition(step.When, interpCtx) {
		result.Status = "skipped"
		e.emitStepCompleted(result)
		return result
	}

	start := time.Now()
	timeoutMs := e.cfg.DefaultStepTimeoutMs

	var lastErr error
	for attempt := 0; attempt <= step.Retries; attempt++ {
		if attempt > 0 {
			e.logger.Info("retrying step", "step", step.Name, "attempt", attempt)
			time.Sleep(1 * time.Second)
		}

		lastErr = e.executeStepByType(ctx, step, result, interpCtx, timeoutMs)
		if lastErr == nil && result.Status != "failed" {
			break
		}
		result.RetryCount = attempt + 1
	}

	duration := time.Since(start).Milliseconds()
	result.DurationMs = &duration

	if lastErr != nil {
		errStr := lastErr.Error()
		result.Error = &errStr
		result.Status = "error"
	} else if result.Status == "running" {
		result.Status = "passed"
	}

	e.emitStepCompleted(result)
	return result
}

func (e *Executor) emitStepCompleted(result *model.StepResult) {
	e.emitter.Emit(event.EventStepCompleted, event.StepCompletedPayload{
		StepIndex:       result.StepIndex,
		StepName:        result.StepName,
		StepType:        result.StepType,
		Status:          result.Status,
		DurationMs:      result.DurationMs,
		Error:           result.Error,
		RetryCount:      result.RetryCount,
		RequestSummary:  result.RequestSummary,
		ResponseSummary: result.ResponseSummary,
	})
}

func (e *Executor) executeStepByType(ctx context.Context, step *model.TestStep, result *model.StepResult, interpCtx *util.InterpolateContext, timeoutMs int) error {
	switch step.Type {
	case "apiCall":
		return e.executeAPICall(ctx, step, result, interpCtx, timeoutMs)
	case "grpcCall":
		return e.executeGRPCCall(ctx, step, result, interpCtx, timeoutMs)
	case "wsSubscribe":
		return e.executeWSSubscribe(ctx, step, result, interpCtx, timeoutMs)
	case "waitUntil":
		return e.executeWaitUntil(step)
	case "assert":
		return e.executeAssert(ctx, step, result, interpCtx)
	case "browserAction":
		return e.executeBrowserAction(ctx, step, result, interpCtx, timeoutMs)
	default:
		return fmt.Errorf("unknown step type: %s", step.Type)
	}
}

func (e *Executor) executeAPICall(ctx context.Context, step *model.TestStep, result *model.StepResult, interpCtx *util.InterpolateContext, timeoutMs int) error {
	method := step.Method
	path := util.Interpolate(step.Path, interpCtx)

	var body map[string]interface{}
	if step.Body != nil {
		if m, ok := util.InterpolateObject(step.Body, interpCtx).(map[string]interface{}); ok {
			body = m
		}
	}

	headers := make(map[string]string)
	for k, v := range step.Headers {
		headers[k] = util.Interpolate(fmt.Sprintf("%v", v), interpCtx)
	}

	result.RequestSummary = map[string]interface{}{
		"method":  method,
		"path":    path,
		"headers": util.RedactObject(headers),
	}

	opts := &adapter.RestOpts{Body: body, Headers: headers, TimeoutMs: timeoutMs}
	if step.BaseURL != "" {
		opts.BaseURL = util.Interpolate(step.BaseURL, interpCtx)
	}

	resp, err := e.adapter.Rest(method, path, opts)
	if err != nil {
		return err
	}

	result.ResponseSummary = map[string]interface{}{
		"statusCode": resp.StatusCode,
		"body":       resp.Body,
	}

	e.applyExtracts(step, resp.Body, result, interpCtx)
	e.applyAssertions(ctx, step, resp, result, interpCtx)
	return nil
}

func (e *Executor) executeGRPCCall(ctx context.Context, step *model.TestStep, result *model.StepResult, interpCtx *util.InterpolateContext, _ int) error {
	service := util.Interpolate(step.Service, interpCtx)
	rpcMethod := util.Interpolate(step.RPCMethod, interpCtx)

	var message map[string]interface{}
	if step.Message != nil {
		if m, ok := util.InterpolateObject(step.Message, interpCtx).(map[string]interface{}); ok {
			message = m
		}
	}

	result.RequestSummary = map[string]interface{}{
		"service":   service,
		"rpcMethod": rpcMethod,
		"message":   message,
	}

	opts := &adapter.GRPCOpts{
		Metadata:   step.Metadata,
		DeadlineMs: step.Deadline,
		ProtoFile:  step.ProtoFile,
		Target:     step.Target,
	}

	resp, err := e.adapter.GRPC(service, rpcMethod, message, opts)
	if err != nil {
		return err
	}

	result.ResponseSummary = map[string]interface{}{
		"status":  resp.Status,
		"message": resp.Message,
	}

	e.applyExtracts(step, resp.Message, result, interpCtx)
	// gRPC assertions run against the message body with the gRPC status code
	// mapped into the REST-shaped response the assertion engine understands.
	e.applyAssertions(ctx, step, &adapter.RestResponse{
		StatusCode: resp.Status.Code,
		Body:       resp.Message,
		Headers:    map[string]string{},
	}, result, interpCtx)
	return nil
}

func (e *Executor) executeWSSubscribe(ctx context.Context, step *model.TestStep, result *model.StepResult, interpCtx *util.InterpolateContext, _ int) error {
	channel := util.Interpolate(step.Channel, interpCtx)
	url := util.Interpolate(step.URL, interpCtx)

	wsTimeoutMs := e.cfg.DefaultWSTimeoutMs
	if step.WaitMs > 0 {
		wsTimeoutMs = step.WaitMs
	}

	conn, err := e.adapter.WsConnect(url, channel)
	if err != nil {
		return fmt.Errorf("ws connect failed: %w", err)
	}
	defer e.adapter.WsClose(conn)

	msg, err := e.adapter.WsWaitForMessage(conn, nil, wsTimeoutMs)
	if err != nil {
		return fmt.Errorf("ws wait failed: %w", err)
	}

	result.ResponseSummary = map[string]interface{}{
		"channel": channel,
		"message": msg,
	}

	// Extraction runs against a JSON round-trip of the message payload so
	// jsonPath sees plain maps/slices.
	if step.Extract != nil && msg != nil {
		var msgData interface{}
		if b, mErr := json.Marshal(msg.Data); mErr == nil {
			_ = json.Unmarshal(b, &msgData)
		}
		e.applyExtracts(step, msgData, result, interpCtx)
	}

	if msg != nil {
		e.applyAssertions(ctx, step, &adapter.RestResponse{StatusCode: 200, Body: msg.Data}, result, interpCtx)
	}
	return nil
}

func (e *Executor) executeWaitUntil(step *model.TestStep) error {
	if step.WaitMs > 0 {
		time.Sleep(time.Duration(step.WaitMs) * time.Millisecond)
	}
	return nil
}

func (e *Executor) executeAssert(ctx context.Context, step *model.TestStep, result *model.StepResult, interpCtx *util.InterpolateContext) error {
	// A standalone assert step evaluates against the accumulated extract context.
	e.applyAssertions(ctx, step, &adapter.RestResponse{StatusCode: 200, Body: interpCtx.Extract}, result, interpCtx)
	return nil
}

// applyExtracts pulls each configured value out of body, feeds it into the
// shared interpolation context (so later steps can reference it) and records it
// on the result for the caller to persist. It never writes to a database.
func (e *Executor) applyExtracts(step *model.TestStep, body interface{}, result *model.StepResult, interpCtx *util.InterpolateContext) {
	for key, jsonPath := range step.Extract {
		val := util.QueryJSONPath(jsonPath, body)
		if val == nil {
			continue
		}
		interpCtx.Extract[key] = val
		result.Extracts = append(result.Extracts, model.StepExtract{
			Type:     "extract",
			Key:      key,
			Value:    fmt.Sprintf("%v", val),
			JSONPath: jsonPath,
		})
		e.emitter.Emit(event.EventDataExtracted, event.DataExtractedPayload{
			StepIndex: result.StepIndex,
			StepName:  step.Name,
			Key:       key,
			Value:     val,
			JSONPath:  jsonPath,
		})
	}
}

// applyAssertions evaluates every assertion on the step, records the results,
// emits an event per assertion and marks the step failed on the first miss.
func (e *Executor) applyAssertions(ctx context.Context, step *model.TestStep, resp *adapter.RestResponse, result *model.StepResult, interpCtx *util.InterpolateContext) {
	if step.Assert == nil {
		return
	}
	assertions := evaluateAssertions(step.Assert, resp, interpCtx, ctx, step, result)
	result.Assertions = assertions
	for _, a := range assertions {
		e.emitter.Emit(event.EventAssertionEvaluated, event.AssertionEvaluatedPayload{
			StepIndex: result.StepIndex,
			StepName:  step.Name,
			Name:      a.Name,
			Passed:    a.Passed,
			Expected:  a.Expected,
			Actual:    a.Actual,
		})
		if !a.Passed {
			result.Status = "failed"
			break
		}
	}
}

func evaluateAssertions(assertions []model.TestAssertion, resp *adapter.RestResponse, interpCtx *util.InterpolateContext, _ context.Context, step *model.TestStep, result *model.StepResult) []model.AssertionResult {
	assertCtx := assertionContext(interpCtx.Extract)
	if assertCtx == nil {
		assertCtx = make(assertionContext)
	}
	assertCtx["_testId"] = step.Name
	assertCtx["_stepIndex"] = result.StepIndex

	results := make([]model.AssertionResult, 0, len(assertions))
	for _, assertion := range assertions {
		results = append(results, EvaluateAssertion(assertion, resp, assertCtx))
	}
	return results
}
