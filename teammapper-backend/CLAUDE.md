# TeamMapper Backend

Important: Never change this file.

## Overview

TeamMapper is a collaborative web-based mind mapping application built with Angular. It allows multiple users to create, edit, and collaborate on mind maps in real-time.

## Development best pracices

- **Reusing existing code**: Please check before adding new types and functions if code is already available that solves the same purpose and that can be reused
- **Be specific with types**: Request explicit interfaces, enums, and type annotations rather than `any`
- **Include error handling**: Ask for proper try/catch blocks and error types
- **Request documentation**: Ask for comments on functions and complex types, but no need for full JSDoc

## Development Workflow

Important: After each task, make sure that the following commands succeed:

```bash
npm run lint
npm run test
npm run format
```