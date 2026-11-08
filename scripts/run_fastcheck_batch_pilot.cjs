const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const fc = require('fast-check');

const root = path.resolve('pilot-repositories/sql-formatter-org-sql-formatter');
const output = path.resolve('fast-check-batch-results.csv');
const repoName = 'sql-formatter-org-sql-formatter';

const columns = [
  'FilePath', 'TestCaseName', 'FunctionName', 'Status',
  'ExpectedValue', 'ProvidedValue', 'ErrorMessage',
  'FailureCategory', 'InputParamater'
];

function loadSource(file) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, 'utf8');

  const result = ts.transpileModule(source, {
    fileName: fullPath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });

  const module = { exports: {} };

  // Execute the transpiled module in an isolated CommonJS wrapper.
  // Only use this with the trusted local repository source.
  const vm = require('vm');
  const localRequire = require('module').createRequire(fullPath);

  const wrapper = vm.runInThisContext(
    '(function(exports, require, module, __filename, __dirname) {' +
    result.outputText +
    '\n})',
    { filename: fullPath }
  );

  wrapper(
    module.exports,
    localRequire,
    module,
    fullPath,
    path.dirname(fullPath)
  );

  return module.exports;
}

const tests = [
  {
    file: 'src/lexer/regexUtil.ts',
    functionName: 'escapeRegExp',
    name: 'Escaped regex matches literal input',
    arbitrary: fc.string(),
    property: (fn, value) =>
      new RegExp('^(?:' + fn(value) + ')$', 'u').test(value)
  },
  {
    file: 'src/lexer/lineColFromIndex.ts',
    functionName: 'lineColFromIndex',
    name: 'Line and column match prefix positions',
    arbitrary: fc.tuple(fc.string(), fc.nat()),
    property: (fn, [source, rawIndex]) => {
      const index = rawIndex % (source.length + 1);
      const prefix = source.slice(0, index);
      const lines = prefix.split('\n');
      const expected = {
        line: lines.length,
        col: lines[lines.length - 1].length + 1
      };
      return JSON.stringify(fn(source, index)) === JSON.stringify(expected);
    }
  },
  {
    file: 'src/utils.ts',
    functionName: 'dedupe',
    name: 'Deduplication preserves unique first occurrences',
    arbitrary: fc.array(fc.string()),
    property: (fn, values) => {
      const result = fn(values);
      return (
        result.length === new Set(result).size &&
        JSON.stringify(result) === JSON.stringify([...new Set(values)])
      );
    }
  },
  {
    file: 'src/expandPhrases.ts',
    functionName: 'expandPhrases',
    name: 'Simple phrases preserve input order',
    arbitrary: fc.array(fc.stringMatching(/^[A-Za-z0-9 ]{1,15}$/), {
      maxLength: 20
    }),
    property: (fn, phrases) => {
      const expected = phrases.map(s => s.replace(/ +/g, ' ').trim());
      return JSON.stringify(fn(phrases)) === JSON.stringify(expected);
    }
  }
];

const results = [];
const blocked = [];

for (const test of tests) {
  const filePath = `${repoName}/${test.file}`;

  try {
    const exports = loadSource(test.file);
    const fn = exports[test.functionName];

    if (typeof fn !== 'function') {
      throw new Error(`Function not exported: ${test.functionName}`);
    }

    const result = fc.check(
      fc.property(test.arbitrary, input => test.property(fn, input)),
      { numRuns: 100, seed: 12345 }
    );

    results.push({
      FilePath: filePath,
      TestCaseName: test.name,
      FunctionName: test.functionName,
      Status: result.failed ? 'Failed' : 'Passed',
      ExpectedValue: 'Property holds for generated inputs',
      ProvidedValue: result.failed
        ? JSON.stringify(result.counterexample)
        : `${result.numRuns} generated cases passed`,
      ErrorMessage: result.error || '',
      FailureCategory: result.failed ? 'PropertyViolation' : '',
      InputParamater: 'fast-check generated input'
    });

    console.log(`${result.failed ? 'FAIL' : 'PASS'} ${test.file} :: ${test.functionName}`);
  } catch (error) {
    blocked.push({
      FilePath: filePath,
      TestCaseName: test.name,
      FunctionName: test.functionName,
      Status: 'Blocked',
      ExpectedValue: 'Function executes and satisfies property',
      ProvidedValue: '',
      ErrorMessage: error.message,
      FailureCategory: 'ExecutionSetupError',
      InputParamater: 'fast-check generated input'
    });

    console.log(`BLOCKED ${test.file}: ${error.message}`);
  }
}

function csvCell(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

fs.writeFileSync(
  output,
  [
    columns.join(','),
    ...results.map(row => columns.map(c => csvCell(row[c])).join(','))
  ].join('\n') + '\n'
);
const blockedOutput = path.resolve('fast-check-blocked.csv');

fs.writeFileSync(
  blockedOutput,
  [
    columns.join(','),
    ...blocked.map(row =>
      columns.map(c => csvCell(row[c])).join(',')
    )
  ].join('\n') + '\n'
);
console.log('\nSummary:');
console.log('Passed:', results.filter(r => r.Status === 'Passed').length);
console.log('Failed:', results.filter(r => r.Status === 'Failed').length);
console.log('Blocked:', blocked.length);
console.log('Saved:', output);
