'use strict';
const assert=require('node:assert/strict');
const {isAllowedOrigin,originCheck}=require('../database/request-origin');

function request({method='POST',protocol='https',host='secongvoting.onrender.com',
 origin='https://secongvoting.onrender.com',site='same-origin'}={}){
 const headers={host,origin,'sec-fetch-site':site};
 return {method,protocol,get(key){return headers[key.toLowerCase()]}};
}
const good=request();
assert.equal(isAllowedOrigin(good),true);
assert.equal(isAllowedOrigin(request({method:'PATCH'})),true);
assert.equal(isAllowedOrigin(request({method:'DELETE'})),true);
assert.equal(isAllowedOrigin(request({method:'GET',origin:null,site:null})),true);
assert.equal(isAllowedOrigin(request({method:'HEAD',origin:null,site:null})),true);
assert.equal(isAllowedOrigin(request({origin:null})),false,'Missing Origin must fail closed');
assert.equal(isAllowedOrigin(request({origin:'null'})),false);
assert.equal(isAllowedOrigin(request({origin:'https://attacker.invalid'})),false);
assert.equal(isAllowedOrigin(request({origin:'https://secongvoting.onrender.com.evil.test'})),false);
assert.equal(isAllowedOrigin(request({origin:'http://secongvoting.onrender.com'})),false);
assert.equal(isAllowedOrigin(request({site:'cross-site'})),false);
assert.equal(isAllowedOrigin(request({site:'same-site'})),false,'Sibling domains do not count as same origin');
assert.equal(isAllowedOrigin(request({host:'secongvoting.onrender.com,other.test'})),false);
assert.equal(isAllowedOrigin(request({host:'secongvoting.onrender.com/path'})),false);
assert.equal(isAllowedOrigin(request({origin:'https://secongvoting.onrender.com,https://evil.test'})),false);
assert.equal(isAllowedOrigin(request({origin:'https://secongvoting.onrender.com',site:null})),true,
 'Older same-origin browsers without Fetch Metadata are supported if Origin matches');
let nextCalled=false,denied=null;
const next=()=>{nextCalled=true};
const res={status(code){denied=code;return this},json(data){assert.equal(data.success,false);return this}};
originCheck(good,res,next);assert.equal(nextCalled,true);
nextCalled=false;originCheck(request({origin:null}),res,next);
assert.equal(nextCalled,false);assert.equal(denied,403);
console.log('PASS: Unsafe requests require exact same-origin Origin and safe Fetch Metadata');
