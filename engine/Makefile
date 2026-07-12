# meergine — standalone test engine (library, not a runnable service).
.PHONY: build test lint tidy vet

build:
	go build ./...

test:
	go test ./...

vet:
	go vet ./...

lint:
	golangci-lint run ./...

tidy:
	go mod tidy
