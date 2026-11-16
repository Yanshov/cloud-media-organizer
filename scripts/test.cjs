const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort();
const checks = ['scripts/build.cjs', ...files.map(name => 'tests/' + name)];
let failed = 0;
for (const file of checks) {
    console.log('\n$ node ' + file);
    const result = spawnSync(process.execPath, [file, ...(file.startsWith('scripts/') ? ['--check'] : [])], {cwd:root, encoding:'utf8'});
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed; ${files.length} test suites. Mocked APIs/DOM, no live drive mutations.`);
if (failed) process.exitCode = 1;
