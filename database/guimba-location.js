'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..','data','geo-cache');
function list(folder,file){
 const p=path.join(ROOT,folder,file);
 if(!fs.existsSync(p))return null;
 const rows=JSON.parse(fs.readFileSync(p,'utf8'));
 if(!Array.isArray(rows))throw new Error('Invalid PSGC reference data');
 return rows;
}
function matches(rows,code,name){
 return Array.isArray(rows)&&rows.some(r=>r.code===code&&r.name.toLowerCase()===name.toLowerCase());
}
function verifyGuimbaLocation(loc){
 if(!fs.existsSync(path.join(ROOT,'manifest.json')))return false;
 if(!loc||loc.country!=='Philippines')return false;
 for(const key of ['regionCode','provinceCode','cityCode','barangayCode']){
  if(typeof loc[key]!=='string'||!/^[0-9]{6,12}$/.test(loc[key]))return false;
 }
 try{
  if(!matches(list('','regions.json'),loc.regionCode,'Central Luzon'))return false;
  if(!matches(list('provinces',loc.regionCode+'.json'),loc.provinceCode,'Nueva Ecija'))return false;
  if(!matches(list('cities',loc.provinceCode+'.json'),loc.cityCode,'Guimba'))return false;
  const barangays=list('barangays',loc.cityCode+'.json');
  return Array.isArray(barangays)&&barangays.some(row=>row.code===loc.barangayCode);
 }catch(_){return false}
}
module.exports={verifyGuimbaLocation};
