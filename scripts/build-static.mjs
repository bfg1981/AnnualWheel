import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import YAML from 'yaml';

const sourceConfig = process.argv[2];
if (!sourceConfig) throw new Error('Usage: node scripts/build-static.mjs <config.yaml>');

const config = YAML.parse(await readFile(sourceConfig, 'utf8'));
if (!config?.organisation?.name || !Array.isArray(config?.items)) {
  throw new Error('Invalid configuration: organisation.name and items are required.');
}

const output = 'html';
await mkdir(join(output, 'config'), { recursive: true });
await mkdir(join(output, 'lib'), { recursive: true });

await Promise.all([
  cp('index.html', join(output, 'index.html')),
  cp('styles.css', join(output, 'styles.css')),
  cp('script.js', join(output, 'script.js')),
  cp('translations', join(output, 'translations'), { recursive: true }),
]);

await writeFile(
  join(output, 'config', 'annual-wheel.config.js'),
  `// Generated from ${basename(sourceConfig)}. Do not edit directly.\nwindow.annualWheelConfig = ${JSON.stringify(config, null, 2)};\nwindow.annualWheelBuild = ${JSON.stringify({ debugYears: false })};\n`,
);

await cp('lib/schedule.browser.js', join(output, 'lib', 'schedule.browser.js'));
await cp('lib/i18n.browser.js', join(output, 'lib', 'i18n.browser.js'));
