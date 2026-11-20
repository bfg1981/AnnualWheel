const deepLCode = locale => locale.split('-')[0].toUpperCase();

const translatableFields = config => [
  [config.display, 'title'],
  [config.display, 'description'],
  [config, 'initialRule'],
  ...Object.values(config.layers || {}).map(layer => [layer, 'label']),
  ...Object.values(config.groups || {}).flatMap(group => [[group, 'title'], [group.defaults, 'rule'], [group.defaults?.schedule, 'rule']]),
  ...Object.values(config.constraints || {}).map(constraint => [constraint, 'rule']),
  ...Object.values(config.schedules || {}).map(schedule => [schedule, 'rule']),
  ...Object.values(config.schedules || {}).flatMap(schedule =>
    [schedule, ...(schedule.fixed ?? []), ...(schedule.weekdays ?? []), ...(schedule.easterOffsets ?? []), ...(schedule.ranges ?? [])]
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => [entry, 'title'])),
  ...Object.values(config.anchors || {}).flatMap(anchor => [[anchor, 'title'], [anchor, 'rule'], [anchor.defaultDate, 'rule'], [anchor.dependency?.source, 'rule']]),
  ...config.items.flatMap(item => [[item, 'title'], [item, 'rule'], [item.schedule, 'rule']]),
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

export const applyConfigurationTranslationOverrides = (config, sourceConfig, overrides = {}) => {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error('Translation overrides must map source strings to replacement strings.');
  }
  const overridden = structuredClone(config);
  const sourceFields = translatableFields(sourceConfig).filter(([object, key]) => object?.[key]);
  const targetFields = translatableFields(overridden).filter(([object, key]) => object?.[key]);
  const availableSources = new Set(sourceFields.map(([object, key]) => object[key]));
  Object.keys(overrides).forEach(source => {
    if (!availableSources.has(source)) {
      throw new Error('Translation override does not match a translatable configuration string: ' + source);
    }
    if (typeof overrides[source] !== 'string') {
      throw new Error('Translation override must be a string: ' + source);
    }
  });
  sourceFields.forEach(([sourceObject, sourceKey], index) => {
    const source = sourceObject[sourceKey];
    if (Object.hasOwn(overrides, source)) {
      const [targetObject, targetKey] = targetFields[index];
      targetObject[targetKey] = overrides[source];
    }
  });
  return overridden;
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
