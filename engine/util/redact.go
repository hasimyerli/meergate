package util

import (
	"encoding/json"
	"strings"
)

var sensitiveKeys = []string{
	"password", "secret", "token", "apikey", "api_key",
	"authorization", "x-api-key", "x-api-secret",
}

// RedactObject deep-copies an object and redacts sensitive fields.
func RedactObject(obj interface{}) interface{} {
	b, err := json.Marshal(obj)
	if err != nil {
		return obj
	}
	var m interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return obj
	}
	return redactValue(m)
}

func redactValue(v interface{}) interface{} {
	switch val := v.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{}, len(val))
		for k, vv := range val {
			if isSensitive(k) {
				result[k] = "***REDACTED***"
			} else {
				result[k] = redactValue(vv)
			}
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(val))
		for i, vv := range val {
			result[i] = redactValue(vv)
		}
		return result
	default:
		return v
	}
}

func isSensitive(key string) bool {
	lower := strings.ToLower(key)
	for _, s := range sensitiveKeys {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}
