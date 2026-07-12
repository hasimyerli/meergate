package model

// The engine-facing domain types now live in pkg/model so the engine can be
// developed (and later extracted) as a standalone package with no dependency on
// this application. These aliases re-export them under the original
// `model.<Type>` names so the rest of the app compiles unchanged.
import pkgmodel "github.com/hasimyerli/meergine/model"

type (
	TestManifest    = pkgmodel.TestManifest
	ManifestConfig  = pkgmodel.ManifestConfig
	TestStep        = pkgmodel.TestStep
	TestAssertion   = pkgmodel.TestAssertion
	StepTemplate    = pkgmodel.StepTemplate
	StepResult      = pkgmodel.StepResult
	StepExtract     = pkgmodel.StepExtract
	AssertionResult = pkgmodel.AssertionResult
	RunStatus       = pkgmodel.RunStatus
)

const (
	RunStatusPending = pkgmodel.RunStatusPending
	RunStatusRunning = pkgmodel.RunStatusRunning
	RunStatusPassed  = pkgmodel.RunStatusPassed
	RunStatusFailed  = pkgmodel.RunStatusFailed
	RunStatusError   = pkgmodel.RunStatusError
)
