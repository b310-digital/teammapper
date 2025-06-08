import jison from './.vite/jisonPlugin.js';
import { resolve } from 'path'

export default {
  plugins: [
    jison()
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es']
    }
  }
}