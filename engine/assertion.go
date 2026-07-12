package meergine

import (
	"fmt"
	"strings"

	"github.com/hasimyerli/meergine/adapter"
	"github.com/hasimyerli/meergine/model"
	"github.com/hasimyerli/meergine/util"
)

type assertionContext map[string]interface{}

// EvaluateAssertion evaluates a single assertion against a response.
func EvaluateAssertion(
	assertion model.TestAssertion,
	response *adapter.RestResponse,
	ctx assertionContext,
) model.AssertionResult {
	switch assertion.Type {
	case "statusCode":
		expected := toFloat(assertion.Expected)
		return model.AssertionResult{
			Name:     fmt.Sprintf("statusCode == %v", assertion.Expected),
			Passed:   float64(response.StatusCode) == expected,
			Expected: assertion.Expected,
			Actual:   response.StatusCode,
		}

	case "jsonPath":
		actual := util.QueryJSONPath(assertion.Path, response.Body)
		expected := resolveExpected(assertion.Expected, ctx)
		return model.AssertionResult{
			Name:     fmt.Sprintf("jsonPath(%s) == %v", assertion.Path, expected),
			Passed:   fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", expected),
			Expected: expected,
			Actual:   actual,
		}

	case "jsonPathIncludes":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		expected := resolveExpected(assertion.Expected, ctx)
		includes := false
		for _, v := range values {
			if fmt.Sprintf("%v", v) == fmt.Sprintf("%v", expected) {
				includes = true
				break
			}
		}
		return model.AssertionResult{
			Name:     fmt.Sprintf("jsonPath(%s) includes %v", assertion.Path, expected),
			Passed:   includes,
			Expected: expected,
			Actual:   values,
		}

	case "jsonPathNotIncludes":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		expected := resolveExpected(assertion.Expected, ctx)
		notIncludes := true
		for _, v := range values {
			if fmt.Sprintf("%v", v) == fmt.Sprintf("%v", expected) {
				notIncludes = false
				break
			}
		}
		return model.AssertionResult{
			Name:     fmt.Sprintf("jsonPath(%s) not includes %v", assertion.Path, expected),
			Passed:   notIncludes,
			Expected: fmt.Sprintf("not %v", expected),
			Actual:   values,
		}

	case "greaterThan":
		actual := toFloat(util.QueryJSONPath(assertion.Path, response.Body))
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		tolerance := assertion.Tolerance
		return model.AssertionResult{
			Name:     fmt.Sprintf("jsonPath(%s) > %v", assertion.Path, expected),
			Passed:   actual > expected-tolerance,
			Expected: fmt.Sprintf("> %v", expected),
			Actual:   actual,
		}

	case "lessThan":
		actual := toFloat(util.QueryJSONPath(assertion.Path, response.Body))
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("jsonPath(%s) < %v", assertion.Path, expected),
			Passed:   actual < expected,
			Expected: fmt.Sprintf("< %v", expected),
			Actual:   actual,
		}

	case "nonEmpty":
		var target interface{}
		if assertion.Path != "" {
			target = util.QueryJSONPath(assertion.Path, response.Body)
		} else {
			target = response.Body
		}
		isEmpty := isEmptyValue(target)
		expectNonEmpty := assertion.Expected != false
		return model.AssertionResult{
			Name:     fmt.Sprintf("nonEmpty(%s)", assertion.Path),
			Passed:   boolIf(expectNonEmpty, !isEmpty, isEmpty),
			Expected: boolStr(expectNonEmpty, "non-empty", "empty"),
			Actual:   boolStr(isEmpty, "empty", "non-empty"),
		}

	case "wsMessageReceived":
		received := ctx["_wsMessageReceived"] == true
		return model.AssertionResult{
			Name:     "wsMessageReceived",
			Passed:   received,
			Expected: true,
			Actual:   ctx["_wsMessageReceived"],
		}

	case "grpcStatus":
		actualCode := ctx["_grpcStatusCode"]
		expectedCode := int(toFloat(assertion.Expected))
		return model.AssertionResult{
			Name:     fmt.Sprintf("grpcStatus == %d", expectedCode),
			Passed:   int(toFloat(actualCode)) == expectedCode,
			Expected: expectedCode,
			Actual:   actualCode,
		}

	case "sumGreaterThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		sum := sumFloats(values)
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("sum(%s) > %v", assertion.Path, expected),
			Passed:   sum > expected-assertion.Tolerance,
			Expected: fmt.Sprintf("> %v (sum of %d items)", expected, len(values)),
			Actual:   sum,
		}

	case "sumLessThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		sum := sumFloats(values)
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("sum(%s) < %v", assertion.Path, expected),
			Passed:   sum < expected,
			Expected: fmt.Sprintf("< %v (sum of %d items)", expected, len(values)),
			Actual:   sum,
		}

	case "avgGreaterThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		avg := 0.0
		if len(values) > 0 {
			avg = sumFloats(values) / float64(len(values))
		}
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("avg(%s) > %v", assertion.Path, expected),
			Passed:   avg > expected-assertion.Tolerance,
			Expected: fmt.Sprintf("> %v (avg of %d items)", expected, len(values)),
			Actual:   avg,
		}

	case "avgLessThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		avg := 0.0
		if len(values) > 0 {
			avg = sumFloats(values) / float64(len(values))
		}
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("avg(%s) < %v", assertion.Path, expected),
			Passed:   avg < expected,
			Expected: fmt.Sprintf("< %v (avg of %d items)", expected, len(values)),
			Actual:   avg,
		}

	case "countGreaterThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		count := float64(len(values))
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("count(%s) > %v", assertion.Path, expected),
			Passed:   count > expected,
			Expected: fmt.Sprintf("> %v items", expected),
			Actual:   count,
		}

	case "countEquals":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		count := float64(len(values))
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("count(%s) == %v", assertion.Path, expected),
			Passed:   count == expected,
			Expected: fmt.Sprintf("%v items", expected),
			Actual:   count,
		}

	case "minGreaterThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		min := minFloat(values)
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("min(%s) > %v", assertion.Path, expected),
			Passed:   min > expected-assertion.Tolerance,
			Expected: fmt.Sprintf("> %v (min of %d items)", expected, len(values)),
			Actual:   min,
		}

	case "maxLessThan":
		values := util.QueryJSONPathArray(assertion.Path, response.Body)
		max := maxFloat(values)
		resolved := resolveExpected(assertion.Expected, ctx)
		expected := toFloat(resolved)
		return model.AssertionResult{
			Name:     fmt.Sprintf("max(%s) < %v", assertion.Path, expected),
			Passed:   max < expected,
			Expected: fmt.Sprintf("< %v (max of %d items)", expected, len(values)),
			Actual:   max,
		}

	case "contains":
		actual := util.QueryJSONPath(assertion.Path, response.Body)
		expected := resolveExpected(assertion.Expected, ctx)
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		return model.AssertionResult{
			Name:     fmt.Sprintf("contains(%s, %v)", assertion.Path, expected),
			Passed:   strings.Contains(actualStr, expectedStr),
			Expected: expected,
			Actual:   actual,
		}

	case "jsonSchema", "schemaValidate":
		var target interface{}
		if assertion.Path != "" {
			target = util.QueryJSONPath(assertion.Path, response.Body)
		} else {
			target = response.Body
		}
		valid := target != nil
		return model.AssertionResult{
			Name:     "jsonSchema",
			Passed:   valid,
			Expected: "non-nil response",
			Actual:   boolStr(!valid, "null/empty response", "has value"),
		}

	default:
		return model.AssertionResult{
			Name:     fmt.Sprintf("unknown assertion type: %s", assertion.Type),
			Passed:   false,
			Expected: assertion.Expected,
			Actual:   nil,
		}
	}
}

func resolveExpected(expected interface{}, ctx assertionContext) interface{} {
	s, ok := expected.(string)
	if !ok {
		return expected
	}
	if !strings.HasPrefix(s, "{{") || !strings.HasSuffix(s, "}}") {
		return expected
	}
	key := strings.TrimSpace(s[2 : len(s)-2])
	return getNestedValue(ctx, key)
}

func getNestedValue(obj map[string]interface{}, path string) interface{} {
	parts := strings.Split(path, ".")
	var current interface{} = obj
	for _, p := range parts {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}
		current = m[p]
	}
	return current
}

func toFloat(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case string:
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return f
	}
	return 0
}

func isEmptyValue(v interface{}) bool {
	if v == nil {
		return true
	}
	switch val := v.(type) {
	case string:
		return val == ""
	case []interface{}:
		return len(val) == 0
	case map[string]interface{}:
		return len(val) == 0
	}
	return false
}

func boolIf(cond, a, b bool) bool {
	if cond {
		return a
	}
	return b
}

func boolStr(cond bool, t, f string) string {
	if cond {
		return t
	}
	return f
}

func sumFloats(values []interface{}) float64 {
	var sum float64
	for _, v := range values {
		sum += toFloat(v)
	}
	return sum
}

func minFloat(values []interface{}) float64 {
	if len(values) == 0 {
		return 0
	}
	min := toFloat(values[0])
	for _, v := range values[1:] {
		f := toFloat(v)
		if f < min {
			min = f
		}
	}
	return min
}

func maxFloat(values []interface{}) float64 {
	if len(values) == 0 {
		return 0
	}
	max := toFloat(values[0])
	for _, v := range values[1:] {
		f := toFloat(v)
		if f > max {
			max = f
		}
	}
	return max
}
