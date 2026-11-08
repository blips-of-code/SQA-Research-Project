'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const fc = require('fast-check');
const vm = require('vm');
const { createRequire } = require('module');

const specs = {
  'src/lexer/regexUtil.ts::escapeRegExp': {
    name: 'Escaped regex matches literal input', parameters: ['string'],
    arb: fc.string(),
    check(fn, input) { const actual = new RegExp('^(?:' + fn(input) + ')$', 'u').test(input); return {expected: true, actual}; }
  },
  'src/lexer/lineColFromIndex.ts::lineColFromIndex': {
    name: 'Line and column match prefix positions', parameters: ['source', 'index'],
    arb: fc.tuple(fc.string(), fc.nat({max: 10000})),
    check(fn, [source, rawIndex]) {
      const index = rawIndex % (source.length + 1);
      const prefix = source.slice(0, index);
      const expected = {line: prefix.split('\n').length, col: prefix.length - prefix.lastIndexOf('\n')};
      return {expected, actual: fn(source, index), input: {source, index}};
    }
  },
  'src/utils.ts::dedupe': {
    name: 'Deduplication preserves unique first occurrences', parameters: ['arr'],
    arb: fc.array(fc.string(), {maxLength: 50}),
    check(fn, input) { return {expected: [...new Set(input)], actual: fn(input)}; }
  },
  'src/expandPhrases.ts::expandPhrases': {
    name: 'Simple phrases preserve input order', parameters: ['phrases'],
    arb: fc.array(fc.stringMatching(/^[A-Za-z0-9 ]{1,15}$/), {maxLength: 20}),
    check(fn, input) { return {expected: input.map(s => s.replace(/ +/g, ' ').trim()), actual: fn(input)}; }
  }
};
function serialize(x) { try { return JSON.stringify(x); } catch { return String(x); } }
function same(a,b) { return serialize(a) === serialize(b); }
function loadSource(file) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {fileName:file, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  const module = {exports:{}};
  const wrapper = vm.runInThisContext('(function(exports,require,module,__filename,__dirname){' + compiled.outputText + '\n})', {filename:file});
  wrapper(module.exports,createRequire(file),module,file,path.dirname(file));
  return module.exports;
}
function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const spec = specs[job.relativePath + '::' + job.functionName];
  if (!spec) throw new Error('No defined property for ' + job.relativePath + '::' + job.functionName);
  const fn = loadSource(job.absolutePath)[job.functionName];
  if (typeof fn !== 'function') throw new Error('Selected export is not callable: ' + job.functionName);
  let checked = 0;
  let sample;
  let mismatch;
  const result = fc.check(fc.property(spec.arb, input => {
    checked++;
    const observation = spec.check(fn,input);
    if (sample === undefined) sample = {input: observation.input ?? input, expected:observation.expected, actual:observation.actual};
    if (!same(observation.expected,observation.actual)) {
      mismatch = {input: observation.input ?? input, expected:observation.expected, actual:observation.actual};
      return false;
    }
    return true;
  }), {numRuns:job.numRuns, seed:job.seed, endOnFailure:true});
  const observation = result.failed ? mismatch : sample;
  const rows = spec.parameters.map((parameter, index) => ({
    FilePath: job.absolutePath,
    TestCaseName: spec.name,
    FunctionName: job.functionName,
    Status: result.failed ? 'Failed' : 'Passed',
    ExpectedValue: serialize(observation?.expected),
    ProvidedValue: serialize(observation?.actual),
    ErrorMessage: result.failed ? String(result.error || 'Property did not hold').split(/\r?\n/)[0] : '',
    FailureCategory: result.failed ? 'PropertyViolation' : '',
    InputParamater: parameter + '=' + serialize(Array.isArray(observation?.input) ? observation.input[index] : (spec.parameters.length === 1 ? observation?.input : observation?.input?.[parameter]))
  }));
  fs.writeFileSync(job.responseFile,JSON.stringify({rows,checks:checked}));
}
try { main(); } catch(e) { console.error(String(e.stack || e)); process.exitCode=1; }
