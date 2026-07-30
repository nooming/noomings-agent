#!/usr/bin/env node
/** Unified regression entry: node tests/regression/check.js [--suite contract|generate|strategy|export] [--filter name] */
const { runAll } = require('./suites/index');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--suite' && argv[i + 1]) {
      options.suite = argv[++i];
    } else if (argv[i] === '--filter' && argv[i + 1]) {
      options.filter = argv[++i];
    }
  }
  return options;
}

runAll(parseArgs(process.argv.slice(2))).catch(err => {
  console.error(err);
  process.exit(1);
});
