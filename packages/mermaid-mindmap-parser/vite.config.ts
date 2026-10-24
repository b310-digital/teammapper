import jison from './.vite/jisonPlugin.js';
import { resolve } from 'path';

export default {
  plugins: [jison()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
    },
  },
};
