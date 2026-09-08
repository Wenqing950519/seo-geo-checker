// One-time relocation rewrite. Use only with the matching migration manifest.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const plan = JSON.parse(fs.readFileSync(path.join(root,'docs/maintenance/layout-migration-2026-09-08.json'),'utf8'));
if (plan.status !== 'planned') throw new Error('This migration has already been rewritten');
const map = Object.fromEntries(plan.entries.map(e=>[e.from,e.to]));
const dirs = {'mock-api/public':'apps/web/public','mock-api/tests':'tests/regression','mock-api/migrations':'services/api/migrations','research-input':'research/inputs','research-output':'research/outputs','research-sources':'research/sources','research-work':'research/work','business_docs':'docs/archive/business','seo-geo':'archive/seo-geo'};
const posix = s=>s.replaceAll('\\','/');
function mapped(file) {
  file = posix(file);
  if (map[file]) return map[file];
  if (map[file+'.js']) return map[file+'.js'];
  for (const [old,next] of Object.entries(dirs)) if (file===old || file.startsWith(old+'/')) return next+file.slice(old.length);
  return file;
}
function relative(dir,target) { const value = posix(path.relative(path.join(root,dir),path.join(root,target))); return value.startsWith('.')?value:'./'+value; }
function rewrite(from,to,text) {
  const oldDir=path.posix.dirname(from), newDir=path.posix.dirname(to);
  text=text.replace(/require(\.resolve)?\((['"])(\.[^'"]+)\2\)/g,(all,resolve,quote,spec)=>{
    const target=path.posix.normalize(path.posix.join(oldDir,spec));
    return `require${resolve||''}(${quote}${relative(newDir,mapped(target))}${quote})`;
  });
  // Literal filesystem paths relative to __dirname must retain their original target.
  text=text.replace(/path\.(resolve|join)\(__dirname,\s*((?:['"][^'"]*['"]\s*,\s*)*['"][^'"]*['"])\)/g,(all,method,args)=>{
    const segments=[...args.matchAll(/['"]([^'"]*)['"]/g)].map(m=>m[1]);
    const target=path.posix.normalize(path.posix.join(oldDir,...segments));
    return `path.${method}(__dirname, ${JSON.stringify(relative(newDir,mapped(target)))})`;
  });
  // Paths composed from a known repository root (rather than a module directory).
  text=text.replace(/path\.(join|resolve)\((root|projectRoot|PROJECT_ROOT),\s*((?:['"][^'"]*['"]\s*,\s*)*['"][^'"]*['"])\)/g,(all,method,base,args)=>{
    const segments=[...args.matchAll(/['"]([^'"]*)['"]/g)].map(m=>m[1]);
    const target=path.posix.normalize(path.posix.join(...segments));
    return `path.${method}(${base}, ${JSON.stringify(mapped(target))})`;
  });
  for(const [old,next] of Object.entries({...dirs,...map}).sort((a,b)=>b[0].length-a[0].length)) {
    text=text.replaceAll(`"${old}"`,`"${next}"`).replaceAll(`'${old}'`,`'${next}'`);
  }
  return text;
}
for(const entry of plan.entries) {
  if (!/\.(?:js|mjs|cjs|py)$/.test(entry.to)) continue;
  const absolute=path.join(root,entry.to);
  const text=fs.readFileSync(absolute,'utf8');
  fs.writeFileSync(absolute,rewrite(entry.from,entry.to,text));
}
// Keep deployment and research entrypoints, not a second copy of the implementation.
for (const entry of plan.entries.filter(e=>/^mock-api\/(lib|providers)\/.*\.js$/.test(e.from))) {
  fs.mkdirSync(path.dirname(path.join(root,entry.from)),{recursive:true});
  fs.writeFileSync(path.join(root,entry.from),`// Compatibility entrypoint; edit ${entry.to} instead.\nmodule.exports = require(${JSON.stringify(relative(path.posix.dirname(entry.from),entry.to))});\n`);
}
fs.writeFileSync(path.join(root,'mock-api/server.js'),'// Compatibility entrypoint for existing Render start commands.\nrequire("../services/api/server.js");\n');
for(const entry of plan.entries.filter(e=>e.from.startsWith('mock-api/scripts/') && /\.(js|mjs)$/.test(e.from))) {
  fs.mkdirSync(path.dirname(path.join(root,entry.from)),{recursive:true});
  const target=relative(path.posix.dirname(entry.from),entry.to);
  fs.writeFileSync(path.join(root,entry.from),entry.from.endsWith('.mjs')?`// Compatibility CLI.\nimport ${JSON.stringify(target)};\n`:`// Compatibility CLI.\nrequire(${JSON.stringify(target)});\n`);
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
pkg.scripts.start='node services/api/server.js';
pkg.scripts['mock-api']='node mock-api/server.js';
pkg.scripts.test=pkg.scripts.test.replaceAll('mock-api/tests/','tests/regression/')+' && node tests/repository-layout.test.js';
// Retain the known postinstall entrypoints; their implementations now live under scripts/runtime.
fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg,null,2)+'\n');
plan.status='rewritten';
fs.writeFileSync(path.join(root,'docs/maintenance/layout-migration-2026-09-08.json'),JSON.stringify(plan,null,2)+'\n');
console.log('Canonical modules rewritten; compatibility entrypoints installed');
