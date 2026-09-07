/* =========================================================
   CMS MANAGER ENGINE (public/cms.js)
   Generic CRUD manager for every content type.
========================================================= */

var CMS_TYPES = {
  'medication':   { label: 'Medications',      icon: '💊', fields: ['name','use','route','dose','indication','contraindications','cautions','monitoring','rp','emote'] },
  'procedure':    { label: 'Procedures',       icon: '🩺', fields: ['name','category','indication','equipment','prep','steps','rp','questions','reassessment','documentation','slideUrl'] },
  'equipment':    { label: 'Equipment',        icon: '💰', fields: ['name','category','purpose','whenUsed','rp','relatedProcedures'] },
  'emergency':    { label: 'Emergencies',      icon: '🚨', fields: ['title','priorities','assessment','rp','questions','observations','procedures','reassessment','handover'] },
  'question':     { label: 'Patient Questions',icon: '❓', fields: ['category','text','situation','tags'] },
  'surgery':      { label: 'Surgeries',        icon: '🏥', fields: ['name','indications','risks','equipment','checklist','questions','rp'] },
  'rp-action':    { label: 'RP Actions',       icon: '🎭', fields: ['name','command','emote','location','category','description','tags'] },
  'scene':        { label: 'Scenes',           icon: '🚗', fields: ['name','description','presentation','observations','actions','questions','procedures','medications','transport','handover','slideUrl'] },
  'section-text': { label: 'Section Text',     icon: '📝', fields: ['section','html'] },
  'nav':          { label: 'Navigation',       icon: '🧭', fields: ['label','section','icon','order'] },
  'theme':        { label: 'Theme',            icon: '🎨', fields: ['siteTitle','badge','tagline','accent','heading','cardTint'] }
};

var cmsCurrentType = 'medication';
var cmsCurrentKey = null;
var cmsListCache = {};

function cmsInit() {
  var sel = document.getElementById('cmsTypeSelect');
  if (sel === null || sel === undefined) return;
  var options = '';
  Object.keys(CMS_TYPES).forEach(function(t) {
    options += '<option value="' + t + '">' + CMS_TYPES[t].icon + ' ' + CMS_TYPES[t].label + '</option>';
  });
  sel.innerHTML = options;
  sel.value = cmsCurrentType;
  cmsLoadThemeFields();
  cmsRenderList();
}

function cmsUpdateEditorHint() {
  var hint = document.getElementById('cmsEditorHint');
  if (hint === null || hint === undefined) return;
  var def = CMS_TYPES[cmsCurrentType] || {};
  hint.textContent = 'Fields for ' + (def.label || cmsCurrentType) + ': ' + (def.fields || []).join(', ');
}

async function cmsRenderList() {
  var sel = document.getElementById('cmsTypeSelect');
  if (sel !== null && sel !== undefined) cmsCurrentType = sel.value || 'medication';
  var container = document.getElementById('cmsList');
  if (container === null || container === undefined) return;
  container.innerHTML = '<p class="muted">Loading...</p>';
  try {
    var res = await api('/api/cms/' + encodeURIComponent(cmsCurrentType));
    var items = (res && res.items) || [];
    cmsListCache[cmsCurrentType] = items;
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>No items yet</h3><p>Click "Seed Defaults" to load the built-in ones, or "+ Add Item" to create your own.</p></div>';
      cmsUpdateEditorHint();
      return;
    }
    var html = '';
    items.forEach(function(it, i) {
      var name = it.item_name || '';
      var preview = '';
      try {
        var obj = typeof it.content === 'string' ? JSON.parse(it.content) : it.content;
        preview = (obj && (obj.name || obj.title || obj.text || obj.command || obj.section || obj.label)) || '';
      } catch(e) {}
      html += '<div class="staff-row" style="grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 12px">';
      html += '<span style="color:#7a95a3;font-size:12px">' + (i + 1) + '.</span>';
      html += '<div style="min-width:0">';
      html += '<h4 style="margin:0;color:#eaf2f4;font-size:14px">' + escapeHtml(name || preview || it.content_key) + '</h4>';
      html += '<p style="margin:2px 0 0;color:#7a95a3;font-size:11px;word-break:break-word">' + escapeHtml(preview || it.content_key) + '</p>';
      html += '</div>';
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">';
      html += '<button class="edit-small" onclick="cmsOpenEditor(\'' + it.content_key + '\')">Edit</button>';
      html += '<button class="edit-small" onclick="cmsTogglePublish(\'' + it.content_key + '\',' + (it.is_published ? 0 : 1) + ')">' + (it.is_published ? '👁 Hide' : '🙈 Show') + '</button>';
      html += '<button class="edit-small" onclick="cmsDuplicate(\'' + it.content_key + '\')">Copy</button>';
      html += '<button class="edit-small" onclick="cmsMoveItem(\'' + it.content_key + '\',-1)">▲</button>';
      html += '<button class="edit-small" onclick="cmsMoveItem(\'' + it.content_key + '\',1)">▼</button>';
      html += '<button class="danger-small" onclick="cmsDelete(\'' + it.content_key + '\')">✕</button>';
      html += '</div>';
      html += '</div>';
    });
    container.innerHTML = html;
  } catch(e) {
    console.error('CMS list error', e);
    container.innerHTML = '<div class="empty-state"><h3>Could not load items</h3><p>Check the server is running and you are signed in as admin.</p></div>';
  }
  cmsUpdateEditorHint();
}

function cmsOpenEditor(key) {
  var editor = document.getElementById('cmsEditor');
  var title = document.getElementById('cmsEditorTitle');
  var keyEl = document.getElementById('cmsKey');
  var nameEl = document.getElementById('cmsName');
  var contentEl = document.getElementById('cmsContent');
  var slideUrlRow = document.getElementById('cmsSlideUrlRow');
  var slideUrlEl = document.getElementById('cmsSlideUrl');
  if (editor === null || keyEl === null || contentEl === null) return;
  cmsCurrentKey = key;
  var def = CMS_TYPES[cmsCurrentType] || {};
  title.textContent = (key ? 'Edit' : 'Add') + ' ' + (def.label || cmsCurrentType) + ' Item';
  keyEl.value = '';
  nameEl.value = '';
  contentEl.value = '{\n  "name": ""\n}';
  if (slideUrlEl) slideUrlEl.value = '';
  /* Show slideUrl field only for procedures and scenes */
  if (slideUrlRow) slideUrlRow.style.display = (cmsCurrentType === 'procedure' || cmsCurrentType === 'scene') ? '' : 'none';
  keyEl.disabled = Boolean(key);
  if (key) {
    var items = cmsListCache[cmsCurrentType] || [];
    var found = null;
    items.forEach(function(it) { if (it.content_key === key) found = it; });
    if (found) {
      keyEl.value = found.content_key;
      nameEl.value = found.item_name || '';
      var content = typeof found.content === 'string' ? JSON.parse(found.content) : found.content;
      contentEl.value = JSON.stringify(content, null, 2);
      if (slideUrlEl && content && content.slideUrl) slideUrlEl.value = content.slideUrl;
    } else {
      (async function() {
        try {
          var res = await api('/api/cms/item/' + encodeURIComponent(key));
          if (res && res.item) {
            keyEl.value = res.item.content_key;
            nameEl.value = res.item.item_name || '';
            var content = typeof res.item.content === 'string' ? JSON.parse(res.item.content) : res.item.content;
            contentEl.value = JSON.stringify(content, null, 2);
            if (slideUrlEl && content && content.slideUrl) slideUrlEl.value = content.slideUrl;
          }
        } catch(e) {}
      })();
    }
  }
  editor.style.display = 'block';
  cmsUpdateEditorHint();
  editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cmsCloseEditor() {
  var editor = document.getElementById('cmsEditor');
  if (editor !== null && editor !== undefined) editor.style.display = 'none';
  cmsCurrentKey = null;
}

async function cmsSaveItem() {
  var keyEl = document.getElementById('cmsKey');
  var nameEl = document.getElementById('cmsName');
  var contentEl = document.getElementById('cmsContent');
  var slideUrlEl = document.getElementById('cmsSlideUrl');
  if (keyEl === null || contentEl === null) return;
  var key = keyEl.value.trim();
  var name = nameEl.value.trim();
  var contentText = contentEl.value.trim();
  if (key === '') { showToast('Enter a key (stable id)', 'error'); return; }
  if (false === /^[a-zA-Z0-9_-]+$/.test(key)) { showToast('Key must be lowercase letters, numbers, dash or underscore', 'error'); return; }
  var content = {};
  try {
    content = JSON.parse(contentText || '{}');
  } catch(e) {
    showToast('Content must be valid JSON', 'error');
    return;
  }
  /* Inject slideUrl from the dedicated field if visible */
  if (slideUrlEl && (cmsCurrentType === 'procedure' || cmsCurrentType === 'scene')) {
    var url = slideUrlEl.value.trim();
    if (url) {
      content.slideUrl = url;
    } else {
      delete content.slideUrl;
    }
  }
  if (name === '' && content.name) name = content.name;
  if (name === '' && content.title) name = content.title;
  if (name === '') name = key;
  var orderIndex = cmsListCache[cmsCurrentType] ? cmsListCache[cmsCurrentType].length : 0;
  try {
    await api('/api/cms/' + encodeURIComponent(cmsCurrentType) + '/' + encodeURIComponent(key), {
      method: 'PUT',
      body: { content: content, itemName: name, orderIndex: orderIndex }
    });
    showToast('Saved: ' + name, 'success');
    cmsCurrentKey = null;
    cmsCloseEditor();
    await cmsRenderList();
  } catch(e) {
    showToast('Save failed: ' + (e && e.message || ''), 'error');
  }
}

async function cmsDelete(key) {
  if (false === confirm('Delete this item? The built-in default (if any) will be restored on next load.')) return;
  try {
    await api('/api/cms/item/' + encodeURIComponent(key), { method: 'DELETE' });
    showToast('Deleted', 'success');
    await cmsRenderList();
  } catch(e) {
    showToast('Delete failed', 'error');
  }
}

function cmsDeleteCurrent() {
  if (cmsCurrentKey) cmsDelete(cmsCurrentKey);
}

async function cmsTogglePublish(key, val) {
  try {
    var items = cmsListCache[cmsCurrentType] || [];
    var found = null;
    items.forEach(function(it) { if (it.content_key === key) found = it; });
    var content = found ? found.content : {};
    var name = found ? found.item_name : key;
    await api('/api/cms/' + encodeURIComponent(cmsCurrentType) + '/' + encodeURIComponent(key), {
      method: 'PUT',
      body: { content: content, itemName: name, isPublished: Boolean(val) }
    });
    showToast(val ? 'Shown' : 'Hidden', 'success');
    await cmsRenderList();
  } catch(e) {
    showToast('Toggle failed', 'error');
  }
}

async function cmsDuplicate(key) {
  try {
    var items = cmsListCache[cmsCurrentType] || [];
    var found = null;
    items.forEach(function(it) { if (it.content_key === key) found = it; });
    if (found === null || found === undefined) return;
    var content = JSON.parse(JSON.stringify(found.content));
    if (content && typeof content === 'object' && false === Array.isArray(content)) {
      if (content.name) content.name = content.name + ' (Copy)';
      if (content.title) content.title = content.title + ' (Copy)';
    }
    var newKey = key + '-copy';
    await api('/api/cms/' + encodeURIComponent(cmsCurrentType) + '/' + encodeURIComponent(newKey), {
      method: 'PUT',
      body: { content: content, itemName: (found.item_name || key) + ' (Copy)', orderIndex: (cmsListCache[cmsCurrentType] || []).length }
    });
    showToast('Duplicated', 'success');
    await cmsRenderList();
  } catch(e) {
    showToast('Duplicate failed', 'error');
  }
}

async function cmsMoveItem(key, dir) {
  try {
    var items = cmsListCache[cmsCurrentType] || [];
    items = items.slice().sort(function(a, b) { return (a.order_index || 0) - (b.order_index || 0); });
    var idx = -1;
    items.forEach(function(it, i) { if (it.content_key === key) idx = i; });
    var ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= items.length) return;
    var tmp = items[idx].order_index;
    items[idx].order_index = items[ni].order_index;
    items[ni].order_index = tmp;
    await Promise.all(items.map(function(it) {
      return api('/api/cms/' + encodeURIComponent(cmsCurrentType) + '/' + encodeURIComponent(it.content_key), {
        method: 'PUT',
        body: { content: it.content, itemName: it.item_name, orderIndex: it.order_index }
      });
    }));
    await cmsRenderList();
  } catch(e) {
    showToast('Reorder failed', 'error');
  }
}

/* ---- Seed defaults from built-in JS data ---- */
function cmsBuildSeed(type) {
  var out = [];
  try {
    if (type === 'procedure') {
      Object.keys(proceduresData).forEach(function(k) {
        var p = proceduresData[k];
        var name = k.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
        out.push({ key: k, itemName: name, content: p });
      });
    } else if (type === 'equipment') {
      Object.keys(equipmentData).forEach(function(cat) {
        var list = equipmentData[cat];
        (list || []).forEach(function(it) {
          var n = it.name || it.title || 'item';
          var key = 'eq-' + cat + '-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          out.push({ key: key, itemName: n, content: { category: cat, name: n, purpose: it.purpose, rp: it.rp } });
        });
      });
    } else if (type === 'emergency') {
      Object.keys(emergencyData).forEach(function(k) {
        var e = emergencyData[k];
        out.push({ key: k, itemName: e.title || e.name || k, content: e });
      });
    } else if (type === 'question') {
      Object.keys(patientQuestionLib).forEach(function(cat) {
        var list = patientQuestionLib[cat];
        (list || []).forEach(function(q) {
          var clean = q.replace('/tts ', '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          out.push({ key: 'q-' + (clean || Math.random().toString(36).slice(2, 8)), itemName: q.replace('/tts ', '').slice(0, 50), content: { category: cat, text: q, situation: '' } });
        });
      });
    } else if (type === 'rp-action') {
      out.push({ key: 'rp-default-1', itemName: 'General assessment', content: { name: 'General assessment', command: 'introduces themselves, confirms the patient identity and starts the assessment', emote: 'mechanic', location: 'standing', category: 'General', description: '', tags: ['assessment'] } });
      out.push({ key: 'rp-default-2', itemName: 'Apply BP cuff', content: { name: 'Apply BP cuff', command: 'applies the blood pressure cuff to the upper arm and positions it at heart level', emote: 'mechanic', location: 'standing', category: 'Observation', description: '', tags: ['bp', 'observation'] } });
      out.push({ key: 'rp-default-3', itemName: 'Check breathing', content: { name: 'Check breathing', command: 'observes the patient breathing pattern and counts the respiratory rate', emote: 'mechanic', location: 'standing', category: 'Assessment', description: '', tags: ['rr', 'respiratory'] } });
      out.push({ key: 'rp-default-4', itemName: 'Check pupils', content: { name: 'Check pupils', command: 'checks the patient responsiveness and assesses pupils for size and reaction', emote: 'mechanic', location: 'standing', category: 'Neuro', description: '', tags: ['pupils', 'neuro'] } });
    } else if (type === 'nav') {
      var labels = { dashboard:'Dashboard', abcde:'ABCDE', observations:'Observations', cardiac:'Cardiac', respiratory:'Respiratory', trauma:'Trauma', neuro:'Neurological', emergencies:'Emergencies', 'emergency-mode':'Emergency Mode', procedures:'Procedures', surgeries:'Surgeries', meds:'Medications', equipment:'Equipment', fluids:'Fluids', blood:'Blood', scenes:'Incident Scenes', documentation:'Documentation', pain:'Pain', rp:'RP Actions' };
      Object.keys(labels).forEach(function(s, i) {
        out.push({ key: 'nav-' + s, itemName: labels[s], content: { label: labels[s], section: s, icon: '', order: i } });
      });
    } else if (type === 'section-text') {
      var secs = ['dashboard','abcde','observations','cardiac','respiratory','trauma','neuro','emergencies','procedures','meds','equipment','fluids','blood','scenes','documentation','pain','rp'];
      secs.forEach(function(s, i) {
        out.push({ key: 'section-' + s, itemName: s, content: { section: s, html: '' } });
      });
    } else if (type === 'surgery') {
      Object.keys(surgeriesData).forEach(function(k) {
        var s = surgeriesData[k];
        var name = k.replace(/([A-Z])/g, ' $1').replace(/^./, function(x) { return x.toUpperCase(); });
        out.push({ key: 'surgery-' + k, itemName: name, content: s });
      });
    }
  } catch(e) {
    console.error('Seed build error', e);
  }
  return out;
}

function cmsSeedDefaults() {
  if (false === confirm('Load the built-in defaults for this section into the database? Existing items are updated, new ones added.')) return;
  var seeds = cmsBuildSeed(cmsCurrentType);
  if (seeds.length === 0) {
    showToast('No defaults available for this type', 'info');
    return;
  }
  api('/api/cms/seed', { method: 'POST', body: { content_type: cmsCurrentType, items: seeds } })
    .then(function(res) {
      showToast('Seeded ' + (res && res.seeded || 0) + ' items', 'success');
      cmsRenderList();
    })
    .catch(function(e) {
      showToast('Seed failed: ' + (e && e.message || ''), 'error');
    });
}

function cmsResetType() {
  if (false === confirm('Reset this section? All customisations for this content type will be deleted and built-in defaults restored on next load.')) return;
  api('/api/cms/reset', { method: 'POST', body: { content_type: cmsCurrentType } })
    .then(function() {
      showToast('Section reset', 'success');
      cmsRenderList();
    })
    .catch(function(e) { showToast('Reset failed', 'error'); });
}

/* ---- Theme controls ---- */
function cmsLoadThemeFields() {
  var titleEl = document.getElementById('themeTitle');
  var badgeEl = document.getElementById('themeBadge');
  var tagEl = document.getElementById('themeTagline');
  var accEl = document.getElementById('themeAccent');
  var headEl = document.getElementById('themeHeading');
  var tintEl = document.getElementById('themeCardTint');
  if (titleEl === null || titleEl === undefined) return;
  var saved = localStorage.getItem('cms_theme');
  var theme = {};
  if (saved) { try { theme = JSON.parse(saved); } catch(e) {} }
  titleEl.value = theme.siteTitle || document.title || '';
  var badgeText = 'FIVEM';
  var badgeNode = document.querySelector('.fivem-badge, .nhs-badge');
  if (badgeNode) badgeText = badgeNode.textContent;
  badgeEl.value = theme.badge || badgeText;
  var tagNode = document.querySelector('.topbar p');
  tagEl.value = theme.tagline || (tagNode ? tagNode.textContent : '');
  accEl.value = theme.accent || '#41b6e6';
  headEl.value = theme.heading || '#eaf2f4';
  tintEl.value = theme.cardTint || '#0c1922';
  cmsApplyTheme(theme);
}

function cmsApplyTheme(theme) {
  if (false === theme || typeof theme !== 'object') theme = {};
  if (theme.siteTitle) document.title = theme.siteTitle;
  if (theme.badge) { var b = document.querySelector('.fivem-badge, .nhs-badge'); if (b) b.textContent = theme.badge; }
  if (theme.tagline) { var p = document.querySelector('.topbar p'); if (p) p.textContent = theme.tagline; }
  var r = document.documentElement.style;
  if (theme.accent) r.setProperty('--cms-accent', theme.accent);
  if (theme.heading) r.setProperty('--cms-heading', theme.heading);
  if (theme.cardTint) r.setProperty('--cms-cardtint', theme.cardTint);
}

async function cmsSaveTheme() {
  var titleEl = document.getElementById('themeTitle');
  var badgeEl = document.getElementById('themeBadge');
  var tagEl = document.getElementById('themeTagline');
  var accEl = document.getElementById('themeAccent');
  var headEl = document.getElementById('themeHeading');
  var tintEl = document.getElementById('themeCardTint');
  if (titleEl === null || titleEl === undefined) return;
  var theme = {
    siteTitle: titleEl.value,
    badge: badgeEl.value,
    tagline: tagEl.value,
    accent: accEl.value,
    heading: headEl.value,
    cardTint: tintEl.value
  };
  localStorage.setItem('cms_theme', JSON.stringify(theme));
  try {
    await api('/api/cms/theme/theme', {
      method: 'PUT',
      body: { content: theme, itemName: 'Current theme' }
    });
  } catch(e) {
    console.warn('Theme DB save skipped', e);
  }
  cmsApplyTheme(theme);
  showToast('Branding saved', 'success');
}

function cmsResetTheme() {
  if (false === confirm('Reset branding to defaults?')) return;
  localStorage.removeItem('cms_theme');
  document.title = 'FiveM \u2022 EMS Clinical Reference';
  var b = document.querySelector('.fivem-badge, .nhs-badge'); if (b) b.textContent = 'FIVEM';
  var p = document.querySelector('.topbar p'); if (p) p.textContent = 'Serious FiveM roleplay reference \u2022 UK terminology \u2022 quick clinical notes';
  try { api('/api/cms/item/theme', { method: 'DELETE' }); } catch(e) {}
  cmsLoadThemeFields();
  showToast('Branding reset', 'success');
}

/* ---- Backup / import ---- */
async function cmsExportAll() {
  var data = { app: 'UHS-CMS', version: 1, exportedAt: new Date().toISOString(), types: {} };
  var types = Object.keys(CMS_TYPES);
  for (var i = 0; i < types.length; i++) {
    var t = types[i];
    try {
      var res = await api('/api/cms/' + encodeURIComponent(t));
      data.types[t] = (res && res.items) || [];
    } catch(e) { data.types[t] = []; }
  }
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'UHS-CMS-Backup.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
  showToast('CMS backup exported', 'success');
}

function cmsImportAll(input) {
  var file = input.files && input.files[0];
  if (false === file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (false === data.types) throw new Error('Not a valid CMS backup');
      var types = Object.keys(data.types);
      var promises = [];
      types.forEach(function(t) {
        (data.types[t] || []).forEach(function(it) {
          if (false === (it && it.content_key)) return;
          promises.push(api('/api/cms/' + encodeURIComponent(t) + '/' + encodeURIComponent(it.content_key), {
            method: 'PUT',
            body: { content: it.content, itemName: it.item_name, orderIndex: it.order_index, isPublished: it.is_published }
          }));
        });
      });
      Promise.all(promises).then(function() {
        showToast('CMS backup imported (' + promises.length + ' items)', 'success');
        cmsRenderList();
      }).catch(function() {
        showToast('Import partially failed', 'error');
      });
    } catch(err) {
      showToast('Invalid backup file', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

window.cmsInit = cmsInit;
window.cmsRenderList = cmsRenderList;
window.cmsOpenEditor = cmsOpenEditor;
window.cmsCloseEditor = cmsCloseEditor;
window.cmsSaveItem = cmsSaveItem;
window.cmsDelete = cmsDelete;
window.cmsDeleteCurrent = cmsDeleteCurrent;
window.cmsTogglePublish = cmsTogglePublish;
window.cmsDuplicate = cmsDuplicate;
window.cmsMoveItem = cmsMoveItem;
window.cmsSeedDefaults = cmsSeedDefaults;
window.cmsResetType = cmsResetType;
window.cmsSaveTheme = cmsSaveTheme;
window.cmsResetTheme = cmsResetTheme;
window.cmsExportAll = cmsExportAll;
window.cmsImportAll = cmsImportAll;
