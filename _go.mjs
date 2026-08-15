import fs from 'fs';
const base = 'c:/Users/chris/Desktop/tp_1_lmm4/vekiar/';
const L = fs.readFileSync(base + 'js/scene/MarkerBuilder.js', 'utf8').split(/\r?\n/);
const slice = L.slice(89, 142);
fs.writeFileSync(base + '_mb.txt', slice.join('\n'), 'utf8');
fs.writeFileSync(base + '_go.txt', 'node=' + process.version + ' lines=' + L.length + ' sliced=' + slice.length + '\n', 'utf8');
