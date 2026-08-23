import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import YAML from 'yaml';

const setup = await readFile('setup.json', 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const debug = setup.debug || {};
const buildSettings = { animationTime: Number(setup.animationTime) || 400, gracePeriod: Number(setup.gracePeriod) || 31, debug: { enabled: Boolean(debug.enabled), years: Boolean(debug.years), currentDisplayDate: Boolean(debug.currentDisplayDate) } };
const sourceConfig = process.argv[2] || setup.sourceConfig || 'config/annual-wheel.yaml';
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

const fontSettings = config.display?.fonts;
if (fontSettings?.provider === 'selfHosted') {
  const directory = fontSettings.directory;
  if (!directory || directory.startsWith('/') || directory.split('/').includes('..')) {
    throw new Error('Self-hosted font directory must be a relative path within the project.');
  }
  await cp(directory, join(output, directory), { recursive: true });
}

await writeFile(
  join(output, 'annual-wheel-config.js'),
  `// Generated from ${basename(sourceConfig)}. Do not edit directly.\nwindow.annualWheelConfig = ${JSON.stringify(config, null, 2)};\nwindow.annualWheelBuild = ${JSON.stringify(buildSettings)};\n`,
);

await cp('lib/schedule.browser.js', join(output, 'lib', 'schedule.browser.js'));
await cp('lib/i18n.browser.js', join(output, 'lib', 'i18n.browser.js'));
