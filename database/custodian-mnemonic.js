'use strict';
// BIP-39 12-word mnemonic *encoding* of random 128-bit bytes (4-bit checksum).
// Used ONLY for BHW 2-of-2 custodian key shares, never for wallet creation.
// Wordlist: bitcoin/bips bip-0039/english.txt (MIT licensed).
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const WORDS=Object.freeze(fs.readFileSync(path.join(__dirname,'bip39-english.txt'),'utf8').trim().split(/\r?\n/));
if(WORDS.length!==2048||new Set(WORDS).size!==2048)throw Error('Custodian mnemonic dictionary invalid');
const INDEX=new Map(WORDS.map((w,i)=>[w,i]));
function toBits(buffer){return [...buffer].map(b=>b.toString(2).padStart(8,'0')).join('')}
function entropyToWords(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length!==16)throw new TypeError('128-bit random share required');
 const checksum=toBits(crypto.createHash('sha256').update(bytes).digest()).slice(0,4);
 const bits=toBits(bytes)+checksum;
 return Array.from({length:12},(_,i)=>WORDS[parseInt(bits.slice(i*11,i*11+11),2)]).join(' ');
}
function normalizeWords(value){
 if(typeof value!=='string')throw new TypeError('Custodian phrase required');
 const words=value.trim().toLowerCase().split(/\s+/);
 if(words.length!==12||words.some(word=>!INDEX.has(word)))
  throw new Error('Invalid twelve-word custodian phrase');
 return words.join(' ');
}
function wordsToEntropy(value){
 const words=normalizeWords(value).split(' ');
 const bits=words.map(w=>INDEX.get(w).toString(2).padStart(11,'0')).join('');
 const entropy=Buffer.from(Array.from({length:16},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));
 const checksum=toBits(crypto.createHash('sha256').update(entropy).digest()).slice(0,4);
 if(bits.slice(128)!==checksum){entropy.fill(0);throw new Error('Custodian phrase checksum mismatch')}
 return entropy;
}
module.exports={entropyToWords,normalizeWords,wordsToEntropy};
