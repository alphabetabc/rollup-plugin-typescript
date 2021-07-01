// @ts-nocheck
import typescript from './src-js/index';
import pkg from './package.json';

const external = Object.keys(pkg.dependencies).concat(['path', 'fs', 'typescript']);

export default {
    input: './test-plugin/index.ts',
    output: { format: 'esm', file: './dist/index.es.js' },
    plugins: [
        typescript({
            tsconfig: './tsconfig.dev.json',
        }),
    ],
    external,
};
