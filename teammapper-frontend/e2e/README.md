# E2E Tests

This directory contains end-to-end tests for the TeamMapper application using Playwright.

## Known Issues

### Duplicate Elements in Tests

When running tests sequentially, the Angular application can sometimes be loaded multiple times in the same browser context, causing duplicate elements to appear. This might happen because:

1. The development server is shared between tests
2. The Angular app may not be properly cleaned up between test runs
3. Browser caching or service workers might interfere

### Current Workarounds

1. Tests are configured to run with a single worker (`workers: 1`)
2. Tests use `.first()` selector when duplicate elements are detected
3. Tests include helper functions to verify single app instance

### Recommended Solutions

1. Using isolated test contexts with separate ports for each test
2. Implementing proper cleanup between tests
3. Using Angular's test utilities for better control over app lifecycle
4. Running tests against a production build instead of dev server

## Running Tests

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test e2e/app.spec.ts

# Run with UI mode for debugging
npx playwright test --ui

# Run with headed browser
npx playwright test --headed
```