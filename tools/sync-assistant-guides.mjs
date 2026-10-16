import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';

// Offline documents remain authoritative. The website extracts their CSS into
// ordinary files because the existing hosting policy refuses inline styles.
export async function syncAssistantGuides(root, documentation) {
  const out = resolve(root, 'public/assistant/guide'); await mkdir(out, {recursive: true});
  let count = 0;
  for (const entry of await readdir(documentation, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw Error('Assistant documentation cannot be redirected');
    if (entry.isDirectory()) { await copyTree(resolve(documentation, entry.name), resolve(out, entry.name)); continue; }
    if (!entry.isFile()) continue;
    const source = resolve(documentation, entry.name), target = resolve(out, entry.name);
    if (extname(entry.name).toLowerCase() === '.html') {
      let html = await readFile(source, 'utf8'); html = html.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
      if (/<script\b|\sstyle=/i.test(html)) throw Error(`Assistant guide has unsupported inline content: ${entry.name}`);
      const styles = [];
      html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {styles.push(css); return '';});
      if (styles.length) {
        const css = basename(entry.name, extname(entry.name)) + '.css';
        const link = `<link rel="stylesheet" href="${css}">`;
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, link + '</head>') : html.replace(/<main\b/i, link + '\n<main');
        // Older standalone guides may put their content directly in body.
        if (!html.includes(link)) html = html.replace(/<body\b/i, link + '<body');
        await writeFile(resolve(out, css), styles.join('\n').trim() + '\n');
      }
      if (/C:[/\\]Users|G:[/\\]My Drive|Documents[/\\]ChatGPT|Regisfall/i.test(html)) throw Error(`Assistant guide contains private test/install context: ${entry.name}`);
      await writeFile(target, html.replace(/[\t ]+$/gm, '').trimEnd() + '\n');
    } else await copyFile(source, target);
    count++;
  }
  async function copyTree(from, to) {
    await mkdir(to, {recursive: true});
    for (const entry of await readdir(from, {withFileTypes: true})) {
      if (entry.isSymbolicLink()) throw Error('Assistant SDK source cannot be redirected');
      if (entry.isDirectory()) await copyTree(resolve(from, entry.name), resolve(to, entry.name));
      else if (entry.isFile()) {
        const source = resolve(from, entry.name), target = resolve(to, entry.name);
        if (['.js', '.json'].includes(extname(entry.name).toLowerCase())) await writeFile(target, (await readFile(source, 'utf8')).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n'));
        else await copyFile(source, target);
      }
    }
  }
  await writeFile(resolve(out, 'README.txt'), 'UO Assistant documentation\n\nThese pages accompany the current application release. Begin with Guide.html, Scripting-Guide.html, Native-Playability.html or Recording.html. Recording-Dependencies.html retains the recording component source and license information.\n');
  return {documents: count};
}
