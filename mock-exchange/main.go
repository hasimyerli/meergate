// Command mock-exchange is a tiny, dependency-free (Go stdlib only) HTTP server
// that simulates a Paribu-style crypto exchange for meerGate demos. State is
// in-memory (no database); restart resets it. Auth is JWT (HS256), hand-rolled.
//
// Endpoints:
//
//	POST /api/auth/login       → issue a JWT (use it as Bearer on the rest)
//	GET  /api/wallet/balances  → current balances
//	POST /api/wallet/deposit   → funds in   ("para geldi")
//	POST /api/wallet/withdraw  → funds out  ("para gitti")
//	POST /api/orders/buy       → buy crypto ("kripto aldım")
//	POST /api/orders/sell      → sell crypto ("kripto sattım")
//	GET  /health               → liveness (no auth)
//	GET  /openapi.json         → OpenAPI 3.0 spec (for meerGate discovery)
//	GET  /docs                 → Swagger UI
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Server holds the in-memory wallet and auth config.
type Server struct {
	wallet    *Wallet
	jwtSecret []byte
	user      string
	pass      string
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	// Port 4010 is chosen to not collide with meerGate (web :3000, api :3001,
	// postgres :5432). Override with PORT if needed.
	port := env("PORT", "4010")

	s := &Server{
		wallet:    newWallet(),
		jwtSecret: []byte(env("JWT_SECRET", "mock-exchange-demo-secret-change-me")),
		user:      env("DEMO_USER", "demo"),
		pass:      env("DEMO_PASS", "demo123"),
	}

	mux := http.NewServeMux()
	// Public.
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /openapi.json", s.handleOpenAPI)
	mux.HandleFunc("GET /docs", s.handleSwaggerUI)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	// Protected — require a valid Bearer token.
	mux.HandleFunc("GET /api/wallet/balances", s.auth(s.handleBalances))
	mux.HandleFunc("POST /api/wallet/deposit", s.auth(s.handleDeposit))
	mux.HandleFunc("POST /api/wallet/withdraw", s.auth(s.handleWithdraw))
	mux.HandleFunc("POST /api/orders/buy", s.auth(s.handleBuy))
	mux.HandleFunc("POST /api/orders/sell", s.auth(s.handleSell))

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("mock-exchange listening on http://localhost:%s (user=%q pass=%q)", port, s.user, s.pass)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// logRequests logs one line per request (method, path, status, duration).
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Printf("%s %s → %d (%s)", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}
