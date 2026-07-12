# Web (Next.js). Talks to the API over HTTP; set API_INTERNAL_URL for the
# server-side /api proxy (default http://localhost:3001).
.PHONY: dev build start lint clean install docker

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

start:
	pnpm start

lint:
	pnpm lint

clean:
	rm -rf .next

docker:
	docker build -f Dockerfile -t meergate-web ..
