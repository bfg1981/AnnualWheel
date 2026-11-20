const endpoint = '/api/config';
const requestOptions = { credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store' };

// Export can visit mapping keys in a different order after a graph redraw.
function configurationSnapshot(plan) {
  return JSON.stringify(plan, (_, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
}

export function createConfigurationSaver(initialPlan, request = fetch) {
  let savedSnapshot = configurationSnapshot(initialPlan);
  let capability;
  let pending = Promise.resolve();

  function failure(response) {
    if ([404, 405, 501].includes(response.status)) {
      capability = 'unsupported';
      return 'unsupported';
    }
    if ([401, 403].includes(response.status)) return 'unauthorized';
    return 'failed';
  }

  async function send(body, snapshot) {
    if (snapshot === savedSnapshot || capability === 'unsupported') return;
    if (capability !== 'supported') {
      const probe = await request(endpoint, { ...requestOptions, method: 'OPTIONS' });
      if (!probe.ok) return failure(probe);
      const methods = (probe.headers.get('Allow') ?? '').split(',').map(token => token.trim().toUpperCase());
      if (!methods.includes('POST')) {
        capability = 'unsupported';
        return 'unsupported';
      }
      capability = 'supported';
    }
    const response = await request(endpoint, {
      ...requestOptions, method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    if (response.status !== 204) return failure(response);
    savedSnapshot = snapshot;
    return 'saved';
  }

  return plan => {
    const body = JSON.stringify(plan);
    const snapshot = configurationSnapshot(plan);
    pending = pending.then(() => send(body, snapshot)).catch(() => 'failed');
    return pending;
  };
}
