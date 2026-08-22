import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';

const [sourceArg = 'config/annual-wheel.yaml', outputArg = 'config/annual-wheel.config.js'] = process.argv.slice(2);
const sourcePath = new URL(`../${sourceArg}`, import.meta.url);
const outputPath = new URL(`../${outputArg}`, import.meta.url);
const setupPath = new URL('../setup.json', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const config = YAML.parse(source);
const setup = await readFile(setupPath, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});

if (!config?.organisation?.name || !Array.isArray(config?.items)) {
  throw new Error('Invalid configuration: organisation.name and items are required.');
}

const output = `// Generated from ${sourceArg}. Do not edit directly.\nwindow.annualWheelConfig = ${JSON.stringify(config, null, 2)};\nwindow.annualWheelBuild = ${JSON.stringify({ debugYears: Boolean(setup.debugYears) })};\n`;
await writeFile(outputPath, output);
