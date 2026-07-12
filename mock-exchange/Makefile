PORT ?= 4010

.PHONY: up run build tidy fmt

## up: start the mock exchange (foreground, Ctrl+C to stop)
up:
	PORT=$(PORT) go run .

## run: alias for up
run: up

## build: compile the binary
build:
	go build -o bin/mock-exchange .

## fmt: format the code
fmt:
	gofmt -w .

## tidy: sync go.mod (no external deps expected)
tidy:
	go mod tidy
