.PHONY: help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

.PHONY: setup
setup: ## Install python deps locally
	pip install -r requirements/base.txt

.PHONY: run
run: ## Run MVP with docker-compose
	docker-compose up --build

.PHONY: stop
stop: ## Stop services
	docker-compose down
