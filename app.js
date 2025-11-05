// ===== helpers
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn); };
const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
const fmtDE = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayKey = d => d.toISOString().split('T')[0];
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Business-day cutover at 00:00 (midnight)
function businessDayKey(dt = new Date()) {
  const d = new Date(dt);
  // if (d.getHours() < 3) d.setDate(d.getDate() - 1); // ALT: 3 AM cutover
  return dayKey(d); // NEU: cutover is midnight
}

// ===== config storage
const CFG_KEY = 'UB2:CFG';
function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    return {
      recipients: c.recipients || ['baeckerei@macis-leipzig.de', 'backverkauf@macis-leipzig.de'],
      patisserie: c.patisserie || ['patisserie@macis-leipzig.de']
    };
  } catch {
    return { recipients: ['baeckerei@macis-leipzig.de', 'backverkauf@macis-leipzig.de'], patisserie: ['patisserie@macis-leipzig.de'] };
  }
}
function saveCfg(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
let cfg = loadCfg();

// ===== templates for tasks (editable via Quick Task Editor)
const TPL_KEY = 'UB2:TEMPLATE';
function defaultTemplate(cur) {
  const morning = [
    'Produktionsliste (Sandwiches)',
    'Backwaren einräumen',
    'Temperaturliste',
    'Kühlschranklicht an, aufräumen & auffüllen',
    'Freisitz aufschließen & reinigen',
    'Kaffeebereich vorbereiten',
    'MHD checken (Eier 1W vor Ablauf kühlen)',
    'Schild & Mülleimer raus',
    'Bestellungen packen & beschriften',
    'Safebag (×4) holen',
    'Mio Bestellung packen',
    'Fougasse schneiden',
    'Ringe einweichen & spülen',
    'Backwaren nachbestellen',
    'Übergabe für Spätschicht'
  ];
  if (cur.getDay() === 4) morning.push('Do: Kekse & Granola einpacken (falls leer)');
  const evening = [
    'Backwaren nachbestellen!',
    'Bleche & Besteck spülen (inkl. Maschine)',
    'Körbe säubern & neu einlegen',
    'Auslagen/Scheiben/Kühlschränke putzen',
    'Schild & Müll rein, Freisitz abschließen',
    'Kaffeemaschine reinigen & Bohnen auffüllen',
    'Brotschneider säubern',
    'Kehren inkl. Vorziehen',
    'Reinigungsliste abhaken',
    'Foodsharing (nach Abschrieb!)',
    'Müll & Flaschen runter',
    'Kassenabrechnung + Safebag in Tresor',
    'Auffüllen: Verpackungen/Becher/Handschuhe/Kaffeeecke',
    'Alle Oberflächen abwischen'
  ];
  const sunday = [
    'Townhouse ausliefern (+ Unterschriften Woche)',
    'TGTG Tüten am Montag buchen (trotzdem Abschrieb)'
  ];
  return { morning, evening, sunday };
}
function loadTemplate() {
  const tpl = JSON.parse(localStorage.getItem(TPL_KEY) || 'null');
  return tpl || defaultTemplate(new Date());
}
function saveTemplate(t) { localStorage.setItem(TPL_KEY, JSON.stringify(t)); }

// ===== day storage
let cur = new Date();
let day = { note: '', quick: { tgtg: '', absch: '' }, tasks: { morning: [], evening: [], sunday: [] } };

function seedTasks() {
  const base = loadTemplate();
  const make = arr => arr.map(t => ({ t, done: false }));
  return { morning: make(base.morning), evening: make(base.evening), sunday: make(base.sunday) };
}
function load() {
  const raw = localStorage.getItem('UB2:' + dayKey(cur));
  if (raw) {
    try { day = JSON.parse(raw); }
    catch { day = { note: '', quick: { tgtg: '', absch: '' }, tasks: seedTasks() }; }
  } else {
    day = { note: '', quick: { tgtg: '', absch: '' }, tasks: seedTasks() };
  }
}
function save() { localStorage.setItem('UB2:' + dayKey(cur), JSON.stringify(day)); }

// ===== archiving + auto reset (03:00)
function archiveDay(dateObj) {
  const key = 'UB2:' + dayKey(dateObj);
  const data = localStorage.getItem(key);
  if (!data) return;
  const arch = JSON.parse(localStorage.getItem('UB2:ARCHIVE') || '{}');
  arch[dayKey(dateObj)] = JSON.parse(data);
  localStorage.setItem('UB2:ARCHIVE', JSON.stringify(arch));
}
function autoDailyReset() {
  const now = new Date();
  const last = localStorage.getItem('UB2:LAST_RESET');
  const today = businessDayKey(now);
  if (last === today) return;

  // Previous business day for archive
  const prev = new Date(now);
  // ALT: 3 AM logic
  // if (now.getHours() >= 3) prev.setDate(prev.getDate() - 1);
  // else prev.setDate(prev.getDate() - 2);
  // NEU: Einfach den Vortag archivieren
  prev.setDate(prev.getDate() - 1);
  archiveDay(prev);

  // Reset current
  day = { note: '', quick: { tgtg: '', absch: '' }, tasks: seedTasks() };
  save();
  localStorage.setItem('UB2:LAST_RESET', today);
}

// ===== UI sync
function setDateUI() {
  setText('#current-date', fmtDE(cur));

  const dk = dayKey(cur);
  const url = 'https://outlook.live.com/calendar/view/day?startdt=' + dk;

  const a1 = $('#dash-outlook'); if (a1) a1.href = url;
  const a2 = $('#outlook-day-link'); if (a2) a2.href = url;
  const od = $('#order-date'); if (od) od.value = dk;
}

function renderStats() {
  const all = [
    ...day.tasks.morning,
    ...day.tasks.evening,
    ...(cur.getDay() === 0 ? day.tasks.sunday : [])
  ];
  const open = all.filter(a => !a.done).length;
  setText('#stat-open', open);
  setText('#stat-note', day.note?.trim() ? 'Ja' : 'Nein');
}

function setProgress(el, arr) {
  if (!el) return;
  const done = arr.filter(x => x.done).length;
  const pct = arr.length ? Math.round((done / arr.length) * 100) : 0;
  el.style.width = pct + '%';
}

function renderDashboardMirrors() {
  const staticObj = JSON.parse(localStorage.getItem('UB2:STATIC') || '{}');
  const s1 = $('#dash-static-info'); if (s1) s1.value = staticObj.text || '';
  const s2 = $('#dash-uebergabe'); if (s2) s2.value = day.note || '';
  const s3 = $('#quick-tgtg'); if (s3) s3.value = day.quick?.tgtg || '';
  const s4 = $('#quick-abs'); if (s4) s4.value = day.quick?.absch || '';
}

// ===== shifts + progress bars + admin quick editor
let ADMIN = false;
function renderShifts() {
  const onlyOpen = !!($('#onlyOpen') && $('#onlyOpen').checked);
  const paint = (sel, arr, color) => {
    const ul = $(sel); if (!ul) return;
    ul.innerHTML = '';
    arr.forEach((a, i) => {
      if (onlyOpen && a.done) return;
      const li = document.createElement('li');
      li.className = `flex items-center gap-3 border-l-4 pl-3 ${color}${ADMIN ? ' li-admin' : ''}`;
      li.innerHTML = `
        <input type="checkbox" ${a.done ? 'checked' : ''} class="h-5 w-5">
        <label class="flex-1 ${a.done ? 'line-through text-slate-400' : ''}">${escapeHtml(a.t)}</label>
        ${ADMIN ? '<button class="btn btn-secondary btn-xs" data-del="'+i+'" title="Löschen"><i class="ph ph-trash"></i></button>' : ''}
      `;
      const cb = li.querySelector('input');
      if (cb) cb.addEventListener('change', e => {
        a.done = e.target.checked;
        save(); renderShifts(); renderStats();
      });
      if (ADMIN) {
        const del = li.querySelector('[data-del]');
        if (del) del.addEventListener('click', () => {
          arr.splice(i, 1);
          save(); renderShifts(); persistTemplateFromCurrent();
        });
      }
      ul.appendChild(li);
    });
    if (sel === '#ul-morning') setProgress($('#prog-morning'), arr);
    if (sel === '#ul-evening') setProgress($('#prog-evening'), arr);
    if (sel === '#ul-sunday')  setProgress($('#prog-sunday'), arr);
  };

  paint('#ul-morning', day.tasks.morning, 'border-green-500/60');
  paint('#ul-evening', day.tasks.evening, 'border-yellow-500/60');
  const isSun = (cur.getDay() === 0);
  const sunCard = $('#sunday-card');
  if (sunCard) sunCard.classList.toggle('hidden', !isSun);
  if (isSun) paint('#ul-sunday', day.tasks.sunday, 'border-purple-500/60');
}

// persist edited tasks back into template
function persistTemplateFromCurrent() {
  const tpl = {
    morning: day.tasks.morning.map(x => x.t),
    evening: day.tasks.evening.map(x => x.t),
    sunday: day.tasks.sunday.map(x => x.t)
  };
  saveTemplate(tpl);
}

// ===== Orders (unchanged core)
function buildEmailBody({subject, emp, phone, paid, date, time, items, patisserie}) {
  const bullet = s => `• ${escapeHtml(s)}`;
  const list = items.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const patLine = `An Pâtisserie senden: ${patisserie ? 'Ja' : 'Nein'}`;
  const html = `Name: ${escapeHtml(subject)}<br>Mitarbeiter: ${escapeHtml(emp)}<br>Telefon: ${escapeHtml(phone||'–')}<br>Bezahlt: ${paid?'Ja':'Nein'}<br>${patLine}<br>Abholen: ${fmtDE(new Date(date))} ${time} Uhr<br><br>Produkte:<br>${list.map(bullet).join('<br>')}`;
  const text = `Name: ${subject}\nMitarbeiter: ${emp}\nTelefon: ${phone||'–'}\nBezahlt: ${paid?'Ja':'Nein'}\n${patLine}\nAbholen: ${fmtDE(new Date(date))} ${time} Uhr\n\nProdukte:\n${list.map(s=>'• '+s).join('\n')}`;
  return { html, text };
}
function updateEmailPreview() {
  const date = ($('#order-date') && $('#order-date').value) || dayKey(cur);
  const time = ($('#order-time') && $('#order-time').value) || '';
  const subject = ($('#order-customer') && $('#order-customer').value.trim()) || '—';
  const items = ($('#order-items') && $('#order-items').value.trim()) || '';
  const emp = ($('#order-emp') && $('#order-emp').value.trim()) || '—';
  const phone = ($('#order-phone') && $('#order-phone').value.trim()) || '';
  const paid = !!($('#order-paid') && $('#order-paid').checked);
  const patisserie = !!($('#order-patisserie') && $('#order-patisserie').checked);
  const { html } = buildEmailBody({ subject, emp, phone, paid, date, time, items, patisserie });
  const prev = $('#emailPreview'); if (prev) prev.innerHTML = html;
}
function utcStr(date, time) { const d = new Date(`${date}T${time}:00`); return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}00Z`; }
function utcEnd(date, time) { const d = new Date(`${date}T${time}:00`); d.setMinutes(d.getMinutes()+30); return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}00Z`; }

// ===== history tab
function renderArchive() {
  const ul = $('#archive-list'); if (!ul) return;
  const arch = JSON.parse(localStorage.getItem('UB2:ARCHIVE') || '{}');
  const keys = Object.keys(arch).sort().reverse();
  ul.innerHTML = keys.length ? '' : '<li class="text-slate-400">Noch keine Archiv-Einträge.</li>';
  keys.forEach(k => {
    const d = arch[k];
    const note = d.note?.trim() ? escapeHtml(d.note.trim()).slice(0, 160) + '…' : '–';
    const li = document.createElement('li');
    li.className = 'border border-neutral-800 rounded-lg p-3';
    li.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-bold">${fmtDE(new Date(k))}</div>
        <button class="btn btn-secondary" data-view="${k}"><i class="ph ph-eye"></i> Anzeigen</button>
      </div>
      <div class="text-sm text-slate-400 mt-1">${note}</div>`;
    const btn = li.querySelector('[data-view]');
    if (btn) btn.addEventListener('click', () => {
      alert(
        `Übergabe ${fmtDE(new Date(k))}\n\n` +
        `Note:\n${d.note || '–'}\n\n` +
        `TGTG:\n${d.quick?.tgtg || '–'}\n\n` +
        `Abschrieb:\n${d.quick?.absch || '–'}`
      );
    });
    ul.appendChild(li);
  });
}

// ===== hydrate
function hydrate() {
  setDateUI();
  renderStats();
  renderDashboardMirrors();
  renderShifts();
  updateEmailPreview();
}

// ===== init
window.addEventListener('DOMContentLoaded', () => {
  console.log('Init start');
  autoDailyReset();
  load();
  hydrate();

  // Connection indicator
  const paintOnline = () => setText('#cloudState', navigator.onLine ? '🟢 online' : '🔴 offline');
  window.addEventListener('online', paintOnline);
  window.addEventListener('offline', paintOnline);
  paintOnline();

  // Tabs (defensive)
  $$('[data-tab]').forEach(b => {
    b.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.add('hidden'));
      const panel = $('#tab-' + b.dataset.tab);
      if (panel) panel.classList.remove('hidden');
      if (b.dataset.tab === 'history') renderArchive();
    });
  });

  // Date nav
  on('#prevDay', 'click', () => { cur.setDate(cur.getDate() - 1); load(); renderShifts(); renderStats(); setDateUI(); });
  on('#nextDay', 'click', () => { cur.setDate(cur.getDate() + 1); load(); renderShifts(); renderStats(); setDateUI(); });

  // Print
  on('#printBtn', 'click', () => window.print());

  // Dashboard mirrors (throttled saves)
  let tA, tB, tC;
  on('#dash-uebergabe', 'input', () => {
    clearTimeout(tA);
    tA = setTimeout(() => {
      const el = $('#dash-uebergabe'); if (!el) return;
      day.note = el.value; save(); renderStats();
      const chip = $('#dash-note-save'); if (chip) { chip.style.opacity = '1'; setTimeout(() => chip.style.opacity = '0', 800); }
    }, 250);
  });
  on('#dash-static-info', 'input', () => {
    clearTimeout(tB);
    tB = setTimeout(() => {
      const el = $('#dash-static-info'); if (!el) return;
      const s = JSON.parse(localStorage.getItem('UB2:STATIC') || '{}');
      s.text = el.value;
      localStorage.setItem('UB2:STATIC', JSON.stringify(s));
      const chip = $('#dash-static-save'); if (chip) { chip.style.opacity = '1'; setTimeout(() => chip.style.opacity = '0', 800); }
    }, 250);
  });
  on('#quick-tgtg', 'input', () => {
    clearTimeout(tC);
    tC = setTimeout(() => { const el = $('#quick-tgtg'); if (!el) return; day.quick.tgtg = el.value; save(); }, 250);
  });
  on('#quick-abs', 'input', () => { const el = $('#quick-abs'); if (!el) return; day.quick.absch = el.value; save(); });

  // Shifts
  on('#onlyOpen', 'change', renderShifts);
  on('#resetTasks', 'click', () => { day.tasks = seedTasks(); save(); renderShifts(); renderStats(); });
  on('#qa-reset', 'click', () => { day.tasks = seedTasks(); save(); renderShifts(); renderStats(); });

  // Admin mode
  ADMIN = localStorage.getItem('UB2:ADMIN') === '1';
  const adminToggle = $('#adminToggle');
  if (adminToggle) {
    adminToggle.checked = ADMIN;
    adminToggle.addEventListener('change', e => {
      ADMIN = e.target.checked;
      localStorage.setItem('UB2:ADMIN', ADMIN ? '1' : '0');
      renderShifts();
    });
  }

  // Quick add task
  on('#addTaskBtn', 'click', () => {
    const shift = (prompt('Für welche Schicht? (morning/evening/sunday)', 'morning') || '').trim();
    if (!['morning', 'evening', 'sunday'].includes(shift)) return;
    const task = (prompt('Neue Aufgabe:', '') || '').trim();
    if (!task) return;
    day.tasks[shift].push({ t: task, done: false });
    save(); persistTemplateFromCurrent(); renderShifts();
  });

  // Quick new order nav
  on('#qa-new-order', 'click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    $$('[data-tab="orders"]').forEach(x => x.classList.add('active'));
    $$('.tab-panel').forEach(p => p.classList.add('hidden'));
    const orders = $('#tab-orders'); if (orders) orders.classList.remove('hidden');
  });

  // Settings
  const r = $('#cfg-recip'); if (r) r.value = cfg.recipients.join(',');
  const p = $('#cfg-pat'); if (p) p.value = cfg.patisserie.join(',');
  on('#cfg-recip', 'change', () => { const el = $('#cfg-recip'); if (!el) return; cfg.recipients = el.value.split(',').map(s => s.trim()).filter(Boolean); saveCfg(cfg); });
  on('#cfg-pat', 'change', () => { const el = $('#cfg-pat'); if (!el) return; cfg.patisserie = el.value.split(',').map(s => s.trim()).filter(Boolean); saveCfg(cfg); });

  // Orders listeners
  ['order-date','order-time','order-customer','order-items','order-emp','order-phone','order-paid','order-patisserie'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateEmailPreview);
  });
  on('#copyHtml', 'click', () => { const prev = $('#emailPreview'); if (prev) navigator.clipboard.writeText(prev.innerHTML || ''); });
  on('#copyText', 'click', () => {
    const date = ($('#order-date') && $('#order-date').value) || dayKey(cur);
    const time = ($('#order-time') && $('#order-time').value) || '';
    const subject = ($('#order-customer') && $('#order-customer').value.trim()) || '—';
    const items = ($('#order-items') && $('#order-items').value.trim()) || '';
    const emp = ($('#order-emp') && $('#order-emp').value.trim()) || '—';
    const phone = ($('#order-phone') && $('#order-phone').value.trim()) || '';
    const paid = !!($('#order-paid') && $('#order-paid').checked);
    const patisserie = !!($('#order-patisserie') && $('#order-patisserie').checked);
    const { text } = buildEmailBody({ subject, emp, phone, paid, date, time, items, patisserie });
    navigator.clipboard.writeText(text);
  });

  // Submit order (safe)
  const orderForm = $('#order-form');
  if (orderForm) orderForm.addEventListener('submit', e => {
    e.preventDefault();
    const date = ($('#order-date') && $('#order-date').value) || dayKey(cur);
    const time = ($('#order-time') && $('#order-time').value) || '';
    const subject = ($('#order-customer') && $('#order-customer').value.trim()) || '';
    const items = ($('#order-items') && $('#order-items').value.trim()) || '';
    const emp = ($('#order-emp') && $('#order-emp').value.trim()) || '—';
    const phone = ($('#order-phone') && $('#order-phone').value.trim()) || '';
    const paid = !!($('#order-paid') && $('#order-paid').checked);
    const patisserie = !!($('#order-patisserie') && $('#order-patisserie').checked);

    if (!date || !time || !subject || !items || !emp) { alert('Bitte alle Pflichtfelder ausfüllen'); return; }

    const { html } = buildEmailBody({ subject, emp, phone, paid, date, time, items, patisserie });
    let recipients = [...cfg.recipients];
    if (patisserie) recipients = [...recipients, ...cfg.patisserie];

    let url = 'https://outlook.live.com/calendar/0/deeplink/compose?rru=addevent';
    url += '&subject=' + encodeURIComponent(subject);
    url += '&startdt=' + utcStr(date, time);
    url += '&enddt=' + utcEnd(date, time);
    url += '&body=' + encodeURIComponent(html);
    url += '&to=' + encodeURIComponent(recipients.join(','));
    url += '&bodyformat=HTML';
    window.open(url, '_blank');
  });

  console.log('Init OK');
});