const calendarSources = window.annualWheelCalendarSources ?? {};
const scheduleResolver = (plan, year, anchors, overrides) =>
  window.scheduleEngine.resolveSchedule(plan, year, anchors, overrides, calendarSources);
const resolveAnchorDate = (anchor, year, override) => window.scheduleEngine.resolveAnchorDate(anchor, year, override, config.display.locale);
const statusResolver = window.scheduleEngine.resolveItemStatuses;
let authoredConfig=window.annualWheelConfig;if(!authoredConfig)throw new Error('Configuration file is missing');if(!window.annualWheelI18n)throw new Error('Translation catalogue is missing');
authoredConfig = window.scheduleEngine.normalizeAnchorDependencies(authoredConfig);
const initialConfiguration = structuredClone(authoredConfig);
function effectiveConfiguration(plan) {
  return { ...plan, items: plan.items.map(item => window.scheduleEngine.effectiveItem(plan, item)) };
}
let config = effectiveConfiguration(authoredConfig);
const wheel=document.querySelector('.year-wheel'),stage=document.querySelector('.wheel-stage'),panel=document.querySelector('.schedule-panel'),yearLabel=document.querySelector('#selected-year'),zoomLabel=document.querySelector('#zoom-level'),build=window.annualWheelBuild||{},debug=build.debug||{},animationTime=Number(build.animationTime)||400,gracePeriod=Number(build.gracePeriod)||31,showYearAnnulus=build.showYearAnnulus!==false,debugEnabled=Boolean(debug.enabled),debugYears=debugEnabled&&Boolean(debug.years),debugCurrentDisplayDate=debugEnabled&&Boolean(debug.currentDisplayDate);document.documentElement.classList.toggle('debug-current-display-date',debugCurrentDisplayDate);stage.classList.toggle('has-year-annulus',showYearAnnulus);let year=config.initialYear==='current'?new Date().getFullYear():config.initialYear,zoom=1,rotation=0,todayAngle=0,renderMode=config.display.renderMode==='continuous'?'continuous':'year',split2Turn=0;const presets=[.88,1,1.16,1.32],expandedGroups=new Set(Object.entries(config.groups||{}).filter(([,group])=>!group.collapsed).map(([id])=>id));
const locale=window.annualWheelI18n.resolveLocale(document.documentElement.dataset.annualWheelLocale||config.display.locale),t=(id,values)=>window.annualWheelI18n.translate(locale,id,values),date=v=>{const[y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d)},copy=d=>new Date(d),fmt=d=>new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short'}).format(d).replace(/\./g,'').toUpperCase(),inputValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,GRACE_PERIOD=gracePeriod,displayDateAtTop=()=>{const start=new Date(year,0,1),end=new Date(year+1,0,1),at=new Date(+start+normalizeAngle(-rotation)/360*(end-start));return new Date(at.getFullYear(),at.getMonth(),at.getDate())};
const defaultFontSettings={provider:'google',stylesheet:'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap'},fontRoot=document.documentElement,fontHref=settings=>{const fonts=settings||defaultFontSettings;if(!['google','selfHosted'].includes(fonts.provider))throw new Error('Font provider must be google or selfHosted.');if(!fonts.stylesheet)throw new Error('Configured font provider requires a stylesheet.');if(fonts.provider==='selfHosted'){if(!fonts.directory||fonts.directory.startsWith('/')||fonts.directory.split('/').includes('..'))throw new Error('Self-hosted font directory must be a safe relative path.');return `/${fonts.directory}/${fonts.stylesheet}`}return fonts.stylesheet},validateFontSettings=async settings=>{const href=fontHref(settings),url=new URL(href,document.baseURI);if(url.origin===location.origin){const response=await fetch(url,{method:'HEAD',cache:'no-store'});if(!response.ok)throw new Error(`Configured stylesheet could not be loaded: ${href}`)}return{fonts:settings||defaultFontSettings,href}},applyFontSettings=async settings=>{const{fonts,href}=await validateFontSettings(settings),pending=document.createElement('link');pending.rel='stylesheet';pending.href=href;pending.media='not all';await new Promise((resolve,reject)=>{pending.onload=resolve;pending.onerror=()=>reject(new Error(`Configured stylesheet could not be loaded: ${href}`));document.head.append(pending)}).catch(error=>{pending.remove();throw error});document.querySelectorAll('link[data-annual-wheel-font]').forEach(link=>link.remove());pending.dataset.annualWheelFont='true';pending.media='all';fontRoot.style.setProperty('--font-sans',fonts.sans||'"DM Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif');fontRoot.style.setProperty('--font-serif',fonts.serif||'Fraunces,ui-serif,Georgia,serif')};applyFontSettings(config.display.fonts).catch(error=>console.error(error));
const nth=(y,m,w,n)=>{const f=new Date(y,m-1,1);return new Date(y,m-1,1+(w-f.getDay()+7)%7+(n-1)*7)},last=(y,m,w)=>{const d=new Date(y,m,0);d.setDate(d.getDate()-(d.getDay()-w+7)%7);return d},next=(d,w)=>{d=copy(d);d.setDate(d.getDate()+((w-d.getDay()+7)%7||7));return d},prev=(d,w)=>{d=copy(d);d.setDate(d.getDate()-((d.getDay()-w+7)%7||7));return d};
const easter=y=>{const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);return new Date(y,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1)};
const holiday=(d,skip)=>{const y=d.getFullYear(),t=+d;if(skip?.includes('easter')){const e=easter(y),a=copy(e),b=copy(e);a.setDate(e.getDate()-6);b.setDate(e.getDate()+1);if(t>=a&&t<=b)return true}if(skip?.includes('autumn_holiday')){const j=new Date(y,0,4),a=new Date(y,0,4-((j.getDay()||7)-1)+39*7),b=copy(a);b.setDate(a.getDate()+6);if(t>=a&&t<=b)return true}return false};
const course=(start,direction,weekday,count,skip)=>{let d=copy(start),out=[];if(direction==='backward')while(d.getDay()!==weekday)d.setDate(d.getDate()-1);else d=next(new Date(+d-86400000),weekday);while(out.length<count){if(!holiday(d,skip))direction==='backward'?out.unshift(copy(d)):out.push(copy(d));d.setDate(d.getDate()+(direction==='backward'?-7:7))}return out};
const layer=item=>item.layer==='auto'?config.autoLayers[item.kind]:item.layer;
function translateShell() {
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    const label = t(element.dataset.i18nAriaLabel);
    element.setAttribute('aria-label', label);
    if (element.hasAttribute('title')) element.title = label;
  }
}
const scheduleCards = panel.querySelector('.schedule-cards');
const scheduleViewport = panel.querySelector('.schedule-viewport');
const layout = document.querySelector('.wheel-layout');
const timelineHeading = panel.querySelector('.timeline-heading');
let editingTimeline = false;
let editingDeadlines = false;
const graphGroupExpansion = new Map();
const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long' });
// 4 January 2026 is a Sunday, index zero in schedule weekday rules.
const weekdayName = weekday => weekdayFormatter.format(new Date(2026, 0, 4 + weekday));

function appendWeekdayConstraint(card, schedule) {
  const weekday = schedule.weekday;
  if (!Number.isInteger(weekday)) return;
  const line = document.createElement('p');
  line.className = 'rule-line card-weekday';
  line.dataset.weekday = weekday;
  line.textContent = t('Weekday · {weekday}', { weekday: weekdayName(weekday) });
  card.querySelector('.rule-line').after(line);
}

function setCardHeading(card, title, layerInfo, rule = '') {
  let content = card.querySelector(':scope > .card-content');
  if (!content) {
    const date = document.createElement('time');
    date.className = 'card-date';
    content = document.createElement('div');
    content.className = 'card-content';
    content.innerHTML = '<p class="card-kind"></p><h2></h2><p class="rule-line"></p>';
    card.prepend(date, content);
  }
  const category = content.querySelector('.card-kind');
  category.textContent = layerInfo?.label ?? '';
  category.style.color = layerInfo?.color ?? '';
  content.querySelector('h2').textContent = title;
  content.querySelector('.rule-line').textContent = rule;
}

function renderLayers() {
  const legend = document.querySelector('.legend');
  const hidden = new Set(Array.from(legend.querySelectorAll('[aria-pressed="false"]'), button => button.dataset.layer));
  const assignments = Object.entries(config.autoLayers ?? {});
  legend.replaceChildren(...Object.entries(config.layers).map(([id, layer]) => {
    const button = document.createElement('button');
    const active = !hidden.has(id);
    button.className = 'layer-toggle';
    button.classList.toggle('is-active', active);
    button.dataset.layer = id;
    button.setAttribute('aria-pressed', String(active));
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.setAttribute('style', 'background:' + layer.color);
    button.append(dot, layer.label);
    const kinds = assignments.filter(([, target]) => target === id).map(([kind]) => kind);
    button.dataset.autoKinds = JSON.stringify(kinds);
    if (kinds.length) button.title = t('Automatic layer for {kinds}', { kinds: kinds.join(', ') });
    return button;
  }));
}

function renderOrganisationType(type) {
  const label = document.querySelector('.organisation-type');
  label.hidden = !type;
  label.dataset.type = type ?? '';
  const names = new Map([['organisation', 'Organisation'], ['individual', 'Individual']]);
  label.textContent = names.has(type) ? t(names.get(type)) : type ?? '';
}

function renderPlanHeader() {
  document.title = config.display.title;
  document.querySelector('.intro h1').textContent = config.display.title;
  renderOrganisationType(config.organisation.type);
  document.querySelector('.lede').textContent = config.display.description;
}

function render(){document.documentElement.lang=locale;translateShell();document.querySelector('.brand').lastChild.nodeValue=` ${config.organisation.name}`;renderPlanHeader();document.querySelector('.panel-heading .eyebrow').textContent=t('{organisation} · key dates',{organisation:config.organisation.name});document.querySelectorAll('.month b').forEach((label,index)=>label.textContent=new Intl.DateTimeFormat(locale,{month:'short'}).format(new Date(2026,index,1)).replace(/\./g,'').toUpperCase());renderLayers();panel.querySelectorAll('.deadline-card').forEach(x=>x.remove());wheel.querySelectorAll('.event').forEach(x=>x.remove());const displayCard=document.createElement('article');displayCard.className='deadline-card display-date-card';displayCard.dataset.displayDate='true';displayCard.innerHTML=`<span class="card-date"></span><div><p class="card-kind">${t('Display date')}</p><h2>${t('Date at the top of the wheel')}</h2><p class="rule-line"></p></div><span aria-hidden="true"></span>`;scheduleCards.append(displayCard);Object.entries(config.groups||{}).forEach(([id,group])=>{const card=document.createElement('article');card.className='deadline-card deadline-group';card.dataset.group=id;card.hidden=true;card.innerHTML=`<span class="card-date"></span><div><p class="card-kind">${t('Key dates')}</p><h2></h2><p class="rule-line"></p></div><button aria-expanded="${expandedGroups.has(id)}">${controlIcons.arrow}</button>`;card.querySelector('h2').textContent=group.title;card.querySelector('button').dataset.groupToggle=id;scheduleCards.append(card)});config.items.forEach((item,index)=>{const l=layer(item),color=config.layers[l].color,c=document.createElement('article'),e=document.createElement('button');c.className=`deadline-card is-${item.status}`;c.dataset.deadlineId=item.id;c.dataset.itemIndex=index;c.dataset.layer=l;setCardHeading(c,item.title,config.layers[l]);const more=document.createElement('button');more.setAttribute('aria-label',t('More about {title}',{title:item.title}));setControlIcon(more, 'arrow');c.append(more);appendWeekdayConstraint(c, item.schedule);scheduleCards.append(c);e.className='event';e.dataset.deadlineId=item.id;e.dataset.layer=l;e.dataset.label=item.title;e.style.backgroundColor=color;e.innerHTML='<span></span>';wheel.append(e)})}
function updateItemDate(id, value) {
  const index = authoredConfig.items.findIndex(item => item.id === id);
  const item = authoredConfig.items[index];
  if (value) item.date = value;
  else delete item.date;
  config.items[index] = window.scheduleEngine.effectiveItem(authoredConfig, item);
}
function updateAnchorStatus(button, confirmed) {
  const anchor = config.anchors[button.dataset.anchorStatus];
  anchor.status = confirmed ? 'set' : 'tentative';
  if (window.scheduleEngine.comparisonBound(window.scheduleEngine.anchorDateRelation(anchor).type)) {
    if (confirmed) anchor.date = button.parentElement.querySelector('[data-anchor-id]').value;
    else delete anchor.date;
  }
}
function renderAnchorControls(){const control=({id,date,statusId,item})=>{const fields=document.createElement('div'),field=document.createElement('input'),status=document.createElement('button');fields.className='anchor-fields card-anchor-fields';field.type='date';field.value=date||'';if(item)field.dataset.itemOverride=id;else field.dataset.anchorId=id;const confirmed=item?Boolean(date):config.anchors[id].status==='set';status.type='button';status.className=confirmed?'anchor-status is-set':'anchor-status is-tentative';status.dataset[statusId]=id;status.setAttribute('aria-pressed',String(confirmed));status.textContent=t(confirmed?'Set':'Tentative');fields.append(field,status);return fields};Object.entries(config.anchors).filter(([,anchor])=>anchor.configurable).forEach(([id,anchor])=>{const item=config.items.find(candidate=>candidate.schedule.kind==='anchor'&&candidate.schedule.anchor===id),card=item&&panel.querySelector(`[data-deadline-id="${item.id}"]`);card?.querySelector('div').append(control({id,date:inputValue(resolveAnchorDate(anchor,year,anchor.date)),statusId:'anchorStatus'}))});config.items.filter(item=>item.configurable).forEach(item=>panel.querySelector(`[data-deadline-id="${item.id}"]`)?.querySelector('div').append(control({id:item.id,date:item.date,statusId:'itemStatus',item:true})))}
function setupAdjustableDateCards(){panel.querySelectorAll('.card-anchor-fields').forEach(fields=>{const card=fields.closest('.deadline-card'),button=card.querySelector(':scope > button');card.classList.add('has-adjustable-date');fields.hidden=true;button.type='button';button.setAttribute('aria-label',t('Adjust date'));button.setAttribute('aria-expanded','false');button.onclick=()=>{const expanded=fields.hidden;fields.hidden=!expanded;button.setAttribute('aria-expanded',String(expanded))}})}
const buildAdjustableDateControls=renderAnchorControls;renderAnchorControls=()=>{buildAdjustableDateControls();setupAdjustableDateCards()};
const panelCardPositions=()=>new Map([...panel.querySelectorAll('.deadline-card:not([hidden])')].map(card=>[card,{rect:card.getBoundingClientRect(),styles:[card,...card.querySelectorAll('.card-date,.card-kind,h2,.rule-line')].map(element=>({element,backgroundColor:getComputedStyle(element).backgroundColor,borderLeftColor:getComputedStyle(element).borderLeftColor,color:getComputedStyle(element).color}))}]));function animatePanelReflow(before){requestAnimationFrame(()=>{panel.querySelectorAll('.deadline-card:not([hidden])').forEach(card=>{const first=before.get(card),last=card.getBoundingClientRect();if(!first)return;const distance=first.rect.top-last.top;card.animate([{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'cubic-bezier(.2,.8,.2,1)'});first.styles.forEach(previous=>{const current=getComputedStyle(previous.element);previous.element.animate([{backgroundColor:previous.backgroundColor,borderLeftColor:previous.borderLeftColor,color:previous.color},{backgroundColor:current.backgroundColor,borderLeftColor:current.borderLeftColor,color:current.color}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'ease'})})})})}
function updateDebugCardYears(){if(editingTimeline)return;panel.querySelectorAll('.deadline-card[data-deadline-id]').forEach(card=>{const event=wheel.querySelector(`.event[data-deadline-id="${card.dataset.deadlineId}"]`),dateLabel=card.querySelector('.card-date');if(debugYears){card.dataset.debugYear=event.dataset.year;dateLabel.textContent=`${dateLabel.textContent.replace(/\s+\d{4}$/,'')} ${event.dataset.year}`}else delete card.dataset.debugYear})}
const ruleMonth = new Intl.DateTimeFormat(locale, { month: 'long' });
const ruleDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });

function annualDateLabel({ month, day }) {
  return ruleDate.format(new Date(2000, month - 1, day));
}

function virtualDateLabel(definition) {
  const { kind = 'fixed', month } = definition;
  const isDate = kind === 'fixed' || kind === 'offset_from_date';
  const end = kind === 'month_end' || kind === 'offset_from_month_end';
  const title = isDate ? annualDateLabel(definition)
    : t(end ? 'End of {month}' : 'Start of {month}', { month: ruleMonth.format(new Date(2000, month - 1, 1)) });
  return definition.whole || definition.weeks || definition.days ? dependencyLabel(window.scheduleEngine.offsetRelation(definition), title) : title;
}

function boundaryTitle({ kind, date, definition }) {
  return virtualDateLabel(definition ?? { kind, month: date.getMonth() + 1 });
}

function boundaryRelation(rule) {
  if (['same_day', 'month_start', 'month_end'].includes(rule.kind)) return { type: 'same_day' };
  if (['offset', 'offset_from_date', 'offset_from_month_start', 'offset_from_month_end'].includes(rule.kind)) return window.scheduleEngine.offsetRelation(rule);
  if (rule.kind === 'course') return { type: 'course', direction: rule.direction, weekday: rule.weekday, count: rule.count, skip: rule.skip };
  return { type: rule.kind, occurrence: rule.occurrence };
}

function anchorRuleLabel(anchor, targetYear) {
  if (anchor.defaultDate.kind === 'relative') return dependencyLabel(window.scheduleEngine.anchorDateRelation(anchor), virtualDateLabel(anchor.dependency.source));
  const date = anchor.defaultDate;
  const boundary = window.scheduleEngine.calendarBoundary(date, targetYear, config.display.locale);
  const title = boundary ? boundaryTitle(boundary) : annualDateLabel(date);
  return dependencyLabel(window.scheduleEngine.anchorDateRelation(anchor), title);
}

function referenceTitle(reference) {
  if (typeof reference?.group === 'string') return config.groups[reference.group].title;
  const [id, endpoint] = reference.split('.');
  const title = config.items.find(item => item.id === id)?.title ?? config.anchors[id]?.title
    ?? (id === 'start_of_year' ? t('Initial object') : id);
  return endpoint ? t(endpoint === 'start' ? 'Start of {title}' : 'End of {title}', { title }) : title;
}

function generatedScheduleRule(item, targetYear, occurrence) {
  const rule = item.schedule;
  const engine = window.scheduleEngine;
  const parts = [];
  const boundary = engine.calendarBoundary(rule, targetYear, config.display.locale);
  if (rule.kind === 'course') {
    const start = boundary ? boundaryTitle(boundary) : rule.anchor ? referenceTitle(rule.anchor) : annualDateLabel(rule);
    parts.push(dependencyLabel({ type: 'course', direction: rule.direction }, start), t('{count} course days', { count: rule.count }));
    if (occurrence?.sessions?.length) parts.push(fmt(occurrence.sessions[0]) + '–' + fmt(occurrence.sessions.at(-1)));
  } else if (boundary) {
    const title = boundaryTitle(boundary);
    parts.push(rule.kind === boundary.kind ? title : dependencyLabel(boundaryRelation(rule), title));
  } else if (rule.kind === 'fixed') {
    parts.push(t('Fixed date') + ' · ' + annualDateLabel(rule));
  } else if (rule.kind === 'group') {
    parts.push(dependencyLabel({ type: 'same_day' }, config.groups[item.group].title));
  } else if (rule.kind === 'anchor') {
    const anchor = engine.scheduleAnchors(config)[rule.anchor];
    parts.push(anchor ? anchorRuleLabel(anchor, targetYear) : dependencyLabel({ type: 'same_day' }, referenceTitle(rule.anchor)));
  } else if (rule.anchor && ['nth_weekday', 'nth_full_weekday', 'last_weekday'].includes(rule.kind)) {
    parts.push(dependencyLabel(boundaryRelation(rule), referenceTitle(rule.anchor)));
  } else if (rule.kind === 'offset') {
    parts.push(dependencyLabel(window.scheduleEngine.offsetRelation(rule), referenceTitle(rule.anchor)));
  } else {
    for (const relation of engine.weekdayDependencies(rule)) {
      parts.push(dependencyLabel(relation, relation.baseDate ? virtualDateLabel(relation.baseDate) : referenceTitle(relation.anchor)));
    }
  }
  const weekday = engine.configuredWeekday(config, rule);
  if (Number.isInteger(weekday)) parts.push(t('Weekday · {weekday}', { weekday: weekdayName(weekday) }));
  for (const { membership, schedule } of engine.calendarConstraints(config, rule)) {
    parts.push(membershipLabel(membership) + ' · ' + (scheduleTitle(config.schedules[schedule]) ?? schedule));
  }
  return parts.join(' · ');
}

function generatedGroupRule(id) {
  const group = config.groups[id];
  if (group.defaults?.schedule) return generatedScheduleRule({ group: id, schedule: group.defaults.schedule }, year);
  if (group.date) return t('Fixed date') + ' · ' + annualDateLabel(group.date);
  return t('{count} deadlines', { count: config.items.filter(item => item.group === id).length });
}

function resolve(targetYear) {
  const resolved = scheduleResolver(config, targetYear);
  return Object.fromEntries(config.items.map(item => {
    const occurrence = resolved[item.id];
    const rule = item.rule?.trim() ? item.rule : generatedScheduleRule(item, targetYear, occurrence);
    return [item.id, { ...occurrence, rule }];
  }));
}
function updateGroups(entries){Object.entries(config.groups||{}).forEach(([id])=>{const members=entries.filter(entry=>config.items.find(item=>item.id===entry.card.dataset.deadlineId)?.group===id),visible=members.filter(entry=>!entry.hiddenByDate),card=panel.querySelector(`[data-group="${id}"]`);if(!visible.length){card.hidden=true;return}const expanded=expandedGroups.has(id),first=visible[0];card.hidden=false;card.querySelector('.card-date').textContent=fmt(first.date);card.querySelector('.rule-line').textContent=t('{count} deadlines',{count:visible.length});card.querySelector('[data-group-toggle]').setAttribute('aria-expanded',String(expanded));first.card.before(card);members.forEach(entry=>{const wasCollapsed=entry.card.classList.contains('is-group-collapsed');entry.card.style.setProperty('--group-reveal-duration',`${PANEL_RECALCULATION_MIN_MS}ms`);if(!expanded&&!wasCollapsed&&!entry.hiddenByDate){const style=getComputedStyle(entry.card),height=entry.card.getBoundingClientRect().height;entry.card.classList.add('is-group-collapsed');entry.card.animate([{height:`${height}px`,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,opacity:1},{height:'0px',paddingTop:'0px',paddingBottom:'0px',opacity:0}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'ease'})}else{entry.card.hidden=entry.hiddenByDate;entry.card.classList.toggle('is-group-collapsed',!expanded&&!entry.hiddenByDate);if(expanded&&wasCollapsed&&!entry.hiddenByDate)entry.card.animate([{opacity:0},{opacity:1}],{duration:PANEL_RECALCULATION_MIN_MS,easing:'ease'})}})})}
function paintNow(){if(editingTimeline){paintTimeline();return}const before=panelCardPositions(),years=renderMode==='year'?[year]:[year-1,year,year+1],datesByYear=years.map(resolve),angleForDate=d=>(d-new Date(d.getFullYear(),0,1))/(new Date(d.getFullYear()+1,0,1)-new Date(d.getFullYear(),0,1))*Math.PI*2-Math.PI/2,displayDate=displayDateAtTop(),entries=[];const displayCard=document.querySelector('[data-display-date]');displayCard.querySelector('.card-date').textContent=fmt(displayDate)+' '+displayDate.getFullYear();displayCard.querySelector('.rule-line').textContent=displayDate.getFullYear();config.items.forEach(item=>{const candidates=datesByYear.map(dates=>dates[item.id]),r=renderMode==='year'?candidates[0]:candidates.find(candidate=>candidate.date.getFullYear()===yearAtWheelAngle(angleForDate(candidate.date)*180/Math.PI+rotation))??candidates[0],c=document.querySelector(`.deadline-card[data-deadline-id="${item.id}"]`),e=document.querySelector(`.event[data-deadline-id="${item.id}"]`),a=angleForDate(r.date),days=Math.round((r.date-displayDate)/86400000),grace=days<0&&days>=-GRACE_PERIOD,hiddenByDate=renderMode==='continuous'&&days< -GRACE_PERIOD;c.dataset.exportDate=inputValue(r.date);c.dataset.exportEligible=String(!hiddenByDate);c.querySelector('.card-date').textContent=fmt(r.date);const dateField=c.querySelector('[data-item-override], [data-anchor-id]');if(dateField)dateField.value=inputValue(r.date);c.querySelector('.rule-line').textContent=r.rule;c.classList.toggle('is-grace',grace);c.hidden=hiddenByDate;c.dataset.graceLabel=t('Within {count} days',{count:GRACE_PERIOD});e.style.setProperty('--x',`${50+Math.cos(a)*37}%`);e.style.setProperty('--y',`${50+Math.sin(a)*37}%`);e.dataset.year=r.date.getFullYear();e.querySelector('span').textContent=r.date.getDate();e.setAttribute('aria-label',`${fmt(r.date)}: ${item.title}`);entries.push({card:c,date:r.date,days,grace,hiddenByDate})});const sorted=entries.sort((a,b)=>{const group=x=>x.grace?0:x.days>=0?1:2;return group(a)-group(b)||a.date-b.date});sorted.forEach(entry=>scheduleCards.append(entry.card));updateGroups(sorted);animatePanelReflow(before);updateStatusStyles()}
const PANEL_RECALCULATION_MIN_MS=animationTime;let lastPanelCalculation=-Infinity,pendingPanelCalculation,panelCalculationTimer;function paint(){pendingPanelCalculation=paintNow;if(panelCalculationTimer)return;const wait=Math.max(0,PANEL_RECALCULATION_MIN_MS-(performance.now()-lastPanelCalculation));if(!wait){lastPanelCalculation=performance.now();const next=pendingPanelCalculation;pendingPanelCalculation=undefined;next();updateDebugCardYears();return}panelCalculationTimer=setTimeout(()=>{panelCalculationTimer=undefined;lastPanelCalculation=performance.now();const next=pendingPanelCalculation;pendingPanelCalculation=undefined;next();updateDebugCardYears()},wait)}
function updateStatusStyles(){const statuses=statusResolver(config,Object.fromEntries(Object.entries(config.anchors).map(([id,anchor])=>[id,anchor.status||'tentative'])));config.items.forEach(item=>{const card=document.querySelector(`.deadline-card[data-deadline-id="${item.id}"]`),status=statuses[item.id],override=document.querySelector(`[data-item-status="${item.id}"]`)?.getAttribute('aria-pressed')==='true';card.classList.remove('is-anchor','is-set','is-derived','is-derived-set');if(item.configurable){card.classList.add(override?'is-set':'is-derived');card.dataset.statusLabel=t(override?'Set date':'Tentative');return}if(item.schedule.kind==='anchor'){card.classList.add(status==='set'?'is-set':'is-anchor');card.dataset.statusLabel=t(status==='set'?'Set date':'Tentative')}else if(item.status==='set'){card.classList.add('is-set');card.dataset.statusLabel=t('Set date')}else{card.classList.add(status==='set'?'is-derived-set':'is-derived');card.dataset.statusLabel=t(status==='set'?'Depends on set anchor':'Depends on anchor')}})}
const apply=()=>{wheel.style.setProperty('--wheel-rotation',`${rotation}deg`);wheel.style.setProperty('--today-label-rotation',`${-(rotation+todayAngle)}deg`)};const setYearCycle=(element,segmentYear)=>{const cycle=((segmentYear%4)+4)%4;element.classList.remove('year-cycle-0','year-cycle-1','year-cycle-2','year-cycle-3');element.classList.add(`year-cycle-${cycle}`)};function updateYearBand(y){if(renderMode==='year'){const[segment,following]=document.querySelectorAll('[data-year-segment]'),circle=segment.querySelector('circle'),label=segment.querySelector('text');segment.style.display='';following.style.display='none';circle.setAttribute('stroke-dasharray','100 0');circle.setAttribute('stroke-dashoffset','0');circle.setAttribute('transform','rotate(90 50 50)');label.setAttribute('x','50');label.setAttribute('y','97');label.textContent=y;setYearCycle(segment,y);return}const segments=window.scheduleEngine.yearBandSegments(rotation,y);document.querySelectorAll('[data-year-segment]').forEach((segment,index)=>{const {start,portion:fraction,year:segmentYear}=segments[index],portion=fraction*100,circle=segment.querySelector('circle'),label=segment.querySelector('text'),angle=(start+portion*1.8)*Math.PI/180;segment.style.display=portion>.01?'':'none';circle.setAttribute('stroke-dasharray',`${portion} ${100-portion}`);circle.setAttribute('stroke-dashoffset','0');circle.setAttribute('transform',`rotate(${start} 50 50)`);label.setAttribute('x',String(50+46*Math.cos(angle)));label.setAttribute('y',String(50+46*Math.sin(angle)+1));label.textContent=segmentYear;setYearCycle(segment,segmentYear)})};function setYear(y,{preserveRotation=false,startOfYear=false}={}){year=y;document.querySelectorAll('[data-anchor-id]').forEach(field=>{const anchor=config.anchors[field.dataset.anchorId];field.value=inputValue(resolveAnchorDate(anchor,y,anchor.date))});yearLabel.textContent=y;document.querySelectorAll('.intro .year-text').forEach(x=>x.textContent=y);const now=new Date(),focus=new Date(y,now.getMonth(),now.getDate()),p=(focus-new Date(y,0,1))/(new Date(y+1,0,1)-new Date(y,0,1));todayAngle=-180+p*360;if(!preserveRotation)rotation=startOfYear?0:-p*360;updateYearBand(y);paint();wheel.style.setProperty('--today-angle',`${todayAngle}deg`);wheel.querySelector('.today-line span').textContent=focus.getDate();apply()}
const normalizeAngle=angle=>(angle%360+360)%360,yearAtWheelAngle=angle=>{const start=new Date(year,0,1),end=new Date(year+1,0,1),candidate=new Date(+start+normalizeAngle(angle-rotation+90)/360*(end-start)),graceStart=new Date(displayDateAtTop());graceStart.setDate(graceStart.getDate()-GRACE_PERIOD);return candidate<graceStart?year+1:year},split2TurnAtTop=()=>Math.ceil(rotation/360);
function setRenderMode(mode){renderMode=mode;stage.classList.toggle('is-continuous',mode==='continuous');document.querySelectorAll('[data-render-mode]').forEach(button=>{const active=button.dataset.renderMode===mode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});split2Turn=split2TurnAtTop(year);updateYearBand(year);paint();stage.setAttribute('aria-description',mode==='continuous'?t('Continuous mode: dates enter at the top and leave beneath the lower cut.'): '')}
function updateContinuousYear(){if(renderMode!=='continuous')return;const nextTurn=split2TurnAtTop(year),delta=nextTurn-split2Turn;if(!delta)return;setYear(year-delta,{preserveRotation:true});split2Turn=nextTurn}
function resetContinuousOrigin(){split2Turn=split2TurnAtTop(year)}
function updateDisplayDateCard(){const card=panel.querySelector('[data-display-date]');if(!card)return;const current=displayDateAtTop();card.querySelector('.card-date').textContent=fmt(current)+' '+current.getFullYear();card.querySelector('.rule-line').textContent=current.getFullYear()}
const setZoom=z=>{zoom=Math.max(.78,Math.min(1.5,z));wheel.style.setProperty('--wheel-scale',zoom);stage.style.setProperty('--wheel-scale',zoom);stage.classList.toggle('is-detailed',zoom>1.08);zoomLabel.textContent=`${Math.round(zoom*100)} %`};
render();stage.classList.toggle('is-debug-years',debugYears);renderAnchorControls();setYear(year);setRenderMode(renderMode);setZoom(zoom);document.querySelectorAll('[data-anchor-id]').forEach(field=>field.addEventListener('input',()=>{config.anchors[field.dataset.anchorId].date=field.value;paint()}));document.querySelectorAll('[data-anchor-status],[data-item-status]').forEach(field=>field.addEventListener('click',()=>{const set=field.getAttribute('aria-pressed')!=='true';field.setAttribute('aria-pressed',String(set));field.classList.toggle('is-set',set);field.classList.toggle('is-tentative',!set);field.textContent=t(set?'Set':'Tentative');if(field.dataset.anchorStatus)updateAnchorStatus(field,set);else updateItemDate(field.dataset.itemStatus,set?field.parentElement.querySelector('input').value:'');paint()}));document.querySelectorAll('[data-item-override]').forEach(field=>field.addEventListener('input',()=>{const status=document.querySelector(`[data-item-status="${field.dataset.itemOverride}"]`);status.setAttribute('aria-pressed','true');status.classList.add('is-set');status.classList.remove('is-tentative');status.textContent=t('Set');updateItemDate(field.dataset.itemOverride,field.value);paint()}));document.querySelectorAll('[data-render-mode]').forEach(button=>button.onclick=()=>setRenderMode(button.dataset.renderMode));document.querySelector('#previous-year').onclick=()=>{setYear(year-1,{startOfYear:true});resetContinuousOrigin()};document.querySelector('#next-year').onclick=()=>{setYear(year+1,{startOfYear:true});resetContinuousOrigin()};document.querySelector('#today-button').onclick=()=>{setYear(new Date().getFullYear());resetContinuousOrigin()};document.querySelector('#zoom-in').onclick=()=>setZoom(presets.find(x=>x>zoom+.005)??presets.at(-1));document.querySelector('#zoom-out').onclick=()=>setZoom(presets.filter(x=>x<zoom-.005).at(-1)??presets[0]);wheel.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom-e.deltaY*.0015)},{passive:false});
panel.addEventListener('click', event => {
  const button = event.target.closest('[data-group-toggle]');
  if (!button) return;
  const id = button.dataset.groupToggle;
  if (editingTimeline && !editingDeadlines) {
    graphGroupExpansion.set(id, button.getAttribute('aria-expanded') !== 'true');
    paintTimeline();
    return;
  }
  const collapse = editingTimeline ? !authoredConfig.groups[id].collapsed : expandedGroups.has(id);
  if (collapse) expandedGroups.delete(id);
  else expandedGroups.add(id);
  if (editingTimeline) {
    authoredConfig.groups[id].collapsed = collapse;
    paintTimeline();
  } else {
    paint();
  }
});
let dragAngle;const pointer=e=>{const b=wheel.getBoundingClientRect();return Math.atan2(e.clientY-b.top-b.height/2,e.clientX-b.width/2-b.left)*180/Math.PI};wheel.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;dragAngle=pointer(e);wheel.classList.add('is-dragging');wheel.setPointerCapture(e.pointerId)});wheel.addEventListener('pointermove',e=>{if(!wheel.hasPointerCapture(e.pointerId))return;const angle=pointer(e);let delta=angle-dragAngle;if(delta>180)delta-=360;if(delta<-180)delta+=360;rotation+=delta;dragAngle=angle;updateYearBand(year);apply();updateContinuousYear();updateDisplayDateCard();paint()});wheel.addEventListener('pointerup',e=>{wheel.releasePointerCapture(e.pointerId);wheel.classList.remove('is-dragging')});
document.querySelectorAll('.event').forEach(e=>e.onclick=()=>{document.querySelectorAll('.deadline-card').forEach(c=>c.classList.remove('active'));document.querySelector(`.deadline-card[data-deadline-id="${e.dataset.deadlineId}"]`)?.classList.add('active')});
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
const sessionEnumOptions=path=>{const name=sessionPathName(path),itemField=path[0]==='items'&&path.length===3?path[2]:undefined,scheduleField=path[0]==='items'&&path[2]==='schedule'?path[3]:undefined,unique=values=>[...new Set(values)].map(value=>({value,label:String(value)})),weekdays=values=>values.map(value=>({value,label:weekdayName(value)}));if(name==='organisation.timezone')return unique([...Intl.supportedValuesOf('timeZone'),'UTC',sessionConfigDraft.organisation.timezone].sort());if(name==='display.locale'||name==='translations.autoTranslate.sourceLocale')return unique(sessionConfigDraft.display.locales);if(name==='display.renderMode')return unique(['year','continuous']);if(name==='display.fonts.provider')return unique(['google','selfHosted']);if(name==='translations.autoTranslate.provider')return unique(['deepl']);if(itemField==='kind')return unique(['deadline','anchor','event','course',...Object.keys(sessionConfigDraft.autoLayers || {}),...sessionConfigDraft.items.map(item=>window.scheduleEngine.effectiveItem(sessionConfigDraft,item).kind).filter(Boolean)]);if(itemField==='layer')return unique(['auto',...Object.keys(sessionConfigDraft.layers)]);if(itemField==='status')return unique(['set','derived','anchor']);if(scheduleField==='kind')return unique(['anchor','fixed','group','offset_from_date','offset_from_month_start','offset_from_month_end','nth_weekday','nth_full_weekday','last_weekday','month_start','month_end','next_weekday','previous_weekday','offset','course']);if(scheduleField==='anchor')return unique(Object.keys(window.scheduleEngine.scheduleAnchors(sessionConfigDraft)));if(scheduleField==='weekday'||path.at(-1)==='weekday')return weekdays([0,1,2,3,4,5,6]);if(scheduleField==='direction')return unique(['forward','backward']);if(path[0]==='schedules'&&path.length===3&&path[2]==='calendar')return unique(Object.keys(calendarSources));if(path[0]==='schedules'&&path.at(-1)==='estimateBy')return unique(['isoWeek','easter','monthDay']);if(path[0]==='schedules'&&path[2]==='includes')return unique(Object.keys(sessionConfigDraft.schedules).filter(id=>id!==path[1]));if(path[0]==='constraints'&&path.at(-1)==='schedule')return unique(Object.keys(sessionConfigDraft.schedules||{}));if(path[0]==='items'&&path.includes('constraints'))return unique(Object.keys(sessionConfigDraft.constraints||{}));if(path[0]==='items'&&path.includes('skip'))return unique(['easter','autumn_holiday']);return undefined};
const sessionSpinboxBounds=path=>{const field=path.at(-1),parent=sessionPathValue(sessionConfigDraft,path.slice(0,-1));if(field==='month')return{min:1,max:12};if(field==='day'){const month=Number(parent.month);return{min:1,max:month>=1&&month<=12?new Date(2024,month,0).getDate():31}}return undefined},syncSessionDaySpinbox=path=>{if(path.at(-1)!=='month')return;const dayPath=JSON.stringify([...path.slice(0,-1),'day']),bounds=sessionSpinboxBounds([...path.slice(0,-1),'day']);document.querySelectorAll('input[data-session-path]').forEach(control=>{if(control.dataset.sessionPath!==dayPath)return;control.max=String(bounds.max);if(Number(control.value)>bounds.max){control.value=String(bounds.max);setSessionPathValue(sessionConfigDraft,JSON.parse(dayPath),bounds.max)}})};
const validateSessionField=async(input,path)=>{if(!sessionPathName(path).startsWith('display.fonts.'))return;const revision=String(Number(input.dataset.validationRevision||0)+1);input.dataset.validationRevision=revision;try{await validateFontSettings(sessionConfigDraft.display.fonts);if(input.dataset.validationRevision!==revision)return;input.classList.remove('is-invalid');input.removeAttribute('title')}catch(error){if(input.dataset.validationRevision!==revision)return;input.classList.add('is-invalid');input.title=error.message}};
const translationStrings = new Set(window.annualWheelTranslationStrings ?? []);
const discardDialog = document.querySelector('#discard-changes');
discardDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    discardDialog.close('keep');
  }
});

function labelAddButton(button, action) {
  setControlIcon(button, 'add');
  button.title = t(action);
  button.setAttribute('aria-label', button.title);
}

const editorCancellations = new Map();

async function openAfterCancelling(openEditor) {
  for (const [editor, cancel] of editorCancellations) {
    if (editor.matches('[hidden], dialog:not([open])')) continue;
    if (!await cancel()) {
      editor.querySelector('[name="cancel"], [value="cancel"]').focus();
      return;
    }
  }
  openEditor();
}

function guardDiscard(editor, discardQuestion, readDraft, closeEditor, questionValues) {
  // Mapping order is immaterial. Array order (layers, locales and targets) matters.
  const snapshot = () => JSON.stringify(readDraft(), (_, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
  const initial = snapshot();
  function cancel() {
    if (snapshot() === initial) {
      closeEditor();
      return true;
    }
    if (discardDialog.open) return false;
    discardDialog.querySelector('#discard-title').textContent = t(discardQuestion, questionValues);
    discardDialog.returnValue = '';
    return new Promise(resolve => {
      discardDialog.addEventListener('close', () => {
        const discarded = discardDialog.returnValue === 'discard';
        if (discarded) closeEditor();
        resolve(discarded);
      }, { once: true });
      discardDialog.showModal();
    });
  }
  editorCancellations.set(editor, cancel);
  return event => {
    event.preventDefault();
    cancel();
  };
}

function renderOverrideLocale(parent, language, canAdd) {
  const section = document.createElement('details');
  const title = document.createElement('summary');
  title.textContent = language;
  section.append(title);
  parent.append(section);
  const translations = sessionConfigDraft.translations;
  const overrides = translations.overrides?.[language] ?? {};
  const select = document.createElement('select');
  const add = document.createElement('button');

  function refreshPicker(selected = '') {
    select.replaceChildren(new Option(t('Choose source text'), ''));
    for (const source of translationStrings) {
      if (!Object.hasOwn(overrides, source)) select.add(new Option(source, source));
    }
    select.value = selected;
    select.disabled = select.options.length === 1;
    add.disabled = !select.value;
  }

  function addField(source, replacement) {
    const field = document.createElement('div');
    field.className = 'override-field';
    const label = document.createElement('label');
    label.className = 'config-editor-field';
    const caption = document.createElement('span');
    caption.textContent = source;
    const input = document.createElement('input');
    input.value = replacement;
    input.required = true;
    input.dataset.sessionPath = JSON.stringify(['translations', 'overrides', language, source]);
    input.oninput = () => { overrides[source] = input.value; };
    label.append(caption, input);
    const remove = document.createElement('button');
    remove.type = 'button';
    setControlIcon(remove, 'remove');
    remove.title = t('Remove override');
    remove.setAttribute('aria-label', remove.title + ' · ' + source);
    remove.onclick = () => {
      delete overrides[source];
      if (!Object.keys(overrides).length) delete translations.overrides[language];
      if (!Object.keys(translations.overrides).length) delete translations.overrides;
      field.remove();
      if (canAdd) {
        refreshPicker(translationStrings.has(source) ? source : '');
        select.focus();
      } else {
        title.focus();
      }
    };
    field.append(label, remove);
    section.append(field);
    return input;
  }
  for (const [source, replacement] of Object.entries(overrides)) addField(source, replacement);
  if (!canAdd) return;

  const row = document.createElement('div');
  row.className = 'override-picker';
  select.setAttribute('aria-label', t('Source text'));
  add.type = 'button';
  labelAddButton(add, 'Add override');
  refreshPicker();
  select.onchange = () => { add.disabled = !select.value; };
  add.onclick = () => {
    const source = select.value;
    if (!translationStrings.has(source) || Object.hasOwn(overrides, source)) return;
    translations.overrides ??= {};
    translations.overrides[language] = overrides;
    Object.defineProperty(overrides, source, { value: '', writable: true, configurable: true, enumerable: true });
    refreshPicker();
    const input = addField(source, '');
    input.required = true;
    section.append(row);
    input.focus();
  };
  row.append(select, add);
  section.append(row);
}

const commonDisplayLocales = [
  'ar-SA', 'bn-BD', 'de-DE', 'en-GB', 'en-US', 'es-ES', 'fa-IR', 'fr-FR',
  'gu-IN', 'ha-NG', 'hi-IN', 'id-ID', 'it-IT', 'ja-JP', 'jv-ID', 'ko-KR',
  'mr-IN', 'nb-NO', 'pa-IN', 'pt-BR', 'ru-RU', 'sw-KE', 'ta-IN', 'te-IN',
  'th-TH', 'tr-TR', 'ur-PK', 'vi-VN', 'yue-HK', 'zh-CN', 'zh-TW',
];

function canonicalLocale(tag) {
  try { return Intl.getCanonicalLocales(tag.trim())[0]; }
  catch { return undefined; }
}

function showLocaleDependencies(tag) {
  const code = canonicalLocale(tag);
  if (!code) return false;
  const matches = value => canonicalLocale(value) === code;
  const translations = sessionConfigDraft.translations;
  const dependencies = [];
  if (matches(sessionConfigDraft.display.locale)) dependencies.push('display.locale');
  if (matches(translations?.autoTranslate?.sourceLocale)) dependencies.push('translations.autoTranslate.sourceLocale');
  if (translations?.autoTranslate?.targets?.some(matches)) dependencies.push('translations.autoTranslate.targets');
  for (const language of Object.keys(translations?.overrides ?? {})) {
    if (matches(language)) dependencies.push('translations.overrides.' + language);
  }
  if (!dependencies.length) return false;

  showDependencyDialog(t('Locale in use'), tag, dependencies);
  return true;
}

function showDependencyDialog(title, name, dependencies) {
  const dialog = document.querySelector('#config-dependencies');
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('p').textContent = t('Remove or change these references to {name} first.', { name });
  dialog.querySelector('ul').replaceChildren(...dependencies.map(path => {
    const li = document.createElement('li');
    li.textContent = path;
    return li;
  }));
  dialog.showModal();
}

function renderDisplayLocales(parent) {
  const locales = sessionConfigDraft.display.locales;
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  const label = tag => {
    const canonical = canonicalLocale(tag);
    if (!canonical) return tag;
    const name = names.of(new Intl.Locale(canonical).baseName);
    return name === tag ? tag : name + ' · ' + tag;
  };
  const presets = [...commonDisplayLocales].sort((a, b) => label(a).localeCompare(label(b), locale));
  const rows = document.createElement('div');
  const add = document.createElement('button');
  add.type = 'button';
  labelAddButton(add, 'Add locale');
  parent.append(rows, add);

  function refreshRows() {
    const used = locales.map(canonicalLocale);
    for (const [index, row] of Array.from(rows.children).entries()) {
      const select = row.querySelector('select');
      const current = locales[index];
      const choices = [...new Set([current, ...presets])].filter(tag => tag && (
        tag === current || !used.includes(canonicalLocale(tag))
      ));
      select.replaceChildren(...choices.map(tag => new Option(label(tag), tag)), new Option(t('Add locale…'), ''));
      select.value = row.querySelector('input').hidden ? current : '';
    }
    const fallback = configEditorTree.querySelector('[data-display-locale]');
    if (fallback) {
      fallback.replaceChildren(...locales.map(tag => new Option(tag, tag)));
      fallback.value = sessionConfigDraft.display.locale;
      fallback.required = true;
    }
    refreshTranslationLanguages();
  }

  function appendRow(tag) {
    const row = document.createElement('div');
    row.className = 'override-picker';
    const select = document.createElement('select');
    select.setAttribute('aria-label', t('Display locale'));
    const input = document.createElement('input');
    input.placeholder = 'fr-CA';
    input.dataset.customLocale = '';
    input.setAttribute('aria-label', t('Locale code'));
    input.hidden = input.disabled = Boolean(tag);
    input.required = true;
    const remove = document.createElement('button');
    remove.type = 'button';
    setControlIcon(remove, 'remove');
    remove.title = t('Remove locale');
    const index = () => Array.from(rows.children).indexOf(row);
    const blocked = () => {
      const current = locales[index()];
      if (!showLocaleDependencies(current)) return false;
      select.value = current;
      input.hidden = input.disabled = true;
      return true;
    };
    const update = value => {
      locales[index()] = value;
      remove.setAttribute('aria-label', remove.title + ' · ' + value);
      input.hidden = input.disabled = true;
      refreshRows();
    };
    select.onchange = () => {
      if (blocked()) return;
      if (select.value) return update(select.value);
      input.hidden = input.disabled = false;
      input.value = '';
      input.setCustomValidity('');
      input.focus();
    };
    const validate = () => {
      const tag = canonicalLocale(input.value);
      const duplicate = tag && locales.some((value, i) => i !== index() && canonicalLocale(value) === tag);
      input.setCustomValidity(duplicate ? t('This locale is already listed.') : tag ? '' : t('Enter a valid locale code.'));
      return input.validity.valid ? tag : undefined;
    };
    input.oninput = validate;
    input.onchange = () => {
      const value = validate();
      if (value && !blocked()) update(value);
    };
    input.onkeydown = event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = validate();
      if (value) {
        if (!blocked()) { update(value); select.focus(); }
      }
      else input.reportValidity();
    };
    remove.setAttribute('aria-label', [remove.title, tag].filter(Boolean).join(' · '));
    remove.onclick = () => {
      if (blocked()) return;
      locales.splice(index(), 1);
      row.remove();
      refreshRows();
      add.focus();
    };
    row.append(select, input, remove);
    rows.append(row);
    return row;
  }
  for (const tag of locales) appendRow(tag);
  add.onclick = () => {
    const used = locales.map(canonicalLocale);
    const tag = presets.find(preset => !used.includes(preset)) ?? '';
    locales.push(tag);
    const row = appendRow(tag);
    refreshRows();
    row.querySelector(tag ? 'select' : 'input').focus();
  };
  refreshRows();
}

function refreshTranslationLanguages() {
  const settings = sessionConfigDraft.translations?.autoTranslate;
  const source = configEditorTree.querySelector('[data-translation-source]');
  const targets = configEditorTree.querySelector('[data-translation-targets]');
  const overrides = configEditorTree.querySelector('[data-translation-overrides]');
  const locales = [...new Set(sessionConfigDraft.display.locales ?? [])].filter(Boolean);
  if (source) {
    source.replaceChildren(...locales.map(language => new Option(language, language)));
    source.value = settings.sourceLocale;
    source.required = true;
  }
  const eligible = locales.filter(language => language !== settings?.sourceLocale);
  const selected = [...new Set(settings?.targets ?? [])].filter(language => eligible.includes(language));
  if (targets) {
    if (settings.targets) settings.targets = selected;
    const available = eligible.filter(language => !selected.includes(language));
    targets.replaceChildren();
    for (const [index, language] of selected.entries()) {
      const row = document.createElement('div');
      row.className = 'override-picker';
      const select = document.createElement('select');
      select.setAttribute('aria-label', t('Target language'));
      for (const option of eligible) {
        if (option === language || available.includes(option)) select.add(new Option(option, option));
      }
      select.value = language;
      select.onchange = () => {
        settings.targets[index] = select.value;
        refreshTranslationLanguages();
        targets.querySelectorAll('select')[index].focus();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      setControlIcon(remove, 'remove');
      remove.title = t('Remove target language');
      remove.setAttribute('aria-label', remove.title + ' · ' + language);
      remove.onclick = () => {
        settings.targets.splice(index, 1);
        refreshTranslationLanguages();
        (targets.querySelectorAll('select')[index] ?? targets.lastElementChild).focus();
      };
      row.append(select, remove);
      targets.append(row);
    }
    const add = document.createElement('button');
    add.type = 'button';
    labelAddButton(add, 'Add target language');
    add.disabled = !available.length;
    add.onclick = () => {
      settings.targets = [...selected, available[0]];
      refreshTranslationLanguages();
      targets.querySelectorAll('select')[selected.length].focus();
    };
    targets.append(add);
  }
  if (overrides) {
    const expanded = new Set(Array.from(overrides.querySelectorAll('details[open]'), section => section.firstElementChild.textContent));
    overrides.replaceChildren();
    for (const language of new Set([...selected, ...Object.keys(sessionConfigDraft.translations.overrides ?? {})])) {
      renderOverrideLocale(overrides, language, selected.includes(language));
      overrides.lastElementChild.open = expanded.has(language);
    }
  }
}

function renderSessionConfigNode(value, path, parent, label, readOnly = false) {
  if (value !== null && typeof value === 'object') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    details.open = path.length < 2;
    summary.textContent = label;
    details.append(summary);
    const name = sessionPathName(path);
    if (!readOnly && name === 'display.locales') {
      renderDisplayLocales(details);
      parent.append(details);
      return;
    }
    if (!readOnly && (name === 'translations.overrides' || name === 'translations.autoTranslate.targets')) {
      const content = document.createElement('div');
      if (name === 'translations.overrides') content.dataset.translationOverrides = '';
      else content.dataset.translationTargets = '';
      details.append(content);
      parent.append(details);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const part = Array.isArray(value) ? Number(key) : key;
      renderSessionConfigNode(child, [...path, part], details, Array.isArray(value) ? `[${key}]` : key, readOnly);
    }
    parent.append(details);
    return;
  }

  const field = document.createElement(readOnly ? 'div' : 'label');
  const caption = document.createElement('span');
  field.className = 'config-editor-field';
  caption.textContent = label;
  if (readOnly) {
    const text = document.createElement('span');
    text.textContent = String(value);
    field.append(caption, text);
    parent.append(field);
    return;
  }
  const options = sessionEnumOptions(path);
  const control = document.createElement(options ? 'select' : 'input');
  if (options) {
    for (const option of options) control.add(new Option(option.label, String(option.value)));
  } else if (typeof value === 'boolean') {
    control.type = 'checkbox';
  } else if (typeof value === 'number') {
    control.type = 'number';
    const bounds = sessionSpinboxBounds(path);
    if (bounds) Object.assign(control, { min: bounds.min, max: bounds.max, step: 1 });
  }
  if (control.type === 'checkbox') control.checked = value;
  else control.value = value ?? '';
  control.dataset.sessionPath = JSON.stringify(path);
  const isTranslationSource = sessionPathName(path) === 'translations.autoTranslate.sourceLocale';
  if (isTranslationSource) control.dataset.translationSource = '';
  if (sessionPathName(path) === 'display.locale') {
    control.dataset.displayLocale = '';
    control.required = true;
  }
  control.addEventListener(options || control.type === 'checkbox' ? 'change' : 'input', () => {
    const next = control.type === 'checkbox' ? control.checked : parseSessionValue(control.value, value);
    setSessionPathValue(sessionConfigDraft, path, next);
    if (isTranslationSource) refreshTranslationLanguages();
    syncSessionDaySpinbox(path);
    validateSessionField(control, path);
  });
  field.append(caption, control);
  parent.append(field);
  validateSessionField(control, path);
}
const validateSessionConfiguration=next=>{if(!next||typeof next!=='object'||!next.organisation?.name||typeof next.organisation.name!=='string'||!next.display||typeof next.display.title!=='string'||typeof next.display.description!=='string'||!next.layers||typeof next.layers!=='object'||!next.anchors||typeof next.anchors!=='object'||!Array.isArray(next.items))throw new Error('Configuration must contain organisation.name, display.title, display.description, layers, anchors, and items.');if(next.initialYear!=='current'&&!Number.isInteger(next.initialYear))throw new Error('initialYear must be current or a whole year number.');Object.entries(next.layers).forEach(([id,layer])=>{if(typeof layer?.label!=='string'||typeof layer?.color!=='string'||!CSS.supports('color',layer.color))throw new Error(`Layer ${id} must have a label and valid color.`)});Object.entries(next.anchors).forEach(([id,anchor])=>{if(typeof anchor?.title!=='string'||!anchor.defaultDate)throw new Error(`Anchor ${id} must have a title and valid default date.`);resolveAnchorDate(anchor,year)});const ids=new Set;next.items.forEach(item=>{if(typeof item?.id!=='string'||!item.id||ids.has(item.id))throw new Error('Every item must have a unique id.');ids.add(item.id);if(typeof item.title!=='string'||!item.schedule||typeof item.schedule!=='object')throw new Error(`Item ${item.id} must have a title and schedule.`);const itemLayer=item.layer==='auto'?next.autoLayers?.[item.kind]:item.layer;if(!next.layers[itemLayer])throw new Error(`Item ${item.id} refers to an unknown layer.`);if(item.group&&!next.groups?.[item.group])throw new Error(`Item ${item.id} refers to an unknown group.`)});scheduleResolver(next,year)};
let advancedFields = [];
const advancedButton = panel.querySelector('.open-config');
function openAdvancedOptions() {
  sessionConfigDraft = structuredClone(authoredConfig);
  const tree = graphView.configurationFromFields(advancedFields.map(({ path }) => ({
    path, value: sessionPathValue(sessionConfigDraft, path),
  })));
  if (editingDeadlines && sessionConfigDraft.translations?.autoTranslate) {
    tree.translations ??= {};
    tree.translations.autoTranslate ??= {};
    tree.translations.autoTranslate.sourceLocale ??= sessionConfigDraft.translations.autoTranslate.sourceLocale ?? '';
    tree.translations.autoTranslate.targets ??= [];
    tree.translations.overrides ??= {};
  }
  configEditorTree.replaceChildren();
  for (const [key, value] of Object.entries(tree)) renderSessionConfigNode(value, [key], configEditorTree, key, !editingDeadlines);
  if (editingDeadlines) refreshTranslationLanguages();
  configEditor.querySelector('.config-editor-apply').hidden = !editingDeadlines;
  const dismiss = configEditor.querySelector('[value=cancel]');
  dismiss.dataset.i18nAriaLabel = editingDeadlines ? 'Cancel' : 'Close';
  dismiss.title = t(dismiss.dataset.i18nAriaLabel);
  dismiss.setAttribute('aria-label', dismiss.title);
  if (editingDeadlines) setControlIcon(dismiss, 'cancel');
  else { delete dismiss.dataset.icon; dismiss.textContent = dismiss.title; }
  configEditorError.textContent = '';
  const cancel = guardDiscard(configEditor, 'Discard changes to advanced options?', () => ({
    plan: sessionConfigDraft,
    pendingLocales: Array.from(configEditorTree.querySelectorAll('[data-custom-locale]:enabled'), input => input.value).filter(Boolean),
    incompleteNumbers: Array.from(configEditorTree.querySelectorAll('input[type="number"]'))
      .filter(input => !input.value || input.validity.badInput).map(input => input.dataset.sessionPath),
  }), () => configEditor.close());
  configEditor.querySelector('form').onsubmit = cancel;
  configEditor.oncancel = cancel;
  configEditor.onkeydown = event => {
    if (event.key === 'Escape') cancel(event);
  };
  configEditor.showModal();
}
advancedButton.onclick = () => editingDeadlines ? openAfterCancelling(openAdvancedOptions) : openAdvancedOptions();
configEditor.querySelector('.config-editor-apply').onclick = async event => {
  if (!editingDeadlines) return;
  if (!configEditor.querySelector('form').reportValidity()) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    let next = structuredClone(authoredConfig);
    for (const { path } of advancedFields) {
      if (path[0] === 'display' && path[1] === 'locales') continue;
      if (path[0] === 'translations' && path[1] === 'overrides') continue;
      if (path[0] === 'translations' && path[1] === 'autoTranslate') continue;
      setSessionPathValue(next, path, sessionPathValue(sessionConfigDraft, path));
    }
    if (sessionConfigDraft.display.locales) next.display.locales = [...sessionConfigDraft.display.locales];
    if (sessionConfigDraft.translations?.autoTranslate) {
      next.translations.autoTranslate = structuredClone(sessionConfigDraft.translations.autoTranslate);
    }
    if (sessionConfigDraft.translations?.overrides) {
      next.translations.overrides = structuredClone(sessionConfigDraft.translations.overrides);
    } else if (next.translations) {
      delete next.translations.overrides;
    }
    next = window.scheduleEngine.normalizeAnchorDependencies(next);
    const effective = effectiveConfiguration(next);
    validateSessionConfiguration(effective);
    if (JSON.stringify(next.display.fonts) !== JSON.stringify(authoredConfig.display.fonts)) {
      await applyFontSettings(next.display.fonts);
    }
    const modeChanged = next.display.renderMode !== authoredConfig.display.renderMode;
    authoredConfig = next;
    config = effective;
    if (modeChanged) setRenderMode(next.display.renderMode);
    paintNow();
    configEditor.close();
    saveConfirmedConfiguration();
  } catch (error) {
    configEditorError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

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
    if (!card.hidden && !card.classList.contains('is-layer-hidden')) columns.set(card, calendarDay(date));
  }
  for (const edge of edges) {
    const source = edge.source.closest('.timeline-dated-group') ?? edge.source;
    const target = edge.target.closest('.timeline-dated-group') ?? edge.target;
    if (source === target || !columns.has(source) || !columns.has(target)) continue;
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
  cancelDependencyDrag?.();
  cancelDependencyDrag = undefined;
  closeDependencyPreview();
  arrowLayoutObserver.disconnect();
  timelineEdges = [];
  arrowPaths.replaceChildren();
  scheduleCards.querySelectorAll('[data-virtual-date]').forEach(card => card.remove());
  scheduleCards.querySelectorAll('.timeline-calendar, .timeline-weekday').forEach(row => row.remove());
}

const arrowPaths = scheduleCards.querySelector('.timeline-arrows g');
let timelineEdges = [];
let cancelDependencyDrag;
const arrowLayoutObserver = new ResizeObserver(drawDependencyArrows);

const dependencyPreview = document.querySelector('#dependency-preview');
let previewCaption, previewEdge;
let previewCloseTimer;

function closeDependencyPreview() {
  clearTimeout(previewCloseTimer);
  previewCaption?.removeAttribute('aria-describedby');
  previewCaption = previewEdge = undefined;
  dependencyPreview.hidden = true;
}

function leaveDependencyPreview() {
  clearTimeout(previewCloseTimer);
  previewCloseTimer = setTimeout(() => {
    if (!previewCaption?.matches(':hover, :focus-visible') && !dependencyPreview.matches(':hover')) closeDependencyPreview();
  }, 150);
}

function showDependencyPreview(caption, edge, title) {
  clearTimeout(previewCloseTimer);
  if (previewCaption === caption) return;
  closeDependencyPreview();
  previewCaption = caption;
  previewEdge = edge;
  const fields = dependencyPreview.querySelector('fieldset');
  fields.replaceChildren();
  dependencyFields(fields, edge);
  dependencyPreview.querySelector('h2').textContent = title;
  caption.setAttribute('aria-describedby', dependencyPreview.id);
  dependencyPreview.hidden = false;
  positionDependencyPreview(caption);
}

function positionDependencyPreview(caption) {
  const rect = caption.getBoundingClientRect();
  const box = dependencyPreview.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - box.width - 8));
  const top = rect.bottom + box.height + 12 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - box.height - 4);
  dependencyPreview.style.left = left + 'px';
  dependencyPreview.style.top = top + 'px';
}

dependencyPreview.onpointerenter = () => clearTimeout(previewCloseTimer);
dependencyPreview.onpointerleave = leaveDependencyPreview;
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && previewCaption) closeDependencyPreview();
});
document.addEventListener('scroll', event => {
  if (previewCaption && !dependencyPreview.contains(event.target)) closeDependencyPreview();
}, true);

const dependencyMoves = new Map();
const removedNodes = new Map();
const detachedVirtualDates = new Map();
const graphHistory = [];
const invalidDependencyNodes = new Set();
const graphWarning = document.querySelector('.dependency-draft-warning');
const undoDependency = document.querySelector('.undo-dependency');

function nodeKey(node) {
  if (node.classList.contains('timeline-calendar')) return 'calendar:' + node.dataset.scheduleKey;
  if (node.dataset.itemGroup !== undefined) return 'group:' + node.dataset.itemGroup;
  if (node.dataset.deadlineId) return 'item:' + node.dataset.deadlineId;
  if (node.dataset.anchorKey) return 'anchor:' + node.dataset.anchorKey;
  if (node.dataset.constraintId) return 'constraint:' + node.dataset.constraintId;
  if (node.dataset.virtualDefinition) return 'date:' + node.dataset.virtualDefinition;
  return 'start';
}

function dependencyKey(edge) {
  return JSON.stringify([nodeKey(edge.target), edge.edit.path, edge.edit.kind, edge.edit.index]);
}

function graphNodes() {
  const nodes = scheduleCards.querySelectorAll('[data-deadline-id], [data-virtual-date], .timeline-start, .timeline-weekday, .timeline-dated-group');
  return new Map(Array.from(nodes, node => [nodeKey(node), node]));
}

function pendingGraphChanges() {
  return dependencyMoves.size > 0 || removedNodes.size > 0;
}

function rememberGraphChange() {
  graphHistory.push({ moves: new Map(dependencyMoves), nodes: new Map(removedNodes) });
}

function removeGraphNode(node) {
  const key = nodeKey(node);
  rememberGraphChange();
  removedNodes.set(key, { ...node.dataset });
  applyDependencyMoves();
}

function graphRemoveButton(title, remove, svg = false) {
  const button = svg ? document.createElementNS(arrowPaths.namespaceURI, 'image') : document.createElement('button');
  const label = t('Remove {title}', { title });
  setControlIcon(button, 'remove');
  button.setAttribute('aria-label', label);
  button.classList.add(svg ? 'remove-dependency' : 'graph-remove');
  if (svg) {
    button.setAttribute('tabindex', '0');
    button.setAttribute('role', 'button');
    button.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.onclick(event);
      }
    };
  } else {
    button.type = 'button';
    button.title = label;
  }
  button.onclick = event => {
    event.stopPropagation();
    closeDependencyPreview();
    openAfterCancelling(remove);
  };
  return button;
}

function projectedEdges() {
  const nodes = graphNodes();
  return timelineEdges.map(original => {
    const move = dependencyMoves.get(dependencyKey(original));
    const source = nodes.get(move?.source) ?? original.source;
    const target = nodes.get(move?.target) ?? original.target;
    const sourceTitle = source === original.source ? original.sourceTitle :
      source.querySelector('h2, select option:checked')?.textContent ?? t('Initial object');
    const removed = move?.removed || removedNodes.has(nodeKey(source)) || removedNodes.has(nodeKey(target));
    return { ...original, original, source, target, sourceTitle, removed };
  });
}

function acceptsEndpoint(edge, side, node) {
  const { kind } = edge.edit;
  if (side === 'target') {
    if (kind === 'relative' || kind === 'anchor') return Boolean(node.dataset.anchorKey);
    if (!node.dataset.deadlineId || node.dataset.anchorKey) return false;
    if (kind !== 'satisfies') return true;
    return ['nth_weekday', 'nth_full_weekday', 'last_weekday', 'next_weekday', 'previous_weekday']
      .includes(config.items[Number(node.dataset.itemIndex)].schedule.kind);
  }
  if (kind === 'satisfies') return Boolean(node.dataset.constraintId);
  if (kind === 'relative' || kind === 'anchor') return Boolean(node.dataset.virtualDefinition);
  return !node.dataset.constraintId;
}

function startDependencyDrag(event, edge, side, fixed) {
  if (!editingDeadlines) return;
  closeDependencyPreview();
  const candidates = new Map();
  for (const [key, node] of graphNodes()) {
    if (node === edge[side] || !node.getClientRects().length || !acceptsEndpoint(edge, side, node)) continue;
    candidates.set(node, key);
    if (key === 'start') candidates.set(scheduleCards.querySelector('.timeline-initial > div'), key);
  }
  const original = edge.original ?? edge;
  cancelDependencyDrag = graphView.dragDependency(event, fixed, arrowPaths.ownerSVGElement, scheduleViewport, candidates, key => {
    openAfterCancelling(() => {
      const id = dependencyKey(original);
      rememberGraphChange();
      const change = { ...dependencyMoves.get(id), [side]: key };
      if (change[side] === nodeKey(original[side])) delete change[side];
      if (Object.keys(change).length) dependencyMoves.set(id, change);
      else dependencyMoves.delete(id);
      applyDependencyMoves();
    });
  });
}

function movedSourceReference(edge) {
  if (edge.source === edge.original.source) return edge.reference ?? edge.relation.anchor;
  if (edge.source.dataset.itemGroup !== undefined) return { group: edge.source.dataset.itemGroup };
  return edge.source.dataset.deadlineId ?? edge.source.dataset.anchorKey ?? 'start_of_year';
}

function boundSource(edge) {
  const definition = edge.source.dataset.virtualDefinition;
  return definition ? { baseDate: JSON.parse(definition) } : { anchor: movedSourceReference(edge) };
}

function scheduleFromArrow(edge) {
  const rule = structuredClone(sessionPathValue(config, edge.edit.path));
  if (edge.source === edge.original.source) return rule;
  const definition = edge.source.dataset.virtualDefinition;
  for (const key of ['anchor', 'baseDate', 'month', 'day']) delete rule[key];
  if (definition) rule.baseDate = JSON.parse(definition);
  else rule.anchor = movedSourceReference(edge);
  if (edge.relation.type === 'offset') rule.kind = 'offset';
  if (edge.relation.type === 'same_day') {
    if (['month_start', 'month_end'].includes(rule.kind) && ['month_start', 'month_end'].includes(rule.baseDate?.kind)
        && Object.keys(rule.baseDate).every(key => key === 'kind' || key === 'month')) {
      Object.assign(rule, rule.baseDate);
      delete rule.baseDate;
      return rule;
    }
    rule.kind = definition ? 'same_day' : 'offset';
    if (!definition) rule.days = 0;
  }
  return rule;
}

function writeIncomingEdges(plan, node, edges, originalEdges) {
  const dates = edges.filter(edge => edge.edit.kind !== 'satisfies');
  const weekdays = edges.filter(edge => edge.edit.kind === 'satisfies');
  const originalDates = originalEdges.filter(edge => edge.edit.kind !== 'satisfies');
  const datesChanged = dates.length !== originalDates.length ||
    dates.some(edge => edge.target !== edge.original.target || edge.source !== edge.original.source);
  if ((!dates.length && originalDates.length) || weekdays.length > 1) return false;
  const id = node.dataset.anchorKey;
  if (id && datesChanged && dates.length) {
    if (dates.length !== 1) return false;
    const [edge] = dates;
    const owner = sessionPathValue(config, edge.edit.path);
    const anchor = plan.anchors[id];
    if (!anchor) return false;
    for (const key of ['defaultDate','defaultDateRelation','dependency']) {
      if (owner[key] === undefined) delete anchor[key];
      else anchor[key] = structuredClone(owner[key]);
    }
    if (edge.source !== edge.original.source) {
      const date = JSON.parse(edge.source.dataset.virtualDefinition);
      if (edge.edit.kind === 'relative') anchor.dependency.source = date;
      else setVirtualDate(plan, { paths: [['anchors', id, 'defaultDate']] }, date);
    }
  }
  if (!node.dataset.deadlineId) return true;
  const index = Number(node.dataset.itemIndex);
  const original = config.items[index].schedule;
  let rule = structuredClone(original);
  if (!id && datesChanged && dates.length && dates.every(edge => edge.edit.kind === 'bound')) {
    const after = dates[0].relation.after;
    if ((!after && dates.length > 1) || dates.some(edge => edge.relation.after !== after)) return false;
    if (dates.every(edge => edge.target === edge.original.target) && originalDates.every(edge => edge.edit.kind === 'bound')) {
      for (const edge of dates.filter(edge => edge.source !== edge.original.source)) {
        const source = boundSource(edge);
        const previous = after ? rule.after?.[edge.edit.index] : rule.before;
        if (previous === undefined && source.anchor) rule.anchor = source.anchor;
        else if (previous === undefined) {
          delete rule.anchor;
          const ref = { ...source };
          for (const key of ['offsetDays', 'offsetMonths']) {
            if (rule[key] !== undefined) ref[key] = rule[key];
            delete rule[key];
          }
          if (after) rule.after = [ref];
          else rule.before = ref;
        } else if (typeof previous === 'object') {
          delete previous.baseDate;
          delete previous.anchor;
          Object.assign(previous, source);
        } else {
          const ref = typeof source.anchor === 'string' ? source.anchor : source;
          if (after) rule.after[edge.edit.index] = ref;
          else rule.before = ref;
        }
      }
      if (after && rule.after && dates.length < originalDates.length) {
        rule.after = dates.map(edge => rule.after[edge.edit.index]);
      }
    } else {
      rule = { kind: after ? 'next_weekday' : 'previous_weekday' };
      const refs = dates.map(edge => {
        const rel = edge.relation;
        return { ...boundSource(edge), inclusive: rel.inclusive,
          [rel.unit === 'month' ? 'offsetMonths' : 'offsetDays']: rel.amount };
      });
      if (after) rule.after = refs;
      else rule.before = refs[0];
    }
  } else if (!id && datesChanged && dates.length) {
    if (dates.length !== 1) return false;
    rule = scheduleFromArrow(dates[0]);
  }
  // Calendar and weekday constraints belong to the recipient, independently of the date edge.
  delete rule.constraints;
  const oldWeekday = originalEdges.find(edge => edge.edit.kind === 'satisfies');
  const constraints = (original.constraints ?? []).filter(ref => ref !== oldWeekday?.relation.source);
  if (oldWeekday && weekdays[0]?.source.dataset.constraintId !== oldWeekday.relation.source) {
    const { weekday, ...rest } = plan.constraints[oldWeekday.relation.source];
    if (rest.schedule) {
      const replacement = constraintReference(plan, oldWeekday.relation.source + '_without_weekday', rest);
      constraints.splice(original.constraints.indexOf(oldWeekday.relation.source), 0, replacement);
    }
  }
  if (weekdays.length) {
    const index = oldWeekday ? original.constraints.indexOf(oldWeekday.relation.source) : 0;
    constraints.splice(index, 0, weekdays[0].source.dataset.constraintId);
    delete rule.weekday;
  } else if (original.weekday !== undefined && rule.kind !== 'course') rule.weekday = original.weekday;
  if (constraints.length) rule.constraints = constraints;
  plan.items[index].schedule = rule;
  return true;
}

function syncRemovedCards() {
  const indices = new Map(config.items.map((item, index) => [item.id, index]));
  for (const card of scheduleCards.querySelectorAll('[data-item-index]')) {
    const id = card.dataset.deadlineId;
    if (indices.has(id)) card.dataset.itemIndex = indices.get(id);
    else {
      wheel.querySelector(`[data-deadline-id="${CSS.escape(id)}"]`)?.remove();
      card.remove();
    }
  }
  for (const group of scheduleCards.querySelectorAll('.deadline-group')) {
    if (!Object.hasOwn(config.groups ?? {}, group.dataset.group)) group.remove();
  }
}

function applyDependencyMoves() {
  invalidDependencyNodes.clear();
  scheduleCards.querySelectorAll('.invalid-dependency').forEach(node => node.classList.remove('invalid-dependency'));
  if (!pendingGraphChanges()) {
    graphHistory.length = 0;
    paintTimeline();
    return;
  }
  const all = projectedEdges();
  const projected = all.filter(edge => !edge.removed);
  const changed = all.filter(edge => edge.removed || edge.source !== edge.original.source || edge.target !== edge.original.target);
  const affected = new Set(changed.flatMap(edge => [edge.target, edge.original.target]));
  const next = structuredClone(authoredConfig);
  const invalid = new Set();
  const changedKeys = new Set(changed.map(edge => dependencyKey(edge.original)));
  let canApply = [...dependencyMoves.keys()].every(key => changedKeys.has(key)) && !removedNodes.has('start');
  for (const node of affected) {
    if (removedNodes.has(nodeKey(node))) continue;
    const incoming = projected.filter(edge => edge.target === node);
    if (!writeIncomingEdges(next, node, incoming, timelineEdges.filter(edge => edge.target === node))) invalid.add(node);
  }
  // Pinned dates can mask a cycle in the occurrence resolver. Check the arrows themselves.
  for (const node of affected) {
    const seen = new Set();
    function reaches(start) {
      if (seen.has(start)) return false;
      seen.add(start);
      return projected.some(edge => edge.source === start && (edge.target === node || reaches(edge.target)));
    }
    if (reaches(node)) invalid.add(node);
  }
  if (canApply && !invalid.size) {
    try {
      if (removedNodes.size) graphView.applyRemovedNodes(next, removedNodes, window.scheduleEngine.effectiveItem);
      validateSessionConfiguration(effectiveConfiguration(next));
    } catch {
      canApply = false;
      for (const node of affected) invalid.add(node);
    }
  }
  if (canApply && !invalid.size) {
    for (const { original, source, removed } of changed) {
      const previous = original.source;
      const key = previous.dataset.virtualKey;
      if (key && (removed || source !== previous) && !removedNodes.has(nodeKey(previous))) {
        detachedVirtualDates.set(key, previous.dataset.anchorKey ? { anchor: previous.dataset.anchorKey }
          : { definition: JSON.parse(previous.dataset.virtualDefinition) });
      }
    }
    authoredConfig = next;
    config = effectiveConfiguration(next);
    for (const node of removedNodes.values()) {
      if (node.virtualKey) detachedVirtualDates.delete(node.virtualKey);
    }
    if (removedNodes.size) syncRemovedCards();
    removedNodes.clear();
    dependencyMoves.clear();
    graphHistory.length = 0;
    for (const card of scheduleCards.querySelectorAll('[data-item-index]')) {
      card.querySelector('.card-weekday')?.remove();
      appendWeekdayConstraint(card, config.items[Number(card.dataset.itemIndex)].schedule);
    }
    paintTimeline();
    return;
  }
  // Downstream dates also remain at their last calculated position until repair.
  for (const node of invalid) {
    invalidDependencyNodes.add(nodeKey(node));
    for (const edge of projected) if (edge.source === node) invalid.add(edge.target);
  }
  updateDependencyDraftActions();
  drawDependencyArrows();
}

function updateDependencyDraftActions() {
  const invalid = pendingGraphChanges();
  graphWarning.textContent = t(removedNodes.has('start') ? 'The initial object is required. Undo its removal before saving.' : 'Repair the highlighted dependencies before saving.');
  graphWarning.hidden = !invalid;
  undoDependency.hidden = !invalid || !editingDeadlines;
  panel.querySelector('.finish-graph-edit').disabled = invalid;
  panel.querySelector('.export-plan').disabled = invalid;
  for (const [key, node] of graphNodes()) node.classList.toggle('invalid-dependency', invalidDependencyNodes.has(key));
  const nodes = scheduleCards.querySelectorAll('[data-item-index], [data-item-group], [data-virtual-date], .timeline-calendar, .timeline-weekday, .timeline-start, .timeline-initial');
  for (const node of nodes) node.classList.toggle('graph-removed', removedNodes.has(nodeKey(node)));
}
undoDependency.onclick = () => {
  const previous = graphHistory.pop();
  if (!previous) return;
  dependencyMoves.clear();
  for (const [key, value] of previous.moves) dependencyMoves.set(key, value);
  removedNodes.clear();
  for (const [key, value] of previous.nodes) removedNodes.set(key, value);
  applyDependencyMoves();
};

function drawDependencyArrows() {
  const refocusCaption = previewCaption && previewCaption === document.activeElement;
  let replacementCaption;
  const origin = scheduleCards.getBoundingClientRect();
  const paths = document.createDocumentFragment();
  const draggablePaths = [];
  const removeControls = [];
  const focused = arrowPaths.contains(document.activeElement) && document.activeElement.dataset.cardEditKey;
  for (const edge of (pendingGraphChanges() ? projectedEdges().filter(edge => !edge.removed) : timelineEdges)) {
    const { source, target, relation, sourceTitle, description } = edge;
    const { type } = relation;
    const labelText = dependencyLabel(relation, sourceTitle);
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) continue;
    const left = Math.max(from.left, to.left);
    const right = Math.min(from.right, to.right);
    let route;
    let labelX, labelY;
    let textAnchor = right <= left ? 'middle' : 'start';
    if (type === 'satisfies') {
      const x = Math.min(to.right - 25, from.right - 2) - origin.left;
      route = `M ${x} ${from.bottom - origin.top} V ${to.top - origin.top}`;
      labelX = x - 4;
      labelY = to.top - origin.top - 8;
      textAnchor = 'end';
    } else if (source.classList.contains('timeline-start')) {
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
    if (type) group.dataset.relation = type;
    if (description) {
      const title = document.createElementNS(path.namespaceURI, 'title');
      title.textContent = description;
      path.append(title);
    }
    paths.append(group);
    group.append(path);
    if (editingDeadlines && graphView && edge.edit) draggablePaths.push([path, edge]);
    if (labelText) {
      const label = document.createElementNS(path.namespaceURI, 'text');
      label.setAttribute('x', labelX);
      label.setAttribute('y', labelY);
      label.setAttribute('text-anchor', textAnchor);
      const caption = document.createElementNS(path.namespaceURI, 'tspan');
      caption.textContent = labelText;
      label.append(caption);
      const title = (sourceTitle ?? dependencyLabel(relation)) + ' → ' + target.querySelector('h2').textContent;
      if (edge.edit && !pendingGraphChanges()) {
        caption.classList.add('dependency-caption');
        if (edge === previewEdge) replacementCaption = caption;
        caption.setAttribute('tabindex', '0');
        caption.onpointerenter = event => { if (event.pointerType !== 'touch') showDependencyPreview(caption, edge, title); };
        caption.onfocus = () => showDependencyPreview(caption, edge, title);
        caption.onpointerleave = caption.onblur = leaveDependencyPreview;
      }
      label.setAttribute('aria-label', `${target.querySelector('h2').textContent} · ${labelText}`);
      if (editingDeadlines && edge.edit && !pendingGraphChanges()) {
        const pencil = document.createElementNS(path.namespaceURI, 'tspan');
        const key = JSON.stringify(['edge', ...edge.edit.path, edge.edit.kind, edge.edit.index ?? null, target.dataset.deadlineId ?? null]);
        pencil.setAttribute('dx', '0.3em');
        setControlIcon(pencil, 'edit');
        label.append(pencil);
        pencil.classList.add('edit-dependency');
        pencil.dataset.cardEditKey = key;
        pencil.setAttribute('tabindex', '0');
        pencil.setAttribute('role', 'button');
        pencil.setAttribute('aria-label', t('Edit {title}', { title }));
        pencil.setAttribute('aria-controls', cardEditor.id);
        pencil.onclick = () => {
          closeDependencyPreview();
          openAfterCancelling(() => openCardEditor(key, title, [{ key: 'dependency', paths: [edge.edit.path], edge }]));
        };
        pencil.onkeydown = event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          pencil.onclick();
        };
      }
      group.append(label);
      if (editingDeadlines && edge.edit) {
        const button = graphRemoveButton(title, () => {
          const id = dependencyKey(edge.original ?? edge);
          rememberGraphChange();
          dependencyMoves.set(id, { ...dependencyMoves.get(id), removed: true });
          applyDependencyMoves();
        }, true);
        // Reserve space within the anchored text so the icon follows its final glyph.
        const space = document.createElementNS(path.namespaceURI, 'tspan');
        space.classList.add('dependency-remove-space');
        space.textContent = '\u2003';
        space.setAttribute('dx', '0.3em');
        label.append(space);
        group.append(button);
        removeControls.push({ space, button, labelY });
      }
    }
  }
  arrowPaths.replaceChildren(paths);
  for (const { space, button, labelY } of removeControls) {
    const { x, width } = space.getBBox();
    button.setAttribute('x', x);
    button.setAttribute('y', labelY - width / 2);
    button.setAttribute('width', width);
    button.setAttribute('height', width);
  }
  for (const [path, edge] of draggablePaths) {
    graphView.addDependencyHandles(path, (event, side, fixed) => startDependencyDrag(event, edge, side, fixed));
  }
  if (replacementCaption) {
    previewCaption = replacementCaption;
    previewCaption.setAttribute('aria-describedby', dependencyPreview.id);
    positionDependencyPreview(previewCaption);
    if (refocusCaption) previewCaption.focus({ preventScroll: true });
  } else if (previewCaption) {
    closeDependencyPreview();
  }
  if (focused) arrowPaths.querySelector(`[data-card-edit-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function dependencyLabel(relation, sourceTitle) {
  const bound = window.scheduleEngine.comparisonBound(relation.type);
  if (bound) return comparisonLabel(bound, relation, sourceTitle);
  let text;
  switch (relation.type) {
    case 'satisfies': return t('Satisfies');
    case 'same_day': text = t('Same day'); break;
    case 'default_date': text = t('Default date'); break;
    case 'nth_full_weekday': text = t('Full week {n}', { n: relation.occurrence }); break;
    case 'nth_weekday': text = t('Occurrence {n}', { n: relation.occurrence }); break;
    case 'last_weekday': text = t('Last occurrence on or before'); break;
    case 'offset': {
      const interval = new Intl.NumberFormat(locale, {
        style: 'unit', unit: relation.weeks !== undefined ? 'week' : 'day', unitDisplay: 'long',
      }).format(Math.abs(relation.weeks ?? relation.days));
      if (relation.days === 0) {
        text = t(relation.whole ? 'First week start on or after' : 'Same day');
      } else {
        text = t(relation.days < 0 ? '{interval} before' : '{interval} after', { interval });
        if (relation.whole) text += ' · ' + t('Whole weeks');
      }
      break;
    }
    case 'course':
      text = t(relation.direction === 'backward' ? 'Schedule backwards from' : 'Schedule forwards from');
      break;
    default: throw new Error(`Unknown dependency relation: ${relation.type}`);
  }
  return `${text} · ${sourceTitle}`;
}

function comparisonLabel({ after, inclusive }, { amount, unit }, title) {
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
  const yearStart = { card: startMarker, title: startTitle, reference: 'start_of_year' };

  function virtualDate(key, date, title, datePath) {
    if (virtuals.has(key)) {
      if (datePath) virtuals.get(key).datePaths.set(JSON.stringify(datePath), datePath);
      return virtuals.get(key);
    }
    const card = document.createElement('article');
    card.className = 'deadline-card';
    card.dataset.virtualKey = key;
    card.dataset.virtualDate = inputValue(date);
    card.innerHTML = '<span class="card-date"></span><div class="card-content"><h2></h2></div>';
    card.querySelector('.card-date').textContent = fmt(date);
    card.querySelector('h2').textContent = title;
    scheduleCards.append(card);
    const datePaths = new Map();
    if (datePath) datePaths.set(JSON.stringify(datePath), datePath);
    const entry = { card, date, title, reference: key, datePaths };
    virtuals.set(key, entry);
    entries.push(entry);
    return entry;
  }

  function calendarDateNode(kind, date, definition, datePath) {
    const key = ['date', kind, definition.month, definition.day, definition.days, definition.weeks, Boolean(definition.whole)].join(':');
    const node = virtualDate(key, date, virtualDateLabel(definition), datePath);
    node.definition = definition;
    node.card.dataset.virtualDefinition = JSON.stringify(definition);
    node.card.dataset.boundaryKind = kind;
    return node;
  }

  function boundarySource(boundary, datePath) {
    const { kind, date } = boundary;
    const rule = sessionPathValue(authoredConfig, datePath);
    if (!rule.baseDate && kind === 'month_start' && rule.kind !== 'month_start' && date.getMonth() === 0 && +date === +startDate) {
      return { ...yearStart, boundaryKind: kind };
    }
    const definition = boundary.definition ?? { kind, month: date.getMonth() + 1 };
    const node = calendarDateNode(kind, date, definition, datePath);
    return { ...node, boundaryKind: kind, nestedDate: Boolean(rule.baseDate) };
  }

  function fixedSource(date, path) {
    const { month, day } = sessionPathValue(authoredConfig, path);
    return boundarySource({ kind: 'fixed', date, definition: { kind: 'fixed', month, day } }, path);
  }

  function relativeSource(anchor, id) {
    const definition = anchor.dependency.source;
    const date = window.scheduleEngine.resolveVirtualDate(definition, year, config.display.locale);
    return boundarySource({ kind: definition.kind ?? 'fixed', date, definition }, ['anchors', id, 'dependency', 'source']);
  }

  function referenceSource(reference) {
    if (typeof reference?.group === 'string') {
      const card = scheduleCards.querySelector(`.timeline-dated-group[data-item-group="${CSS.escape(reference.group)}"]`);
      if (card) return { card, reference, title: referenceTitle(reference) };
      return;
    }
    const [id, endpoint] = reference.split('.');
    const card = cards.get(id) ?? cards.get(anchorItems.get(id));
    if (card) {
      const title = card.querySelector('h2').textContent;
      if (!endpoint) return { card, title, reference };
      return { card, reference, title: t(endpoint === 'start' ? 'Start of {title}' : 'End of {title}', { title }) };
    }
    if (id === 'start_of_year') return yearStart;
    const anchor = anchors[id];
    if (!anchor || virtuals.has(id)) return virtuals.get(id);
    const target = virtualDate(id, resolveAnchorDate(anchor, year, anchor.date), anchor.title);
    target.card.dataset.anchorKey = id;
    const relation = window.scheduleEngine.anchorDateRelation(anchor);
    const boundary = window.scheduleEngine.calendarBoundary(anchor.defaultDate, year, config.display.locale);
    if (boundary || relation.type !== 'default_date') {
      const defaultDate = resolveAnchorDate(anchor, year);
      const path = ['anchors', id, 'defaultDate'];
      const relative = anchor.defaultDate.kind === 'relative';
      const source = relative ? relativeSource(anchor, id) : boundary ? boundarySource(boundary, path) : fixedSource(defaultDate, path);
      if (relative) {
        target.card.dataset.dateType = 'relative';
        target.card.dataset.dateTypeLabel = t('Relative date');
      }
      edges.push({ source: source.card, target: target.card, relation, sourceTitle: source.title, nestedDate: source.nestedDate,
        edit: { path: ['anchors', id], kind: relative ? 'relative' : 'anchor' } });
    }
    return target;
  }

  for (const [index, item] of config.items.entries()) {
    const rule = item.schedule;
    const rulePath = authoredConfig.items[index].schedule ? ['items', index, 'schedule'] : ['groups', item.group, 'defaults', 'schedule'];
    const target = cards.get(item.id);
    const itemPath = ['items', index, 'schedule'];
    const connect = (source, relation, description = item.rule?.trim() ? item.rule : source && dependencyLabel(relation, source.title), edit = { path: itemPath, kind: 'schedule' }) => {
      if (source) edges.push({ source: source.card, target, relation, boundaryKind: source.boundaryKind, nestedDate: source.nestedDate, reference: source.reference, sourceTitle: source.title, description, edit, ruleText: item.rule });
    };
    const boundary = window.scheduleEngine.calendarBoundary(rule, year, config.display.locale);
    if (boundary) {
      connect(boundarySource(boundary, rulePath), boundaryRelation(rule));
    } else if (rule.kind === 'anchor') {
      const anchor = anchors[rule.anchor];
      if (!anchor) {
        connect(referenceSource(rule.anchor), { type: 'same_day' });
        continue;
      }
      target.dataset.anchorKey = rule.anchor;
      const defaultBoundary = window.scheduleEngine.calendarBoundary(anchor.defaultDate, year, config.display.locale);
      const date = resolveAnchorDate(anchor, year);
      const source = anchor.defaultDate.kind === 'relative' ? relativeSource(anchor, rule.anchor) : rule.anchor === 'start_of_year' ? yearStart
        : defaultBoundary ? boundarySource(defaultBoundary, ['anchors', rule.anchor, 'defaultDate'])
        : fixedSource(date, ['anchors', rule.anchor, 'defaultDate']);
      connect(source, window.scheduleEngine.anchorDateRelation(anchor), undefined, { path: ['anchors', rule.anchor], kind: anchor.defaultDate.kind === 'relative' ? 'relative' : 'anchor' });
    } else if (rule.anchor && ['nth_weekday', 'nth_full_weekday', 'last_weekday'].includes(rule.kind)) {
      connect(referenceSource(rule.anchor), boundaryRelation(rule));
    } else if (rule.kind === 'offset') {
      connect(referenceSource(rule.anchor), window.scheduleEngine.offsetRelation(rule));
    } else if (rule.kind === 'course') {
      const date = rule.anchor ? null : new Date(year, rule.month - 1, rule.day);
      const source = rule.anchor ? referenceSource(rule.anchor) : fixedSource(date, rulePath);
      connect(source, { type: 'course', direction: rule.direction, weekday: rule.weekday, count: rule.count, skip: rule.skip });
    } else {
      for (const [index, dep] of window.scheduleEngine.weekdayDependencies(rule).entries()) {
        const source = dep.baseDate ? boundarySource({
          kind: dep.baseDate.kind ?? 'fixed', definition: dep.baseDate,
          date: window.scheduleEngine.resolveVirtualDate(dep.baseDate, year, config.display.locale),
        }, [...rulePath, ...(dep.after ? ['after', index] : ['before'])]) : referenceSource(dep.anchor);
        connect(source, dep, [item.rule?.trim() || (source && dependencyLabel(dep, source.title)), t('Choose the valid date closest to the limiting bound.')].filter(Boolean).join('\n'), { path: itemPath, kind: 'bound', index });
      }
    }
  }
  // Detached dates remain drop targets in the draft. They own no plan field.
  for (const key of virtuals.keys()) detachedVirtualDates.delete(key);
  for (const { anchor, definition } of detachedVirtualDates.values()) {
    if (anchor) referenceSource(anchor);
    else {
      const date = window.scheduleEngine.resolveVirtualDate(definition, year, config.display.locale);
      calendarDateNode(definition.kind ?? 'fixed', date, definition);
    }
  }
  return { entries, edges, virtuals };
}

function scheduleTitle(schedule) {
  return schedule.title ?? calendarSources[schedule.calendar]?.title ?? schedule.calendar;
}

function paintScheduleConstraints(card, ruleSource, occurrence, visibleCalendars) {
  card.querySelectorAll('.schedule-constraint').forEach(line => line.remove());
  for (const rule of window.scheduleEngine.calendarConstraints(config, ruleSource)) {
    const id = rule.schedule;
    const title = scheduleTitle(config.schedules[id]) ?? id;
    const conflict = occurrence.conflictingConstraints?.includes(rule.id) ?? false;
    const line = document.createElement('p');
    line.className = 'rule-line schedule-constraint';
    line.dataset.scheduleKey = id;
    line.dataset.calendarConstraintId = rule.id;
    line.dataset.membership = rule.membership;
    line.classList.toggle('has-conflict', conflict);
    const label = membershipLabel(rule.membership) + ' · ' + title;
    line.textContent = conflict ? label + ' · ' + t('Date conflicts with {schedule}', { schedule: title }) : label;
    card.querySelector('h2').parentElement.append(line);
    if (!card.classList.contains('is-layer-hidden')) visibleCalendars.add(id);
  }
}

function calendarVisibilityControl(hidden) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  function setState(state) {
    checkbox.value = state;
    checkbox.indeterminate = state === 'default';
    checkbox.checked = state === 'true';
    checkbox.title = t({ default: 'Default', true: 'True', false: 'False' }[state]);
  }
  setState(String(hidden ?? 'default'));
  checkbox.addEventListener('change', () => {
    const next = { default: 'true', true: 'false', false: 'default' };
    setState(next[checkbox.value]);
  });
  return checkbox;
}

function setCalendarVisibility(schedule, value) {
  if (value === 'default') delete schedule.hidden;
  else schedule.hidden = value === 'true';
}

function paintCalendarRows(directlyUsed, first, last) {
  const schedules = config.schedules ?? {};
  const all = panel.querySelector('.show-all-schedules input');
  all.parentElement.hidden = !Object.keys(schedules).length;
  let row = 3; // The initial object and month headings occupy the first two rows.
  const span = calendarDay(last) - calendarDay(first) + 1;
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  for (const [id, schedule] of Object.entries(schedules)) {
    const band = document.createElement('section');
    band.className = 'timeline-calendar';
    band.dataset.scheduleKey = id;
    band.style.gridColumn = `1 / span ${span}`;
    const hidden = typeof schedule.hidden === 'boolean' ? schedule.hidden : !directlyUsed.has(id);
    band.hidden = !all.checked && hidden;
    if (!band.hidden) band.style.gridRow = String(row++);
    band.setAttribute('aria-label', scheduleTitle(schedule));
    const title = document.createElement('strong');
    title.textContent = scheduleTitle(schedule);
    if (schedule.calendar) {
      band.dataset.calendarRef = schedule.calendar;
      title.title = schedule.calendar;
    }
    if (schedule.includes?.length) {
      const detail = document.createElement('small');
      schedule.includes.forEach((key, index) => {
        const name = document.createElement('span');
        name.dataset.sourceKey = key;
        name.textContent = scheduleTitle(config.schedules[key]);
        detail.append(index ? ' + ' : ' · ', name);
      });
      title.append(detail);
    }
    const hide = document.createElement('label');
    hide.className = 'calendar-visibility';
    const visibility = calendarVisibilityControl(schedule.hidden);
    visibility.disabled = !editingDeadlines;
    visibility.setAttribute('aria-label', t('Hide {schedule}', { schedule: scheduleTitle(schedule) }));
    visibility.onchange = () => {
      setCalendarVisibility(schedule, visibility.value);
      paintTimeline();
      const updatedRow = scheduleCards.querySelector(`.timeline-calendar[data-schedule-key="${CSS.escape(id)}"]`);
      (updatedRow.hidden ? all : updatedRow.querySelector('.calendar-visibility input')).focus({ preventScroll: true });
    };
    hide.append(t('Hidden') + ' ', visibility);
    title.append(hide);
    band.append(title);
    scheduleCards.append(band);
    if (band.hidden) continue;
    let showsEstimates = false;
    for (let y = first.getFullYear(); y <= last.getFullYear(); y++) {
      const { occurrences, estimatedPeriods } = window.scheduleEngine.calendarYear(schedule, y, config.schedules, calendarSources);
      for (const period of estimatedPeriods) {
        const start = new Date(Math.max(+first, +period.start));
        const end = new Date(Math.min(+last, +period.end));
        if (end < start) continue;
        showsEstimates = true;
        const gap = document.createElement('span');
        gap.className = 'calendar-estimate-period';
        gap.title = t('We are missing calendar data for this period');
        gap.style.gridColumn = `${calendarDay(start) - calendarDay(first) + 1} / span ${calendarDay(end) - calendarDay(start) + 1}`;
        band.append(gap);
      }
      for (const { date, titles, estimatedTitles, estimated } of occurrences) {
        if (date < first || date > last) continue;
        const marker = document.createElement('time');
        marker.dateTime = inputValue(date);
        const dateLabel = fullDate.format(date);
        marker.dataset.certainty = estimated ? 'estimated' : 'known';
        const reasons = [...titles, ...estimatedTitles.map(title => t('Estimated · {title}', { title }))];
        if (estimated && !estimatedTitles.length) reasons.push(t('We are missing calendar data for this period'));
        marker.textContent = reasons.length
          ? [...reasons, dateLabel].join(' · ')
          : dateLabel.replace(/^./u, first => first.toLocaleUpperCase(locale));
        marker.title = marker.textContent;
        marker.style.gridColumn = String(calendarDay(date) - calendarDay(first) + 1);
        band.append(marker);
      }
    }
    if (showsEstimates) {
      const key = document.createElement('small');
      key.className = 'calendar-estimate-key';
      key.textContent = t('Estimated');
      title.append(key);
    }
  }
  return row;
}

function paintWeekdayDependencies(cards, row, span) {
  const nodes = new Map();
  for (const item of config.items) {
    const target = cards.get(item.id);
    if (target.classList.contains('is-layer-hidden')) continue;
    const dependency = window.scheduleEngine.weekdayDependency(config, item.schedule);
    if (!dependency) continue;
    const { source: id, weekday } = dependency;
    if (!nodes.has(id)) {
      const node = document.createElement('div');
      node.className = 'timeline-weekday';
      node.dataset.constraintId = id;
      node.style.gridColumn = `1 / span ${span}`;
      node.style.gridRow = String(row++);
      const select = document.createElement('select');
      select.disabled = !editingDeadlines;
      select.setAttribute('aria-label', t('Weekday · {weekday}', { weekday: weekdayName(weekday) }));
      for (let day = 0; day < 7; day++) select.add(new Option(weekdayName(day), String(day)));
      select.value = String(weekday);
      select.onchange = () => {
        config.constraints[id].weekday = Number(select.value);
        paintTimeline();
        scheduleCards.querySelector(`[data-constraint-id="${CSS.escape(id)}"] select`)?.focus({ preventScroll: true });
      };
      node.append(select);
      scheduleCards.append(node);
      nodes.set(id, node);
    }
    timelineEdges.push({ source: nodes.get(id), target, relation: dependency, edit: { path: ['items', Number(target.dataset.itemIndex), 'schedule'], kind: 'satisfies' },
      description: t('Weekday · {weekday}', { weekday: weekdayName(weekday) }) });
  }
  return row;
}

function groupFieldText(key, value) {
  if (key === 'kind' && value === 'deadline') return t('Deadline');
  if (key === 'status') {
    const label = { set: 'Set date', derived: 'Depends on anchor', anchor: 'Anchor date' }[value];
    return label ? t(label) : value;
  }
  return value;
}

function showGroupFields(container, values, keys) {
  container.replaceChildren();
  for (const key of keys) {
    if (values[key] === undefined) continue;
    const field = document.createElement('span');
    field.dataset.groupField = key;
    field.dataset.value = values[key];
    field.textContent = groupFieldText(key, values[key]);
    container.append(field);
  }
}

function placeTimelineGroups(cards) {
  const groups = new Map([...scheduleCards.querySelectorAll('.timeline-item-group')]
    .map(node => [node.dataset.itemGroup, node]));
  const datedEntries = new Map();
  for (const item of config.items) {
    const card = cards.get(item.id);
    const group = config.groups?.[item.group];
    const date = group?.date && window.scheduleEngine.groupDate(config, item.group, year);
    let parent = scheduleCards;
    if (group) {
      if (!groups.has(item.group)) {
        const node = document.createElement('div');
        node.className = 'timeline-item-group';
        node.dataset.itemGroup = item.group;
        node.setAttribute('role', 'group');
        scheduleCards.append(node);
        groups.set(item.group, node);
      }
      parent = groups.get(item.group);
      parent.setAttribute('aria-label', group.title);
      parent.classList.toggle('timeline-dated-group', Boolean(date));
      parent.classList.toggle('deadline-card', Boolean(date));
      if (date && !datedEntries.has(parent)) {
        const defaults = group.defaults ?? {};
        setCardHeading(parent, group.title, config.layers[layer(defaults)], defaults.rule?.trim() ? defaults.rule : generatedGroupRule(item.group));
        let toggle = parent.querySelector(':scope > [data-group-toggle]');
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.dataset.groupToggle = item.group;
          setControlIcon(toggle, 'arrow');
          parent.querySelector(':scope > .card-content').after(toggle);
        }
        toggle.setAttribute('aria-label', group.title);
        toggle.setAttribute('aria-expanded', String(graphGroupExpansion.get(item.group) ?? !group.collapsed));
        toggle.dataset.configuredCollapsed = String(Boolean(group.collapsed));
        const time = parent.querySelector(':scope > .card-date');
        time.dateTime = inputValue(date);
        time.textContent = fmt(date);
        parent.dataset.dateType = 'fixed';
        parent.dataset.dateTypeLabel = t('Fixed date');
        for (const status of ['set', 'derived', 'anchor']) {
          parent.classList.toggle('is-' + status, defaults.status === status);
        }
        datedEntries.set(parent, { card: parent, date });
      }
    }
    if (card.parentElement !== parent) parent.append(card);
  }
  for (const group of groups.values()) {
    if (!group.querySelector('[data-item-index]')) group.remove();
    group.hidden = !group.querySelector('[data-item-index]:not(.is-layer-hidden)');
  }
  return [...datedEntries.values()];
}

function paintTimeline() {
  const expandedNodes = new Set([...panel.querySelectorAll('.graph-config-node[open]')].map(node => node.dataset.nodePath));
  panel.querySelectorAll('.graph-config-node').forEach(node => node.remove());
  const resolved = resolve(year);
  const start = window.scheduleEngine.scheduleAnchors(config).start_of_year;
  const startField = panel.querySelector('[data-anchor-id="start_of_year"]');
  const startDate = startField?.value
    ? date(startField.value)
    : resolveAnchorDate(start, year);
  const startMarker = scheduleCards.querySelector('.timeline-start');
  const startTitle = config.anchors.start_of_year?.title || t('Initial object');
  startMarker.dataset.virtualDateValue = inputValue(startDate);
  const initial = scheduleCards.querySelector('.timeline-initial');
  initial.querySelector('strong').textContent = startTitle;
  const yearLabel = initial.querySelector('.initial-year');
  const startYear = config.initialYear ?? 'current';
  yearLabel.dataset.initialYear = startYear;
  yearLabel.textContent = t('Initial year · {year}', { year: startYear === 'current' ? t('Current year') : startYear });
  startMarker.title = `${startTitle} · ${fmt(startDate)} · ${yearLabel.textContent}`;
  startMarker.setAttribute('aria-label', startMarker.title);

  const cards = new Map([...scheduleCards.querySelectorAll('[data-deadline-id]')]
    .map(card => [card.dataset.deadlineId, card]));
  clearVirtualDates();
  const groups = placeTimelineGroups(cards);
  const { entries, edges, virtuals } = timelineDependencies(cards, startMarker, startDate, startTitle);
  entries.push(...groups);
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
    const field = card.querySelector('[data-item-override], [data-anchor-id]');
    if (field) field.value = inputValue(occurrence.date);
    card.querySelector('.card-date').textContent = fmt(occurrence.date);
    card.dataset.timelineDate = inputValue(occurrence.date);
    const showRuleOnCard = item.rule?.trim() || !rulesOnArrows.has(card);
    card.querySelector('.rule-line').textContent = showRuleOnCard ? occurrence.rule : '';
    card.classList.remove('is-grace', 'is-group-collapsed');
    const datedGroup = card.closest('.timeline-dated-group');
    card.hidden = Boolean(datedGroup && !(graphGroupExpansion.get(item.group) ?? !config.groups[item.group].collapsed));
    if (datedGroup) {
      const defaults = config.groups[item.group].defaults ?? {};
      card.toggleAttribute('data-inherits-date', item.schedule.kind === 'group' && !item.date);
      card.toggleAttribute('data-inherits-layer', defaults.layer !== undefined && layer(item) === layer(defaults));
      card.toggleAttribute('data-inherits-rule', defaults.rule !== undefined && item.rule === defaults.rule);
      const keys = ['kind', 'status'].filter(key => defaults[key] !== undefined && item[key] !== defaults[key]);
      const overrides = document.createElement('div');
      overrides.className = 'timeline-member-overrides';
      card.querySelector('.timeline-member-overrides')?.remove();
      if (keys.length) {
        showGroupFields(overrides, item, keys);
        card.querySelector('h2').after(overrides);
      }
      card.style.removeProperty('order');
      card.style.removeProperty('grid-column');
      card.style.removeProperty('grid-row');
    } else {
      entries.push({ card, date: occurrence.date });
    }
  }
  entries.sort((a, b) => a.date - b.date);
  // Relative rules can put a deadline outside the selected calendar year.
  const first = new Date(Math.min(+new Date(year, 0, 1), +(entries[0]?.date ?? startDate)));
  first.setDate(1);
  const last = new Date(Math.max(+new Date(year, 11, 31), +(entries.at(-1)?.date ?? startDate)));
  startMarker.style.gridColumnStart = calendarDay(startDate) - calendarDay(first) + 1;
  initial.style.gridColumn = `1 / span ${calendarDay(last) - calendarDay(first) + timelineCardColumns}`;
  initial.firstElementChild.style.gridColumn = `${startMarker.style.gridColumnStart} / span ${timelineCardColumns}`;
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
  const weekdayRow = paintCalendarRows(visibleCalendars, first, last);
  const firstCardRow = paintWeekdayDependencies(cards, weekdayRow, calendarDay(last) - calendarDay(first) + 1);
  scheduleCards.querySelectorAll('.edit-card, .remove-card').forEach(button => button.remove());
  if (editingDeadlines && graphView) paintCardEditButtons(cards, virtuals, resolved);
  compactDependencyRows(entries, timelineEdges, firstCardRow);
  updateStatusStyles();
  if (graphView) paintConfigurationNodes(cards, expandedNodes);
  updateDependencyDraftActions();
  if (timelineEdges.length) {
    for (const { card } of entries) arrowLayoutObserver.observe(card);
    arrowLayoutObserver.observe(scheduleCards);
    drawDependencyArrows();
  }
}

const cardEditor = document.querySelector('#card-editor');
const cardForm = cardEditor.querySelector('form');

function cardDateFields(paths) {
  const fields = [{ key: 'month', label: 'Month', paths: paths.map(path => [...path, 'month']) }];
  fields.push({ key: 'day', label: 'Day', paths: paths.map(path => [...path, 'day']) });
  return fields;
}

function paintCardEditButtons(cards, virtuals, resolved) {
  function removeButton(node, host, title) {
    const button = graphRemoveButton(title, () => removeGraphNode(node));
    button.classList.add('remove-card');
    host.prepend(button);
  }
  function pencil(host, title, fields, rulePaths, generated, inheritedRule = '') {
    const ruleValues = rulePaths.map(path => path.reduce((value, key) => value?.[key], authoredConfig) ?? inheritedRule);
    fields.push({
      key: 'rule', label: 'Rule', paths: rulePaths,
      value: ruleValues.every(value => value === ruleValues[0]) && ruleValues[0]?.trim() ? ruleValues[0] : '',
      placeholder: generated, inheritedRule,
    });
    const button = document.createElement('button');
    button.className = 'edit-card';
    button.type = 'button';
    setControlIcon(button, 'edit');
    button.title = t('Edit {title}', { title });
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-controls', cardEditor.id);
    button.dataset.cardEditKey = JSON.stringify(fields[0].paths[0]);
    button.onclick = () => openAfterCancelling(() => openCardEditor(button.dataset.cardEditKey, title, fields));
    host.prepend(button);
  }
  const titleField = (path, value) => ({ key: 'title', label: 'Title', paths: [[...path, 'title']], value });
  const calendars = Object.entries(config.schedules ?? {}).map(([id, schedule]) => ({
    id, label: scheduleTitle(schedule) ?? id,
  }));
  for (const [index, item] of authoredConfig.items.entries()) {
    const host = cards.get(item.id).querySelector('.card-content');
    removeButton(cards.get(item.id), host, config.items[index].title);
    const path = ['items', index];
    const fields = [titleField(path, config.items[index].title)];
    if (item.schedule?.kind === 'fixed') fields.push(...cardDateFields([[...path, 'schedule']]));
    const rule = config.items[index].schedule;
    if (calendars.length && rule.kind !== 'group' && window.scheduleEngine.isRelativeRule(rule)) {
      fields.push({ key: 'calendarRules', itemIndex: index, calendars, selected: window.scheduleEngine.calendarConstraints(config, rule) });
    }
    pencil(host, config.items[index].title, fields, [[...path, 'rule']],
      generatedScheduleRule(config.items[index], year, resolved[item.id]), config.groups?.[item.group]?.defaults?.rule);
  }
  for (const node of scheduleCards.querySelectorAll('.timeline-item-group')) {
    const id = node.dataset.itemGroup;
    const group = config.groups[id];
    removeButton(node, node.querySelector(':scope > .card-content') ?? node, group.title);
    const path = ['groups', id];
    const fields = [titleField(path, group.title)];
    if (group.date) fields.push(...cardDateFields([[...path, 'date']]));
    pencil(node.querySelector(':scope > .card-content') ?? node, group.title, fields, [[...path, 'defaults', 'rule']], generatedGroupRule(id));
  }
  for (const { card, title, datePaths, definition } of virtuals.values()) {
    removeButton(card, card.querySelector('h2').parentElement, title);
    const id = card.dataset.anchorKey;
    const paths = id ? [['anchors', id, 'defaultDate']] : [...datePaths.values()];
    if (!paths.length) continue;
    const anchorDate = id && config.anchors[id].defaultDate;
    const date = definition ?? anchorDate.baseDate ?? anchorDate;
    const relative = anchorDate?.kind === 'relative';
    const fields = relative ? [] : [{ key: 'virtualDate', paths, date, named: Boolean(id) }];
    if (id) fields.unshift(titleField(['anchors', id], title));
    const rulePaths = id ? [['anchors', id, 'rule']] : paths.map(path => [...path, 'rule']);
    pencil(card.querySelector('h2').parentElement, title, fields, rulePaths, relative ? t('Relative date') : virtualDateLabel(date));
  }
  const initial = scheduleCards.querySelector('.timeline-initial > div');
  removeButton(initial, initial, initial.querySelector('strong').textContent);
  pencil(initial, initial.querySelector('strong').textContent, [
    { key: 'initialYear', label: 'Initial year', paths: [['initialYear']], value: config.initialYear ?? 'current' },
  ], [['initialRule']], anchorRuleLabel(window.scheduleEngine.scheduleAnchors(config).start_of_year, year));
  for (const row of scheduleCards.querySelectorAll('.timeline-weekday')) {
    removeButton(row, row, row.querySelector('select').selectedOptions[0].textContent);
    pencil(row, row.querySelector('select').selectedOptions[0].textContent, [
      { key: 'weekday', label: 'Weekday', paths: [['constraints', row.dataset.constraintId, 'weekday']] },
    ], [['constraints', row.dataset.constraintId, 'rule']], row.querySelector('select').getAttribute('aria-label'));
  }
}

function membershipLabel(membership) {
  return membership === 'inside' ? '∈ ' + t('Must be in') : '∉ ' + t('Exclude');
}

function calendarConstraintList(calendars, selected) {
  const group = document.createElement('fieldset');
  group.className = 'card-constraints';
  const legend = document.createElement('legend');
  legend.textContent = t('Constraints');
  const rows = document.createElement('div');
  const add = document.createElement('button');
  add.type = 'button';
  labelAddButton(add, 'Add constraint');
  group.append(legend, rows, add);

  function refresh() {
    const selects = [...rows.querySelectorAll('[name=calendar]')];
    const used = new Set(selects.map(select => select.value));
    for (const select of selects) {
      for (const option of select.options) option.disabled = option.value !== select.value && used.has(option.value);
      select.closest('.override-picker').querySelector('button').setAttribute('aria-label',
        t('Remove constraint') + ' · ' + select.selectedOptions[0].textContent);
    }
    const available = calendars.find(calendar => !used.has(calendar.id));
    add.disabled = !available;
    add.onclick = () => {
      const select = appendRow({ schedule: available.id, membership: 'outside' });
      refresh();
      select.focus();
    };
  }

  function appendRow({ schedule, membership }) {
    const row = document.createElement('div');
    row.className = 'override-picker';
    const operator = document.createElement('select');
    operator.name = 'membership';
    operator.setAttribute('aria-label', t('Calendar membership'));
    for (const mode of ['outside', 'inside']) operator.add(new Option(membershipLabel(mode), mode));
    operator.value = membership;
    const select = document.createElement('select');
    select.name = 'calendar';
    select.setAttribute('aria-label', t('Calendar'));
    for (const calendar of calendars) select.add(new Option(calendar.label, calendar.id));
    select.value = schedule;
    select.onchange = refresh;
    const remove = document.createElement('button');
    remove.type = 'button';
    setControlIcon(remove, 'remove');
    remove.title = t('Remove constraint');
    remove.onclick = () => {
      const focus = row.nextElementSibling?.querySelector('select') ?? add;
      row.remove();
      refresh();
      focus.focus();
    };
    row.append(operator, select, remove);
    rows.append(row);
    return select;
  }
  selected.forEach(appendRow);
  refresh();
  return group;
}

// Calendar membership rules are named constraints. Reuse their definitions across cards.
function constraintReference(plan, base, definition) {
  const constraints = plan.constraints ??= {};
  const fields = Object.entries(definition);
  for (const [id, existing] of Object.entries(constraints)) {
    if (Object.keys(existing).length === fields.length && fields.every(([key, value]) => existing[key] === value)) return id;
  }
  let id = base;
  for (let suffix = 2; Object.hasOwn(constraints, id); suffix++) id = base + '_' + suffix;
  constraints[id] = definition;
  return id;
}

function setCardCalendarRules(plan, itemIndex, selected) {
  const item = plan.items[itemIndex];
  item.schedule ??= structuredClone(window.scheduleEngine.effectiveItem(plan, item).schedule);
  const oldRules = window.scheduleEngine.calendarConstraints(plan, item.schedule);
  const replacements = new Map();
  const remaining = [...selected];
  // Keep existing references and their non-calendar fields, including shared weekdays.
  for (const { id, schedule, membership } of oldRules) {
    const index = remaining.findIndex(rule => rule.schedule === schedule && rule.membership === membership);
    if (index >= 0) {
      remaining.splice(index, 1);
      continue;
    }
    const { no, membership: previousMode, schedule: previousCalendar, ...rest } = plan.constraints[id];
    replacements.set(id, Object.keys(rest).length ? constraintReference(plan, id + '_without_calendar', rest) : null);
  }
  const additions = remaining.map(({ schedule, membership }) => {
    if (membership === 'outside') {
      const legacy = Object.entries(plan.constraints ?? {}).find(([, value]) =>
        value.no === true && value.schedule === schedule && Object.keys(value).length === 2);
      if (legacy) return legacy[0];
    }
    return constraintReference(plan, membership + '_' + schedule, { membership, schedule });
  });
  const result = [];
  for (const id of item.schedule.constraints ?? []) {
    if (!replacements.has(id)) result.push(id);
    else {
      const replacement = replacements.get(id);
      if (replacement) result.push(replacement);
      if (additions.length) result.push(additions.shift());
    }
  }
  item.schedule.constraints = result.concat(additions);
}

function cardEditorField(container, name, caption, input) {
  const label = document.createElement('label');
  label.textContent = t(caption);
  input.name = name;
  label.append(input);
  container.append(label);
  return input;
}

function relativeDateFields(container, definition, sourceTitle) {
  const amount = cardEditorField(container, 'amount', 'Offset', document.createElement('input'));
  Object.assign(amount, { type: 'number', step: 1, required: true, value: definition.weeks ?? definition.days ?? 0 });
  const unit = cardEditorField(container, 'unit', 'Unit', document.createElement('select'));
  unit.add(new Option(t('Days'), 'days'));
  unit.add(new Option(t('Weeks'), 'weeks'));
  unit.value = definition.weeks !== undefined ? 'weeks' : 'days';
  const whole = cardEditorField(container, 'whole', 'Whole weeks', document.createElement('input'));
  whole.type = 'checkbox';
  whole.checked = definition.whole === true;
  const explanation = document.createElement('output');
  container.append(explanation);
  function read() {
    return { [unit.value]: amount.valueAsNumber, ...(unit.value === 'weeks' && whole.checked && { whole: true }) };
  }
  function preview() {
    whole.disabled = whole.closest('label').hidden = unit.value !== 'weeks';
    explanation.textContent = amount.validity.valid ? dependencyLabel(window.scheduleEngine.offsetRelation(read()), sourceTitle) : '';
  }
  amount.oninput = unit.oninput = whole.oninput = preview;
  preview();
  return read;
}

function virtualDateFields(container, definition) {
  const kind = cardEditorField(container, 'kind', 'Kind', document.createElement('select'));
  kind.add(new Option(t('Date'), 'date'));
  kind.add(new Option(t('Month'), 'month'));
  kind.value = ['fixed', 'offset_from_date'].includes(definition.kind ?? 'fixed') ? 'date' : 'month';
  function number(name, label, value, limits = {}) {
    return Object.assign(cardEditorField(container, name, label, document.createElement('input')), { type: 'number', required: true, value, ...limits });
  }
  const month = number('month', 'Month', definition.month, { min: 1, max: 12 });
  const day = number('day', 'Day', definition.day ?? 1, { min: 1 });
  const boundary = cardEditorField(container, 'boundary', 'Month boundary', document.createElement('select'));
  boundary.add(new Option(t('Start of month'), 'month_start'));
  boundary.add(new Option(t('End of month'), 'month_end'));
  boundary.value = definition.kind?.endsWith('month_end') ? 'month_end' : 'month_start';
  const days = number('days', 'Day offset', (definition.weeks !== undefined ? definition.weeks * 7 : definition.days) ?? 0);
  function read() {
    const isDate = kind.value === 'date';
    const date = { kind: isDate ? 'fixed' : boundary.value, month: month.valueAsNumber };
    if (isDate) date.day = day.valueAsNumber;
    if (days.valueAsNumber) {
      date.kind = isDate ? 'offset_from_date' : 'offset_from_' + boundary.value;
      date.days = days.valueAsNumber;
    }
    return date;
  }
  function refresh() {
    day.max = new Date(2000, month.valueAsNumber, 0).getDate();
    day.disabled = day.closest('label').hidden = kind.value !== 'date';
    boundary.disabled = boundary.closest('label').hidden = kind.value !== 'month';
    const rule = cardForm.elements.namedItem('rule');
    if (rule && [month, day, days].every(input => input.disabled || input.validity.valid)) rule.placeholder = virtualDateLabel(read());
  }
  for (const input of [kind, month, day, boundary, days]) input.oninput = refresh;
  refresh();
  return read;
}

function setVirtualDate(plan, field, date) {
  for (const path of field.paths) {
    const owner = sessionPathValue(plan, path);
    if (path.at(-1) === 'source' && path.at(-2) === 'dependency') {
      for (const key of ['month', 'day', 'weeks', 'whole', 'days']) delete owner[key];
      Object.assign(owner, date);
      continue;
    }
    if (owner.baseDate) {
      owner.baseDate = { ...owner.baseDate, ...date };
      delete owner.baseDate.weeks;
      delete owner.baseDate.whole;
      if (!Object.hasOwn(date, 'day')) delete owner.baseDate.day;
      if (!date.kind.startsWith('offset_')) delete owner.baseDate.days;
      continue;
    }
    const anchorDefault = path.at(-1) === 'defaultDate';
    const direct = field.named || (anchorDefault && !owner.kind?.startsWith('offset_') && !date.kind.startsWith('offset_'));
    if (direct) {
      delete owner.whole;
      delete owner.weeks;
      delete owner.day;
      delete owner.days;
      Object.assign(owner, date);
      continue;
    }
    // Keep the outgoing relation when replacing its source date.
    if (['month_start', 'month_end'].includes(owner.kind) || (anchorDefault && (owner.kind ?? 'fixed') === 'fixed')) {
      if (['month_start', 'month_end'].includes(date.kind)) {
        Object.assign(owner, date);
        continue;
      }
      owner.kind = 'same_day';
    } else if (owner.kind.startsWith('offset_from_')) {
      if (['month_start', 'month_end'].includes(date.kind)) {
        owner.kind = 'offset_from_' + date.kind;
        delete owner.day;
        owner.month = date.month;
        continue;
      }
      owner.kind = 'offset';
    } else if (date.kind === (owner.kind === 'course' ? 'fixed' : owner.kind === 'last_weekday' ? 'month_end' : 'month_start')) {
      owner.month = date.month;
      if (date.kind === 'fixed') owner.day = date.day;
      continue;
    }
    delete owner.month;
    delete owner.day;
    owner.baseDate = { ...date };
  }
}

function dependencyFields(container, edge) {
  const { relation, edit } = edge;
  const owner = sessionPathValue(config, edit.path);
  if (edit.kind === 'relative' || (edit.kind === 'schedule' && ['offset', 'same_day'].includes(relation.type))) {
    return relativeDateFields(container, relation, edge.sourceTitle);
  }
  const controls = [];
  function select(name, caption, options, value) {
    const input = cardEditorField(container, name, caption, document.createElement('select'));
    for (const [id, label] of options) input.add(new Option(label, id));
    input.value = value;
    controls.push(input);
    return input;
  }
  function number(name, caption, value, min) {
    const input = cardEditorField(container, name, caption, document.createElement('input'));
    Object.assign(input, { type: 'number', step: 1, required: true, value });
    if (min !== undefined) input.min = min;
    controls.push(input);
    return input;
  }
  const comparisons = { less_than: 'Before', less_or_equal: 'Before or on', greater_than: 'After', greater_or_equal: 'On or after' };
  if (edit.kind === 'bound') {
    const options = Object.entries(comparisons).filter(([type]) => window.scheduleEngine.comparisonBound(type).after === relation.after);
    select('comparison', 'Relation', options.map(([key, label]) => [key, t(label)]), relation.type);
    number('amount', 'Offset', relation.amount);
    select('unit', 'Unit', [['day', t('Days')], ['month', t('Months')]], relation.unit);
    const refs = new Set(Object.keys(window.scheduleEngine.scheduleAnchors(config)));
    if (typeof relation.anchor === 'string') refs.add(relation.anchor);
    for (const item of config.items) {
      if (item.id === edge.target.dataset.deadlineId) continue;
      refs.add(item.id);
      if (item.schedule.kind === 'course') { refs.add(item.id + '.start'); refs.add(item.id + '.end'); }
    }
    for (const card of scheduleCards.querySelectorAll('.timeline-dated-group')) refs.add({ group: card.dataset.itemGroup });
    const sources = [...refs].map(ref => [JSON.stringify(ref), referenceTitle(ref)]);
    if (relation.baseDate) sources.unshift(['', virtualDateLabel(relation.baseDate)]);
    select('source', 'Source', sources, JSON.stringify(relation.anchor) ?? '');
  } else if (edit.kind === 'anchor') {
    select('comparison', 'Relation', Object.entries({ default_date: 'Default date', ...comparisons }).map(([id, label]) => [id, t(label)]), relation.type);
  } else if (edit.kind === 'satisfies' || relation.type === 'course') {
    select('weekday', 'Weekday', Array.from({ length: 7 }, (_, i) => [i, weekdayName(i)]), relation.weekday);
    if (relation.type === 'course') {
      select('direction', 'Direction', [['forward', t('Schedule forwards from')], ['backward', t('Schedule backwards from')]], relation.direction);
      number('count', 'Course days', relation.count, 1);
    }
  } else {
    const mode = select('kind', 'Relation', [
      ['nth_full_weekday', t('Full week {n}', { n: 'n' })], ['nth_weekday', t('Occurrence {n}', { n: 'n' })],
      ['last_weekday', t('Last occurrence on or before')],
    ], relation.type);
    const occurrence = number('occurrence', 'Occurrence', owner.occurrence ?? 1, 1);
    mode.oninput = () => { occurrence.disabled = occurrence.closest('label').hidden = mode.value === 'last_weekday'; };
    mode.oninput();
  }
  return () => Object.fromEntries(controls.filter(input => !input.disabled).map(input => [
    input.name, input.type === 'number' ? input.valueAsNumber : input.value,
  ]));
}

function setDependency(plan, edge, value) {
  const { edit, relation } = edge;
  if (edit.path[0] === 'items') {
    const item = plan.items[edit.path[1]];
    item.schedule ??= structuredClone(window.scheduleEngine.effectiveItem(plan, item).schedule);
  } else if (!plan.anchors[edit.path[1]]) {
    plan.anchors[edit.path[1]] = window.scheduleEngine.scheduleAnchors(plan)[edit.path[1]];
  }
  const owner = sessionPathValue(plan, edit.path);
  if (edit.kind === 'relative' || (edit.kind === 'schedule' && ['offset', 'same_day'].includes(relation.type))) {
    const rule = edit.kind === 'relative' ? owner.dependency : owner;
    if (edit.kind === 'schedule' && relation.type === 'same_day') {
      rule.kind = ['month_start', 'month_end'].includes(rule.kind) ? 'offset_from_' + rule.kind : 'offset';
    }
    for (const key of ['days', 'weeks', 'whole']) delete rule[key];
    Object.assign(rule, value);
  } else if (edit.kind === 'anchor') {
    if (value.comparison === 'default_date') delete owner.defaultDateRelation;
    else owner.defaultDateRelation = value.comparison;
  } else if (edit.kind === 'bound') {
    const refs = relation.after ? owner.after : owner.before;
    const ref = refs === undefined ? owner : relation.after ? refs[edit.index] : refs;
    const bound = typeof ref === 'string' ? {} : ref;
    if (value.source) {
      bound.anchor = JSON.parse(value.source);
      delete bound.baseDate;
    }
    bound.inclusive = window.scheduleEngine.comparisonBound(value.comparison).inclusive;
    delete bound.offsetMonths;
    delete bound.offsetDays;
    bound[value.unit === 'month' ? 'offsetMonths' : 'offsetDays'] = value.amount;
    if (refs !== undefined && relation.after) refs[edit.index] = bound;
    if (refs !== undefined && !relation.after) owner.before = bound;
  } else if (edit.kind === 'satisfies') {
    const definition = { ...plan.constraints[relation.source], weekday: Number(value.weekday) };
    const id = constraintReference(plan, relation.source + '_' + value.weekday, definition);
    owner.constraints = owner.constraints.map(ref => ref === relation.source ? id : ref);
  } else if (relation.type === 'course') {
    Object.assign(owner, value, { weekday: Number(value.weekday) });
  } else {
    if (!owner.baseDate && !owner.anchor && (owner.kind === 'last_weekday') !== (value.kind === 'last_weekday')) {
      owner.baseDate = { kind: edge.boundaryKind, month: owner.month };
      delete owner.month;
    }
    delete owner.occurrence;
    Object.assign(owner, value);
  }
}

function openCardEditor(key, title, fields) {
  const container = cardForm.querySelector('.card-editor-fields');
  const error = cardForm.querySelector('.card-editor-error');
  container.replaceChildren();
  error.textContent = '';
  cardForm.querySelector('h2').textContent = t('Edit {title}', { title });
  if (fields[0].paths.length > 1) {
    const owners = fields[0].paths.map(([collection, id]) => authoredConfig[collection][id].title);
    const shared = document.createElement('p');
    shared.textContent = t('Used by {titles}', { titles: new Intl.ListFormat(locale).format(owners) });
    container.append(shared);
  }
  let readDate, readDependency;
  for (const field of fields) {
    if (field.key === 'dependency') {
      readDependency = dependencyFields(container, field.edge);
      continue;
    }
    if (field.key === 'virtualDate') {
      readDate = virtualDateFields(container, field.date);
      continue;
    }
    if (field.key === 'calendarRules') {
      container.append(calendarConstraintList(field.calendars, field.selected));
      continue;
    }
    const label = document.createElement('label');
    label.textContent = t(field.label);
    const input = document.createElement(({ weekday: 'select', rule: 'textarea' })[field.key] ?? 'input');
    if (field.key === 'weekday') {
      for (let day = 0; day < 7; day++) input.add(new Option(weekdayName(day), String(day)));
    } else if (field.key === 'month' || field.key === 'day') {
      Object.assign(input, { type: 'number', min: 1, max: field.key === 'month' ? 12 : 31 });
    } else if (field.key === 'initialYear') {
      input.pattern = 'current|[1-9][0-9]{3}';
      input.placeholder = 'current';
    }
    input.name = field.key;
    if (field.key === 'rule') input.placeholder = field.placeholder;
    input.required = field.key !== 'rule';
    input.value = field.value ?? sessionPathValue(authoredConfig, field.paths[0]);
    label.append(input);
    container.append(label);
  }
  const { month, day } = cardForm.elements;
  if (day && !readDate) {
    month.oninput = () => { day.max = String(new Date(2024, Number(month.value), 0).getDate()); };
    month.oninput();
  }
  const values = () => {
    const data = new FormData(cardForm);
    const modes = data.getAll('membership');
    const calendarRules = data.getAll('calendar').map((schedule, i) => ({ schedule, membership: modes[i] }));
    return { ...Object.fromEntries(data), calendarRules, virtualDate: readDate?.(), dependency: readDependency?.() };
  };
  const initial = values();
  const returnFocus = () => scheduleCards.querySelector(`[data-card-edit-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  const cancel = guardDiscard(cardEditor, 'Discard changes to “{title}”?', values, () => {
    cardEditor.close();
    returnFocus();
  }, { title });
  cardForm.elements.cancel.onclick = cancel;
  cardEditor.onkeydown = event => { if (event.key === 'Escape') cancel(event); };
  cardForm.onsubmit = event => {
    event.preventDefault();
    let next = structuredClone(authoredConfig);
    const draft = values();
    try {
      for (const field of fields) {
        const { key, paths } = field;
        if (key === 'calendarRules') {
          if (JSON.stringify(draft.calendarRules) !== JSON.stringify(initial.calendarRules)) {
            setCardCalendarRules(next, field.itemIndex, draft.calendarRules);
          }
          continue;
        }
        if (initial[key] === draft[key]) continue;
        if (key === 'dependency') {
          if (JSON.stringify(draft.dependency) !== JSON.stringify(initial.dependency)) setDependency(next, field.edge, draft.dependency);
          continue;
        }
        if (key === 'virtualDate') {
          if (JSON.stringify(draft.virtualDate) !== JSON.stringify(initial.virtualDate)) setVirtualDate(next, field, draft.virtualDate);
          continue;
        }
        if (key === 'rule') {
          for (const path of paths) {
            const parent = path.slice(0, -1).reduce((object, part) => object[part] ??= {}, next);
            if (draft.rule.trim()) parent[path.at(-1)] = draft.rule;
            else if (field.inheritedRule.trim()) parent[path.at(-1)] = '';
            else delete parent[path.at(-1)];
          }
          continue;
        }
        const number = ['month', 'day', 'weekday'].includes(key) || (key === 'initialYear' && draft[key] !== 'current');
        for (const path of paths) setSessionPathValue(next, path, number ? Number(draft[key]) : draft[key]);
      }
      next = window.scheduleEngine.normalizeAnchorDependencies(next);
      const effective = effectiveConfiguration(next);
      validateSessionConfiguration(effective);
      authoredConfig = next;
      config = effective;
    } catch (problem) {
      error.textContent = problem.message;
      return;
    }
    for (const card of scheduleCards.querySelectorAll('[data-item-index]')) {
      const item = config.items[Number(card.dataset.itemIndex)];
      card.querySelector('h2').textContent = item.title;
      wheel.querySelector(`[data-deadline-id="${CSS.escape(item.id)}"]`).dataset.label = item.title;
    }
    for (const card of scheduleCards.querySelectorAll('.deadline-group')) {
      card.querySelector('h2').textContent = config.groups[card.dataset.group].title;
    }
    cardEditor.close();
    paintTimeline();
    returnFocus();
    saveConfirmedConfiguration();
  };
  cardEditor.show();
  container.querySelector('input,select').focus({ preventScroll: true });
}

const sourceTexts = new Map(window.annualWheelSourceTexts);
let graphView;
const graphReady = import('/lib/config-graph.js?v=24').then(module => {
  graphView = module;
  if (editingTimeline) paintTimeline();
  return module;
});

function paintConfigurationNodes(cards, expanded) {
  function calendarRow(id) {
    return scheduleCards.querySelector(`[data-schedule-key="${CSS.escape(id)}"] strong`);
  }
  function owner([section, key]) {
    if (section === 'initialRule') return scheduleCards.querySelector('.timeline-initial > div');
    if (key === undefined) return null;
    if (section === 'items') return cards.get(config.items[key].id);
    if (section === 'groups') return scheduleCards.querySelector(`.timeline-dated-group[data-item-group="${CSS.escape(key)}"]`);
    if (section === 'anchors') {
      const item = config.items.find(item => item.schedule.kind === 'anchor' && item.schedule.anchor === key);
      return item ? cards.get(item.id) : scheduleCards.querySelector(`[data-anchor-key="${CSS.escape(key)}"]`);
    }
    if (section === 'constraints') {
      return scheduleCards.querySelector(`.timeline-weekday[data-constraint-id="${CSS.escape(key)}"]`)
        ?? calendarRow(config.constraints[key].schedule ?? '');
    }
    if (section === 'schedules') return calendarRow(key);
    return null;
  }
  advancedFields = graphView.renderConfigurationNodes(panel, authoredConfig, sourceTexts, owner, expanded,
    metadata => graphView.recoverGraphFields(panel, timelineEdges, metadata));
  advancedButton.hidden = advancedFields.length === 0;
}

function configurationForExport() {
  if (pendingPanelCalculation) {
    clearTimeout(panelCalculationTimer);
    panelCalculationTimer = undefined;
    pendingPanelCalculation = undefined;
    paintTimeline();
    lastPanelCalculation = performance.now();
  }
  return graphView.readDisplayedConfiguration(panel);
}

let configurationSaver;
async function saveConfirmedConfiguration() {
  if (pendingGraphChanges()) return;
  const dialog = document.querySelector('#config-save-notice');
  let message;
  try {
    if (!graphView) await graphReady;
    const plan = configurationForExport();
    const detachedAtConfirmation = new Map(detachedVirtualDates);
    configurationSaver ??= import('/lib/config-save.js?v=2').then(module =>
      module.createConfigurationSaver(graphView.sourceConfiguration(initialConfiguration, sourceTexts)));
    const save = await configurationSaver;
    const result = await save(plan);
    if (result === 'saved' && !pendingGraphChanges()) {
      let removed = false;
      for (const [key, entry] of detachedAtConfirmation) {
        if (detachedVirtualDates.get(key) === entry) {
          detachedVirtualDates.delete(key);
          removed = true;
        }
      }
      if (removed && editingTimeline) paintTimeline();
    }
    if (result === 'unsupported') message = 'This setup does not support saving. You can still edit the wheel and see your changes immediately in this tab. Your changes will be lost when you close or reload this tab.';
    if (result === 'unauthorized') message = 'Saving requires permission. Your changes are still in this tab.';
    if (result === 'failed') message = 'Saving failed. Your changes are still in this tab. Confirm again to retry.';
  } catch {
    message = 'Saving failed. Your changes are still in this tab. Confirm again to retry.';
  }
  if (message) {
    dialog.querySelector('p').textContent = t(message);
    if (!dialog.open) dialog.showModal();
  }
}

panel.querySelector('.export-plan').onclick = async () => {
  if (pendingGraphChanges()) return;
  await graphReady;
  const plan = configurationForExport();
  const { stringify } = await import('yaml');
  const url = URL.createObjectURL(new Blob([stringify(plan)], { type: 'application/yaml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'annual-wheel.yaml';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

panel.querySelector('.show-all-schedules input').onchange = paintTimeline;
const editDeadlines = panel.querySelector('.all-deadlines');
const closeTimeline = panel.querySelector('.close-timeline');
const headerSummary = document.querySelector('.plan-summary');
const editHeader = headerSummary.querySelector('.edit-plan-header');
const headerEditor = document.querySelector('#plan-header-editor');
const headerFields = headerEditor.elements;
const layerSummary = document.querySelector('.layer-summary');
const editLayers = layerSummary.querySelector('.edit-layers');
const layerEditor = document.querySelector('#layer-editor');
const layerRows = layerEditor.querySelector('.layer-rows');

function layerReferences(id) {
  const references = [];
  for (const [kind, target] of Object.entries(authoredConfig.autoLayers ?? {})) {
    if (target === id) references.push('autoLayers.' + kind);
  }
  for (const [group, settings] of Object.entries(authoredConfig.groups ?? {})) {
    if (settings.defaults?.layer === id) references.push('groups.' + group + '.defaults.layer');
  }
  for (const item of authoredConfig.items) {
    if (item.layer === id) references.push(item.title + ' (' + item.id + ')');
  }
  return references;
}

function appendLayerRow(id, label) {
  const row = document.createElement('div');
  row.className = 'layer-editor-row';
  if (id !== undefined) row.dataset.layerId = id;
  const input = document.createElement('input');
  input.value = label;
  input.required = true;
  input.pattern = '.*\\S.*';
  input.setAttribute('aria-label', t('Layer label'));
  input.placeholder = t('Layer label');
  const remove = document.createElement('button');
  remove.type = 'button';
  setControlIcon(remove, 'remove');
  remove.title = t('Remove layer');
  const nameRemove = () => remove.setAttribute('aria-label', [remove.title, input.value].filter(Boolean).join(' · '));
  nameRemove();
  input.oninput = nameRemove;
  remove.onclick = () => {
    const references = id === undefined ? [] : layerReferences(id);
    if (references.length) {
      showDependencyDialog(t('Layer in use'), input.value || label, references);
      return;
    }
    const focus = row.nextElementSibling?.querySelector('input') ?? layerEditor.elements.add;
    row.remove();
    focus.focus();
  };
  row.append(input, remove);
  layerRows.append(row);
  return input;
}

function closeLayerEditor() {
  layerEditor.hidden = true;
  layerSummary.hidden = false;
  layerRows.replaceChildren();
}

editLayers.onclick = () => openAfterCancelling(() => {
  layerRows.replaceChildren();
  for (const [id, layer] of Object.entries(authoredConfig.layers)) appendLayerRow(id, layer.label);
  layerSummary.hidden = true;
  layerEditor.hidden = false;
  layerEditor.elements.cancel.onclick = guardDiscard(layerEditor, 'Discard changes to the layers?',
    () => Array.from(layerRows.children, row => [row.dataset.layerId, row.querySelector('input').value]),
    () => { closeLayerEditor(); editLayers.focus(); }
  );
  (layerRows.querySelector('input') ?? layerEditor.elements.add).focus();
});
labelAddButton(layerEditor.elements.add, 'Add layer');
layerEditor.elements.add.onclick = () => appendLayerRow(undefined, '').focus();
layerEditor.onsubmit = event => {
  event.preventDefault();
  const previous = authoredConfig.layers;
  const entries = [];
  const colors = ['#527aa3', '#ad6451', '#398374', '#8361a5', '#9b782e'];
  const usedColors = new Set(Object.values(previous).map(layer => layer.color));
  let nextId = 1;
  for (const row of layerRows.children) {
    let id = row.dataset.layerId;
    const label = row.querySelector('input').value;
    if (id !== undefined) entries.push([id, { ...previous[id], label }]);
    else {
      do { id = 'layer-' + nextId++; } while (Object.hasOwn(previous, id));
      const color = colors.find(color => !usedColors.has(color)) ?? colors[entries.length % colors.length];
      usedColors.add(color);
      entries.push([id, { label, color }]);
    }
  }
  authoredConfig.layers = Object.fromEntries(entries);
  config = effectiveConfiguration(authoredConfig);
  renderLayers();
  for (const card of panel.querySelectorAll('[data-item-index]')) {
    card.querySelector('.card-kind').textContent = config.layers[card.dataset.layer].label;
  }
  closeLayerEditor();
  paintTimeline();
  editLayers.focus();
  saveConfirmedConfiguration();
};

function closeHeaderEditor() {
  headerEditor.hidden = true;
  headerSummary.hidden = false;
}

editHeader.onclick = () => openAfterCancelling(() => {
  headerFields.title.value = authoredConfig.display.title;
  headerFields.description.value = authoredConfig.display.description;
  const type = authoredConfig.organisation.type ?? '';
  const select = headerFields.organisationType;
  if (!Array.from(select.options).some(option => option.value === type)) select.add(new Option(type, type));
  select.value = type;
  headerSummary.hidden = true;
  headerEditor.hidden = false;
  headerFields.cancel.onclick = guardDiscard(headerEditor, 'Discard changes to the plan details?',
    () => Array.from(new FormData(headerEditor)),
    () => { closeHeaderEditor(); editHeader.focus(); }
  );
  headerFields.title.focus();
});
headerEditor.onsubmit = event => {
  event.preventDefault();
  authoredConfig.display.title = headerFields.title.value;
  authoredConfig.display.description = headerFields.description.value;
  const type = headerFields.organisationType.value;
  if (type) authoredConfig.organisation.type = type;
  else if (authoredConfig.organisation.type) delete authoredConfig.organisation.type;
  config = effectiveConfiguration(authoredConfig);
  renderPlanHeader();
  closeHeaderEditor();
  paintTimeline();
  editHeader.focus();
  saveConfirmedConfiguration();
};
function setTimelineEditor(open, editable) {
  if (!editable && cardEditor.open) cardEditor.close();
  if (!open) scheduleCards.querySelectorAll('.edit-card, .remove-card').forEach(button => button.remove());
  const entering = open && !editingTimeline;
  editingTimeline = open;
  editingDeadlines = editable;
  graphGroupExpansion.clear();
  if (configEditor.open) configEditor.close();
  const heading = timelineHeading.querySelector('h2');
  heading.dataset.i18n = editable ? 'Edit deadlines' : 'Dependency graph';
  heading.textContent = t(heading.dataset.i18n);
  const pencil = timelineHeading.querySelector('.edit-graph');
  const done = timelineHeading.querySelector('.finish-graph-edit');
  pencil.hidden = editable;
  done.hidden = !editable;
  for (const control of scheduleCards.querySelectorAll('.card-anchor-fields input, .card-anchor-fields button')) {
    control.disabled = open && !editable;
  }
  editHeader.hidden = !open;
  editLayers.hidden = !open;
  if (!open) {
    closeHeaderEditor();
    closeLayerEditor();
  }
  layout.classList.toggle('editing-timeline', open);
  timelineHeading.hidden = !open;
  editDeadlines.setAttribute('aria-expanded', String(open));
  if (open) {
    scheduleCards.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    scheduleViewport.tabIndex = 0;
    paintTimeline();
    if (entering) scheduleViewport.scrollLeft = 0;
    (editable ? done : pencil).focus({ preventScroll: true });
  } else {
    clearVirtualDates();
    for (const group of scheduleCards.querySelectorAll('.timeline-item-group')) {
      group.replaceWith(...group.querySelectorAll('[data-item-index]'));
    }
    scheduleViewport.removeAttribute('tabindex');
    paintNow();
    updateDebugCardYears();
    editDeadlines.focus();
  }
}
function syncTimelineWithUrl() {
  const editable = location.hash === '#edit/deadlines';
  const open = editable || location.hash === '#edit';
  if (editingTimeline !== open || editingDeadlines !== editable) setTimelineEditor(open, editable);
}

function navigateTimeline(hash) {
  const url = new URL(location.href);
  url.hash = hash;
  history.pushState(null, '', url);
  syncTimelineWithUrl();
}

editDeadlines.onclick = () => navigateTimeline('edit');
timelineHeading.querySelector('.edit-graph').onclick = () => openAfterCancelling(() => navigateTimeline('edit/deadlines'));
function leaveCardEditor(hash) {
  if (cardEditor.open) {
    openAfterCancelling(() => navigateTimeline(hash));
  } else navigateTimeline(hash);
}
timelineHeading.querySelector('.finish-graph-edit').onclick = () => openAfterCancelling(() => {
  saveConfirmedConfiguration();
  navigateTimeline('edit');
});
closeTimeline.onclick = () => leaveCardEditor('');
window.addEventListener('hashchange', syncTimelineWithUrl);
syncTimelineWithUrl();
document.querySelector('.legend').addEventListener('click', event => {
  const button = event.target.closest('.layer-toggle');
  if (!button) return;
  const active = button.classList.toggle('is-active');
  button.setAttribute('aria-pressed', String(active));
  for (const item of document.querySelectorAll('.deadline-card[data-layer], .event[data-layer]')) {
    if (item.dataset.layer === button.dataset.layer) item.classList.toggle('is-layer-hidden', !active);
  }
  if (editingTimeline) paintTimeline();
});
