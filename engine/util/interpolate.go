package util

import (
	"fmt"
	"regexp"
	"strings"
)

var templateRe = regexp.MustCompile(`\{\{(.+?)\}\}`)

type InterpolateContext struct {
	Params    map[string]string
	Overrides map[string]string
	Extract   map[string]interface{}
}

// Interpolate replaces {{params.key}}, {{extract.key}}, {{key}} in a template string.
func Interpolate(template string, ctx *InterpolateContext) string {
	return templateRe.ReplaceAllStringFunc(template, func(match string) string {
		inner := strings.TrimSpace(match[2 : len(match)-2])

		if strings.HasPrefix(inner, "params.") {
			key := inner[7:]
			if ctx.Overrides != nil {
				if v, ok := ctx.Overrides[key]; ok {
					return v
				}
			}
			if ctx.Params != nil {
				if v, ok := ctx.Params[key]; ok {
					return v
				}
			}
			return match
		}

		if strings.HasPrefix(inner, "extract.") {
			key := inner[8:]
			if ctx.Extract != nil {
				if v, ok := ctx.Extract[key]; ok {
					return fmt.Sprintf("%v", v)
				}
			}
			return match
		}

		// Try params / overrides directly
		if ctx.Params != nil {
			if v, ok := ctx.Params[inner]; ok {
				return v
			}
		}
		if ctx.Overrides != nil {
			if v, ok := ctx.Overrides[inner]; ok {
				return v
			}
		}
		return match
	})
}

// InterpolateObject recursively interpolates all string values in an interface{}.
func InterpolateObject(obj interface{}, ctx *InterpolateContext) interface{} {
	switch v := obj.(type) {
	case string:
		return Interpolate(v, ctx)
	case map[string]interface{}:
		result := make(map[string]interface{}, len(v))
		for k, val := range v {
			result[k] = InterpolateObject(val, ctx)
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, val := range v {
			result[i] = InterpolateObject(val, ctx)
		}
		return result
	default:
		return obj
	}
}

// EvaluateCondition evaluates simple == and != conditions after interpolation.
func EvaluateCondition(condition string, ctx *InterpolateContext) bool {
	resolved := Interpolate(condition, ctx)

	if strings.Contains(resolved, "==") {
		parts := strings.SplitN(resolved, "==", 2)
		left := strings.Trim(strings.TrimSpace(parts[0]), `'"`)
		right := strings.Trim(strings.TrimSpace(parts[1]), `'"`)
		return left == right
	}
	if strings.Contains(resolved, "!=") {
		parts := strings.SplitN(resolved, "!=", 2)
		left := strings.Trim(strings.TrimSpace(parts[0]), `'"`)
		right := strings.Trim(strings.TrimSpace(parts[1]), `'"`)
		return left != right
	}

	trimmed := strings.TrimSpace(resolved)
	return trimmed != "" && trimmed != "false" && trimmed != "0"
}
