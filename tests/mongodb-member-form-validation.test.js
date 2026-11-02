'use strict';
const assert=require('node:assert/strict');
const {isAdultBirthdate,validateMember}=require('../database/members');
const at=new Date('2026-11-02T12:00:00Z');
assert.equal(isAdultBirthdate('2008-11-02',at),true,'Exact 18th birthday is allowed');
assert.equal(isAdultBirthdate('2008-11-03',at),false,'One day below 18 is denied');
assert.equal(isAdultBirthdate('2008-11-02',new Date('2026-11-01T16:05:00Z')),true,
 'Philippine midnight must use November 2 even when server UTC is November 1');
assert.equal(isAdultBirthdate('2008-11-03',new Date('2026-11-01T16:05:00Z')),false);
assert.equal(isAdultBirthdate('2007-09-17',at),true);
assert.equal(isAdultBirthdate('2008-02-30',at),false);
assert.equal(isAdultBirthdate('2026-11-03',at),false);
assert.equal(isAdultBirthdate('',at),false);
assert.equal(isAdultBirthdate('2008-02-29',new Date('2026-02-28T12:00:00Z')),false);
assert.equal(isAdultBirthdate('2008-02-29',new Date('2026-03-01T12:00:00Z')),true);
const base={firstName:'  Maria  ',middleName:' ',lastName:' Dela Cruz ',area:'Area 1',
 address:'Sitio 1, Street 2',birthdate:'2008-11-02',gender:'Female',
 location:{country:'Philippines',province:'Nueva Ecija',city:'Guimba',
  regionCode:'0300000000',provinceCode:'0304900000',cityCode:'0304911000',barangayCode:'0304911001'}};
const result=validateMember(base,{now:at});
assert.equal(result.fullName,'Maria Dela Cruz');
assert.equal(result.firstName,'Maria');assert.equal(result.lastName,'Dela Cruz');
assert.equal(result.middleName,null);
assert.equal(result.address,'Sitio 1, Street 2');
assert.equal(result.birthdate,'2008-11-02');
assert.equal(validateMember({...base,middleName:' S. '},{now:at}).fullName,'Maria S. Dela Cruz');
for(const [override,pattern] of [
 [{firstName:'  '},/First name/],[{lastName:''},/First name/],
 [{birthdate:'2008-11-03'},/18 years/],[{birthdate:'2011-01-01'},/18 years/],
 [{birthdate:'2008-02-30'},/18 years/],[{address:' '},/address/],
 [{location:{...base.location,barangayCode:''}},/barangay/]
])assert.throws(()=>validateMember({...base,...override},{now:at}),pattern);
console.log('PASS: Required first/last, optional middle, full address, 18th-birthday and Guimba selection');
