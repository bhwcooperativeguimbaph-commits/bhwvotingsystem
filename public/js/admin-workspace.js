'use strict';
(function(){
 const by=id=>document.getElementById(id),main=by('adminContent');
 if(!main)return;
 const mainSections=[...main.querySelectorAll(':scope > section')];
 const viewNames={dashboard:'Dashboard',registration:'Registration',setup:'Setup election',
  history:'History & reports',members:'Members table',audit:'Audit logs',
  users:'Users & roles',operations:'Election operations'};
 const views={};
 for(const [id,label] of Object.entries(viewNames)){
  const div=document.createElement('div');div.id='view-'+id;div.className='admin-view';div.hidden=true;
  div.setAttribute('aria-label',label);main.appendChild(div);views[id]=div;
 }
 const move=(id,view)=>{const x=by(id);if(x)views[view].appendChild(x)};
 move('adminDashboard','dashboard');
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
 for(const section of mainSections){
  if(section.id==='sessionPanel'){section.hidden=true;continue}
  if(['adminDashboard','membersSection','electionSetupSection','adminManagement'].includes(section.id))continue;
  views.operations.appendChild(section);
 }
 const reg=document.createElement('section');reg.className='registration-frame-panel';
 reg.innerHTML='<h2>Member registration</h2><iframe title="Member enrollment form" src="/member-enrollment-preview?embedded=1" loading="lazy"></iframe>';
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
  if(link.textContent.trim().startsWith('History'))link.href='#view-history';
  if(link.textContent.trim()==='Members table')link.href='#view-members';
  if(link.textContent.trim()==='Audit logs')link.href='#view-audit';
  if(link.textContent.trim().startsWith('Users'))link.href='#view-users';
  if(link.textContent.trim()==='Dashboard')link.href='#view-dashboard';
  link.setAttribute('data-view-link','');
 }
 const operations=document.createElement('a');
 operations.href='#view-operations';operations.textContent='Election operations';
 operations.setAttribute('data-view-link','');nav.appendChild(operations);
 function activate(){
  const requested=location.hash.replace(/^#view-/,'');
  let id=viewNames[requested]?requested:'dashboard';
  if(id==='users'&&by('usersAndRolesLink').hidden)id='dashboard';
  for(const [key,element] of Object.entries(views))element.hidden=key!==id;
  for(const link of nav.querySelectorAll('[data-view-link]'))
   link.classList.toggle('active',link.getAttribute('href')==='#view-'+id);
  by('activePageTitle').textContent=viewNames[id];
  sidebar.classList.remove('mobile-open');
  by('mobileMenu').setAttribute('aria-expanded','false');
  window.scrollTo({top:0,behavior:'instant'});
 }
 window.addEventListener('hashchange',activate);
 for(const link of nav.querySelectorAll('[data-view-link]'))link.addEventListener('click',()=>{
  if(location.hash===link.getAttribute('href'))activate();
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
