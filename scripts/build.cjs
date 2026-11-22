const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inflateRawSync } = require('node:zlib');
const { transformSync } = require('esbuild');
const { format } = require('prettier');
const { version, prettier } = require('../package.json');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'src', name), 'utf8').replace(/\r\n/g, '\n');
const modules = JSON.parse(read('modules.json'));
for (const name of modules) {
    if (!/^[a-z-]+\.js$/.test(name)) throw new Error('Invalid module name');
}
const header = read('userscript-header.txt').trimEnd();
const rarVendor = path.join(root, 'src', 'vendor', 'node-unrar-js');
// tiny-inflate 1.0.3 decodes the bundled payload inside the RAR worker.
const inflatePath = path.join(root, 'src', 'vendor', 'tiny-inflate');
const licenses = [
    fs.readFileSync(path.join(rarVendor, 'LICENSE.txt'), 'utf8'),
    fs.readFileSync(path.join(inflatePath, 'LICENSE.txt'), 'utf8'),
].join('\n\n');
const rarDecoder = fs.readFileSync(path.join(rarVendor, 'unrar.js'), 'utf8');
const inflateScript = read('vendor/tiny-inflate/index.js');
// Store raw DEFLATE bytes so each supported build environment embeds the same payload.
const packedWasm = fs.readFileSync(path.join(rarVendor, 'unrar.wasm.deflate'));
const rarWasm = inflateRawSync(packedWasm);
const inflate = require(path.join(inflatePath, 'index.js'));
if (!WebAssembly.validate(rarWasm) || !rarWasm.equals(inflate(packedWasm, Buffer.alloc(rarWasm.length))))
    throw Error('Bundled RAR decoder fails decompression or Wasm validation');
const rarWorker =
    rarDecoder +
    '\nconst inflateRarWasm = (() => { const module = {exports:null};\n' +
    inflateScript +
    '\nreturn module.exports; })();\n' +
    'const SUBTITLE_RAR_WASM_DEFLATE = ' +
    JSON.stringify(packedWasm.toString('base64')) +
    ';\n' +
    'const SUBTITLE_RAR_WASM_SIZE = ' +
    rarWasm.length +
    ';\n' +
    read('rar-worker.js');
/** Encodes source text as short JSON strings joined at runtime. */
const stringExpression = (source) => {
    const chunks = [];
    let chunk = '';
    let encodedLength = 0;
    for (const character of source) {
        const characterLength = JSON.stringify(character).length - 2;
        if (chunk && encodedLength + characterLength > 80) {
            chunks.push(JSON.stringify(chunk));
            chunk = '';
            encodedLength = 0;
        }
        chunk += character;
        encodedLength += characterLength;
    }
    if (chunk) chunks.push(JSON.stringify(chunk));
    return '[' + chunks.join(',') + '].join("")';
};
const compressedRarWorker = transformSync(rarWorker, {
    charset: 'utf8',
    legalComments: 'none',
    minifyIdentifiers: true,
    minifyWhitespace: true,
    lineLimit: 90,
    sourcefile: 'subtitle-rar-worker.js',
    target: 'es2020',
}).code;
new vm.Script(compressedRarWorker, { filename: 'subtitle-rar-worker.js' });

async function build() {
    const filename = 'cloud-media-organizer-v3.user.js';
    const workerSource = 'const SUBTITLE_RAR_WORKER = ' + stringExpression(compressedRarWorker) + ';';
    // Append the worker payload after the application code, immediately before startup.
    const body = modules
        .map((name) => (name === 'bootstrap.js' ? workerSource + '\n' + read(name) : read(name)))
        .join('\n');
    if (
        !header.includes('// @version      ' + version) ||
        !body.includes("const VERSION = '" + version + "'")
    ) {
        throw new Error('Version mismatch');
    }
    const application = '(() => {\n' + "'use strict';\n" + body + '\n})();';
    const compiled = transformSync(application, {
        charset: 'utf8',
        legalComments: 'none',
        sourcefile: filename,
        target: 'es2020',
    }).code;
    const preamble =
        header +
        '\n\n// Generated from src/*.js by npm run build.\n' +
        '/*\n' +
        licenses.replace(/\*\//g, '* /') +
        '\n*/\n';
    const output = await format(preamble + compiled, { ...prettier, filepath: filename });
    new vm.Script(output, { filename });
    const target = path.join(root, filename);
    if (process.argv.includes('--check')) {
        if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== output) {
            throw new Error('Userscript differs from source; run npm run build');
        }
        console.log('PASS deterministic build and syntax');
        return;
    }
    fs.writeFileSync(target, output);
    console.log('Built ' + modules.length + ' modules, ' + Buffer.byteLength(output) + ' bytes, v' + version);
}

build().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
