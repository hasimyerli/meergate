package handler

import (
	"encoding/json"
	"net/http"

	mw "github.com/hasimyerli/meergate/internal/middleware"
	"github.com/hasimyerli/meergate/internal/util"
)

func LoginHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if body.Username == "" || body.Password == "" {
			util.BadRequest(w, "username and password required")
			return
		}

		token, user, err := deps.AuthService.Login(r.Context(), body.Username, body.Password)
		if err != nil {
			util.Unauthorized(w, err.Error())
			return
		}

		util.Success(w, map[string]interface{}{
			"token": token,
			"user": map[string]interface{}{
				"id":       user.ID,
				"username": user.Username,
			},
		})
	}
}

func MeHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := mw.GetUserID(r.Context())
		if userID == "" {
			util.Unauthorized(w, "not authenticated")
			return
		}

		user, err := deps.AuthService.GetUser(r.Context(), userID)
		if err != nil {
			util.NotFound(w, "user not found")
			return
		}

		util.Success(w, map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
		})
	}
}

func LogoutHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		util.Success(w, map[string]interface{}{"message": "logged out"})
	}
}
