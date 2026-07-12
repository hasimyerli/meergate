package util

import (
	"math/rand"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
)

var (
	entropy     = ulid.Monotonic(rand.New(rand.NewSource(time.Now().UnixNano())), 0)
	entropyLock sync.Mutex
)

func newULID() string {
	entropyLock.Lock()
	defer entropyLock.Unlock()
	return ulid.MustNew(ulid.Timestamp(time.Now()), entropy).String()
}

// GenerateStepResultID returns a unique, time-ordered id for a step result.
// The engine assigns one to every StepResult so callers can correlate live
// events with the value later returned in RunResult.
func GenerateStepResultID() string {
	return "stp_" + newULID()
}
