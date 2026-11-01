'use strict';
const assert=require('node:assert/strict');
const packageFile=require('../package.json');
assert.equal(packageFile.scripts.start,'node mongo-auth-preview.js');
assert.equal(packageFile.scripts['start:legacy-mysql'],'node server.js');
assert.equal(packageFile.main,'mongo-auth-preview.js');
console.log('PASS: Production default starts MongoDB and MySQL remains legacy-only');
