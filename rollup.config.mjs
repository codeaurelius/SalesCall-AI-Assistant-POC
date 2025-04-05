import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/background/background.ts',
  output: {
    file: 'background.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript({
      tsconfig: 'tsconfig.json',
      compilerOptions: {
        module: 'ESNext',
        target: 'ES2020',
        sourceMap: true
      }
    }),
    nodeResolve()
  ],
  onwarn(warning, warn) {
    // Skip circular dependency warnings as we're aware of them
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  }
}; 