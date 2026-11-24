
'use strict';
// Exploratory fast-check runner. An observed output is NOT proof of correctness.
const fs = require('fs');
const ts = require('typescript');
const fc = require('fast-check');
const vm = require('vm');
const {createRequire} = require('module');
const path = require('path');
const [mode, inputPath, outputPath] = process.argv.slice(2);

function discover(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const functions = [];

  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name && n.body)
      functions.push({name:n.name.text, node:n, kind:'function', statement:n});

    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)))
        functions.push({name:d.name.text, node:d.initializer, kind:'variable', statement:n});
    }

    if (ts.isMethodDeclaration(n) && n.body)
      functions.push({name:n.name?.getText(sf) || '(anonymous)', node:n, kind:'method', statement:n});

    ts.forEachChild(n, visit);
  }

  visit(sf);

  function typeOf(p) {
    if (!p.type) return 'unknown';
    const k = p.type.kind;
    if (k === ts.SyntaxKind.StringKeyword) return 'string';
    if (k === ts.SyntaxKind.NumberKeyword) return 'number';
    if (k === ts.SyntaxKind.BooleanKeyword) return 'boolean';

    if (ts.isArrayTypeNode(p.type)) {
      const e = p.type.elementType.kind;
      if (e === ts.SyntaxKind.StringKeyword) return 'string[]';
      if (e === ts.SyntaxKind.NumberKeyword) return 'number[]';
      if (e === ts.SyntaxKind.BooleanKeyword) return 'boolean[]';
    }
    return 'unknown';
  }

  const candidates = functions.map((f, index) => {
    const p = f.node.parameters;
    const types = p.map(typeOf);
    let reason = '';

    if (f.kind === 'method') reason = 'MethodNeedsInstance';
    else if (f.node.asteriskToken) reason = 'GeneratorNeedsCustomHarness';
    else if (p.length > 5) reason = 'MoreThanFiveParameters';
    else if (p.some(x => x.dotDotDotToken || !ts.isIdentifier(x.name) || x.initializer))
      reason = 'ComplexParameters';
    else if (types.includes('unknown'))
      reason = 'UnsupportedOrUnannotatedParameterType';

    return {
      id:index,
      name:f.name,
      kind:f.kind,
      types,
      params:p.map(x => x.name.getText(sf)),
      reason,
      snippet:source.slice(f.statement.getStart(sf), f.statement.end)
    };
  });

  return {
    functionCount:functions.length,
    parseErrors:sf.parseDiagnostics.length,
    candidates:candidates.map(({snippet, ...meta}) => meta)
  };
}

function arbitrary(t) {
  switch(t) {
    case 'string': return fc.string({maxLength:30});
    case 'number': return fc.integer({min:-100,max:100});
    case 'boolean': return fc.boolean();
    case 'string[]': return fc.array(fc.string({maxLength:15}), {maxLength:8});
    case 'number[]': return fc.array(fc.integer({min:-100,max:100}), {maxLength:8});
    case 'boolean[]': return fc.array(fc.boolean(), {maxLength:8});
    default: throw Error('Unsupported parameter type: ' + t);
  }
}

function display(v) {
  try {
    const s = JSON.stringify(v);
    return (s === undefined ? String(v) : s).slice(0,1000);
  } catch (_) {
    return String(v).slice(0,1000);
  }
}

function errorText(e) {
  return String(e?.message || e).split('\n')[0].slice(0,1000);
}

// Resolve only imports that are actually referenced by an extracted function.
// A missing lexical variable is not automatically an external dependency.
function importBindings(sf) {
  const bindings = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) bindings.set(clause.name.text, {spec, exportName:'default'});
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) bindings.set(named.name.text, {spec, exportName:'*'});
    if (named && ts.isNamedImports(named)) for (const e of named.elements) {
      if (!e.isTypeOnly) bindings.set(e.name.text, {spec, exportName:(e.propertyName || e.name).text});
    }
  }
  return bindings;
}

function makeRequire(repoDir) {
  // A repository's own installed dependencies take precedence over harness dependencies.
  const base = repoDir ? path.resolve(repoDir, 'package.json') : path.resolve(process.cwd(), 'package.json');
  return createRequire(base);
}

function missingName(message) {
  const m = /^([A-Za-z_$][\w$]*) is not defined$/.exec(message);
  return m ? m[1] : null;
}

function dependencyValue(req, binding) {
  const loaded = req(binding.spec); // Actual import, not require.resolve().
  if (binding.exportName === '*') return loaded;
  if (binding.exportName === 'default') return loaded && Object.hasOwn(loaded,'default') ? loaded.default : loaded;
  if (!(binding.exportName in Object(loaded))) throw Error('MissingExport:' + binding.exportName);
  return loaded[binding.exportName];
}


// Only recover top-level helpers that can be initialized without invoking
// arbitrary module code. Never evaluate side-effectful initializers.
function safeInitializer(n) {
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n))
    return safeInitializer(n.expression);
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n) ||
      n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword ||
      n.kind === ts.SyntaxKind.NullKeyword || ts.isNoSubstitutionTemplateLiteral(n)) return true;
  if (ts.isPrefixUnaryExpression(n)) return [ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator) && safeInitializer(n.operand);
  if (ts.isArrayLiteralExpression(n)) return n.elements.every(e => !ts.isSpreadElement(e) && safeInitializer(e));
  if (ts.isObjectLiteralExpression(n)) return n.properties.every(p => ts.isPropertyAssignment(p) &&
    (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) && safeInitializer(p.initializer));
  return false;
}
function localDeclarations(sf, source) {
  const found = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      found.set(stmt.name.text, source.slice(stmt.getStart(sf),stmt.end));
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        if (safeInitializer(d.initializer) || ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) {
          found.set(d.name.text, 'const ' + d.name.text + ' = ' + d.initializer.getText(sf) + ';');
        }
      }
    }
  }
  return found;
}

async function test(job) {
  const {source, file, meta} = job;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let match = null, i = 0;

  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      if (i++ === meta.id) match = {statement:n};
    }

    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
        if (i++ === meta.id) match = {statement:n};
      }
    }

    if (ts.isMethodDeclaration(n) && n.body) i++;
    ts.forEachChild(n, visit);
  }

  visit(sf);

  if (!match)
    return {classification:'Blocked', reason:'FunctionNotFound', observations:[]};

  const snippet = source.slice(match.statement.getStart(sf), match.statement.end);

  const js = ts.transpileModule(snippet, {
    fileName:file,
    compilerOptions:{
      target:ts.ScriptTarget.ES2020,
      module:ts.ModuleKind.CommonJS
    }
  }).outputText;

  const observations = [];
  const bindings = importBindings(sf);
  const locals = localDeclarations(sf, source);
  const req = makeRequire(job.repoDir);
  const dependencyAttempts = [];

  const inputs = Array.isArray(job.inputs) ? job.inputs
    : meta.types.length
    ? fc.sample(fc.tuple(...meta.types.map(arbitrary)),
        {numRuns:job.runs || 10, seed:job.seed || 12345})
    : [[]];

  for (let run = 0; run < inputs.length; run++) {
    const args = inputs[run];

    const ctx = vm.createContext({
      exports:{},
      console:{log() {},warn() {},error() {}},
      Math, Set, Array, Object, String, Number, Boolean, JSON, RegExp, Map, Date,
      parseInt, parseFloat, isNaN, Promise,
      encodeURIComponent, decodeURIComponent
    });

    let outcome = 'Returned', value = '', error = '';
    let thrown = null;

    try {
      new vm.Script(js + '\n;globalThis.__target=' + meta.name + ';', {filename:file})
        .runInContext(ctx, {timeout:500});

      if (typeof ctx.__target !== 'function')
        throw Error('NotCallable');

      ctx.__args = args;

      const result = new vm.Script('globalThis.__target(...globalThis.__args)', {filename:file})
        .runInContext(ctx, {timeout:500});

      // Async functions may not settle without the surrounding extension environment.
      if (result && typeof result.then === 'function') {
        value = display(await Promise.race([
          result,
          new Promise((_, reject) =>
            setTimeout(() => reject(Error('AsyncTimeout')), 500))
        ]));
      } else {
        value = display(result);
      }
    } catch(e) {
      outcome = 'Exception';
      error = errorText(e);
      thrown = e;
    }

    // Recover a missing same-file helper or safe constant, one name at a time.
    // All executions remain inside the existing VM timeout.
    const recovered = new Set();
    for (let step = 0; outcome === 'Exception' && step < 12; step++) {
      const name = missingName(error);
      if (!name || !locals.has(name) || recovered.has(name) || name === meta.name) break;
      recovered.add(name);
      try {
        const helperJS = ts.transpileModule(locals.get(name), {
          fileName:file, compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}
        }).outputText;
        new vm.Script(helperJS + '\n;globalThis[' + JSON.stringify(name) + '] = ' + name + ';', {filename:file})
          .runInContext(ctx, {timeout:500});
        const rerun = new vm.Script('globalThis.__target(...globalThis.__args)', {filename:file})
          .runInContext(ctx, {timeout:500});
        value = display(rerun && typeof rerun.then === 'function'
          ? await Promise.race([rerun,new Promise((_,reject) =>
              setTimeout(() => reject(Error('AsyncTimeout')),500))]) : rerun);
        outcome = 'Returned'; error = '';
      } catch (e) { error = errorText(e); }
    }

    if (outcome === 'Exception') {
      const name = missingName(error);
      const binding = name && bindings.get(name);
      if (binding) {
        let resolved = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const imported = dependencyValue(req, binding);
            ctx[name] = imported;
            const rerun = new vm.Script('globalThis.__target(...globalThis.__args)', {filename:file})
              .runInContext(ctx, {timeout:500});
            value = display(rerun && typeof rerun.then === 'function'
              ? await Promise.race([rerun,new Promise((_,reject) =>
                  setTimeout(() => reject(Error('AsyncTimeout')),500))]) : rerun);
            dependencyAttempts.push({run:run+1, spec:binding.spec, binding:name,
              attempt, result:'ImportedAndUsed'});
            outcome = 'Returned'; error = ''; resolved = true;
            break;
          } catch (e) {
            dependencyAttempts.push({run:run+1, spec:binding.spec, binding:name,
              attempt, result:errorText(e)});
          }
        }
        if (!resolved) {
          outcome = 'DependencyBlocked';
          error = 'Dependency import/use failed after 3 attempts: ' + binding.spec;
        }
      }
    }
    observations.push({run:run+1, args, outcome, value, error});
  }

  return {classification:'Executed', observations, dependencyAttempts};
}

(async () => {
  try {
    const job = JSON.parse(fs.readFileSync(inputPath,'utf8'));
    const result = mode === 'scan'
      ? discover(job.source,job.file)
      : await test(job);

    fs.writeFileSync(outputPath, JSON.stringify(result));
  } catch(e) {
    console.error(e?.stack || String(e));
    process.exitCode = 1;
  }
})();
