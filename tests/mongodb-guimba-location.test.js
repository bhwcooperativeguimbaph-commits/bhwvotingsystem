'use strict';
const assert=require('node:assert/strict');
const {verifyGuimbaLocation}=require('../database/guimba-location');
assert.equal(verifyGuimbaLocation(null),false);
assert.equal(verifyGuimbaLocation({country:'Philippines',regionCode:'123'}),false);
console.log('PASS: Guimba location validation fails closed without trusted PSGC hierarchy');
