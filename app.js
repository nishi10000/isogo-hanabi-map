const confidenceLabels={confirmed:'確認済み',likely:'有力',possible:'要検証'};
const accuracyLabels={exact:'ピンポイント',area:'周辺表示',rough:'粗い位置',private_avoid:'非公開/ぼかし'};
const supportLabels={direct_report:'直接ソース',indirect_view_axis:'眺望ソース'};
let map,spots=[],events=[],markers=L.layerGroup(),lines=L.layerGroup();
let selectedEvents=new Set(),selectedConfidence=new Set(['confirmed','likely','possible']);

function badge(text,cls){return `<span class="badge ${cls}">${text}</span>`}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function eventById(id){return events.find(e=>e.id===id)}
function eventName(id){return eventById(id)?.name||id}
function eventSpots(eventId){return spots.filter(s=>s.visible_events?.includes(eventId)&&matchesConfidenceAndFamily(s))}
function evidenceFor(spot,eventId){return spot.event_evidence?.[eventId]||null}
function sourceLink(title,url,cls='source-link'){return `<a class="${cls}" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title||url)}</a>`}
function sourceLinks(sources){return (sources||[]).map(s=>sourceLink(s.title,s.url)).join('')}
function matchesConfidenceAndFamily(spot){
  if(!selectedConfidence.has(spot.confidence))return false;
  if(document.getElementById('kidFriendlyOnly').checked&&!['high','medium'].includes(spot.kid_friendly))return false;
  if(document.getElementById('strollerFriendlyOnly').checked&&!String(spot.stroller).includes('可'))return false;
  return true;
}
function matches(spot){
  if(selectedEvents.size&&!spot.visible_events.some(id=>selectedEvents.has(id)))return false;
  return matchesConfidenceAndFamily(spot);
}
function supportClass(ev){return ev?.support_level||'indirect_view_axis'}
function supportLabel(ev){return supportLabels[supportClass(ev)]||'根拠'}
function bestEvidenceHtml(spot){
  const ids=selectedEvents.size?[...selectedEvents]:spot.visible_events;
  return ids.filter(id=>spot.visible_events.includes(id)).map(id=>{
    const ev=evidenceFor(spot,id);
    if(!ev)return '';
    return `<li><span class="evidence-pill ${supportClass(ev)}">${escapeHtml(supportLabel(ev))}</span><strong>${escapeHtml(eventName(id))}</strong><br><span>${escapeHtml(ev.summary)}</span>${sourceLink(ev.source_title,ev.source_url,'source-inline')}</li>`;
  }).join('');
}
function oneLineVerdict(spot){
  const evs=(selectedEvents.size?[...selectedEvents]:spot.visible_events).filter(id=>spot.visible_events.includes(id)).map(eventName).join(' / ');
  return `${confidenceLabels[spot.confidence]}｜${evs}｜${spot.view_direction}`;
}
function detailHtml(spot){
  return `<div class="detail-card"><h3>${escapeHtml(spot.name)}</h3>
    <div class="meta">${badge(confidenceLabels[spot.confidence]||spot.confidence,spot.confidence)}${badge(accuracyLabels[spot.pin_accuracy]||spot.pin_accuracy,spot.pin_accuracy)}${badge(escapeHtml(spot.category),'category')}</div>
    <p class="verdict">${escapeHtml(oneLineVerdict(spot))}</p>
    <dl class="detail-list"><dt>見え方</dt><dd>${escapeHtml(spot.visibility_note)}</dd><dt>方角</dt><dd>${escapeHtml(spot.view_direction)}</dd><dt>子連れ</dt><dd>${escapeHtml(spot.kid_friendly)} / ベビーカー: ${escapeHtml(spot.stroller)} / トイレ: ${escapeHtml(spot.toilet)}</dd><dt>注意点</dt><dd>${escapeHtml(spot.access_note)}</dd></dl>
    <h4>「見える可能性」の根拠</h4><ul class="evidence-list">${bestEvidenceHtml(spot)}</ul>
    <p class="warning-inline"><strong>警告:</strong> ${escapeHtml(spot.warning)}</p>
    <div class="sources"><strong>全ソース</strong>${sourceLinks(spot.sources)}</div>
    <p class="muted">最終現地確認: ${escapeHtml(spot.last_verified_at||'未確認')}</p>
    <button class="chip active" onclick="drawLines('${escapeHtml(spot.id)}')">打上地点への方角線</button></div>`
}
function popupHtml(spot){return `<div class="popup">${detailHtml(spot)}<button class="full-button" onclick="openSpot('${escapeHtml(spot.id)}')">スマホ詳細で開く</button></div>`}
function cardHtml(spot){
  return `<article class="card"><button class="card-main" type="button" onclick="openSpot('${escapeHtml(spot.id)}')"><span class="card-title">${escapeHtml(spot.name)}</span><span class="card-verdict">${escapeHtml(oneLineVerdict(spot))}</span><span class="card-note">${escapeHtml(spot.visibility_note)}</span></button><ul class="evidence-list compact">${bestEvidenceHtml(spot)}</ul></article>`
}
function renderSchedule(){
  const wrap=document.getElementById('scheduleList'); wrap.innerHTML='';
  events.forEach(ev=>{
    const candidates=eventSpots(ev.id);
    const chips=candidates.map(s=>{
      const e=evidenceFor(s,ev.id);
      return `<button class="spot-chip" type="button" onclick="openSpot('${escapeHtml(s.id)}')"><span>${escapeHtml(s.name)}</span><small>${escapeHtml(confidenceLabels[s.confidence])}・${escapeHtml(supportLabel(e))}</small></button>`;
    }).join('')||'<p class="muted">条件に合う候補地なし</p>';
    const direct=candidates.filter(s=>supportClass(evidenceFor(s,ev.id))==='direct_report').length;
    const indirect=candidates.length-direct;
    wrap.insertAdjacentHTML('beforeend',`<article class="schedule-card ${selectedEvents.has(ev.id)?'selected':''}">
      <button class="schedule-head" type="button" onclick="toggleEvent('${escapeHtml(ev.id)}')">
        <span class="date">${escapeHtml(ev.schedule_label||ev.date_note)}</span>
        <strong>${escapeHtml(ev.name)}</strong>
        <span class="time">${escapeHtml(ev.time_label||ev.date_note)}</span>
      </button>
      <div class="schedule-body">
        <p class="area">打上/会場: ${escapeHtml(ev.area)}｜磯子から ${escapeHtml(ev.direction_from_isogo)}</p>
        <p class="source-row">${sourceLink(ev.source_title||'公式情報',ev.source_url||ev.official_url,'source-inline')} <span>${escapeHtml(ev.source_note||'年度ごとに要確認')}</span></p>
        <p class="count-line">候補 ${candidates.length}件（直接ソース ${direct} / 眺望ソース ${indirect}）</p>
        <div class="spot-chip-list">${chips}</div>
      </div>
    </article>`);
  });
}
function drawLines(spotId){
  lines.clearLayers();
  const spot=spots.find(s=>s.id===spotId); if(!spot)return;
  const ids=selectedEvents.size?[...selectedEvents].filter(id=>spot.visible_events.includes(id)):spot.visible_events;
  ids.forEach(id=>{const ev=eventById(id); if(!ev)return; L.polyline([[spot.lat,spot.lng],[ev.launch_lat,ev.launch_lng]],{color:'#f97316',weight:3,opacity:.78,dashArray:'7 8'}).bindTooltip(ev.name).addTo(lines)});
  lines.addTo(map);
  showPanel('mapPanel');
}
function openSpot(spotId){
  const spot=spots.find(s=>s.id===spotId); if(!spot)return;
  document.getElementById('detailContent').innerHTML=detailHtml(spot);
  const d=document.getElementById('detailDialog');
  if(typeof d.showModal==='function')d.showModal(); else d.setAttribute('open','');
  drawLines(spotId);
}
function toggleEvent(id){
  selectedEvents.has(id)?selectedEvents.delete(id):selectedEvents.add(id);
  document.querySelectorAll(`[data-event-id="${CSS.escape(id)}"]`).forEach(b=>b.classList.toggle('active',selectedEvents.has(id)));
  refresh();
}
function refresh(){
  markers.clearLayers(); lines.clearLayers();
  const cards=document.getElementById('spotCards'); cards.innerHTML='';
  const visible=spots.filter(matches);
  visible.forEach(spot=>{const color=spot.confidence==='likely'?'#2563eb':spot.confidence==='confirmed'?'#16a34a':'#9333ea'; const marker=L.circleMarker([spot.lat,spot.lng],{radius:spot.pin_accuracy==='exact'?8:11,color,fillColor:color,fillOpacity:.82,weight:2}).bindPopup(popupHtml(spot)).addTo(markers); marker.on('click',()=>drawLines(spot.id)); cards.insertAdjacentHTML('beforeend',cardHtml(spot));});
  markers.addTo(map);
  document.getElementById('visibleCount').textContent=visible.length;
  document.getElementById('totalCount').textContent=spots.length;
  const ev=[...selectedEvents].map(eventName).join(' / ')||'全花火大会';
  const cf=[...selectedConfidence].map(x=>confidenceLabels[x]).join(' / ');
  document.getElementById('selectionSummary').textContent=`${ev} ・ ${cf}`;
  document.querySelectorAll('.schedule-card').forEach((card,i)=>card.classList.toggle('selected',selectedEvents.has(events[i].id)));
  renderSchedule();
  if(visible.length){map.fitBounds(L.latLngBounds(visible.map(s=>[s.lat,s.lng])).pad(.18),{maxZoom:14})}
}
function renderFilters(){
  const eWrap=document.getElementById('eventFilters');
  events.forEach(ev=>{const b=document.createElement('button'); b.className='chip'; b.dataset.eventId=ev.id; b.textContent=ev.name; b.onclick=()=>toggleEvent(ev.id); eWrap.appendChild(b)});
  const cWrap=document.getElementById('confidenceFilters');
  Object.entries(confidenceLabels).forEach(([id,label])=>{const b=document.createElement('button'); b.className='chip active'; b.textContent=label; b.onclick=()=>{selectedConfidence.has(id)?selectedConfidence.delete(id):selectedConfidence.add(id); b.classList.toggle('active'); refresh()}; cWrap.appendChild(b)});
  document.getElementById('kidFriendlyOnly').addEventListener('change',refresh);
  document.getElementById('strollerFriendlyOnly').addEventListener('change',refresh);
  document.getElementById('resetFilters').onclick=()=>{selectedEvents.clear(); selectedConfidence=new Set(['confirmed','likely','possible']); document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active')); document.querySelectorAll('#confidenceFilters .chip').forEach(b=>b.classList.add('active')); document.getElementById('kidFriendlyOnly').checked=false; document.getElementById('strollerFriendlyOnly').checked=false; refresh();};
}
function showPanel(id){
  document.querySelectorAll('.mobile-panel').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.panel===id));
  if(id==='mapPanel'&&map)setTimeout(()=>map.invalidateSize(),60);
}
async function init(){
  map=L.map('map',{scrollWheelZoom:true}).setView([35.405,139.618],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const [spotRes,eventRes]=await Promise.all([fetch('data/spots.json'),fetch('data/events.json')]);
  spots=await spotRes.json(); events=await eventRes.json();
  renderFilters(); refresh();
  document.getElementById('locateBtn').onclick=()=>{showPanel('mapPanel');map.locate({setView:true,maxZoom:15})};
  map.on('locationfound',e=>L.circle(e.latlng,{radius:e.accuracy,color:'#06b6d4'}).addTo(map));
  document.getElementById('closeDialog').onclick=()=>document.getElementById('detailDialog').close();
  document.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
}
init().catch(err=>{console.error(err);document.getElementById('spotCards').innerHTML=`<p class="card">データ読み込みに失敗しました: ${escapeHtml(err.message)}</p>`});
