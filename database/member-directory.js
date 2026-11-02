'use strict';
// Restricted staff-only directory search. Escapes metacharacters to keep the
// search literal and applies the same filter for pages and counts.
function directoryFilter(search){
 if(search==null||search==='')return {};
 if(typeof search!=='string')throw new TypeError('Invalid member search term');
 // Reject control characters before collapsing whitespace; otherwise newlines
 // can be silently converted into seemingly legitimate search text.
 if(/[\x00-\x1f\x7f]/.test(search))
  throw new TypeError('Member search must contain 1-80 printable characters');
 const q=search.trim().replace(/\s+/g,' ');
 if(!q)return {};
 if(q.length>80)
  throw new TypeError('Member search must contain 1-80 printable characters');
 const literal=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return {$or:[
  {fullName:{$regex:literal,$options:'i'}},
  {memberId:{$regex:literal,$options:'i'}},
  {area:{$regex:literal,$options:'i'}}
 ]};
}
module.exports={directoryFilter};
