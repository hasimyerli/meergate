package model

// TestManifest matches the TypeScript TestManifest type exactly.
type TestManifest struct {
	ID          string              `yaml:"id" json:"id"`
	Name        string              `yaml:"name" json:"name"`
	Description string              `yaml:"description,omitempty" json:"description,omitempty"`
	Suite       string              `yaml:"suite" json:"suite"`
	Tags        []string            `yaml:"tags" json:"tags"`
	Version     int                 `yaml:"version" json:"version"`
	Owner       string              `yaml:"owner,omitempty" json:"owner,omitempty"`
	Params      map[string]string   `yaml:"params" json:"params"`
	Config      ManifestConfig      `yaml:"config" json:"config"`
	Setup       []TestStep          `yaml:"setup,omitempty" json:"setup,omitempty"`
	Steps       []TestStep          `yaml:"steps" json:"steps"`
	Teardown    []TestStep          `yaml:"teardown,omitempty" json:"teardown,omitempty"`
	Matrix      map[string][]string `yaml:"matrix,omitempty" json:"matrix,omitempty"`
}

type ManifestConfig struct {
	Mode      string `yaml:"mode" json:"mode"`
	TimeoutMs int    `yaml:"timeout_ms" json:"timeout_ms"`
	Retries   int    `yaml:"retries" json:"retries"`
}

type TestStep struct {
	Name           string            `yaml:"name" json:"name"`
	Type           string            `yaml:"type" json:"type"`
	Use            string            `yaml:"use,omitempty" json:"use,omitempty"`
	With           map[string]string `yaml:"with,omitempty" json:"with,omitempty"`
	Method         string            `yaml:"method,omitempty" json:"method,omitempty"`
	Path           string            `yaml:"path,omitempty" json:"path,omitempty"`
	BaseURL        string            `yaml:"baseUrl,omitempty" json:"baseUrl,omitempty"`
	Body           interface{}       `yaml:"body,omitempty" json:"body,omitempty"`
	Headers        map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	Channel        string            `yaml:"channel,omitempty" json:"channel,omitempty"`
	WaitMs         int               `yaml:"waitMs,omitempty" json:"waitMs,omitempty"`
	Condition      string            `yaml:"condition,omitempty" json:"condition,omitempty"`
	Service        string            `yaml:"service,omitempty" json:"service,omitempty"`
	RPCMethod      string            `yaml:"rpcMethod,omitempty" json:"rpcMethod,omitempty"`
	ProtoFile      string            `yaml:"protoFile,omitempty" json:"protoFile,omitempty"`
	Message        interface{}       `yaml:"message,omitempty" json:"message,omitempty"`
	Metadata       map[string]string `yaml:"metadata,omitempty" json:"metadata,omitempty"`
	Target         string            `yaml:"target,omitempty" json:"target,omitempty"`
	Deadline       int               `yaml:"deadline,omitempty" json:"deadline,omitempty"`
	Action         string            `yaml:"action,omitempty" json:"action,omitempty"`
	URL            string            `yaml:"url,omitempty" json:"url,omitempty"`
	Selector       string            `yaml:"selector,omitempty" json:"selector,omitempty"`
	Value          interface{}       `yaml:"value,omitempty" json:"value,omitempty"`
	Key            string            `yaml:"key,omitempty" json:"key,omitempty"`
	SelectorState  string            `yaml:"selectorState,omitempty" json:"selectorState,omitempty"`
	ScreenshotName string            `yaml:"screenshotName,omitempty" json:"screenshotName,omitempty"`
	Assert         []TestAssertion   `yaml:"assert,omitempty" json:"assert,omitempty"`
	Extract        map[string]string `yaml:"extract,omitempty" json:"extract,omitempty"`
	When           string            `yaml:"when,omitempty" json:"when,omitempty"`
	Retries        int               `yaml:"retries,omitempty" json:"retries,omitempty"`
	DependsOn      []string          `yaml:"dependsOn,omitempty" json:"dependsOn,omitempty"`
}

type TestAssertion struct {
	Type      string      `yaml:"type" json:"type"`
	Path      string      `yaml:"path,omitempty" json:"path,omitempty"`
	Expected  interface{} `yaml:"expected,omitempty" json:"expected,omitempty"`
	Schema    string      `yaml:"schema,omitempty" json:"schema,omitempty"`
	Field     string      `yaml:"field,omitempty" json:"field,omitempty"`
	Tolerance float64     `yaml:"tolerance,omitempty" json:"tolerance,omitempty"`
}

// StepTemplate for template-based steps
type StepTemplate struct {
	ID          string            `yaml:"id" json:"id"`
	Name        string            `yaml:"name" json:"name"`
	Description string            `yaml:"description,omitempty" json:"description,omitempty"`
	Type        string            `yaml:"type" json:"type"`
	Method      string            `yaml:"method,omitempty" json:"method,omitempty"`
	Path        string            `yaml:"path,omitempty" json:"path,omitempty"`
	BaseURL     string            `yaml:"baseUrl,omitempty" json:"baseUrl,omitempty"`
	Body        interface{}       `yaml:"body,omitempty" json:"body,omitempty"`
	Headers     map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	Service     string            `yaml:"service,omitempty" json:"service,omitempty"`
	RPCMethod   string            `yaml:"rpcMethod,omitempty" json:"rpcMethod,omitempty"`
	ProtoFile   string            `yaml:"protoFile,omitempty" json:"protoFile,omitempty"`
	Message     interface{}       `yaml:"message,omitempty" json:"message,omitempty"`
	Metadata    map[string]string `yaml:"metadata,omitempty" json:"metadata,omitempty"`
	Target      string            `yaml:"target,omitempty" json:"target,omitempty"`
	Channel     string            `yaml:"channel,omitempty" json:"channel,omitempty"`
	WaitMs      int               `yaml:"waitMs,omitempty" json:"waitMs,omitempty"`
	Action      string            `yaml:"action,omitempty" json:"action,omitempty"`
	URL         string            `yaml:"url,omitempty" json:"url,omitempty"`
	Selector    string            `yaml:"selector,omitempty" json:"selector,omitempty"`
	Value       interface{}       `yaml:"value,omitempty" json:"value,omitempty"`
	Extract     map[string]string `yaml:"extract,omitempty" json:"extract,omitempty"`
	Assert      []TestAssertion   `yaml:"assert,omitempty" json:"assert,omitempty"`
}
