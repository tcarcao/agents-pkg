#!/usr/bin/env node

/**
 * agents-pkg — Cursor-only marketplace installer.
 * Commands: add-plugin, list, del-plugin (remove one plugin), del-marketplace (remove marketplace), update.
 */

import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { fatal } from './lib/errors.js';
import { runAddPlugin } from './add-plugin.js';
import { runList } from './list.js';
import { runDelPlugin } from './del-plugin.js';
import { runDelMarketplace } from './del-marketplace.js';
import { runUpdate } from './update.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function showBanner(): void {
  console.log('agents-pkg — Cursor marketplace installer');
  console.log('');
  console.log('Usage: agents-pkg <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  add-plugin <source> [plugin-name...]   Install marketplace, optionally only named plugins (--global default, --project for current project only)');
  console.log('  list                                List installed marketplaces and their plugins');
  console.log('  del-plugin <marketplace> <plugin>   Remove one plugin from a marketplace');
  console.log('  del-marketplace <name>              Uninstall entire marketplace');
  console.log('  update                              Re-fetch each installed marketplace and reinstall if version changed');
  console.log('');
  console.log('Examples:');
  console.log('  agents-pkg add-plugin https://gitlab.com/org/ai-kit');
  console.log('  agents-pkg add-plugin https://gitlab.com/org/ai-kit plugin-a plugin-b');
  console.log('  agents-pkg add-plugin ./local-repo --project');
  console.log('  agents-pkg list');
  console.log('  agents-pkg del-plugin ai-engineering-kit ai-kit-backend');
  console.log('  agents-pkg del-marketplace ai-engineering-kit');
  console.log('  agents-pkg update');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    showBanner();
    return;
  }

  const command = argv[0];
  const rest = argv.slice(1);

  switch (command) {
    case 'add-plugin':
      await runAddPlugin(rest);
      break;

    case 'list':
      await runList();
      break;

    case 'del-plugin':
      await runDelPlugin(rest);
      break;

    case 'del-marketplace':
      await runDelMarketplace(rest);
      break;

    case 'update':
      await runUpdate();
      break;

    case '--help':
    case '-h':
      showBanner();
      break;

    case '--version':
    case '-v':
      console.log(getVersion());
      break;

    default:
      fatal('Unknown command: ' + command + '\nRun agents-pkg --help for usage.');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
