package util

import (
	"encoding/json"
	"net/http"
)

type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
}

type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
}

func JSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func Success(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusOK, SuccessResponse{Success: true, Data: data})
}

func Created(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusCreated, SuccessResponse{Success: true, Data: data})
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, ErrorResponse{Success: false, Error: msg})
}

func NotFound(w http.ResponseWriter, msg string) {
	Error(w, http.StatusNotFound, msg)
}

func BadRequest(w http.ResponseWriter, msg string) {
	Error(w, http.StatusBadRequest, msg)
}

func Unauthorized(w http.ResponseWriter, msg string) {
	if msg == "" {
		msg = "Unauthorized"
	}
	Error(w, http.StatusUnauthorized, msg)
}

func InternalError(w http.ResponseWriter, msg string) {
	Error(w, http.StatusInternalServerError, msg)
}
