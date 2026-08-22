import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../lib/schedule.mjs', import.meta.url);
const outputPath = new URL('../lib/schedule.browser.js', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const browserSource = `(() => {\n${source.replaceAll('export function ', 'function ')}\nwindow.scheduleEngine = { resolveItemStatuses, resolveSchedule };\n})();\n`;

await writeFile(outputPath, `// Generated from lib/schedule.mjs. Do not edit directly.\n${browserSource}`);
