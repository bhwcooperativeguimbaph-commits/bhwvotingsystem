'use strict';
(function(){
 const by=id=>document.getElementById(id),main=by('adminContent');
 if(!main)return;
 const mainSections=[...main.querySelectorAll(':scope > section')];
 const viewNames={dashboard:'Dashboard',registration:'Registration',setup:'Setup election',
  history:'Election results & reports',members:'Members table',audit:'Audit logs',
  users:'Users & roles'};
 const views={};
 for(const [id,label] of Object.entries(viewNames)){
  const div=document.createElement('div');div.id='view-'+id;div.className='admin-view';div.hidden=true;
  div.setAttribute('aria-label',label);main.appendChild(div);views[id]=div;
 }
 const move=(id,view)=>{const x=by(id);if(x)views[view].appendChild(x)};
 move('adminDashboard','dashboard');
 // Dashboard table summaries use the same aggregate-only, privacy-suppressed
 // endpoint as the charts: no identities, ballot choices or receipts exposed.
 const tableBox=document.createElement('div');tableBox.className='cols analytics-tables';
 for(const [heading,id,first] of [
  ['Daily voting activity','dailyTurnoutTable','Date'],
  ['Turnout by area','areaTurnoutTable','Area']]){
  const panel=document.createElement('div');
  const h=document.createElement('h3');h.textContent=heading;panel.appendChild(h);
  const table=document.createElement('table');table.className='modern-table';
  const thead=document.createElement('thead'),row=document.createElement('tr');
  for(const col of [first,'Votes recorded']){const th=document.createElement('th');th.textContent=col;row.appendChild(th)}
  thead.appendChild(row);table.appendChild(thead);
  const body=document.createElement('tbody');body.id=id;table.appendChild(body);
  panel.appendChild(table);tableBox.appendChild(panel);
 }
 by('refreshOverview').insertAdjacentElement('beforebegin',tableBox);
 function populateTable(id,items,key){
  const holder=by(id);holder.replaceChildren();
  const values=items.length?items:[{[key]:'No reportable votes',count:'—'}];
  for(const item of values){
   const tr=document.createElement('tr');
   for(const value of [item[key],String(item.count)]){
    const cell=document.createElement('td');cell.textContent=String(value);tr.appendChild(cell)
   }holder.appendChild(tr);
  }
 }
 async function refreshTables(){
  try{
   const res=await fetch('/api/admin/analytics',{credentials:'same-origin'});
   if(!res.ok)throw Error('Analytics unavailable');
   const data=await res.json();
   populateTable('dailyTurnoutTable',data.daily||[],'date');
   populateTable('areaTurnoutTable',data.areas||[],'area');
  }catch(_){
   populateTable('dailyTurnoutTable',[],'date');
   populateTable('areaTurnoutTable',[],'area');
  }
 }
 by('refreshOverview').addEventListener('click',refreshTables);
 refreshTables();
 const original=by('adminDashboard');
 // History and audit are pulled out of the dashboard, preserving their controls
 // and existing event handlers while they receive independent page views.
 const historyHeading=by('historyReportsSection'),historyList=by('historyList');
 if(historyHeading)views.history.appendChild(historyHeading);
 if(historyList)views.history.appendChild(historyList);
 const auditHeading=by('auditSection');
 if(auditHeading){
  let node=auditHeading;
  while(node){const next=node.nextElementSibling;views.audit.appendChild(node);node=next}
 }
 move('membersSection','members');
 move('electionSetupSection','setup');
 move('adminManagement','users');
 // Election setup owns candidate edits. Published results, custody status and
 // finalization belong in Election results & reports, not a separate operations tab.
 move('candidateManagement','setup');
 for(const section of mainSections){
  if(section.id==='sessionPanel'){section.hidden=true;continue}
  if(['adminDashboard','membersSection','electionSetupSection','adminManagement','candidateManagement'].includes(section.id))continue;
  views.history.appendChild(section);
 }
 const reg=document.createElement('section');reg.className='registration-frame-panel';
 reg.innerHTML='<iframe title="Member enrollment form" src="/member-enrollment-preview?embedded=1" loading="lazy" scrolling="no" style="display:block;box-sizing:border-box;width:100%;max-width:none;min-width:0;height:1px;min-height:0;border:0"></iframe>';
 const registrationFrame=reg.querySelector('iframe');
 registrationFrame.addEventListener('load',()=>{
  try{
   const doc=registrationFrame.contentDocument;
   const resize=()=>{
    if(!doc?.body)return;
    // An iframe's documentElement.scrollHeight includes its *old viewport*
    // height. Using it created a self-reinforcing 1500px blank tail.
    const content=Array.from(doc.body.children).filter(el=>{
     const style=doc.defaultView.getComputedStyle(el);
     return style.display!=='none'&&style.position!=='fixed'&&style.position!=='absolute';
    });
    const bottom=content.reduce((n,el)=>Math.max(n,el.getBoundingClientRect().bottom),0);
    const top=doc.body.getBoundingClientRect().top;
    const height=Math.max(100,Math.ceil(bottom-top+20));
    if(Math.abs(registrationFrame.getBoundingClientRect().height-height)>2)
     registrationFrame.style.height=height+'px';
   };
   resize();
   if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(doc.body);
   else registrationFrame.style.height='1450px';
  }catch(_){registrationFrame.style.height='1450px'}
 });
 // Only accept navigation messages from our own, same-origin enrollment iframe.
 // The embedded capture/success panels stay in document flow (no hidden modal).
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==registrationFrame.contentWindow||
     event.data?.type!=='bhw-enrollment-panel-open')return;
  const panelId=event.data.panel;
  if(!['captureDialog','successDialog','areaDialog'].includes(panelId))return;
  const panel=registrationFrame.contentDocument?.getElementById(panelId);
  if(!panel?.open)return;
  requestAnimationFrame(()=>{
   const frameTop=registrationFrame.getBoundingClientRect().top;
   const panelTop=panel.getBoundingClientRect().top;
   window.scrollBy(0,frameTop+panelTop-105);
  });
 });
 const replacement=new URLSearchParams(location.search).get('replace');
 if(/^MEM-[0-9a-f-]{36}$/i.test(replacement||'')){
  registrationFrame.title='Update member biometrics';
  registrationFrame.src='/member-enrollment-preview?embedded=1&replace='+encodeURIComponent(replacement);
 }
 views.registration.appendChild(reg);
 const toolbar=document.createElement('div');toolbar.className='admin-toolbar';
 toolbar.innerHTML='<div><small>ADMINISTRATION</small><h1 id="activePageTitle">Dashboard</h1></div><strong id="loggedInAs" class="admin-identity" aria-live="polite">Admin</strong>';
 const menu=by('mobileMenu');menu.insertAdjacentElement('afterend',toolbar);
 // Hide historical intro text without hiding the actual management functions.
 for(const child of [...main.children]){
  if(child===toolbar||child===menu||child.classList?.contains('admin-view')||
   child.id==='sessionPanel')continue;
  if(['H1','P'].includes(child.tagName))child.remove();
 }
 const sidebar=by('adminSidebar'),nav=sidebar.querySelector('.sidebar-links');
 for(const link of [...nav.querySelectorAll('a')]){
  if(link.textContent.trim()==='Registration')link.href='#view-registration';
  if(link.textContent.trim()==='Setup election')link.href='#view-setup';
  if(link.textContent.trim().startsWith('History')){link.href='#view-history';link.textContent='Election results & reports'}
  if(link.textContent.trim()==='Members table')link.href='#view-members';
  if(link.textContent.trim()==='Audit logs')link.href='#view-audit';
  if(link.textContent.trim().startsWith('Users'))link.href='#view-users';
  if(link.textContent.trim()==='Dashboard')link.href='#view-dashboard';
  link.setAttribute('data-view-link','');
 }
 const obsolete=nav.querySelector('a[href="#view-operations"]');if(obsolete)obsolete.remove();
 function activate(){
  const requested=location.hash.replace(/^#view-/,'');
  let id=viewNames[requested]?requested:'dashboard';
  if(id==='users'&&by('usersAndRolesLink').hidden)id='dashboard';
  for(const [key,element] of Object.entries(views))element.hidden=key!==id;
  for(const link of nav.querySelectorAll('[data-view-link]'))
   link.classList.toggle('active',link.getAttribute('href')==='#view-'+id);
  by('activePageTitle').textContent=viewNames[id];
  window.dispatchEvent(new CustomEvent('bhw-view-changed',{detail:{view:id}}));
  sidebar.classList.remove('mobile-open');
  by('mobileMenu').setAttribute('aria-expanded','false');
  window.scrollTo(0,0);
 }
 // Prevent the browser from jumping to a hash anchor halfway down the page.
 // Sidebar transitions change the URL without native anchor scrolling.
 window.addEventListener('hashchange',activate);
 window.addEventListener('popstate',activate);
 for(const link of nav.querySelectorAll('[data-view-link]'))link.addEventListener('click',event=>{
  event.preventDefault();
  const next=link.getAttribute('href');
  if(location.hash!==next)history.pushState(null,'',next);
  activate();
 });
 activate();
 // Staff identity is read from the existing authenticated session endpoint only.
 fetch('/api/session',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(user=>{
  if(!user?.success)return;
  by('loggedInAs').textContent=(user.role==='superadmin'?'Super Admin':'Admin')+
   (user.fullName?' · '+user.fullName:'');
  by('usersAndRolesLink').hidden=user.role!=='superadmin';
  if(location.hash==='#view-users'&&user.role!=='superadmin')activate();
 }).catch(()=>{});
})();
