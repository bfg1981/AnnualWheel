import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConfigurationTranslations, configurationTranslationValues, translateConfiguration, translateStrings } from '../lib/config-translations.mjs';

test('translates configuration text without changing scheduling data', async () => {
  const config = {
    display: { title: 'Årshjul', description: 'En plan' },
    layers: { board: { label: 'Styre' } },
    groups: { closure: { title: 'Årsavslutning' } },
    anchors: { assembly: { title: 'Generalforsamling', defaultDate: { month: 3, day: 31 } } },
    items: [{ title: 'Styrelederens beretning', rule: 'Ferdig i januar', schedule: { kind: 'fixed', month: 1, day: 31 } }],
  };
  let request;
  const translated = await translateConfiguration({
    config,
    sourceLocale: 'nb-NO',
    targetLocale: 'de-DE',
    authKey: 'test-key',
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ translations: ['Jahresrad', 'Ein Plan', 'Vorstand', 'Jahresabschluss', 'Generalversammlung', 'Bericht des Vorstandsvorsitzenden', 'Fertig im Januar'].map(text => ({ text })) }),
      };
    },
  });

  assert.equal(request.options.headers.Authorization, 'DeepL-Auth-Key test-key');
  assert.match(request.options.body.toString(), /source_lang=NB/);
  assert.match(request.options.body.toString(), /target_lang=DE/);
  assert.equal(translated.display.title, 'Jahresrad');
  assert.equal(translated.items[0].rule, 'Fertig im Januar');
  assert.deepEqual(translated.items[0].schedule, { kind: 'fixed', month: 1, day: 31 });
  assert.equal(config.items[0].title, 'Styrelederens beretning');
});

test('applies cached translations to the current configuration', () => {
  const config = {
    display: { title: 'Årshjul', description: 'En plan' },
    layers: {},
    groups: {},
    anchors: {},
    items: [{ title: 'Møte', rule: 'I januar', schedule: { kind: 'fixed', month: 1, day: 31 } }],
  };
  const translated = applyConfigurationTranslations(config, ['Jahresrad', 'Ein Plan', 'Sitzung', 'Im Januar']);

  assert.deepEqual(configurationTranslationValues(translated), ['Jahresrad', 'Ein Plan', 'Sitzung', 'Im Januar']);
  assert.deepEqual(translated.items[0].schedule, config.items[0].schedule);
  assert.equal(config.display.title, 'Årshjul');
});

test('translates only the provided strings', async () => {
  const translated = await translateStrings({
    values: ['Styre', 'Generalforsamling'],
    sourceLocale: 'nb-NO',
    targetLocale: 'de-DE',
    authKey: 'test-key',
    fetchImplementation: async () => ({
      ok: true,
      json: async () => ({ translations: [{ text: 'Vorstand' }, { text: 'Mitgliederversammlung' }] }),
    }),
  });

  assert.deepEqual(translated, ['Vorstand', 'Mitgliederversammlung']);
});
