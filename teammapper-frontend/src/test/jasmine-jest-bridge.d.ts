/**
 * Type declarations for Jasmine-style matchers provided by Jest
 * This bridges the gap between Jest's Jasmine-compatible API and TypeScript types
 * Extends the existing @types/jasmine with Jest-specific implementations
 */

// Extend the existing jasmine namespace from @types/jasmine
declare namespace jasmine {
  // Override SpyObj to support generics properly
  type SpyObj<T = Record<string, Spy>> = {
    [K in keyof T]: T[K] extends Spy ? T[K] : Spy;
  };

  // Add Jest-style matchers that are used in tests
  function stringContaining(expected: string): any;
}
