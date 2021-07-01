import { PluginContext, RollupLogProps } from 'rollup';
import type { Diagnostic, DiagnosticReporter } from 'typescript';

import { DiagnosticsHost } from './host';
import diagnosticToWarning from './toWarning';

// `Cannot compile modules into 'es6' when targeting 'ES5' or lower.`
const CANNOT_COMPILE_ESM = 1204;

/**
 * Emit a Rollup warning or error for a Typescript type error.
 */
export function emitDiagnostic(
    ts: typeof import('typescript'),
    context: PluginContext,
    host: DiagnosticsHost,
    diagnostic: Diagnostic,
    logError: { error: (arg0: RollupLogProps) => void }
) {
    if (diagnostic.code === CANNOT_COMPILE_ESM) return;

    const { noEmitOnError } = host.getCompilationSettings();

    // Build a Rollup warning object from the diagnostics object.
    const warning = diagnosticToWarning(ts, host, diagnostic);

    // Errors are fatal. Otherwise emit warnings.
    if (noEmitOnError && diagnostic.category === ts.DiagnosticCategory.Error) {
        logError.error(warning);
    } else {
        context.warn(warning);
    }
}

export function buildDiagnosticReporter(
    ts: typeof import('typescript'),
    context: PluginContext,
    host: DiagnosticsHost,
    logError?: any
): DiagnosticReporter {
    return function reportDiagnostics(diagnostic) {
        emitDiagnostic(ts, context, host, diagnostic, logError);
    };
}

/**
 * For each type error reported by Typescript, emit a Rollup warning or error.
 */
export function emitDiagnostics(
    ts: typeof import('typescript'),
    context: PluginContext,
    host: DiagnosticsHost,
    diagnostics: readonly Diagnostic[] | undefined
) {
    if (!diagnostics) return;
    diagnostics.forEach(buildDiagnosticReporter(ts, context, host));
}
