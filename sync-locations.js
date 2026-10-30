/**
 * One-time download of complete Philippine location hierarchy (PSGC Cloud API v2).
 * Run on a computer with internet: node sync-locations.js
 * Can be safely re-run; previously downloaded files are reused.
 * WARNING: a full national dataset may take several minutes and ~1,700 calls.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const ROOT = path.join(__dirname, 'data', 'geo-cache');
const URL_ROOT = 'https://psgc.cloud/api/v2';
const CONCURRENCY = 5;
// PSGC sometimes returns no barangays for this specific city/municipality.
// Keep an explicit empty file and report it rather than failing the whole sync.
const ALLOWED_EMPTY_BARANGAY_CODES = new Set(['1380600000']);

function wait(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }
function requestJson(route) {
    return new Promise((resolve, reject) => {
        const req = https.get(URL_ROOT+route, {timeout:25000,headers:{Accept:'application/json'}}, resp => {
            if (resp.statusCode !== 200) {
                resp.resume();return reject(new Error(`HTTP ${resp.statusCode} for ${route}`));
            }
            const chunks=[];let size=0;
            resp.on('data',chunk=>{size+=chunk.length;if(size>25000000) resp.destroy(new Error('Response too large'));else chunks.push(chunk);});
            resp.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}});
            resp.on('error',reject);
        });
        req.on('timeout',()=>req.destroy(new Error('Connection timed out')));
        req.on('error',reject);
    });
}
function target(key){return path.join(ROOT,...key.split('/'))+'.json';}
let fresh=0,reused=0;
const skippedEmptyBarangays = new Set();
async function save(key,route){
    const dest=target(key);
    if(fs.existsSync(dest)) {
        try { const found=JSON.parse(fs.readFileSync(dest,'utf8'));
            if(Array.isArray(found) && (found.length || key.startsWith('provinces/') || (key.startsWith('barangays/') && ALLOWED_EMPTY_BARANGAY_CODES.has(key.slice('barangays/'.length))))) {
                if (!found.length && key.startsWith('barangays/')) skippedEmptyBarangays.add(key.slice('barangays/'.length));
                reused++;return found;
            }
        } catch(_){}
    }
    let lastError;
    for(let attempt=1;attempt<=5;attempt++){
        try {
            const raw=await requestJson(route);
            const data=Array.isArray(raw)?raw:raw?.data;
            if(!Array.isArray(data))throw new Error(`Unexpected JSON for ${route}`);
            const rows=data.map(item=>({code:String(item.code),name:String(item.name)}));
            if(!rows.length && !key.startsWith('provinces/')) {
                const cityCode = key.startsWith('barangays/') ? key.slice('barangays/'.length) : '';
                if (!ALLOWED_EMPTY_BARANGAY_CODES.has(cityCode)) throw new Error(`Empty list for ${route}`);
                skippedEmptyBarangays.add(cityCode);
                console.warn(`WARNING: ${route} returned no barangays; saving empty list for this known exception.`);
            }
            fs.mkdirSync(path.dirname(dest),{recursive:true});
            fs.writeFileSync(dest+'.tmp',JSON.stringify(rows));
            fs.renameSync(dest+'.tmp',dest);
            fresh++;
            return rows;
        }catch(e){lastError=e;await wait(500*attempt*attempt);}
    }
    throw new Error(`Failed ${route}: ${lastError.message}`);
}
async function concurrent(items,task){
    let cursor=0,done=0;const failed=[];const results=new Array(items.length);
    await Promise.all(Array.from({length:Math.min(CONCURRENCY,items.length)},async()=>{
        while(true){const ix=cursor++;if(ix>=items.length)break;
            try{results[ix]=await task(items[ix],ix);}catch(e){failed.push(e.message);}
            done++;if(done%75===0||done===items.length) console.log(`   ${done}/${items.length} completed (${failed.length} errors)`);
        }
    }));
    if(failed.length)throw Error(failed.slice(0,8).join('\n')+(failed.length>8?`\nAnd ${failed.length-8} more failures` : ''));
    return results;
}
(async()=>{
    fs.mkdirSync(ROOT,{recursive:true});
    fs.rmSync(path.join(ROOT,'manifest.json'),{force:true});
    console.log('Downloading Philippine geographic reference data from PSGC Cloud...');
    const regions=await save('regions','/regions');
    console.log(`Regions: ${regions.length}`);
    const regionData=await concurrent(regions,async region=>{
        const [provinces,regionCities]=await Promise.all([
            save(`provinces/${region.code}`,`/regions/${region.code}/provinces`),
            save(`regioncities/${region.code}`,`/regions/${region.code}/cities-municipalities`)
        ]);
        return {region,provinces,regionCities};
    });
    const provinces=regionData.flatMap(r=>r.provinces);
    const citiesByProvince=await concurrent(provinces,province=>save(`cities/${province.code}`,`/provinces/${province.code}/cities-municipalities`));
    const allCities=new Map();
    for(const city of regionData.flatMap(r=>r.regionCities))allCities.set(city.code,city);
    for(const city of citiesByProvince.flat())allCities.set(city.code,city);
    console.log(`Provinces: ${provinces.length}; cities/municipalities: ${allCities.size}`);
    const barangaysByCity=await concurrent([...allCities.values()], city=>save(`barangays/${city.code}`,`/cities-municipalities/${city.code}/barangays`));
    const nBarangays=barangaysByCity.reduce((n,rows)=>n+rows.length,0);
    if (regions.length<15 || provinces.length<70 || allCities.size<1000 || nBarangays<35000)
        throw new Error(`Dataset appears incomplete: ${regions.length} regions, ${provinces.length} provinces, ${allCities.size} cities, ${nBarangays} barangays`);
    fs.writeFileSync(path.join(ROOT,'manifest.json'),JSON.stringify({source:URL_ROOT,downloadedAt:new Date().toISOString(),regions:regions.length,provinces:provinces.length,cities:allCities.size,barangays:nBarangays,emptyBarangayCityCodes:[...skippedEmptyBarangays]},null,2));
    console.log(`SUCCESS: ${nBarangays} barangays saved. New requests: ${fresh}; reused: ${reused}.`);
    if (skippedEmptyBarangays.size) console.warn(`WARNING: ${[...skippedEmptyBarangays].join(', ')} returned no barangays. Those specific dropdowns will be empty until corrected data is available.`);
    console.log('Copy the complete data/geo-cache folder to the other laptop.');
})().catch(err=>{console.error('\nDOWNLOAD INCOMPLETE. Re-run to resume.\n'+err.message);process.exitCode=1;});
