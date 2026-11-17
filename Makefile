# CKAD Simulator — everyday commands. Run `make` or `make help` for the list.

ARCH := $(shell uname -m)
ifeq ($(ARCH),arm64)
  TARGETARCH=arm64
else
  TARGETARCH=amd64
endif

.DEFAULT_GOAL := help
.PHONY: help install up down logs cluster reset-q build dev test lint validate

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ── Run ──────────────────────────────────────────────────────────────────
install: ## One-shot setup: Docker check, build, kind cluster, open browser
	./install.sh

up: ## Build and start the stack in the background
	TARGETARCH=$(TARGETARCH) docker compose up --build -d

down: ## Stop the stack (the kind cluster keeps its state)
	docker compose down

logs: ## Follow the backend logs
	docker compose logs -f backend

cluster: ## kubectl get nodes, from inside the backend
	docker compose exec backend kubectl get nodes

reset-q: ## Reset a mock exam question, e.g. make reset-q Q=3
	docker compose exec backend bash /app/scripts/reset-question.sh $(Q)

build: ## Build the Docker images without starting them
	TARGETARCH=$(TARGETARCH) docker compose build

## ── Develop ──────────────────────────────────────────────────────────────
dev: ## Build TypeScript and run the server with --watch
	npm run dev

test: ## Run the unit tests
	npm test

lint: ## Build the client bundle and run ESLint
	npm run lint

validate: ## Validate exam content and scenarios (run before every PR)
	npm run validate:exams && npm run validate:scenarios
