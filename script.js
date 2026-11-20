const scheduleResolver = window.scheduleEngine.resolveSchedule;
const resolveAnchorDate = window.scheduleEngine.resolveAnchorDate;
const statusResolver = window.scheduleEngine.resolveItemStatuses;
const config=window.annualWheelConfig;if(!config)throw new Error('Configuration file is missing');if(!window.annualWheelI18n)throw new Error('Translation catalogue is missing');
const wheel=document.querySelector('.year-wheel'),stage=document.querySelector('.wheel-stage'),panel=document.querySelector('.schedule-panel'),yearLabel=document.querySelector('#selected-year'),zoomLabel=document.querySelector('#zoom-level'),build=window.annualWheelBuild||{},debug=build.debug||{},animationTime=Number(build.animationTime)||400,gracePeriod=Number(build.gracePeriod)||31,showYearAnnulus=build.showYearAnnulus!==false,debugEnabled=Boolean(debug.enabled),debugYears=debugEnabled&&Boolean(debug.years),debugCurrentDisplayDate=debugEnabled&&Boolean(debug.currentDisplayDate);document.documentElement.classList.toggle('debug-current-display-date',debugCurrentDisplayDate);stage.classList.toggle('has-year-annulus',showYearAnnulus);let input,year=config.initialYear==='current'?new Date().getFullYear():config.initialYear,zoom=1,rotation=0,todayAngle=0,renderMode=config.display.renderMode==='continuous'?'continuous':'year',split2Turn=0;const presets=[.88,1,1.16,1.32],expandedGroups=new Set(Object.entries(config.groups||{}).filter(([,group])=>!group.collapsed).map(([id])=>id));
const locale=window.annualWheelI18n.resolveLocale(document.documentElement.dataset.annualWheelLocale||config.display.locale),t=(id,values)=>window.annualWheelI18n.translate(locale,id,values),date=v=>{const[y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d)},copy=d=>new Date(d),fmt=d=>new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short'}).format(d).replace(/\./g,'').toUpperCase(),inputValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,GRACE_PERIOD=gracePeriod,displayDateAtTop=()=>{const start=new Date(year,0,1),end=new Date(year+1,0,1),at=new Date(+start+normalizeAngle(-rotation)/360*(end-start));return new Date(at.getFullYear(),at.getMonth(),at.getDate())};
const defaultFontSettings={provider:'google',stylesheet:'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap'},fontRoot=document.documentElement,fontHref=settings=>{const fonts=settings||defaultFontSettings;if(!['google','selfHosted'].includes(fonts.provider))throw new Error('Font provider must be google or selfHosted.');if(!fonts.stylesheet)throw new Error('Configured font provider requires a stylesheet.');if(fonts.provider==='selfHosted'){if(!fonts.directory||fonts.directory.startsWith('/')||fonts.directory.split('/').includes('..'))throw new Error('Self-hosted font directory must be a safe relative path.');return `/${fonts.directory}/${fonts.stylesheet}`}return fonts.stylesheet},validateFontSettings=async settings=>{const href=fontHref(settings),url=new URL(href,document.baseURI);if(url.origin===location.origin){const response=await fetch(url,{method:'HEAD',cache:'no-store'});if(!response.ok)throw new Error(`Configured stylesheet could not be loaded: ${href}`)}return{fonts:settings||defaultFontSettings,href}},applyFontSettings=async settings=>{const{fonts,href}=await validateFontSettings(settings),pending=document.createElement('link');pending.rel='stylesheet';pending.href=href;pending.media='not all';await new Promise((resolve,reject)=>{pending.onload=resolve;pending.onerror=()=>reject(new Error(`Configured stylesheet could not be loaded: ${href}`));document.head.append(pending)}).catch(error=>{pending.remove();throw error});document.querySelectorAll('link[data-annual-wheel-font]').forEach(link=>link.remove());pending.dataset.annualWheelFont='true';pending.media='all';fontRoot.style.setProperty('--font-sans',fonts.sans||'"DM Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif');fontRoot.style.setProperty('--font-serif',fonts.serif||'Fraunces,ui-serif,Georgia,serif')};applyFontSettings(config.display.fonts).catch(error=>console.error(error));
const nth=(y,m,w,n)=>{const f=new Date(y,m-1,1);return new Date(y,m-1,1+(w-f.getDay()+7)%7+(n-1)*7)},last=(y,m,w)=>{const d=new Date(y,m,0);d.setDate(d.getDate()-(d.getDay()-w+7)%7);return d},next=(d,w)=>{d=copy(d);d.setDate(d.getDate()+((w-d.getDay()+7)%7||7));return d},prev=(d,w)=>{d=copy(d);d.setDate(d.getDate()-((d.getDay()-w+7)%7||7));return d};
const easter=y=>{const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);return new Date(y,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1)};
const holiday=(d,skip)=>{const y=d.getFullYear(),t=+d;if(skip?.includes('easter')){const e=easter(y),a=copy(e),b=copy(e);a.setDate(e.getDate()-6);b.setDate(e.getDate()+1);if(t>=a&&t<=b)return true}if(skip?.includes('autumn_holiday')){const j=new Date(y,0,4),a=new Date(y,0,4-((j.getDay()||7)-1)+39*7),b=copy(a);b.setDate(a.getDate()+6);if(t>=a&&t<=b)return true}return false};
const course=(start,direction,weekday,count,skip)=>{let d=copy(start),out=[];if(direction==='backward')while(d.getDay()!==weekday)d.setDate(d.getDate()-1);else d=next(new Date(+d-86400000),weekday);while(out.length<count){if(!holiday(d,skip))direction==='backward'?out.unshift(copy(d)):out.push(copy(d));d.setDate(d.getDate()+(direction==='backward'?-7:7))}return out};
const layer=item=>item.layer==='auto'?config.autoLayers[item.kind]:item.layer;
function translateShell(){document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=t(element.dataset.i18n));document.querySelectorAll('[data-i18n-aria-label]').forEach(element=>element.setAttribute('aria-label',t(element.dataset.i18nAriaLabel)))}
const scheduleCards = panel.querySelector('.schedule-cards');
const scheduleViewport = panel.querySelector('.schedule-viewport');
const layout = document.querySelector('.wheel-layout');
const timelineHeading = panel.querySelector('.timeline-heading');
let editingTimeline = false;
const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long' });
// 4 January 2026 is a Sunday, index zero in schedule weekday rules.
const weekdayName = weekday => weekdayFormatter.format(new Date(2026, 0, 4 + weekday));

function appendWeekdayConstraint(card, schedule) {
  if (schedule.weekday == null && !schedule.constraints?.length) return;
  const weekday = window.scheduleEngine.configuredWeekday(config, schedule);
  if (!Number.isInteger(weekday)) return;
  const line = document.createElement('p');
  line.className = 'rule-line card-weekday';
  line.textContent = t('Weekday · {weekday}', { weekday: weekdayName(weekday) });
  card.querySelector('.rule-line').after(line);
}

function render(){document.title=config.display.title;document.documentElement.lang=locale;translateShell();document.querySelector('.brand').lastChild.nodeValue=` ${config.organisation.name}`;document.querySelector('.intro h1').textContent=config.display.title;document.querySelector('.lede').textContent=config.display.description;document.querySelector('.panel-heading .eyebrow').textContent=t('{organisation} · key dates',{organisation:config.organisation.name});document.querySelectorAll('.month b').forEach((label,index)=>label.textContent=new Intl.DateTimeFormat(locale,{month:'short'}).format(new Date(2026,index,1)).replace(/\./g,'').toUpperCase());const legend=document.querySelector('.legend');legend.replaceChildren(...Object.entries(config.layers).map(([id,x])=>{const b=document.createElement('button');b.className='layer-toggle is-active';b.dataset.layer=id;b.setAttribute('aria-pressed','true');b.innerHTML=`<i class="dot" style="background:${x.color}"></i>${x.label}`;return b}));panel.querySelectorAll('.deadline-card').forEach(x=>x.remove());wheel.querySelectorAll('.event').forEach(x=>x.remove());const displayCard=document.createElement('article');displayCard.className='deadline-card display-date-card';displayCard.dataset.displayDate='true';displayCard.innerHTML=`<span class="card-date"></span><div><p class="card-kind">${t('Display date')}</p><h2>${t('Date at the top of the wheel')}</h2><p class="rule-line"></p></div><span aria-hidden="true"></span>`;scheduleCards.append(displayCard);Object.entries(config.groups||{}).forEach(([id,group])=>{const card=document.createElement('article');card.className='deadline-card deadline-group';card.dataset.group=id;card.hidden=true;card.innerHTML=`<span class="card-date"></span><div><p class="card-kind">${t('Key dates')}</p><h2>${group.title}</h2><p class="rule-line"></p></div><button data-group-toggle="${id}" aria-expanded="${expandedGroups.has(id)}">→</button>`;scheduleCards.append(card)});config.items.forEach(item=>{const l=layer(item),color=config.layers[l].color,c=document.createElement('article'),e=document.createElement('button');c.className=`deadline-card is-${item.status}`;c.dataset.deadlineId=item.id;c.dataset.layer=l;c.innerHTML=`<span class="card-date"></span><div><p class="card-kind" style="color:${color}">${config.layers[l].label}</p><h2>${item.title}</h2><p class="rule-line"></p></div><button aria-label="${t('More about {title}',{title:item.title})}">→</button>`;appendWeekdayConstraint(c, item.schedule);scheduleCards.append(c);e.className='event';e.dataset.deadlineId=item.id;e.dataset.layer=l;e.dataset.label=item.title;e.style.backgroundColor=color;e.innerHTML='<span></span>';wheel.append(e)})}
function renderAnchorControls(){const control=({id,date,statusId,item})=>{const fields=document.createElement('div'),field=document.createElement('input'),status=document.createElement('button');fields.className='anchor-fields card-anchor-fields';field.type='date';field.value=date||'';if(item)field.dataset.itemOverride=id;else field.dataset.anchorId=id;const confirmed=!item&&config.anchors[id].status==='set';status.type='button';status.className=confirmed?'anchor-status is-set':'anchor-status is-tentative';status.dataset[statusId]=id;status.setAttribute('aria-pressed',String(confirmed));status.textContent=t(confirmed?'Set':'Tentative');fields.append(field,status);return fields};Object.entries(config.anchors).filter(([,anchor])=>anchor.configurable).forEach(([id,anchor])=>{const item=config.items.find(candidate=>candidate.schedule.kind==='anchor'&&candidate.schedule.anchor===id),card=item&&panel.querySelector(`[data-deadline-id="${item.id}"]`);card?.querySelector('div').append(control({id,date:inputValue(resolveAnchorDate(anchor,year,anchor.date)),statusId:'anchorStatus'}))});config.items.filter(item=>item.configurable).forEach(item=>panel.querySelector(`[data-deadline-id="${item.id}"]`)?.querySelector('div').append(control({id:item.id,statusId:'itemStatus',item:true})))}
function setupAdjustableDateCards(){panel.querySelectorAll('.card-anchor-fields').forEach(fields=>{const card=fields.closest('.deadline-card'),button=card.querySelector(':scope > button');card.classList.add('has-adjustable-date');fields.hidden=true;button.type='button';button.setAttribute('aria-label',t('Adjust date'));button.setAttribute('aria-expanded','false');button.onclick=()=>{const expanded=fields.hidden;fields.hidden=!expanded;button.setAttribute('aria-expanded',String(expanded))}})}
const buildAdjustableDateControls=renderAnchorControls;renderAnchorControls=()=>{buildAdjustableDateControls();setupAdjustableDateCards()};
const panelCardPositions=()=>new Map([...panel.querySelectorAll('.deadline-card:not([hidden])')].map(card=>[card,{rect:card.getBoundingClientRect(),styles:[card,...card.querySelectorAll('.card-date,.card-kind,h2,.rule-line')].map(element=>({element,backgroundColor:getComputedStyle(element).backgroundColor,borderLeftColor:getComputedStyle(element).borderLeftColor,color:getComputedStyle(element).color}))}]));function animatePanelReflow(before){requestAnimationFrame(()=>{panel.querySelectorAll('.deadline-card:not([hidden])').forEach(card=>{const first=before.get(card),last=card.getBoundingClientRect();if(!first)return;const distance=first.rect.top-last.top;card.animate([{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'cubic-bezier(.2,.8,.2,1)'});first.styles.forEach(previous=>{const current=getComputedStyle(previous.element);previous.element.animate([{backgroundColor:previous.backgroundColor,borderLeftColor:previous.borderLeftColor,color:previous.color},{backgroundColor:current.backgroundColor,borderLeftColor:current.borderLeftColor,color:current.color}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'ease'})})})})}
function updateDebugCardYears(){if(editingTimeline)return;panel.querySelectorAll('.deadline-card[data-deadline-id]').forEach(card=>{const event=wheel.querySelector(`.event[data-deadline-id="${card.dataset.deadlineId}"]`),dateLabel=card.querySelector('.card-date');if(debugYears){card.dataset.debugYear=event.dataset.year;dateLabel.textContent=`${dateLabel.textContent.replace(/\s+\d{4}$/,'')} ${event.dataset.year}`}else delete card.dataset.debugYear})}
function describeScheduleRule(item, occurrence) {
  if (item.rule) return item.rule;
  if (item.schedule.kind === 'course' && occurrence.sessions?.length) {
    return `${t('{count} course days', { count: item.schedule.count })} · ${fmt(occurrence.sessions[0])}–${fmt(occurrence.sessions.at(-1))}`;
  }
  return '';
}
function resolve(targetYear){const runtimeAnchors=Object.fromEntries(Object.entries(config.anchors).filter(([,anchor])=>anchor.configurable).map(([id,anchor])=>[id,anchor.date])),runtimeOverrides=Object.fromEntries([...document.querySelectorAll('[data-item-override]')].filter(field=>document.querySelector(`[data-item-status="${field.dataset.itemOverride}"]`)?.getAttribute('aria-pressed')==='true'&&field.value).map(field=>{const d=date(field.value);return[field.dataset.itemOverride,inputValue(new Date(targetYear,d.getMonth(),d.getDate()))]})),resolved=scheduleResolver(config,targetYear,runtimeAnchors,runtimeOverrides);return Object.fromEntries(config.items.map(item=>[item.id,{...resolved[item.id],rule:describeScheduleRule(item,resolved[item.id])}]))}
function updateGroups(entries){Object.entries(config.groups||{}).forEach(([id])=>{const members=entries.filter(entry=>config.items.find(item=>item.id===entry.card.dataset.deadlineId)?.group===id),visible=members.filter(entry=>!entry.hiddenByDate),card=panel.querySelector(`[data-group="${id}"]`);if(!visible.length){card.hidden=true;return}const expanded=expandedGroups.has(id),first=visible[0];card.hidden=false;card.querySelector('.card-date').textContent=fmt(first.date);card.querySelector('.rule-line').textContent=t('{count} deadlines',{count:visible.length});card.querySelector('[data-group-toggle]').setAttribute('aria-expanded',String(expanded));first.card.before(card);members.forEach(entry=>{const wasCollapsed=entry.card.classList.contains('is-group-collapsed');entry.card.style.setProperty('--group-reveal-duration',`${PANEL_RECALCULATION_MIN_MS}ms`);if(!expanded&&!wasCollapsed&&!entry.hiddenByDate){const style=getComputedStyle(entry.card),height=entry.card.getBoundingClientRect().height;entry.card.classList.add('is-group-collapsed');entry.card.animate([{height:`${height}px`,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,opacity:1},{height:'0px',paddingTop:'0px',paddingBottom:'0px',opacity:0}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'ease'})}else{entry.card.hidden=entry.hiddenByDate;entry.card.classList.toggle('is-group-collapsed',!expanded&&!entry.hiddenByDate);if(expanded&&wasCollapsed&&!entry.hiddenByDate)entry.card.animate([{opacity:0},{opacity:1}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'ease'})}})})}
function paintNow(){if(editingTimeline){paintTimeline();return}const before=panelCardPositions(),years=renderMode==='year'?[year]:[year-1,year,year+1],datesByYear=years.map(resolve),angleForDate=d=>(d-new Date(d.getFullYear(),0,1))/(new Date(d.getFullYear()+1,0,1)-new Date(d.getFullYear(),0,1))*Math.PI*2-Math.PI/2,displayDate=displayDateAtTop(),entries=[];const displayCard=document.querySelector('[data-display-date]');displayCard.querySelector('.card-date').textContent=fmt(displayDate)+' '+displayDate.getFullYear();displayCard.querySelector('.rule-line').textContent=displayDate.getFullYear();config.items.forEach(item=>{const candidates=datesByYear.map(dates=>dates[item.id]),r=renderMode==='year'?candidates[0]:candidates.find(candidate=>candidate.date.getFullYear()===yearAtWheelAngle(angleForDate(candidate.date)*180/Math.PI+rotation))??candidates[0],c=document.querySelector(`.deadline-card[data-deadline-id="${item.id}"]`),e=document.querySelector(`.event[data-deadline-id="${item.id}"]`),a=angleForDate(r.date),days=Math.round((r.date-displayDate)/86400000),grace=days<0&&days>=-GRACE_PERIOD,hiddenByDate=renderMode==='continuous'&&days< -GRACE_PERIOD;c.dataset.exportDate=inputValue(r.date);c.dataset.exportEligible=String(!hiddenByDate);c.querySelector('.card-date').textContent=fmt(r.date);const dateField=c.querySelector('[data-item-override]');if(dateField)dateField.value=inputValue(r.date);c.querySelector('.rule-line').textContent=r.rule;c.classList.toggle('is-grace',grace);c.hidden=hiddenByDate;c.dataset.graceLabel=t('Within {count} days',{count:GRACE_PERIOD});e.style.setProperty('--x',`${50+Math.cos(a)*37}%`);e.style.setProperty('--y',`${50+Math.sin(a)*37}%`);e.dataset.year=r.date.getFullYear();e.querySelector('span').textContent=r.date.getDate();e.setAttribute('aria-label',`${fmt(r.date)}: ${item.title}`);entries.push({card:c,date:r.date,days,grace,hiddenByDate})});const sorted=entries.sort((a,b)=>{const group=x=>x.grace?0:x.days>=0?1:2;return group(a)-group(b)||a.date-b.date});sorted.forEach(entry=>scheduleCards.append(entry.card));updateGroups(sorted);animatePanelReflow(before);updateStatusStyles()}
const PANEL_RECALCULATION_MIN_MS=animationTime;let lastPanelCalculation=-Infinity,pendingPanelCalculation,panelCalculationTimer;function paint(){pendingPanelCalculation=paintNow;if(panelCalculationTimer)return;const wait=Math.max(0,PANEL_RECALCULATION_MIN_MS-(performance.now()-lastPanelCalculation));if(!wait){lastPanelCalculation=performance.now();const next=pendingPanelCalculation;pendingPanelCalculation=undefined;next();updateDebugCardYears();return}panelCalculationTimer=setTimeout(()=>{panelCalculationTimer=undefined;lastPanelCalculation=performance.now();const next=pendingPanelCalculation;pendingPanelCalculation=undefined;next();updateDebugCardYears()},wait)}
function updateStatusStyles(){const statuses=statusResolver(config,Object.fromEntries(Object.entries(config.anchors).map(([id,anchor])=>[id,anchor.status||'tentative'])));config.items.forEach(item=>{const card=document.querySelector(`.deadline-card[data-deadline-id="${item.id}"]`),status=statuses[item.id],override=document.querySelector(`[data-item-status="${item.id}"]`)?.getAttribute('aria-pressed')==='true';card.classList.remove('is-anchor','is-set','is-derived','is-derived-set');if(item.configurable){card.classList.add(override?'is-set':'is-derived');card.dataset.statusLabel=t(override?'Set date':'Tentative');return}if(item.schedule.kind==='anchor'){card.classList.add(status==='set'?'is-set':'is-anchor');card.dataset.statusLabel=t(status==='set'?'Set date':'Tentative')}else if(item.status==='set'){card.classList.add('is-set');card.dataset.statusLabel=t('Set date')}else{card.classList.add(status==='set'?'is-derived-set':'is-derived');card.dataset.statusLabel=t(status==='set'?'Depends on set anchor':'Depends on anchor')}})}
const apply=()=>{wheel.style.setProperty('--wheel-rotation',`${rotation}deg`);wheel.style.setProperty('--today-label-rotation',`${-(rotation+todayAngle)}deg`)};const setYearCycle=(element,segmentYear)=>{const cycle=((segmentYear%4)+4)%4;element.classList.remove('year-cycle-0','year-cycle-1','year-cycle-2','year-cycle-3');element.classList.add(`year-cycle-${cycle}`)};function updateYearBand(y){if(renderMode==='year'){const[segment,following]=document.querySelectorAll('[data-year-segment]'),circle=segment.querySelector('circle'),label=segment.querySelector('text');segment.style.display='';following.style.display='none';circle.setAttribute('stroke-dasharray','100 0');circle.setAttribute('stroke-dashoffset','0');circle.setAttribute('transform','rotate(90 50 50)');label.setAttribute('x','50');label.setAttribute('y','97');label.textContent=y;setYearCycle(segment,y);return}const segments=window.scheduleEngine.yearBandSegments(rotation,y);document.querySelectorAll('[data-year-segment]').forEach((segment,index)=>{const {start,portion:fraction,year:segmentYear}=segments[index],portion=fraction*100,circle=segment.querySelector('circle'),label=segment.querySelector('text'),angle=(start+portion*1.8)*Math.PI/180;segment.style.display=portion>.01?'':'none';circle.setAttribute('stroke-dasharray',`${portion} ${100-portion}`);circle.setAttribute('stroke-dashoffset','0');circle.setAttribute('transform',`rotate(${start} 50 50)`);label.setAttribute('x',String(50+46*Math.cos(angle)));label.setAttribute('y',String(50+46*Math.sin(angle)+1));label.textContent=segmentYear;setYearCycle(segment,segmentYear)})};function setYear(y,{preserveRotation=false,startOfYear=false}={}){year=y;document.querySelectorAll('[data-anchor-id]').forEach(field=>{const anchor=config.anchors[field.dataset.anchorId];field.value=inputValue(resolveAnchorDate(anchor,y,anchor.date))});yearLabel.textContent=y;document.querySelectorAll('.intro .year-text').forEach(x=>x.textContent=y);const now=new Date(),focus=new Date(y,now.getMonth(),now.getDate()),p=(focus-new Date(y,0,1))/(new Date(y+1,0,1)-new Date(y,0,1));todayAngle=-180+p*360;if(!preserveRotation)rotation=startOfYear?0:-p*360;updateYearBand(y);paint();wheel.style.setProperty('--today-angle',`${todayAngle}deg`);wheel.querySelector('.today-line span').textContent=focus.getDate();apply()}
const normalizeAngle=angle=>(angle%360+360)%360,yearAtWheelAngle=angle=>{const start=new Date(year,0,1),end=new Date(year+1,0,1),candidate=new Date(+start+normalizeAngle(angle-rotation+90)/360*(end-start)),graceStart=new Date(displayDateAtTop());graceStart.setDate(graceStart.getDate()-GRACE_PERIOD);return candidate<graceStart?year+1:year},split2TurnAtTop=()=>Math.ceil(rotation/360);
function setRenderMode(mode){renderMode=mode;stage.classList.toggle('is-continuous',mode==='continuous');document.querySelectorAll('[data-render-mode]').forEach(button=>{const active=button.dataset.renderMode===mode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});split2Turn=split2TurnAtTop(year);updateYearBand(year);paint();stage.setAttribute('aria-description',mode==='continuous'?t('Continuous mode: dates enter at the top and leave beneath the lower cut.'): '')}
function updateContinuousYear(){if(renderMode!=='continuous')return;const nextTurn=split2TurnAtTop(year),delta=nextTurn-split2Turn;if(!delta)return;setYear(year-delta,{preserveRotation:true});split2Turn=nextTurn}
function resetContinuousOrigin(){split2Turn=split2TurnAtTop(year)}
function updateDisplayDateCard(){const card=panel.querySelector('[data-display-date]');if(!card)return;const current=displayDateAtTop();card.querySelector('.card-date').textContent=fmt(current)+' '+current.getFullYear();card.querySelector('.rule-line').textContent=current.getFullYear()}
const setZoom=z=>{zoom=Math.max(.78,Math.min(1.5,z));wheel.style.setProperty('--wheel-scale',zoom);stage.style.setProperty('--wheel-scale',zoom);stage.classList.toggle('is-detailed',zoom>1.08);zoomLabel.textContent=`${Math.round(zoom*100)} %`};
render();stage.classList.toggle('is-debug-years',debugYears);renderAnchorControls();input=document.querySelector('[data-anchor-id="general_assembly"]');setYear(year);setRenderMode(renderMode);setZoom(zoom);document.querySelectorAll('[data-anchor-id]').forEach(field=>field.addEventListener('input',()=>{config.anchors[field.dataset.anchorId].date=field.value;paint()}));document.querySelectorAll('[data-anchor-status],[data-item-status]').forEach(field=>field.addEventListener('click',()=>{const set=field.getAttribute('aria-pressed')!=='true';field.setAttribute('aria-pressed',String(set));field.classList.toggle('is-set',set);field.classList.toggle('is-tentative',!set);field.textContent=t(set?'Set':'Tentative');if(field.dataset.anchorStatus)config.anchors[field.dataset.anchorStatus].status=set?'set':'tentative';paint()}));document.querySelectorAll('[data-item-override]').forEach(field=>field.addEventListener('input',()=>{const status=document.querySelector(`[data-item-status="${field.dataset.itemOverride}"]`);status.setAttribute('aria-pressed','true');status.classList.add('is-set');status.classList.remove('is-tentative');status.textContent=t('Set');paint()}));panel.addEventListener('click',event=>{const button=event.target.closest('[data-group-toggle]');if(!button)return;const id=button.dataset.groupToggle;expandedGroups.has(id)?expandedGroups.delete(id):expandedGroups.add(id);paint()});document.querySelectorAll('[data-render-mode]').forEach(button=>button.onclick=()=>setRenderMode(button.dataset.renderMode));document.querySelector('#previous-year').onclick=()=>{setYear(year-1,{startOfYear:true});resetContinuousOrigin()};document.querySelector('#next-year').onclick=()=>{setYear(year+1,{startOfYear:true});resetContinuousOrigin()};document.querySelector('#today-button').onclick=()=>{setYear(new Date().getFullYear());resetContinuousOrigin()};document.querySelector('#zoom-in').onclick=()=>setZoom(presets.find(x=>x>zoom+.005)??presets.at(-1));document.querySelector('#zoom-out').onclick=()=>setZoom(presets.filter(x=>x<zoom-.005).at(-1)??presets[0]);wheel.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom-e.deltaY*.0015)},{passive:false});
panel.addEventListener('click',event=>{const button=event.target.closest('[data-group-toggle]');if(!button)return;event.preventDefault();event.stopPropagation();const id=button.dataset.groupToggle;expandedGroups.has(id)?expandedGroups.delete(id):expandedGroups.add(id);paint()},true);
let dragAngle;const pointer=e=>{const b=wheel.getBoundingClientRect();return Math.atan2(e.clientY-b.top-b.height/2,e.clientX-b.width/2-b.left)*180/Math.PI};wheel.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;dragAngle=pointer(e);wheel.classList.add('is-dragging');wheel.setPointerCapture(e.pointerId)});wheel.addEventListener('pointermove',e=>{if(!wheel.hasPointerCapture(e.pointerId))return;const angle=pointer(e);let delta=angle-dragAngle;if(delta>180)delta-=360;if(delta<-180)delta+=360;rotation+=delta;dragAngle=angle;updateYearBand(year);apply();updateContinuousYear();updateDisplayDateCard();paint()});wheel.addEventListener('pointerup',e=>{wheel.releasePointerCapture(e.pointerId);wheel.classList.remove('is-dragging')});
document.querySelectorAll('.layer-toggle').forEach(b=>b.onclick=()=>{const on=!b.classList.contains('is-active');b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',on);document.querySelectorAll(`[data-layer="${b.dataset.layer}"]`).forEach(x=>x.classList.toggle('is-layer-hidden',!on))});document.querySelectorAll('.event').forEach(e=>e.onclick=()=>{document.querySelectorAll('.deadline-card').forEach(c=>c.classList.remove('active'));document.querySelector(`.deadline-card[data-deadline-id="${e.dataset.deadlineId}"]`)?.classList.add('active')});
const configEditor=document.querySelector('.config-editor'),configEditorTree=configEditor.querySelector('.config-editor-tree'),configEditorError=configEditor.querySelector('.config-editor-error');let sessionConfigDraft;
document.querySelector('.export-calendar').addEventListener('click',async()=>{const displayDate=displayDateAtTop();if((displayDate.getMonth()!==0||displayDate.getDate()!==1)&&!window.confirm(t('The display date is {date}, not 1 January. The export may not cover a full calendar year. Continue?',{date:new Intl.DateTimeFormat(locale,{dateStyle:'long'}).format(displayDate)})))return;paintNow();const {createCalendarEvents,toICalendar,calendarExportFilename}=await import('/lib/calendar-export.js');const items=[...panel.querySelectorAll('[data-deadline-id]')].filter(card=>card.dataset.exportEligible==='true'&&!card.classList.contains('is-layer-hidden')).map(card=>({id:card.dataset.deadlineId,date:card.dataset.exportDate,title:card.querySelector('h2').textContent,description:card.querySelector('.rule-line').textContent,tentative:card.classList.contains('is-derived')||card.classList.contains('is-anchor')}));const events=createCalendarEvents(items),content=toICalendar(events,{name:config.display.title}),url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=calendarExportFilename(config.display.title,inputValue(displayDate),events);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)});
const settingsButton=document.querySelector('.profile'),renderSettings=document.querySelector('#render-settings'),annulusCheckbox=document.querySelector('#show-year-annulus');annulusCheckbox.checked=stage.classList.contains('has-year-annulus');settingsButton.addEventListener('click',()=>{renderSettings.hidden=!renderSettings.hidden;settingsButton.setAttribute('aria-expanded',String(!renderSettings.hidden))});annulusCheckbox.addEventListener('change',()=>stage.classList.toggle('has-year-annulus',annulusCheckbox.checked));document.addEventListener('click',event=>{if(!event.target.closest('.settings-menu')){renderSettings.hidden=true;settingsButton.setAttribute('aria-expanded','false')}});
const rimShadingCheckbox=document.querySelector('#show-rim-shading');stage.classList.toggle('has-rim-shading',rimShadingCheckbox.checked);rimShadingCheckbox.addEventListener('change',()=>stage.classList.toggle('has-rim-shading',rimShadingCheckbox.checked));
const updateMonthLabels=()=>{const start=Date.UTC(year,0,1),total=Date.UTC(year+1,0,1)-start,inset=parseFloat(wheel.style.getPropertyValue('--month-wedge-inset'))||0,radius=Math.min(42,50-inset-4);wheel.querySelectorAll('.month').forEach((label,month)=>{const middle=(Date.UTC(year,month,1)+Date.UTC(year,month+1,1))/2,angle=(middle-start)/total*2*Math.PI-Math.PI/2;label.style.left=`${50+radius*Math.cos(angle)}%`;label.style.top=`${50+radius*Math.sin(angle)}%`})};new MutationObserver(updateMonthLabels).observe(yearLabel,{childList:true,characterData:true,subtree:true});updateMonthLabels();
const monthWedgesCheckbox=document.querySelector('#show-month-wedges'),updateMonthWedges=()=>{const start=Date.UTC(year,0,1),total=Date.UTC(year+1,0,1)-start,stops=Array.from({length:12},(_,month)=>{const a=(Date.UTC(year,month,1)-start)/total*360,b=(Date.UTC(year,month+1,1)-start)/total*360,color=month%2?'transparent':'rgba(78, 119, 165, .09)';return `${color} ${a}deg ${b}deg`});wheel.style.setProperty('--month-wedges',`conic-gradient(${stops.join(',')})`)};monthWedgesCheckbox.addEventListener('change',()=>{updateMonthWedges();stage.classList.toggle('has-month-wedges',monthWedgesCheckbox.checked)});new MutationObserver(()=>{if(monthWedgesCheckbox.checked)updateMonthWedges()}).observe(yearLabel,{childList:true,characterData:true,subtree:true});
const bandControls=[['quarter',document.querySelector('#show-quarter-band'),3],['termin',document.querySelector('#show-termin-band'),2]],bandElements=bandControls.map(([name])=>{const element=document.createElement('div');element.className=`calendar-band calendar-band-${name}`;wheel.prepend(element);return element});function updateCalendarBands(){const start=Date.UTC(year,0,1),total=Date.UTC(year+1,0,1)-start;let inset=annulusCheckbox.checked?(rimShadingCheckbox.checked?7.86:6.12):0;if(!annulusCheckbox.checked&&rimShadingCheckbox.checked&&bandControls.some(([,control])=>control.checked))inset=2;bandControls.forEach(([,control,months],index)=>{const element=bandElements[index];element.hidden=!control.checked;if(element.hidden)return;const segments=12/months,stops=Array.from({length:segments},(_,i)=>{const a=(Date.UTC(year,i*months,1)-start)/total*360,b=(Date.UTC(year,(i+1)*months,1)-start)/total*360;return `${i%2?'rgba(78,119,165,.04)':'rgba(78,119,165,.19)'} ${a}deg ${b}deg`});element.style.inset=`${inset}%`;element.style.background=`conic-gradient(${stops.join(',')})`;element.style.setProperty('--band-width',`${12/(1-2*inset/100)}%`);inset+=6});wheel.style.setProperty('--month-wedge-inset',`${inset}%`);updateMonthLabels()}bandControls.forEach(([,control])=>control.addEventListener('change',updateCalendarBands));annulusCheckbox.addEventListener('change',updateCalendarBands);rimShadingCheckbox.addEventListener('change',updateCalendarBands);new MutationObserver(updateCalendarBands).observe(yearLabel,{childList:true,characterData:true,subtree:true});updateCalendarBands();
const quarterLabels=Array.from({length:4},(_,index)=>{const label=document.createElement('span');label.className='quarter-label';label.textContent=`Q${index+1}`;wheel.append(label);return label});function updateQuarterLabels(){const start=Date.UTC(year,0,1),total=Date.UTC(year+1,0,1)-start,radius=47-(parseFloat(bandElements[0].style.inset)||0);quarterLabels.forEach((label,index)=>{label.hidden=!bandControls[0][1].checked;const middle=(Date.UTC(year,index*3,1)+Date.UTC(year,(index+1)*3,1))/2,angle=(middle-start)/total*2*Math.PI-Math.PI/2;label.style.left=`${50+radius*Math.cos(angle)}%`;label.style.top=`${50+radius*Math.sin(angle)}%`})}bandControls[0][1].addEventListener('change',updateQuarterLabels);annulusCheckbox.addEventListener('change',updateQuarterLabels);rimShadingCheckbox.addEventListener('change',updateQuarterLabels);new MutationObserver(updateQuarterLabels).observe(yearLabel,{childList:true,characterData:true,subtree:true});updateQuarterLabels();
const terminLabels=Array.from({length:6},(_,index)=>{const label=document.createElement('span');label.className='quarter-label';label.textContent=`T${index+1}`;wheel.append(label);return label});function updateTerminLabels(){const start=Date.UTC(year,0,1),total=Date.UTC(year+1,0,1)-start,radius=47-(parseFloat(bandElements[1].style.inset)||0);terminLabels.forEach((label,index)=>{label.hidden=!bandControls[1][1].checked;const middle=(Date.UTC(year,index*2,1)+Date.UTC(year,(index+1)*2,1))/2,angle=(middle-start)/total*2*Math.PI-Math.PI/2;label.style.left=`${50+radius*Math.cos(angle)}%`;label.style.top=`${50+radius*Math.sin(angle)}%`})}bandControls.forEach(([,control])=>control.addEventListener('change',updateTerminLabels));annulusCheckbox.addEventListener('change',updateTerminLabels);rimShadingCheckbox.addEventListener('change',updateTerminLabels);new MutationObserver(updateTerminLabels).observe(yearLabel,{childList:true,characterData:true,subtree:true});updateTerminLabels();
quarterLabels.forEach(label=>label.classList.add('quarter-period-label'));terminLabels.forEach(label=>label.classList.add('termin-period-label'));const labelSettings=[[annulusCheckbox,'year-labels'],[bandControls[0][1],'quarter-labels'],[bandControls[1][1],'termin-labels'],[monthWedgesCheckbox,'month-labels']];labelSettings.forEach(([parent,name],index)=>{const row=document.createElement('label'),checkbox=document.createElement('input'),text=document.createElement('span');row.className='render-settings-child';checkbox.type='checkbox';checkbox.checked=true;text.textContent=t('Show labels');row.append(checkbox,text);parent.closest('label').after(row);const update=()=>{const enabled=index===0||index===3||parent.checked;checkbox.disabled=!enabled;stage.classList.toggle(`hide-${name}`,!enabled||!checkbox.checked)};parent.addEventListener('change',update);checkbox.addEventListener('change',update);update()});
const sessionPathName=path=>path.map(part=>String(part)).join('.'),sessionPathValue=(object,path)=>path.reduce((value,key)=>value[key],object),setSessionPathValue=(object,path,value)=>{const key=path.at(-1),parent=sessionPathValue(object,path.slice(0,-1));parent[key]=value},parseSessionValue=(value,original)=>typeof original==='number'?Number(value):typeof original==='boolean'?value==='true':value;
const sessionEnumOptions=path=>{const name=sessionPathName(path),itemField=path[0]==='items'&&path.length===3?path[2]:undefined,scheduleField=path[0]==='items'&&path[2]==='schedule'?path[3]:undefined,unique=values=>[...new Set(values)].map(value=>({value,label:String(value)})),weekdays=values=>values.map(value=>({value,label:weekdayName(value)}));if(name==='display.locale'||name==='translations.autoTranslate.sourceLocale')return unique(sessionConfigDraft.display.locales);if(name==='display.renderMode')return unique(['year','continuous']);if(name==='display.fonts.provider')return unique(['google','selfHosted']);if(name==='translations.autoTranslate.provider')return unique(['deepl']);if(itemField==='kind')return unique(['deadline','anchor','board_meeting','event','course',...sessionConfigDraft.items.map(item=>item.kind)]);if(itemField==='layer')return unique(['auto',...Object.keys(sessionConfigDraft.layers)]);if(itemField==='status')return unique(['set','derived','anchor']);if(scheduleField==='kind')return unique(['anchor','fixed','nth_weekday','nth_full_weekday','last_weekday','month_end','next_weekday','previous_weekday','offset','course']);if(scheduleField==='anchor')return unique(Object.keys(window.scheduleEngine.scheduleAnchors(sessionConfigDraft)));if(scheduleField==='weekday'||path.at(-1)==='weekday')return weekdays([0,1,2,3,4,5,6]);if(scheduleField==='direction')return unique(['forward','backward']);if(path[0]==='constraints'&&path.at(-1)==='schedule')return unique(Object.keys(sessionConfigDraft.schedules||{}));if(path[0]==='items'&&path.includes('constraints'))return unique(Object.keys(sessionConfigDraft.constraints||{}));if(path[0]==='items'&&path.includes('skip'))return unique(['easter','autumn_holiday']);return undefined};
const sessionSpinboxBounds=path=>{const field=path.at(-1),parent=sessionPathValue(sessionConfigDraft,path.slice(0,-1));if(field==='month')return{min:1,max:12};if(field==='day'){const month=Number(parent.month);return{min:1,max:month>=1&&month<=12?new Date(2024,month,0).getDate():31}}return undefined},syncSessionDaySpinbox=path=>{if(path.at(-1)!=='month')return;const dayPath=JSON.stringify([...path.slice(0,-1),'day']),bounds=sessionSpinboxBounds([...path.slice(0,-1),'day']);document.querySelectorAll('input[data-session-path]').forEach(control=>{if(control.dataset.sessionPath!==dayPath)return;control.max=String(bounds.max);if(Number(control.value)>bounds.max){control.value=String(bounds.max);setSessionPathValue(sessionConfigDraft,JSON.parse(dayPath),bounds.max)}})};
const validateSessionField=async(input,path)=>{if(!sessionPathName(path).startsWith('display.fonts.'))return;const revision=String(Number(input.dataset.validationRevision||0)+1);input.dataset.validationRevision=revision;try{await validateFontSettings(sessionConfigDraft.display.fonts);if(input.dataset.validationRevision!==revision)return;input.classList.remove('is-invalid');input.removeAttribute('title')}catch(error){if(input.dataset.validationRevision!==revision)return;input.classList.add('is-invalid');input.title=error.message}};
const newSessionItem=()=>{let number=sessionConfigDraft.items.length+1,id=`new-item-${number}`;while(sessionConfigDraft.items.some(item=>item.id===id))id=`new-item-${++number}`;return{id,title:t('New item'),kind:'deadline',layer:Object.keys(sessionConfigDraft.layers)[0],status:'set',rule:'',schedule:{kind:'fixed',month:1,day:1}}};
const renderSessionConfigNode=(value,path,parent,label)=>{if(value&&typeof value==='object'){const details=document.createElement('details'),summary=document.createElement('summary');details.open=path.length<2;summary.textContent=label;details.append(summary);if(Array.isArray(value)&&sessionPathName(path)==='items'){value.forEach((child,index)=>{const row=document.createElement('div'),remove=document.createElement('button');row.className='config-editor-array-item';renderSessionConfigNode(child,[...path,index],row,`${child.id||t('New item')} [${index+1}]`);remove.type='button';remove.className='config-editor-array-action';remove.textContent=t('Remove item');remove.onclick=()=>{sessionConfigDraft.items.splice(index,1);renderSessionConfigTree()};row.append(remove);details.append(row)});const add=document.createElement('button');add.type='button';add.className='config-editor-array-action config-editor-add-item';add.textContent=t('Add item');add.onclick=()=>{sessionConfigDraft.items.push(newSessionItem());renderSessionConfigTree()};details.append(add)}else Object.entries(value).forEach(([key,child])=>renderSessionConfigNode(child,[...path,key],details,Array.isArray(value)?`[${key}]`:key));parent.append(details);return}const field=document.createElement('div'),key=document.createElement('label'),options=sessionEnumOptions(path),isBoolean=typeof value==='boolean',bounds=!options&&!isBoolean&&sessionSpinboxBounds(path),control=options?document.createElement('select'):document.createElement('input');field.className='config-editor-field';key.textContent=label;if(options){options.forEach(option=>{const choice=document.createElement('option');choice.value=String(option.value);choice.textContent=option.label;control.append(choice)})}else if(isBoolean)control.type='checkbox';else if(bounds){control.type='number';control.min=String(bounds.min);control.max=String(bounds.max);control.step='1'}if(isBoolean)control.checked=value;else control.value=String(value);control.dataset.sessionPath=JSON.stringify(path);control.addEventListener(options||isBoolean?'change':'input',()=>{const nextValue=isBoolean?control.checked:parseSessionValue(control.value,value);setSessionPathValue(sessionConfigDraft,path,nextValue);syncSessionDaySpinbox(path);validateSessionField(control,path)});field.append(key,control);parent.append(field);validateSessionField(control,path)};
const renderSessionConfigTree=()=>{configEditorTree.replaceChildren();Object.entries(sessionConfigDraft).forEach(([key,value])=>renderSessionConfigNode(value,[key],configEditorTree,key))};
const bindSessionConfigControls=()=>{document.querySelectorAll('[data-anchor-id]').forEach(field=>field.addEventListener('input',()=>{config.anchors[field.dataset.anchorId].date=field.value;paint()}));document.querySelectorAll('[data-anchor-status],[data-item-status]').forEach(field=>field.addEventListener('click',()=>{const set=field.getAttribute('aria-pressed')!=='true';field.setAttribute('aria-pressed',String(set));field.classList.toggle('is-set',set);field.classList.toggle('is-tentative',!set);field.textContent=t(set?'Set':'Tentative');if(field.dataset.anchorStatus)config.anchors[field.dataset.anchorStatus].status=set?'set':'tentative';paint()}));document.querySelectorAll('[data-item-override]').forEach(field=>field.addEventListener('input',()=>{const status=document.querySelector(`[data-item-status="${field.dataset.itemOverride}"]`);status.setAttribute('aria-pressed','true');status.classList.add('is-set');status.classList.remove('is-tentative');status.textContent=t('Set');paint()}));document.querySelectorAll('.layer-toggle').forEach(button=>button.onclick=()=>{const on=!button.classList.contains('is-active');button.classList.toggle('is-active',on);button.setAttribute('aria-pressed',on);document.querySelectorAll(`[data-layer="${button.dataset.layer}"]`).forEach(element=>element.classList.toggle('is-layer-hidden',!on))});document.querySelectorAll('.event').forEach(event=>event.onclick=()=>{document.querySelectorAll('.deadline-card').forEach(card=>card.classList.remove('active'));document.querySelector(`.deadline-card[data-deadline-id="${event.dataset.deadlineId}"]`)?.classList.add('active')})};
const validateSessionConfiguration=next=>{if(!next||typeof next!=='object'||!next.organisation?.name||typeof next.organisation.name!=='string'||!next.display||typeof next.display.title!=='string'||typeof next.display.description!=='string'||!next.layers||typeof next.layers!=='object'||!next.anchors||typeof next.anchors!=='object'||!Array.isArray(next.items))throw new Error('Configuration must contain organisation.name, display.title, display.description, layers, anchors, and items.');if(next.initialYear!=='current'&&!Number.isInteger(next.initialYear))throw new Error('initialYear must be current or a whole year number.');Object.entries(next.layers).forEach(([id,layer])=>{if(typeof layer?.label!=='string'||typeof layer?.color!=='string'||!CSS.supports('color',layer.color))throw new Error(`Layer ${id} must have a label and valid color.`)});Object.entries(next.anchors).forEach(([id,anchor])=>{if(typeof anchor?.title!=='string'||!Number.isInteger(anchor.defaultDate?.month)||anchor.defaultDate.month<1||anchor.defaultDate.month>12||!(anchor.defaultDate.kind==='month_end'||((anchor.defaultDate.kind??'fixed')==='fixed'&&Number.isInteger(anchor.defaultDate.day)&&anchor.defaultDate.day>=1&&anchor.defaultDate.day<=31)))throw new Error(`Anchor ${id} must have a title and valid default date.`)});const ids=new Set;next.items.forEach(item=>{if(typeof item?.id!=='string'||!item.id||ids.has(item.id))throw new Error('Every item must have a unique id.');ids.add(item.id);if(typeof item.title!=='string'||!item.schedule||typeof item.schedule!=='object')throw new Error(`Item ${item.id} must have a title and schedule.`);const itemLayer=item.layer==='auto'?next.autoLayers?.[item.kind]:item.layer;if(!next.layers[itemLayer])throw new Error(`Item ${item.id} refers to an unknown layer.`);if(item.group&&!next.groups?.[item.group])throw new Error(`Item ${item.id} refers to an unknown group.`)});scheduleResolver(next,year)};
const applySessionConfiguration=async next=>{validateSessionConfiguration(next);await applyFontSettings(next.display.fonts);Object.keys(config).forEach(key=>delete config[key]);Object.assign(config,next);expandedGroups.clear();Object.entries(config.groups||{}).filter(([,group])=>!group.collapsed).forEach(([id])=>expandedGroups.add(id));render();renderAnchorControls();input=document.querySelector('[data-anchor-id="general_assembly"]');renderMode=config.display.renderMode==='continuous'?'continuous':'year';setYear(config.initialYear==='current'?new Date().getFullYear():Number(config.initialYear)||year);setRenderMode(renderMode);setZoom(zoom);bindSessionConfigControls()};
document.querySelector('.open-config').onclick=()=>{renderSettings.hidden=true;settingsButton.setAttribute('aria-expanded','false');sessionConfigDraft=structuredClone(config);renderSessionConfigTree();configEditorError.textContent='';configEditor.showModal()};configEditor.querySelector('.config-editor-apply').onclick=async()=>{try{await applySessionConfiguration(structuredClone(sessionConfigDraft));configEditor.close()}catch(error){configEditorError.textContent=error.message}};

// The editor uses the live cards, so expanded controls, overrides and anchor
// dependencies are shared with the wheel. Each grid column is one civil day.
function calendarDay(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

const timelineCardColumns = 31;

function compactDependencyRows(entries, edges, firstCardRow) {
  const neighbors = new Map();
  const columns = new Map();
  for (const { card, date } of entries) {
    card.style.removeProperty('grid-row');
    if (!card.classList.contains('is-layer-hidden')) columns.set(card, calendarDay(date));
  }
  for (const { source, target } of edges) {
    if (!columns.has(source) || !columns.has(target)) continue;
    if (!neighbors.has(source)) neighbors.set(source, []);
    if (!neighbors.has(target)) neighbors.set(target, []);
    neighbors.get(source).push(target);
    neighbors.get(target).push(source);
  }

  const occupied = [];
  const visited = new Set();
  for (const first of neighbors.keys()) {
    if (visited.has(first)) continue;
    const group = [];
    const pending = [first];
    while (pending.length) {
      const card = pending.pop();
      if (visited.has(card)) continue;
      visited.add(card);
      group.push(card);
      for (const neighbor of neighbors.get(card)) pending.push(neighbor);
    }

    // In date order, a new row is necessary only if every row overlaps.
    // At a shared date, place the card linked to an earlier date nearer that card.
    const earliestNeighbor = card => Math.min(...neighbors.get(card).map(other => columns.get(other)));
    group.sort((a, b) => columns.get(a) - columns.get(b) || earliestNeighbor(a) - earliestNeighbor(b));
    const rowEnds = [];
    const placements = group.map(card => {
      const start = columns.get(card);
      let row = rowEnds.findIndex(end => end <= start);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = start + timelineCardColumns;
      return { card, start, row };
    });

    // Move the packed group as a unit to preserve its minimum row span.
    let base = 0;
    while (placements.some(({ start, row }) => occupied[base + row]?.some(
      other => Math.abs(other - start) < timelineCardColumns))) base++;
    for (const { card, start, row } of placements) {
      (occupied[base + row] ??= []).push(start);
      card.style.gridRow = String(firstCardRow + base + row);
    }
  }
}

function clearVirtualDates() {
  arrowLayoutObserver.disconnect();
  timelineEdges = [];
  arrowPaths.replaceChildren();
  scheduleCards.querySelectorAll('[data-virtual-date]').forEach(card => card.remove());
  scheduleCards.querySelectorAll('.timeline-calendar').forEach(row => row.remove());
}

const arrowPaths = scheduleCards.querySelector('.timeline-arrows g');
let timelineEdges = [];
const arrowLayoutObserver = new ResizeObserver(drawDependencyArrows);

function drawDependencyArrows() {
  const origin = scheduleCards.getBoundingClientRect();
  const paths = document.createDocumentFragment();
  for (const { source, target, labelText, description } of timelineEdges) {
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) continue;
    const left = Math.max(from.left, to.left);
    const right = Math.min(from.right, to.right);
    let route;
    let labelX, labelY;
    let textAnchor = right <= left ? 'middle' : 'start';
    if (source.classList.contains('timeline-start')) {
      const x1 = from.left - origin.left;
      const x2 = to.left + to.width / 2 - origin.left;
      const y = to.top - origin.top;
      labelX = x1 + 5;
      labelY = y - 9;
      textAnchor = 'start';
      route = `M ${x1} ${labelY} H ${x2} V ${y}`;
    } else if (right > left) {
      // Stacked cards can connect vertically through their shared columns.
      const x = (left + right) / 2 - origin.left;
      const down = from.top < to.top;
      const y1 = (down ? from.bottom : from.top) - origin.top;
      const y2 = (down ? to.top : to.bottom) - origin.top;
      route = `M ${x} ${y1} V ${y2}`;
      textAnchor = to.left < from.left ? 'end' : 'start';
      labelX = x + (textAnchor === 'end' ? -8 : 8);
      labelY = (y1 + y2) / 2;
    } else if (labelText && from.top === to.top) {
      // Use the gap above this row for the label, even when the cards almost touch.
      const x1 = from.left + from.width / 2 - origin.left;
      const x2 = to.left + to.width / 2 - origin.left;
      const top = from.top - origin.top;
      labelX = (x1 + x2) / 2;
      labelY = top - 9;
      route = `M ${x1} ${top} V ${labelY} H ${x2} V ${top}`;
    } else {
      const forward = from.left < to.left;
      const x1 = (forward ? from.right : from.left) - origin.left;
      const x2 = (forward ? to.left : to.right) - origin.left;
      const y1 = from.top + from.height / 2 - origin.top;
      const y2 = to.top + to.height / 2 - origin.top;
      route = `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`;
      labelX = (x1 + x2) / 2;
      labelY = (y1 + y2) / 2 - 8;
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', route);
    const group = document.createElementNS(path.namespaceURI, 'g');
    if (description) {
      const title = document.createElementNS(path.namespaceURI, 'title');
      title.textContent = description;
      group.append(title);
    }
    paths.append(group);
    group.append(path);
    if (labelText) {
      const label = document.createElementNS(path.namespaceURI, 'text');
      label.setAttribute('x', labelX);
      label.setAttribute('y', labelY);
      label.setAttribute('text-anchor', textAnchor);
      label.textContent = labelText;
      label.setAttribute('aria-label', `${target.querySelector('h2').textContent} · ${labelText}`);
      group.append(label);
    }
  }
  arrowPaths.replaceChildren(paths);
}

function weekdayDependencyLabel({ after, inclusive, amount, unit }, title) {
  let relation;
  if (!amount) {
    if (after) relation = t(inclusive ? 'On or after' : 'After');
    else relation = t(inclusive ? 'Before or on' : 'Before');
  } else {
    const weeks = unit === 'day' && amount % 7 === 0;
    const interval = new Intl.NumberFormat(locale, {
      style: 'unit', unit: weeks ? 'week' : unit, unitDisplay: 'long',
    }).format(Math.abs(weeks ? amount / 7 : amount));
    let message;
    if (after && amount > 0) message = inclusive ? 'At least {interval} after' : 'More than {interval} after';
    if (after && amount < 0) message = inclusive ? 'At most {interval} before' : 'Less than {interval} before';
    if (!after && amount > 0) message = inclusive ? 'At most {interval} after' : 'Less than {interval} after';
    if (!after && amount < 0) message = inclusive ? 'At least {interval} before' : 'More than {interval} before';
    relation = t(message, { interval });
  }
  const sign = after ? (inclusive ? '≥' : '>') : (inclusive ? '≤' : '<');
  return `${sign} ${relation} · ${title}`;
}

function timelineDependencies(cards, startMarker, startDate, startTitle) {
  const entries = [];
  const edges = [];
  const virtuals = new Map();
  const anchors = window.scheduleEngine.scheduleAnchors(config);
  const anchorItems = new Map(config.items.filter(item => item.schedule.kind === 'anchor')
    .map(item => [item.schedule.anchor, item.id]));
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const yearStart = { card: startMarker, title: startTitle };

  function virtualDate(key, date, title) {
    if (virtuals.has(key)) return virtuals.get(key);
    const card = document.createElement('article');
    card.className = 'deadline-card';
    card.dataset.virtualDate = inputValue(date);
    card.innerHTML = '<span class="card-date"></span><div><h2></h2></div>';
    card.querySelector('.card-date').textContent = fmt(date);
    card.querySelector('h2').textContent = title;
    scheduleCards.append(card);
    const entry = { card, date, title };
    virtuals.set(key, entry);
    entries.push(entry);
    return entry;
  }

  function boundarySource({ kind, date }) {
    if (kind === 'month_start' && date.getMonth() === 0 && +date === +startDate) return yearStart;
    const title = t(kind === 'month_start' ? 'Start of {month}' : 'End of {month}', { month: monthName.format(date) });
    return virtualDate(kind + inputValue(date), date, title);
  }

  function referenceSource(reference) {
    const [id, endpoint] = reference.split('.');
    const card = cards.get(id) ?? cards.get(anchorItems.get(id));
    if (card) {
      const title = card.querySelector('h2').textContent;
      if (!endpoint) return { card, title };
      return { card, title: t(endpoint === 'start' ? 'Start of {title}' : 'End of {title}', { title }) };
    }
    if (id === 'start_of_year') return yearStart;
    const anchor = anchors[id];
    if (anchor) return virtualDate(id, resolveAnchorDate(anchor, year, anchor.date), anchor.title);
  }

  for (const item of config.items) {
    const rule = item.schedule;
    const target = cards.get(item.id);
    const connect = (source, relation) => {
      if (source) edges.push({ source: source.card, target, labelText: `${relation} · ${source.title}`, description: item.rule });
    };
    const boundary = window.scheduleEngine.calendarBoundary(rule, year);
    if (boundary) {
      let relation;
      switch (rule.kind) {
        case 'nth_full_weekday': relation = t('Full week {n}', { n: rule.occurrence }); break;
        case 'nth_weekday': relation = t('Occurrence {n}', { n: rule.occurrence }); break;
        case 'last_weekday': relation = t('Last occurrence on or before'); break;
        case 'month_end': relation = t('Same day'); break;
      }
      connect(boundarySource(boundary), relation);
    } else if (rule.kind === 'anchor') {
      const anchor = anchors[rule.anchor];
      if (!anchor) {
        connect(referenceSource(rule.anchor), t('Same day'));
        continue;
      }
      const defaultBoundary = window.scheduleEngine.calendarBoundary(anchor.defaultDate, year);
      const date = resolveAnchorDate(anchor, year);
      const source = rule.anchor === 'start_of_year' ? yearStart
        : defaultBoundary ? boundarySource(defaultBoundary)
        : virtualDate('default:' + inputValue(date), date, fmt(date));
      connect(source, anchor.defaultDateRelation === 'on_or_before' ? `≤ ${t('Before or on')}` : t('Default date'));
    } else if (rule.kind === 'offset') {
      const relation = rule.days === 0 ? t('Same day') : t(rule.days < 0 ? '{n} days before' : '{n} days after', { n: Math.abs(rule.days) });
      connect(referenceSource(rule.anchor), relation);
    } else if (rule.kind === 'course') {
      const date = rule.anchor ? null : new Date(year, rule.month - 1, rule.day);
      const source = rule.anchor ? referenceSource(rule.anchor) : virtualDate('default:' + inputValue(date), date, fmt(date));
      connect(source, t(rule.direction === 'backward' ? 'Schedule backwards from' : 'Schedule forwards from'));
    } else {
      for (const dep of window.scheduleEngine.weekdayDependencies(rule)) {
        const source = referenceSource(dep.anchor);
        if (source) edges.push({ source: source.card, target, labelText: weekdayDependencyLabel(dep, source.title), description: item.rule });
      }
    }
  }
  return { entries, edges };
}

function paintScheduleConstraints(card, rule, occurrence, visibleCalendars) {
  card.querySelectorAll('.schedule-constraint').forEach(line => line.remove());
  for (const id of window.scheduleEngine.excludedSchedules(config, rule)) {
    const schedule = config.schedules[id];
    const conflict = occurrence.conflicts?.includes(id) ?? false;
    const line = document.createElement('p');
    line.className = 'rule-line schedule-constraint';
    line.classList.toggle('has-conflict', conflict);
    line.textContent = t(conflict ? 'Date conflicts with {schedule}' : 'Exclude · {schedule}', { schedule: schedule.title });
    card.querySelector('h2').parentElement.append(line);
    if (!card.classList.contains('is-layer-hidden')) visibleCalendars.add(id);
  }
}

function paintCalendarRows(ids, first, last) {
  let row = 2; // The month headings occupy the first row.
  const span = calendarDay(last) - calendarDay(first) + 1;
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  for (const id of ids) {
    const schedule = config.schedules[id];
    const band = document.createElement('section');
    band.className = 'timeline-calendar';
    band.style.gridColumn = `1 / span ${span}`;
    band.style.gridRow = String(row++);
    band.setAttribute('aria-label', schedule.title);
    const title = document.createElement('strong');
    title.textContent = schedule.title;
    band.append(title);
    for (let y = first.getFullYear(); y <= last.getFullYear(); y++) {
      for (const { date, titles } of window.scheduleEngine.calendarOccurrences(schedule, y)) {
        if (date < first || date > last) continue;
        const marker = document.createElement('time');
        marker.dateTime = inputValue(date);
        const dateLabel = fullDate.format(date);
        marker.textContent = titles.length
          ? [...titles, dateLabel].join(' · ')
          : dateLabel.replace(/^./u, first => first.toLocaleUpperCase(locale));
        marker.title = marker.textContent;
        marker.style.gridColumn = String(calendarDay(date) - calendarDay(first) + 1);
        band.append(marker);
      }
    }
    scheduleCards.append(band);
  }
  return row;
}

function paintTimeline() {
  const resolved = resolve(year);
  const start = window.scheduleEngine.scheduleAnchors(config).start_of_year;
  const startField = panel.querySelector('[data-anchor-id="start_of_year"]');
  const startDate = startField?.value
    ? date(startField.value)
    : resolveAnchorDate(start, year);
  const startMarker = scheduleCards.querySelector('.timeline-start');
  const startTitle = config.anchors.start_of_year?.title || t('Start of year');
  startMarker.title = `${startTitle} · ${fmt(startDate)}`;
  startMarker.setAttribute('aria-label', startMarker.title);

  const cards = new Map([...scheduleCards.querySelectorAll('[data-deadline-id]')]
    .map(card => [card.dataset.deadlineId, card]));
  clearVirtualDates();
  const { entries, edges } = timelineDependencies(cards, startMarker, startDate, startTitle);
  timelineEdges = edges;
  const prerequisiteCards = new Set(timelineEdges.map(edge => edge.source));
  const rulesOnArrows = new Set(edges.filter(edge => edge.description).map(edge => edge.target));
  const visibleCalendars = new Set();
  for (const item of config.items) {
    const card = cards.get(item.id);
    const fixed = !window.scheduleEngine.isRelativeRule(item.schedule);
    card.dataset.dateType = fixed ? 'fixed' : 'relative';
    card.dataset.dateTypeLabel = t(fixed ? 'Fixed date' : 'Relative date');
    card.toggleAttribute('data-timeline-anchor', item.schedule.kind === 'anchor' || prerequisiteCards.has(card));
    const occurrence = resolved[item.id];
    paintScheduleConstraints(card, item.schedule, occurrence, visibleCalendars);
    const field = card.querySelector('[data-item-override]');
    if (field) field.value = inputValue(occurrence.date);
    card.querySelector('.card-date').textContent = fmt(occurrence.date);
    card.querySelector('.rule-line').textContent = rulesOnArrows.has(card) ? '' : occurrence.rule;
    card.classList.remove('is-grace', 'is-group-collapsed');
    card.hidden = false;
    entries.push({ card, date: occurrence.date });
  }
  entries.sort((a, b) => a.date - b.date);
  // Relative rules can put a deadline outside the selected calendar year.
  const first = new Date(Math.min(+new Date(year, 0, 1), +(entries[0]?.date ?? startDate)));
  first.setDate(1);
  const last = new Date(Math.max(+new Date(year, 11, 31), +(entries.at(-1)?.date ?? startDate)));
  startMarker.style.gridColumnStart = calendarDay(startDate) - calendarDay(first) + 1;
  const months = scheduleCards.querySelector('.timeline-months');
  const fragment = document.createDocumentFragment();
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  for (const month = new Date(first); month <= last; month.setMonth(month.getMonth() + 1)) {
    const label = document.createElement('span');
    label.textContent = monthName.format(month);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    label.style.gridColumn = `${calendarDay(month) - calendarDay(first) + 1} / span ${days}`;
    fragment.append(label);
  }
  months.replaceChildren(fragment);
  entries.forEach(({ card, date }, index) => {
    card.style.gridColumn = `${calendarDay(date) - calendarDay(first) + 1} / span ${timelineCardColumns}`;
    card.style.order = index + 1;
  });
  const firstCardRow = paintCalendarRows(visibleCalendars, first, last);
  compactDependencyRows(entries, timelineEdges, firstCardRow);
  updateStatusStyles();
  if (timelineEdges.length) {
    for (const { card } of entries) arrowLayoutObserver.observe(card);
    arrowLayoutObserver.observe(scheduleCards);
    drawDependencyArrows();
  }
}

const editDeadlines = panel.querySelector('.all-deadlines');
const closeTimeline = panel.querySelector('.close-timeline');
function setTimelineEditor(open) {
  editingTimeline = open;
  layout.classList.toggle('editing-timeline', open);
  timelineHeading.hidden = !open;
  editDeadlines.setAttribute('aria-expanded', String(open));
  if (open) {
    scheduleCards.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    scheduleViewport.tabIndex = 0;
    paintTimeline();
    scheduleViewport.scrollLeft = 0;
    closeTimeline.focus();
  } else {
    clearVirtualDates();
    scheduleViewport.removeAttribute('tabindex');
    paintNow();
    updateDebugCardYears();
    editDeadlines.focus();
  }
}
editDeadlines.onclick = () => setTimelineEditor(true);
closeTimeline.onclick = () => setTimelineEditor(false);
document.querySelector('.legend').addEventListener('click', event => {
  if (editingTimeline && event.target.closest('.layer-toggle')) paintTimeline();
});
