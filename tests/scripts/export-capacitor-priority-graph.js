/**
 * Thin wrapper for capacitor-era-ch1.
 * Prefer: npm run export-priority-graphs -- --id capacitor-era-ch1
 */
if (!process.argv.includes('--id')) {
  process.argv.push('--id', 'capacitor-era-ch1');
}
require('./export-priority-graphs.js');
