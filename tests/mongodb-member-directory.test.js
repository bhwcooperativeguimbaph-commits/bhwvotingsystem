'use strict';
const assert=require('node:assert/strict');
const {directoryFilter}=require('../database/member-directory');
assert.deepEqual(directoryFilter(''),{});
assert.deepEqual(directoryFilter('    '),{});
const f=directoryFilter('  Ana   Cruz ');
assert.equal(f.$or.length,3);
assert.equal(f.$or[0].fullName.$regex,'Ana Cruz');
assert.equal(f.$or[1].memberId.$options,'i');
assert.equal(f.$or[2].area.$options,'i');
for(const term of ['John.*','(Test)','[group]','a+b','$test','x|y']){
 const filter=directoryFilter(term);
 const literal=filter.$or[0].fullName.$regex;
 const regex=new RegExp(literal,'i');
 assert.ok(regex.test(term),'Literal search does not match original input: '+term);
 assert.ok(!regex.test('unrelated member data'),'Regex metacharacters are not escaped');
}
assert.throws(()=>directoryFilter('x'.repeat(81)),/80 printable/);
assert.throws(()=>directoryFilter('a\nb'),/80 printable/);
assert.throws(()=>directoryFilter({$where:'return true'}),/Invalid member search/);
console.log('PASS: Literal staff member searches escape regex input and reject oversized query terms');
