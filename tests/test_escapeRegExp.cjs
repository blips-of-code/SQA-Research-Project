const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

const sourceFile = 'sql-formatter-org-sql-formatter/src/lexer/regexUtil.ts';
const functionName = 'escapeRegExp';

const escapeRegExp = require(
  '../pilot-source/sql-formatter-org-sql-formatter/src/lexer/regexUtil.cjs'
).escapeRegExp;

const results = [];

function runProperty(name, arbitrary, predicate, inputDescription) {
  const result = fc.check(fc.property(arbitrary, predicate), {
    numRuns: 100,
    seed: 12345
  });

  results.push({
    FilePath: sourceFile,
    TestCaseName: name,
    FunctionName: functionName,
    Status: result.failed ? 'Failed' : 'Passed',
    ExpectedValue: 'Property holds for all generated inputs',
    ProvidedValue: result.failed
      ? JSON.stringify(result.counterexample)
      : '100 generated test cases passed',
    ErrorMessage: result.error || '',
    FailureCategory: result.failed ? 'PropertyViolation' : '',
    InputParamater: inputDescription
  });

  console.log(`${result.failed ? 'FAIL' : 'PASS'}: ${name}`);
  if (result.failed) console.log(result.error);
}

// Property 1: escaped regex matches the input literally
runProperty(
  'Escaped regex matches original string',
  fc.string(),
  (input) => new RegExp(`^(?:${escapeRegExp(input)})$`, 'u').test(input),
  'Random Unicode string'
);

// Property 2: ordinary ASCII letters and digits remain unchanged
runProperty(
  'Alphanumeric input remains unchanged',
  fc.stringMatching(/^[a-zA-Z0-9]*$/),
  (input) => escapeRegExp(input) === input,
  'ASCII alphanumeric string'
);

const columns = [
  'FilePath', 'TestCaseName', 'FunctionName', 'Status',
  'ExpectedValue', 'ProvidedValue', 'ErrorMessage',
  'FailureCategory', 'InputParamater'
];

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const output = path.join(__dirname, '..', 'fast-check-pilot-results.csv');

fs.writeFileSync(
  output,
  [
    columns.join(','),
    ...results.map(row => columns.map(key => csvCell(row[key])).join(','))
  ].join('\n') + '\n'
);

console.log(`Results saved to: ${output}`);

if (results.some(result => result.Status === 'Failed')) {
  process.exitCode = 1;
}
