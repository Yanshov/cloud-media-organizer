const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8').replace(/\r\n/g, '\n');
const modules = JSON.parse(read('modules.json'));
for (const name of modules) if (!/^[a-z-]+\.js$/.test(name)) throw Error('Invalid module name');
const header = read('userscript-header.txt').trimEnd();
const rarVendor = path.join(root, 'src', 'vendor', 'node-unrar-js');
const rarLicense = fs.readFileSync(path.join(rarVendor, 'LICENSE.txt'), 'utf8');
const rarDecoder = fs.readFileSync(path.join(rarVendor, 'unrar.js'), 'utf8');
const rarWasm = fs.readFileSync(path.join(rarVendor, 'unrar.wasm')).toString('base64');
const rarWorker = rarDecoder + '\nconst SUBTITLE_RAR_WASM = ' + JSON.stringify(rarWasm) + ';\n' + read('rar-worker.js');
new vm.Script(rarWorker, {filename:'subtitle-rar-worker.js'});
const body = modules.map(read).join('\n');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (!header.includes('// @version      ' + version) || !body.includes(`const VERSION = '${version}'`)) throw Error('Version mismatch');
const output = header + '\n\n// Generated from src/*.js by npm run build; edit source modules.\n'
    + '/*\n' + rarLicense.replace(/\*\//g, '* /') + '\n*/\n'
    + '(() => {\n    \'use strict\';\n\n    const SUBTITLE_RAR_WORKER = ' + JSON.stringify(rarWorker) + ';\n\n' + body + '})();\n';
new vm.Script(output, {filename:'cloud-media-organizer-v3.user.js'});
const target = path.join(root, 'cloud-media-organizer-v3.user.js');
if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== output) throw Error('Userscript differs from source; run npm run build');
    console.log('PASS deterministic build and syntax');
} else {
    fs.writeFileSync(target, output);
    console.log(`Built ${modules.length} modules, ${Buffer.byteLength(output)} bytes, v${version}`);
}
