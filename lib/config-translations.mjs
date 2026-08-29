const deepLCode = locale => locale.split('-')[0].toUpperCase();

const translatableFields = config => [
  [config.display, 'title'],
  [config.display, 'description'],
  ...Object.values(config.layers || {}).map(layer => [layer, 'label']),
  ...Object.values(config.groups || {}).map(group => [group, 'title']),
  ...Object.values(config.anchors || {}).map(anchor => [anchor, 'title']),
  ...config.items.flatMap(item => [[item, 'title'], [item, 'rule']]),
];

export const configurationTranslationValues = config => translatableFields(config)
  .filter(([object, key]) => object?.[key])
  .map(([object, key]) => object[key]);

export const applyConfigurationTranslations = (config, values) => {
  const translated = structuredClone(config);
  const fields = translatableFields(translated).filter(([object, key]) => object?.[key]);
  if (values.length !== fields.length) {
    throw new Error('Cached translation does not contain every requested field.');
  }
  fields.forEach(([object, key], index) => {
    object[key] = values[index];
  });
  return translated;
};

export const translateStrings = async ({
  values,
  sourceLocale,
  targetLocale,
  authKey,
  endpoint = 'https://api-free.deepl.com/v2/translate',
  fetchImplementation = fetch,
}) => {
  const response = await fetchImplementation(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'DeepL-Auth-Key ' + authKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams([
      ['source_lang', deepLCode(sourceLocale)],
      ['target_lang', deepLCode(targetLocale)],
      ...values.map(value => ['text', value]),
    ]),
  });
  if (!response.ok) throw new Error('DeepL translation failed: ' + response.status + ' ' + response.statusText);
  const body = await response.json();
  if (!Array.isArray(body.translations) || body.translations.length !== values.length) {
    throw new Error('DeepL translation response did not contain every requested field.');
  }
  return body.translations.map(translation => translation.text);
};

export const translateConfiguration = async ({ config, ...options }) => {
  const values = configurationTranslationValues(config);
  return applyConfigurationTranslations(config, await translateStrings({ ...options, values }));
};
