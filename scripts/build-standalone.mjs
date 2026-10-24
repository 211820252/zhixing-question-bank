import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const script = value => value.replaceAll('</script', '<\\/script');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('styles.css')}\n</style>`)
  .replace('<script defer src="data.js"></script>', `<script>\n${script(read('data.js'))}\n</script>`)
  .replace('<script defer src="app.js"></script>', `<script>\n${script(read('app.js'))}\n</script>`);

const output = resolve(root, '知行题库-Windows直接打开.html');
writeFileSync(output, html);
console.log(output);
