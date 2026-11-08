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
  else if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword||m.kind===ts.SyntaxKind.AsteriskToken)||n.asteriskToken)reason='AsyncOrGenerator';
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
function execute(job){const m=job.meta;const source=job.source;const sf=ts.createSourceFile(job.file,source,ts.ScriptTarget.Latest,true);let found=null;
 function visit(n){
  if(found)return;
  if(m.kind==='function'&&ts.isFunctionDeclaration(n)&&n.name?.text===m.name&&n.body)found={node:n};
  if(m.kind==='variable'&&ts.isVariableStatement(n)){
   for(const d of n.declarationList.declarations){
    if(ts.isIdentifier(d.name)&&d.name.text===m.name&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))found={node:d.initializer,statement:n};
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
 if(!found)throw Error('FunctionNotFound');const snippet=found.statement?source.slice(found.statement.getStart(sf),found.statement.end):source.slice(found.node.getStart(sf),found.node.end);
 const js=ts.transpileModule(snippet,{fileName:job.file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const ctx=vm.createContext({exports:{},Math,Set,Array,Object,String,Number,Boolean,JSON,RegExp,Map,Date,parseInt,parseFloat,isNaN,NaN,Infinity,encodeURIComponent,decodeURIComponent});
 new vm.Script(js+'\n;globalThis.__target='+m.name+';',{filename:job.file}).runInContext(ctx,{timeout:1000});
 if(typeof ctx.__target!=='function')throw Error('NotCallable');
 const arbs=m.types.map(arbitrary);let observed=null;
 const check=fc.check(fc.property(fc.tuple(...arbs),args=>{ctx.__args=args;try{new vm.Script('globalThis.__out=globalThis.__target(...globalThis.__args)').runInContext(ctx,{timeout:500});observed={args,output:String(ctx.__out)};return true}catch(e){observed={args,error:String(e?.message||e)};return false}}),{numRuns:job.runs||20,seed:job.seed||12345,endOnFailure:true});
 const failed=check.failed;const value=JSON.stringify(observed?.args||[]);
 return {status:failed?'Failed':'Passed',row:{FilePath:job.fullPath,TestCaseName:'Generated typed-input no-throw robustness (not functional correctness)',FunctionName:m.name,Status:failed?'Failed':'Passed',ExpectedValue:'No unexpected exception for generated inputs',ProvidedValue:failed?observed?.error:'No exception in '+check.numRuns+' runs',ErrorMessage:failed?(observed?.error||'Exception'):'',FailureCategory:failed?'RobustnessExceptionNeedsReview':'',InputParamater:m.params.map((p,i)=>p+'='+JSON.stringify(observed?.args?.[i])).join('; ')},runs:check.numRuns};
}
try{const job=JSON.parse(fs.readFileSync(inputPath,'utf8'));const result=mode==='scan'?classify(job.source,job.file):execute(job);fs.writeFileSync(outputPath,JSON.stringify(result))}catch(e){console.error((e&&e.stack)||String(e));process.exitCode=1}
