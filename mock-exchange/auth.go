package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// This file implements a minimal HS256 JWT by hand (no external library) — the
// whole point of this mock server is zero dependencies beyond the Go stdlib.

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type jwtClaims struct {
	Sub  string `json:"sub"`  // subject (username)
	Name string `json:"name"` // display name
	Iat  int64  `json:"iat"`  // issued at (unix)
	Exp  int64  `json:"exp"`  // expiry (unix)
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func sign(signingInput string, secret []byte) string {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(signingInput))
	return b64(m.Sum(nil))
}

// issueToken builds a signed HS256 token valid for ttl.
func issueToken(secret []byte, username, name string, ttl time.Duration) (string, error) {
	now := time.Now()
	h, _ := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	c, _ := json.Marshal(jwtClaims{
		Sub:  username,
		Name: name,
		Iat:  now.Unix(),
		Exp:  now.Add(ttl).Unix(),
	})
	signingInput := b64(h) + "." + b64(c)
	return signingInput + "." + sign(signingInput, secret), nil
}

// parseToken verifies the signature and expiry, returning the claims.
func parseToken(token string, secret []byte) (*jwtClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("malformed token")
	}
	signingInput := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(sign(signingInput, secret))) {
		return nil, fmt.Errorf("invalid signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("bad payload encoding")
	}
	var c jwtClaims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, fmt.Errorf("bad payload json")
	}
	if time.Now().Unix() >= c.Exp {
		return nil, fmt.Errorf("token expired")
	}
	return &c, nil
}

// auth wraps a handler, rejecting requests without a valid Bearer token.
func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if !strings.HasPrefix(authz, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "missing bearer token — call POST /api/auth/login first")
			return
		}
		token := strings.TrimPrefix(authz, "Bearer ")
		if _, err := parseToken(token, s.jwtSecret); err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token: "+err.Error())
			return
		}
		next(w, r)
	}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"` // seconds
}

// handleLogin validates the demo credentials and returns a JWT.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if req.Username != s.user || req.Password != s.pass {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	const ttl = 24 * time.Hour
	token, err := issueToken(s.jwtSecret, req.Username, "Demo Trader", ttl)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	writeJSON(w, http.StatusOK, loginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int(ttl.Seconds()),
	})
}
