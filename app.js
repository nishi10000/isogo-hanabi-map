const confidenceLabels={confirmed:'確認済み',likely:'有力',possible:'要検証'};
const accuracyLabels={exact:'ピンポイント',area:'周辺表示',rough:'粗い位置',private_avoid:'非公開/ぼかし'};
let map,spots=[],events=[],markers=L.layerGroup(),lines=L.layerGroup();
let selectedEvents=new Set(),selectedConfidence=new Set(['confirmed','likely','possible']);
function badge(text,cls){return `<span class="badge ${cls}">${text}</span>`}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function eventName(id){return events.find(e=>e.id===id)?.name||id}
function sourceLinks(sources){return (sources||[]).map(s=>`<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`).join('')}
function matches(spot){
  if(selectedEvents.size&&!spot.visible_events.some(id=>selectedEvents.has(id)))return false;
  if(!selectedConfidence.has(spot.confidence))return false;
  if(document.getElementById('kidFriendlyOnly').checked&&!['high','medium'].includes(spot.kid_friendly))return false;
  if(document.getElementById('strollerFriendlyOnly').checked&&!String(spot.stroller).includes('可'))return false;
  return true;
}
function popupHtml(spot){return `<div class="popup"><h3>${escapeHtml(spot.name)}</h3><div class="meta">${badge(confidenceLabels[spot.confidence]||spot.confidence,spot.confidence)}${badge(accuracyLabels[spot.pin_accuracy]||spot.pin_accuracy,spot.pin_accuracy)}</div><dl><dt>花火</dt><dd>${spot.visible_events.map(eventName).map(escapeHtml).join('<br>')}</dd><dt>方角</dt><dd>${escapeHtml(spot.view_direction)}</dd><dt>見え方</dt><dd>${escapeHtml(spot.visibility_note)}</dd><dt>子連れ</dt><dd>${escapeHtml(spot.kid_friendly)}</dd><dt>ベビーカー</dt><dd>${escapeHtml(spot.stroller)}</dd><dt>トイレ</dt><dd>${escapeHtml(spot.toilet)}</dd><dt>注意点</dt><dd>${escapeHtml(spot.access_note)}</dd></dl><p><strong>警告:</strong> ${escapeHtml(spot.warning)}</p><div class="sources"><strong>ソース</strong>${sourceLinks(spot.sources)}</div><p class="muted">最終現地確認: ${escapeHtml(spot.last_verified_at||'未確認')}</p><button class="chip" onclick="drawLines('${spot.id}')">打上地点への方角線</button></div>`}
function cardHtml(spot){return `<article class="card"><h3>${escapeHtml(spot.name)}</h3><div class="meta">${badge(confidenceLabels[spot.confidence]||spot.confidence,spot.confidence)}${badge(accuracyLabels[spot.pin_accuracy]||spot.pin_accuracy,spot.pin_accuracy)}</div><p>${escapeHtml(spot.visibility_note)}</p><p class="muted">${spot.visible_events.map(eventName).join(' / ')}</p></article>`}
function drawLines(spotId){
  lines.clearLayers();
  const spot=spots.find(s=>s.id===spotId); if(!spot)return;
  spot.visible_events.forEach(id=>{const ev=events.find(e=>e.id===id); if(!ev)return; L.polyline([[spot.lat,spot.lng],[ev.launch_lat,ev.launch_lng]],{color:'#f97316',weight:3,opacity:.78,dashArray:'7 8'}).bindTooltip(ev.name).addTo(lines)});
  lines.addTo(map);
}
function refresh(){
  markers.clearLayers(); lines.clearLayers();
  const cards=document.getElementById('spotCards'); cards.innerHTML='';
  const visible=spots.filter(matches);
  visible.forEach(spot=>{const color=spot.confidence==='likely'?'#2563eb':spot.confidence==='confirmed'?'#16a34a':'#9333ea'; const marker=L.circleMarker([spot.lat,spot.lng],{radius:spot.pin_accuracy==='exact'?9:12,color,fillColor:color,fillOpacity:.82,weight:2}).bindPopup(popupHtml(spot)).addTo(markers); marker.on('click',()=>drawLines(spot.id)); cards.insertAdjacentHTML('beforeend',cardHtml(spot));});
  markers.addTo(map);
  document.getElementById('visibleCount').textContent=visible.length;
  document.getElementById('totalCount').textContent=spots.length;
  const ev=[...selectedEvents].map(eventName).join(' / ')||'全花火大会';
  const cf=[...selectedConfidence].map(x=>confidenceLabels[x]).join(' / ');
  document.getElementById('selectionSummary').textContent=`${ev} ・ ${cf}`;
  if(visible.length){map.fitBounds(L.latLngBounds(visible.map(s=>[s.lat,s.lng])).pad(.18),{maxZoom:14})}
}
function renderFilters(){
  const eWrap=document.getElementById('eventFilters');
  events.forEach(ev=>{const b=document.createElement('button'); b.className='chip'; b.textContent=ev.name; b.onclick=()=>{selectedEvents.has(ev.id)?selectedEvents.delete(ev.id):selectedEvents.add(ev.id); b.classList.toggle('active'); refresh()}; eWrap.appendChild(b)});
  const cWrap=document.getElementById('confidenceFilters');
  Object.entries(confidenceLabels).forEach(([id,label])=>{const b=document.createElement('button'); b.className='chip active'; b.textContent=label; b.onclick=()=>{selectedConfidence.has(id)?selectedConfidence.delete(id):selectedConfidence.add(id); b.classList.toggle('active'); refresh()}; cWrap.appendChild(b)});
  document.getElementById('kidFriendlyOnly').addEventListener('change',refresh);
  document.getElementById('strollerFriendlyOnly').addEventListener('change',refresh);
}
async function init(){
  map=L.map('map',{scrollWheelZoom:true}).setView([35.405,139.618],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const [spotRes,eventRes]=await Promise.all([fetch('data/spots.json'),fetch('data/events.json')]);
  spots=await spotRes.json(); events=await eventRes.json();
  renderFilters(); refresh();
  document.getElementById('locateBtn').onclick=()=>map.locate({setView:true,maxZoom:15});
  map.on('locationfound',e=>L.circle(e.latlng,{radius:e.accuracy,color:'#06b6d4'}).addTo(map));
}
init().catch(err=>{console.error(err);document.getElementById('spotCards').innerHTML=`<p class="card">データ読み込みに失敗しました: ${escapeHtml(err.message)}</p>`});
