import * as path from 'path';

import { Plugin, RollupOptions, SourceDescription } from 'rollup';
import type { Watch } from 'typescript';

import { RollupTypescriptOptions } from '../types';

import createFormattingHost from './diagnostics/host';
import createModuleResolver from './moduleResolution';
import { getPluginOptions } from './options/plugin';
import { emitParsedOptionsErrors, parseTypescriptConfig } from './options/tsconfig';
import { validatePaths, validateSourceMap } from './options/validate';
import findTypescriptOutput, { getEmittedFile } from './outputFile';
import { preflight } from './preflight';
import createWatchProgram, { WatchProgramHelper } from './watchProgram';
import TSCache from './tscache';
import CustomLogError from './diagnostics/custom-log-error';

export default function typescript(options: RollupTypescriptOptions = {}): Plugin {
    const { cacheDir, compilerOptions, filter, transformers, tsconfig, tslib, typescript: ts } = getPluginOptions(options);
    const tsCache = new TSCache(cacheDir);
    const emittedFiles = new Map<string, string>();
    const watchProgramHelper = new WatchProgramHelper();

    const parsedOptions = parseTypescriptConfig(ts, tsconfig, compilerOptions);
    parsedOptions.fileNames = parsedOptions.fileNames.filter(filter);

    const formatHost = createFormattingHost(ts, parsedOptions.options);
    const resolveModule = createModuleResolver(ts, formatHost);

    let program: Watch<unknown> | null = null;

    function normalizePath(fileName: string) {
        return fileName.split(path.win32.sep).join(path.posix.sep);
    }

    let logError: any | null = null;

    return {
        name: 'typescript',

        buildStart(rollupOptions: RollupOptions) {
            emitParsedOptionsErrors(ts, this, parsedOptions);

            preflight({ config: parsedOptions, context: this, rollupOptions, tslib });

            // Fixes a memory leak https://github.com/rollup/plugins/issues/322
            if (this.meta.watchMode !== true) {
                // eslint-disable-next-line
                program?.close();
            }
            if (!program) {
                logError = new CustomLogError(this);
                // @ts-ignore
                logError.enableRollupError(process?.env?.ROLLUP_WATCH === true);
                program = createWatchProgram(
                    ts,
                    this,
                    {
                        formatHost,
                        resolveModule,
                        parsedOptions,
                        writeFile(fileName, data) {
                            if (parsedOptions.options.composite || parsedOptions.options.incremental) {
                                tsCache.cacheCode(fileName, data);
                            }
                            emittedFiles.set(fileName, data);
                        },
                        status(diagnostic) {
                            watchProgramHelper.handleStatus(diagnostic);
                        },
                        transformers,
                    },
                    logError
                );
            }
        },

        watchChange(id) {
            if (!filter(id)) return;
            watchProgramHelper.watch();
        },

        buildEnd() {
            if (this.meta.watchMode !== true) {
                // ESLint doesn't understand optional chaining
                // eslint-disable-next-line
                program?.close();
            }
        },

        renderStart(outputOptions: any) {
            // eslint-disable-next-line
            validateSourceMap(this, parsedOptions.options, outputOptions, parsedOptions.autoSetSourceMap);
            validatePaths(ts, this, parsedOptions.options, outputOptions);
        },

        resolveId(importee, importer) {
            if (importee === 'tslib') {
                return tslib;
            }

            if (!importer) return null;

            // Convert path from windows separators to posix separators
            const containingFile = normalizePath(importer);

            const resolved = resolveModule(importee, containingFile);

            if (resolved) {
                if (resolved.extension === '.d.ts') return null;
                return path.normalize(resolved.resolvedFileName);
            }

            return null;
        },

        async load(id) {
            if (!filter(id)) return null;
            const fileName = normalizePath(id);

            if (logError.hasError(fileName)) {
                logError.clearError(fileName);
                const cache: any = tsCache.getCached(fileName) || {};
                if (!cache.code) cache.code = '';
                if (!cache.map) cache.map = '';
                return cache;
            }

            await watchProgramHelper.wait();

            if (!parsedOptions.fileNames.includes(fileName)) {
                // Discovered new file that was not known when originally parsing the TypeScript config
                parsedOptions.fileNames.push(fileName);
            }

            const output = findTypescriptOutput(ts, parsedOptions, id, emittedFiles, tsCache);

            return output.code != null ? (output as SourceDescription) : null;
        },

        generateBundle(outputOptions) {
            parsedOptions.fileNames.forEach((fileName) => {
                const output = findTypescriptOutput(ts, parsedOptions, fileName, emittedFiles, tsCache);
                output.declarations.forEach((id) => {
                    const code = getEmittedFile(id, emittedFiles, tsCache);
                    let baseDir = outputOptions.dir;
                    if (!baseDir && tsconfig) {
                        baseDir = tsconfig.substring(0, tsconfig.lastIndexOf('/'));
                    }
                    if (!code || !baseDir) return;

                    this.emitFile({
                        type: 'asset',
                        fileName: normalizePath(path.relative(baseDir, id)),
                        source: code,
                    });
                });
            });

            const tsBuildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(parsedOptions.options);
            if (tsBuildInfoPath) {
                const tsBuildInfoSource = emittedFiles.get(tsBuildInfoPath);
                // https://github.com/rollup/plugins/issues/681
                if (tsBuildInfoSource) {
                    this.emitFile({
                        type: 'asset',
                        fileName: normalizePath(path.relative(outputOptions.dir!, tsBuildInfoPath)),
                        source: tsBuildInfoSource,
                    });
                }
            }
        },
    };
}
