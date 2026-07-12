# mock-exchange — dependency-free Go stdlib server. Self-contained.
#   docker build -t mock-exchange ./mock-exchange
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /mockx .

FROM alpine:3.21 AS runtime
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /mockx ./mockx
ENV PORT=4010
EXPOSE 4010
CMD ["./mockx"]
