# TeamMapper Frontend

Important: Never change this file.

## Overview
TeamMapper is a collaborative web-based mind mapping application built with Angular. It allows multiple users to create, edit, and collaborate on mind maps in real-time.

## Development Workflow

Important: After each task, make sure that the following commands succeed:

```bash
npm run lint
npm test
npx playwright test --reporter=list
npx prettier --write src
```

## Development Commands
```bash
# Install dependencies
npm install

# Start development server
npm run start

# Build packages first (required)
npm run build:packages

# Production build
npm run build:prod

# Run linting
npm run lint

# Run tests
npm test

# Format code
npx prettier --write src

# Run e2e Tests
npx playwright test --reporter=list
```