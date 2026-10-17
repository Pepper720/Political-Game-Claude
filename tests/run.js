#!/usr/bin/env node
/* Run all engine tests: `node tests/run.js [name-filter]`. No installs required. */
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('./harness');

for (const f of fs.readdirSync(__dirname).sort()) {
  if (f.endsWith('.test.js')) require(path.join(__dirname, f));
}
h.run(process.argv[2]).then((fail) => process.exit(fail ? 1 : 0));
