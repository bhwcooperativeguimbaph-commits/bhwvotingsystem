'use strict';
// Read-only allowlisted geographic data for Guimba enrollment.
// Only trusted downloaded PSGC hierarchy can be exposed.
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','data','geo-cache');
function load(filename){
 const full=path.join(root,filename);
 const data=JSON.parse(fs.readFileSync(full,'utf8'));
 if(!Array.isArray(data)||data.some(row=>typeof row?.code!=='string'||typeof row?.name!=='string'))
  throw new Error('Invalid geographic reference data');
 return data;
}
function getGuimbaGeography(level,code){
 if(!fs.existsSync(path.join(root,'manifest.json')))throw Object.assign(new Error('Guimba reference data unavailable'),{status:503});
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(!m||!/^\d{6,12}$/.test(m.regionCode)||!/^\d{6,12}$/.test(m.provinceCode)||!/^\d{6,12}$/.test(m.cityCode))
  throw Object.assign(new Error('Invalid reference manifest'),{status:503});
 if(level==='regions'&&code===undefined)return load('regions.json').filter(r=>r.code===m.regionCode);
 if(typeof code!=='string'||!/^\d{6,12}$/.test(code))throw Object.assign(new Error('Invalid location code'),{status:400});
 if(level==='provinces'&&code===m.regionCode)return load(path.join('provinces',m.regionCode+'.json')).filter(r=>r.code===m.provinceCode);
 if(level==='cities'&&code===m.provinceCode)return load(path.join('cities',m.provinceCode+'.json')).filter(r=>r.code===m.cityCode);
 if(level==='barangays'&&code===m.cityCode)return load(path.join('barangays',m.cityCode+'.json'));
 throw Object.assign(new Error('Location outside Guimba registration scope'),{status:400});
}
module.exports={getGuimbaGeography};
