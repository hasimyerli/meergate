package event

// The event vocabulary (types, payloads, the Emitter interface) now lives in
// pkg/event so the engine can emit events without depending on this app's
// WebSocket Hub. These aliases re-export them under the original `event.<Name>`
// so the Hub, handlers and RunEmitter compile unchanged.
import pkgevent "github.com/hasimyerli/meergine/event"

type (
	EventType                 = pkgevent.EventType
	Event                     = pkgevent.Event
	Emitter                   = pkgevent.Emitter
	NoOpEmitter               = pkgevent.NoOpEmitter
	RunStartedPayload         = pkgevent.RunStartedPayload
	StepStartedPayload        = pkgevent.StepStartedPayload
	StepCompletedPayload      = pkgevent.StepCompletedPayload
	AssertionEvaluatedPayload = pkgevent.AssertionEvaluatedPayload
	DataExtractedPayload      = pkgevent.DataExtractedPayload
	RunCompletedPayload       = pkgevent.RunCompletedPayload
)

const (
	EventRunStarted         = pkgevent.EventRunStarted
	EventStepStarted        = pkgevent.EventStepStarted
	EventStepCompleted      = pkgevent.EventStepCompleted
	EventAssertionEvaluated = pkgevent.EventAssertionEvaluated
	EventDataExtracted      = pkgevent.EventDataExtracted
	EventRunCompleted       = pkgevent.EventRunCompleted
)

// NewEvent constructs an Event with a timestamp; re-exported from pkg/event.
var NewEvent = pkgevent.NewEvent
