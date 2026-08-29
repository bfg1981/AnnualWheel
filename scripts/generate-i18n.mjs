import { readdir, readFile, writeFile } from 'node:fs/promises';

const translationsDir = new URL('../translations/', import.meta.url);
const outputPath = new URL('../lib/i18n.browser.js', import.meta.url);

const unquote = value => JSON.parse(value);
const parsePo = source => {
  const messages = {};
  let id;
  for (const block of source.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const idLine = lines.find(line => line.startsWith('msgid '));
    const translationLine = lines.find(line => line.startsWith('msgstr '));
    if (!idLine || !translationLine) continue;
    id = unquote(idLine.slice(6));
    if (id) messages[id] = unquote(translationLine.slice(7));
  }
  return messages;
};

const catalogues = Object.fromEntries(await Promise.all(
  (await readdir(translationsDir)).filter(name => name.endsWith('.po')).map(async name => [
    name.slice(0, -3),
    parsePo(await readFile(new URL(name, translationsDir), 'utf8')),
  ]),
));

const output = [
  '// Generated from translations/*.po. Do not edit directly.',
  '(() => {',
  `  const catalogues = ${JSON.stringify(catalogues, null, 2)};`,
  '  const resolveLocale = requested => {',
  '    if (catalogues[requested]) return requested;',
  "    const language = requested.split('-')[0];",
  "    return Object.keys(catalogues).find(locale => locale.startsWith(language + '-'));",
  '  };',
  "  const translate = (locale, id, values = {}) => (catalogues[locale][id] || id).replace(/\\{(\\w+)\\}/g, (_, name) => values[name] ?? '{' + name + '}');",
  '  window.annualWheelI18n = { resolveLocale, translate };',
  '})();',
  '',
].join('\n');
await writeFile(outputPath, output);
