import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfigurationSaver } from '../lib/config-save.js';

const supported = () => new Response(null, { status: 204, headers: { Allow: 'OPTIONS, POST' } });
const saved = () => new Response(null, { status: 204 });

test('unchanged and reverted values skip the probe, and a saved plan skips later writes', async () => {
  const initial = { version: 1, display: { title: 'Annual plan' }, items: ['a', 'b'] };
  const methods = [];
  const save = createConfigurationSaver(initial, async (_, { method }) => {
    methods.push(method);
    return method === 'OPTIONS' ? supported() : saved();
  });
  const copy = { items: [...initial.items], display: { ...initial.display }, version: 1 };
  assert.equal(await save(copy), undefined);
  copy.display.title = 'Draft';
  copy.display.title = initial.display.title;
  assert.equal(await save(copy), undefined);
  assert.deepEqual(methods, []);

  copy.items.reverse();
  assert.deepEqual(await Promise.all([save(copy), save(copy)]), ['saved', undefined]);
  assert.deepEqual(methods, ['OPTIONS', 'POST']);
  assert.equal(await save(initial), 'saved');
  assert.deepEqual(methods, ['OPTIONS', 'POST', 'POST']);
});

test('static deployments warn once and never receive a configuration', async () => {
  for (const status of [200, 404, 405, 501]) {
    const calls = [];
    const save = createConfigurationSaver({ version: 1 }, async (url, options) => {
      calls.push(options.method);
      assert.equal(url, '/api/config');
      assert.equal(options.body, undefined);
      return new Response(null, { status });
    });
    assert.deepEqual(await Promise.all([save({}), save({})]), ['unsupported', undefined]);
    assert.deepEqual(calls, ['OPTIONS']);
  }
});

test('edit-mode preflight sends no plan and shares its result with later confirmations', async () => {
  for (const available of [true, false]) {
    const calls = [];
    const save = createConfigurationSaver({ title: 'Before' }, async (_, options) => {
      calls.push(options);
      if (options.method === 'POST') return saved();
      return available ? supported() : new Response(null, { status: 405 });
    });
    const result = available ? 'supported' : 'unsupported';
    assert.deepEqual(await Promise.all([save.preflight(), save.preflight(), save({ title: 'Before' })]),
      [result, result, undefined]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'OPTIONS');
    assert.equal(calls[0].body, undefined);

    assert.equal(await save({ title: 'After' }), available ? 'saved' : undefined);
    assert.deepEqual(calls.map(call => call.method), available ? ['OPTIONS', 'POST'] : ['OPTIONS']);
  }
});

test('a temporary preflight failure on entry can be retried when saving', async () => {
  const methods = [];
  const save = createConfigurationSaver({}, async (_, { method }) => {
    methods.push(method);
    if (methods.length === 1) throw new Error('Offline');
    return method === 'OPTIONS' ? supported() : saved();
  });
  assert.equal(await save.preflight(), 'failed');
  assert.equal(await save({ changed: true }), 'saved');
  assert.deepEqual(methods, ['OPTIONS', 'OPTIONS', 'POST']);
});

test('rapid confirmations post distinct snapshots in order after one preflight', async () => {
  const calls = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let started;
  const firstPost = new Promise(resolve => { started = resolve; });
  const save = createConfigurationSaver({ version: 1 }, async (url, options) => {
    calls.push(options);
    assert.equal(url, '/api/config');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    if (options.method === 'OPTIONS') return supported();
    assert.equal(options.headers['Content-Type'], 'application/json');
    if (calls.length === 2) {
      started();
      await held;
    }
    return saved();
  });
  const plan = { display: { title: 'First' } };
  const first = save(plan);
  plan.display.title = 'Second';
  const second = save(plan);
  await firstPost;
  assert.deepEqual(calls.map(call => call.method), ['OPTIONS', 'POST']);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['saved', 'saved']);
  assert.deepEqual(calls.slice(1).map(call => JSON.parse(call.body).display.title), ['First', 'Second']);
});

test('authorization and temporary failures allow another confirmation to retry', async () => {
  const replies = [
    () => new Response(null, { status: 401 }), supported, () => new Response(null, { status: 403 }),
    () => { throw new Error('Offline'); }, () => new Response('Login page'), saved,
  ];
  const methods = [];
  const save = createConfigurationSaver({ version: 1 }, async (_, { method }) => {
    methods.push(method);
    return replies.shift()();
  });
  for (const outcome of ['unauthorized', 'unauthorized', 'failed', 'failed', 'saved']) {
    assert.equal(await save({}), outcome);
  }
  assert.deepEqual(methods, ['OPTIONS', 'OPTIONS', 'POST', 'POST', 'POST', 'POST']);
});
