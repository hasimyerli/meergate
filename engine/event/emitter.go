package event

// Emitter emits run execution events for live consumers (e.g. a WebSocket
// cinema view). Implementations are injected into the engine; the engine never
// depends on any concrete transport. A nil emitter is never used — pass
// NoOpEmitter{} to discard events.
type Emitter interface {
	Emit(typ EventType, payload any)
}

// NoOpEmitter discards all events. Used when nothing is subscribed (e.g. a CLI
// run that renders results itself instead of streaming them).
type NoOpEmitter struct{}

// Emit implements Emitter by doing nothing.
func (NoOpEmitter) Emit(EventType, any) {}
