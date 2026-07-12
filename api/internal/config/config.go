package config

import "github.com/kelseyhightower/envconfig"

type Config struct {
	APIPort            int    `envconfig:"API_PORT" default:"3001"`
	APIHost            string `envconfig:"API_HOST" default:"0.0.0.0"`
	MaxConcurrency     int    `envconfig:"MAX_CONCURRENCY" default:"3"`
	DefaultStepTimeout int    `envconfig:"DEFAULT_STEP_TIMEOUT_MS" default:"10000"`
	DefaultWSTimeout   int    `envconfig:"DEFAULT_WS_TIMEOUT_MS" default:"15000"`
	DatabaseURL        string `envconfig:"DATABASE_URL" default:"postgresql://postgres:postgres@localhost:5432/test_automation"`
	LogLevel           string `envconfig:"LOG_LEVEL" default:"info"`
	MigrationsPath     string `envconfig:"MIGRATIONS_PATH" default:"./migrations"`
	AIProvider         string `envconfig:"AI_PROVIDER" default:"openai"`
	AIAPIKey           string `envconfig:"AI_API_KEY" default:""`
	AIAPIUrl           string `envconfig:"AI_API_URL" default:"https://api.openai.com/v1"`
	AIModel            string `envconfig:"AI_MODEL" default:"gpt-4o"`
	AIAnthropicAPIKey  string `envconfig:"AI_ANTHROPIC_API_KEY" default:""`
	JWTSecret          string `envconfig:"JWT_SECRET" default:"super-secret-jwt-key-change-in-production"`
	DefaultAdminUser   string `envconfig:"DEFAULT_ADMIN_USERNAME" default:"admin"`
	DefaultAdminPass   string `envconfig:"DEFAULT_ADMIN_PASSWORD" default:""`
}

func Load() (*Config, error) {
	var c Config
	if err := envconfig.Process("", &c); err != nil {
		return nil, err
	}
	return &c, nil
}
