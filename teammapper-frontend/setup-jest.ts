import 'jest-canvas-mock';
import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

// Polyfill TextEncoder/TextDecoder for Node.js test environment (required by jsPDF)
// In Node.js 18+, these are available globally, but jsdom doesn't provide them
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('util') as {
      TextEncoder: typeof TextEncoder;
      TextDecoder: typeof TextDecoder;
    };
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
}

// Initialize the Angular testing environment only once
// This prevents "Cannot set base providers because it has already been called" error
try {
  getTestBed().initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting()
  );
} catch (error) {
  // TestBed already initialized, ignore
}
