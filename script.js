/* UI visibility follows the existing team rules. Server authorization is separate. */
function hubAccessData(raw, email, localPreview) {
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').trim().toLowerCase();
  const deptKey=v=>{const value=norm(v);return ['desgin','design','design team'].includes(value)?'design':value;};
  const inDept=(value,dept)=>Boolean(dept)&&String(value||'').split(/[,;\n]/).some(part=>deptKey(part)===deptKey(dept));
  const data={...raw,meta:{...raw.meta},options:{...(raw.options||raw.taskMeta?.options||{})},users:[...(raw.users||[])],tasks:[...(raw.tasks||[])],taskActivity:[...(raw.taskActivity||[])]};
  data.requests=(raw.requests||[]).map(r=>({...r,borrowDate:r.borrowDate||r.loanDate||''}));
  data.logs=(raw.logs||[]).map(r=>({...r,assetCode:r.assetCode||r.code||'',assetName:r.assetName||r.model||'',applicant:r.applicant||r.user||''}));
  email=norm(email);
  const user=email?data.users.find(u=>norm(u.email)===email)||{email,role:'Nhân viên',notRegistered:true}:
    localPreview?(data.currentUser||data.users.find(u=>norm(u.role)==='admin')||{}):{role:'Nhân viên',notRegistered:true};
  const role=norm(user.role),dept=norm(user.department);
  const lead=/(^|\s)(lead|leader|manager)(\s|$)/.test(role)||role.includes('truong phong')||role.includes('quan ly');
  const global=localPreview||['admin','giam doc','director','ceo'].includes(role);
  const assetLead=lead&&deptKey(dept)==='design';
  data.currentUser=user;
  Object.assign(data.meta,{email,canManage:global||lead||raw.access?.canManage===true,isGlobalMgr:global,isDesign:deptKey(dept)==='design'||dept.includes('thiet ke'),isAssetLead:assetLead});
  data.meta.allowedViews=['tasks','assets','profile'];
  if(data.meta.canManage)data.meta.allowedViews.unshift('overview');
  if(data.meta.canManage&&(global||assetLead))data.meta.allowedViews.push('requests','logs');
  if(!global){
    data.users=data.users.filter(u=>inDept(u.department,dept));
    const allTasks=data.tasks;
    data.tasks=allTasks.filter(t=>inDept(t.department,dept));
    const ids=new Set(data.tasks.map(t=>String(t.id||'').trim()).filter(id=>id&&allTasks.filter(other=>String(other.id||'').trim()===id).length===1));
    data.taskActivity=data.taskActivity.filter(a=>ids.has(String(a.id||'').trim()));
    if(!assetLead){
      data.logs=data.logs.filter(l=>inDept(l.department,dept));
      data.requests=data.requests.filter(r=>inDept(r.department,dept));
    }
    const pics=new Set(data.users.map(u=>norm(u.pic)).filter(Boolean));
    if(Array.isArray(data.options.pics))data.options.pics=data.options.pics.filter(p=>pics.has(norm(p)));
    if(Array.isArray(data.options.departments))data.options.departments=data.options.departments.filter(d=>inDept(d,dept));
  }
  return data;
}



window.SERVER_DATA = null;
window.DEEP_LINK_ASSET = null;
window.ACTIVE_EMAIL = null;



const normalize = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').trim().replace(/\s+/g,' ').toLowerCase();
function parseDate(v){if(v instanceof Date)return isNaN(+v)?null:new Date(v);let a=String(v||'').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/),y,m,d,h=0,n=0,s=0;if(a)[,y,m,d,h=0,n=0,s=0]=a;else{a=String(v||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);if(!a)return null;[,d,m,y,h=0,n=0,s=0]=a;}const date=new Date(+y,+m-1,+d,+h,+n,+s);return date.getFullYear()===+y&&date.getMonth()===+m-1&&date.getDate()===+d&&+h<24&&+n<60&&+s<60?date:null;}
const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
const people=t=>[...new Set(String(t.pic||'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean))];
const isDone=t=>['done','completed','complete','da hoan thanh','hoan thanh','hoan tat'].includes(normalize(t.status));
const isCancelled=t=>['cancelled','canceled','huy','da huy'].includes(normalize(t.status));
const isOpen=t=>!isDone(t)&&!isCancelled(t);
const dueDays=(t,now=new Date())=>{const d=parseDate(t.deadline);return d?day(d)-day(now):null;};
const isTestTask=t=>/\btest\b|kiem thu/.test(normalize(t.project+' '+t.task));
const isCampaign=t=>/\bcampaign\b|\bcp\b/.test(normalize(typeof t==='string'?t:t.project));
function filterTasks(tasks,{query='',pic='all',project='all',department='all',status='all',hideDone=false,excludeTests=false}={}){return tasks.filter(t=>(!query||normalize([t.id,t.task,t.project,t.pic,t.department,t.priority,t.status].join(' ')).includes(normalize(query)))&&(pic==='all'||people(t).some(p=>normalize(p)===normalize(pic)))&&(project==='all'||normalize(t.project)===normalize(project))&&(department==='all'||String(t.department||'').split(/[,;\n]/).some(d=>normalize(d)===normalize(department)))&&(status==='all'||normalize(t.status)===normalize(status))&&(!hideDone||isOpen(t))&&(!excludeTests||!isTestTask(t)));}
function summarize(tasks,now=new Date()){const done=tasks.filter(isDone).length,cancelled=tasks.filter(isCancelled).length,open=tasks.filter(isOpen);return {total:tasks.length,done,cancelled,open:open.length,overdue:open.filter(t=>dueDays(t,now)!==null&&dueDays(t,now)<0).length,dueSoon:open.filter(t=>dueDays(t,now)!==null&&dueDays(t,now)>=0&&dueDays(t,now)<=3).length,undated:open.filter(t=>dueDays(t,now)===null).length,completion:tasks.length-cancelled?done/(tasks.length-cancelled)*100:0};}
function groupProjects(tasks,now=new Date()){const groups=new Map();for(const t of tasks){const name=t.project?.trim()||'Chưa gắn dự án',key=normalize(name);if(!groups.has(key))groups.set(key,{name,key,tasks:[]});groups.get(key).tasks.push(t);}return [...groups.values()].map(g=>({...g,...summarize(g.tasks,now)}));}
function staffMetrics(tasks,users=[],pics=[],now=new Date()){const roster=new Map();for(const u of users){const pic=String(u.pic||'').trim();if(!pic||['false','nghi viec','inactive','khong'].includes(normalize(u.active)))continue;roster.set(normalize(pic),{...u,name:u.name||pic,pic,tasks:[]});}for(const pic of pics.concat(tasks.flatMap(people))){if(!roster.has(normalize(pic)))roster.set(normalize(pic),{name:pic,pic,role:'Thành viên',tasks:[]});}for(const p of roster.values()){p.tasks=tasks.filter(t=>people(t).some(pic=>normalize(pic)===normalize(p.pic)));Object.assign(p,summarize(p.tasks,now));}return [...roster.values()];}
function health(tasks){const ids=new Map();for(const t of tasks){if(!t.id)continue;const k=normalize(t.id);if(!ids.has(k))ids.set(k,[]);ids.get(k).push(t);}return {duplicateIds:[...ids.values()].filter(ts=>ts.length>1).map(ts=>({id:ts[0].id,count:ts.length,rows:ts.map(t=>t.row),tasks:ts})),missingDeadline:tasks.filter(t=>isOpen(t)&&!parseDate(t.deadline)).length,missingPic:tasks.filter(t=>!people(t).length).length,missingTitle:tasks.filter(t=>!String(t.task||'').trim()).length,testTasks:tasks.filter(isTestTask).length};}
function weeklyDeadlines(tasks,now=new Date()){const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-(start.getDay()+6)%7);return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const ts=tasks.filter(t=>{const date=parseDate(t.deadline);return date&&day(date)===day(d)&&!isCancelled(t);});return {date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),label:['T2','T3','T4','T5','T6','T7','CN'][i],count:ts.length,done:ts.filter(isDone).length,open:ts.filter(isOpen).length};});}

// Operational indicators use task rows, never inferred effort or completion dates.
function managementMetrics(tasks,now=new Date()) {
  const open=tasks.filter(isOpen), summary=summarize(tasks,now);
  return {...summary,
    urgent:open.filter(t=>/^(high|urgent)$/.test(normalize(t.priority))).length,
    feedback:open.filter(t=>normalize(t.status)==='feedback').length,
    unassigned:open.filter(t=>!people(t).length).length,
    upcomingAir:tasks.filter(t=>!isCancelled(t)&&parseDate(t.airDate)&&day(parseDate(t.airDate))-day(now)>=0&&day(parseDate(t.airDate))-day(now)<=7).length,
    missingAir:open.filter(t=>!parseDate(t.airDate)).length,
    nextDeadline:open.map(t=>parseDate(t.deadline)).filter(d=>d&&day(d)>=day(now)).sort((a,b)=>a-b)[0]||null,
    pics:new Set(tasks.flatMap(people).map(normalize)).size,
    platforms:[...new Map(tasks.flatMap(t=>String(t.platform||'').split(/[,;\n]/)).map(v=>v.trim()).filter(Boolean).map(v=>[normalize(v),v])).values()]
  };
}

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => new Intl.NumberFormat('vi-VN').format(value || 0);
const initials = name => String(name||'KC').trim().split(/\s+/).slice(-2).map(p=>p[0]).join('').toUpperCase();
const fmt = value => {const d=parseDate(value);return d ? d.toLocaleDateString('vi-VN') : 'Chưa đặt hạn';};
const safeURL = value => {try { const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';} catch {return '';}};
const avatarURL = value => /^data:image\/(png|jpe?g|webp);base64,[a-zA-Z0-9+/=]+$/.test(value||'') ? value : safeURL(value);
const icons = {
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',chart:'<path d="M4 19h16M7 15V9m5 6V5m5 10v-4"/>',box:'<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5M12 13v9"/>',scan:'<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10M8 9v6m3-6v6m3-6v6m3-6v6"/>',list:'<path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M5 15v6h14v-6"/>',upload:'<path d="M12 16V4m-4 4 4-4 4 4M5 15v6h14v-6"/>',alert:'<path d="m12 3 10 18H2L12 3Z M12 9v5m0 3v1"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>'
};
const icon = n => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]||icons.info}</svg>`;
const badge = (text,tone='blue') => `<span class="badge ${tone}">${esc(text)}</span>`;
const avatar = (person,extra='') => `<span class="avatar ${extra}">${avatarURL(person.avatarUrl)?`<img src="${esc(avatarURL(person.avatarUrl))}" alt="${esc(person.name)}" loading="lazy">`:esc(initials(person.name||person.pic))}</span>`;
const empty = (heading,body) => `<div class="empty-state">${icon('list')}<strong>${esc(heading)}</strong><p>${esc(body)}</p></div>`;
const priority = t => badge(t.priority||'Chưa đặt',/urgent|high/.test(normalize(t.priority))?'red':normalize(t.priority)==='medium'?'amber':'blue');
const statusBadge = t => badge(t.status||'Chưa đặt trạng thái',isDone(t)?'green':isCancelled(t)?'neutral':normalize(t.status)==='feedback'?'amber':'blue');

/* ── Calendar Picker Component ── */
const calMonths=['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const calDays=['T2','T3','T4','T5','T6','T7','CN'];
let _calState=null;

function openCalendar(opts, event){
  const {displayId, startId, endId, mode='range'}=opts;
  const inputEl=document.getElementById(displayId);
  const startEl=startId?document.getElementById(startId):null;
  const endEl=endId?document.getElementById(endId):null;
  const parseLocal = s => {
    if(!s)return null;
    const p=s.split(/[-/]/);
    if(p.length===3) {
       if(p[0].length===4) return new Date(p[0], p[1]-1, p[2]);
       if(p[2].length===4) return new Date(p[2], p[1]-1, p[0]);
    }
    return new Date(s);
  };
  const sDate=startEl&&startEl.value?parseLocal(startEl.value):null;
  const eDate=endEl&&endEl.value?parseLocal(endEl.value):null;
  const initDate=sDate||new Date();
  
  _calState={month:initDate.getMonth(),year:initDate.getFullYear(),start:sDate,end:eDate,preset:null,displayId,startId,endId,mode,hover:null,compact:!!inputEl.closest('.tw-create-body')};
  
  let dropdown=document.getElementById('cal-dropdown');
  if(!dropdown){
    dropdown=document.createElement('div');dropdown.id='cal-dropdown';dropdown.className='cal-dropdown';dropdown.setAttribute('popover','manual');dropdown.setAttribute('role','dialog');dropdown.setAttribute('aria-label','Chọn ngày');
    document.body.appendChild(dropdown);
    document.addEventListener('mousedown', e => {
       if(_calState && !dropdown.contains(e.target) && e.target.id!==_calState.displayId) calSave();
    });
  }
  
  // Build static HTML skeleton ONCE
  dropdown.innerHTML=`<div class="cal-popup">
    <div class="cal-trip-header">
      <div class="cal-trip-title">Chọn ngày</div><button type="button" class="cal-dismiss" onclick="closeCalendar()" aria-label="Đóng lịch">${icon('left')}</button>
      <div id="cal-badge-container"></div>
    </div>
    <div class="cal-inputs-row" id="cal-inputs-container"></div>
    <div class="cal-matrix-header">
      <button type="button" onclick="calNav(-1)" class="cal-nav" aria-label="Tháng trước">${icon('left')}</button>
      <span class="cal-month-title" id="cal-title"></span>
      <button type="button" onclick="calNav(1)" class="cal-nav" aria-label="Tháng tiếp theo">${icon('right')}</button>
    </div>
    <div class="cal-weekdays">${calDays.map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="cal-grid" id="cal-grid" onmouseleave="calHover()"></div>
    <div class="cal-footer">
      <div class="cal-presets" id="cal-presets-container"></div>
      <button type="button" class="cal-clear" onclick="calClear()">Xóa ngày</button>
    </div><button type="button" class="cal-apply" onclick="calSave()">Áp dụng</button>
  </div>`;
  
  const parent = inputEl.closest('dialog') || document.body;
  parent.appendChild(dropdown);
  const rect=inputEl.getBoundingClientRect();
  dropdown.style.position='fixed';
  dropdown.style.right='auto';
  dropdown.style.left=Math.max(12,Math.min(rect.right-300,window.innerWidth-312))+'px';
  dropdown.style.top=Math.max(12,Math.min(rect.bottom+8,window.innerHeight-490))+'px';
  dropdown.classList.add('cal-open');
  if(dropdown.showPopover&&!dropdown.matches(':popover-open'))dropdown.showPopover();
  // Force full render first time
  _calState.fullRender = true;
  calRender();
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_calState){e.preventDefault();e.stopImmediatePropagation();const id=_calState.displayId;closeCalendar();document.getElementById(id)?.focus();}},true);
function closeCalendar(){const o=document.getElementById('cal-dropdown');if(o){if(o.hidePopover&&o.matches(':popover-open'))o.hidePopover();o.classList.remove('cal-open');}_calState=null;}
function calNav(dir){if(!_calState)return;_calState.month+=dir;if(_calState.month>11){_calState.month=0;_calState.year++;}if(_calState.month<0){_calState.month=11;_calState.year--;}_calState.fullRender=true;calRender();}
function calHover(y,m,d){if(!_calState)return; _calState.hover = (y!==undefined) ? new Date(y,m,d) : null; if(_calState.start && !_calState.end) calRender();}

function autoTheme(s, e) {
  if(!s || !e) return 'default';
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 2) return '3days';
  if (diff === 6) return '1week';
  if (diff === 13) return '2weeks';
  return 'default';
}

function calPreset(key){
  if(!_calState)return;
  const now=new Date();
  let baseDate = key==='today'?new Date(now.getFullYear(),now.getMonth(),now.getDate()):(_calState.start || new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  let s=new Date(baseDate), e=new Date(baseDate);
  if(key==='today')e.setDate(e.getDate()+0);
  else if(key==='3days')e.setDate(e.getDate()+2);
  else if(key==='1week')e.setDate(e.getDate()+6);
  else if(key==='2weeks')e.setDate(e.getDate()+13);
  _calState.start=s;_calState.end=e;
  if(_calState.month !== s.getMonth() || _calState.year !== s.getFullYear()) {
    _calState.month=s.getMonth();_calState.year=s.getFullYear();
    _calState.fullRender = true;
  }
  calRender();
}

function calClear(){if(!_calState)return;_calState.start=null;_calState.end=null;_calState.hover=null;calRender();}

function calSave(){
  if(!_calState)return;
  const {start, end, displayId, startId, endId, mode} = _calState;
  const fmtDate = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
  const dFmt = d => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
  
  if(startId) {const el=document.getElementById(startId); if(el) el.value = fmtDate(start);}
  if(endId) {const el=document.getElementById(endId); if(el) el.value = fmtDate(end||start);}
  
  if(displayId) {
    const el = document.getElementById(displayId);
    if(el) {
       if(mode==='range') {
          el.value = start ? (end ? `${dFmt(start)} - ${dFmt(end)}` : dFmt(start)) : '';
       } else {
          el.value = start ? dFmt(start) : '';
       }
       el.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  closeCalendar();
}

const shortFmt = d => d ? d.toLocaleDateString('vi-VN') : 'Chưa chọn';

function calRender(){
  if(!_calState)return;
  const {month,year,start,end,hover,mode,fullRender}=_calState;
  const dropdown=document.getElementById('cal-dropdown');if(!dropdown)return;
  
  dropdown.dataset.mode=_calState.mode;
  const theme = autoTheme(start, end);
  dropdown.className = `cal-dropdown cal-open theme-${theme}${_calState.compact?' cal-compact':''}`;
  
  const diffDays = (start && end) ? Math.round((end.getTime() - start.getTime()) / 86400000) : 0;
  
  document.getElementById('cal-badge-container').innerHTML = (start && end) ? `<span class="cal-trip-badge">${diffDays} ngày</span>` : `<span class="cal-trip-badge" style="background:#f0f4f9;color:#7e94b1">Chọn ngày</span>`;
  
  document.getElementById('cal-inputs-container').innerHTML = `
      <div class="cal-input-box">
        <span class="cal-input-label">Bắt đầu</span>
        <span class="cal-input-val ${!start?'empty':''}">${shortFmt(start)}</span>
      </div>
      <div class="cal-input-box">
        <span class="cal-input-label">${_calState.mode==='range'?'Kết thúc':'Ngày chọn'}</span>
        <span class="cal-input-val ${!end?'empty':''}">${shortFmt(end)}</span>
      </div>
  `;
  
  document.getElementById('cal-presets-container').innerHTML = `
        <button type="button" class="cal-preset ${theme==='today'?'active':''}" onclick="calPreset('today')">Hôm nay</button>
        <button type="button" class="cal-preset ${theme==='3days'?'active':''}" onclick="calPreset('3days')">3 ngày</button>
        <button type="button" class="cal-preset ${theme==='1week'?'active':''}" onclick="calPreset('1week')">1 tuần</button>
        <button type="button" class="cal-preset ${theme==='2weeks'?'active':''}" onclick="calPreset('2weeks')">2 tuần</button>
  `;
  
  document.getElementById('cal-title').textContent = `${calMonths[month]} ${year}`;
  
  const grid = document.getElementById('cal-grid');
  
  const first=new Date(year,month,1);const startDay=(first.getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const today=new Date();const todayD=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();
  
  const sT = start?start.getTime():0;
  const eT = end?end.getTime():0;
  const hT = hover?hover.getTime():0;
  
  if (fullRender) {
    let html = '';
    for(let i=0;i<startDay;i++)html+=`<span class="cal-day cal-empty"></span>`;
    for(let d=1;d<=daysInMonth;d++) {
       html+=`<button type="button" id="cal-day-btn-${d}" class="cal-day" onclick="calSelect(${year},${month},${d})" onmouseenter="calHover(${year},${month},${d})">${d}</button>`;
    }
    grid.innerHTML = html;
    _calState.fullRender = false;
  }
  
  // Update classes without recreating DOM elements!
  for(let d=1;d<=daysInMonth;d++){
    const btn = document.getElementById(`cal-day-btn-${d}`);
    if(!btn) continue;
    const date=new Date(year,month,d); const dT=date.getTime();
    const isToday=dT===todayD;
    const isStart=sT===dT;
    const isEnd=eT===dT || (sT===dT && !end && mode!=='range');
    const isSolidRange=(sT && eT && dT>sT && dT<eT);
    const isHoverRange=(sT && !eT && hT && dT>Math.min(sT,hT) && dT<Math.max(sT,hT)) || (sT && !eT && hT && dT===hT && hT!==sT);
    
    let cls='cal-day';
    if(isToday && !isStart && !isEnd)cls+=' cal-today';
    if(isStart)cls+=' cal-selected cal-start';
    if(isEnd)cls+=' cal-selected cal-end';
    if(isSolidRange)cls+=' cal-range';
    if(isHoverRange)cls+=' cal-range-hover';
    
    btn.className = cls;
  }
  positionCalendar();
}

function positionCalendar(){
  if(!_calState)return;
  const dropdown=document.getElementById('cal-dropdown');
  const input=document.getElementById(_calState.displayId);
  if(!dropdown||!input)return;
  const anchor=(input.closest('.tw-calendar-picker')||input).getBoundingClientRect();
  const gap=8, edge=12;
  dropdown.style.maxHeight=(innerHeight-edge*2)+'px';
  const box=dropdown.getBoundingClientRect();
  const below=innerHeight-anchor.bottom-gap-edge, above=anchor.top-gap-edge;
  const openBelow=below>=box.height||below>=above;
  const available=Math.max(60,openBelow?below:above);
  dropdown.style.maxHeight=available+'px';
  const height=Math.min(box.height,available);
  dropdown.style.left=Math.max(edge,Math.min(anchor.right-box.width,innerWidth-box.width-edge))+'px';
  dropdown.style.top=Math.max(edge,openBelow?anchor.bottom+gap:anchor.top-gap-height)+'px';
}

window.addEventListener('resize',positionCalendar);
document.addEventListener('scroll',e=>{if(_calState&&!document.getElementById('cal-dropdown')?.contains(e.target))positionCalendar();},true);

function calSelect(y,m,d){
  if(!_calState)return;
  const clicked = new Date(y,m,d);
  let shouldClose = false;
  if(_calState.mode==='range') {
    if(!_calState.start || (_calState.start && _calState.end)) {
      _calState.start = clicked; _calState.end = null;
    } else {
      if(clicked < _calState.start) {
         _calState.end = _calState.start; _calState.start = clicked;
      } else {
         _calState.end = clicked;
      }
      shouldClose = true;
    }
  } else {
    _calState.start = clicked;
    shouldClose = true;
  }
  calRender();
  // Explicit Apply keeps touch selection predictable and avoids stale save timers.
}
const app = {data:null,view:'overview',tab:'performance',query:'',pic:'all',department:'all',excludeTests:false,selectedPic:'LUNA',period:'week',taskStatus:'all',hideDone:true,project:'all',sort:'id'};
let lastFocus = null;
let messageTimer;

const taskDeptKey=value=>{const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').trim().toLowerCase();return ['desgin','design','design team'].includes(key)?'design':key;};
const taskAssignablePics=dept=>dept?[...new Set((app.data?.users||[]).filter(user=>String(user.department||'').split(/[,;\n]/).some(part=>taskDeptKey(part)===taskDeptKey(dept))).map(user=>user.pic).filter(Boolean))]:[];
window.updateTaskPicOptions=select=>{const pic=$('task-pic-select');if(!pic)return;pic.innerHTML='<option value="">Chọn PIC trong phòng ban</option>'+taskAssignablePics(select.value).map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');};
const getTaskForm = () => {
  const formOpts = (items, placeholder, selected) => `<option value="">${placeholder}</option>` + (items||[]).map(i => `<option value="${esc(i)}" ${i===selected?'selected':''}>${esc(i)}</option>`).join('');
  const selectedDept=app.data.meta.isGlobalMgr?'':(app.data.options.departments||[])[0]||'';
  return `<form id="create-task-form" onsubmit="event.preventDefault(); runMutation('apiCreateTask', new FormData(this))">
  <div class="detail-grid" style="gap:16px;max-height:60vh;overflow-y:auto;padding:2px">
    <div class="detail-field">
      <span>Phòng ban <b style="color:red">*</b></span>
      <select id="task-department-select" name="department" required onchange="updateTaskPicOptions(this)" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
        ${formOpts(app.data.options.departments,'Chọn phòng ban',selectedDept)}
      </select>
    </div>
    <div class="detail-field">
      <span>Nền tảng</span>
      <select name="platform" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
        ${formOpts(app.data.options.platforms,'Chọn nền tảng','')}
      </select>
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Dự án / Campaign <b style="color:red">*</b></span>
      <input type="text" name="project" required maxlength="160" placeholder="Ví dụ: Campaign tháng 10" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Tên công việc <b style="color:red">*</b></span>
      <input type="text" name="task" required maxlength="220" placeholder="Mô tả rõ đầu việc cần giao" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;font-weight:600;padding:4px 0">
    </div>
    <div class="detail-field">
      <span>Mức ưu tiên <b style="color:red">*</b></span>
      <select name="priority" required style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
        ${formOpts(app.data.options.priorities||['Normal', 'High', 'Urgent', 'Low'],'Chọn ưu tiên','')}
      </select>
    </div>
    <div class="detail-field">
      <span>PIC (Người phụ trách) <b style="color:red">*</b></span>
      <select id="task-pic-select" name="pic" required style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
        ${formOpts(taskAssignablePics(selectedDept),'Chọn PIC trong phòng ban','')}
      </select>
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Thời gian thực hiện (Bắt đầu - Deadline) <b style="color:red">*</b></span>
      <input type="hidden" name="startDate" id="task-startDate">
      <input type="hidden" name="deadline" id="task-deadline">
      <input type="text" id="task-range-display" readonly placeholder="Chọn khoảng thời gian..." onclick="openCalendar({displayId:'task-range-display', startId:'task-startDate', endId:'task-deadline', mode:'range'})" required style="cursor:pointer;width:100%;border:none;background:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237e94b1%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect x=%223%22 y=%224%22 width=%2218%22 height=%2218%22 rx=%222%22 ry=%222%22/><line x1=%2216%22 y1=%222%22 x2=%2216%22 y2=%226%22/><line x1=%228%22 y1=%222%22 x2=%228%22 y2=%226%22/><line x1=%223%22 y1=%2210%22 x2=%2221%22 y2=%2210%22/></svg>') right center / 16px no-repeat; padding-right:24px;;outline:none;font-size:13px;padding:4px 24px 4px 0;font-family:inherit">
    </div>
    <div class="detail-field">
      <span>Ngày đăng bài</span>
      <input type="hidden" name="airDate" id="task-airDate">
      <input type="text" id="task-air-display" readonly placeholder="Chọn ngày đăng..." onclick="openCalendar({displayId:'task-air-display', startId:'task-airDate', mode:'single'})" style="cursor:pointer;width:100%;border:none;background:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237e94b1%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect x=%223%22 y=%224%22 width=%2218%22 height=%2218%22 rx=%222%22 ry=%222%22/><line x1=%2216%22 y1=%222%22 x2=%2216%22 y2=%226%22/><line x1=%228%22 y1=%222%22 x2=%228%22 y2=%226%22/><line x1=%223%22 y1=%2210%22 x2=%2221%22 y2=%2210%22/></svg>') right center / 16px no-repeat; padding-right:24px;;outline:none;font-size:13px;padding:4px 24px 4px 0;font-family:inherit">
    </div>
    <div class="detail-field">
      <span>Trạng thái</span>
      <select name="status" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
        ${formOpts(app.data.options.statuses,'Chọn trạng thái','Pending')}
      </select>
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Nội dung / Brief</span>
      <textarea name="brief" rows="3" maxlength="2000" placeholder="Bối cảnh, yêu cầu và thông tin cần thiết" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0;resize:none;font-family:inherit"></textarea>
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Sản phẩm cần giao</span>
      <input type="text" name="deliverable" maxlength="500" placeholder="Ví dụ: 05 social post, KV, file source" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Ghi chú</span>
      <textarea name="note" rows="2" maxlength="1000" placeholder="Thông tin bổ sung (tuỳ chọn)" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0;resize:none;font-family:inherit"></textarea>
    </div>
    <div class="detail-field" style="grid-column: 1 / -1">
      <span>Link nguồn</span>
      <input type="url" name="sourceLink" maxlength="1000" placeholder="Dán đường dẫn nguồn" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0">
    </div>
    <input type="hidden" name="clientRequestId" value="${'REQ-'+Date.now()}">
  </div>
  <div class="dialog-actions" style="margin-top:24px;justify-content:flex-end">
    <button type="button" class="text-button" onclick="closeModal()">Hủy</button>
    <button type="submit" class="primary-link" style="border:none;cursor:pointer">Giao Task</button>
  </div>
</form>`;
};


function toast(text) {
  let box=$('local-message');
  if(!box) {box=document.createElement('div');box.id='local-message';box.className='local-message';box.setAttribute('role','status');document.body.append(box);}
  box.textContent=text;box.classList.add('show');clearTimeout(messageTimer);messageTimer=setTimeout(()=>box.classList.remove('show'),5000);
}
function currentRows() {return filterTasks(app.data.tasks,{query:app.query,pic:app.pic,department:app.department,excludeTests:app.excludeTests});}
function staff(rows) {return staffMetrics(rows,app.data.users,app.data.options?.pics||[],new Date());}
function taskTitle(t) {return t.task||t.project||'Task chưa có tên';}
function sheetLink(t) {const u=new URL(app.data.meta.taskSheetUrl);u.searchParams.set('range','A'+t.row+':O'+t.row);u.hash='gid=1970101705&range=A'+t.row+':O'+t.row;return u.href;}
function options(items,all,selected) {return `<option value="all">${all}</option>`+items.map(i=>`<option value="${esc(i)}" ${i===selected?'selected':''}>${esc(i)}</option>`).join('');}

function formatStatusBadge(str){
  if(!str)return'—';
  let s=normalize(str);
  if(s.includes('san sang')||s.includes('done')||s.includes('dong y')||s.includes('hoan tat')||s.includes('da tra'))return badge(str,'green');
  if(s.includes('dang muon')||s.includes('active')||s.includes('on going'))return badge(str,'blue');
  if(s.includes('tu choi')||s.includes('cancel')||s.includes('huy')||s.includes('hong')||s.includes('mat'))return badge(str,'red');
  if(s.includes('cho duyet')||s.includes('pending')||s.includes('feedback')||s.includes('bao tri'))return badge(str,'amber');
  return badge(str,'neutral');
}
const assetCodeKey = value => normalize(value).replace(/[^a-z0-9]/g,'');
const assetByCode = value => app.data?.assets.find(asset => assetCodeKey(asset.code)===assetCodeKey(value));
const assetCodeFromQR = value => {
  const raw=String(value||'').trim(); if(!raw)return '';
  try {
    const url=new URL(raw,window.location.origin);
    const code=url.searchParams.get('asset')||url.searchParams.get('assetCode')||url.searchParams.get('code')||'';
    if(code)return code;
    const path=url.pathname.match(/(?:asset|assets)\/([^/?#]+)/i);
    if(path)return decodeURIComponent(path[1]);
  } catch {}
  return raw.replace(/^asset\s*[:#/]\s*/i,'').trim();
};
const assetQRLink = code => {
  const inAppsScript=/(^|\.)googleusercontent\.com$/.test(location.hostname)||location.hostname==='script.google.com';
  const base=inAppsScript&&app.data?.meta?.deploymentUrl?app.data.meta.deploymentUrl:window.location.href;
  const url=new URL(base,window.location.origin); url.searchParams.set('asset',code); return url.href;
};
const sharedAssetCode = () => assetCodeFromQR(window.DEEP_LINK_ASSET || new URLSearchParams(location.search).get('asset'));
let assetScanner=null;
function stopAssetScanner(){
  if(!assetScanner)return;
  cancelAnimationFrame(assetScanner.frame);
  assetScanner.stream?.getTracks().forEach(track=>track.stop());
  assetScanner=null;
}
function openAssetFromQR(payload,{updateURL=true}={}){
  const code=assetCodeFromQR(payload),asset=assetByCode(code);
  if(!asset){toast(`Không thấy thiết bị có mã “${code||'trống'}”.`);return false;}
  stopAssetScanner();
  if($('detail-dialog').open)closeModal();
  app.view='assets'; render();
  if(updateURL){const url=assetQRLink(asset.code);if(new URL(url).origin===location.origin)history.replaceState({asset:asset.code},'',url);}
  showAssetDetail(asset.code,{scanned:true});
  return true;
}
function openAssetLogs(code){
  closeModal(); app.view='logs'; app.logTab='borrow'; app.logSearch=code; render();
  $('secondary-view').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
window.openAssetScanner = async function(){
  if(!navigator.mediaDevices?.getUserMedia){toast('Thiết bị này không hỗ trợ mở camera trong trình duyệt. Hãy quét QR bằng camera hệ thống để mở link thiết bị.');return;}
  modal('Quét QR thiết bị',`<section class="asset-scanner" aria-live="polite"><div class="scanner-viewport"><video id="asset-qr-video" playsinline muted></video><div class="scanner-frame" aria-hidden="true"></div></div><strong id="asset-qr-status">Đang mở camera…</strong><p>Đưa mã QR trên thiết bị vào trong khung. Hệ thống sẽ mở thẳng hồ sơ thiết bị.</p><p class="muted small">QR có thể là link hồ sơ hoặc mã thiết bị.</p></section>`);
  const status=$('asset-qr-status'),video=$('asset-qr-video');
  if(!('BarcodeDetector' in window)){status.textContent='Trình duyệt chưa hỗ trợ quét QR trực tiếp.';return;}
  try {
    const detector=new BarcodeDetector({formats:['qr_code']});
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(!$('detail-dialog').open){stream.getTracks().forEach(track=>track.stop());return;}
    assetScanner={stream,frame:0}; video.srcObject=stream; await video.play();
    status.textContent='Đang tìm mã QR…';
    const detect=async()=>{
      if(!assetScanner||video.readyState<2){if(assetScanner)assetScanner.frame=requestAnimationFrame(detect);return;}
      try {const codes=await detector.detect(video);if(codes[0]?.rawValue){if(openAssetFromQR(codes[0].rawValue))return;status.textContent='Mã này chưa có trong danh sách. Hãy thử mã khác.';}}
      catch {status.textContent='Chưa đọc được mã, hãy giữ máy ổn định.';}
      if(assetScanner)assetScanner.frame=requestAnimationFrame(detect);
    };
    detect();
  } catch(error) {status.textContent=error.name==='NotAllowedError'?'Cần cấp quyền camera để quét QR.':'Không mở được camera. Hãy quét QR bằng camera hệ thống để mở link thiết bị.';}
};
function validateData(raw) {
  if(raw?.ok===false)throw new Error(raw.error||'Không tải được dữ liệu.');
  const source=raw?.data||raw;
  if(!source)throw new Error('Không có dữ liệu.');
  const localPreview=!(typeof google!=='undefined'&&google.script)&&['file:','http:','https:'].includes(location.protocol)&&(['localhost','127.0.0.1',''].includes(location.hostname));
  let data=hubAccessData(source,window.ACTIVE_EMAIL,localPreview);

  if(!data||!Array.isArray(data.tasks)||!Array.isArray(data.assets)||!Array.isArray(data.logs)||!Array.isArray(data.requests))throw new Error('File phải có tasks, assets, logs và requests dạng danh sách.');
  if(data.tasks.length>10000)throw new Error('Bản xem local hỗ trợ tối đa 10.000 task.');
  const keys=new Set();
  data.tasks=data.tasks.map((t,i)=>{if(!t||typeof t!=='object')throw new Error('Dòng task không hợp lệ.');let key='task-row-'+(t.row||i+2);if(keys.has(key))key+='-'+i;keys.add(key);return {...t,key,row:t.row||i+2};});
  data.users=Array.isArray(data.users)?data.users:[];data.taskActivity=Array.isArray(data.taskActivity)?data.taskActivity:[];
  data.options=data.options||data.taskMeta?.options||{pics:[]};
  data.meta={...app.data?.meta,...data.meta};
  for(const key of ['taskSheetUrl','assetSheetUrl','deploymentUrl']) {
    const url=safeURL(data.meta[key]);
    if(!url)throw new Error('Thiếu hoặc sai đường dẫn nguồn: '+key);
    data.meta[key]=url;
  }
  return data;
}
async function load(isInitial = false) {
  if($('refresh')) { $('refresh').disabled=true; $('refresh').style.opacity='0.5'; }
  try {
    let raw;
    if (isInitial && typeof window !== 'undefined' && window.SERVER_DATA) {
      raw = window.SERVER_DATA;
      app.data=validateData(raw); setupFilters(); render();
      if(typeof window.checkAccessGate === 'function') window.checkAccessGate();
      const sharedAsset=sharedAssetCode(); if(sharedAsset)openAssetFromQR(sharedAsset,{updateURL:false});
      // Background update
      if (typeof google !== 'undefined' && google.script) {
          google.script.run.withSuccessHandler(res => {
              if(!res) return;
              app.data = validateData(res.data || res);
              setupFilters(); render();
          }).apiGetDashboardFresh();
      }
    } else {
      if (typeof google !== 'undefined' && google.script) {
          const ss = document.getElementById('source-status');
          if(ss) ss.innerHTML='<span class="status-dot"></span> Đang đồng bộ dữ liệu mới nhất…';
          raw = await new Promise((resolve, reject) => {
              google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).apiGetDashboardFresh();
          });
          if (raw && raw.data) raw = raw.data;
      } else {
          const response=await fetch('./data/snapshot.json',{cache:'no-store'});
          if(!response.ok)throw new Error('Không đọc được snapshot.json');
          raw = await response.json();
      }
      app.data=validateData(raw); setupFilters(); render();
      if(typeof window.checkAccessGate === 'function') window.checkAccessGate();
      const sharedAsset=sharedAssetCode(); if(sharedAsset)openAssetFromQR(sharedAsset,{updateURL:false});
    }
  } catch(error) {
    if(!app.data) {
        const ac = document.getElementById('analysis-content');
        if(ac) ac.innerHTML=empty('Chưa tải được dữ liệu', error.message) + '<br><br><div style="text-align:center"><button class="primary-link" onclick="document.getElementById(\'import-data\').click()">Nhập file snapshot.json</button></div>';
    }
    toast(error.message);
  } finally {
    if($('refresh')) { $('refresh').disabled=false; $('refresh').style.opacity='1'; }
  }
}
function setupFilters() {
  $('pic-filter').innerHTML=options(app.data.options.pics||[],'Tất cả PIC',app.pic);
  $('department-filter').innerHTML=options(app.data.options.departments||[],'Tất cả phòng ban',app.department);
  $('pic-filter').value = app.pic;
  $('department-filter').value = app.department;
  const admin=app.data.currentUser||app.data.users[0]||{name:'Workspace',role:'Local preview'};
  $('header-user').innerHTML=`<button id="refresh" title="Đồng bộ dữ liệu" onclick="load()" style="display:flex; align-items:center; gap:6px; height: 38px; padding:0 14px; border-radius:12px; background:#eff4f9; border:none; cursor:pointer; font-size:12px; font-weight:700; color:var(--text); transition: background 0.2s;"><svg style="width:14px;height:14px"><use href="#refresh"/></svg> Đồng bộ</button><div class="notif-dropdown-wrap" style="position:relative"><button class="header-icon" id="notif-bell" title="Thông báo" onclick="toggleNotifPanel()" style="position:relative;width:38px;height:38px;border-radius:12px;background:#eff4f9;border:none;cursor:pointer;display:grid;place-items:center"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span id="notif-badge" class="badge-dot" style="position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:#e74c3c;display:none"></span></button><div id="notif-panel" class="notif-panel" hidden></div></div><div class="profile-dropdown-wrap" style="position:relative"><button class="profile-trigger" style="display:flex;align-items:center;gap:12px;background:none;border:none;cursor:pointer;text-align:left;outline:none" onclick="toggleProfileMenu()">${avatar(admin)}<span style="display:flex;flex-direction:column"><strong>${esc(admin.name)}</strong><small style="color:#7e94b1;font-size:11px">${esc(admin.position||admin.role)}</small></span></button><div id="profile-dropdown" class="profile-dropdown" hidden><button onclick="app.view='profile';render();closeProfileMenu()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Hồ sơ cá nhân</button><button onclick="window.logoutDashboard?.();closeProfileMenu()" style="color:#a83950"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Đăng xuất</button></div></div>`;
  if($('live-link')) $('live-link').href=app.data.meta.deploymentUrl;
  const liveSource=typeof google!=='undefined'&&google.script;
  $('source-status').innerHTML='';
  const fetched=new Date(app.data.meta.fetchedAt);
  $('source-date').textContent='Snapshot: '+(Number.isNaN(fetched.getTime())?'chưa xác định':fetched.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}));
}
function render() {
  if(!app.data)return;
  
  const allowed=app.data.meta.allowedViews||['tasks','assets','profile'];
  if(!allowed.includes(app.view))app.view='tasks';
  document.querySelectorAll('[data-view]').forEach(el=>{el.hidden=!allowed.includes(el.dataset.view);el.style.display=el.hidden?'none':'';});
  document.querySelectorAll('[data-action="create-task"]').forEach(el=>el.hidden=!app.data.meta.canManage);

  document.body.dataset.mobileView=app.view;
  const overview=app.view==='overview';
  document.querySelector('.dashboard-grid').hidden=!overview;
  $('secondary-view').hidden=overview;
  $('filter-bar').hidden=!['overview','tasks'].includes(app.view);
  $('kpis').hidden=!overview;
  document.querySelectorAll('#nav [data-view], #mobile-nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===app.view);b.setAttribute('aria-current',b.dataset.view===app.view?'page':'false');});
  const titles={overview:['Dashboard','Bảng quản lí toàn bộ trạng thái của Management Hub'],tasks:['Management Task','Theo dõi công việc · Lọc theo PIC · Xem chi tiết từng task'],requests:['Yêu cầu mượn','Danh sách yêu cầu đăng ký mượn thiết bị'],logs:['Nhật ký mượn / trả','Lịch sử mượn và trả theo từng thiết bị'],assets:['Danh sách thiết bị','42 thiết bị và trạng thái đang được ghi nhận trong Sheet'],profile:['Hồ sơ cá nhân','Hồ sơ và thông tin nhận diện tài khoản cá nhân']};
  $('page-title').textContent=titles[app.view][0];$('page-subtitle').textContent=app.view==='assets'?`${app.data.assets.length} thiết bị và trạng thái đang được ghi nhận trong Sheet`:titles[app.view][1];
  document.querySelector('.page-eyebrow').textContent='WORKSPACE / '+(app.view==='overview'?'OVERVIEW':titles[app.view][0].toUpperCase());
  $('search').placeholder=['overview','tasks'].includes(app.view)?'Tìm task, PIC, dự án…':'Tìm mã, thiết bị, người mượn…';
  $('search').setAttribute('aria-label',$('search').placeholder.replace('…',''));
  if(!overview){renderSecondary();return;}
  const rows=currentRows(),s=summarize(rows,new Date());
  const pending=app.data.requests.filter(r=>!r.borrowDecision||normalize(r.borrowDecision).includes('cho duyet'));
  const borrowing=app.data.assets.filter(a=>normalize(a.status)==='dang muon');
  const kpis=[['open','Task đang mở',s.open,'Cần theo dõi','list','blue'],['requests','Yêu cầu chờ duyệt',pending.length,'Manager review','clock','amber'],['assets','Đang mượn',borrowing.length,'Mã thiết bị','box','blue'],['done','Hoàn tất',s.done,'Task đã đóng','check','green']];
  $('kpis').innerHTML=kpis.map(([key,label,value,note,ic,tone])=>`<button class="kpi-card" data-kpi="${key}"><span class="kpi-label">${label}</span><span class="kpi-icon ${tone}">${icon(ic)}</span><strong class="kpi-value">${num(value)}</strong><span class="kpi-note">${note} ${icon('arrow')}</span></button>`).join('');
  renderAnalysis(rows);renderActivity();renderDeadline(rows);renderTeam(rows);
}
const peopleForSpotlight=t=>people(t);
function spotlightGroups(rows) {return groupProjects(app.tab==='campaigns'?rows.filter(isCampaign):app.tab==='projects'?rows.filter(t=>!isCampaign(t)):rows).sort((a,b)=>b.overdue-a.overdue||b.open-a.open||a.name.localeCompare(b.name));}
function selectedSpotlightGroup(rows) {const groups=spotlightGroups(rows);return groups.find(g=>g.key===app['selectedGroup_'+app.tab])||groups[0];}
function renderAnalysis(rows) {
  $('performance-view').value=['performance','staff'].includes(app.tab)?'performance':app.tab;
  $('analysis-tabs').hidden=!['performance','staff'].includes(app.tab);
  $('performance-summary').hidden=app.tab!=='staff';
  if(app.tab==='staff')renderManagementSummary(rows);
  $('analysis-tabs').querySelectorAll('button').forEach(b=>{const on=b.dataset.tab===app.tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
  const descriptions={performance:'Tiến độ & khối lượng theo nhân sự · Chọn mũi tên để đổi người',staff:'Phân bổ công việc · Mỗi PIC được tính cả task đồng phụ trách',projects:'Toàn bộ nhóm Dự án / Campaign · Ưu tiên nhóm quá hạn, sau đó đến khối lượng đang mở',campaigns:'Campaign suy ra từ tên chứa Campaign hoặc CP · Lịch đăng là kế hoạch, không xác nhận đã xuất bản'};
  $('analysis-description').textContent=descriptions[app.tab];
  if(!rows.length){$('analysis-content').innerHTML=empty('Không có task phù hợp','Đổi từ khóa, PIC hoặc nhấn Đặt lại bộ lọc.');return;}
  if(app.tab==='staff'){renderStaff(rows);return;}
  const grouped=['projects','campaigns'].includes(app.tab),groups=grouped?spotlightGroups(rows):[],group=grouped?selectedSpotlightGroup(rows):null;
  const people=staff(rows);
  const person=grouped?(group?{name:group.name,pic:group.name,tasks:group.tasks}:null):(people.find(p=>normalize(p.pic)===normalize(app.selectedPic))||people[0]);
  if(!person){$('analysis-content').innerHTML=empty(grouped?'Không có nhóm phù hợp':'Không có nhân sự phù hợp','Đổi PIC hoặc xóa bộ lọc để xem phân tích.');return;}
  if(grouped)app['selectedGroup_'+app.tab]=group.key;else app.selectedPic=person.pic;
  const pt=person.tasks||[],m=managementMetrics(pt,new Date()),pct=Math.round(m.completion);
  const subjectLabel=app.tab==='campaigns'?'CAMPAIGN':grouped?'PROJECT':'STAFF';
  const state=m.total===m.cancelled?'Không có task hiệu lực':m.overdue?'Cần xử lý quá hạn':!m.open?'Đã hoàn tất':m.undated||m.unassigned?'Cần bổ sung kế hoạch':'Đang triển khai';
  const urgent=pt.filter(t=>isOpen(t)&&/high|urgent/.test(normalize(t.priority))).length;
  const projects=groupProjects(pt,new Date()).filter(g=>g.open).length;
  const h=health(pt);
  $('analysis-content').innerHTML=`${grouped?`<div class="group-spotlight-picker"><label for="spotlight-group">${app.tab==='campaigns'?'Campaign':'Dự án'}</label><select id="spotlight-group">${groups.map(g=>`<option value="${esc(g.key)}" ${g.key===group.key?'selected':''}>${esc(g.name)}</option>`).join('')}</select><span>${groups.findIndex(g=>g.key===group.key)+1} / ${groups.length}</span></div>`:''}<div class="analysis-grid reference-insights">
    <article class="profile-card">
      <div class="card-heading"><span class="eyebrow">${subjectLabel} SPOTLIGHT</span><button class="icon-button" data-action="staff-detail" title="Xem công việc của ${esc(person.pic)}" aria-label="Xem công việc của ${esc(person.pic)}">${icon('arrow')}</button></div>
      <div class="profile-switch"><button class="icon-button" ${grouped?'data-group-step="-1"':'data-person-step="-1"'} title="Trước" aria-label="${grouped?'Nhóm trước':'Nhân sự trước'}">${icon('left')}</button><div class="profile-orbit" style="--progress:${pct}%" role="img" aria-label="${pct}% task hoàn thành">${grouped?`<span class="avatar big-avatar group-avatar">${icon(app.tab==='campaigns'?'calendar':'box')}</span>`:avatar(person,'big-avatar')}<span class="orbit-badge">${icon('check')}</span></div><button class="icon-button" ${grouped?'data-group-step="1"':'data-person-step="1"'} title="Tiếp theo" aria-label="${grouped?'Nhóm tiếp theo':'Nhân sự tiếp theo'}">${icon('right')}</button></div>
      <h3>${esc(person.name||person.pic)}</h3><p class="profile-role">${grouped?badge(state,m.overdue?'red':!m.open?'green':'blue'):esc(person.position||person.role||'Thành viên')}</p><span class="chip">${grouped?`${m.total} task <span>·</span> ${m.cancelled} đã hủy`:esc(person.pic)+' · '+esc(person.department||'Chưa cập nhật phòng ban')}</span>${grouped?`<p class="group-people">${esc([...new Set(pt.flatMap(peopleForSpotlight))].join(', ')||'Chưa có PIC')}</p>`:''}
      <div class="profile-metrics"><button class="metric-btn" data-management="open" aria-label="Đang mở"><strong>${num(m.open)}</strong><span>Đang mở</span></button><button class="metric-btn" data-management="done" aria-label="Hoàn tất"><strong>${num(m.done)}</strong><span>Hoàn tất</span></button><button class="metric-btn" data-management="has-pic-proj" aria-label="${grouped?'PIC':'Dự án'}"><strong>${num(grouped?m.pics:projects)}</strong><span>${grouped?'PIC':'Dự án mở'}</span></button></div>
      <button class="text-button" data-action="staff-detail">Xem ${pt.length} công việc ${icon('arrow')}</button>
    </article>
    <article class="metric-card"><div class="card-heading"><span>Tiến độ hoàn thành</span><button class="info-button" data-info="completion" aria-label="Cách tính tỷ lệ hoàn thành">${icon('info')}</button></div><div class="ring" style="--progress:${pct}%"><div><strong>${m.total-m.cancelled?pct+'<small>%</small>':'—'}</strong><span>hoàn thành</span></div></div><p class="small muted">${m.done} / ${m.total-m.cancelled} task được giao</p><div class="legend"><span><i class="dot green"></i>Done</span><span><i class="dot blue"></i>Đang mở</span></div></article>
    <article class="metric-card ${m.overdue?'focus-spotlight':''}"><div class="card-heading"><span>Cần tập trung</span>${icon('clock')}</div><button class="focus-count" data-management="overdue" aria-label="Task quá hạn" style="${m.overdue?'':'color:var(--text)'}"><span>${num(m.overdue)}</span></button><span class="badge ${m.overdue?'red':'green'}">${m.overdue?'task quá hạn':'Không có task quá hạn'}</span><button class="focus-card focus-link" data-management="dueSoon"><span>Deadline trong 3 ngày</span><strong>${num(m.dueSoon)}</strong></button><button class="focus-card focus-link" data-management="urgent"><span>Ưu tiên High / Urgent</span><strong>${num(urgent)}</strong></button><div class="focus-microbar" role="img" aria-label="${m.overdue} quá hạn, ${m.dueSoon} đến hạn trong 3 ngày, ${m.undated} chưa có hạn, ${m.open-m.overdue-m.dueSoon-m.undated} còn lại"><i style="width:${m.open?m.overdue/m.open*100:0}%;background:#cc5267"></i><i style="width:${m.open?m.dueSoon/m.open*100:0}%;background:#e6ae4f"></i><i style="width:${m.open?(m.open-m.overdue-m.dueSoon-m.undated)/m.open*100:0}%;background:#78a9ef"></i><i style="width:${m.open?m.undated/m.open*100:0}%;background:#c2cfdf"></i></div><button class="focus-undated" data-management="undated"><span>Chưa có deadline</span><strong>${m.undated}</strong></button><button class="text-button" data-action="staff-open">Xem task đang mở ${icon('arrow')}</button></article>
    <article class="chart-card"><div class="card-heading"><div><strong>Lịch deadline</strong><p class="small muted">${esc(person.pic)} · ${periodLabel()}</p></div><div class="period-control" aria-label="Khoảng thời gian lịch deadline"><button data-period="week" class="${app.period==='week'?'active':''}" aria-pressed="${app.period==='week'}">Weekly</button><button data-period="month" class="${app.period==='month'?'active':''}" aria-pressed="${app.period==='month'}">Monthly</button></div></div>${deadlineChart(pt)}<p class="small muted chart-note">Theo ngày đến hạn · Không phải lịch sử hoàn thành</p></article>
  </div>
  <div class="insight-strip reference-insight"><div class="insight-icon">${icon('chart')}</div><div><strong>${m.dueSoon?`${person.pic} có ${m.dueSoon} task cần hoàn thành trong 3 ngày tới`:`${person.pic} đang theo dõi ${m.open} task chưa hoàn thành`}</strong><p>${m.undated?`${m.undated} task đang mở chưa có deadline. Bổ sung hạn để theo dõi chính xác.`:'Các task đang mở đã được đặt deadline.'}</p></div><button class="icon-button" data-action="staff-open" aria-label="Mở danh sách task cần theo dõi">${icon('arrow')}</button></div>
  ${grouped&&app.tab==='campaigns'?`<div class="campaign-context"><span>Kênh: ${esc(m.platforms.join(' · ')||'Chưa cập nhật')}</span><button class="text-button" data-management="upcomingAir"><span>Lịch đăng 7 ngày tới</span><strong>${m.upcomingAir}</strong>${icon('arrow')}</button></div>`:''}
  <button class="health-strip" data-action="spotlight-health">${icon('info')}<span>Chất lượng dữ liệu <b>${num(h.missingDeadline)} thiếu hạn</b><b>${num(h.missingPic)} thiếu PIC</b><b>${num(h.duplicateIds.length)} mã trùng</b></span>${icon('arrow')}</button>`;
}
function periodLabel(){const now=new Date();if(app.period==='month')return 'Tháng '+(now.getMonth()+1)+'/'+now.getFullYear();const start=new Date(now);start.setDate(now.getDate()-((now.getDay()+6)%7));const end=new Date(start);end.setDate(start.getDate()+6);return start.toLocaleDateString('vi-VN')+' — '+end.toLocaleDateString('vi-VN');}
function deadlineChart(rows){
  let bins;
  if(app.period==='week')bins=weeklyDeadlines(rows,new Date()).map((b,i)=>({...b,label:['T2','T3','T4','T5','T6','T7','CN'][i]}));
  else {const now=new Date();bins=Array.from({length:5},(_,i)=>({label:(i*7+1)+'–'+Math.min((i+1)*7,new Date(now.getFullYear(),now.getMonth()+1,0).getDate()),count:0,done:0,open:0}));for(const t of rows){const d=parseDate(t.deadline);if(d&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()&&!isCancelled(t)){const b=bins[Math.floor((d.getDate()-1)/7)];b.count++;if(isDone(t))b.done++;else b.open++;}}bins=bins.filter((b,i)=>i*7+1<=new Date(now.getFullYear(),now.getMonth()+1,0).getDate());}
  const max=Math.max(1,...bins.map(b=>b.count));
  return `<div class="bar-chart" role="img" aria-label="Số task theo deadline: ${esc(bins.map(b=>b.label+': '+b.count).join(', '))}">${bins.map(b=>`<div class="chart-column"><span class="bar-value">${b.count||'–'}</span><div class="bar-slot"><div class="chart-bar" style="height:${Math.max(4,b.count/max*100)}%;--done:${b.count?b.done/b.count*100:0}%" title="${esc(b.label)}: ${b.count} task, ${b.done} Done"></div></div><span>${esc(b.label)}</span></div>`).join('')}</div>`;
}
function comparisonChart(groups,kind) {
  const max=Math.max(1,...groups.map(g=>g.total-g.cancelled));
  return `<div class="comparison-heading"><strong>${kind==='staff'?'Khối lượng theo nhân sự':'Bản đồ tiến độ'}</strong><span class="small muted">Độ dài thanh = số task</span></div><div class="chart-legend"><span><i style="background:#239c83"></i>Hoàn tất</span><span><i style="background:#72a5ef"></i>Đang mở</span><span><i style="background:#d75568"></i>Quá hạn</span></div><div class="comparison-list">${groups.map(g=>{const total=g.total-g.cancelled;return `<button class="comparison-row" ${kind==='staff'?`data-select-person="${esc(g.pic)}"`:`data-project="${esc(g.name)}"`}><span class="comparison-name">${kind==='staff'?avatar(g):''}<span><strong>${esc(kind==='staff'?g.pic:g.name)}</strong><small>${g.open} đang mở${g.overdue?' · '+g.overdue+' quá hạn':''}</small></span></span><span class="comparison-track"><span class="comparison-stack" style="width:${total/max*100}%"><i style="width:${total?g.done/total*100:0}%;background:#239c83"></i><i style="width:${total?(g.open-g.overdue)/total*100:0}%;background:#72a5ef"></i><i style="width:${total?g.overdue/total*100:0}%;background:#d75568"></i></span></span><span class="comparison-value"><strong>${total?Math.round(g.completion)+'%':'—'}</strong><small>${total} task</small></span>${icon('arrow')}</button>`;}).join('')}</div><p class="small muted">Task hủy không tính vào thanh tiến độ. ${kind==='staff'?'Task nhiều PIC có thể xuất hiện ở nhiều người.':''}</p>`;
}
function renderStaff(rows){const list=staff(rows).sort((a,b)=>b.open-a.open);$('analysis-content').innerHTML=comparisonChart(list,'staff');}
function managementRows(rows) {
  if(['projects','campaigns'].includes(app.tab))return selectedSpotlightGroup(rows)?.tasks||[];
  if(app.tab==='performance') {
    const list=staff(rows),person=list.find(p=>normalize(p.pic)===normalize(app.selectedPic))||list[0];
    return person?.tasks||[];
  }
  return rows;
}
function renderManagementSummary(rows) {
  const scoped=managementRows(rows),m=managementMetrics(scoped),campaign=app.tab==='campaigns',active=m.total-m.cancelled;
  const selected=staff(rows).find(p=>normalize(p.pic)===normalize(app.selectedPic))||staff(rows)[0];
  const scope=app.tab==='performance'?`Nhân sự: ${selected?.pic||'Chưa có'}`:app.tab==='staff'?'Toàn đội ngũ':campaign?'Tổng quan Campaign':'Tổng quan dự án';
  const deadline=[['overdue','Quá hạn',m.overdue,'#d75568'],['dueSoon','Trong 3 ngày',m.dueSoon,'#e7ad40'],['later','Sau 3 ngày',m.open-m.overdue-m.dueSoon-m.undated,'#72a5ef'],['undated','Chưa có hạn',m.undated,'#b7c5d8']];
  const signals=[['urgent','ưu tiên cao',m.urgent],['feedback','chờ phản hồi',m.feedback],['unassigned','thiếu PIC',m.unassigned]];
  if(campaign)signals.push(['upcomingAir','lịch đăng / 7 ngày',m.upcomingAir]);
  $('performance-summary').innerHTML=`<div class="management-heading"><strong>${esc(scope)}</strong><span>${m.total} task · ${m.cancelled} đã hủy</span></div><div class="overview-canvas"><button class="completion-visual" data-management="all" aria-label="Tiến độ hoàn thành ${active?Math.round(m.completion)+'%':'chưa có task'}; xem tất cả task"><span class="summary-donut" style="--progress:${m.completion}%"><span><strong>${active?Math.round(m.completion)+'%':'—'}</strong><small>hoàn thành</small></span></span><span class="completion-caption"><b>${m.done}</b> / ${active} task hoàn tất</span></button><div class="deadline-distribution"><div class="distribution-title"><span>Áp lực deadline</span><button data-management="open"><span>Đang mở</span><strong>${m.open}</strong></button></div><div class="deadline-stack" role="img" aria-label="Phân bố ${m.open} task mở: ${deadline.map(d=>d[1]+': '+d[2]).join(', ')}">${deadline.map(([key,label,value,color])=>`<i style="width:${m.open?value/m.open*100:0}%;background:${color}" title="${label}: ${value}"></i>`).join('')}</div><div class="distribution-legend">${deadline.map(([key,label,value,color])=>`<button data-management="${key}"><i style="background:${color}"></i><span>${label}</span><strong>${value}</strong></button>`).join('')}</div></div></div><div class="signal-line">${signals.map(([key,label,value])=>`<button data-management="${key}"><strong>${value}</strong><span>${label}</span>${icon('arrow')}</button>`).join('')}</div><p class="chart-footnote">Tiến độ theo đầu việc, không phải năng suất. ${campaign?'Lịch đăng là kế hoạch, không xác nhận đã xuất bản.':'Bấm vào biểu đồ hoặc chú thích để xem công việc.'}</p>`;
}
function renderProjects(rows) {
  const groups=groupProjects(app.tab==='campaigns'?rows.filter(isCampaign):app.tab==='projects'?rows.filter(t=>!isCampaign(t)):rows).sort((a,b)=>b.overdue-a.overdue||b.open-a.open||a.name.localeCompare(b.name));
  $('analysis-content').innerHTML=groups.length?comparisonChart(groups,'projects'):empty('Không có nhóm phù hợp','Thử xóa bộ lọc hoặc chọn Project.');
}
window.toggleTeamList = (btn) => {
  const list = btn.nextElementSibling;
  const icon = btn.querySelector('.team-chev');
  if(list.hidden) {
    list.hidden = false;
    icon.style.transform = '';
  } else {
    list.hidden = true;
    icon.style.transform = 'rotate(-90deg)';
  }
};
function renderTeam(rows){
  const userList = app.data.users || [];
  if(!userList.length) { $('team-content').innerHTML = empty('Chưa có nhân sự','Kiểm tra dữ liệu USERS.'); return; }
  const depts = {};
  for(const u of userList) {
    const d = u.department || 'Chưa phân bổ';
    if(!depts[d]) depts[d] = [];
    depts[d].push(u);
  }
  const staffTaskMap = staff(rows).reduce((acc, p) => { acc[normalize(p.pic)] = p.open; return acc; }, {});
  let html = '';
  for(const [dept, members] of Object.entries(depts).sort((a,b)=>a[0].localeCompare(b[0]))) {
    const grouped=new Map();
    for(const person of members){const key=normalize(person.pic||person.email||person.name);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(person);}
    const uniqueMembers=[...grouped.values()].map(group=>({person:group.find(p=>/lead|leader|manager|trưởng|quản lý/i.test(p.role))||group[0],count:group.length}));
    uniqueMembers.sort((left, right) => {
       const a=left.person,b=right.person;
       const aL = /leader|manager|trưởng|quản lý/i.test(a.role) ? 1 : 0;
       const bL = /leader|manager|trưởng|quản lý/i.test(b.role) ? 1 : 0;
       if(aL !== bL) return bL - aL;
       return (staffTaskMap[normalize(b.pic)]||0) - (staffTaskMap[normalize(a.pic)]||0);
    });
    html += `<div class="team-group">
      <button class="team-group-header" onclick="toggleTeamList(this)" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 0;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer;font-weight:700;color:var(--text);font-size:12px;text-transform:uppercase;">
        <span>${esc(dept)} <span style="color:var(--muted);font-weight:400">(${uniqueMembers.length} PIC)</span></span>
        <svg class="team-chev" style="transition:transform 0.2s" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="team-group-list" style="padding-top:8px;padding-bottom:12px;">
        ${uniqueMembers.map(({person:p,count}) => {
          const open = staffTaskMap[normalize(p.pic)] || 0;
          return `<button class="team-row" data-select-person="${esc(p.pic)}">${avatar(p)}<span class="team-name"><strong>${esc(p.pic||p.name)}</strong><small>${count>1?esc(count+' hồ sơ · workload PIC chung'):esc(p.jobTitle||p.role||'Thành viên')}</small></span><span class="team-count">${num(open)}<small>mở</small></span></button>`;
        }).join('')}
      </div>
    </div>`;
  }
  $('team-content').innerHTML = html;
}
function renderDeadline(rows){const open=rows.filter(isOpen).filter(t=>dueDays(t,new Date())!==null);let focus=open.filter(t=>dueDays(t,new Date())>=0&&dueDays(t,new Date())<=3);let label='Deadline trong 3 ngày tới';focus.sort((a,b)=>parseDate(a.deadline)-parseDate(b.deadline));$('deadlines-content').innerHTML=`<p class="small muted">${label}</p><div class="task-list">${focus.slice(0,5).map(t=>{const days=dueDays(t,new Date());return `<button class="task-row" data-task="${esc(t.key)}"><span class="task-row-head"><span class="eyebrow">${esc(t.id)}</span>${priority(t)}</span><strong>${esc(taskTitle(t))}</strong><span class="small muted">${esc(t.pic||'Chưa có PIC')}</span><span class="due-label ${days<0?'overdue':''}">${icon('calendar')}${fmt(t.deadline)} · ${days<0?'Quá hạn':days===0?'Hôm nay':days+' ngày nữa'}</span></button>`;}).join('')||empty('Chưa có deadline','Task đang mở chưa có ngày đến hạn.')}</div>`;}
function renderActivity(){
  const events=[];
  for(const a of app.data.taskActivity){if(parseDate(a.timestamp))events.push({date:parseDate(a.timestamp),title:a.action,body:a.task||a.project,actor:a.actor||a.pic,type:'task',id:a.id});}
  const groups=new Map();
  const deptKey=value=>{const key=normalize(value);return ['desgin','design','design team'].includes(key)?'design':key;};
  const ownDept=deptKey(app.data.currentUser?.department);
  const visibleLogs=app.data.meta.isGlobalMgr?app.data.logs:app.data.logs.filter(l=>ownDept&&String(l.department||'').split(/[,;\n]/).some(part=>deptKey(part)===ownDept));
  for(const l of visibleLogs){for(const [time,kind,title] of [[l.timestamp,'borrow','Ghi nhận mượn thiết bị'],[l.returnTime,'return','Xác nhận trả thiết bị']]){const date=parseDate(time);if(!date)continue;const key=time+'|'+kind+'|'+l.applicant;const item=groups.get(key)||{date,title,actor:l.applicant,body:[],type:'asset'};item.body.push(l.code);groups.set(key,item);}}
  for(const e of groups.values())events.push({...e,body:[...new Set(e.body)].join(' · ')});
  events.sort((a,b)=>b.date-a.date);
  const note=app.data.taskActivity.length?'Lịch sử từ các tab nguồn':'Chưa có lịch sử Task · Đang hiển thị nhật ký tài sản';
  $('activity-content').innerHTML=`<p class="activity-source small muted">${note}</p><div class="activity-list">${events.slice(0,3).map((e,i)=>`<div class="activity-row"><span class="activity-icon ${i===0?'green':'blue'}">${icon(e.type==='task'?'check':'box')}</span><div><strong>${esc(e.actor||'Hệ thống')}</strong><p>${esc(e.title)}</p><small>${esc(e.body)}</small></div><time datetime="${e.date.toISOString()}">${e.date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}<small>${e.date.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</small></time></div>`).join('')||empty('Chưa có hoạt động','Nguồn dữ liệu chưa có nhật ký.')}</div><button class="text-button" data-action="activity-detail">Xem lịch sử & nguồn dữ liệu ${icon('arrow')}</button>`;
}

function renderTaskCard(t) {
  return `<div class="project-card" style="cursor:pointer" onclick="showTask('${esc(t.key)}')">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span class="badge ${dueDays(t,new Date())<0&&isOpen(t)?'red':'neutral'}">${fmt(t.deadline)}</span>
      ${priority(t)}
    </div>
    <h3 style="margin:5px 0 10px;font-size:14px;line-height:1.4">${esc(taskTitle(t))}</h3>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:15px;border-top:1px solid #edf2f8;padding-top:12px">
      <span style="font-size:11px;color:#7e94b1;display:flex;align-items:center;gap:6px">${icon('users')} ${esc(t.pic||'Chưa giao')}</span>
      ${statusBadge(t)}
    </div>
  </div>`;
}
function taskTableRaw(rows){return rows.length?`<div class="table-wrap"><table class="task-table" style="table-layout:fixed;width:100%"><thead><tr><th style="width:10%">Mã / Dòng</th><th style="width:32%">Công việc</th><th style="width:12%">PIC</th><th style="width:14%">Deadline</th><th style="width:10%">Ưu tiên</th><th style="width:12%">Trạng thái</th><th style="width:10%"></th></tr></thead><tbody>${rows.map(t=>`<tr class="task-row-hoverable"><td><strong>${esc(t.id||'—')}</strong><small>Dòng ${t.row}</small></td><td class="task-name-cell"><button data-task="${esc(t.key)}">${esc(taskTitle(t))}</button><small>${esc(t.project||'Chưa gắn dự án')}</small></td><td>${esc(t.pic||'Chưa giao')}</td><td class="${dueDays(t,new Date())<0&&isOpen(t)?'overdue':''}">${fmt(t.deadline)}</td><td>${priority(t)}</td><td>${statusBadge(t)}</td><td class="task-hover-actions"><button class="task-act-done" title="Đánh dấu hoàn thành" onclick="event.stopPropagation();completeTask('${esc(t.key)}',this)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></button><button class="task-act-delete" title="Xóa task" onclick="event.stopPropagation();deleteTask('${esc(t.id)}',this)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td></tr>`).join('')}</tbody></table></div>`:empty('Không có task phù hợp','Thử bật task Done hoặc xóa bộ lọc.');}
function taskTable(allRows, hideFilterBar=false){
  if(hideFilterBar) return taskTableRaw(allRows);
  const uid='tt'+Date.now();
  window['_ttData_'+uid]=allRows;
  const statuses=[...new Set(allRows.map(t=>t.status).filter(Boolean))];
  const pics=[...new Set(allRows.flatMap(people).filter(Boolean))].sort();
  const statusOpts=statuses.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const picOpts=pics.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const filterSvg=`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;
  const searchSvg=`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  const userSvg=`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const hideDone=allRows.some(isDone);
  const filtered=hideDone?allRows.filter(t=>!isDone(t)):allRows;
  return `<div class="modal-filter-bar" id="mfb-${uid}">
    <div class="mfb-summary"><strong>${filtered.length}</strong><span> / ${allRows.length} task</span><span id="mfb-done-badge-${uid}" class="badge green" style="margin-left:8px;font-size:10px;${hideDone?'':'display:none'}">Ẩn Done</span></div>
    <div class="mfb-icons-inline">
      <div class="mfb-filter-group" id="mfb-grp-status-${uid}">
        <button class="mfb-icon" onclick="toggleModalFilter('${uid}','status')" title="Lọc trạng thái">${filterSvg}</button>
        <select id="mfb-status-${uid}" onchange="applyModalFilter('${uid}')" class="mfb-inline-input"><option value="all">Mọi trạng thái</option>${statusOpts}</select>
        <label class="mfb-done-toggle" id="mfb-done-lbl-${uid}"><input type="checkbox" id="mfb-done-${uid}" onchange="applyModalFilter('${uid}')"> Hiện task Done</label>
      </div>
      <div class="mfb-filter-group" id="mfb-grp-pic-${uid}">
        <button class="mfb-icon" onclick="toggleModalFilter('${uid}','pic')" title="Lọc PIC">${userSvg}</button>
        <select id="mfb-pic-${uid}" onchange="applyModalFilter('${uid}')" class="mfb-inline-input"><option value="all">Tất cả PIC</option>${picOpts}</select>
      </div>
      <div class="mfb-filter-group" id="mfb-grp-search-${uid}">
        <button class="mfb-icon" onclick="toggleModalFilter('${uid}','search')" title="Tìm kiếm">${searchSvg}</button>
        <input id="mfb-search-${uid}" type="search" placeholder="Tìm task, dự án..." oninput="applyModalFilter('${uid}')" class="mfb-inline-input">
      </div>
    </div>
  </div>
  <div id="mfb-table-${uid}">${taskTableRaw(filtered)}</div>`;
}
window.toggleModalFilter=function(uid,type){
  const grp=document.getElementById('mfb-grp-'+type+'-'+uid);
  if(!grp)return;
  const isActive = grp.classList.contains('mfb-active');
  // close all
  ['status','pic','search'].forEach(t=>{
    const g=document.getElementById('mfb-grp-'+t+'-'+uid);
    if(g) g.classList.remove('mfb-active');
  });
  if(!isActive) {
    grp.classList.add('mfb-active');
    const input = grp.querySelector('.mfb-inline-input');
    if(input && input.tagName==='INPUT') setTimeout(()=>input.focus(), 300);
  }
};
window.applyModalFilter=function(uid){
  const allRows=window['_ttData_'+uid];if(!allRows)return;
  const sv=document.getElementById('mfb-status-'+uid)?.value||'all';
  const pv=document.getElementById('mfb-pic-'+uid)?.value||'all';
  const q=normalize(document.getElementById('mfb-search-'+uid)?.value||'');
  const showDone=document.getElementById('mfb-done-'+uid)?.checked;
  let filtered=allRows;
  if(!showDone&&sv==='all')filtered=filtered.filter(t=>!isDone(t));
  if(sv!=='all')filtered=filtered.filter(t=>t.status===sv);
  if(pv!=='all')filtered=filtered.filter(t=>people(t).some(p=>normalize(p)===normalize(pv)));
  if(q)filtered=filtered.filter(t=>normalize(t.task+' '+t.project+' '+t.pic+' '+t.id).includes(q));
  const tableEl=document.getElementById('mfb-table-'+uid);
  const summaryEl=document.getElementById('mfb-'+uid)?.querySelector('.mfb-summary');
  if(tableEl)tableEl.innerHTML=taskTableRaw(filtered);
  if(summaryEl)summaryEl.innerHTML=`<strong>${filtered.length}</strong><span> / ${allRows.length} task</span><span class="badge green" style="margin-left:8px;font-size:10px;${showDone||!allRows.some(isDone)?'display:none':''}">Ẩn Done</span>`;
};
function renderSecondary(){
  
  if(app.view==='profile'){
    const user = app.data.currentUser || app.data.users.find(u => u.email === (app.data.meta.email || window.ACTIVE_EMAIL)) || {name: 'Admin', role: 'Quản lý', pic: 'ADMIN', email: (app.data.meta.email || window.ACTIVE_EMAIL)};
    const ownTasks = app.data.tasks.filter(t => normalize(t.pic) === normalize(user.pic));
    const open = ownTasks.filter(isOpen);
    const done = ownTasks.filter(isDone);
    const overdue = open.filter(t => dueDays(t, new Date()) !== null && dueDays(t, new Date()) < 0);
    const feedback = open.filter(t => normalize(t.status).includes('feedback'));
    
    const avatarInner = user.avatarUrl
      ? `<img src="${esc(user.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${esc(initials(user.name))}</div>`;
    
    let html = '<main class="profile-shell"><section class="profile-hero"><div class="profile-identity">';
    html += `<div class="profile-avatar-lg" style="position:relative;cursor:pointer" onclick="document.getElementById('avatar-upload').click()">
      ${avatarInner}
      <div style="position:absolute;bottom:0;right:0;width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #e1ecfa;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.12)">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#2775d9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </div>
      <input type="file" id="avatar-upload" accept="image/png,image/jpeg,image/webp" hidden onchange="window.handleAvatarUpload(this)">
    </div>`;
    html += `<div><h3>${esc(user.name)}</h3><p class="profile-role">${esc(user.role)} <span>· ${esc(user.department||'K Coffee Management Hub')}</span></p><p class="profile-note">${esc(user.note||'Hồ sơ này dùng để nhận diện quyền truy cập và công việc được giao.')}</p></div></div>`;
    html += `<div class="profile-hero-meta"><div class="profile-meta"><span>Mã tài khoản</span><b>${esc(user.employeeId||user.email?.split('@')[0]||'—')}</b></div><div class="profile-meta"><span>Email</span><b>${esc(user.email||'—')}</b></div><div class="profile-meta"><span>PIC</span><b>${esc(user.pic||'—')}</b></div><div class="profile-meta"><span>Trạng thái</span><b class="profile-online">${user.active!==false?'Đang hoạt động':'Tạm ngưng'}</b></div></div>`;
    html += '</section>';
    html += '<section class="profile-grid"><div class="profile-stack"><article class="profile-card">';
    html += '<div class="profile-card-head"><h3>Thông tin cá nhân</h3><small>Đồng bộ từ USERS</small></div>';
    html += '<div class="profile-data-grid">';
    html += `<div class="profile-data"><span>Họ và tên</span><b>${esc(user.name||'Chưa cập nhật')}</b></div>`;
    html += `<div class="profile-data"><span>Vai trò</span><b>${esc(user.role||'Chưa cập nhật')}</b></div>`;
    html += `<div class="profile-data"><span>Phòng ban</span><b>${esc(user.department||'Chưa cập nhật')}</b></div>`;
    html += `<div class="profile-data"><span>Chức vụ</span><b>${esc(user.jobTitle||'Chưa cập nhật')}</b></div>`;
    html += `<div class="profile-data"><span>Số điện thoại</span><b>${esc(user.phone||'Chưa cập nhật')}</b></div>`;
    html += `<div class="profile-data"><span>Email đăng nhập</span><b>${esc(user.email||'—')}</b></div>`;
    html += '</div></article></div>';
    html += `<article class="profile-card"><div class="profile-card-head"><div><h3>Công việc của tôi</h3><small>${esc(user.pic?'Theo PIC '+user.pic:'PIC chưa được liên kết')}</small></div></div>`;
    html += `<div class="profile-task-summary"><div class="profile-task-stat"><b style="color:var(--brand)">${open.length}</b><span>Đang mở</span></div><div class="profile-task-stat"><b style="color:var(--red)">${overdue.length}</b><span>Quá hạn</span></div><div class="profile-task-stat"><b style="color:var(--amber)">${feedback.length}</b><span>Feedback</span></div><div class="profile-task-stat"><b style="color:var(--green)">${done.length}</b><span>Đã hoàn tất</span></div></div>`;
    
    if(ownTasks.length){
      html += '<div class="profile-task-list">' + ownTasks.slice(0,5).map(task => {
        const late = isOpen(task) && dueDays(task, new Date()) !== null && dueDays(task, new Date()) < 0;
        return `<button class="profile-task-row" type="button" onclick="showTask('${esc(task.key)}')"><span class="profile-task-row-icon">${icon('check')}</span><span class="profile-task-row-main"><b>${esc(taskTitle(task))}</b><span>${esc(task.id||'')} · ${esc(task.project||'')} · ${esc(task.status||'')}</span></span><time class="${late?'overdue':''}">${esc(late?'Quá hạn':'Hạn '+fmt(task.deadline))}</time></button>`;
      }).join('') + '</div>';
    } else {
      html += '<div class="profile-empty">Chưa có Task được gắn trực tiếp với PIC của tài khoản này.</div>';
    }
    html += '</article></section></main>';
    
    $('secondary-view').innerHTML = html;
    return;
  }
  if(app.view==='tasks'){
    let rows=filterTasks(currentRows(),{hideDone:app.hideDone,status:app.taskStatus});
    rows=[...rows].sort((a,b)=>app.sort==='deadline'?(parseDate(a.deadline)?.getTime()||Infinity)-(parseDate(b.deadline)?.getTime()||Infinity):String(a.id).localeCompare(String(b.id),undefined,{numeric:true})||a.row-b.row);
    $('secondary-view').innerHTML=`<div class="list-toolbar"><div><strong>${rows.length} task</strong><span class="muted"> · Mỗi dòng nguồn là một task riêng</span></div><div class="toolbar-controls"><label><input id="show-done" type="checkbox" ${app.hideDone?'':'checked'}> Hiện task Done</label><select id="status-filter" aria-label="Lọc trạng thái">${options(app.data.options.statuses||[],'Mọi trạng thái',app.taskStatus)}</select><select id="sort-tasks" aria-label="Sắp xếp task"><option value="id" ${app.sort==='id'?'selected':''}>Theo mã ID</option><option value="deadline" ${app.sort==='deadline'?'selected':''}>Deadline gần nhất</option></select></div></div>${taskTable(rows, true)}`;
    return;
  }
  let filterHtml='';
  let rows=app.data[app.view].filter(r=>normalize(Object.values(r).join(' ')).includes(normalize(app.query)));
  const columns=app.view==='assets'?[['code','Mã thiết bị'],['model','Thiết bị'],['group','Nhóm'],['status','Trạng thái'],['borrower','Người mượn'],['deadline','Hạn trả'], ['action', '']]:app.view==='requests'?[['name','Người đăng ký'],['equipment','Mã thiết bị'],['borrowDate','Ngày mượn'],['returnDate','Ngày trả'],['borrowDecision','Quyết định']]:[['timestamp','Thời gian'],['applicant','Người mượn'],['code','Thiết bị'],['status','Trạng thái'],['returnDecision','Xác nhận trả']];
  

  
  if(app.view==='logs'){
    const isReturn = app.logTab === 'return';
    let rows = app.data.logs.filter(l=>normalize(Object.values(l).join(' ')).includes(normalize(app.query))).filter(l => isReturn ? (normalize(l.status) === 'da tra' || normalize(l.status) === 'hoan tat') : (normalize(l.status) !== 'da tra' && normalize(l.status) !== 'hoan tat'));
    
    const statuses = [...new Set(app.data.logs.map(a=>a.status).filter(Boolean))];
    const formOpts = (items, placeholder, selected) => `<option value="all">${placeholder}</option>` + (items||[]).map(i => `<option value="${esc(i)}" ${i===selected?'selected':''}>${esc(i)}</option>`).join('');
    
    let filterHtml = `<div class="filter-bar" style="margin-left:auto;display:flex;gap:10px;">
      <input type="search" data-log-search placeholder="Tìm người mượn, thiết bị..." value="${esc(app.logSearch||'')}" oninput="app.logSearch=this.value;const pos=this.selectionStart;renderSecondary();const field=document.querySelector('[data-log-search]');field?.focus();field?.setSelectionRange(pos,pos)" style="width:180px;padding:8px 12px;border-radius:20px;border:1px solid var(--line);font-size:13px;outline:none;background:#fff">
      <select onchange="app.logStatus=this.value;renderSecondary()" style="padding:8px 12px;border-radius:20px;border:1px solid var(--line);font-size:13px;outline:none;background:#fff;cursor:pointer">${formOpts(statuses,'Lọc trạng thái',app.logStatus)}</select>
    </div>`;
    
    if(app.logStatus && app.logStatus !== 'all') rows = rows.filter(r=>r.status===app.logStatus);
    if(app.logSearch) {
      const q = normalize(app.logSearch);
      rows = rows.filter(r => normalize(r.applicant).includes(q) || normalize(r.assetCode||r.code).includes(q) || normalize(r.assetName||r.model).includes(q) || normalize(r.department).includes(q));
    }

    $('secondary-view').innerHTML=`<div class="list-toolbar" style="display:flex;align-items:center;margin-bottom:20px">
      <div class="analysis-tabs" style="margin-bottom:0; max-width: 300px">
        <button class="${!isReturn ? 'active' : ''}" onclick="app.logTab='borrow'; renderSecondary()">Nhật ký Mượn</button>
        <button class="${isReturn ? 'active' : ''}" onclick="app.logTab='return'; renderSecondary()">Nhật ký Trả</button>
      </div>
      ${filterHtml}
    </div>` + (rows.length?`<div class="table-wrap"><table class="task-table"><thead><tr><th>Thời gian</th><th>Người đăng ký</th><th>Thiết bị</th><th>Mục đích</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(l=>`<tr data-detail=\"logs\" data-id=\"${esc(l.id||l.key||l.timestamp)}\" style=\"cursor:pointer\"><td style=\"white-space:nowrap\"><strong>${fmt(l.timestamp)}</strong></td><td><strong>${esc(l.applicant)}</strong><small>${esc(l.pic||l.department)}</small></td><td>${esc(l.assetName||l.model||l.code||l.assetCode||'—')} <small>${esc(l.assetName?(l.assetCode||l.code||''):'')}</small></td><td>${esc(l.purpose)}</td><td>${formatStatusBadge(l.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có nhật ký','Không có dữ liệu trong mục này.'));
    return;
  }
if(app.view==='assets'){
    const groups = [...new Set(app.data.assets.map(a=>a.group).filter(Boolean))];
    const locs = [...new Set(app.data.assets.map(a=>a.location).filter(Boolean))];
    const formOpts = (items, placeholder, selected) => `<option value="all">${placeholder}</option>` + (items||[]).map(i => `<option value="${esc(i)}" ${i===selected?'selected':''}>${esc(i)}</option>`).join('');
    filterHtml = `<div class="filter-bar" style="margin-left:auto;display:flex;gap:10px;">
      <input type="search" data-asset-search placeholder="Tìm thiết bị, model..." value="${esc(app.assetSearch||'')}" oninput="app.assetSearch=this.value;const pos=this.selectionStart;renderSecondary();const field=document.querySelector('[data-asset-search]');field?.focus();field?.setSelectionRange(pos,pos)" style="width:180px;padding:8px 12px;border-radius:20px;border:1px solid var(--line);font-size:13px;outline:none;background:#fff">
      <select onchange="app.assetGroup=this.value;renderSecondary()" style="padding:8px 12px;border-radius:20px;border:1px solid var(--line);font-size:13px;outline:none;background:#fff;cursor:pointer">${formOpts(groups,'Lọc nhóm',app.assetGroup)}</select>
      <select onchange="app.assetLoc=this.value;renderSecondary()" style="padding:8px 12px;border-radius:20px;border:1px solid var(--line);font-size:13px;outline:none;background:#fff;cursor:pointer">${formOpts(locs,'Lọc vị trí',app.assetLoc)}</select>
      <div style="position:relative;display:inline-block" id="cart-container-wrap">
  <button class="primary-link" style="display:flex;align-items:center;gap:6px;border:none;cursor:pointer;border-radius:20px;padding:8px 16px;background:var(--green);color:#fff;transition:all 0.2s;font-weight:600" id="btn-borrow-main" onclick="toggleCartPopover(event)">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
    Giỏ mượn
  </button>
</div>
    </div>`;
    if(app.assetGroup && app.assetGroup !== 'all') rows = rows.filter(r=>r.group===app.assetGroup);
    if(app.assetLoc && app.assetLoc !== 'all') rows = rows.filter(r=>r.location===app.assetLoc);
    if(app.assetSearch) {
      const q = normalize(app.assetSearch);
      rows = rows.filter(r => normalize(r.code).includes(q) || normalize(r.model).includes(q) || normalize(r.group).includes(q));
    }
  }
  $('secondary-view').innerHTML=`<div class="list-toolbar" style="display:flex;align-items:center;"><strong>${rows.length} bản ghi</strong>${filterHtml}</div>${rows.length?`<div class="table-wrap"><table class="task-table"><thead><tr>${columns.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr data-detail=\"${app.view}\" data-id=\"${esc(r.id||r.key||r.code||r.timestamp)}\" tabindex=\"0\" role=\"button\" aria-label=\"Mở chi tiết ${esc(app.view==='requests'?'yêu cầu mượn':'bản ghi')}\" style=\"cursor:pointer\">${columns.map(([key])=>`<td>${key==='action' ? (
  (app.selectedAssets||[]).includes(r.model)
  ? `<button type="button" data-model="${esc(r.model)}" style="border:none;border-radius:20px;padding:4px 12px;background:#2563eb;color:#fff;font-size:11px;font-weight:600;cursor:pointer" onclick="event.stopPropagation()">Đang trong giỏ</button>`
  : (normalize(r.status)==='dang muon'
    ? `<button type="button" style="border:none;border-radius:20px;padding:4px 12px;background:#fbbf24;color:#000;font-size:11px;font-weight:600;cursor:pointer" onclick="event.stopPropagation()">Đang mượn</button>`
    : `<button type="button" data-model="${esc(r.model)}" style="border:none;border-radius:20px;padding:4px 12px;background:var(--green);color:#fff;font-size:11px;font-weight:600;cursor:pointer" onclick="event.stopPropagation();addToBorrow(this.dataset.model, event)">Mượn thiết bị</button>`
  )
) : (/status|Decision/.test(key)?formatStatusBadge(r[key]||'Chưa xác nhận'):esc(r[key]||'—'))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:empty('Không có bản ghi','Thử tìm từ khóa khác.')}`;
    
}
let modalStack = [];
function modal(title, body) {
  lastFocus = document.activeElement;
  const dialog = $('detail-dialog');
  if (dialog.open) {
    modalStack.push({title: $('dialog-title').innerHTML, body: $('dialog-body').innerHTML});
  } else {
    modalStack = [];
  }
  const leftArrow = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
  const backBtn = modalStack.length ? `<button type="button" style="margin-right:12px;background:none;border:none;cursor:pointer;color:#7e94b1;display:grid;place-items:center;width:34px;height:34px;border-radius:8px;" onmouseover="this.style.background='#f0f4f9';this.style.color='#172033'" onmouseout="this.style.background='none';this.style.color='#7e94b1'" onclick="modalBack()" aria-label="Quay lại">${leftArrow}</button>` : '';
  $('dialog-title').innerHTML = `<div style="display:flex;align-items:center;">${backBtn}<span>${esc(title)}</span></div>`;
  $('dialog-body').innerHTML = body;
  setupTaskSubmit();
  if (!dialog.open) dialog.showModal();
  $('close-dialog').focus();
}
function setupTaskSubmit(){
  const form=$('create-task-form');if(!form)return;
  const button=form.querySelector('button[type="submit"]');if(!button)return;
  button.textContent='Giao việc';
  form.querySelector('.tw-form-hint')?.remove();
  const hint=document.createElement('p');hint.className='tw-form-hint';hint.setAttribute('role','status');
  form.querySelector('.dialog-actions').before(hint);
  const sync=()=>{const valid=[...form.querySelectorAll('[required]')].every(e=>e.value.trim()&&e.validity.valid)&&form.checkValidity()&&!!form.elements.startDate.value&&!!form.elements.deadline.value&&form.elements.startDate.value<=form.elements.deadline.value;button.hidden=!valid;button.disabled=!valid;hint.textContent=valid?'Thông tin đã đầy đủ.':'Điền đủ các mục có dấu * và chọn thời gian thực hiện để giao việc.';};
  form.addEventListener('input',sync);form.addEventListener('change',sync);sync();
}
window.modalBack = function() {
  if (modalStack.length === 0) return;
  const prev = modalStack.pop();
  $('dialog-title').innerHTML = prev.title;
  $('dialog-body').innerHTML = prev.body;
  setupTaskSubmit();
};
function closeModal() { stopAssetScanner(); closeCalendar(); $('detail-dialog').close(); modalStack = []; lastFocus?.focus(); }
function showTask(key){
  const t=app.data.tasks.find(x=>x.key===key);if(!t)return;
  const prop = (iconName, label, value) => {
    if(!value || value==='—') return '';
    return `<div class="mobile-property ${['Sản phẩm giao','Dự án / Campaign'].includes(label)?'mobile-property-long':''}" style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)"><div style="display:flex;align-items:center;gap:12px;width:160px;color:var(--muted);font-size:13px;white-space:nowrap;">${icon(iconName)}<span>${esc(label)}</span></div><div style="flex:1;font-size:13px;color:var(--text);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;line-height:1.4;">${value}</div></div>`;
  };
  
  let tagsHtml = '';
  if (t.platform) {
      t.platform.split(',').forEach(p => {
          tagsHtml += `<span style="display:inline-block;padding:4px 10px;background:var(--surface2);border-radius:6px;font-size:12px;font-weight:500;color:var(--text);margin-right:6px;">${esc(p.trim())}</span>`;
      });
  }
  
  let body = '<div style="display:flex;flex-direction:column;gap:0;margin-bottom:32px;margin-top:10px;">';
  body += prop('activity', 'Trạng thái', statusBadge(t));
  body += prop('flag', 'Ưu tiên', priority(t));
  body += prop('calendar', 'Thời gian', `${esc(fmt(t.startDate))} &nbsp;→&nbsp; ${esc(fmt(t.deadline))}`);
  if (t.airDate) body += prop('calendar', 'Ngày đăng bài', esc(fmt(t.airDate)));
  body += prop('grid', 'Dòng nguồn', esc(t.row));
  if (t.project) body += prop('box', 'Dự án / Campaign', esc(t.project));
  if (tagsHtml) body += prop('grid', 'Nền tảng', `<div style="display:flex;flex-wrap:wrap;gap:4px;">${tagsHtml}</div>`);
  body += prop('home', 'Phòng ban', esc(t.department));
  if (t.deliverable) body += prop('list', 'Sản phẩm giao', esc(t.deliverable));
  body += prop('user', 'Assignees', esc(t.pic||'Chưa phân công'));
  body += '</div>';

  body += '<div style="display:flex;flex-direction:column;gap:16px;margin-bottom:20px;">';
  body += `<div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;"><h4 style="margin:0 0 10px 0;font-size:14px;color:var(--text);font-weight:700">Nội dung / Brief</h4><p style="margin:0;font-size:13px;color:var(--muted);line-height:1.6;white-space:pre-wrap;font-family:sans-serif;">${esc(t.brief || 'Chưa có nội dung mô tả.')}</p></div>`;
  body += `<div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;"><h4 style="margin:0 0 10px 0;font-size:14px;color:var(--text);font-weight:700">Ghi chú</h4><p style="margin:0;font-size:13px;color:var(--muted);line-height:1.6;white-space:pre-wrap;font-family:sans-serif;">${esc(t.note || 'Không có ghi chú.')}</p></div>`;
  body += '</div>';

  modal(t.id+' · '+taskTitle(t), body);
}
function showHealth(){const rows=currentRows(),h=health(rows);modal('Chất lượng dữ liệu Task Master',`<p class="muted">Các vấn đề được tìm thấy trong ${rows.length} dòng đang lọc. Bản xem local giữ nguyên dữ liệu nguồn.</p><div class="metric-grid"><div class="metric-card"><strong class="stat-number">${h.missingDeadline}</strong>Task mở thiếu deadline</div><div class="metric-card"><strong class="stat-number">${h.missingPic}</strong>Task thiếu PIC</div><div class="metric-card"><strong class="stat-number">${h.missingTitle}</strong>Task thiếu tên công việc</div></div><h3>Mã ID xuất hiện nhiều lần</h3><p>Chọn task theo cả mã ID và dòng Sheet để tránh nhầm bản ghi.</p>${taskTable(rows.filter(t=>rows.filter(x=>x.id===t.id).length>1))}`);}
function showSources(){modal('Dữ liệu & cách tính',`<div class="source-intro">${badge('Snapshot Google Sheets','green')}<p>Dữ liệu thật được đọc ngày ${esc($('source-date').textContent.replace('Snapshot: ',''))}. Thay đổi bộ lọc trên trang chỉ thay đổi góc nhìn local.</p></div><div class="detail-grid"><div class="detail-field"><span>Task Master</span><strong>${app.data.tasks.length} task · ${app.data.users.length} hồ sơ nhân sự</strong><a href="${esc(app.data.meta.taskSheetUrl)}" target="_blank" rel="noopener">Mở Sheet nguồn</a></div><div class="detail-field"><span>Management Asset</span><strong>${app.data.assets.length} thiết bị · ${app.data.logs.length} dòng nhật ký</strong><a href="${esc(app.data.meta.assetSheetUrl)}" target="_blank" rel="noopener">Mở Sheet nguồn</a></div></div><h3>Các chỉ số có nghĩa gì?</h3><p><b>Hoàn thành:</b> số task Done chia tổng task, bỏ Cancelled. Đây là tiến độ đầu việc, không phải điểm đánh giá nhân sự.</p><p><b>Weekly:</b> số task có deadline trong tuần hiện tại (Thứ hai–Chủ nhật). Không suy ra ngày hoàn thành từ deadline.</p><p><b>Staff:</b> task nhiều PIC được tính cho từng người phụ trách. Vì vậy cộng workload mọi người có thể lớn hơn tổng task.</p><p><b>Project / Campaign:</b> nhóm từ cùng cột D. Tab Campaign lọc tên chứa Campaign hoặc CP; cần cột phân loại riêng nếu muốn phân biệt tuyệt đối.</p><p><b>Hoạt động:</b> Sheet hiện chưa có TASK ACTIVITY. Nhật ký tài sản được hiển thị với đúng thời gian đã ghi.</p><div class="source-warning"><b>App deploy đang gặp lỗi</b><p>${esc(app.data.meta.deploymentError||'Chưa kiểm tra lại trạng thái deploy.')}</p><p>File server Node.js nằm trong Apps Script. Cần loại file server khỏi phạm vi deploy khi xử lý bản online.</p></div><div class="dialog-actions"><button class="primary-link" data-action="import">${icon('upload')} Nhập snapshot JSON</button><button class="text-button" data-action="export">${icon('download')} Xuất snapshot local</button></div><p class="small muted">Nút làm mới đọc lại data/snapshot.json đã lưu. Bản này chưa tự đồng bộ với Google Sheets.</p>`);}
document.addEventListener('click',e=>{
  const t=e.target.closest('button,a,tr[data-detail]');if(!t)return;
  if(t.dataset.view){app.view=t.dataset.view;render();}
  if(t.dataset.tab){app.tab=t.dataset.tab;renderAnalysis(currentRows());}
  if(t.dataset.management){
    const key=t.dataset.management,now=new Date();
    const checks={later:t=>isOpen(t)&&dueDays(t,now)!==null&&dueDays(t,now)>3,all:()=>true,open:isOpen,done:isDone,overdue:t=>isOpen(t)&&dueDays(t,now)!==null&&dueDays(t,now)<0,dueSoon:t=>isOpen(t)&&dueDays(t,now)!==null&&dueDays(t,now)>=0&&dueDays(t,now)<=3,urgent:t=>isOpen(t)&&/^(high|urgent)$/.test(normalize(t.priority)),feedback:t=>isOpen(t)&&normalize(t.status)==='feedback',undated:t=>isOpen(t)&&!parseDate(t.deadline),unassigned:t=>isOpen(t)&&!people(t).length,'has-pic-proj':t=>app.tab==='performance'?(t.project&&t.project.trim()):people(t).length>0,upcomingAir:t=>!isCancelled(t)&&parseDate(t.airDate)&&day(parseDate(t.airDate))-day(now)>=0&&day(parseDate(t.airDate))-day(now)<=7};
    modal(t.getAttribute('aria-label')||t.querySelector('span').textContent,taskTable(managementRows(currentRows()).filter(checks[key])));
  }
  if(t.dataset.task)showTask(t.dataset.task);
  if(t.dataset.groupStep){const groups=spotlightGroups(currentRows()),i=groups.findIndex(g=>g.key===app['selectedGroup_'+app.tab]);if(groups.length){app['selectedGroup_'+app.tab]=groups[(i+Number(t.dataset.groupStep)+groups.length)%groups.length].key;renderAnalysis(currentRows());}}
  if(t.dataset.personStep){const all=staff(currentRows()),i=all.findIndex(p=>p.pic===app.selectedPic);if(all.length){app.selectedPic=all[(i+Number(t.dataset.personStep)+all.length)%all.length].pic;renderAnalysis(currentRows());}}
  if(t.dataset.selectPerson){app.selectedPic=t.dataset.selectPerson;app.tab='performance';renderAnalysis(currentRows());$('performance').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(t.dataset.period){app.period=t.dataset.period;renderAnalysis(currentRows());}
  if(t.dataset.project){const groups=groupProjects(currentRows(),new Date());const g=groups.find(g=>g.name===t.dataset.project);if(g){const m=managementMetrics(g.tasks);modal(g.name,`<div class="chart-legend">${badge(m.overdue?m.overdue+' quá hạn':m.open?'Đang triển khai':'Đã đóng',m.overdue?'red':m.open?'blue':'green')}<span>${m.total} task · ${m.pics} PIC · ${m.cancelled} đã hủy</span></div><dl class="project-facts"><div><dt>Ưu tiên cao</dt><dd>${m.urgent}</dd></div><div><dt>Chờ phản hồi</dt><dd>${m.feedback}</dd></div><div><dt>Thiếu deadline</dt><dd>${m.undated}</dd></div><div><dt>Thiếu PIC</dt><dd>${m.unassigned}</dd></div></dl>${g.tasks.some(isCampaign)?`<p class="small muted">Kênh: ${esc(m.platforms.join(', ')||'Chưa cập nhật')}</p><p class="small muted">${m.upcomingAir} lịch đăng trong 7 ngày · ${m.missingAir} task mở chưa có ngày đăng. Lịch đăng là kế hoạch.</p>`:''}${taskTable(g.tasks)}`);}}
  if(t.dataset.kpi){if(['open','done'].includes(t.dataset.kpi))modal(t.dataset.kpi==='open'?'Task đang mở':'Task đã hoàn tất',taskTable(currentRows().filter(t.dataset.kpi==='open'?isOpen:isDone)));else if(t.dataset.kpi==='assets')modal('Thiết bị đang mượn',app.data.assets.filter(a=>normalize(a.status)==='dang muon').map(a=>`<article class="task-row"><strong>${esc(a.code)} · ${esc(a.model)}</strong><p>${esc(a.borrower)} · Hạn trả ${esc(a.deadline)}</p></article>`).join('')||empty('Không có thiết bị đang mượn',''));else modal('Yêu cầu chờ duyệt',app.data.requests.filter(r=>!r.borrowDecision||normalize(r.borrowDecision).includes('cho duyet')).map(r=>`<article class="task-row"><strong>${esc(r.name)}</strong><p>${esc(r.equipment)}</p></article>`).join('')||empty('Đã xử lý hết yêu cầu','Không còn yêu cầu đang chờ duyệt trong bản dữ liệu này.'));}
  if(t.dataset.info==='completion')modal('Tỷ lệ hoàn thành',`<p>Số task Done ÷ (tổng số task − Cancelled) × 100.</p><p>Áp dụng cho nhân sự, dự án hoặc campaign đang chọn và bộ lọc hiện tại, trên toàn bộ dữ liệu được giao. Chỉ phản ánh trạng thái đầu việc; chưa có thời điểm hoàn thành để tính đúng hạn hay năng suất theo tuần.</p>`);
  
  if(t.dataset.detail){
    const id = t.dataset.id;
    if(t.dataset.detail === 'assets'){
      const r = app.data.assets.find(x => x.code === id || x.id === id || x.timestamp === id);
      if(r) showAssetDetail(r.code);
    } else if(t.dataset.detail === 'requests'){
      const r = app.data.requests.find(x => x.id === id || x.key === id || x.timestamp === id);
      if(r) modal('Chi tiết yêu cầu', `<div class="detail-grid"><div class="detail-field"><span>Người đăng ký</span><strong>${esc(r.name)}</strong></div><div class="detail-field"><span>Phòng ban</span><strong>${esc(r.department)}</strong></div><div class="detail-field"><span>Thiết bị</span><strong>${esc(r.equipment)}</strong></div><div class="detail-field"><span>Mục đích</span><p>${esc(r.purpose)}</p></div><div class="detail-field"><span>Thời gian mượn</span><strong>${esc(r.borrowDate)} - ${esc(r.returnDate)}</strong></div><div class="detail-field"><span>Quyết định</span><strong>${esc(r.borrowDecision||'—')}</strong></div></div>`);
    } else if(t.dataset.detail === 'logs'){
      const r = app.data.logs.find(x => [x.id,x.key,x.timestamp].some(v=>v!=null&&String(v)===id));
      if(r) modal('Chi tiết nhật ký', `<div class="detail-grid"><div class="detail-field"><span>Thời gian ghi nhận</span><strong>${fmt(r.timestamp)}</strong></div><div class="detail-field"><span>Người mượn</span><strong>${esc(r.applicant)}</strong></div><div class="detail-field"><span>Mã thiết bị</span><strong>${esc(r.assetCode)}</strong></div><div class="detail-field"><span>Thiết bị</span><strong>${esc(r.assetName)}</strong></div><div class="detail-field"><span>Mục đích</span><p>${esc(r.purpose)}</p></div><div class="detail-field"><span>Trạng thái</span><strong>${esc(r.status)}</strong></div><div class="detail-field"><span>Xác nhận trả</span><strong>${esc(r.returnDecision||'—')}</strong></div><div class="detail-field"><span>Đánh giá tình trạng</span><strong>${esc(r.condition||'—')}</strong></div></div>`);
    }
  }

  const action=t.dataset.action;
  if(action==='logout'){window.logoutDashboard?.();return;}
  if(['staff-detail','staff-open'].includes(action)){modal('Công việc · '+(['projects','campaigns'].includes(app.tab)?selectedSpotlightGroup(currentRows())?.name:app.selectedPic),taskTable(managementRows(currentRows()).filter(action==='staff-open'?isOpen:()=>true)));}
  if(action==='spotlight-health'){const rows=managementRows(currentRows()),h=health(rows);modal('Chất lượng dữ liệu',`<p>${h.missingDeadline} task mở thiếu hạn · ${h.missingPic} task thiếu PIC · ${h.duplicateIds.length} mã trùng</p>`+taskTable(rows));}
  if(action==='health')showHealth();
  if(action==='activity-detail')modal('Lịch sử hoạt động',`<p>Task Master hiện chưa có tab TASK ACTIVITY nên chưa thể xác định ai tạo, chỉnh sửa hay hoàn tất task vào lúc nào. Các hoạt động bên dưới đến từ nhật ký tài sản.</p>`+$('activity-content').querySelector('.activity-list').outerHTML);
    if(action==='create-task') modal('Tạo Task cho nhân viên', getTaskForm());
  if(action==='import')$('import-data').click();
  if(action==='export'){const blob=new Blob([JSON.stringify(app.data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kcoffee-dashboard-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
});
document.addEventListener('change',e=>{if(e.target.id==='spotlight-group'){app['selectedGroup_'+app.tab]=e.target.value;renderAnalysis(currentRows());}});
$('performance-view').addEventListener('change',e=>{app.tab=e.target.value;renderAnalysis(currentRows());});
$('search').addEventListener('input',e=>{app.query=e.target.value;render();});
$('pic-filter').addEventListener('change',e=>{app.pic=e.target.value;if(app.pic!=='all')app.selectedPic=app.pic;render();});
$('department-filter').addEventListener('change',e=>{app.department=e.target.value;render();});
$('reset-filters').addEventListener('click', () => {
    app.pic = 'all';
    app.department = 'all';
    app.selectedPic = null;
    app.taskStatus = 'all';
    app.hideDone = true;
    app.sort = 'id';
    
    // Visually update the header filters immediately
    if($('pic-filter')) $('pic-filter').value = 'all';
    if($('department-filter')) $('department-filter').value = 'all';
    if($('status-filter')) $('status-filter').value = 'all';
    if($('sort-tasks')) $('sort-tasks').value = 'id';
    if($('show-done')) $('show-done').checked = false;
    
    render();
    load(false);
});
$('close-dialog').addEventListener('click',closeModal);
$('analysis-tabs').addEventListener('keydown',e=>{
  const tabs=[...$('analysis-tabs').querySelectorAll('[role=tab]')];
  const index=tabs.indexOf(document.activeElement);
  if(index<0||!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
  e.preventDefault();
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].click();tabs[next].focus();
});
$('detail-dialog').addEventListener('click',e=>{if(e.target===$('detail-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('detail-dialog').addEventListener('close',()=>{closeCalendar();lastFocus?.focus();});
document.addEventListener('change',e=>{if(e.target.id==='show-done'){app.hideDone=!e.target.checked;renderSecondary();}if(e.target.id==='status-filter'){app.taskStatus=e.target.value;if(isDone({status:app.taskStatus})||isCancelled({status:app.taskStatus}))app.hideDone=false;renderSecondary();}if(e.target.id==='sort-tasks'){app.sort=e.target.value;renderSecondary();}});
$('import-data').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>8*1024*1024)throw new Error('File vượt quá 8 MB.');const data=validateData(JSON.parse(await f.text()));data.meta.fetchedAt=data.meta.fetchedAt||new Date().toISOString();app.data=data;setupFilters();render();closeModal();toast('Đã nhập snapshot vào phiên xem local này.');}catch(error){toast('Không nhập được dữ liệu: '+error.message);}finally{e.target.value='';}});
function loginStore(key,value){try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,value);}catch{}}
function loginRead(key){try{return sessionStorage.getItem(key);}catch{return null;}}
function loginRemembered(){try{return localStorage.getItem('kcoffee-login-remembered')==='1';}catch{return false;}}
function setLoginRemembered(value){try{if(value)localStorage.setItem('kcoffee-login-remembered','1');else localStorage.removeItem('kcoffee-login-remembered');}catch{}}
function initLoginGate(){
  if($('login-gate'))return;
  let loginEntered=false,loginMode='register';
  const gate=document.createElement('section');
  gate.id='login-gate';
  gate.className='login-gate';
  gate.setAttribute('aria-labelledby','login-title');
  gate.innerHTML=`<div class="login-card">
    <div class="login-form-panel">
      <div class="login-wordmark" aria-label="K Coffee">COFFEE</div>
      <div class="login-copy"><span>MANAGEMENT HUB</span><h1 id="login-title">Đăng ký thông tin</h1><p>Vui lòng cập nhật thông tin cá nhân của bạn để sử dụng các tính năng trong hệ thống.</p></div>
      <section class="login-summary" id="login-summary" aria-label="Tóm tắt công việc" hidden></section>
      <form id="login-form" class="login-form">
        <div class="reg-field">
           <label>Email liên kết</label>
           <input type="text" id="reg-email" readonly style="background:#f1f5f9;color:#64748b;cursor:not-allowed">
        </div>
        <div class="reg-field">
           <label>Họ và tên *</label>
           <input type="text" id="reg-name" required placeholder="Nhập họ và tên...">
        </div>
        <div class="reg-grid">
           <div class="reg-field">
              <label>Mã PIC</label>
              <input type="text" id="reg-pic" placeholder="Biệt danh/Tên tắt...">
           </div>
           <div class="reg-field">
              <label>Số điện thoại</label>
              <input type="tel" id="reg-phone" placeholder="SĐT liên hệ...">
           </div>
        </div>
        <div class="reg-grid">
           <div class="reg-field">
              <label>Phòng ban</label>
              <input type="text" id="reg-dept" placeholder="Tên phòng ban...">
           </div>
           <div class="reg-field">
              <label>Chức vụ</label>
              <input type="text" id="reg-job" placeholder="Chức danh...">
           </div>
        </div>
        <button class="login-submit" type="submit" id="reg-submit-btn"><span>Truy cập hệ thống</span><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
      </form>
    </div>
  </div>`;
  document.body.prepend(gate);
  const open=()=>{
    gate.hidden=false;document.body.classList.add('login-open');
    if(typeof window !== 'undefined' && window.ACTIVE_EMAIL) document.getElementById('reg-email').value = window.ACTIVE_EMAIL;
  };
  const close=()=>{gate.hidden=true;document.body.classList.remove('login-open');};
  window.showLoginGate=open;
  const setMode=mode=>{
    loginMode=mode;
    const returning=mode==='login';
    gate.classList.toggle('login-existing',returning);
    $('login-title').textContent=returning?'Đăng nhập Management Hub':'Đăng ký thông tin';
    $('login-title').nextElementSibling.textContent=returning?'Tiếp tục với tài khoản Google đã xác thực để xem công việc của bạn.':'Vui lòng cập nhật thông tin cá nhân của bạn để sử dụng các tính năng trong hệ thống.';
    $('reg-name').required=!returning;
    $('reg-submit-btn').innerHTML='<span>'+(returning?'Vào dashboard':'Truy cập hệ thống')+'</span>';
  };
  
  const normGate=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').trim().toLowerCase();
  const gateDeptKey=value=>{const key=normGate(value);return ['desgin','design','design team'].includes(key)?'design':key;};
  const gateTokens=value=>String(value||'').split(/[,;\n]/).map(normGate).filter(Boolean);
  const gateDone=t=>/done|hoan thanh|completed/.test(normGate(t.status));
  const gateCancelled=t=>/cancel|huy|deleted/.test(normGate(t.status));
  const gateOpen=t=>!gateDone(t)&&!gateCancelled(t);
  const gateDue=t=>{const raw=String(t.deadline||'').trim();if(!raw)return null;const m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;};
  const gateOverdue=t=>{const d=gateDue(t);if(!d)return false;const today=new Date();today.setHours(0,0,0,0);return d<today&&gateOpen(t);};
  const gateMatchesUser=(t,u)=>{const ids=[u.pic,u.name,u.employeeId].map(normGate).filter(Boolean);return ids.some(id=>gateTokens(t.pic).includes(id));};
  const gateUserTasks=(tasks,u)=>tasks.filter(t=>gateMatchesUser(t,u));
  const gateStats=rows=>({open:rows.filter(gateOpen).length,done:rows.filter(gateDone).length,overdue:rows.filter(gateOverdue).length});
  const gateTasksHtml=rows=>{
    const upcoming=rows.filter(gateOpen).sort((a,b)=>(gateDue(a)?.getTime()??Infinity)-(gateDue(b)?.getTime()??Infinity)).slice(0,3);
    return upcoming.length?upcoming.map(t=>`<div class="login-summary-item"><span class="login-summary-item-main"><strong>${esc(taskTitle(t))}</strong><small>${esc(t.id||t.project||'Công việc')} · ${esc(t.status||'Chưa cập nhật')}</small></span><span class="login-summary-item-meta">${gateOverdue(t)?'Quá hạn':esc(t.deadline||'Chưa có hạn')}</span></div>`).join(''):'<div class="login-summary-empty">Không có công việc đang mở.</div>';
  };
  const gatePeopleHtml=(people,tasks)=>{
    const rows=people.map(u=>{const assigned=gateUserTasks(tasks,u);return {...u,counts:gateStats(assigned),next:assigned.filter(gateOpen).sort((a,b)=>(gateDue(a)?.getTime()??Infinity)-(gateDue(b)?.getTime()??Infinity))[0]};}).sort((a,b)=>b.counts.open-a.counts.open).slice(0,5);
    return rows.length?rows.map(u=>`<div class="login-summary-item"><span class="login-summary-item-main"><strong>${esc(u.name||u.pic||u.email)}</strong><small>${esc(u.jobTitle||u.role||'Nhân sự')} · ${esc(u.department||'Chưa có phòng ban')}${u.next?' · Đang làm: '+esc(taskTitle(u.next)):''}</small></span><span class="login-summary-item-meta"><b>${u.counts.open}</b>đang mở${u.counts.overdue?' · '+u.counts.overdue+' quá hạn':''}</span></div>`).join(''):'<div class="login-summary-empty">Chưa có nhân sự phù hợp trong danh sách.</div>';
  };
  const renderGateSummary=user=>{
    const role=normGate(user.role),dept=normGate(user.department),tasks=app.data.tasks||[],users=app.data.users||[];
    const director=/giam doc|director|ceo/.test(role);
    const lead=/leader|lead|manager|quan ly|truong phong/.test(role)&&!director;
    const own=gateUserTasks(tasks,user),ownStats=gateStats(own);
    const peers=director?users.filter(u=>u.email!==user.email&&/leader|lead|manager|quan ly|truong phong/.test(normGate(u.role))):lead?users.filter(u=>u.email!==user.email&&dept&&gateDeptKey(u.department)===gateDeptKey(dept)):[];
    const headline=director?'Công việc của các Leader / Manager':lead?'Công việc của mình và đội ngũ':'Công việc của mình';
    const peopleTitle=director?'Workload Leader / Manager':'Workload nhân sự · '+(user.department||'Phòng ban');
    $('login-title').textContent=headline;
    $('login-title').nextElementSibling.textContent='Xin chào '+(user.name||user.pic||'bạn')+' · '+(user.jobTitle||user.role||'Nhân sự')+(user.department?' · '+user.department:'');
    const summary=$('login-summary');
    summary.innerHTML=`<div class="login-summary-head"><strong>${director?'Tổng quan của bạn':lead?'Tổng quan công việc':'Workload hiện tại'}</strong><small>Cập nhật từ Task Master</small></div><div class="login-summary-stats"><div class="login-summary-stat"><strong>${ownStats.open}</strong><span>Việc đang mở của mình</span></div><div class="login-summary-stat"><strong>${ownStats.done}</strong><span>Đã hoàn tất</span></div><div class="login-summary-stat ${ownStats.overdue?'alert':''}"><strong>${ownStats.overdue}</strong><span>Quá hạn</span></div></div>${own.length?`<div class="login-summary-section"><h2>Việc của mình cần theo dõi</h2><div class="login-summary-list">${gateTasksHtml(own)}</div></div>`:''}${director||lead?`<div class="login-summary-section"><h2>${esc(peopleTitle)}</h2><div class="login-summary-list">${gatePeopleHtml(peers,tasks)}</div></div>`:''}`;
    summary.hidden=false;
    $('reg-submit-btn').innerHTML='<span>Vào dashboard</span>';
  };
  // Logic to determine if user should see registration or pass through
  const checkAccess = () => {
      // If we don't have app.data yet (e.g. still loading), we wait for load() to call checkAccess again
      if (!app.data || !app.data.users) return;
      const email = typeof window !== 'undefined' ? window.ACTIVE_EMAIL : '';
      if (!email) {
         // Local development fallback
         open(); return;
      }
      const user = app.data.currentUser?.email?.toLowerCase()===email.toLowerCase()?app.data.currentUser:app.data.users.find(u => (u.email||'').toLowerCase() === email.toLowerCase());
      if (user && user.name) {
          if(normGate(user.role)==='admin'){
            loginEntered=true;close();
            if(!gate.dataset.adminTracked&&typeof google!=='undefined'&&google.script){gate.dataset.adminTracked='1';google.script.run.apiRecordStaffSession({event:'LOGIN'});}
            return;
          }
          setMode('login');
          renderGateSummary(user);
          if(loginEntered)close();else open();
      } else {
          setMode('register');
          $('login-summary').hidden=true;
          open();
          const btn = document.getElementById('reg-submit-btn');
          if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<span>Truy cập hệ thống</span><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
          }
      }
  };
  
  window.logoutDashboard=()=>{
     if(loginEntered&&typeof google!=='undefined'&&google.script)google.script.run.apiRecordStaffSession({event:'LOGOUT'});
     loginEntered=false;setMode('login');open();
  };
  
  // Avatar upload handler
  window.handleAvatarUpload = (input) => {
    const file = input.files[0];
    if(!file) return;
    if(file.size > 500*1024) { toast('Ảnh quá lớn (tối đa 500KB). Vui lòng chọn ảnh nhỏ hơn.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      // Update avatar in memory
      if(app.data && app.data.currentUser) app.data.currentUser.avatarUrl = base64;
      // Save to session
      try { sessionStorage.setItem('user_avatar', base64); } catch(err) {}
      // Re-render
      setupFilters(); renderSecondary();
      toast('Đã cập nhật ảnh đại diện!');
    };
    reader.readAsDataURL(file);
  };
  
  // Restore avatar from session on load
  try {
    const savedAvatar = sessionStorage.getItem('user_avatar');
    if(savedAvatar && app.data && app.data.currentUser) {
      app.data.currentUser.avatarUrl = savedAvatar;
    }
  } catch(err) {}
  
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const btn = $('reg-submit-btn');
    if(loginMode==='login'){
      btn.disabled=true;btn.textContent='Đang đăng nhập…';
      if(typeof google!=='undefined'&&google.script){
        google.script.run.withSuccessHandler(res=>{
          btn.disabled=false;setMode('login');renderGateSummary(app.data.currentUser||{});
          if(res?.ok===false){toast(res.error||'Không đăng nhập được.');return;}
          loginEntered=true;close();
        }).withFailureHandler(err=>{btn.disabled=false;setMode('login');renderGateSummary(app.data.currentUser||{});toast(err.message||'Không đăng nhập được.');}).apiRecordStaffSession({event:'LOGIN'});
      }else{btn.disabled=false;loginEntered=true;close();}
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></span> Đang đăng ký...';
    
    const profile = {
       name: $('reg-name').value.trim(),
       pic: $('reg-pic').value.trim(),
       phone: $('reg-phone').value.trim(),
       department: $('reg-dept').value.trim(),
       jobTitle: $('reg-job').value.trim()
    };
    
    if(typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(res => {
            if (res && res.ok === false) {
                toast('Lỗi: ' + (res.error || 'Không thể đăng ký'));
                btn.disabled = false;
                btn.innerHTML = '<span>Truy cập hệ thống</span><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
                return;
            }
            toast('Đăng ký thành công! Vui lòng đợi...');
            load(false);
        }).withFailureHandler(err => {
            toast('Lỗi: ' + err.message);
            btn.disabled = false;
            btn.innerHTML = '<span>Truy cập hệ thống</span><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        }).apiRegisterUser(profile);
    } else {
        toast('Môi trường Local: Bỏ qua đăng ký.');
        close();
    }
  });
  
  window.checkAccessGate = checkAccess; open(); // Block by default until checkAccess confirms
  if(typeof google!=='undefined'&&google.script)window.setInterval(()=>{
    if(loginEntered&&document.visibilityState==='visible')google.script.run.apiRecordStaffSession({event:'HEARTBEAT'});
  },300000);
}
// initLoginGate();
load(true);
if(typeof google!=='undefined'&&google.script) {
  window.setInterval(()=>{if(document.visibilityState==='visible')load(true);},60000);
}

window.runMutation = async function(endpoint, args, trigger) {
  const form=trigger?.closest?.('form')||document.querySelector('dialog[open] form');
  if(form?.dataset.saving==='1')return;
  const btn=form?.querySelector('button[type="submit"]')||trigger;
  const oldText=btn?.textContent;
  if(form)form.dataset.saving='1';
  if(btn){btn.disabled=true;btn.textContent='Đang xử lý…';}
  try {
    if(!(typeof google!=='undefined'&&google.script))throw new Error('Mở link Apps Script để lưu dữ liệu.');
    let payload=args instanceof FormData?Object.fromEntries(args.entries()):args;
    if(endpoint==='apiCreateTask'&&(!payload.startDate||!payload.deadline||payload.deadline<payload.startDate))throw new Error('Vui lòng chọn thời gian thực hiện hợp lệ.');
    if(endpoint==='apiSubmitBorrowRequest'){
      if(!payload.loanDate||!payload.returnDate||payload.returnDate<payload.loanDate)throw new Error('Vui lòng chọn khoảng ngày mượn / trả hợp lệ.');
      endpoint='apiCreateBorrowRequest';
      payload={name:payload.name,email:payload.email,department:payload.department,device:payload.equipment,qty:payload.qty,reason:payload.purpose,from:payload.loanDate,to:payload.returnDate,note:payload.note||''};
    }
    await new Promise((resolve,reject)=>google.script.run.withSuccessHandler(r=>r?.ok===false?reject(new Error(r.error||'Không lưu được dữ liệu.')):resolve(r)).withFailureHandler(reject)[endpoint](payload));
    closeModal();toast('Đã lưu thành công. Đang đồng bộ…');await load(false);
  }catch(error){toast(error.message||'Không lưu được dữ liệu. Vui lòng thử lại.');}
  finally{if(form)delete form.dataset.saving;if(btn){btn.disabled=false;btn.textContent=oldText;}}
};


window.showBorrowForm = function() {
  const user = app.data.currentUser || app.data.users.find(u => u.email === (app.data.meta.email || window.ACTIVE_EMAIL)) || {name: 'Admin', department: '', email: (app.data.meta.email || window.ACTIVE_EMAIL)};
  const html = `<form id="borrow-create-form" onsubmit="event.preventDefault(); if(!this.equipment.value){toast('Vui lòng chọn ít nhất 1 thiết bị');return;} runMutation('apiSubmitBorrowRequest', new FormData(this))">
    <div class="detail-grid" style="gap:16px;">
      <div class="detail-field"><span>Họ và Tên Người Mượn <b style="color:red">*</b></span><input type="text" name="name" required value="${esc(user.name||'')}" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0;font-weight:600"></div>
      <div class="detail-field"><span>Email <b style="color:red">*</b></span><input type="email" name="email" required value="${esc(user.email||'')}" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0;font-weight:600"></div>
      <div class="detail-field"><span>Phòng ban</span><input type="text" name="department" value="${esc(user.department||'')}" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0"></div>
      <div class="detail-field"><span>Số lượng</span><input type="number" name="qty" id="borrow-qty-input" value="${(app.selectedAssets||[]).length || 1}" min="1" style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0"></div>
      <div class="detail-field" style="grid-column: 1 / -1">
    <span>Thiết bị cần mượn <b style="color:red">*</b></span>
    <div id="borrow-tags" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;">
      ${(app.selectedAssets||[]).map((asset, idx) => `
        <span class="borrow-tag" style="background:#e2e8f0;color:#334155;padding:6px 12px;border-radius:16px;font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px;">
          ${esc(asset)}
          <button type="button" onclick="removeBorrowAsset(${idx})" style="background:none;border:none;cursor:pointer;color:#64748b;display:flex;padding:0;margin:0;font-size:14px;line-height:1">&times;</button>
        </span>
      `).join('')}
    </div>
    <input type="hidden" name="equipment" id="borrow-equipment-input" value="${esc((app.selectedAssets||[]).join(', '))}">
    ${!(app.selectedAssets&&app.selectedAssets.length)?'<p style="font-size:12px;color:var(--muted);margin-top:4px">Chưa chọn thiết bị. Hãy đóng form và chọn từ danh sách.</p>':''}
  </div>
      <div class="detail-field" style="grid-column: 1 / -1"><span>Thời gian mượn (Bắt đầu - Trả) <b style="color:red">*</b></span>
<input type="hidden" name="loanDate" id="borrow-loanDate">
<input type="hidden" name="returnDate" id="borrow-returnDate">
<input type="text" id="borrow-range-display" readonly placeholder="Chọn khoảng thời gian mượn..." onclick="openCalendar({displayId:'borrow-range-display', startId:'borrow-loanDate', endId:'borrow-returnDate', mode:'range'})" required style="cursor:pointer;width:100%;border:none;background:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237e94b1%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect x=%223%22 y=%224%22 width=%2218%22 height=%2218%22 rx=%222%22 ry=%222%22/><line x1=%2216%22 y1=%222%22 x2=%2216%22 y2=%226%22/><line x1=%228%22 y1=%222%22 x2=%228%22 y2=%226%22/><line x1=%223%22 y1=%2210%22 x2=%2221%22 y2=%2210%22/></svg>') right center / 16px no-repeat; padding-right:24px;;outline:none;font-size:13px;padding:4px 24px 4px 0;font-family:inherit"></div>
      <div class="detail-field" style="grid-column: 1 / -1"><span>Mục đích mượn <b style="color:red">*</b></span><textarea name="purpose" rows="2" required placeholder="Ghi rõ mục đích sử dụng..." style="width:100%;border:none;background:transparent;outline:none;font-size:13px;padding:4px 0;resize:none;font-family:inherit"></textarea></div>
      <input type="hidden" name="id" value="${'REQ-'+Date.now()}">
    </div>
    <div class="dialog-actions" style="margin-top:24px;justify-content:flex-end">
      <button type="button" class="text-button" onclick="closeModal()">Hủy</button>
      <button type="submit" class="primary-link" style="border:none;cursor:pointer;background:var(--green)">Gửi yêu cầu mượn</button>
    </div>
  </form>`;
  modal('Đăng ký mượn thiết bị', html);
};

function showAssetDetail(code,{scanned=false}={}) {
  const a = assetByCode(code); if(!a) return;
  const logs=app.data.logs.filter(log=>assetCodeKey(log.code||log.assetCode)===assetCodeKey(a.code)).sort((x,y)=>String(y.timestamp||'').localeCompare(String(x.timestamp||''))).slice(0,3);
  const relatedRequest=app.data.requests.find(request=>assetCodeKey(request.equipment).includes(assetCodeKey(a.code)));
  const due=a.deadline||a.dueDate;
  const prop = (l, v) => `<div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)"><div style="width:160px;color:var(--muted);font-size:13px;">${esc(l)}</div><div style="flex:1;font-size:13px;color:var(--text);font-weight:600;">${v}</div></div>`;
  let body = `${scanned?`<div class="asset-scan-result">${icon('scan')}<span>Đã nhận diện từ QR · thông tin liên kết của thiết bị</span></div>`:''}<div style="display:flex;flex-direction:column;margin-bottom:24px;">`;
  body += prop('Trạng thái', formatStatusBadge(a.status));
  body += prop('Model / Thiết bị', esc(a.model));
  body += prop('Mã / Serial', esc(a.code) + (a.serial ? ' <span style="color:var(--muted);font-weight:400">· SN: ' + esc(a.serial) + '</span>' : ''));
  body += prop('Vị trí', esc(a.location));
  body += prop('Khả dụng', formatStatusBadge(a.availability));
  body += prop('Người mượn', esc(a.borrower) + (a.department ? ' <span style="color:var(--muted);font-weight:400">· ' + esc(a.department) + '</span>' : ''));
  if(due) body += prop('Hạn trả', esc(fmt(due)));
  body += `</div><div class="detail-grid"><div class="detail-field"><span>Tình trạng thực tế</span><strong>${esc(a.condition||'Chưa cập nhật')}</strong></div><div class="detail-field"><span>Ghi chú kho</span><strong>${esc(a.note||'Không có ghi chú')}</strong></div></div>`;
  body += `<section class="asset-linked-record"><div><span>Lịch sử liên kết</span><strong>${logs.length?`${logs.length} lượt mượn / trả gần đây`:'Chưa có lịch sử trong snapshot'}</strong></div>${logs.length?`<div class="asset-linked-list">${logs.map(log=>`<button type="button" onclick="showLogDetail('${esc(log.id||log.key)}')"><span>${esc(fmt(log.timestamp))} · ${esc(log.applicant||'Chưa rõ người mượn')}</span>${formatStatusBadge(log.status)}</button>`).join('')}</div>`:''}${relatedRequest?`<p class="small muted">Yêu cầu gần nhất: ${esc(relatedRequest.name)} · ${esc(relatedRequest.borrowDate)} → ${esc(relatedRequest.returnDate)}</p>`:''}</section>`;
  const isBorrowed=normalize(a.status)==='dang muon';
  const isSelected=(app.selectedAssets||[]).includes(a.model);
  body += `<div class="asset-detail-actions"><button type="button" class="asset-qr-link" title="Sao chép liên kết QR" aria-label="Sao chép liên kết QR" onclick="navigator.clipboard?.writeText('${esc(assetQRLink(a.code))}').then(()=>toast('Đã sao chép link QR của thiết bị.')).catch(()=>toast('Không thể sao chép link trên trình duyệt này.'))"><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" stroke="none" aria-hidden="true"><path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm9-3h3v3h-3v-3zm5 0h4v3h-4v-3zm-5 5h3v4h-3v-4zm5 0h2v2h2v2h-4v-4z"/></svg></button>${logs.length?`<button type="button" class="text-button" onclick="openAssetLogs('${esc(a.code)}')">Xem toàn bộ nhật ký ${icon('arrow')}</button>`:''}${isSelected?`<span class="badge blue">Đã trong giỏ mượn</span>`:isBorrowed?`<span class="badge amber">Đang được mượn</span>`:`<button type="button" class="primary-link" style="border:none;cursor:pointer;background:var(--green)" onclick="addToBorrow('${esc(a.model)}', event)">Mượn thiết bị</button>`}</div>`;
  modal('Chi tiết thiết bị', body);
}
window.showAssetDetail = showAssetDetail;

window.showLogDetail = function(id) {
  const l = app.data.logs.find(x=>x.id===id||x.key===id); if(!l) return;
  const prop = (lbl, v) => `<div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)"><div style="width:160px;color:var(--muted);font-size:13px;">${esc(lbl)}</div><div style="flex:1;font-size:13px;color:var(--text);font-weight:600;">${v}</div></div>`;
  let body = `<div style="display:flex;flex-direction:column;margin-bottom:24px;">`;
  body += prop('Mã phiếu', esc(l.id));
  body += prop('Loại giao dịch', formatStatusBadge(l.type));
  body += prop('Thời gian', esc(l.timestamp));
  body += prop('Người đăng ký', esc(l.applicant||l.user||'—') + (l.department ? ' <span style="color:var(--muted);font-weight:400">· ' + esc(l.department) + '</span>' : ''));
  body += prop('Thiết bị (Mã)', esc(l.assetName||l.model||'—') + ' <span style="color:var(--muted);font-weight:400">· ' + esc(l.assetCode||l.code||'—') + '</span>');
  body += prop('Mục đích', esc(l.purpose));
  body += prop('Tình trạng', esc(l.condition));
  body += prop('Hạn trả', esc(l.returnDate));
  body += prop('Trạng thái', formatStatusBadge(l.status));
  body += `</div>`;
  modal('Chi tiết Nhật ký', body);
};

window.showRequestDetail = function(id) {
  const r = app.data.requests.find(x=>[x.id,x.key,x.timestamp].some(v=>v!=null&&String(v)===String(id))); if(!r) return;
  const prop = (lbl, v) => `<div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)"><div style="width:160px;color:var(--muted);font-size:13px;">${esc(lbl)}</div><div style="flex:1;font-size:13px;color:var(--text);font-weight:600;">${v}</div></div>`;
  let body = `<div style="display:flex;flex-direction:column;margin-bottom:24px;">`;
  body += prop('Quyết định', formatStatusBadge(r.borrowDecision));
  body += prop('Thời gian gửi', esc(r.timestamp));
  body += prop('Người đăng ký', esc(r.name) + ' <span style="color:var(--muted);font-weight:400">· ' + esc(r.department) + ' · ' + esc(r.email) + '</span>');
  body += prop('Thiết bị yêu cầu', esc(r.equipment));
  body += prop('Số lượng', esc(r.quantity));
  body += prop('Ngày mượn / trả', esc(r.borrowDate||r.loanDate||'—') + ' → ' + esc(r.returnDate));
  body += prop('Lý do mượn', esc(r.purpose));
  body += `</div>`;
  modal('Chi tiết Yêu cầu mượn', body);
};


window.addToBorrow = function(model, event) {
  if(!app.selectedAssets) app.selectedAssets = [];
  if(app.selectedAssets.includes(model)) return;
  app.selectedAssets.push(model);
  if(event && event.target) {
     event.target.style.background = '#2563eb';
     event.target.style.color = '#fff';
     event.target.textContent = 'Đang trong giỏ';
     event.target.onclick = e => { if(e) e.stopPropagation(); };
  }
  
  const d = document.getElementById('detail-dialog');
  if(d) d.close();
  
  // Create flying element
  const flyEl = document.createElement('div');
  flyEl.style.position = 'fixed';
  flyEl.style.zIndex = '99999';
  flyEl.style.width = '20px';
  flyEl.style.height = '20px';
  flyEl.style.background = 'var(--green)';
  flyEl.style.borderRadius = '50%';
  flyEl.style.pointerEvents = 'none';
  flyEl.style.boxShadow = '0 4px 12px rgba(46,178,140,0.5)';
  
  // Starting position (from the clicked button)
  const rect = event.target.getBoundingClientRect();
  const startX = rect.left + rect.width / 2 - 10;
  const startY = rect.top + rect.height / 2 - 10;
  
  flyEl.style.left = startX + 'px';
  flyEl.style.top = startY + 'px';
  document.body.appendChild(flyEl);
  
  // Target position (the main borrow button)
  const targetBtn = document.getElementById('btn-borrow-main');
  if(!targetBtn) {
     flyEl.remove();
     showBorrowForm();
     return;
  }
  
  const targetRect = targetBtn.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2 - 10;
  const targetY = targetRect.top + targetRect.height / 2 - 10;
  
  // Animate
  flyEl.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${targetX - startX}px, ${targetY - startY}px) scale(0.5)`, opacity: 0.5 }
  ], {
    duration: 600,
    easing: 'cubic-bezier(0.2, 1, 0.3, 1)'
  }).onfinish = () => {
    flyEl.remove();
    // Pop the main button
    targetBtn.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.15)' },
      { transform: 'scale(1)' }
    ], { duration: 300, easing: 'ease-out' });
    
    // Add a small badge to the button
    let badge = document.getElementById('borrow-badge');
    if(!badge) {
       badge = document.createElement('span');
       badge.id = 'borrow-badge';
       badge.style.position = 'absolute';
       badge.style.top = '-4px';
       badge.style.right = '-4px';
       badge.style.minWidth = '18px';
       badge.style.height = '18px';
       badge.style.background = '#ef4444';
       badge.style.color = '#fff';
       badge.style.fontSize = '10px';
       badge.style.fontWeight = 'bold';
       badge.style.display = 'flex';
       badge.style.alignItems = 'center';
       badge.style.justifyContent = 'center';
       badge.style.borderRadius = '9px';
       badge.style.border = '2px solid #fff';
       
       if(targetBtn.style.position !== 'relative') targetBtn.style.position = 'relative';
       targetBtn.appendChild(badge);
    }
    badge.textContent = app.selectedAssets.length;
  };
};


window.removeBorrowAsset = function(idx) {
  if(app.selectedAssets) {
    const removedModel = app.selectedAssets[idx];
    app.selectedAssets.splice(idx, 1);
    
    // Revert button state in DOM
    document.querySelectorAll('button[data-model]').forEach(btn => { if(btn.dataset.model !== removedModel) return;
       if (btn.textContent === 'Đang trong giỏ') {
           btn.style.background = 'var(--green)';
           btn.textContent = 'Mượn thiết bị';
           btn.setAttribute('onclick', 'event.stopPropagation(); addToBorrow(this.dataset.model, event)');
       }
    });
    
    // Update badge if visible
    const badge = document.getElementById('borrow-badge');
    if(badge) {
      badge.textContent = app.selectedAssets.length;
      if(app.selectedAssets.length === 0) badge.remove();
    }
    
    // Update form DOM
    const container = document.getElementById('borrow-tags');
    if(container) {
      container.innerHTML = app.selectedAssets.map((asset, i) => `
        <span class="borrow-tag" style="background:#e2e8f0;color:#334155;padding:6px 12px;border-radius:16px;font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px;">
          ${esc(asset)}
          <button type="button" onclick="removeBorrowAsset(${i})" style="background:none;border:none;cursor:pointer;color:#64748b;display:flex;padding:0;margin:0;font-size:14px;line-height:1">&times;</button>
        </span>
      `).join('');
    }
    const input = document.getElementById('borrow-equipment-input');
    if(input) input.value = app.selectedAssets.join(', ');
    const qtyInput = document.getElementById('borrow-qty-input');
    if(qtyInput) qtyInput.value = Math.max(1, app.selectedAssets.length);
  }
};


window.toggleCartPopover = function(e) {
  if(e) e.stopPropagation();
  let popover = document.getElementById('cart-popover');
  const btn = document.getElementById('btn-borrow-main');
  
  if(popover) {
    popover.remove();
    if(btn) btn.style.boxShadow = '';
    return;
  }
  
  if(btn) btn.style.boxShadow = '0 0 0 3px rgba(46, 178, 140, 0.3)';
  
  popover = document.createElement('div');
  popover.id = 'cart-popover';
  popover.className = 'cart-popover';
  
  popover.addEventListener('click', ev => ev.stopPropagation());
  
  const renderPopover = () => {
    if(!app.selectedAssets || app.selectedAssets.length === 0) {
      popover.innerHTML = `<div class="cart-empty">
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" stroke-width="1.5" style="margin:0 auto 12px auto;display:block;opacity:0.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        <div style="font-weight:500;color:var(--text);margin-bottom:4px">Giỏ trống</div>
        Bấm nút "Mượn thiết bị" trên từng dòng để thêm vào giỏ.
      </div>`;
      return;
    }
    
    let itemsHtml = '';
    app.selectedAssets.forEach((model, idx) => {
      const asset = app.data.assets.find(a => a.model === model) || { group: 'Khác', code: '' };
      const iconSvg = asset.group.toLowerCase().includes('máy ảnh') ? '<rect x="3" y="8" width="18" height="12" rx="2" ry="2"></rect><circle cx="12" cy="14" r="3"></circle><path d="M7 8v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path>' : '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>';
      itemsHtml += `<div class="cart-item">
        <div class="cart-item-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg></div>
        <div class="cart-item-info">
          <div class="cart-item-title">${esc(model)}</div>
          <div class="cart-item-sub">${esc(asset.group)} ${asset.code ? '· '+esc(asset.code) : ''}</div>
        </div>
        <button class="cart-item-remove" onclick="removeBorrowAsset(${idx}); setTimeout(window._renderCartPopover, 10)" title="Bỏ khỏi giỏ"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>`;
    });
    
    popover.innerHTML = `
      <div style="padding:0 16px 12px 16px;border-bottom:1px solid var(--line);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <strong style="font-size:14px">Đã chọn mượn</strong>
          <span class="badge blue">${app.selectedAssets.length}</span>
        </div>
        <button type="button" onclick="clearBorrowAssets()" title="Xóa tất cả" style="background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;padding:4px;border-radius:6px" onmouseover="this.style.background='#f1f5f9';this.style.color='#ef4444'" onmouseout="this.style.background='none';this.style.color='var(--muted)'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      </div>
      <div class="cart-list">${itemsHtml}</div>
      <div class="cart-footer">
        <button class="cart-checkout-btn" onclick="document.getElementById('cart-popover').remove(); showBorrowForm()">Tiến hành đăng ký mượn</button>
      </div>
    `;
  };
  
  window._renderCartPopover = renderPopover;
  renderPopover();
  
  document.getElementById('cart-container-wrap').appendChild(popover);
};

// Global click to close popover
document.addEventListener('click', e => {
  const pop = document.getElementById('cart-popover');
  if(pop && !e.target.closest('#cart-container-wrap')) {
    pop.remove();
    const btn = document.getElementById('btn-borrow-main');
    if(btn) btn.style.boxShadow = '';
  }
});


window.clearBorrowAssets = function() {
  if(!app.selectedAssets) return;
  app.selectedAssets.forEach(model => {
    document.querySelectorAll('button[data-model]').forEach(btn => { if(btn.dataset.model !== model) return;
       if (btn.textContent === 'Đang trong giỏ') {
           btn.style.background = 'var(--green)';
           btn.textContent = 'Mượn thiết bị';
           btn.setAttribute('onclick', 'event.stopPropagation(); addToBorrow(this.dataset.model, event)');
       }
    });
  });
  app.selectedAssets = [];
  
  const badge = document.getElementById('borrow-badge');
  if(badge) badge.remove();
  
  const pop = document.getElementById('cart-popover');
  if(pop) {
    pop.remove();
    const btn = document.getElementById('btn-borrow-main');
    if(btn) btn.style.boxShadow = '';
  }
};


// ===== MISSING FUNCTIONS ADDED BACK =====
window.toggleProfileMenu = () => {
  const dd = document.getElementById('profile-dropdown');
  if(!dd) return;
  const isOpen = !dd.hidden;
  dd.hidden = isOpen;
  if(!isOpen) {
    dd.style.animation = 'profileDropIn 0.25s cubic-bezier(0.22,1,0.36,1) forwards';
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if(!e.target.closest('.profile-dropdown-wrap')) {
          dd.hidden = true;
          document.removeEventListener('click', _close);
        }
      });
    }, 10);
  }
};

window.closeProfileMenu = () => {
  const dd = document.getElementById('profile-dropdown');
  if(dd) dd.hidden = true;
};

window._notifLog = [];
window._notifScope = '';
const notifStoreKey = () => {
  const user=app.data?.currentUser||{};
  return 'hub_notif_log_v2:'+String(user.email||window.ACTIVE_EMAIL||'').toLowerCase()+':'+String(user.department||'').toLowerCase();
};
const syncNotifScope = () => {
  const key=notifStoreKey();
  if(window._notifScope===key)return;
  window._notifScope=key;
  try { window._notifLog=JSON.parse(sessionStorage.getItem(key)||'[]'); } catch { window._notifLog=[]; }
};

window.addNotif = (msg) => {
  syncNotifScope();
  const entry = { time: new Date().toISOString(), msg };
  window._notifLog.unshift(entry);
  if(window._notifLog.length > 50) window._notifLog.length = 50;
  try { sessionStorage.setItem(window._notifScope, JSON.stringify(window._notifLog)); } catch(e){}
  const badge = document.getElementById('notif-badge');
  if(badge) badge.style.display = 'block';
};

window.completeTask = async (key, btn) => {
  const task=app.data.tasks.find(t=>t.key===key);
  if(!task)return toast('Không tìm thấy dòng task. Hãy đồng bộ lại.');
  if(!confirm('Đánh dấu Task '+task.id+' là hoàn thành?'))return;
  if(btn?.disabled)return;
  if(btn)btn.disabled=true;
  try {
    if(typeof google!=='undefined'&&google.script){
      await new Promise((resolve,reject)=>google.script.run.withSuccessHandler(r=>r?.ok===false?reject(new Error(r.error)):resolve(r)).withFailureHandler(reject).apiMoveTask({id:task.id,row:task.row,status:'Done',expectedStatus:task.status||''}));
    }
    task.status='Done';closeModal();render();
    toast(typeof google!=='undefined'&&google.script?'Đã hoàn thành task.':'Đã hoàn thành trong phiên local.');
    if(typeof google!=='undefined'&&google.script)await load(false);
  }catch(error){toast(error.message);}
  finally{if(btn)btn.disabled=false;}
};

window.deleteTask = (taskId, btn) => {
  const tr = btn.closest('tr');
  if(!confirm('Xóa Task ' + taskId + '? Hành động này không thể hoàn tác.')) return;
  if(typeof google !== 'undefined' && google.script) {
    google.script.run.withSuccessHandler(() => {
      tr.style.transition = 'opacity 0.4s, transform 0.4s';
      tr.style.opacity = '0'; tr.style.transform = 'translateX(-40px)';
      setTimeout(() => { tr.remove(); }, 400);
      window.addNotif('🗑️ Task ' + taskId + ' đã bị xóa');
      toast('Task ' + taskId + ' đã xóa!');
    }).withFailureHandler(e => toast('Lỗi: ' + e.message)).apiUpdateTask({id: taskId, status: 'Đã xóa'});
  } else {
    tr.style.transition = 'opacity 0.4s, transform 0.4s';
    tr.style.opacity = '0'; tr.style.transform = 'translateX(-40px)';
    setTimeout(() => { tr.remove(); }, 400);
    window.addNotif('🗑️ Task ' + taskId + ' đã bị xóa');
    toast('Task ' + taskId + ' đã xóa (local)!');
  }
};

window.toggleNotifPanel = () => {
  const panel = document.getElementById('notif-panel');
  if(!panel) return;
  const isOpen = !panel.hidden;
  panel.hidden = isOpen;
  if(!isOpen) {
    syncNotifScope();
    const badge = document.getElementById('notif-badge');
    if(badge) badge.style.display = 'none';
    const logs = window._notifLog;
    if(!logs.length) {
      panel.innerHTML = '<div style="padding:20px;text-align:center;color:#7e94b1;font-size:13px">Chưa có thông báo nào</div>';
    } else {
      panel.innerHTML = '<div style="padding:14px 16px 10px;border-bottom:1px solid #e8f0fb;font-weight:700;font-size:14px;color:var(--text)">Thông báo</div>' +
        '<div style="max-height:320px;overflow-y:auto">' +
        logs.map(n => {
          const d = new Date(n.time);
          const timeStr = d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) + ' · ' + d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
          return '<div style="padding:12px 16px;border-bottom:1px solid #f0f5fb;font-size:13px;line-height:1.5"><div>' + esc(n.msg) + '</div><small style="color:#7e94b1;font-size:11px">' + timeStr + '</small></div>';
        }).join('') +
        '</div>' +
        '<button onclick="window._notifLog=[];sessionStorage.removeItem(window._notifScope);toggleNotifPanel();toggleNotifPanel()" style="display:block;width:100%;padding:12px;border:none;border-top:1px solid #e8f0fb;background:none;color:#2775d9;font-size:12px;font-weight:700;cursor:pointer">Xóa tất cả</button>';
    }
    panel.style.animation = 'profileDropIn 0.25s cubic-bezier(0.22,1,0.36,1) forwards';
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if(!e.target.closest('.notif-dropdown-wrap')) {
          panel.hidden = true;
          document.removeEventListener('click', _close);
        }
      });
    }, 10);
  }
};

// Mobile-only presentation controls. Data, desktop layout and actions remain shared.
(() => {
  const mobile = matchMedia('(max-width: 720px)');
  const nav = document.getElementById('mobile-nav');
  const toggles = [];
  function addToggle(host, target, label, initiallyOpen = false) {
    if (!host || !target) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mobile-disclosure';
    button.setAttribute('aria-controls', target.id);
    let open = initiallyOpen;
    const sync = () => {
      target.classList.toggle('mobile-collapsed', !open);
      button.setAttribute('aria-expanded', String(!mobile.matches || open));
      button.textContent = `${label} ${open ? '−' : '+'}`;
    };
    button.addEventListener('click', () => { open = !open; sync(); });
    host.append(button); toggles.push(sync); sync();
  }
  addToggle(document.querySelector('.context-bar'), document.getElementById('filter-bar'), 'Bộ lọc');
  addToggle(document.querySelector('.activity-panel .panel-heading'), document.getElementById('activity-content'), 'Lịch sử');
  addToggle(document.querySelector('.team-panel .panel-heading'), document.getElementById('team-content'), 'Đội ngũ');
  mobile.addEventListener('change', () => toggles.forEach(sync => sync()));
  nav.addEventListener('click', e => {
    if(e.target.closest('[data-view]')) requestAnimationFrame(() => window.scrollTo({top:0,behavior:'instant'}));
  });
  // Hide the dock and its blur together on downward scroll; restore upward.
  const navMask = document.querySelector('.mobile-nav-mask');
  const setNavHidden = hidden => {
    nav.classList.toggle('nav-scroll-hidden', hidden);
    navMask?.classList.toggle('nav-scroll-hidden', hidden);
  };
  let lastY = Math.max(0, window.scrollY), travel = 0;
  window.addEventListener('scroll', () => {
    const y = Math.max(0, window.scrollY), delta = y - lastY;
    if (!mobile.matches || y <= 20) {
      setNavHidden(false); travel = 0;
    } else {
      if (delta && Math.sign(delta) !== Math.sign(travel)) travel = 0;
      travel += delta;
      if (travel > 15 && y > 60) { setNavHidden(true); travel = 0; }
      else if (travel < -15) { setNavHidden(false); travel = 0; }
    }
    lastY = y;
  }, {passive:true});
  nav.addEventListener('focusin', () => setNavHidden(false));
  mobile.addEventListener('change', () => {setNavHidden(false); travel=0; lastY=Math.max(0,window.scrollY);});
  // Label table fields once after every render, retaining all existing buttons/actions.
  function adaptTables(root) {
    const tables = root.matches?.('table.task-table') ? [root] : [...(root.querySelectorAll?.('table.task-table') || [])];
    for (const table of tables) {
      if (table.classList.contains('mobile-card-table')) continue;
      const labels = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      table.classList.add('mobile-card-table');
      for (const row of table.querySelectorAll('tbody tr')) {
        [...row.cells].forEach((cell,i) => {cell.dataset.label = labels[i] || '';});
        if(row.dataset.detail) {
          row.tabIndex=0; row.setAttribute('role','button');
          row.setAttribute('aria-label', 'Xem chi tiết '+row.textContent.trim().replace(/\s+/g,' ').slice(0,100));
          row.addEventListener('keydown',e=>{if(e.target===row&&['Enter',' '].includes(e.key)){e.preventDefault();row.click();}});
        }
      }
    }
  }
  const observer = new MutationObserver(records => {
    for(const record of records) for(const node of record.addedNodes) if(node.nodeType===1) adaptTables(node);
  });
  observer.observe(document.getElementById('secondary-view'), {childList:true,subtree:true});
  observer.observe(document.getElementById('dialog-body'), {childList:true,subtree:true});
  adaptTables(document);
  // Hide the dock while typing with a touch keyboard; restore on blur or resize.
  function keyboardState() {
    const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    const keyboard = window.visualViewport && window.innerHeight-window.visualViewport.height>120;
    nav.classList.toggle('keyboard-hidden', mobile.matches && editing && keyboard);
  }
  window.visualViewport?.addEventListener('resize',keyboardState);
  document.addEventListener('focusin',keyboardState);
  document.addEventListener('focusout',()=>requestAnimationFrame(keyboardState));
})();



// Task workspace uses the existing Task Master schema and row identities.
(() => {
  const state = {view:'board', project:'all', priority:'all', status:'all', week:0, calendarStart:'', calendarEnd:'', pending:new Set()};
  const stages = [
    {id:'todo',label:'Cần làm',value:'Pending',tone:'slate'},
    {id:'doing',label:'Đang thực hiện',value:'On going',tone:'blue'},
    {id:'review',label:'Cần phản hồi',value:'Feedback',tone:'amber'},
    {id:'done',label:'Hoàn tất',value:'Done',tone:'green'},
    {id:'other',label:'Trạng thái khác',value:null,tone:'slate'}
  ];
  const stageOf = t => isDone(t)?'done':/^(feedback|on review|review)$/.test(normalize(t.status))?'review':/^(on going|ongoing|in progress|on process)$/.test(normalize(t.status))?'doing':/^(pending|to do|todo|)$/.test(normalize(t.status))?'todo':'other';
  const live = () => typeof google !== 'undefined' && !!google.script;
  const manager = () => !!(app.data?.meta?.canManage ?? app.data?.access?.canManage);
  const canEdit = t => manager() || people(t).some(p=>normalize(p)===normalize(app.data?.currentUser?.pic));
  const dateKey = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const taskFor = key => app.data.tasks.find(t=>t.key===key);
  const filtered = () => currentRows().filter(t=>(state.project==='all'||t.project===state.project)&&(state.priority==='all'||t.priority===state.priority)&&(state.status==='all'||stageOf(t)===state.status));
  const calendarTone = t => isDone(t)?'done':/^(on going|ongoing|in progress|on process)$/.test(normalize(t.status))?'doing':/^(pending|to do|todo|cancel|cancelled|canceled)$/.test(normalize(t.status))?'pending':/^(feedback|on review|review)$/.test(normalize(t.status))?'feedback':'feedback';
  const selectOptions = (values,selected,all) => `<option value="all">${all}</option>`+values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v||'Chưa gắn dự án')}</option>`).join('');
  const assignees = t => people(t).length?`<span class="tw-people" aria-label="${esc(t.pic)}">${people(t).slice(0,3).map(p=>{const u=app.data.users.find(u=>normalize(u.pic)===normalize(p));return `<span title="${esc(u?.name||p)}">${avatar(u||{name:p})}</span>`;}).join('')}${people(t).length>3?`<small>+${people(t).length-3}</small>`:''}</span>`:'<span class="tw-muted">Chưa giao</span>';
  const dateLabel = t => `<span class="tw-date ${isOpen(t)&&dueDays(t)<0?'tw-late':''}">${icon('calendar')}${parseDate(t.deadline)?esc(fmt(t.deadline)):'Chưa có hạn'}</span>`;
  function card(t,compact=false){
    const stage=stages.find(s=>s.id===stageOf(t));
    return `<button type="button" class="tw-card ${compact?'tw-compact':''} ${state.pending.has(t.key)?'tw-saving':''}" data-tw-task="${esc(t.key)}" draggable="${canEdit(t)&&!state.pending.has(t.key)}" aria-label="${esc(t.id+' · '+taskTitle(t))}" style="--stage:${{blue:'#4388dd',amber:'#ca941e',green:'#279561',slate:'#91a2b9'}[stage.tone]}"><span class="tw-card-top"><small>${esc(t.id||'Task')}</small>${priority(t)}</span><strong>${esc(taskTitle(t))}</strong><span class="tw-project">${esc(t.project||'Chưa gắn dự án')}</span>${!compact&&t.deliverable?`<span class="tw-deliverable">${icon('list')}<span>${esc(t.deliverable)}</span></span>`:''}<span class="tw-card-foot">${dateLabel(t)}${assignees(t)}</span>${state.pending.has(t.key)?'<span class="tw-muted">Đang lưu…</span>':''}</button>`;
  }
  function board(rows){
    return `<div class="tw-board">${stages.filter(s=>s.id!=='other'||rows.some(t=>stageOf(t)==='other')).map(s=>{const tasks=rows.filter(t=>stageOf(t)===s.id);return `<section class="tw-column tw-${s.tone}" data-tw-drop="${s.id}"><header><h3><i></i>${s.label}<span>${tasks.length}</span></h3>${manager()&&s.value?`<button type="button" data-tw-create="${esc(s.value)}" aria-label="Thêm task ${s.label}">+</button>`:''}</header><div class="tw-column-body">${tasks.map(t=>card(t)).join('')||'<div class="tw-column-empty">Chưa có công việc</div>'}</div></section>`;}).join('')}</div>`;
  }
  function list(rows){
    const visible=state.status==='all'?rows.filter(t=>!isDone(t)):rows;
    if(!visible.length)return empty('Không có công việc phù hợp','Chọn trạng thái Hoàn tất trong bộ lọc để xem task đã đóng.');
    return `<div class="tw-list">${stages.map(s=>{const tasks=visible.filter(t=>stageOf(t)===s.id);if(!tasks.length)return '';return `<section class="tw-list-group tw-${s.tone}"><h3><i></i>${s.label}<span>${tasks.length}</span></h3><div class="tw-table-scroll"><table><thead><tr><th>Công việc</th><th>Người phụ trách</th><th>Bắt đầu</th><th>Deadline</th><th>Ưu tiên</th></tr></thead><tbody>${tasks.map(t=>`<tr><td><button data-tw-task="${esc(t.key)}"><small>${esc(t.id)}</small><strong>${esc(taskTitle(t))}</strong><span>${esc(t.project||'Chưa gắn dự án')}</span></button></td><td>${assignees(t)}<small>${esc(t.pic)}</small></td><td>${esc(fmt(t.startDate))}</td><td>${dateLabel(t)}</td><td>${priority(t)}</td></tr>`).join('')}</tbody></table></div></section>`;}).join('')}${state.status==='all'?'<p class="tw-list-note">Task hoàn tất đang được ẩn. Chọn “Hoàn tất” trong bộ lọc để xem.</p>':''}</div>`;
  }
  function calendar(rows){
    const rangeStart=parseDate(state.calendarStart),rangeEnd=parseDate(state.calendarEnd||state.calendarStart);
    const anchor=rangeStart||new Date();
    const start=new Date(anchor);start.setHours(0,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7+state.week*7);
    const rangeDays=rangeStart&&rangeEnd?Math.round((Date.UTC(rangeEnd.getFullYear(),rangeEnd.getMonth(),rangeEnd.getDate())-Date.UTC(rangeStart.getFullYear(),rangeStart.getMonth(),rangeStart.getDate()))/86400000)+1:7;
    const dates=Array.from({length:Math.max(1,rangeDays)},(_,i)=>{const d=new Date(rangeStart||start);d.setDate(d.getDate()+i);return d;});
    const inRange=value=>{const d=parseDate(value);return !!d&&(!rangeStart||(d>=rangeStart&&d<=rangeEnd));};
    const calendarRows=rangeStart?rows.filter(t=>inRange(t.deadline)||inRange(t.airDate)):rows;
    const unscheduled=rangeStart?[]:rows.filter(t=>!parseDate(t.deadline)&&!parseDate(t.airDate));
    const selectedLabel=rangeStart?(rangeEnd&&dateKey(rangeEnd)!==dateKey(rangeStart)?`${fmt(dateKey(rangeStart))} — ${fmt(dateKey(rangeEnd))}`:fmt(dateKey(rangeStart))):fmt(dateKey(state.week?start:anchor));
    return `<div class="tw-calendar-toolbar"><div><strong>${selectedLabel}</strong><p>${rangeStart?'Đang lọc task theo ngày đã chọn':'Chọn ngày để lọc task theo deadline hoặc lịch đăng'}</p></div><div class="tw-calendar-controls"><button data-tw-week="-1" aria-label="Tuần trước">${icon('left')}</button><div class="tw-calendar-picker" title="Chọn khoảng ngày để lọc task">${icon('calendar')}<input type="hidden" id="tw-calendar-start" value="${esc(state.calendarStart)}"><input type="hidden" id="tw-calendar-end" value="${esc(state.calendarEnd)}"><input type="text" id="tw-calendar-date-display" readonly value="${esc(selectedLabel)}" onclick="openCalendar({displayId:'tw-calendar-date-display',startId:'tw-calendar-start',endId:'tw-calendar-end',mode:'range'},event)" aria-label="Chọn ngày để lọc lịch tuần"></div><button data-tw-week="1" aria-label="Tuần sau">${icon('right')}</button></div></div><div class="tw-calendar">${dates.map((d,i)=>{const events=calendarRows.flatMap(t=>[['deadline','Deadline'],['airDate','Lịch đăng']].filter(([field])=>{const parsed=parseDate(t[field]);return parsed&&dateKey(parsed)===dateKey(d)&&inRange(t[field]);}).map(([field,label])=>({t,field,label})));return `<section class="tw-day ${dateKey(d)===dateKey(new Date())?'tw-today':''}"><header><span>${['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]}</span><b>${d.getDate()}</b></header>${events.map(({t,field,label})=>`<div class="tw-event tw-status-${calendarTone(t)}"><small>${label} · ${esc(t.status||'Chưa đặt trạng thái')}</small>${card(t,true)}</div>`).join('')||'<p class="tw-day-empty">Không có lịch</p>'}</section>`;}).join('')}</div>${rangeStart?`<p class="tw-calendar-filter-note">${calendarRows.length} task phù hợp với khoảng ngày đã chọn.</p>`:`<details class="tw-unscheduled"><summary>Chưa có lịch <b>${unscheduled.length}</b></summary><div>${unscheduled.map(t=>card(t,true)).join('')||'<p>Tất cả công việc đã có lịch.</p>'}</div></details>`}`;
  }
  function taskFilterControls(){
    const rows=currentRows();
    return `<select data-tw-top-filter="project" aria-label="Lọc theo dự án">${selectOptions([...new Set(rows.map(t=>t.project||''))].sort(),state.project,'Tất cả dự án')}</select><select data-tw-top-filter="priority" aria-label="Lọc theo ưu tiên">${selectOptions([...new Set(rows.map(t=>t.priority).filter(Boolean))],state.priority,'Mọi ưu tiên')}</select><select data-tw-top-filter="status" aria-label="Lọc theo trạng thái"><option value="all">Mọi trạng thái</option>${stages.map(s=>`<option value="${s.id}" ${state.status===s.id?'selected':''}>${s.label}</option>`).join('')}</select>${state.project!=='all'||state.priority!=='all'||state.status!=='all'?'<button type="button" class="tw-top-reset" data-tw-top-reset>Xoá lọc</button>':''}`;
  }
  function installTaskFilters(){
    const bar=$('filter-bar');if(!bar)return;
    let controls=$('tw-top-filters');
    if(!controls){controls=document.createElement('span');controls.id='tw-top-filters';controls.className='tw-top-filters';bar.insertBefore(controls,$('reset-filters'));}
    controls.innerHTML=taskFilterControls();
  }
  function removeTaskFilters(){$('tw-top-filters')?.remove();}
  function renderWorkspace(){
    if(!app.data)return;
    installTaskFilters();
    const rows=filtered(),total=rows.length,done=rows.filter(isDone).length,late=rows.filter(t=>isOpen(t)&&dueDays(t)!==null&&dueDays(t)<0).length;
    $('secondary-view').innerHTML=`<section class="tw-workspace"><header class="tw-heading"><div><span class="eyebrow">TASK WORKSPACE</span><h2>Công việc của đội ngũ</h2><p><b>${total}</b> công việc <span>·</span> <b>${done}</b> hoàn tất <span>·</span> <b class="${late?'tw-late':''}">${late}</b> quá hạn</p></div><div class="tw-workspace-actions"><div class="tw-views" role="group" aria-label="Chế độ xem công việc">${[['board','grid','Kanban'],['list','list','Danh sách'],['calendar','calendar','Lịch tuần']].map(([v,i,label])=>`<button data-tw-view="${v}" aria-pressed="${state.view===v}" class="${state.view===v?'active':''}">${icon(i)}${label}</button>`).join('')}</div>${manager()?'<button class="tw-primary" data-tw-create="Pending">+ Tạo <span class="tw-create-wide">công việc</span></button>':''}</div></header><div class="tw-view-content">${!total?empty('Không có công việc phù hợp','Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.'):state.view==='board'?board(rows):state.view==='list'?list(rows):calendar(rows)}</div><p class="tw-footnote">${live()?'Đồng bộ Task Master':'Bản xem local · thay đổi chỉ lưu trong phiên này'}${state.view==='board'?' · Kéo thẻ để đổi trạng thái, hoặc mở chi tiết để chọn trạng thái.':''}</p></section>`;
  }
  const previousRender=renderSecondary;
  renderSecondary=function(){if(app.view==='tasks')return renderWorkspace();return previousRender.apply(this,arguments);};
  const baseRender=render;
  render=function(){if(app.view!=='tasks')removeTaskFilters();const result=baseRender.apply(this,arguments);if($('source-status'))$('source-status').hidden=app.view==='tasks';return result;};
    
  let activeKey=null,returnFocus=null;
  async function updateStatus(key,status){
    const t=taskFor(key);if(!t||!canEdit(t)||!t.id||state.pending.has(key)||t.status===status)return;
    const before=t.status;state.pending.add(key);t.status=status;renderWorkspace();
    try{
      if(live())await new Promise((resolve,reject)=>google.script.run.withSuccessHandler(r=>r?.ok===false?reject(new Error(r.error)):resolve(r)).withFailureHandler(reject).apiMoveTask({id:t.id,row:t.row,status:status,expectedStatus:before||''}));
      toast(live()?'Đã cập nhật trạng thái':'Đã cập nhật trong phiên xem local');
    }catch(error){t.status=before;toast('Không lưu được: '+error.message);}
    finally{const current=taskFor(key);if(current)current.status=t.status;state.pending.delete(key);if(app.view==='tasks')renderWorkspace();}
  }
  function createTask(status){
    if(!manager())return;
    activeKey=null;
    modal('Tạo công việc mới', getTaskForm());
    setupTaskSubmit();
    const form=$('create-task-form'),control=form?.elements.namedItem('status');
    if(control&&[...control.options].some(o=>o.value===status))control.value=status;
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-tw-task')) window.showTask(b.dataset.twTask);
    if(b.hasAttribute('data-tw-view')){state.view=b.dataset.twView;renderWorkspace();}
    if(b.hasAttribute('data-tw-create'))createTask(b.dataset.twCreate);
    if(b.hasAttribute('data-tw-week')){state.week+=Number(b.dataset.twWeek);state.calendarStart=state.calendarEnd='';renderWorkspace();}
    if(b.hasAttribute('data-tw-top-reset')){state.project=state.priority=state.status='all';renderWorkspace();}
  });
  document.addEventListener('change',e=>{if(e.target.dataset.twTopFilter){state[e.target.dataset.twTopFilter]=e.target.value;renderWorkspace();}if(e.target.id==='tw-calendar-date-display'){state.calendarStart=$('tw-calendar-start')?.value||'';state.calendarEnd=$('tw-calendar-end')?.value||state.calendarStart;state.week=0;renderWorkspace();}if(e.target.dataset.twStatus)updateStatus(e.target.dataset.twStatus,e.target.value);});
  let dragging=null;
  document.addEventListener('dragstart',e=>{const c=e.target.closest('[data-tw-task]');if(!c||c.draggable!==true)return;dragging=c.dataset.twTask;e.dataTransfer.setData('text/plain',dragging);e.dataTransfer.effectAllowed='move';c.classList.add('tw-dragging');});
  document.addEventListener('dragover',e=>{const col=e.target.closest('[data-tw-drop]');if(!col||!dragging||col.dataset.twDrop==='other')return;e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.tw-drop-target').forEach(n=>n.classList.remove('tw-drop-target'));col.classList.add('tw-drop-target');});
  document.addEventListener('drop',e=>{const col=e.target.closest('[data-tw-drop]');if(!col||!dragging)return;e.preventDefault();const stage=stages.find(s=>s.id===col.dataset.twDrop);if(stage?.value)updateStatus(dragging,stage.value);dragging=null;document.querySelectorAll('.tw-drop-target').forEach(n=>n.classList.remove('tw-drop-target'));});
  document.addEventListener('dragend',()=>{dragging=null;document.querySelectorAll('.tw-dragging,.tw-drop-target').forEach(n=>n.classList.remove('tw-dragging','tw-drop-target'));});
  if(app.data&&app.view==='tasks')renderWorkspace();
})();
