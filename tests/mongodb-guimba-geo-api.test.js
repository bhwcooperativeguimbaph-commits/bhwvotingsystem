'use strict';
const assert=require('node:assert/strict');
const {getGuimbaGeography}=require('../database/guimba-geo-api');
const m=require('../data/geo-cache/manifest.json');
function sameCode(rows,code){assert.equal(rows.length,1);assert.equal(rows[0].code,code);}
sameCode(getGuimbaGeography('regions'),m.regionCode);
sameCode(getGuimbaGeography('provinces',m.regionCode),m.provinceCode);
sameCode(getGuimbaGeography('cities',m.provinceCode),m.cityCode);
const barangays=getGuimbaGeography('barangays',m.cityCode);
assert.equal(barangays.length,m.barangays);
assert.ok(barangays.every(x=>/^\d{6,12}$/.test(x.code)&&x.name));
for(const bad of [['provinces','123456'],['cities','0000000000'],['barangays','../secret'],['unknown',m.cityCode]]){
 assert.throws(()=>getGuimbaGeography(...bad),/Guimba|Invalid/);
}
console.log('PASS: PSGC dropdown hierarchy and Guimba-only restrictions');
