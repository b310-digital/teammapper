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

// Type-safe expect interface for the matchers we're using
interface ExpectWithMatchers {
  objectContaining(sample: Record<string, unknown>): unknown;
  stringContaining(str: string): unknown;
  anything(): unknown;
}

// Jasmine compatibility layer for Jest
const createJestSpyWithJasmineAPI = (name?: string): jasmine.Spy => {
  const mockFn = jest.fn() as unknown as jasmine.Spy;

  // Add Jasmine-style 'and' property with proper return types
  (mockFn as any).and = {
    returnValue: (val: unknown) => {
      (mockFn as unknown as jest.Mock).mockReturnValue(val);
      return mockFn;
    },
    callThrough: () => {
      (mockFn as unknown as jest.Mock).mockImplementation(
        (...args: unknown[]) => args
      );
      return mockFn;
    },
    callFake: (fn: (...args: any[]) => any) => {
      (mockFn as unknown as jest.Mock).mockImplementation(fn);
      return mockFn;
    },
    resolveTo: (val: unknown) => {
      (mockFn as unknown as jest.Mock).mockResolvedValue(val);
      return mockFn;
    },
    stub: () => mockFn,
  };

  // Add Jasmine-style 'calls' property
  (mockFn as any).calls = {
    all: () => {
      const jestMock = mockFn as unknown as jest.Mock;
      return jestMock.mock.calls.map((args: unknown[], idx: number) => ({
        args,
        returnValue: jestMock.mock.results[idx]?.value,
      }));
    },
    count: () => {
      const jestMock = mockFn as unknown as jest.Mock;
      return jestMock.mock.calls.length;
    },
    mostRecent: () => {
      const jestMock = mockFn as unknown as jest.Mock;
      const calls = jestMock.mock.calls;
      const results = jestMock.mock.results;
      if (calls.length === 0) return undefined;
      const lastIdx = calls.length - 1;
      return {
        args: calls[lastIdx],
        returnValue: results[lastIdx]?.value,
      };
    },
    reset: () => {
      const jestMock = mockFn as unknown as jest.Mock;
      jestMock.mockReset();
    },
  };

  return mockFn;
};

// Create the jasmine global implementation
const jasmineImpl = {
  createSpyObj: (
    baseName: string,
    methodNames: string[]
  ): jasmine.SpyObj<Record<string, jasmine.Spy>> => {
    const obj: Record<string, jasmine.Spy> = {};
    methodNames.forEach(method => {
      obj[method] = createJestSpyWithJasmineAPI(method);
    });
    return obj;
  },
  createSpy: (name?: string): jasmine.Spy => createJestSpyWithJasmineAPI(name),
  objectContaining: (sample: Record<string, unknown>): unknown => {
    const expectExtended = expect as unknown as ExpectWithMatchers;
    return expectExtended.objectContaining(sample);
  },
  stringContaining: (str: string): unknown => {
    const expectExtended = expect as unknown as ExpectWithMatchers;
    return expectExtended.stringContaining(str);
  },
  anything: (): unknown => {
    const expectExtended = expect as unknown as ExpectWithMatchers;
    return expectExtended.anything();
  },
  clock: (() => ({
    install: () => {
      jest.useFakeTimers();
    },
    uninstall: () => {
      jest.useRealTimers();
    },
    tick: (millis: number) => {
      jest.advanceTimersByTime(millis);
    },
    mockDate: (date?: Date) => {
      if (date) {
        jest.setSystemTime(date);
      }
    },
  })) as unknown as typeof jasmine.clock,
};

// Assign implementation to jasmine global - @types/jasmine provides the type definitions
(globalThis as any).jasmine = jasmineImpl;
