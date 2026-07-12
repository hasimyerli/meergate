package meergine

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/hasimyerli/meergine/model"
	"github.com/hasimyerli/meergine/util"
)

// Note: browser artifacts (extracted text, screenshots) are appended to
// result.Extracts rather than persisted here — the engine never writes to a
// database; the caller decides what to store.

// getBrowser lazily starts one Chrome/Chromium instance shared by every
// browserAction step in the run, so page/cookie/DOM state carries across steps
// (a "navigate" step and a later "click" step hit the same page). Torn down by
// CloseBrowser at the end of the run.
func (e *Executor) getBrowser() (context.Context, error) {
	if e.browserCtx != nil {
		return e.browserCtx, nil
	}
	// NoSandbox is required to run headless Chromium inside a container as a
	// non-root user. CHROME_PATH pins the binary in images where auto-detect
	// might miss it (set by the Docker image); otherwise chromedp auto-detects.
	opts := append(chromedp.DefaultExecAllocatorOptions[:], chromedp.NoSandbox)
	if p := os.Getenv("CHROME_PATH"); p != "" {
		opts = append(opts, chromedp.ExecPath(p))
	}
	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
	browserCtx, browserCancel := chromedp.NewContext(allocCtx)
	// Start the browser eagerly so a launch failure (e.g. missing binary)
	// surfaces here instead of on the first action.
	if err := chromedp.Run(browserCtx); err != nil {
		browserCancel()
		allocCancel()
		return nil, fmt.Errorf("start browser (is Chromium installed?): %w", err)
	}
	e.allocCancel = allocCancel
	e.browserCancel = browserCancel
	e.browserCtx = browserCtx
	return browserCtx, nil
}

// CloseBrowser shuts down the shared browser. Safe to call when none started.
func (e *Executor) CloseBrowser() {
	if e.browserCancel != nil {
		e.browserCancel()
		e.browserCancel = nil
	}
	if e.allocCancel != nil {
		e.allocCancel()
		e.allocCancel = nil
	}
	e.browserCtx = nil
}

func (e *Executor) executeBrowserAction(_ context.Context, step *model.TestStep, result *model.StepResult, interpCtx *util.InterpolateContext, timeoutMs int) error {
	browserCtx, err := e.getBrowser()
	if err != nil {
		return err
	}
	// Per-action timeout as a child of the shared browser context — bounds this
	// step without killing the browser that later steps reuse.
	actionCtx, cancel := context.WithTimeout(browserCtx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	action := step.Action
	selector := util.Interpolate(step.Selector, interpCtx)
	valueStr, _ := step.Value.(string)
	value := util.Interpolate(valueStr, interpCtx)
	url := util.Interpolate(step.URL, interpCtx)

	switch action {
	case "navigate":
		err = chromedp.Run(actionCtx, chromedp.Navigate(url))
	case "click":
		err = chromedp.Run(actionCtx, chromedp.Click(selector))
	case "fill":
		err = chromedp.Run(actionCtx, chromedp.SendKeys(selector, value))
	case "select":
		err = chromedp.Run(actionCtx, chromedp.SetValue(selector, value))
	case "hover":
		err = chromedp.Run(actionCtx, chromedp.ScrollIntoView(selector))
	case "press":
		err = chromedp.Run(actionCtx, chromedp.KeyEvent(value))
	// waitForSelector / assertVisible / waitFor(legacy) all wait for the element to be visible.
	case "waitFor", "waitForSelector", "assertVisible":
		err = chromedp.Run(actionCtx, chromedp.WaitVisible(selector))
	case "assertText":
		var got string
		err = chromedp.Run(actionCtx, chromedp.Text(selector, &got, chromedp.NodeVisible))
		if err == nil && value != "" && !strings.Contains(got, value) {
			err = fmt.Errorf("assertText: expected %q to contain %q, got %q", selector, value, got)
		}
	case "extractText":
		var got string
		err = chromedp.Run(actionCtx, chromedp.Text(selector, &got, chromedp.NodeVisible))
		if err == nil {
			if interpCtx.Extract == nil {
				interpCtx.Extract = map[string]interface{}{}
			}
			interpCtx.Extract[step.Name] = got
			result.Extracts = append(result.Extracts, model.StepExtract{
				Type: "extract", Key: step.Name, Value: got,
			})
		}
	case "screenshot":
		// Self-contained screenshot: if a URL is given, navigate there first so
		// it works standalone (e.g. in an API-only test with no prior browser step).
		if url != "" {
			if navErr := chromedp.Run(actionCtx, chromedp.Navigate(url)); navErr != nil {
				err = navErr
				break
			}
		}
		var buf []byte
		err = chromedp.Run(actionCtx, chromedp.FullScreenshot(&buf, 90))
		if err == nil {
			key := step.ScreenshotName
			if key == "" {
				key = step.Name
			}
			// Store the full image (base64 PNG) so it is actually viewable —
			// not truncated into a corrupt blob.
			result.Extracts = append(result.Extracts, model.StepExtract{
				Type:  "screenshot",
				Key:   key,
				Value: base64.StdEncoding.EncodeToString(buf),
			})
		}
	default:
		err = fmt.Errorf("unknown browser action: %s", action)
	}

	result.RequestSummary = map[string]interface{}{
		"action":   action,
		"selector": selector,
		"url":      url,
		"value":    value,
	}

	return err
}
