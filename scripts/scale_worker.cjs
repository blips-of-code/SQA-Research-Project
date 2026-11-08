'use strict';
const fs=require('fs'),ts=require('typescript'),fc=require('fast-check'),vm=require('vm');
const args=process.argv.slice(2); const mode=args[0];
function clean(n){return n&&ts.isParenthesizedExpression(n)?clean(n.expression):n}
function id(n,s){return n&&ts.isIdentifier(n)&&n.text===s}
function prop(n,s){return n&&ts.isPropertyAccessExpression(n)&&n.name.text===s}
function pattern(fn){
 if(fn.parameters.length!==1||!ts.isIdentifier(fn.parameters[0].name))return null;
 const p=fn.parameters[0].name.text; let e=fn.body;
 if(ts.isBlock(e)){const stmts=e.statements;if(stmts.length!==1||!ts.isReturnStatement(stmts[0])||!stmts[0].expression)return null;e=stmts[0].expression}
 e=clean(e);
 if(id(e,p))return 'identity';
 if(ts.isPrefixUnaryExpression(e)&&e.operator===ts.SyntaxKind.ExclamationToken&&id(e.operand,p))return 'boolean_not';
 if(ts.isCallExpression(e)&&e.arguments.length===0&&ts.isPropertyAccessExpression(e.expression)&&id(e.expression.expression,p)){
  const m=e.expression.name.text;if(['trim','toUpperCase','toLowerCase'].includes(m))return m;
 }
 if(ts.isCallExpression(e)&&e.arguments.length===1&&prop(e.expression,'abs')&&id(e.expression.expression,'Math')&&id(e.arguments[0],p))return 'math_abs';
 if(ts.isElementAccessExpression(e)&&id(e.expression,p)&&e.argumentExpression&&ts.isNumericLiteral(e.argumentExpression)&&e.argumentExpression.text==='0')return 'first';
 if(ts.isElementAccessExpression(e)&&id(e.expression,p)&&ts.isBinaryExpression(e.argumentExpression)&&e.argumentExpression.operatorToken.kind===ts.SyntaxKind.MinusToken&&prop(e.argumentExpression.left,'length')&&id(e.argumentExpression.left.expression,p)&&ts.isNumericLiteral(e.argumentExpression.right)&&e.argumentExpression.right.text==='1')return 'last';
 if(ts.isArrayLiteralExpression(e)&&e.elements.length===1&&ts.isSpreadElement(e.elements[0])&&ts.isNewExpression(e.elements[0].expression)&&id(e.elements[0].expression.expression,'Set')&&e.elements[0].expression.arguments?.length===1&&id(e.elements[0].expression.arguments[0],p))return 'dedupe';
 if(ts.isBinaryExpression(e)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken].includes(e.operatorToken.kind)&&prop(e.left,'length')&&id(e.left.expression,p)&&ts.isNumericLiteral(e.right)&&e.right.text==='0')return 'is_empty';
 return null;
}
function gather(src,file){
 const sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const functions=[];
 function visit(n){
  if(ts.isFunctionDeclaration(n)&&n.name&&n.body){functions.push({name:n.name.text,node:n,kind:'function'});}
  if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations){if(ts.isIdentifier(d.name)&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))){functions.push({name:d.name.text,node:d.initializer,kind:'variable',declaration:d,statement:n});}}
  ts.forEachChild(n,visit)
 }visit(sf);
 let best=null;
 for(const f of functions){const p=pattern(f.node);if(p){best={name:f.name,pattern:p,kind:f.kind,start:f.node.getStart(sf),end:f.node.end,declStart:f.statement?.getStart(sf),declEnd:f.statement?.end,parameters:f.node.parameters.map(x=>x.name.getText(sf))};break}}
 return {functionCount:functions.length,eligible:best,parseErrors:sf.parseDiagnostics.length};
}
function expected(kind,x){switch(kind){case 'identity':return x;case 'boolean_not':return !x;case 'trim':return x.trim();case 'toUpperCase':return x.toUpperCase();case 'toLowerCase':return x.toLowerCase();case 'math_abs':return Math.abs(x);case 'first':return x[0];case 'last':return x[x.length-1];case 'dedupe':return [...new Set(x)];case 'is_empty':return x.length===0;default:throw Error('Unknown pattern')}}
function arb(kind){switch(kind){case 'identity':return fc.oneof(fc.string(),fc.integer(),fc.boolean(),fc.array(fc.integer(),{maxLength:15}));case 'boolean_not':return fc.boolean();case 'trim':case 'toUpperCase':case 'toLowerCase':return fc.string({maxLength:80});case 'math_abs':return fc.integer({min:-1000000,max:1000000});case 'first':case 'last':case 'dedupe':return fc.array(fc.integer(),{maxLength:30});case 'is_empty':return fc.oneof(fc.string({maxLength:50}),fc.array(fc.integer(),{maxLength:30}));}}
function loadFunction(source,file,meta){
 // Execute the ORIGINAL declaration text, not a rewritten implementation.
 // Restrict to syntactically standalone expressions. Unresolved dependencies become blocked.
 const snippet=meta.kind==='function'?source.slice(meta.start,meta.end):source.slice(meta.declStart,meta.declEnd);
 const js=ts.transpileModule(snippet,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const ctx=vm.createContext({Math,Set,Array,Object,String,Number,Boolean,JSON,RegExp});
 const wrapped=js+'\n;globalThis.__target = '+meta.name+';';
 new vm.Script(wrapped,{filename:file}).runInContext(ctx,{timeout:2000});
 if(typeof ctx.__target!=='function')throw Error('Not callable');return ctx.__target;
}
function norm(x){return JSON.stringify(x)??'undefined'}
function run(job){const meta=job.eligible;const fn=loadFunction(job.source,job.file,meta);let observation=null,fail=null;
 const res=fc.check(fc.property(arb(meta.pattern),x=>{
  let exp=expected(meta.pattern,x),act;
  try{act=fn(x)}catch(e){fail={input:x,expected:exp,actual:'THREW: '+String(e.message)};return false}
  const ok=norm(exp)===norm(act);
  if(!observation||!ok)observation={input:x,expected:exp,actual:act};
  if(!ok)fail=observation;return ok;
 }),{numRuns:job.runs||100,seed:job.seed||12345,endOnFailure:true});
 const o=res.failed?(fail||observation):observation;
 return {status:res.failed?'Failed':'Passed',checks:res.numRuns,pattern:meta.pattern,rows:[{FilePath:job.fullPath,TestCaseName:'AST-derived '+meta.pattern+' property',FunctionName:meta.name,Status:res.failed?'Failed':'Passed',ExpectedValue:norm(o?.expected),ProvidedValue:norm(o?.actual),ErrorMessage:res.failed?String(res.error||'Property violated').split(/\r?\n/)[0]:'',FailureCategory:res.failed?'PropertyViolation':'',InputParamater:meta.parameters[0]+'='+norm(o?.input)}]};
}
try{
 if(mode==='scan'){const input=JSON.parse(fs.readFileSync(args[1],'utf8'));const output=input.map(x=>({key:x.key,...gather(x.source,x.file)}));fs.writeFileSync(args[2],JSON.stringify(output));}
 else if(mode==='test'){const job=JSON.parse(fs.readFileSync(args[1],'utf8'));fs.writeFileSync(args[2],JSON.stringify(run(job)));}
 else throw Error('Expected scan or test');
}catch(e){console.error(e.stack||String(e));process.exitCode=1}
