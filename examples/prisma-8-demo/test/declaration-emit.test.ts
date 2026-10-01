import { fileURLToPath } from 'node:url';
import { timeouts } from '@repo/test-utils';
import { dirname, resolve } from 'pathe';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libraryFile = resolve(demoRoot, 'test/fixtures/declaration-library.ts');

function emitDeclarations(fileName: string) {
  const config = ts.getParsedCommandLineOfConfigFile(
    resolve(demoRoot, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  if (!config) throw new Error('tsconfig.json could not be read');
  const program = ts.createProgram([fileName], {
    ...config.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
  });
  const declarations: string[] = [];
  const result = program.emit(
    program.getSourceFile(fileName),
    (_name, text) => declarations.push(text),
    undefined,
    true,
  );
  const messages = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].map(
    (diagnostic) =>
      `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
  );
  return { diagnostics: [...new Set(messages)], declarations };
}

describe('declaration emit through the published facade', () => {
  it(
    'emits a library that exports custom collection classes with unannotated methods',
    () => {
      const { diagnostics, declarations } = emitDeclarations(libraryFile);
      expect(diagnostics).toEqual([]);
      expect(declarations).toHaveLength(1);
      expect(declarations[0]).toContain('declare class PostLibrary');
    },
    timeouts.typeScriptCompilation,
  );
});
