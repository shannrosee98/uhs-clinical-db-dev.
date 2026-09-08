/* =========================================================
   CMS FOUNDATION MANAGER (public/cms2.js)
   Structured editor for Phase 2 content architecture:
   Pages, Page Sections, Content Blocks, Navigation, Categories.
   Uses /api/cms-pages, /api/cms-sections, /api/cms-blocks,
   /api/cms-navigation and /api/cms-categories endpoints.
   Admin only - all routes are protected server-side.
========================================================= */

var CMS2_TYPES = {
  'page': {
    label: 'Pages', plural: 'Pages', icon: '\xf0\x9f\x93\x84',
    listEndpoint: '/api/cms-pages', nameField: 'name',
    fields: [
      { k: 'name', label: 'Name', type: 'text', required: true },
      { k: 'slug', label: 'Slug', type: 'text', required: true, placeholder: 'e.g. my-page (no spaces)' },
      { k: 'description', label: 'Description', type: 'textarea' },
      { k: 'icon', label: 'Icon (emoji)', type: 'text' },
      { k: 'parent_id', label: 'Parent page', type: 'parent', source: 'page' },
      { k: 'order_index', label: 'Order', type: 'number' },
      { k: 'template', label: 'Template', type: 'select', options: ['standard'] },
      { k: 'status', label: 'Status', type: 'select', options: ['published', 'draft', 'hidden', 'archived'] },
      { k: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'admin', 'user'] }
    ]
  },
  'page-section': {
    label: 'Page Sections', plural: 'Page Sections', icon: '\xf0\x9f\x93\x91',
    listEndpoint: '/api/cms-sections', nameField: 'title',
    fields: [
      { k: 'page_id', label: 'Parent page', type: 'select-source', source: 'page', required: true },
      { k: 'title', label: 'Title', type: 'text' },
      { k: 'section_type', label: 'Section type', type: 'select', options: ['content', 'hero', 'cards', 'gallery', 'cta'] },
      { k: 'description', label: 'Description', type: 'textarea' },
      { k: 'content', label: 'Content (JSON)', type: 'json' },
      { k: 'order_index', label: 'Order', type: 'number' }
    ]
  },
  'content-block': {
    label: 'Content Blocks', plural: 'Content Blocks', icon: '\xf0\x9f\xa7\xa9',
    listEndpoint: '/api/cms-blocks', nameField: 'title',
    fields: [
      { k: 'block_key', label: 'Block key', type: 'text', required: true, placeholder: 'e.g. hero-title' },
      { k: 'block_type', label: 'Block type', type: 'select', options: ['text', 'heading', 'image', 'card', 'button', 'table', 'procedure', 'medication', 'equipment', 'emergency', 'rp', 'tts', 'alert', 'checklist', 'accordion', 'document', 'video'] },
      { k: 'title', label: 'Title', type: 'text' },
      { k: 'category', label: 'Category', type: 'text' },
      { k: 'page_id', label: 'Page', type: 'select-source', source: 'page' },
      { k: 'section_id', label: 'Section', type: 'select-source', source: 'section' },
      { k: 'content', label: 'Content (JSON)', type: 'json' }
    ]
  },
  'navigation': {
    label: 'Navigation', plural: 'Nav items', icon: '\xf0\x9f\xa7\xad',
    listEndpoint: '/api/cms-navigation', nameField: 'label',
    fields: [
      { k: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. EMS' },
      { k: 'url', label: 'URL', type: 'text', placeholder: '/abcde or https://...' },
      { k: 'icon', label: 'Icon (emoji)', type: 'text' },
      { k: 'page_id', label: 'Link to page', type: 'select-source', source: 'page' },
      { k: 'parent_id', label: 'Parent item', type: 'parent', source: 'navigation' },
      { k: 'order_index', label: 'Order', type: 'number' },
      { k: 'target', label: 'Open in', type: 'select', options: ['_self', '_blank'] },
      { k: 'is_external', label: 'External link', type: 'checkbox' },
      { k: 'role_required', label: 'Role required', type: 'select', options: ['', 'admin', 'member'] },
      { k: 'status', label: 'Status', type: 'select', options: ['published', 'draft', 'hidden', 'archived'] },
      { k: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'admin', 'user'] }
    ]
  },
  'category': {
    label: 'Categories', plural: 'Categories', icon: '\xf0\x9f\x8f\xb7\xef\xb8\x8f',
    listEndpoint: '/api/cms-categories', nameField: 'name',
    fields: [
      { k: 'name', label: 'Name', type: 'text', required: true },
      { k: 'slug', label: 'Slug', type: 'text', required: true, placeholder: 'e.g. airway' },
      { k: 'content_type', label: 'Used for', type: 'select', options: ['generic', 'procedure', 'medication', 'equipment', 'emergency', 'rp_action', 'tts_action', 'document'] },
      { k: 'description', label: 'Description', type: 'textarea' },
      { k: 'icon', label: 'Icon (emoji)', type: 'text' },
      { k: 'parent_id', label: 'Parent category', type: 'parent', source: 'category' },
      { k: 'order_index', label: 'Order', type: 'number' }
    ]
  }
};

var cms2CurrentType = 'page';
var cms2EditId = null;
var cms2Cache = {};
var cms2Sources = { page: [], section: [], navigation: [], category: [] };

function cms2Init() {
  var sel = document.getElementById('cms2TypeSelect');
  if (!sel) return;
  var opts = '';
  Object.keys(CMS2_TYPES).forEach(function(t) {
    opts += '<option value="' + t + '">' + CMS2_TYPES[t].icon + ' ' + CMS2_TYPES[t].label + '</option>';
  });
  sel.innerHTML = opts;
  cms2RefreshSources();
  cms2List();
}

async function cms2RefreshSources() {
  var sources = { page: '/api/cms-pages', section: '/api/cms-sections', navigation: '/api/cms-navigation', category: '/api/cms-categories' };
  for (var key in sources) {
    try {
      var res = await api(sources[key]);
      var rows = res && (res.pages || res.sections || res.items || res.categories || res.blocks || []);
      cms2Sources[key] = rows || [];
    } catch(e) { cms2Sources[key] = []; }
  }
}

function cms2LabelFor(type, id) {
  if (!id) return '';
  var src = cms2Sources[type] || [];
  for (var i = 0; i < src.length; i++) {
    if (String(src[i].id) === String(id)) return src[i].name || src[i].title || src[i].label || id;
  }
  return String(id);
}

async function cms2List() {
  var sel = document.getElementById('cms2TypeSelect');
  if (sel) cms2CurrentType = sel.value || 'page';
  var def = CMS2_TYPES[cms2CurrentType] || {};
  var container = document.getElementById('cms2List');
  if (!container) return;
  container.innerHTML = '<p class="muted">Loading...</p>';
  try {
    var res = await api(def.listEndpoint);
    var rows = res && (res.pages || res.sections || res.items || res.blocks || res.categories || []);
    cms2Cache[cms2CurrentType] = rows || [];
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCED</div><h3>No ' + (def.plural || def.label) + ' yet</h3><p>Click "+ Add" to create your first one.</p></div>';
      return;
    }
    var html = '';
    rows.forEach(function(it) {
      var name = it[def.nameField] || it.name || it.label || it.title || it.block_key || it.id;
      var badge = (it.status && it.status !== 'published') ? '<span style="display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:' + (it.status === 'hidden' ? '#3b2026;color:#f1c6cc' : '#352b18;color:#e6d09b') + ';border:1px solid #44596b;margin-left:6px">' + it.status.toUpperCase() + '</span>' : '';
      var info = [];
      if (it.slug) info.push(it.slug);
      if (it.url) info.push(it.url);
      if (it.block_type) info.push(it.block_type);
      html += '<div class="staff-row" style="grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 12px">';
      html += '<span style="font-size:18px">' + (def.icon || '\uD83D\uDCC4') + '</span>';
      html += '<div><strong style="color:#eaf2f4">' + escapeHtml(name) + '</strong>' + badge + '<br><span style="font-size:11px;color:#7a95a3">' + escapeHtml(info.join(' \u2022 ')) + '</span></div>';
      html += '<div style="display:flex;gap:5px;flex-wrap:wrap">';
      html += '<button class="edit-small" onclick="cms2OpenEditor(\'' + it.id + '\')">\u270F\uFE0F</button>';
      html += '<button class="secondary" onclick="cms2Duplicate(\'' + it.id + '\')" title="Duplicate">\u2B09</button>';
      if (it.status !== 'published') html += '<button class="secondary" onclick="cms2SetStatus(\'' + it.id + '\',\'published\')" title="Publish">\u2705</button>';
      html += '<button class="danger-small" onclick="cms2Delete(\'' + it.id + '\')">\u2716</button>';
      html += '</div></div>';
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div class="empty-state"><h3>Could not load</h3><p>' + escapeHtml((e && e.message) || 'Unknown error') + '</p></div>';
  }
}

function cms2FieldInput(field, value) {
  var v = value === undefined || value === null ? '' : value;
  var required = field.required ? ' <span style="color:#a9313e">*</span>' : '';
  var html = '<label style="display:block;margin:6px 0"><span style="font-weight:600;font-size:13px;color:#c9d6da">' + field.label + required + '</span>';
  if (field.type === 'text') {
    return html + '<input type="text" data-f="' + field.k + '" value="' + escapeHtml(String(v)) + '" placeholder="' + (field.placeholder||'') + '" style="width:100%"></label>';
  }
  if (field.type === 'textarea') {
    return html + '<textarea data-f="' + field.k + '" rows="3" style="width:100%">' + escapeHtml(String(v)) + '</textarea></label>';
  }
  if (field.type === 'number') {
    return html + '<input type="number" data-f="' + field.k + '" value="' + Number(v || 0) + '" style="width:100%"></label>';
  }
  if (field.type === 'checkbox') {
    return '<label style="display:flex;align-items:center;gap:8px;margin:8px 0"><input type="checkbox" data-f="' + field.k + '" ' + (v ? 'checked' : '') + '> <span style="font-weight:600;font-size:13px;color:#c9d6da">' + field.label + '</span></label>';
  }
  if (field.type === 'select' || field.type === 'select-source' || field.type === 'parent') {
    var opts = '<option value="">(none)</option>';
    if (field.options) {
      field.options.forEach(function(o) { opts += '<option value="' + o + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + escapeHtml(o||'(none)') + '</option>'; });
    }
    var src = cms2Sources[field.source] || [];
    if (field.source && src.length) {
      src.forEach(function(it) {
        if (field.type === 'parent' && String(it.id) === String(cms2EditId)) return;
        var nm = it.name || it.title || it.label || it.block_key || it.id;
        opts += '<option value="' + it.id + '"' + (String(v) === String(it.id) ? ' selected' : '') + '>' + escapeHtml(nm) + '</option>';
      });
    }
    return html + '<select data-f="' + field.k + '" style="width:100%">' + opts + '</select></label>';
  }
  if (field.type === 'json') {
    var txt = (v && typeof v === 'object') ? JSON.stringify(v, null, 2) : String(v||'');
    return html + '<textarea data-f="' + field.k + '" rows="5" style="width:100%;font-family:monospace;font-size:12px">' + escapeHtml(txt) + '</textarea></label>';
  }
  return '';
}

function cms2OpenEditor(id) {
  var editor = document.getElementById('cms2Editor');
  var titleEl = document.getElementById('cms2EditorTitle');
  var body = document.getElementById('cms2Form');
  if (!editor || !body) return;
  cms2EditId = id || null;
  var def = CMS2_TYPES[cms2CurrentType] || {};
  titleEl.textContent = (id ? 'Edit' : 'Add') + ' ' + (def.label || cms2CurrentType);
  var item = null;
  if (id) {
    (cms2Cache[cms2CurrentType] || []).forEach(function(r) { if (String(r.id) === String(id)) item = r; });
  }
  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">';
  def.fields.forEach(function(f) { html += cms2FieldInput(f, item ? item[f.k] : undefined); });
  html += '</div>';
  body.innerHTML = html;
  editor.style.display = 'block';
  editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cms2CloseEditor() {
  var editor = document.getElementById('cms2Editor');
  if (editor) editor.style.display = 'none';
  cms2EditId = null;
}

async function cms2Save() {
  var def = CMS2_TYPES[cms2CurrentType] || {};
  var body = document.getElementById('cms2Form');
  if (!body) return;
  var data = {};
  for (var i = 0; i < def.fields.length; i++) {
    var f = def.fields[i];
    var el = body.querySelector('[data-f="' + f.k + '"]');
    if (!el) { data[f.k] = null; continue; }
    if (f.type === 'checkbox') { data[f.k] = !!el.checked; continue; }
    if (f.type === 'number') { data[f.k] = parseInt(el.value, 10) || 0; continue; }
    if (f.type === 'json') {
      try { data[f.k] = (el.value||'').trim() ? JSON.parse(el.value) : null; }
      catch(e2) { showToast('Invalid JSON in ' + f.label, 'error'); return; }
      continue;
    }
    data[f.k] = el.value;
  }
  for (var j = 0; j < def.fields.length; j++) {
    if (def.fields[j].required && !data[def.fields[j].k]) {
      showToast('"' + def.fields[j].label + '" is required', 'error'); return;
    }
  }
  try {
    if (cms2EditId) {
      await api(def.listEndpoint + '/' + cms2EditId, { method: 'PUT', body: data });
    } else {
      await api(def.listEndpoint, { method: 'POST', body: data });
    }
    showToast('Saved', 'success');
    cms2CloseEditor();
    await cms2RefreshSources();
    await cms2List();
  } catch(e) {
    showToast('Save failed: ' + ((e&&e.message)||''), 'error');
  }
}

async function cms2Delete(id) {
  if (!confirm('Delete this item? It can be restored later.')) return;
  var def = CMS2_TYPES[cms2CurrentType] || {};
  try {
    await api(def.listEndpoint + '/' + id, { method: 'DELETE' });
    showToast('Deleted', 'success');
    await cms2List();
  } catch(e) { showToast('Delete failed', 'error'); }
}

async function cms2Duplicate(id) {
  var def = CMS2_TYPES[cms2CurrentType] || {};
  try {
    await api(def.listEndpoint + '/' + id + '/duplicate', { method: 'POST' });
    showToast('Duplicated', 'success');
    await cms2RefreshSources();
    await cms2List();
  } catch(e) {
    showToast('Duplicate failed', 'error');
  }
}

async function cms2SetStatus(id, status) {
  var def = CMS2_TYPES[cms2CurrentType] || {};
  try {
    await api(def.listEndpoint + '/' + id, { method: 'PUT', body: { status: status } });
    showToast('Status updated', 'success');
    await cms2List();
  } catch(e) { showToast('Failed', 'error'); }
}

window.cms2Init = cms2Init;
window.cms2List = cms2List;
window.cms2OpenEditor = cms2OpenEditor;
window.cms2CloseEditor = cms2CloseEditor;
window.cms2Save = cms2Save;
window.cms2Delete = cms2Delete;
window.cms2Duplicate = cms2Duplicate;
window.cms2SetStatus = cms2SetStatus;
