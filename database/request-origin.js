'use strict';
// Browser requests changing state must prove exact same-origin intent.
// SameSite cookies are defense-in-depth, not a replacement for CSRF defenses.
const SAFE=new Set(['GET','HEAD','OPTIONS']);
function isAllowedOrigin(req){
 if(SAFE.has(String(req.method||'').toUpperCase()))return true;
 const origin=req.get('origin');
 const fetchSite=req.get('sec-fetch-site');
 if(fetchSite&&!['same-origin','none'].includes(fetchSite))return false;
 if(typeof origin!=='string'||origin==='null'||origin.includes(',')||origin.length>256)return false;
 const host=req.get('host');
 if(typeof host!=='string'||!host||host.includes(',')||host.includes('/')||host.length>255)return false;
 if(!['http','https'].includes(req.protocol))return false;
 try{
  const supplied=new URL(origin);
  const expected=new URL(req.protocol+'://'+host);
  return supplied.origin===expected.origin&&origin===supplied.origin;
 }catch(_){return false}
}
function originCheck(req,res,next){
 if(!isAllowedOrigin(req))return res.status(403).json({
  success:false,message:'Same-origin request required'
 });
 return next();
}
module.exports={isAllowedOrigin,originCheck};
