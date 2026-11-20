import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConfigurationTranslationOverrides, applyConfigurationTranslations, configurationTranslationValues, translateConfiguration, translateStrings } from '../lib/config-translations.mjs';

test('translates configuration text without changing scheduling data', async () => {
  const config = {
    display: { title: 'Stjernekart', description: 'En plan' },
    layers: { optics: { label: 'Optikk' } },
    groups: { atlas: { title: 'Stjerneatlas' } },
    anchors: { observation: { title: 'Observasjon', defaultDate: { month: 9, day: 8 } } },
    items: [{ title: 'Tegn et kart', rule: 'Ferdig i juni', schedule: { kind: 'fixed', month: 6, day: 17 } }],
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
        json: async () => ({ translations: ['Sternkarte', 'Ein Plan', 'Optik', 'Sternatlas', 'Beobachtung', 'Eine Karte zeichnen', 'Fertig im Juni'].map(text => ({ text })) }),
      };
    },
  });

  assert.equal(request.options.headers.Authorization, 'DeepL-Auth-Key test-key');
  assert.match(request.options.body.toString(), /source_lang=NB/);
  assert.match(request.options.body.toString(), /target_lang=DE/);
  assert.equal(translated.display.title, 'Sternkarte');
  assert.equal(translated.items[0].rule, 'Fertig im Juni');
  assert.deepEqual(translated.items[0].schedule, { kind: 'fixed', month: 6, day: 17 });
  assert.equal(config.items[0].title, 'Tegn et kart');
});

test('applies cached translations to the current configuration', () => {
  const config = {
    display: { title: 'Stjernekart', description: 'En plan' },
    layers: {},
    groups: {},
    anchors: {},
    items: [{ title: 'Måling', rule: 'I juni', schedule: { kind: 'fixed', month: 6, day: 17 } }],
  };
  const translated = applyConfigurationTranslations(config, ['Sternkarte', 'Ein Plan', 'Messung', 'Im Juni']);

  assert.deepEqual(configurationTranslationValues(translated), ['Sternkarte', 'Ein Plan', 'Messung', 'Im Juni']);
  assert.deepEqual(translated.items[0].schedule, config.items[0].schedule);
  assert.equal(config.display.title, 'Stjernekart');
});

test('applies locale overrides using the original configuration string', () => {
  const source = {
    display: { title: 'Stjernekart', description: 'En plan' },
    layers: {},
    groups: { atlas: { title: 'Stjerneatlas' } },
    anchors: {},
    items: [{ title: 'Kart', rule: 'I juni', schedule: { kind: 'fixed', month: 6, day: 17 } }],
  };
  const translated = applyConfigurationTranslations(source, ['Mapa estelar', 'Un plan', 'Atlas de estrellas', 'Mapa', 'En junio']);
  const overridden = applyConfigurationTranslationOverrides(translated, source, {
    Stjerneatlas: 'Atlas estelar',
  });

  assert.equal(overridden.groups.atlas.title, 'Atlas estelar');
  assert.equal(overridden.items[0].title, 'Mapa');
  assert.equal(source.groups.atlas.title, 'Stjerneatlas');
});

test('rejects an override for text that is not in the configuration', () => {
  const config = { display: { title: 'Stjernekart' }, layers: {}, groups: {}, anchors: {}, items: [] };
  assert.throws(
    () => applyConfigurationTranslationOverrides(config, config, { Missing: 'Ausente' }),
    /does not match a translatable configuration string/,
  );
});

test('translates only the provided strings', async () => {
  const translated = await translateStrings({
    values: ['Optikk', 'Observasjon'],
    sourceLocale: 'nb-NO',
    targetLocale: 'de-DE',
    authKey: 'test-key',
    fetchImplementation: async () => ({
      ok: true,
      json: async () => ({ translations: [{ text: 'Optik' }, { text: 'Beobachtung' }] }),
    }),
  });

  assert.deepEqual(translated, ['Optik', 'Beobachtung']);
});
