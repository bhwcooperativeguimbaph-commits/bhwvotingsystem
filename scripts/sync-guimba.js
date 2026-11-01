'use strict';
// Minimal trusted PSGC hierarchy for Guimba registration. Never fabricate location codes.
const fs=require('node:fs/promises'),path=require('node:path');
const ROOT=path.join(__dirname,'..','data','geo-cache');
const BASE='https://psgc.cloud/api/v2';
async function fetchRows(route){
 const r=await fetch(BASE+route,{headers:{accept:'application/json'},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('PSGC API rejected '+route+' (HTTP '+r.status+')');
 const raw=await r.json(),rows=Array.isArray(raw)?raw:raw?.data;
 if(!Array.isArray(rows))throw Error('Invalid PSGC API response');
 return rows.map(x=>({code:String(x.code),name:String(x.name)})).filter(x=>/^\d{6,12}$/.test(x.code)&&x.name!=='undefined');
}
function single(rows,name){const found=rows.filter(x=>x.name.toLowerCase()===name.toLowerCase());if(found.length!==1)throw Error('Expected exactly one '+name);return found[0]}
async function save(folder,filename,rows){const dir=path.join(ROOT,folder);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,filename),JSON.stringify(rows,null,2)+'\n')}
async function main(){
 const regions=await fetchRows('/regions'),region=single(regions,'Central Luzon');
 const provinces=await fetchRows('/regions/'+region.code+'/provinces'),province=single(provinces,'Nueva Ecija');
 const cities=await fetchRows('/provinces/'+province.code+'/cities-municipalities'),city=single(cities,'Guimba');
 const barangays=await fetchRows('/cities-municipalities/'+city.code+'/barangays');
 if(barangays.length<1)throw Error('Guimba barangay data unavailable');
 await save('','regions.json',regions);
 await save('provinces',region.code+'.json',provinces);
 await save('cities',province.code+'.json',cities);
 await save('barangays',city.code+'.json',barangays);
 await fs.writeFile(path.join(ROOT,'manifest.json'),JSON.stringify({scope:'Guimba, Nueva Ecija',source:BASE,regionCode:region.code,provinceCode:province.code,cityCode:city.code,barangays:barangays.length,downloadedAt:new Date().toISOString()},null,2)+'\n');
 console.log('PASS: Verified Guimba hierarchy saved; '+barangays.length+' barangays');
}
main().catch(e=>{console.error('Guimba sync failed:',e.message);process.exitCode=1});
