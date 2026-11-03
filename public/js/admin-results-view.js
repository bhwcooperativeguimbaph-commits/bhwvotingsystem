'use strict';
// Simplified results UI. Keeps existing server-side 2-of-2 finalization;
// published reports are permanent and broadcast once by the transaction.
(function(){
 const view=document.getElementById('view-history');
 if(!view)return;
 for(const old of [...view.children])old.hidden=true;
 const panel=document.createElement('section');panel.className='simple-results-panel';
 panel.innerHTML=`
  <h2>Election results and reports</h2>
  <label for="simpleElection">Choose an election</label>
  <select id="simpleElection"><option value="">Select election</option></select>
  <button id="simpleRefresh" class="ghost" type="button">Refresh elections</button>
  <p id="simpleResultsStatus" role="status" aria-live="polite">Select an election to continue.</p>
  <div id="simpleFinalization" hidden>
   <h3>Unlock finished election results</h3>
   <p>After the election ends, two confirmed custodians must privately provide their separate key shares.
      This will publish the results permanently and notify members once.</p>
   <div class="cols">
    <label>Custodian 1 key share<textarea id="simpleShare1" rows="3" spellcheck="false" autocomplete="off"></textarea></label>
    <label>Custodian 2 key share<textarea id="simpleShare2" rows="3" spellcheck="false" autocomplete="off"></textarea></label>
   </div>
   <button id="simpleFinalize" type="button">Unlock and publish results</button>
  </div>
  <div id="simplePublished" hidden>
   <h3>Published overall results</h3>
   <p id="simpleTotals"></p>
   <div id="simpleCandidates"></div>
   <p><a id="simplePublicLink" target="_blank" rel="noopener">View verified report and PDF</a></p>
   <button id="simpleOverallCsv" type="button" class="ghost">Download overall CSV</button>
   <h3>Votes cast by area</h3>
   <p>Only areas with 3 or more participating members are shown. Candidate selections are anonymous and cannot be broken down by area.</p>
   <div id="simpleAreas"></div>
   <button id="simpleAreaCsv" type="button" class="ghost">Download area CSV</button>
  </div>`;
 view.prepend(panel);
 const by=id=>document.getElementById(id);
 let entries=[],selected='',overall=null,areas=null,superAdmin=false;
 const say=text=>{by('simpleResultsStatus').textContent=text};
 function date(value){return new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',
  timeZone:'Asia/Manila'}).format(new Date(value))}
 async function get(url){
  const r=await fetch(url,{credentials:'same-origin'});
  const x=await r.json();
  if(!r.ok||x.success===false)throw Error(x.message||'Request unavailable');
  return x;
 }
 function simpleTable(rootId,headings,rows){
  const root=by(rootId);root.replaceChildren();
  const table=document.createElement('table');table.className='modern-table';
  const tr=document.createElement('tr');
  for(const name of headings){const th=document.createElement('th');th.textContent=name;tr.appendChild(th)}
  const thead=document.createElement('thead');thead.appendChild(tr);table.appendChild(thead);
  const body=document.createElement('tbody');
  for(const row of rows){
   const tr=document.createElement('tr');
   for(const val of row){const td=document.createElement('td');td.textContent=String(val);tr.appendChild(td)}
   body.appendChild(tr);
  }
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=headings.length;td.textContent='No publishable data.';tr.appendChild(td);body.appendChild(tr)}
  table.appendChild(body);root.appendChild(table);
 }
 function csv(name,headings,rows){
  function cell(x){
   let v=String(x??'');
   if(/^[\s]*[=+@\-\t\r]/.test(v))v="'"+v;
   return '"'+v.replace(/"/g,'""')+'"';
  }
  const content=[headings,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function display(){
  selected=by('simpleElection').value;
  by('simpleFinalization').hidden=true;by('simplePublished').hidden=true;
  overall=null;areas=null;
  const entry=entries.find(e=>e.electionId===selected);
  if(!entry){say('Select an election to continue.');return}
  const closed=new Date(entry.endTime).getTime()<=Date.now();
  say(entry.title+' · '+date(entry.startTime)+' – '+date(entry.endTime)+
   (entry.published?' · Results published':closed?' · Voting ended':' · Election in progress'));
  if(entry.published){
   try{
    const response=await get('/api/elections/'+encodeURIComponent(selected)+'/results');
    if(!window.BHWReportIntegrity||!(await window.BHWReportIntegrity.verify(response.report)))
     throw Error('Published report integrity check failed.');
    overall=response.report;
    const areaResponse=await get('/api/admin/elections/'+encodeURIComponent(selected)+'/published-area-report');
    areas=areaResponse.report;
    by('simpleTotals').textContent='Votes cast: '+overall.ballotsCast+
     ' · Eligible members: '+(areas.eligibleMembers??'Not available');
    simpleTable('simpleCandidates',['Position','Candidate','Votes'],
     overall.results.map(row=>[row.position,row.name,row.votes]));
    simpleTable('simpleAreas',['Area','Members who voted'],
     areas.areas.map(row=>[row.area,row.votesCast]));
    by('simplePublicLink').href='/results?electionId='+encodeURIComponent(selected);
    by('simplePublished').hidden=false;
   }catch(e){say(e.message||'Report unavailable');return}
  }else if(closed){
   by('simpleFinalization').hidden=!superAdmin;
   if(!superAdmin)say('Voting has ended. Waiting for Super Admin to publish results.');
   else say('Voting has ended. Both custodians must confirm delivery and provide their key shares to publish results.');
  }else say('Election is still running. Results unlock only after the scheduled end.');
 }
 async function refresh(){
  try{
   const [history,session]=await Promise.all([get('/api/admin/history'),get('/api/session')]);
   superAdmin=session.role==='superadmin';entries=history.elections||[];
   const current=selected||by('simpleElection').value;
   const select=by('simpleElection');select.replaceChildren();
   const placeholder=document.createElement('option');
   placeholder.value='';placeholder.textContent='Select election';select.appendChild(placeholder);
   for(const e of entries){
    const option=document.createElement('option');option.value=e.electionId;
    option.textContent=e.title+' ('+(e.published?'Published':'Not published')+')';
    select.appendChild(option);
   }
   select.value=entries.some(e=>e.electionId===current)?current:'';
   await display();
  }catch(e){say(e.message||'Could not load election list')}
 }
 by('simpleElection').onchange=display;
 by('simpleRefresh').onclick=refresh;
 by('simpleFinalize').onclick=async()=>{
  const first=by('simpleShare1'),second=by('simpleShare2');
  const shares=[first.value.trim(),second.value.trim()];
  if(!shares[0]||!shares[1]){
   await window.BHWDialog.notice('Both private custodian shares are required.','Missing key shares');return;
  }
  if(!await window.BHWDialog.confirm('Publish this finished election permanently? Every member will receive one results notification.','Publish election results'))return;
  const button=by('simpleFinalize');button.disabled=true;
  try{
   const r=await fetch('/api/admin/elections/'+encodeURIComponent(selected)+'/disclose-results',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({shares})
   });
   const data=await r.json();if(!r.ok||!data.success)throw Error(data.message||'Finalization failed');
   await window.BHWDialog.notice('The election results are permanently published. A notification is available to members.','Results published');
   await refresh();
  }catch(e){await window.BHWDialog.notice(e.message||'Unable to publish results','Results not published')}
  finally{first.value='';second.value='';button.disabled=false}
 };
 by('simpleOverallCsv').onclick=()=>{
  if(!overall)return;
  csv('BHW_Overall_'+selected+'.csv',['Position','Candidate','Votes'],
   overall.results.map(r=>[r.position,r.name,r.votes]));
 };
 by('simpleAreaCsv').onclick=()=>{
  if(!areas)return;
  csv('BHW_Area_Turnout_'+selected+'.csv',['Area','Members who voted'],
   areas.areas.map(r=>[r.area,r.votesCast]));
 };
 window.addEventListener('bhw-view-changed',event=>{
  if(event.detail?.view==='history')refresh();
 });
 refresh();
})();
