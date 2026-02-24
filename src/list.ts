/**
 * list — List installed marketplaces and their plugins.
 */

import { readLock } from './lib/lock.js';

export async function runList(): Promise<void> {
  const lock = await readLock();
  const entries = Object.entries(lock.marketplaces ?? {});
  if (entries.length === 0) {
    console.log('No marketplaces installed.');
    return;
  }
  for (const [name, entry] of entries) {
    if (!entry) continue;
    const scope = entry.global !== false ? 'global' : 'project';
    console.log(`${name} (v${entry.version}) [${scope}]`);
    console.log(`  source:  ${entry.source}`);
    console.log(`  plugins: ${entry.pluginNames?.length ? entry.pluginNames.join(', ') : '(none)'}`);
    console.log('');
  }
}
