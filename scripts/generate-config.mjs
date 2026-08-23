import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';

const [sourceArg, outputArg = 'config/annual-wheel.config.js'] = process.argv.slice(2);
const setupPath = new URL('../setup.json', import.meta.url);
const setup = await readFile(setupPath, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const debug = setup.debug || {};
const buildSettings = { animationTime: Number(setup.animationTime) || 400, gracePeriod: Number(setup.gracePeriod) || 31, debug: { enabled: Boolean(debug.enabled), years: Boolean(debug.years), currentDisplayDate: Boolean(debug.currentDisplayDate) } };
const sourceConfig = sourceArg || setup.sourceConfig || 'config/annual-wheel.yaml';
const sourcePath = new URL(`../${sourceConfig}`, import.meta.url);
const outputPath = new URL(`../${outputArg}`, import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const config = YAML.parse(source);

if (!config?.organisation?.name || !Array.isArray(config?.items)) {
  throw new Error('Invalid configuration: organisation.name and items are required.');
}

const output = `// Generated from ${sourceConfig}. Do not edit directly.\nwindow.annualWheelConfig = ${JSON.stringify(config, null, 2)};\nwindow.annualWheelBuild = ${JSON.stringify(buildSettings)};\n`;
await writeFile(outputPath, output);
