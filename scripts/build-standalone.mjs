import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const script = value => value.replaceAll('</script', '<\\/script');
const assetUrls = new Map();
function inlineAssets(source) {
  return source.replace(/assets\/zhejiang\/[\w.-]+\.(?:png|gif|jpg|jpeg|webp)/g, name => {
    if (!assetUrls.has(name)) {
      const extension = name.split('.').at(-1);
      const mime = { png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension];
      assetUrls.set(name, `data:${mime};base64,${readFileSync(resolve(root, name)).toString('base64')}`);
    }
    return assetUrls.get(name);
  });
}

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, name) => `<style>\n${read(name)}\n</style>`);
const scripts = [];
html = html.replace(/\s*<script defer src="([^"]+)"><\/script>/g, (_, name) => {
  scripts.push(`<script>\n${script(inlineAssets(read(name)))}\n</script>`);
  return '';
});
// Inline scripts execute immediately, after the page's elements exist.
html = html.replace('</body>', `${scripts.join('\n')}\n</body>`);
if (/src="assets\//.test(html) || /<script[^>]+src=/.test(html) || /<link[^>]+stylesheet/.test(html)) {
  throw Error('Standalone HTML still contains external app resources');
}

const output = resolve(root, '知行题库-Windows直接打开.html');
writeFileSync(output, html);
console.log(`Built ${output} (${assetUrls.size} embedded images)`);
