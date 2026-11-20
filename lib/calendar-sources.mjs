import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';

async function readYaml(path) {
  return YAML.parse(await readFile(path, 'utf8'));
}

function sourcePath(directory, path) {
  if (typeof path !== 'string' || !path || /^(?:\/|[a-z]+:)|(?:^|\/)\.\.(?:\/|$)/i.test(path)) {
    throw new Error(`Calendar source must be a relative file: ${path}`);
  }
  return resolve(directory, path);
}

// The catalog owns source locations. Only the referenced calendars are bundled.
export async function loadPlanCalendars(config, planPath, catalogPath = 'calendars.yaml') {
  const schedules = Object.entries(config.schedules ?? {});
  if (!schedules.some(([, s]) => s.calendar || s.source)) return { plan: config, sources: {} };
  const directory = dirname(planPath);
  const catalogFile = resolve(directory, catalogPath);
  const catalog = await readYaml(catalogFile).catch(error => {
    if (error.code === 'ENOENT' && !schedules.some(([, s]) => s.calendar)) return {};
    throw error;
  });
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('Invalid calendar catalog');
  const plan = structuredClone(config);
  const sources = Object.create(null);
  const files = new Map();
  for (const [id, schedule] of schedules) {
    if (!schedule.calendar && !schedule.source) continue;
    let ref = schedule.calendar;
    if (ref && !Object.hasOwn(catalog, ref)) throw new Error(`Unknown calendar reference: ${ref}`);
    let file;
    if (schedule.source) {
      // Older plans stored the path directly. Prefer its registered name on export.
      file = sourcePath(directory, schedule.source);
      ref ??= Object.keys(catalog).find(key => sourcePath(dirname(catalogFile), catalog[key].source) === file) ?? id;
      delete plan.schedules[id].source;
      plan.schedules[id].calendar = ref;
    }
    const definition = Object.hasOwn(catalog, ref) ? catalog[ref] : {};
    const registered = definition.source && sourcePath(dirname(catalogFile), definition.source);
    if (file && registered && file !== registered) throw new Error(`Conflicting sources for calendar: ${ref}`);
    file ??= registered;
    if (!file) throw new Error(`Missing source for calendar: ${ref}`);
    if (files.has(ref)) {
      if (files.get(ref) !== file) throw new Error(`Conflicting sources for calendar: ${ref}`);
      continue;
    }
    files.set(ref, file);
    const data = await readYaml(file);
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.source || data.calendar) {
      throw new Error(`Invalid calendar data: ${ref}`);
    }
    sources[ref] = { ...data, title: definition.title ?? data.title };
  }
  return { plan, sources };
}
