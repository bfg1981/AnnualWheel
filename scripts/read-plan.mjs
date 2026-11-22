import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function readPlanFile(selected) {
  const filename = selected || 'config/annual-wheel.json';
  const path = resolve(projectRoot, filename);
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (!selected && error.code === 'ENOENT') return readPlanFile('config/annual-wheel.yaml');
    throw error;
  }
  const legacyYaml = ['.yaml', '.yml'].includes(extname(path).toLowerCase());
  return { filename, path, document: legacyYaml ? parseYaml(source) : JSON.parse(source) };
}
