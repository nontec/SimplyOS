import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
await build({absWorkingDir:process.cwd(),entryPoints:['radio.js'],bundle:true,platform:'browser',format:'iife',globalName:'SimplyMesh',target:'chrome120',outfile:'../radio.js',minify:false,sourcemap:false,legalComments:'eof',
 alias:{'@meshtastic/protobufs':path.resolve('vendor/protobufs/mod.ts')},
 plugins:[{name:'crc-deno-import-map',setup(builder){builder.onResolve({filter:/^crc$/},()=>({path:path.resolve('node_modules/crc/mjs/index.js')}));}}]});
