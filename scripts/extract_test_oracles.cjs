'use strict';
// Static extraction only. NEVER evaluates test files or guesses expected values.
const fs = require('fs');
const ts = require('typescript');
const path = require('path').posix;
const [input, output] = process.argv.slice(2);

function literal(n) {
  if (!n) return {ok:false};
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n))
    return literal(n.expression);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return {ok:true,value:n.text};
  if (ts.isNumericLiteral(n)) return {ok:true,value:Number(n.text.replace(/_/g,''))};
  if (n.kind === ts.SyntaxKind.TrueKeyword) return {ok:true,value:true};
  if (n.kind === ts.SyntaxKind.FalseKeyword) return {ok:true,value:false};
  if (n.kind === ts.SyntaxKind.NullKeyword) return {ok:true,value:null};
  if (ts.isPrefixUnaryExpression(n) && [ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator)) {
    const x=literal(n.operand);
    return x.ok && typeof x.value==='number' ? {ok:true,value:n.operator===ts.SyntaxKind.MinusToken?-x.value:x.value} : {ok:false};
  }
  if (ts.isArrayLiteralExpression(n)) {
    const values=n.elements.map(literal);
    return values.every(v=>v.ok) ? {ok:true,value:values.map(v=>v.value)} : {ok:false};
  }
  if (ts.isObjectLiteralExpression(n)) {
    const result={};
    for (const prop of n.properties) {
      if (!ts.isPropertyAssignment(prop)) return {ok:false};
      let key;
      if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) || ts.isNumericLiteral(prop.name)) key=prop.name.text;
      else return {ok:false};
      if (key==='__proto__' || key==='constructor' || key==='prototype') return {ok:false};
      const v=literal(prop.initializer);
      if (!v.ok) return {ok:false};
      result[key]=v.value;
    }
    return {ok:true,value:result};
  }
  return {ok:false};
}

function parse(item) {
  const sf=ts.createSourceFile(item.path,item.source,ts.ScriptTarget.Latest,true,
    /\.[jt]sx$/.test(item.path)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) return [];
  const imported=new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) ||
        !stmt.moduleSpecifier.text.startsWith('.')) continue;
    const spec=stmt.moduleSpecifier.text;
    const modulePath=path.normalize(path.join(path.dirname(item.path),spec));
    const targets=[modulePath, ...['.ts','.tsx','.js','.jsx'].map(ext=>modulePath+ext),
      ...['index.ts','index.tsx','index.js','index.jsx'].map(ext=>path.join(modulePath,ext))];
    const target=targets.find(p=>item.sourcePaths.includes(p));
    if (!target) continue;
    const clause=stmt.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
      for (const e of clause.namedBindings.elements)
        if (!e.isTypeOnly) imported.set(e.name.text,{target,fn:(e.propertyName||e.name).text});
  }
  const results=[];
  function visit(n) {
    // expect(importedFunction(literalArgs)).toBe(literalExpected)
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        ['toBe','toEqual','toStrictEqual'].includes(n.expression.name.text) && n.arguments.length===1) {
      const expectCall=n.expression.expression;
      if (ts.isCallExpression(expectCall) && ts.isIdentifier(expectCall.expression) &&
          expectCall.expression.text==='expect' && expectCall.arguments.length===1) {
        const actual=expectCall.arguments[0];
        if (ts.isCallExpression(actual) && ts.isIdentifier(actual.expression)) {
          const importedFn=imported.get(actual.expression.text);
          const args=actual.arguments.map(literal);
          const expected=literal(n.arguments[0]);
          if (importedFn && args.every(v=>v.ok) && expected.ok) {
            const line=sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
            results.push({repo:item.repo,file:importedFn.target,fn:importedFn.fn,
              args:args.map(v=>v.value),expected:expected.value,
              oracleFile:item.path,oracleLine:line,matcher:n.expression.name.text});
          }
        }
      }
    }
    ts.forEachChild(n,visit);
  }
  visit(sf);
  return results;
}

try {
  const data=JSON.parse(fs.readFileSync(input,'utf8'));
  const out=[];
  for (const item of data.tests) out.push(...parse(item));
  fs.writeFileSync(output,JSON.stringify(out));
} catch(e) { console.error(e.stack||String(e)); process.exitCode=1; }
