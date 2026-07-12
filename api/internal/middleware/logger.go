package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

func Logger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(wrapped, r)

			// Only surface problems by default — successful requests log at DEBUG
			// (suppressed at the INFO level) to avoid flooding the console. Client
			// errors log at WARN, server errors at ERROR.
			level := slog.LevelDebug
			switch {
			case wrapped.status >= 500:
				level = slog.LevelError
			case wrapped.status >= 400:
				level = slog.LevelWarn
			}

			logger.LogAttrs(r.Context(), level, "request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", wrapped.status),
				slog.Int64("duration_ms", time.Since(start).Milliseconds()),
				slog.String("remote", r.RemoteAddr),
			)
		})
	}
}
