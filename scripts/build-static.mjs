import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { loadPlanCalendars } from '../lib/calendar-sources.mjs';
import { sourceTextChanges } from '../lib/config-graph.js';
import YAML from 'yaml';
import { normalizeAnchorDependencies } from '../lib/schedule.mjs';
import { applyConfigurationTranslationOverrides, applyConfigurationTranslations, configurationTranslationValues, translateStrings } from '../lib/config-translations.mjs';

const setup = await readFile('setup.json', 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const debug = setup.debug || {};
const buildSettings = { animationTime: Number(setup.animationTime) || 400, gracePeriod: Number(setup.gracePeriod) || 31, showYearAnnulus: setup.showYearAnnulus !== false, debug: { enabled: Boolean(debug.enabled), years: Boolean(debug.years), currentDisplayDate: Boolean(debug.currentDisplayDate) } };
const sourceConfig = process.argv[2] || setup.sourceConfig || 'config/annual-wheel.yaml';
const inputPlan = YAML.parse(await readFile(sourceConfig, 'utf8'));
if (!inputPlan?.organisation?.name || !Array.isArray(inputPlan?.items)) {
  throw new Error('Invalid configuration: organisation.name and items are required.');
}
const { plan: config, sources } = await loadPlanCalendars(normalizeAnchorDependencies(inputPlan), sourceConfig, setup.calendarCatalog);
// Calendar files use the same title-translation rules as inline schedules.
const sourceDocument = { display: {}, items: [], schedules: sources };
const fallbackLocale = config.display.locale;
const locales = [...new Set([fallbackLocale, ...config.display.locales])];
const indexTemplate = (await readFile('index.html', 'utf8')).replace('/node_modules/yaml/browser/index.js', '/lib/yaml/index.js');
const localeIndex = (locale, configPath) => indexTemplate
  .replace('<html lang="en">', '<html lang="' + locale + '" data-annual-wheel-locale="' + locale + '">')
  .replace('src="/annual-wheel-config.js"', 'src="' + configPath + '"');
const translation = config.translations?.autoTranslate;
if (translation && translation.provider !== 'deepl') {
  throw new Error('Unsupported automatic translation provider: ' + translation.provider);
}
const planValues = configurationTranslationValues(config);
const sourceValues = configurationTranslationValues(sourceDocument);
const values = [...planValues, ...sourceValues];
const builds = new Map();
if (translation) {
  const authKey = setup.autoTranslation?.deeplAuthKey;
  const cacheDirectory = setup.autoTranslation?.cacheDirectory || 'config/translation-cache';
  await mkdir(cacheDirectory, { recursive: true });
  for (const locale of translation.targets) {
    if (locale === translation.sourceLocale) continue;
    const cachePath = join(cacheDirectory, translation.sourceLocale + '--' + locale + '.json');
    const cached = await readFile(cachePath, 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    const pairs = cached?.strings || [];
    const targets = new Map(pairs.map(pair => [pair.source, pair.target]));
    const missing = [...new Set(values.filter(value => !targets.has(value)))];
    if (missing.length) {
      const translated = await translateStrings({
        values: missing,
      sourceLocale: translation.sourceLocale,
      targetLocale: locale,
      authKey,
      endpoint: setup.autoTranslation?.deeplEndpoint,
      });
      missing.forEach((source, index) => targets.set(source, translated[index]));
      await writeFile(cachePath, JSON.stringify({
        provider: translation.provider,
        sourceLocale: translation.sourceLocale,
        targetLocale: locale,
        strings: [...targets].map(([source, target]) => ({ source, target })),
      }, null, 2) + '\n');
    }
    const overrides = config.translations?.overrides?.[locale] ?? {};
    for (const key of Object.keys(overrides)) {
      if (!targets.has(key) || !values.includes(key)) throw new Error('Unknown translation override: ' + key);
    }
    function localize(document, strings) {
      const translated = applyConfigurationTranslations(document, strings.map(value => targets.get(value)));
      const relevant = Object.fromEntries(Object.entries(overrides).filter(([key]) => strings.includes(key)));
      return applyConfigurationTranslationOverrides(translated, document, relevant);
    }
    builds.set(locale, {
      plan: localize(config, planValues),
      sources: localize(sourceDocument, sourceValues).schedules,
    });
  }
}

const output = 'html';
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'config'), { recursive: true });
await mkdir(join(output, 'lib'), { recursive: true });

await Promise.all([
  writeFile(join(output, 'index.html'), localeIndex(fallbackLocale, '/annual-wheel-config.js')),
  ...locales.map(async locale => {
    await mkdir(join(output, locale), { recursive: true });
    await writeFile(join(output, locale, 'index.html'), localeIndex(locale, '/' + locale + '/annual-wheel-config.js'));
  }),
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

function browserConfig(locale) {
  const build = builds.get(locale) ?? { plan: config, sources };
  return [
    '// Generated from ' + basename(sourceConfig) + '. Do not edit directly.',
    'window.annualWheelConfig = ' + JSON.stringify(build.plan, null, 2) + ';',
    'window.annualWheelCalendarSources = ' + JSON.stringify(build.sources) + ';',
    'window.annualWheelTranslationStrings = ' + JSON.stringify([...new Set(values)]) + ';',
    'window.annualWheelSourceTexts = ' + JSON.stringify(sourceTextChanges(config, build.plan)) + ';',
    'window.annualWheelBuild = ' + JSON.stringify(buildSettings) + ';',
    '',
  ].join('\n');
}
await writeFile(join(output, 'annual-wheel-config.js'), browserConfig(fallbackLocale));

await writeFile(
  join(output, 'annual-wheel-locales.json'),
  JSON.stringify({ fallback: fallbackLocale, locales }, null, 2) + '\n',
);

await Promise.all(locales.map(locale =>
  writeFile(join(output, locale, 'annual-wheel-config.js'), browserConfig(locale))));

await cp('lib/config-graph.js', join(output, 'lib', 'config-graph.js'));
await cp('lib/dependency-drag.js', join(output, 'lib', 'dependency-drag.js'));
await cp('lib/control-icons.js', join(output, 'lib', 'control-icons.js'));
await cp('lib/config-save.js', join(output, 'lib', 'config-save.js'));
await cp('node_modules/yaml/browser', join(output, 'lib', 'yaml'), { recursive: true });
await cp('node_modules/yaml/LICENSE', join(output, 'lib', 'yaml', 'LICENSE'));
await cp('lib/schedule.browser.js', join(output, 'lib', 'schedule.browser.js'));
await cp('lib/i18n.browser.js', join(output, 'lib', 'i18n.browser.js'));
await cp('lib/calendar-export.js', join(output, 'lib', 'calendar-export.js'));
