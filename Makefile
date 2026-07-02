ARCH := $(shell uname -m)
ifeq ($(ARCH),arm64)
  TARGETARCH=arm64
else
  TARGETARCH=amd64
endif

.PHONY: up down logs cluster reset-q build

up:
	TARGETARCH=$(TARGETARCH) docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f backend

cluster:
	docker compose exec backend kubectl get nodes

reset-q:
	docker compose exec backend bash /app/scripts/reset-question.sh $(Q)

build:
	TARGETARCH=$(TARGETARCH) docker compose build
