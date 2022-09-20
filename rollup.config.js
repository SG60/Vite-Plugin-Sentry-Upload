import pkg from './package.json';
import rollupTypescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: 'src/index.ts',
	output: [
		{ format: 'es', file: pkg.module, exports: 'auto', sourcemap: true },
		{ format: 'cjs', file: pkg.main, exports: 'auto', sourcemap: true }
	],
	plugins: [rollupTypescript(), commonjs(), nodeResolve()],
	external: ['@sentry/cli']
};
export default config;
