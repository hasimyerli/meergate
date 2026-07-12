package event

import "sync/atomic"

// RunEmitter sends events to a Hub for WebSocket broadcast. It implements the
// engine's event.Emitter (defined in pkg/event), bridging the standalone
// engine to this app's live cinema view.
type RunEmitter struct {
	runID string
	hub   *Hub
	seq   atomic.Int64
}

func NewRunEmitter(runID string, hub *Hub) *RunEmitter {
	return &RunEmitter{runID: runID, hub: hub}
}

func (e *RunEmitter) Emit(typ EventType, payload any) {
	seq := e.seq.Add(1)
	evt := NewEvent(typ, e.runID, seq, payload)
	e.hub.Broadcast(e.runID, evt)
}
