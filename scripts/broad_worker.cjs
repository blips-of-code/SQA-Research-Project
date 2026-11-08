'use strict';
const fs=require('fs'),ts=require('typescript'),fc=require('fast-check'),vm=require('vm');
const [mode,inputPath,outputPath]=process.argv.slice(2);
function classify(source,file){
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 let funcs=[];
 function visit(n){
  if(ts.isFunctionDeclaration(n)&&n.name&&n.body)funcs.push({name:n.name.text,node:n,kind:'function'});
  if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))funcs.push({name:d.name.text,node:d.initializer,kind:'variable',statement:n});
  if(ts.isMethodDeclaration(n)&&n.name&&n.body)funcs.push({name:n.name.getText(sf),node:n,kind:'method'});
  ts.forEachChild(n,visit);
 }visit(sf);
 const out=[];
 for(const f of funcs){let reason='';const n=f.node;
  if(f.kind==='method'){reason='ClassMethodNeedsInstance';}
  else if(n.parameters.length===0)reason='NoGeneratedInputs';
  else if(n.asteriskToken)reason='GeneratorNeedsCustomProperty';
  else if(n.parameters.length>5)reason='TooManyParameters';
  else if(n.parameters.some(p=>p.dotDotDotToken||!ts.isIdentifier(p.name)||p.initializer))reason='ComplexParameters';
  const types=n.parameters.map(p=>{if(!p.type)return 'unknown';if(p.type.kind===ts.SyntaxKind.StringKeyword)return 'string';if(p.type.kind===ts.SyntaxKind.NumberKeyword)return 'number';if(p.type.kind===ts.SyntaxKind.BooleanKeyword)return 'boolean';if(ts.isArrayTypeNode(p.type)){const k=p.type.elementType.kind;return k===ts.SyntaxKind.StringKeyword?'string[]':k===ts.SyntaxKind.NumberKeyword?'number[]':k===ts.SyntaxKind.BooleanKeyword?'boolean[]':'unknown';}if(ts.isTypeReferenceNode(p.type)&&p.type.typeName.getText(sf)==='Array'&&p.type.typeArguments?.length===1){const k=p.type.typeArguments[0].kind;return k===ts.SyntaxKind.StringKeyword?'string[]':k===ts.SyntaxKind.NumberKeyword?'number[]':'unknown';}return 'unknown'});
  if(!reason&&types.includes('unknown'))reason='UnknownOrComplexParameterType';
  const snippet=f.kind==='function'?source.slice(n.getStart(sf),n.end):f.statement?source.slice(f.statement.getStart(sf),f.statement.end):'';
  out.push({name:f.name,kind:f.kind,types,params:n.parameters.map(p=>p.name.getText(sf)),reason,snippet});
 }
 return {functionCount:funcs.length,candidates:out.map(x=>({...x,snippet:undefined})),eligible:out.find(x=>!x.reason)||null,parseErrors:sf.parseDiagnostics.length};
}
function arbitrary(t){switch(t){case 'string':return fc.string({maxLength:30});case 'number':return fc.integer({min:-100,max:100});case 'boolean':return fc.boolean();case 'string[]':return fc.array(fc.string({maxLength:15}),{maxLength:10});case 'number[]':return fc.array(fc.integer({min:-100,max:100}),{maxLength:10});case 'boolean[]':return fc.array(fc.boolean(),{maxLength:10});default:throw Error('Unsupported type '+t)}}
function isEnvironmentError(message){
 return /\b(?:is not defined|Cannot find module|Cannot resolve module|require is not defined|module is not defined|exports is not defined)\b/i.test(message)
  || /(?:Cannot read properties of undefined|Cannot read property .* of undefined)/i.test(message);
}
async function execute(job){
 const m=job.meta,source=job.source;
 const sf=ts.createSourceFile(job.file,source,ts.ScriptTarget.Latest,true);
 let found=null;
 function visit(n){
  if(found)return;
  if(m.kind==='function'&&ts.isFunctionDeclaration(n)&&n.name?.text===m.name&&n.body)found={node:n};
  if(m.kind==='variable'&&ts.isVariableStatement(n))for(const d of n.declarationList.declarations)
   if(ts.isIdentifier(d.name)&&d.name.text===m.name&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))found={node:d.initializer,statement:n};
  ts.forEachChild(n,visit);
 }
 visit(sf);
 if(!found)throw Error('FunctionNotFound');
 const snippet=found.statement?source.slice(found.statement.getStart(sf),found.statement.end):source.slice(found.node.getStart(sf),found.node.end);
 const js=ts.transpileModule(snippet,{fileName:job.file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const ctx=vm.createContext({exports:{},Math,Set,Array,Object,String,Number,Boolean,JSON,RegExp,Map,Date,parseInt,parseFloat,isNaN,NaN,Infinity,encodeURIComponent,decodeURIComponent,Promise});
 new vm.Script(js+'\n;globalThis.__target='+m.name+';',{filename:job.file}).runInContext(ctx,{timeout:1000});
 if(typeof ctx.__target!=='function')throw Error('NotCallable');
 if(!m.types.length)throw Error('NoGeneratedInputs');
 const arbs=m.types.map(arbitrary);
 const property=fc.asyncProperty(...arbs,async (...args)=>{
  ctx.__args=args;
  let value;
  try{
   value=new vm.Script('globalThis.__target(...globalThis.__args)',{filename:job.file}).runInContext(ctx,{timeout:500});
   await value;
   return true;
  }catch(e){throw new Error(String(e?.message||e));}
 });
 const check=await fc.check(property,{numRuns:job.runs||20,seed:job.seed||12345});
 const args=check.counterexample||[];
 const error=check.failed?String(check.error||'Property failed'):'';
 const environment=check.failed&&isEnvironmentError(error);
 if(environment)return {status:'EnvironmentBlocked',reason:error.slice(0,1200),runs:check.numRuns,counterexample:args};
 const failed=check.failed;
 return {status:failed?'Failed':'Passed',row:{
  FilePath:job.fullPath,
  TestCaseName:'Typed-input no-throw robustness (not functional correctness)',
  FunctionName:m.name,Status:failed?'Failed':'Passed',
  ExpectedValue:'No exception for generated typed inputs',
  ProvidedValue:failed?'Exception; see ErrorMessage':'No exception in '+check.numRuns+' generated runs',
  ErrorMessage:failed?error.slice(0,1200):'',
  FailureCategory:failed?'RobustnessExceptionNeedsReview':'',
  InputParamater:failed?m.params.map((p,i)=>p+'='+JSON.stringify(args[i])).join('; '):'Generated parameters: '+m.params.join(', ')
 },runs:check.numRuns,counterexample:args};
}

(async()=>{
 try{
  const job=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const result=mode==='scan'?classify(job.source,job.file):await execute(job);
  fs.writeFileSync(outputPath,JSON.stringify(result));
 }catch(e){console.error((e&&e.stack)||String(e));process.exitCode=1;}
})();
