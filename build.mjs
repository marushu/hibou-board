import {mkdir,copyFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const modules=['core.mjs','metadata.mjs','planning-import.mjs','portfolio.mjs','seed.mjs','server.mjs','app.mjs','auth.mjs','config.mjs','schema.mjs','runtime-import.mjs','login.mjs','sw.mjs'];
for(const f of modules)execFileSync(process.execPath,['--check',f]);
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of [...modules,'index.html','style.css','manifest.webmanifest','icon.svg','offline.html','package.json','package-lock.json'])await copyFile(f,'dist/'+f);
console.log('Build OK: allowlisted public files in dist');
