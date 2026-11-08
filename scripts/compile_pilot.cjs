const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const input = 'pilot-source/sql-formatter-org-sql-formatter/src/lexer/regexUtil.ts';
const output = 'pilot-source/sql-formatter-org-sql-formatter/src/lexer/regexUtil.cjs';

const source = fs.readFileSync(input, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  },
  fileName: input,
  reportDiagnostics: true
});

const errors = (compiled.diagnostics || []).filter(
  d => d.category === ts.DiagnosticCategory.Error
);

if (errors.length) {
  console.error(ts.formatDiagnostics(errors, {
    getCanonicalFileName: f => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n'
  }));
  process.exit(1);
}

fs.writeFileSync(output, compiled.outputText);

const { escapeRegExp } = require(path.resolve(output));

console.log('Original function loaded:', typeof escapeRegExp);
console.log('Example:', escapeRegExp('a.b'));
