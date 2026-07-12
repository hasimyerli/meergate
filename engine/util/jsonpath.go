package util

import (
	"github.com/ohler55/ojg/jp"
	"github.com/ohler55/ojg/oj"
)

// QueryJSONPath queries a JSONPath expression against data.
func QueryJSONPath(path string, data interface{}) interface{} {
	x, err := jp.ParseString(path)
	if err != nil {
		return nil
	}

	// ojg requires the data to be in its own format
	// marshal/unmarshal via oj to ensure compatibility
	b, err := oj.Marshal(data)
	if err != nil {
		return nil
	}
	obj, err := oj.ParseString(string(b))
	if err != nil {
		return nil
	}

	results := x.Get(obj)
	if len(results) == 0 {
		return nil
	}
	if len(results) == 1 {
		return normalizeOJG(results[0])
	}
	out := make([]interface{}, len(results))
	for i, r := range results {
		out[i] = normalizeOJG(r)
	}
	return out
}

// QueryJSONPathArray always returns a slice.
func QueryJSONPathArray(path string, data interface{}) []interface{} {
	result := QueryJSONPath(path, data)
	if result == nil {
		return nil
	}
	if arr, ok := result.([]interface{}); ok {
		return arr
	}
	return []interface{}{result}
}

// normalizeOJG converts ojg-specific types back to standard Go types.
func normalizeOJG(v interface{}) interface{} {
	switch val := v.(type) {
	case map[string]interface{}:
		return val
	case []interface{}:
		return val
	default:
		return v
	}
}
