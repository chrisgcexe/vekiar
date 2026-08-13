import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const temps = [
    '_cleanup.mjs',
    '_validate.mjs', '_fixindent.mjs', '_check_out.txt', '_fix_out.txt',
    '_run_ok.txt', '_t.txt', '_n.txt',
    '_tmp_0.mjs', '_tmp_1.mjs', '_tmp_2.mjs', '_tmp_3.mjs'
];
for (const t of temps) {
    const p = join(cwd, t);
    if (existsSync(p)) {
        try { unlinkSync(p); console.log('borrado: ' + t); } catch (e) { console.log('error borrado: ' + t); }
    }
}
