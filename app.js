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
  // Verlauf-Funktion wurde entfernt
}
function autoDailyReset() {
  const now = new Date();
  const last = localStorage.getItem('UB2:LAST_RESET');
  const today = businessDayKey(now);
  if (last === today) return;

  // Verlauf-Archivierung entfernt
  
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
        ${ADMIN ? '<button class="btn btn-secondary btn-xs admin-only" data-del="'+i+'" title="Löschen"><i class="ph ph-trash"></i></button>' : ''}
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
  
  // NEU: Admin-Buttons auf Schicht-Seite aktualisieren
  toggleAdminUI(ADMIN);
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

// ===== NEU: ALLERGEN-FUNKTIONEN =====

const ALLERGEN_KEY = 'UB2:ALLERGENS';
let allProducts = [];

// Standard-Produktdaten aus deiner JSON-Datei
const DEFAULT_PRODUCTS = [
  { "id": 1, "img": "https://macis-leipzig.de/wp-content/uploads/2021/07/IMG_3474-768x512.jpg", "name_de": "Landbrot", "allergen_de": "Gluten, Soja", "category": "bread" },
  { "id": 2, "img": "https://macis-leipzig.de/wp-content/uploads/2021/07/IMG_3410-768x512.jpg", "name_de": "Macis Kruste", "allergen_de": "Gluten, Milch", "category": "bread" },
  { "id": 3, "img": "https://macis-leipzig.de/wp-content/uploads/2021/07/IMG_3655-768x512.jpg", "name_de": "Das Kernige", "allergen_de": "Gluten, Milch, Eier", "category": "bread" },
  { "id": 4, "img": "https://m.media-amazon.com/images/I/61-7rqHsRqL._UF894,1000_QL80_.jpg", "name_de": "RVK Brötchen", "allergen_de": "Gluten, Sesam", "category": "broetchen" },
  { "id": 5, "img": "https://macis-leipzig.de/wp-content/uploads/2021/07/IMG_3617-768x512.jpg", "name_de": "Grand Gourmet", "allergen_de": "Gluten, Soja", "category": "bread" },
  { "id": 6, "img": "https://www.verygourmand.com/img/anblog/b/b-6273bd7170ea4-anblog_thumb.jpg", "name_de": "Flan Kuchen", "allergen_de": "Gluten, Milch, Eier", "category": "sweet" },
  { "id": 7, "img": "https://pure-pastry.de/wp-content/uploads/2025/01/Pure_Pastry_Freisteller_DSC07676.jpg", "name_de": "Buttercroissant", "allergen_de": "Gluten, Milch, Eier", "category": "sweet" },
  { "id": 8, "img": "https://www.arctis.de/wp-content/uploads/2023/07/032-Laugenbroetchen.jpg", "name_de": "Laugenbrötchen", "allergen_de": "Gluten", "category": "broetchen" },
  { "id": 9, "img": "https://macis-leipzig.de/wp-content/uploads/2021/07/IMG_3501-1024x683.jpg", "name_de": "Walnussbrot", "allergen_de": "Gluten, Nüsse", "category": "bread" },
  { "id": 10, "img": "https://www.vollkornbaeckerei-wuest.de/.cm4all/uproc.php/0/Kundendaten/Alte_Webseite/Bilder/Br%C3%B6tchen/Weizen/Spitzweck-1050.png?_=1718e1107c8", "name_de": "Dinkelbrötchen", "allergen_de": "Gluten, Milch", "category": "broetchen" },
  { "id": 11, "img": "https://3brothersbakery.com/wp-content/uploads/2018/05/ChocolateCroissant_02-scaled.jpg", "name_de": "Schokocroissant", "allergen_de": "Gluten, Milch, Soja", "category": "sweet" },
  { "id": 12, "img": "https://www.nachhaltigleben.ch/images/stories/Rezepte/Kartoffelbrot_645.jpg", "name_de": "KartoffelBrot", "allergen_de": "Gluten", "category": "bread" },
  { "id": 13, "img": "https://www.specialitybreads.co.uk/wp-content/uploads/2013/03/Recipe_product_Individual-ciabatta-roll_FB682.png", "name_de": "Ciabatta", "allergen_de": "Gluten", "category": "bread" },
  { "id": 14, "img": "https://de.rc-cdn.community.thermomix.com/recipeimage/q3g2fubl-04855-946307-cfcd2-nrrujcv4/a044518b-fb63-4a89-80f1-ce4d09a815fe/main/marmorkuchen.jpg", "name_de": "Marmor Kuchen", "allergen_de": "Gluten, Milch, Eier", "category": "sweet" },
  { "id": 15, "img": "https://www.baeckerei-horsthemke.de/wp-content/uploads/2022/07/kuerbiskern-broetchen-auf-einem-holztisch.jpg.webp", "name_de": "Saatenbrötchen", "allergen_de": "Gluten", "category": "broetchen" },
  { "id": 16, "img": "https://www.einfachbacken.de/sites/einfachbacken.de/files/2018-07/russischer_zupfkuchen-2-png-converted.jpg", "name_de": "Zupf Kuchen", "allergen_de": "Gluten, Milch, Nüsse", "category": "sweet" },
  { "id": 17, "img": "https://delightbaking.com/wp-content/uploads/2019/11/Sourdough-Loaf-With-Sesame-Seeds-440x440.webp", "name_de": "Sesam Kruste", "allergen_de": "Gluten, Nüsse", "category": "bread" },
  { "id": 18, "img": "https://img.offers-cdn.net/assets/uploads/offers/de/901439/roggenrose-thumbWebP.webp", "name_de": "Roggenrose", "allergen_de": "Gluten, Milch", "category": "broetchen" },
  { "id": 19, "img": "https://babyrockmyday.com/wp-content/uploads/2017/10/Kadamom-Zimt-Knoten1-740x1110.jpg", "name_de": "kardamom Knoten", "allergen_de": "Gluten, Milch, Soja", "category": "sweet" },
  { "id": 20, "img": "https://www.fraenkische-rezepte.de/wp-content/uploads/2022/06/karottenbrot.jpg", "name_de": "Karottenbrot", "allergen_de": "Gluten", "category": "bread" },
  { "id": 21, "img": "https://w7.pngwing.com/pngs/672/1012/png-transparent-rye-bread-ciabatta-bakery-tart-pain-au-chocolat-bread-baked-goods-food-olive-thumbnail.png", "name_de": "Ciabatta Olive", "allergen_de": "Gluten", "category": "bread" },
  { "id": 22, "img": "https://valentinascorner.com/wp-content/uploads/2022/02/Vanilla-Cupcakes.jpg", "name_de": "Cup Cake", "allergen_de": "Gluten, Milch, Eier", "category": "sweet" },
  { "id": 23, "img": "https://www.brotkruemel.com/media/image/e9/de/b2/Weizenbroetchen-ueber-Nacht-1.jpg", "name_de": "weizenbrötchen", "allergen_de": "Gluten", "category": "broetchen" },
  { "id": 24, "img": "https://www.kuchentratsch.com/cdn/shop/files/Zitronenkuchen-gross-kuchentratsch-oben.webp?v=1741079391", "name_de": "Zitronen Kuchen", "allergen_de": "Gluten, Milch, Nüsse", "category": "sweet" }
];

function loadProducts() {
  const data = localStorage.getItem(ALLERGEN_KEY);
  if (data) {
    allProducts = JSON.parse(data);
  } else {
    // Beim ersten Start mit Standarddaten füllen
    allProducts = DEFAULT_PRODUCTS;
    saveProducts();
  }
  // Stelle sicher, dass allProducts immer ein Array ist
  if (!Array.isArray(allProducts)) {
      allProducts = DEFAULT_PRODUCTS;
      saveProducts();
  }
}

function saveProducts() {
  localStorage.setItem(ALLERGEN_KEY, JSON.stringify(allProducts));
}

function renderAllergens(filter = '', category = 'all') {
  const container = $('#allergen-results');
  if (!container) return;
  
  const search = filter.toLowerCase();
  
  let filteredProducts = allProducts;

  // 1. Nach Kategorie filtern (außer "all")
  if (category !== 'all') {
    filteredProducts = filteredProducts.filter(p => p.category.toLowerCase() === category);
  }

  // 2. Nach Suchbegriff filtern
  if (search.length > 0) {
    filteredProducts = filteredProducts.filter(p => 
      p.name_de.toLowerCase().includes(search) ||
      p.allergen_de.toLowerCase().includes(search)
    );
  }

  container.innerHTML = '';
  if (filteredProducts.length === 0) {
    container.innerHTML = `<p class="text-slate-400 md:col-span-3">Keine Produkte gefunden.</p>`;
    return;
  }

  filteredProducts.forEach(product => {
    const card = document.createElement('div');
    card.className = 'card flex flex-col'; // flex-col für Button-Positionierung
    
    // Allergen-Pillen erstellen
    const allergenPills = (product.allergen_de || '')
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0)
      .map(a => `<span class="pill-allergen">${escapeHtml(a)}</span>`)
      .join(' ');

    card.innerHTML = `
      <!-- Bild mit festem Seitenverhältnis -->
      <div class="aspect-video w-full mb-3">
        <img src="${escapeHtml(product.img || 'https://placehold.co/400x300/111113/2f2f33?text=Kein+Bild')}" alt="${escapeHtml(product.name_de)}" class="w-full h-full object-cover rounded-lg" onerror="this.onerror=null;this.src='https://placehold.co/400x300/111113/2f2f33?text=Bild+fehlt';">
      </div>
      
      <div class="flex justify-between items-center">
        <h4 class="text-xl font-bold text-amber-200">${escapeHtml(product.name_de)}</h4>
        <span class="pill">${escapeHtml(product.category)}</span>
      </div>
      
      <!-- Allergen-Pillen (flex-grow, damit Buttons unten bleiben) -->
      <div class="mt-2 flex-grow">
        <span class="text-sm text-slate-400">Allergene:</span>
        <div class="flex flex-wrap mt-1">
          ${allergenPills || '<span class="text-sm text-slate-500">Keine Angabe</span>'}
        </div>
      </div>
      
      <!-- Buttons (mt-auto drückt sie nach unten) -->
      <div class="flex gap-2 mt-4 pt-4 border-t border-neutral-800">
        <!-- "admin-only" Klasse hinzugefügt -->
        <button class="btn btn-secondary flex-1 admin-only" data-edit-id="${product.id}"><i class="ph ph-pencil-simple"></i> Bearbeiten</button>
        <button class="btn btn-secondary text-red-400 admin-only" data-delete-id="${product.id}"><i class="ph ph-trash"></i></button>
      </div>
    `;
    // Event Listeners für Buttons
    card.querySelector('[data-edit-id]').addEventListener('click', () => showProductModal(product));
    card.querySelector('[data-delete-id]').addEventListener('click', () => deleteProduct(product.id));

    container.appendChild(card);
  });
  
  // Am Ende des Renderns die Admin-Buttons basierend auf dem globalen Status ein/ausblenden
  toggleAdminUI(ADMIN);
}

function showProductModal(product = null) {
  const modal = $('#product-modal');
  const title = $('#modal-title');
  const form = $('#product-form');
  
  if (!modal || !title || !form) return;

  form.reset(); // Formular zurücksetzen
  
  if (product) {
    // Bearbeiten-Modus
    title.textContent = 'Produkt bearbeiten';
    $('#product-id').value = product.id;
    $('#product-name').value = product.name_de;
    $('#product-category').value = product.category;
    $('#product-allergens').value = product.allergen_de;
    $('#product-img').value = product.img;
  } else {
    // Neu-Modus
    title.textContent = 'Neues Produkt hinzufügen';
    $('#product-id').value = ''; // Keine ID
  }
  
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('show'), 10);
}

function hideProductModal() {
  const modal = $('#product-modal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function saveProductToDB(event) {
  event.preventDefault();
  const id = $('#product-id').value;
  const productData = {
    name_de: $('#product-name').value,
    category: $('#product-category').value,
    allergen_de: $('#product-allergens').value,
    img: $('#product-img').value,
    id: id ? parseInt(id) : Date.now() // Neue ID erstellen, wenn id leer ist
  };

  if (id) {
    // Bearbeiten
    const index = allProducts.findIndex(p => p.id == id);
    if (index > -1) {
      allProducts[index] = { ...allProducts[index], ...productData };
    }
  } else {
    // Neu
    allProducts.push(productData);
  }

  saveProducts();
  renderAllergens(getActiveSearch(), getActiveCategory()); // Suche/Filter beibehalten
  hideProductModal();
}

function deleteProduct(productId) {
  if (!confirm("Soll dieses Produkt wirklich gelöscht werden?")) return;
  allProducts = allProducts.filter(p => p.id != productId);
  saveProducts();
  renderAllergens(getActiveSearch(), getActiveCategory()); // Suche/Filter beibehalten
}

// NEU: Helferfunktionen für Filter
function getActiveCategory() {
    const activeBtn = $('#allergen-filter-buttons .active');
    return activeBtn ? activeBtn.dataset.filterCategory : 'all';
}
function getActiveSearch() {
    const searchEl = $('#allergen-search');
    return searchEl ? searchEl.value : '';
}

// NEU: Zeigt/Versteckt alle Admin-Elemente
function toggleAdminUI(isAdmin) {
    $$('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'inline-flex' : 'none'; // 'inline-flex' wegen .btn
    });
    // Speziell für die Produktkarten-Buttons, die im Grid sind
    $$('#allergen-results .admin-only').forEach(el => {
        el.style.display = isAdmin ? 'inline-flex' : 'none';
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
  loadProducts(); // NEU: Produkte laden
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
      
      // NEU: Allergen-Tab rendern
      if (b.dataset.tab === 'allergene') {
        renderAllergens(getActiveSearch(), getActiveCategory()); // Beim Tab-Klick rendern
      }
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
      renderShifts(); // Aktualisiert Admin-Buttons auf Schichten-Seite
      renderAllergens(getActiveSearch(), getActiveCategory()); // Aktualisiert Admin-Buttons auf Allergen-Seite
    });
  }
  // Initiales Setzen der Admin-UI (wichtig für Allergen-Seite, falls sie zuerst geladen wird)
  toggleAdminUI(ADMIN);

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

  // --- NEUE ALLERGEN-LISTENERS ---
  on('#allergen-search', 'input', e => renderAllergens(e.target.value, getActiveCategory()));
  
  $$('[data-filter-category]').forEach(btn => {
    btn.addEventListener('click', () => {
        // Style umschalten
        $$('[data-filter-category]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Neu rendern
        renderAllergens(getActiveSearch(), getActiveCategory());
    });
  });

  on('#add-product-btn', 'click', () => showProductModal(null));
  on('#product-form', 'submit', saveProductToDB);
  // (Abbrechen-Button hat onclick im HTML)
  
  console.log('Init OK');
});