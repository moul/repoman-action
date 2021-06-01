all: deps
	npm run all
.PHONY: all

package: fmt lint
	npm run build
	npm run package
.PHONY: package

test: lint
	npm run build
	npm test
.PHONY: test

fmt:
	npm run format
.PHONY: fmt

lint:
	npm run lint
.PHONY: lint

deps:
	npm install
.PHONY: deps
