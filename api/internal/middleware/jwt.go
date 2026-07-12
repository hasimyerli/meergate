package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/hasimyerli/meergate/internal/util"
)

type contextKey string

const (
	UserIDKey   contextKey = "user_id"
	UsernameKey contextKey = "username"
)

// excludedPaths are public routes that don't require JWT
var excludedPaths = map[string]bool{
	"/health":         true,
	"/api/auth/login": true,
}

func JWTAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if excludedPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			// WebSocket endpoints: accept token via query param since
			// the browser WebSocket API cannot set custom headers.
			if strings.HasSuffix(r.URL.Path, "/ws") && r.Header.Get("Upgrade") == "websocket" {
				if qToken := r.URL.Query().Get("token"); qToken != "" {
					r.Header.Set("Authorization", "Bearer "+qToken)
				}
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				util.Unauthorized(w, "missing authorization header")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				util.Unauthorized(w, "invalid authorization format")
				return
			}

			token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				util.Unauthorized(w, "invalid or expired token")
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				util.Unauthorized(w, "invalid token claims")
				return
			}

			ctx := r.Context()
			if sub, ok := claims["sub"].(string); ok {
				ctx = context.WithValue(ctx, UserIDKey, sub)
			}
			if username, ok := claims["username"].(string); ok {
				ctx = context.WithValue(ctx, UsernameKey, username)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

func GetUsername(ctx context.Context) string {
	if v, ok := ctx.Value(UsernameKey).(string); ok {
		return v
	}
	return ""
}
