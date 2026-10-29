import 'fake-indexeddb/auto';
import { deserialize, serialize } from 'node:v8';

// fake-indexeddb copies each stored value with structuredClone, which the
// jsdom environment lacks. Node's serializer copies the values the specs
// store: plain objects, strings, numbers, the ArrayBuffer of an image and the
// Uint8Array updates of y-indexeddb.
globalThis.structuredClone ??= <T>(value: T): T =>
  deserialize(serialize(value));

// jsdom's Blob lacks arrayBuffer(), which LocalMapStore reads an image with.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          reader.result instanceof ArrayBuffer
            ? resolve(reader.result)
            : reject(new Error('FileReader returned no ArrayBuffer'));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
