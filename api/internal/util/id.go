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

func GenerateRunID() string {
	return "run_" + newULID()
}

// GenerateID returns a prefixed unique id (e.g. "cand_01H...").
func GenerateID(prefix string) string {
	return prefix + "_" + newULID()
}

func GenerateStepResultID() string {
	return "stp_" + newULID()
}

func GenerateHealthCheckID() string {
	return "hc_" + newULID()
}

func GenerateArtifactID() string {
	return "art_" + newULID()
}

func GenerateSessionID() string {
	return "ses_" + newULID()
}

func GenerateCorrelationID() string {
	return "cor_" + newULID()
}

func GenerateUserID() string {
	return "usr_" + newULID()
}

func GenerateScheduleID() string {
	return "sched_" + newULID()
}

func GenerateAlertID() string {
	return "alrt_" + newULID()
}

func GenerateAlertEventID() string {
	return "alev_" + newULID()
}
