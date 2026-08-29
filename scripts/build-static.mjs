import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import { applyConfigurationTranslations, configurationTranslationValues, translateStrings } from '../lib/config-translations.mjs';

const setup = await readFile('setup.json', 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const debug = setup.debug || {};
const buildSettings = { animationTime: Number(setup.animationTime) || 400, gracePeriod: Number(setup.gracePeriod) || 31, showYearAnnulus: setup.showYearAnnulus !== false, debug: { enabled: Boolean(debug.enabled), years: Boolean(debug.years), currentDisplayDate: Boolean(debug.currentDisplayDate) } };
const sourceConfig = process.argv[2] || setup.sourceConfig || 'config/annual-wheel.yaml';
const config = YAML.parse(await readFile(sourceConfig, 'utf8'));
if (!config?.organisation?.name || !Array.isArray(config?.items)) {
  throw new Error('Invalid configuration: organisation.name and items are required.');
}
const fallbackLocale = config.display.locale;
const locales = [...new Set([fallbackLocale, ...config.display.locales])];
const indexTemplate = await readFile('index.html', 'utf8');
const localeIndex = (locale, configPath) => indexTemplate
  .replace('<html lang="en">', '<html lang="' + locale + '" data-annual-wheel-locale="' + locale + '">')
  .replace('src="/annual-wheel-config.js"', 'src="' + configPath + '"');
const translation = config.translations?.autoTranslate;
if (translation && translation.provider !== 'deepl') {
  throw new Error('Unsupported automatic translation provider: ' + translation.provider);
}
const translatedConfigs = new Map([[fallbackLocale, config]]);
if (translation) {
  const authKey = setup.autoTranslation?.deeplAuthKey;
  const cacheDirectory = setup.autoTranslation?.cacheDirectory || 'config/translation-cache';
  await mkdir(cacheDirectory, { recursive: true });
  for (const locale of translation.targets) {
    if (locale === translation.sourceLocale) continue;
    const values = configurationTranslationValues(config);
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
    translatedConfigs.set(locale, applyConfigurationTranslations(config, values.map(value => targets.get(value))));
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

await writeFile(
  join(output, 'annual-wheel-config.js'),
  `// Generated from ${basename(sourceConfig)}. Do not edit directly.\nwindow.annualWheelConfig = ${JSON.stringify(config, null, 2)};\nwindow.annualWheelBuild = ${JSON.stringify(buildSettings)};\n`,
);

await writeFile(
  join(output, 'annual-wheel-locales.json'),
  JSON.stringify({ fallback: fallbackLocale, locales }, null, 2) + '\n',
);

await Promise.all(locales.map(locale => {
  const translatedConfig = translatedConfigs.get(locale) || config;
  const generated = [
    '// Generated from ' + basename(sourceConfig) + '. Do not edit directly.',
    'window.annualWheelConfig = ' + JSON.stringify(translatedConfig, null, 2) + ';',
    'window.annualWheelBuild = ' + JSON.stringify(buildSettings) + ';',
    '',
  ].join('\n');
  return writeFile(join(output, locale, 'annual-wheel-config.js'), generated);
}));

await cp('lib/schedule.browser.js', join(output, 'lib', 'schedule.browser.js'));
await cp('lib/i18n.browser.js', join(output, 'lib', 'i18n.browser.js'));
