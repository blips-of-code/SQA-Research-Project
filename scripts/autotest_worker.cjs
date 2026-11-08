'use strict';
const fs=require('fs'),path=require('path'),ts=require('typescript'),fc=require('fast-check'),vm=require('vm'),readline=require('readline');
const patterns={
 trim:{arb:fc.string(),parameters:['value'],name:'Trimmed output is stable and no longer than input',check:(f,x)=>({expected:true,actual:f(f(x))===f(x)&&f(x).length<=x.length})},
 lower:{arb:fc.string(),parameters:['value'],name:'Lowercase output is idempotent',check:(f,x)=>({expected:true,actual:f(f(x))===f(x)})},
 upper:{arb:fc.string(),parameters:['value'],name:'Uppercase output is idempotent',check:(f,x)=>({expected:true,actual:f(f(x))===f(x)})},
 abs:{arb:fc.integer({min:-1000000,max:1000000}),parameters:['value'],name:'Absolute value is nonnegative and symmetric',check:(f,x)=>({expected:true,actual:f(x)>=0&&f(x)===f(-x)})},
 identity:{arb:fc.oneof(fc.integer(),fc.string(),fc.boolean()),parameters:['value'],name:'Identity function returns its input',check:(f,x)=>({expected:x,actual:f(x)})},
 first:{arb:fc.array(fc.integer(),{maxLength:40}),parameters:['arr'],name:'First returns first array item or undefined',check:(f,x)=>({expected:x[0],actual:f(x)})},
 last:{arb:fc.array(fc.integer(),{maxLength:40}),parameters:['arr'],name:'Last returns last array item or undefined',check:(f,x)=>({expected:x[x.length-1],actual:f(x)})},
 negate:{arb:fc.boolean(),parameters:['value'],name:'Double negation returns original boolean',check:(f,x)=>({expected:x,actual:f(f(x))})},
 dedupe:{arb:fc.array(fc.integer(),{maxLength:40}),parameters:['arr'],name:'Deduplication preserves first occurrences',check:(f,x)=>({expected:[...new Set(x)],actual:f(x)})}
};
const text=n=>n.getText();
function unwrap(n){while(n&&(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isTypeAssertionExpression(n)))n=n.expression;return n;}
function recognize(expr,param){expr=unwrap(expr);if(!expr||!param)return null;
 if(ts.isIdentifier(expr)&&expr.text===param)return 'identity';
 if(ts.isPrefixUnaryExpression(expr)&&expr.operator===ts.SyntaxKind.ExclamationToken&&ts.isIdentifier(expr.operand)&&expr.operand.text===param)return 'negate';
 if(ts.isCallExpression(expr)&&expr.arguments.length===0&&ts.isPropertyAccessExpression(expr.expression)&&ts.isIdentifier(expr.expression.expression)&&expr.expression.expression.text===param){const m=expr.expression.name.text;return ({trim:'trim',toLowerCase:'lower',toUpperCase:'upper'})[m]||null;}
 if(ts.isCallExpression(expr)&&expr.arguments.length===1&&ts.isPropertyAccessExpression(expr.expression)&&expr.expression.expression.getText()==='Math'&&expr.expression.name.text==='abs'&&ts.isIdentifier(expr.arguments[0])&&expr.arguments[0].text===param)return 'abs';
 if(ts.isElementAccessExpression(expr)&&ts.isIdentifier(expr.expression)&&expr.expression.text===param){const arg=unwrap(expr.argumentExpression);if(ts.isNumericLiteral(arg)&&arg.text==='0')return 'first';if(ts.isBinaryExpression(arg)&&arg.operatorToken.kind===ts.SyntaxKind.MinusToken&&ts.isNumericLiteral(arg.right)&&arg.right.text==='1'&&ts.isPropertyAccessExpression(arg.left)&&ts.isIdentifier(arg.left.expression)&&arg.left.expression.text===param&&arg.left.name.text==='length')return 'last';}
 if(ts.isArrayLiteralExpression(expr)&&expr.elements.length===1&&ts.isSpreadElement(expr.elements[0])){let e=expr.elements[0].expression;if(ts.isNewExpression(e)&&e.expression.getText()==='Set'&&e.arguments?.length===1&&ts.isIdentifier(e.arguments[0])&&e.arguments[0].text===param)return 'dedupe';}
 return null;
}
function getExpr(body){if(!body)return null;if(!ts.isBlock(body))return body;if(body.statements.length===1&&ts.isReturnStatement(body.statements[0]))return body.statements[0].expression;return null;}
function scan(source,file){const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 // Only standalone modules with no runtime imports/re-exports. Type-only imports are allowed.
 if(sf.parseDiagnostics.length)return null;
 for(const st of sf.statements){if(ts.isImportDeclaration(st)&&!st.importClause?.isTypeOnly){const ic=st.importClause;if(!ic||ic.name||!ic.namedBindings||ts.isNamespaceImport(ic.namedBindings)||ts.isNamedImports(ic.namedBindings)&&ic.namedBindings.elements.some(e=>!e.isTypeOnly))return null;}if(ts.isExportDeclaration(st)&&st.moduleSpecifier)return null;}
 for(const st of sf.statements){let name=null,params=null,expr=null;
 const exported=!!st.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
 if(!exported)continue;
 if(ts.isFunctionDeclaration(st)&&st.name){name=st.name.text;params=st.parameters;expr=getExpr(st.body);}
 else if(ts.isVariableStatement(st)){for(const d of st.declarationList.declarations){if(!ts.isIdentifier(d.name)||!d.initializer)continue;const init=unwrap(d.initializer);if(!ts.isArrowFunction(init)&&!ts.isFunctionExpression(init))continue;const p=init.parameters;if(p.length!==1||!ts.isIdentifier(p[0].name))continue;const k=recognize(getExpr(init.body),p[0].name.text);if(k)return {name:d.name.text,pattern:k,parameter:p[0].name.text};}continue;}
 if(!name||!params||params.length!==1||!ts.isIdentifier(params[0].name))continue;
 const k=recognize(expr,params[0].name.text);if(k)return {name,pattern:k,parameter:params[0].name.text};
 }
 return null;
}
function load(source,file){const compiled=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});const mod={exports:{}};const wrapper=vm.runInThisContext('(function(exports,require,module,__filename,__dirname){'+compiled.outputText+'\n})',{filename:file,timeout:3000});wrapper(mod.exports,()=>{throw Error('Runtime dependency not supported by safe auto-test')},mod,file,path.dirname(file));return mod.exports;}
function safe(x){try{return JSON.stringify(x)??'undefined'}catch{return String(x)}}
function run(job){const source=fs.readFileSync(job.sourceFile,'utf8');const fn=load(source,job.sourceFile)[job.functionName];if(typeof fn!=='function')throw Error('Export not callable');const spec=patterns[job.pattern];if(!spec)throw Error('Unknown pattern');let sample=null,mismatch=null;const res=fc.check(fc.property(spec.arb,input=>{const v=spec.check(fn,input);const obs={input,expected:v.expected,actual:v.actual};if(!sample)sample=obs;if(safe(v.expected)!==safe(v.actual)){mismatch=obs;return false}return true}),{numRuns:job.runs||100,seed:12345,endOnFailure:true});const obs=res.failed?mismatch:sample;return {checks:res.numRuns,status:res.failed?'Failed':'Passed',row:{FilePath:job.fullPath,TestCaseName:spec.name,FunctionName:job.functionName,Status:res.failed?'Failed':'Passed',ExpectedValue:safe(obs?.expected),ProvidedValue:safe(obs?.actual),ErrorMessage:res.failed?String(res.error||'Property violation').split(/\r?\n/)[0]:'',FailureCategory:res.failed?'PropertyViolation':'',InputParamater:job.parameter+'='+safe(obs?.input)}};}
if(process.argv[2]==='scan'){const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});rl.on('line',line=>{try{const j=JSON.parse(line);const match=scan(j.source,j.file);process.stdout.write(JSON.stringify({id:j.id,match})+'\n')}catch(e){process.stdout.write(JSON.stringify({error:String(e)})+'\n')}})}else if(process.argv[2]==='test'){try{const job=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));process.stdout.write(JSON.stringify(run(job)))}catch(e){console.error(String(e.stack||e));process.exitCode=1}}else{console.error('Usage: node autotest_worker.cjs scan|test job.json');process.exitCode=2}
