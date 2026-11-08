const fs = require('fs');
const ts = require('typescript');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output = [];
function nameOf(node, source) {
  if (node.name) return node.name.getText(source);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const p = node.parent;
    if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p))) return p.name.getText(source);
    return '(anonymous)';
  }
  return '(anonymous)';
}
for (const entry of input) {
  const results = [];
  let error = '';
  try {
    const contents = fs.readFileSync(entry.local, 'utf8');
    const source = ts.createSourceFile(entry.path, contents, ts.ScriptTarget.Latest, true, entry.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function walk(node) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const {line} = source.getLineAndCharacterOfPosition(node.getStart(source));
        const params = (node.parameters || []).map(p => p.name.getText(source)).join('; ');
        const parent = node.parent;
        const isExported = !!(node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) || !!(parent && ts.isVariableDeclaration(parent) && parent.parent && parent.parent.parent && parent.parent.parent.modifiers && parent.parent.parent.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
        results.push({Repository:entry.repo,FilePath:entry.path,FunctionName:nameOf(node,source),Kind:ts.SyntaxKind[node.kind],Line:line+1,Parameters:params,ReturnType:node.type ? node.type.getText(source) : '',Exported:isExported?'Yes':'Unknown/No',ParseError:''});
      }
      ts.forEachChild(node,walk);
    }
    walk(source);
    if (source.parseDiagnostics.length) error = source.parseDiagnostics.slice(0,3).map(d => ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | ');
  } catch (e) {error = String(e.message || e);}
  if (!results.length) results.push({Repository:entry.repo,FilePath:entry.path,FunctionName:'',Kind:'',Line:'',Parameters:'',ReturnType:'',Exported:'',ParseError:error || 'No function-like declarations found'});
  else if (error) results.forEach(r=>r.ParseError=error);
  output.push(...results);
}
process.stdout.write(JSON.stringify(output));
