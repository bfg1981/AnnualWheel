import { readFile, writeFile } from 'node:fs/promises';
import { loadPlanCalendars } from '../lib/calendar-sources.mjs';
import { configurationTranslationValues } from '../lib/config-translations.mjs';
import { readPlanFile } from './read-plan.mjs';
import { readPlan, toPlanDocument } from '../lib/plan-graph.js';
import { normalizeAnchorDependencies } from '../lib/schedule.mjs';

const [sourceArg, outputArg = 'annual-wheel-config.js'] = process.argv.slice(2);
const setupPath = new URL('../setup.json', import.meta.url);
const setup = await readFile(setupPath, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const debug = setup.debug || {};
const buildSettings = { animationTime: Number(setup.animationTime) || 400, gracePeriod: Number(setup.gracePeriod) || 31, showYearAnnulus: setup.showYearAnnulus !== false, debug: { enabled: Boolean(debug.enabled), years: Boolean(debug.years), currentDisplayDate: Boolean(debug.currentDisplayDate) } };
const { filename: sourceConfig, path: sourcePath, document } = await readPlanFile(sourceArg || setup.sourceConfig);
const outputPath = new URL(`../${outputArg}`, import.meta.url);
const inputPlan = readPlan(document);
if (!inputPlan?.organisation?.name || !Array.isArray(inputPlan?.items)) {
  throw new Error('Invalid configuration: organisation.name and items are required.');
}

const { plan: config, sources } = await loadPlanCalendars(normalizeAnchorDependencies(inputPlan), sourcePath, setup.calendarCatalog);
const strings = new Set([...configurationTranslationValues(config), ...configurationTranslationValues({ display: {}, items: [], schedules: sources })]);
const output = `// Generated from ${sourceConfig}. Do not edit directly.\nwindow.annualWheelConfig = ${JSON.stringify(toPlanDocument(config, document), null, 2)};\nwindow.annualWheelCalendarSources = ${JSON.stringify(sources)};\nwindow.annualWheelTranslationStrings = ${JSON.stringify([...strings])};\nwindow.annualWheelBuild = ${JSON.stringify(buildSettings)};\n`;
await writeFile(outputPath, output);
