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
      { k: 'slug', label: 'Page address (automatic)', type: 'text', required: true, placeholder: 'Generated from the name' },
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
      { k: 'content', label: 'Content', type: 'visual-json' },
      { k: 'order_index', label: 'Order', type: 'number' },
      { k: 'status', label: 'Status', type: 'select', options: ['published', 'draft', 'hidden', 'archived'] },
      { k: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'admin', 'user'] }
    ]
  },
  'content-block': {
    label: 'Content Blocks', plural: 'Content Blocks', icon: '\xf0\x9f\xa7\xa9',
    listEndpoint: '/api/cms-blocks', nameField: 'title',
    fields: [
      { k: 'block_key', label: 'Internal ID (automatic)', type: 'text', required: true, placeholder: 'Generated automatically' },
      { k: 'block_type', label: 'Content type', type: 'select', required: true, options: ['text', 'heading', 'image', 'card', 'button', 'table', 'procedure', 'medication', 'equipment', 'emergency', 'surgery', 'scene', 'rp', 'tts', 'alert', 'checklist', 'accordion', 'document', 'video'] },
      { k: 'title', label: 'Title', type: 'text' },
      { k: 'category', label: 'Category', type: 'text' },
      { k: 'page_id', label: 'Page', type: 'select-source', source: 'page' },
      { k: 'section_id', label: 'Section', type: 'select-source', source: 'section' },
      { k: 'content', label: 'Content', type: 'visual-json' },
      { k: 'status', label: 'Status', type: 'select', options: ['published', 'draft', 'hidden', 'archived'] },
      { k: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'admin', 'user'] }
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
      { k: 'content_type', label: 'Used for', type: 'select', required: true, options: ['generic', 'procedure', 'medication', 'equipment', 'emergency', 'rp_action', 'tts_action', 'document'] },
      { k: 'description', label: 'Description', type: 'textarea' },
      { k: 'icon', label: 'Icon (emoji)', type: 'text' },
      { k: 'parent_id', label: 'Parent category', type: 'parent', source: 'category' },
      { k: 'order_index', label: 'Order', type: 'number' },
      { k: 'status', label: 'Status', type: 'select', options: ['published', 'draft', 'hidden', 'archived'] },
      { k: 'visibility', label: 'Visibility', type: 'select', options: ['public', 'admin', 'user'] }
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

async function cms4LoadOverview() {
  var host = document.getElementById('cms4CoreStats');
  if (!host) return;
  try {
    var data = await api('/api/admin/cms-overview');
    var items = [
      ['Pages', data.pages], ['Sections', data.sections], ['Blocks', data.blocks],
      ['Navigation', data.navigation], ['Categories', data.categories], ['Revisions', data.versions]
    ];
    host.innerHTML = items.map(function(pair) {
      var d = pair[1] || {};
      var total = Number(d.total || 0);
      var pub = d.published === undefined ? '' : Number(d.published || 0) + ' published';
      var drafts = d.drafts === undefined ? '' : Number(d.drafts || 0) + ' draft';
      var detail = [pub, drafts].filter(Boolean).join(' • ') || 'Version snapshots';
      return '<div class="cms4-stat"><span>' + escapeHtml(pair[0]) + '</span><strong>' + total + '</strong><small>' + escapeHtml(detail) + '</small></div>';
    }).join('');
  } catch (e) {
    host.innerHTML = '<div class="info" style="grid-column:1/-1"><strong>Overview unavailable</strong><br><span class="muted">' +
      escapeHtml((e && e.message) || 'Unable to load CMS overview.') + '</span></div>';
  }
}

function cms4FilterList() {
  var input = document.getElementById('cms4ListSearch');
  var status = document.getElementById('cms4StatusFilter');
  var query = String(input && input.value || '').trim().toLowerCase();
  var wanted = String(status && status.value || 'all');
  document.querySelectorAll('#cms2List .cms4-item').forEach(function(row) {
    var hay = String(row.getAttribute('data-search') || '').toLowerCase();
    var rowStatus = row.getAttribute('data-status') || 'published';
    row.style.display = (!query || hay.indexOf(query) !== -1) && (wanted === 'all' || rowStatus === wanted) ? '' : 'none';
  });
}

function cms4UpdateSelection() {
  var boxes = Array.prototype.slice.call(document.querySelectorAll('#cms2List .cms4-check'));
  var visible = boxes.filter(function(b){ return b.closest('.cms4-item') && b.closest('.cms4-item').style.display !== 'none'; });
  var selected = boxes.filter(function(b){ return b.checked; });
  var all = document.getElementById('cms4SelectAll');
  if (all) {
    all.checked = visible.length > 0 && visible.every(function(b){ return b.checked; });
    all.indeterminate = visible.some(function(b){ return b.checked; }) && !all.checked;
  }
  var count = document.getElementById('cms4SelectionCount');
  if (count) count.textContent = selected.length + ' selected';
}

function cms4ToggleAll(checked) {
  document.querySelectorAll('#cms2List .cms4-check').forEach(function(b){
    var row = b.closest('.cms4-item');
    if (row && row.style.display !== 'none') b.checked = checked;
  });
  cms4UpdateSelection();
}

async function cms4ValidateSelected() {
  var boxes=Array.prototype.slice.call(document.querySelectorAll('#cms2List .cms4-check:checked'));
  var ids=boxes.map(function(b){return b.value;}).filter(Boolean);
  if(!ids.length){showToast('Select at least one item.','error');return;}
  var results=[];
  for(var i=0;i<ids.length;i++){
    try{
      var r=await api('/api/admin/cms-publish-check?type='+encodeURIComponent(cms2CurrentType)+'&id='+encodeURIComponent(ids[i]));
      results.push({id:ids[i],name:boxes[i]&&boxes[i].closest('.cms4-item') ? (boxes[i].closest('.cms4-item').querySelector('.cms4-item-title')||{}).textContent : ids[i],ok:r.ok,errors:r.errors||[],warnings:r.warnings||[]});
    }catch(e){results.push({id:ids[i],ok:false,errors:[e.message||'Validation failed'],warnings:[]});}
  }
  var bad=results.filter(function(r){return !r.ok;});
  var warnings=results.filter(function(r){return r.warnings.length;});
  var lines=results.map(function(r){
    var label=r.name||r.id;
    if(r.ok && !r.warnings.length)return '✓ '+label+' — ready';
    return (r.ok?'⚠ ':'✕ ')+label+' — '+r.errors.concat(r.warnings).join(' ');
  });
  var host=document.getElementById('cms4ValidationResult');
  if(host) host.innerHTML='<div class="cms4-validation '+(bad.length?'has-errors':warnings.length?'has-warnings':'is-ready')+'"><strong>'+ (bad.length ? bad.length+' item(s) need attention' : warnings.length ? 'Ready with warnings' : 'All selected items are ready to publish') +'</strong><div>'+lines.map(escapeHtml).join('<br>')+'</div></div>';
  showToast(bad.length ? 'Validation found '+bad.length+' issue(s).' : 'Validation complete.',bad.length?'error':'success');
}

async function cms4BulkStatus(status) {
  var boxes = Array.prototype.slice.call(document.querySelectorAll('#cms2List .cms4-check:checked'));
  var ids = boxes.map(function(b){ return b.value; }).filter(Boolean);
  if (!ids.length) { showToast('Select at least one item.', 'error'); return; }
  if (!confirm('Set ' + ids.length + ' selected item(s) to ' + status + '?')) return;
  try {
    var result = await api('/api/admin/cms-bulk-status', {
      method:'POST',
      body:{ type:cms2CurrentType, ids:ids, status:status }
    });
    showToast((result.updated || 0) + ' item(s) updated to ' + status, 'success');
    await cms2List();
    cms4LoadOverview();
  } catch(e) {
    showToast('Bulk update failed: ' + ((e && e.message) || ''), 'error');
  }
}


function cms4ToggleStructure() {
  var host = document.getElementById('cms4Structure');
  if (!host) return;
  var open = host.style.display !== 'none';
  host.style.display = open ? 'none' : 'block';
  if (!open) cms4RenderStructure();
}

function cms4TreeRows(rows, parentId, depth, labelField) {
  var out = [];
  rows.filter(function(r) {
    return String(r.parent_id || '') === String(parentId || '');
  }).sort(function(a,b) {
    return Number(a.order_index || 0) - Number(b.order_index || 0) || String(a[labelField] || a.name || a.label || '').localeCompare(String(b[labelField] || b.name || b.label || ''));
  }).forEach(function(r) {
    out.push({ row:r, depth:depth });
    out = out.concat(cms4TreeRows(rows, r.id, depth + 1, labelField));
  });
  return out;
}

async function cms4RenderStructure() {
  var host = document.getElementById('cms4Structure');
  if (!host) return;
  var type = cms2CurrentType || 'page';
  var rows = cms2Cache[type] || [];
  if (!rows.length) {
    try {
      var def=CMS2_TYPES[type]||{};
      var res=await api(def.listEndpoint);
      rows=res && (res.pages||res.sections||res.items||res.blocks||res.categories||[]);
      cms2Cache[type]=rows||[];
    } catch(e) { rows=[]; }
  }
  var cfg = {
    page:{title:'Page hierarchy', icon:'📄', field:'name', parent:'page', hint:'Drag-free hierarchy view. Use Edit to change a parent or order.'},
    navigation:{title:'Navigation tree', icon:'🧭', field:'label', parent:'navigation', hint:'Review menu nesting before publishing.'},
    category:{title:'Category tree', icon:'🏷️', field:'name', parent:'category', hint:'Categories can be nested and reused by content type.'},
    'page-section':{title:'Section order', icon:'📑', field:'title', parent:null, hint:'Sections are grouped by their parent page.'},
    'content-block':{title:'Content block map', icon:'🧩', field:'title', parent:null, hint:'Blocks show their assigned page and section.'}
  }[type];
  if (!cfg) {
    host.innerHTML='<div class="info"><strong>Structure view</strong><p class="muted">This content type is intentionally flat. Use the list editor for ordering and relationships.</p></div>';
    return;
  }
  var html='<div class="cms4-structure-head"><div><span class="knowledge-kicker">UHS CMS STRUCTURE</span><h3>'+cfg.icon+' '+escapeHtml(cfg.title)+'</h3><p class="muted">'+escapeHtml(cfg.hint)+'</p></div><button class="secondary" type="button" onclick="cms4RenderStructure()">↻ Refresh</button></div>';
  if (type==='page' || type==='navigation' || type==='category') {
    var tree=cms4TreeRows(rows,null,0,cfg.field);
    html+='<div class="cms4-tree">';
    tree.forEach(function(x){
      var r=x.row, nm=r[cfg.field]||r.name||r.label||r.title||r.id;
      var meta=[];
      if(r.slug) meta.push(r.slug);
      if(r.content_type) meta.push(r.content_type);
      if(r.status) meta.push(r.status);
      html+='<div class="cms4-tree-row" style="--depth:'+x.depth+'"><span class="cms4-tree-branch">'+(x.depth?'└─':'')+'</span><span class="cms4-tree-icon">'+cfg.icon+'</span><div><strong>'+escapeHtml(nm)+'</strong><small>'+escapeHtml(meta.join(' • ')||'No metadata')+'</small></div><button class="secondary" type="button" onclick="cms2OpenEditor(\''+escapeHtml(String(r.id))+'\')">Edit</button></div>';
    });
    if(!tree.length) html+='<div class="cms4-tree-empty">No hierarchy items found.</div>';
    html+='</div>';
  } else if(type==='page-section') {
    var pages=cms2Sources.page||[];
    pages.forEach(function(pg){
      var sec=rows.filter(function(r){return String(r.page_id)===String(pg.id);}).sort(function(a,b){return Number(a.order_index||0)-Number(b.order_index||0);});
      if(!sec.length) return;
      html+='<div class="cms4-tree-group"><h4>📄 '+escapeHtml(pg.name||pg.slug||pg.id)+'</h4>';
      sec.forEach(function(r,i){html+='<div class="cms4-tree-row" style="--depth:1"><span class="cms4-tree-branch">└─</span><span class="cms4-tree-icon">📑</span><div><strong>'+(i+1)+'. '+escapeHtml(r.title||'Untitled section')+'</strong><small>'+escapeHtml(r.section_type||'content')+' • '+escapeHtml(r.status||'published')+'</small></div><button class="secondary" type="button" onclick="cms2OpenEditor(\''+escapeHtml(String(r.id))+'\')">Edit</button></div>';});
      html+='</div>';
    });
  } else {
    rows.slice().sort(function(a,b){return String(a.page_id||'').localeCompare(String(b.page_id||''))||Number(a.order_index||0)-Number(b.order_index||0);}).forEach(function(r){
      var page=cms2LabelFor('page',r.page_id), sec=cms2LabelFor('section',r.section_id);
      html+='<div class="cms4-tree-row"><span class="cms4-tree-icon">🧩</span><div><strong>'+escapeHtml(r.title||r.block_key||r.id)+'</strong><small>'+escapeHtml([r.block_type,page,sec,r.status||'published'].filter(Boolean).join(' • '))+'</small></div><button class="secondary" type="button" onclick="cms2OpenEditor(\''+escapeHtml(String(r.id))+'\')">Edit</button></div>';
    });
  }
  host.innerHTML=html;
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
    var structure = document.getElementById('cms4Structure'); if (structure && structure.style.display !== 'none') cms4RenderStructure();
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>No ' + (def.plural || def.label) + ' yet</h3><p>Click "+ Add" to create your first one.</p></div>';
      return;
    }
    var html = '<div class="cms4-list-toolbar">' +
      '<input id="cms4ListSearch" type="search" placeholder="Search ' + escapeHtml(def.plural || def.label || 'items') + '…" oninput="cms4FilterList()">' +
      '<select id="cms4StatusFilter" onchange="cms4FilterList()"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select>' +
      '<label class="cms4-select-all"><input id="cms4SelectAll" type="checkbox" onchange="cms4ToggleAll(this.checked)"> Select visible</label>' +
      '<span id="cms4SelectionCount" class="muted">0 selected</span>' +
      '<button type="button" class="secondary" onclick="cms4ValidateSelected()">✓ Validate</button>' +
      '<button type="button" class="secondary" onclick="cms4BulkStatus(\'draft\')">Draft</button>' +
      '<button type="button" class="primary" onclick="cms4BulkStatus(\'published\')">Publish</button>' +
      '<button type="button" class="secondary" onclick="cms4BulkStatus(\'hidden\')">Hide</button>' +
      '</div><div id="cms4ValidationResult"></div>';
    rows.forEach(function(it) {
      var name = it[def.nameField] || it.name || it.label || it.title || it.block_key || it.id;
      var status = it.status || 'published';
      var info = [];
      if (it.slug) info.push(it.slug);
      if (it.url) info.push(it.url);
      if (it.block_type) info.push(it.block_type);
      if (it.page_name) info.push(it.page_name);
      var search = [name].concat(info).join(' ');
      html += '<div class="staff-row cms4-item" data-status="' + escapeHtml(status) + '" data-search="' + escapeHtml(search) + '" style="grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 12px">';
      html += '<input class="cms4-check" type="checkbox" value="' + escapeHtml(String(it.id)) + '" onchange="cms4UpdateSelection()" aria-label="Select ' + escapeHtml(name) + '">';
      html += '<span style="font-size:18px">' + (def.icon || '📄') + '</span>';
      html += '<div><strong style="color:#eaf2f4">' + escapeHtml(name) + '</strong> <span class="cms4-status ' + escapeHtml(status) + '">' + escapeHtml(status.toUpperCase()) + '</span><br><span style="font-size:11px;color:#7a95a3">' + escapeHtml(info.join(' • ')) + '</span></div>';
      html += '<div style="display:flex;gap:5px;flex-wrap:wrap">';
      html += '<button class="edit-small" onclick="cms2OpenEditor(\'' + escapeHtml(String(it.id)) + '\')">✏️</button>';
      html += '<button class="secondary" onclick="cms2Duplicate(\'' + escapeHtml(String(it.id)) + '\')" title="Duplicate">⤴</button>';
      if (status !== 'published') html += '<button class="secondary" onclick="cms2SetStatus(\'' + escapeHtml(String(it.id)) + '\',\'published\')" title="Publish">✅</button>';
      html += '<button class="danger-small" onclick="cms2Delete(\'' + escapeHtml(String(it.id)) + '\')">✖</button>';
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
  if (field.type === 'visual-json') {
    return '<div class="cms2-visual-json" data-visual-json="' + field.k + '" style="grid-column:1/-1">' +
      '<div class="cms2-content-help"><strong>Content editor</strong><span>Use the fields below — no JSON or coding required. Add or remove items as needed.</span></div>' +
      '<div class="cms2-json-builder" data-json-builder="' + field.k + '"></div>' +
      '</div>';
  }
  return '';
}


/* =========================================================
   NO-CODE CONTENT BUILDER
   Converts JSON-backed content into a friendly visual editor.
   It deliberately keeps the underlying data shape intact so
   existing migrated content remains compatible.
========================================================= */

var cms2VisualState = {};

function cms2PrettyKey(key) {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, function(m) { return m.toUpperCase(); });
}

function cms2Clone(value) {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
}

function cms2PathKey(parts) {
  return parts.map(function(p) {
    return String(p).replace(/~/g, '~0').replace(/\//g, '~1');
  }).join('/');
}

function cms2GetPath(obj, parts) {
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function cms2SetPath(obj, parts, value) {
  if (!parts.length) return value;
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var part = parts[i];
    var next = parts[i + 1];
    if (cur[part] == null) cur[part] = /^\d+$/.test(String(next)) ? [] : {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

function cms2DeletePath(obj, parts) {
  if (!parts.length) return;
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (cur == null) return;
    cur = cur[parts[i]];
  }
  if (cur == null) return;
  if (Array.isArray(cur)) cur.splice(Number(parts[parts.length - 1]), 1);
  else delete cur[parts[parts.length - 1]];
}

function cms2FriendlyValue(key, value) {
  var k = String(key || '').toLowerCase();
  if (typeof value === 'string') {
    return /description|instructions|indication|contra|warning|notes|details|overview|text|content|steps|advice|guidance|reason|effect|action|summary|procedure/.test(k) ||
      value.length > 120;
  }
  return false;
}

function cms2VisualLeaf(path, key, value) {
  var label = cms2PrettyKey(key);
  var pathKey = cms2PathKey(path);
  if (typeof value === 'boolean') {
    return '<div class="cms2-vfield cms2-vbool">' +
      '<label><input type="checkbox" data-vpath="' + escapeHtml(pathKey) + '" ' + (value ? 'checked' : '') + '> <span>' + escapeHtml(label) + '</span></label></div>';
  }
  if (typeof value === 'number') {
    return '<div class="cms2-vfield"><label><span>' + escapeHtml(label) + '</span><input type="number" data-vpath="' + escapeHtml(pathKey) + '" value="' + value + '"></label></div>';
  }
  var val = value == null ? '' : String(value);
  var longText = cms2FriendlyValue(key, value);
  return '<div class="cms2-vfield ' + (longText ? 'cms2-vlong' : '') + '">' +
    '<label><span>' + escapeHtml(label) + '</span>' +
    (longText
      ? '<textarea data-vpath="' + escapeHtml(pathKey) + '" rows="4">' + escapeHtml(val) + '</textarea>'
      : '<input type="text" data-vpath="' + escapeHtml(pathKey) + '" value="' + escapeHtml(val) + '">') +
    '</label></div>';
}

function cms2VisualNode(value, path, key, depth) {
  if (Array.isArray(value)) {
    var title = key === undefined ? 'Items' : cms2PrettyKey(key);
    var html = '<div class="cms2-vgroup cms2-varray" data-vgroup="' + escapeHtml(cms2PathKey(path)) + '">' +
      '<div class="cms2-vgroup-head"><strong>' + escapeHtml(title) + '</strong><button type="button" class="cms2-mini-btn" data-vadd="' + escapeHtml(cms2PathKey(path)) + '">+ Add item</button></div>';
    if (!value.length) {
      html += '<div class="cms2-vempty">No items yet. Click <b>+ Add item</b> to add one.</div>';
    } else {
      value.forEach(function(item, i) {
        var itemPath = path.concat([i]);
        var itemKey = cms2PathKey(itemPath);
        html += '<div class="cms2-varray-item cms2-editor-block" draggable="true" data-vitem="' + escapeHtml(itemKey) + '">' +
          '<div class="cms2-varray-title">' +
          '<span class="cms2-block-drag" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span>' +
          '<strong>Block ' + (i + 1) + '</strong>' +
          '<span class="cms2-block-type">' + escapeHtml(item && typeof item === 'object' && item.type ? cms2PrettyKey(item.type) : 'Content') + '</span>' +
          '<span class="cms2-block-actions">' +
          '<button type="button" class="cms2-mini-btn" data-vmove-up="' + escapeHtml(itemKey) + '" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button type="button" class="cms2-mini-btn" data-vmove-down="' + escapeHtml(itemKey) + '" ' + (i === value.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button type="button" class="cms2-mini-btn" data-vduplicate="' + escapeHtml(itemKey) + '">Duplicate</button>' +
          '<button type="button" class="cms2-mini-danger" data-vremove="' + escapeHtml(itemKey) + '">Remove</button>' +
          '</span></div>' +
          cms2VisualNode(item, itemPath, undefined, depth + 1) + '</div>';
      });
    }
    return html + '</div>';
  }
  if (value && typeof value === 'object') {
    var title2 = key === undefined ? 'Content' : cms2PrettyKey(key);
    var html2 = '<div class="cms2-vgroup cms2-vobject" data-vgroup="' + escapeHtml(cms2PathKey(path)) + '">' +
      (key === undefined ? '' : '<div class="cms2-vgroup-head"><strong>' + escapeHtml(title2) + '</strong></div>');
    var keys = Object.keys(value);
    if (!keys.length) {
      html2 += '<div class="cms2-vempty">No fields yet. Add a field below.</div>';
    } else {
      keys.forEach(function(k) {
        html2 += '<div class="cms2-vproperty">' +
          cms2VisualNode(value[k], path.concat([k]), k, depth + 1) +
          '<button type="button" class="cms2-mini-danger cms2-remove-field" data-vremove="' + escapeHtml(cms2PathKey(path.concat([k]))) + '">Remove</button>' +
          '</div>';
      });
    }
    html2 += '<button type="button" class="cms2-add-field" data-vaddfield="' + escapeHtml(cms2PathKey(path)) + '">+ Add field</button></div>';
    return html2;
  }
  return cms2VisualLeaf(path, key, value);
}


/* =========================================================
   DEDICATED CLINICAL FORMS
   Clinical content is edited with familiar fields instead of
   generic JSON/field names. The saved database shape remains
   compatible with the existing CMS.
========================================================= */

var CMS2_CLINICAL_FORMS = {
  text: {
    label:'Text',
    intro:'Write readable clinical content with lightweight formatting.',
    sections:[{title:'Content',fields:[
      {key:'text',label:'Text content',kind:'long',aliases:['content','body'],placeholder:'Write the information readers need...'}
    ]}]
  },
  heading: {
    label:'Heading',
    intro:'Create a clear section heading for the knowledge page.',
    sections:[{title:'Heading',fields:[
      {key:'text',label:'Heading text',kind:'text',aliases:['title'],placeholder:'Enter the heading'}
    ]}]
  },
  alert: {
    label:'Alert',
    intro:'Highlight an important note, warning or operational reminder.',
    sections:[
      {title:'Alert content',fields:[
        {key:'title',label:'Alert title',kind:'text',aliases:['heading'],placeholder:'Important'}
        ,{key:'severity',label:'Severity',kind:'text',aliases:['level'],placeholder:'info, warning, danger or success'}
        ,{key:'message',label:'Message',kind:'long',aliases:['text','content'],placeholder:'Write the alert message...'}
      ]}
    ]
  },
  checklist: {
    label:'Checklist',
    intro:'Build a practical step-by-step checklist.',
    sections:[{title:'Checklist items',fields:[
      {key:'items',label:'Items',kind:'list',aliases:['steps','checklist'],placeholder:'Add a checklist item'}
    ]}]
  },
  card: {
    label:'Card',
    intro:'Create a compact knowledge card with a title and supporting information.',
    sections:[{title:'Card content',fields:[
      {key:'title',label:'Card title',kind:'text',aliases:['heading'],placeholder:'Card title'},
      {key:'text',label:'Card content',kind:'long',aliases:['content','body'],placeholder:'Card information...'}
    ]}]
  },
  button: {
    label:'Button',
    intro:'Add a navigational action to the content.',
    sections:[{title:'Button',fields:[
      {key:'label',label:'Button label',kind:'text',aliases:['text','title'],placeholder:'Open resource'},
      {key:'url',label:'Destination URL',kind:'text',aliases:['href','link'],placeholder:'https://...'}
    ]}]
  },
  image: {
    label:'Image',
    intro:'Add an image reference with accessible alternative text.',
    sections:[{title:'Image',fields:[
      {key:'url',label:'Image URL',kind:'text',aliases:['src'],placeholder:'https://...'},
      {key:'alt',label:'Alternative text',kind:'text',aliases:['altText','description'],placeholder:'Describe the image'},
      {key:'caption',label:'Caption',kind:'long',aliases:['text'],placeholder:'Optional caption'}
    ]}]
  },
  video: {
    label:'Video',
    intro:'Add a video reference and describe what it contains.',
    sections:[{title:'Video',fields:[
      {key:'url',label:'Video URL',kind:'text',aliases:['src'],placeholder:'https://...'},
      {key:'title',label:'Video title',kind:'text',aliases:['name'],placeholder:'Video title'},
      {key:'description',label:'Description',kind:'long',aliases:['text','content'],placeholder:'What should the learner know before watching?'}
    ]}]
  },
  accordion: {
    label:'Accordion',
    intro:'Create expandable supporting information without cluttering the page.',
    sections:[{title:'Expandable content',fields:[
      {key:'title',label:'Accordion title',kind:'text',aliases:['heading'],placeholder:'Expandable section'},
      {key:'content',label:'Accordion content',kind:'long',aliases:['text','body'],placeholder:'Details shown when expanded...'}
    ]}]
  },

  procedure: {
    label: 'Procedure',
    intro: 'Describe what staff need to know and do for this procedure.',
    sections: [
      { title: 'Overview', fields: [
        { key:'indication', label:'Indications', kind:'long', aliases:['indications'], placeholder:'When is this procedure used?' },
        { key:'contraindications', label:'Contraindications', kind:'list', aliases:['contraindications'], placeholder:'Add a contraindication' },
        { key:'equipment', label:'Equipment', kind:'listOrText', aliases:['equipment'], placeholder:'Equipment or supplies needed' },
        { key:'prep', label:'Preparation', kind:'long', aliases:['prep','preparation'], placeholder:'Preparation before starting' }
      ]},
      { title: 'Procedure steps', fields: [
        { key:'steps', label:'Steps', kind:'list', aliases:['procedureChecklist','checklist'], placeholder:'Describe the next step' }
      ]},
      { title: 'After the procedure', fields: [
        { key:'reassessment', label:'Reassessment', kind:'long', aliases:['reassessment','reassessmentNotes'], placeholder:'What should be reassessed afterwards?' },
        { key:'documentation', label:'Documentation', kind:'long', aliases:['documentation','notes'], placeholder:'What should be documented?' },
        { key:'warnings', label:'Warnings / important notes', kind:'listOrText', aliases:['warnings','warning','cautions'], placeholder:'Important warning or note' }
      ]},
      { title: 'Roleplay & teaching', fields: [
        { key:'rp', label:'RP / roleplay actions', kind:'list', aliases:['rp','actions'], placeholder:'Add an RP action' },
        { key:'questions', label:'Questions to ask the patient', kind:'list', aliases:['questions'], placeholder:'Add a patient question' },
        { key:'slideUrl', label:'Reference slide / presentation URL', kind:'text', aliases:['slideUrl'], placeholder:'https://...' }
      ]}
    ]
  },
  medication: {
    label: 'Medication',
    intro: 'Enter the medication details staff need at a glance.',
    sections: [
      { title:'Medication details', fields:[
        { key:'use', label:'Use / purpose', kind:'long', aliases:['use','purpose'], placeholder:'What is this medication used for?' },
        { key:'indication', label:'Indications', kind:'long', aliases:['indication','indications'], placeholder:'When should it be considered?' },
        { key:'route', label:'Route', kind:'text', aliases:['route'], placeholder:'e.g. IV, IM, oral' },
        { key:'dose', label:'Dose', kind:'long', aliases:['dose'], placeholder:'Enter the dose information' },
        { key:'frequency', label:'Frequency', kind:'text', aliases:['frequency','frequencyDose'], placeholder:'e.g. once, repeat as required' },
        { key:'maxDose', label:'Maximum dose', kind:'text', aliases:['maxDose','maximumDose'], placeholder:'Maximum permitted dose' }
      ]},
      { title:'Safety', fields:[
        { key:'contraindications', label:'Contraindications', kind:'list', aliases:['contraindications'], placeholder:'Add a contraindication' },
        { key:'cautions', label:'Cautions / warnings', kind:'list', aliases:['cautions','warnings','warning'], placeholder:'Add a caution' },
        { key:'monitoring', label:'Monitoring', kind:'listOrText', aliases:['monitoring'], placeholder:'What should be monitored?' },
        { key:'sideEffects', label:'Side effects', kind:'list', aliases:['sideEffects','side_effects','adverseEffects'], placeholder:'Add a side effect' }
      ]},
      { title:'Roleplay', fields:[
        { key:'rp', label:'RP / administration actions', kind:'list', aliases:['rp','actions'], placeholder:'Add an RP action' },
        { key:'emote', label:'RP emote', kind:'long', aliases:['emote'], placeholder:'Optional roleplay emote' }
      ]}
    ]
  },
  emergency: {
    label:'Emergency',
    intro:'Build a clear emergency guide with priorities, assessment and actions.',
    sections:[
      { title:'Immediate priorities', fields:[
        { key:'priorities', label:'Priorities', kind:'list', aliases:['priorities'], placeholder:'Add a priority' },
        { key:'assessment', label:'Assessment', kind:'long', aliases:['assessment'], placeholder:'What should be assessed?' },
        { key:'immediateActions', label:'Immediate actions', kind:'list', aliases:['immediateActions','actions'], placeholder:'Add an immediate action' },
        { key:'redFlags', label:'Red flags', kind:'list', aliases:['redFlags','red_flags'], placeholder:'Add a red flag' }
      ]},
      { title:'Clinical management', fields:[
        { key:'observations', label:'Observations', kind:'listOrText', aliases:['observations'], placeholder:'Observation to record or monitor' },
        { key:'procedures', label:'Procedures', kind:'list', aliases:['procedures'], placeholder:'Procedure to consider' },
        { key:'medications', label:'Medications', kind:'list', aliases:['medications'], placeholder:'Medication to consider' },
        { key:'reassessment', label:'Reassessment', kind:'long', aliases:['reassessment'], placeholder:'What should be reassessed?' }
      ]},
      { title:'Handover & roleplay', fields:[
        { key:'handover', label:'Handover', kind:'long', aliases:['handover'], placeholder:'Key information for handover' },
        { key:'rp', label:'RP / roleplay actions', kind:'list', aliases:['rp','actions'], placeholder:'Add an RP action' },
        { key:'questions', label:'Questions', kind:'list', aliases:['questions'], placeholder:'Add a question' },
        { key:'warnings', label:'Warnings', kind:'listOrText', aliases:['warnings','warning'], placeholder:'Important warning' }
      ]}
    ]
  },
  equipment: {
    label:'Equipment',
    intro:'Explain what the equipment is for and how it is used in roleplay.',
    sections:[
      { title:'Equipment overview', fields:[
        { key:'purpose', label:'Purpose', kind:'long', aliases:['purpose','use'], placeholder:'What is this equipment for?' },
        { key:'whenUsed', label:'When is it used?', kind:'long', aliases:['whenUsed','when_used'], placeholder:'When should it be used?' },
        { key:'setup', label:'Setup', kind:'listOrText', aliases:['setup','prep','preparation'], placeholder:'Add a setup step' },
        { key:'steps', label:'How to use it', kind:'list', aliases:['steps','procedureChecklist','checklist'], placeholder:'Add a use step' }
      ]},
      { title:'Safety & maintenance', fields:[
        { key:'safety', label:'Safety / warnings', kind:'list', aliases:['safety','warnings','cautions'], placeholder:'Add a safety note' },
        { key:'cleaning', label:'Cleaning / reset', kind:'long', aliases:['cleaning','maintenance'], placeholder:'Cleaning or reset instructions' },
        { key:'relatedProcedures', label:'Related procedures', kind:'list', aliases:['relatedProcedures','related_procedures'], placeholder:'Add a related procedure' }
      ]},
      { title:'Roleplay', fields:[
        { key:'rp', label:'RP / roleplay actions', kind:'list', aliases:['rp','actions'], placeholder:'Add an RP action' }
      ]}
    ]
  },
  surgery: {
    label:'Surgery',
    intro:'Record indications, risks, equipment and the surgical checklist.',
    sections:[
      { title:'Surgery overview', fields:[
        { key:'indications', label:'Indications', kind:'listOrText', aliases:['indications','indication'], placeholder:'Add an indication' },
        { key:'risks', label:'Risks', kind:'list', aliases:['risks'], placeholder:'Add a risk' },
        { key:'equipment', label:'Equipment', kind:'list', aliases:['equipment'], placeholder:'Add equipment' },
        { key:'preparation', label:'Preparation', kind:'long', aliases:['preparation','prep'], placeholder:'Preparation before surgery' }
      ]},
      { title:'Checklist & aftercare', fields:[
        { key:'checklist', label:'Surgical checklist', kind:'list', aliases:['checklist','steps'], placeholder:'Add a checklist item' },
        { key:'aftercare', label:'Aftercare', kind:'long', aliases:['aftercare','reassessment'], placeholder:'Aftercare / reassessment' },
        { key:'warnings', label:'Warnings', kind:'listOrText', aliases:['warnings','cautions'], placeholder:'Important warning' }
      ]},
      { title:'Roleplay & questions', fields:[
        { key:'questions', label:'Questions', kind:'list', aliases:['questions'], placeholder:'Add a question' },
        { key:'rp', label:'RP / roleplay actions', kind:'list', aliases:['rp','actions'], placeholder:'Add an RP action' }
      ]}
    ]
  },
  scene: {
    label:'Incident scene',
    intro:'Create a clear scene guide for assessment, actions and transport.',
    sections:[
      { title:'Presentation', fields:[
        { key:'description', label:'Scene description', kind:'long', aliases:['description'], placeholder:'What does the crew find?' },
        { key:'presentation', label:'Patient presentation', kind:'long', aliases:['presentation'], placeholder:'How is the patient presenting?' },
        { key:'observations', label:'Observations', kind:'list', aliases:['observations'], placeholder:'Add an observation' }
      ]},
      { title:'Management', fields:[
        { key:'actions', label:'Actions', kind:'list', aliases:['actions'], placeholder:'Add an action' },
        { key:'questions', label:'Questions', kind:'list', aliases:['questions'], placeholder:'Add a question' },
        { key:'procedures', label:'Procedures', kind:'list', aliases:['procedures'], placeholder:'Add a procedure' },
        { key:'medications', label:'Medications', kind:'list', aliases:['medications'], placeholder:'Add a medication' }
      ]},
      { title:'Disposition', fields:[
        { key:'transport', label:'Transport', kind:'long', aliases:['transport'], placeholder:'Transport plan' },
        { key:'handover', label:'Handover', kind:'long', aliases:['handover'], placeholder:'Handover information' },
        { key:'slideUrl', label:'Reference slide / presentation URL', kind:'text', aliases:['slideUrl'], placeholder:'https://...' }
      ]}
    ]
  },
  rp: {
    label:'RP action',
    intro:'Create a roleplay action without needing to know the underlying data format.',
    sections:[
      { title:'Action', fields:[
        { key:'command', label:'Command', kind:'text', aliases:['command'], placeholder:'/me checks the patient' },
        { key:'emote', label:'Emote / action text', kind:'long', aliases:['emote'], placeholder:'What should the character do?' },
        { key:'location', label:'Location', kind:'text', aliases:['location'], placeholder:'Where is this used?' },
        { key:'description', label:'Description', kind:'long', aliases:['description'], placeholder:'Describe the action' },
        { key:'category', label:'Category', kind:'text', aliases:['category'], placeholder:'Optional category' },
        { key:'tags', label:'Tags', kind:'list', aliases:['tags'], placeholder:'Add a tag' }
      ]}
    ]
  },
  alert: {
    label:'Alert / warning',
    intro:'Create a visible warning or important note.',
    sections:[
      { title:'Alert', fields:[
        { key:'message', label:'Message', kind:'long', aliases:['message','text','content'], placeholder:'Write the warning message' },
        { key:'severity', label:'Severity', kind:'text', aliases:['severity','level'], placeholder:'e.g. warning, critical' },
        { key:'details', label:'Details', kind:'long', aliases:['details','description'], placeholder:'Additional information' }
      ]}
    ]
  },
  checklist: {
    label:'Checklist',
    intro:'Create a simple checklist that staff can work through.',
    sections:[
      { title:'Checklist items', fields:[
        { key:'items', label:'Items', kind:'list', aliases:['items','steps','checklist'], placeholder:'Add a checklist item' },
        { key:'notes', label:'Notes', kind:'long', aliases:['notes','description'], placeholder:'Optional notes' }
      ]}
    ]
  },
  tts: {
    label:'TTS / question',
    intro:'Create a text-to-speech question or prompt.',
    sections:[
      { title:'Prompt', fields:[
        { key:'text', label:'Question / prompt', kind:'long', aliases:['text','question'], placeholder:'Write the prompt' },
        { key:'category', label:'Category', kind:'text', aliases:['category'], placeholder:'Optional category' },
        { key:'answer', label:'Answer / expected response', kind:'long', aliases:['answer','response'], placeholder:'Optional answer' }
      ]}
    ]
  },
  document: {
    label:'Document',
    intro:'Add details for a reference document.',
    sections:[
      { title:'Document details', fields:[
        { key:'description', label:'Description', kind:'long', aliases:['description'], placeholder:'What does this document contain?' },
        { key:'url', label:'Document URL', kind:'text', aliases:['url','fileUrl','file_url'], placeholder:'https://...' },
        { key:'category', label:'Category', kind:'text', aliases:['category'], placeholder:'Optional category' },
        { key:'notes', label:'Notes', kind:'long', aliases:['notes'], placeholder:'Optional notes' }
      ]}
    ]
  }
};

function cms2ClinicalFormFor(blockType) {
  return CMS2_CLINICAL_FORMS[String(blockType || '').toLowerCase()] || null;
}

function cms2ClinicalExistingKey(state, field) {
  if (!state || typeof state !== 'object') return field.key;
  var candidates = [field.key].concat(field.aliases || []);
  for (var i = 0; i < candidates.length; i++) {
    if (Object.prototype.hasOwnProperty.call(state, candidates[i])) return candidates[i];
  }
  return field.key;
}

function cms2ClinicalDefault(field) {
  return field.kind === 'list' || field.kind === 'listOrText' ? [] : '';
}

function cms2ClinicalValue(state, field) {
  var key = cms2ClinicalExistingKey(state, field);
  var value = state && state[key];
  if (field.kind === 'list' || field.kind === 'listOrText') {
    if (Array.isArray(value)) return value.slice();
    if (value === undefined || value === null || value === '') return [];
    return [String(value)];
  }
  return value === undefined || value === null ? '' : value;
}

function cms2ClinicalEscapeAttr(value) {
  return escapeHtml(String(value == null ? '' : value));
}

function cms2RichEscapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cms2RichSanitize(value) {
  var input = String(value == null ? '' : value);
  if (!/[<>]/.test(input)) return cms2RichEscapeHtml(input).replace(/\n/g, '<br>');
  var template = document.createElement('template');
  template.innerHTML = input;
  var allowed = {B:1,STRONG:1,I:1,EM:1,U:1,S:1,P:1,BR:1,UL:1,OL:1,LI:1,H2:1,H3:1,H4:1,BLOCKQUOTE:1,A:1,IMG:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TH:1,TD:1};
  function clean(node) {
    Array.from(node.childNodes).forEach(function(child) {
      if (child.nodeType === 1) {
        if (!allowed[child.tagName]) {
          var frag = document.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.parentNode.replaceChild(frag, child);
          return;
        }
        Array.from(child.attributes).forEach(function(attr) {
          if (child.tagName === 'A' && attr.name === 'href') {
            var href = attr.value.trim();
            if (!/^https?:\/\//i.test(href)) child.removeAttribute('href');
            else {
              child.setAttribute('href', href);
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            }
          } else if (child.tagName === 'IMG' && (attr.name === 'src' || attr.name === 'alt')) {
            if (attr.name === 'src' && !/^https:\/\//i.test(attr.value.trim())) child.removeAttribute('src');
            else child.setAttribute(attr.name, attr.value.trim());
          } else if (child.tagName === 'TH' || child.tagName === 'TD') {
            if (attr.name !== 'colspan' && attr.name !== 'rowspan') child.removeAttribute(attr.name);
          } else child.removeAttribute(attr.name);
        });
        clean(child);
      } else if (child.nodeType === 8) child.remove();
    });
  }
  clean(template.content);
  return template.innerHTML;
}

function cms2RichApply(surface, command, value) {
  if (!surface) return;
  surface.focus();
  try { document.execCommand(command, false, value == null ? null : value); } catch (_) {}
  surface.innerHTML = cms2RichSanitize(surface.innerHTML);
}

function cms2RichLink(surface) {
  if (!surface) return;
  surface.focus();
  var href = window.prompt('Link URL (https://...)');
  if (!href) return;
  href = href.trim();
  if (!/^https?:\/\//i.test(href)) {
    window.alert('Only http:// and https:// links are allowed.');
    return;
  }
  cms2RichApply(surface, 'createLink', href);
}

function cms2RichInsertTable(surface) {
  if (!surface) return;
  surface.focus();
  var html = '<table><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Value</td><td>Value</td></tr><tr><td>Value</td><td>Value</td></tr></tbody></table><p></p>';
  try { document.execCommand('insertHTML', false, html); } catch (_) {}
  surface.innerHTML = cms2RichSanitize(surface.innerHTML);
}
function cms2RichInsertImage(surface) {
  if (!surface) return;
  var src = window.prompt('Image URL (https://...)');
  if (!src) return;
  src = src.trim();
  if (!/^https:\/\//i.test(src)) { window.alert('Only HTTPS image URLs are allowed.'); return; }
  var alt = window.prompt('Accessible image description (alt text):') || '';
  surface.focus();
  try { document.execCommand('insertHTML', false, '<img src="' + cms2RichEscapeHtml(src) + '" alt="' + cms2RichEscapeHtml(alt) + '"><p></p>'); } catch (_) {}
  surface.innerHTML = cms2RichSanitize(surface.innerHTML);
}

function cms2ClinicalFieldHtml(field, state) {
  var key = cms2ClinicalExistingKey(state, field);
  var value = cms2ClinicalValue(state, field);
  var label = escapeHtml(field.label);
  var help = field.placeholder ? '<span class="cms2-clinical-placeholder">' + escapeHtml(field.placeholder) + '</span>' : '';
  var head = '<div class="cms2-clinical-field"><div class="cms2-clinical-label"><strong>' + label + '</strong>' + help + '</div>';
  if (field.kind === 'list' || field.kind === 'listOrText') {
    var html = head + '<div class="cms2-clinical-list" data-clinical-list="' + escapeHtml(key) + '">';
    if (!value.length) {
      html += '<div class="cms2-clinical-empty">Nothing added yet.</div>';
    } else {
      value.forEach(function(item, i) {
        if (item && typeof item === 'object') {
          item = item.text || item.label || item.name || '';
        }
        html += '<div class="cms2-clinical-list-item" draggable="true" data-clinical-drag="' + escapeHtml(key) + '" data-clinical-index="' + i + '">' +
          '<button type="button" class="cms2-drag-handle" draggable="false" title="Drag to reorder" aria-label="Drag to reorder">☷</button>' +
          '<input type="text" data-clinical-list-input="' + escapeHtml(key) + '" data-clinical-index="' + i + '" value="' + cms2ClinicalEscapeAttr(item) + '" placeholder="' + cms2ClinicalEscapeAttr(field.placeholder || '') + '">' +
          '<button type="button" class="cms2-clinical-remove" data-clinical-remove="' + escapeHtml(key) + '" data-clinical-index="' + i + '">Remove</button></div>';
      });
    }
    html += '<button type="button" class="cms2-clinical-add" data-clinical-add="' + escapeHtml(key) + '">+ Add ' + escapeHtml(field.label.replace(/s$/i,'')) + '</button>';
    if (field.kind === 'listOrText') {
      html += '<div class="cms2-clinical-list-or-text"><textarea data-clinical-long="' + escapeHtml(key) + '" rows="3" placeholder="' + cms2ClinicalEscapeAttr(field.placeholder || '') + '">' + escapeHtml(Array.isArray(value) ? value.join('\n') : String(value || '')) + '</textarea><small>Use one item per line, or write a short paragraph.</small></div>';
    }
    return html + '</div></div>';
  }
  if (field.kind === 'long') {
    var richValue = cms2RichSanitize(String(value || ''));
    return head +
      '<div class="cms2-rich-editor" data-rich-editor="' + escapeHtml(key) + '">' +
        '<div class="cms2-rich-toolbar" role="toolbar" aria-label="' + escapeHtml(field.label) + ' formatting">' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="undo" title="Undo (Ctrl/Cmd+Z)">↶</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="redo" title="Redo (Ctrl/Cmd+Y)">↷</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="bold" title="Bold (Ctrl/Cmd+B)"><strong>B</strong></button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="italic" title="Italic (Ctrl/Cmd+I)"><em>I</em></button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="underline" title="Underline (Ctrl/Cmd+U)"><u>U</u></button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="insertUnorderedList" title="Bullet list">• List</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="insertOrderedList" title="Numbered list">1. List</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-block="h2" title="Large heading">H2</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-block="h3" title="Heading">H3</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-block="blockquote" title="Clinical quote/callout">❝</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-link="1" title="Insert secure link">Link</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-table="1" title="Insert clinical table">Table</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-image="1" title="Insert HTTPS image">Image</button>' +
          '<button type="button" class="cms2-rich-btn" data-rich-cmd="removeFormat" title="Clear formatting">Clear</button>' +
        '</div>' +
        '<div class="cms2-rich-surface" contenteditable="true" spellcheck="true" data-rich-value="' + escapeHtml(key) + '" data-placeholder="' + cms2ClinicalEscapeAttr(field.placeholder || '') + '">' + richValue + '</div>' +
        '<small class="cms2-rich-help">Use the toolbar to format text. Changes save with the item.</small>' +
      '</div></div>';
  }
  return head + '<input type="text" data-clinical-text="' + escapeHtml(key) + '" value="' + cms2ClinicalEscapeAttr(value) + '" placeholder="' + cms2ClinicalEscapeAttr(field.placeholder || '') + '"></div>';
}

function cms2RenderClinicalEditor(fieldKey, blockType) {
  var host = document.querySelector('[data-json-builder="' + fieldKey + '"]');
  var form = cms2ClinicalFormFor(blockType);
  if (!host || !form) return false;
  var state = cms2VisualState[fieldKey];
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  cms2VisualState[fieldKey] = state;
  var html = '<div class="cms2-clinical-editor">' +
    '<div class="cms2-content-help"><strong>' + escapeHtml(form.label) + ' form</strong><span>' + escapeHtml(form.intro) + ' All changes stay in the same CMS content structure.</span></div>';
  form.sections.forEach(function(section) {
    html += '<div class="cms2-clinical-section"><h4>' + escapeHtml(section.title) + '</h4>';
    section.fields.forEach(function(field) { html += cms2ClinicalFieldHtml(field, state); });
    html += '</div>';
  });
  html += '</div>';
  host.innerHTML = html;
  host.onclick = function(e) {
    var richBtn = e.target.closest('[data-rich-cmd]');
    if (richBtn) {
      e.preventDefault();
      var surface = richBtn.closest('[data-rich-editor]').querySelector('[data-rich-value]');
      if (surface) {
        cms2RichApply(surface, richBtn.getAttribute('data-rich-cmd'));
        cms2VisualState[fieldKey][richBtn.closest('[data-rich-editor]').getAttribute('data-rich-editor')] = cms2RichSanitize(surface.innerHTML);
      }
      return;
    }
    var linkBtn = e.target.closest('[data-rich-link]');
    if (linkBtn) {
      e.preventDefault();
      var linkSurface = linkBtn.closest('[data-rich-editor]').querySelector('[data-rich-value]');
      cms2RichLink(linkSurface);
      if (linkSurface) cms2VisualState[fieldKey][linkBtn.closest('[data-rich-editor]').getAttribute('data-rich-editor')] = cms2RichSanitize(linkSurface.innerHTML);
      return;
    }
    var tableBtn = e.target.closest('[data-rich-table]');
    if (tableBtn) {
      e.preventDefault();
      var tableSurface = tableBtn.closest('[data-rich-editor]').querySelector('[data-rich-value]');
      cms2RichInsertTable(tableSurface);
      if (tableSurface) cms2VisualState[fieldKey][tableBtn.closest('[data-rich-editor]').getAttribute('data-rich-editor')] = cms2RichSanitize(tableSurface.innerHTML);
      return;
    }
    var imageBtn = e.target.closest('[data-rich-image]');
    if (imageBtn) {
      e.preventDefault();
      var imageSurface = imageBtn.closest('[data-rich-editor]').querySelector('[data-rich-value]');
      cms2RichInsertImage(imageSurface);
      if (imageSurface) cms2VisualState[fieldKey][imageBtn.closest('[data-rich-editor]').getAttribute('data-rich-editor')] = cms2RichSanitize(imageSurface.innerHTML);
      return;
    }
    var headingBtn = e.target.closest('[data-rich-block]');
    if (headingBtn) {
      e.preventDefault();
      var surface2 = headingBtn.closest('[data-rich-editor]').querySelector('[data-rich-value]');
      if (surface2) {
        var block = headingBtn.getAttribute('data-rich-block');
        cms2RichApply(surface2, 'formatBlock', block === 'blockquote' ? '<blockquote>' : '<' + block + '>');
        cms2VisualState[fieldKey][headingBtn.closest('[data-rich-editor]').getAttribute('data-rich-editor')] = cms2RichSanitize(surface2.innerHTML);
      }
      return;
    }
    var add = e.target.closest('[data-clinical-add]');
    if (add) {
      var key = add.getAttribute('data-clinical-add');
      var arr = cms2VisualState[fieldKey][key];
      if (!Array.isArray(arr)) arr = cms2VisualState[fieldKey][key] = [];
      arr.push('');
      cms2RenderClinicalEditor(fieldKey, blockType);
      return;
    }
    var remove = e.target.closest('[data-clinical-remove]');
    if (remove) {
      var key2 = remove.getAttribute('data-clinical-remove');
      var idx = Number(remove.getAttribute('data-clinical-index'));
      var arr2 = cms2VisualState[fieldKey][key2];
      if (Array.isArray(arr2)) {
        arr2.splice(idx, 1);
        cms2RenderClinicalEditor(fieldKey, blockType);
      }
    }
  };
  host.oninput = function(e) {
    var el = e.target;
    var richKey = el.getAttribute('data-rich-value');
    if (richKey) {
      cms2VisualState[fieldKey][richKey] = cms2RichSanitize(el.innerHTML);
      return;
    }
    var key = el.getAttribute('data-clinical-list-input') || el.getAttribute('data-clinical-long') || el.getAttribute('data-clinical-text');
    if (!key) return;
    if (el.hasAttribute('data-clinical-list-input')) {
      var idx = Number(el.getAttribute('data-clinical-index'));
      if (!Array.isArray(cms2VisualState[fieldKey][key])) cms2VisualState[fieldKey][key] = [];
      cms2VisualState[fieldKey][key][idx] = el.value;
    } else if (el.hasAttribute('data-clinical-long') && el.closest('.cms2-clinical-list-or-text')) {
      var lines = el.value.split(/\r?\n/).map(function(x){ return x.trim(); }).filter(Boolean);
      cms2VisualState[fieldKey][key] = lines;
    } else {
      cms2VisualState[fieldKey][key] = el.value;
    }
  };
  host.addEventListener('keydown', function(e) {
    var surface = e.target.closest('[data-rich-value]');
    if (!surface) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      var key = e.key.toLowerCase();
      if (key === 'b' || key === 'i' || key === 'u') {
        e.preventDefault();
        cms2RichApply(surface, key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
        var editor = surface.closest('[data-rich-editor]');
        if (editor) cms2VisualState[fieldKey][editor.getAttribute('data-rich-editor')] = cms2RichSanitize(surface.innerHTML);
      }
    }
  });
  host.addEventListener('paste', function(e) {
    var surface = e.target.closest('[data-rich-value]');
    if (!surface || !e.clipboardData) return;
    e.preventDefault();
    var html = e.clipboardData.getData('text/html');
    var text = e.clipboardData.getData('text/plain');
    var safe = html ? cms2RichSanitize(html) : cms2RichEscapeHtml(text).replace(/\n/g, '<br>');
    document.execCommand('insertHTML', false, safe);
    var editor = surface.closest('[data-rich-editor]');
    if (editor) cms2VisualState[fieldKey][editor.getAttribute('data-rich-editor')] = cms2RichSanitize(surface.innerHTML);
  });

  var dragKey = null;
  host.ondragstart = function(e) {
    var row = e.target.closest('[data-clinical-drag]');
    if (!row) return;
    dragKey = row.getAttribute('data-clinical-drag');
    row.classList.add('cms2-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.getAttribute('data-clinical-index'));
  };
  host.ondragend = function(e) {
    var row = e.target.closest('[data-clinical-drag]');
    if (row) row.classList.remove('cms2-dragging');
    dragKey = null;
  };
  host.ondragover = function(e) {
    var row = e.target.closest('[data-clinical-drag]');
    if (!row || !dragKey || row.getAttribute('data-clinical-drag') !== dragKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  host.ondrop = function(e) {
    var row = e.target.closest('[data-clinical-drag]');
    if (!row || !dragKey || row.getAttribute('data-clinical-drag') !== dragKey) return;
    e.preventDefault();
    var from = Number(e.dataTransfer.getData('text/plain'));
    var to = Number(row.getAttribute('data-clinical-index'));
    var arr = cms2VisualState[fieldKey][dragKey];
    if (!Array.isArray(arr) || from === to || isNaN(from) || isNaN(to)) return;
    var moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);
    cms2RenderClinicalEditor(fieldKey, blockType);
  };
  return true;
}

function cms2BindClinicalTypeSelector(item) {
  if (cms2CurrentType !== 'content-block') return;
  var select = document.querySelector('#cms2Form [data-f="block_type"]');
  if (!select) return;
  select.addEventListener('change', function() {
    var type = select.value;
    var form = cms2ClinicalFormFor(type);
    if (form) {
      cms2RenderClinicalEditor('content', type);
    } else {
      cms2RenderVisualJson('content');
      cms2VisualBind('content');
    }
  });
}


var CMS2_BLOCK_PRESETS = {
  text: { type:'text', text:'Write your content here.' },
  heading: { type:'heading', text:'Section heading' },
  alert: { type:'alert', severity:'warning', message:'Important information.' },
  checklist: { type:'checklist', items:['First item','Second item'] },
  card: { type:'card', title:'Card title', text:'Card content.' },
  button: { type:'button', label:'Open', url:'#' },
  image: { type:'image', url:'https://', alt:'Image description' },
  video: { type:'video', url:'https://', title:'Video' },
  accordion: { type:'accordion', title:'Expandable section', content:'Details go here.' },
  table: { type:'table', headers:['Column 1','Column 2'], rows:[['Value','Value'],['Value','Value']] },
  callout: { type:'callout', severity:'clinical', title:'Clinical note', text:'Add a concise clinical note here.' }
};

function cms2BlockPaletteHtml(fieldKey) {
  var html = '<div class="cms2-block-palette" data-block-palette="' + escapeHtml(fieldKey) + '">' +
    '<div class="cms2-block-palette-head"><strong>Quick add block</strong><span>Build the content from ready-made blocks instead of typing JSON.</span></div>' +
    '<div class="cms2-block-palette-actions">';
  Object.keys(CMS2_BLOCK_PRESETS).forEach(function(type) {
    html += '<button type="button" class="cms2-block-preset" data-add-block="' + escapeHtml(type) + '">' + escapeHtml(cms2PrettyKey(type)) + '</button>';
  });
  html += '</div></div>';
  return html;
}

function cms2BlockAdd(fieldKey, type) {
  var state = cms2VisualState[fieldKey];
  if (!Array.isArray(state)) {
    if (state && typeof state === 'object' && Object.keys(state).length) {
      state = [state];
    } else {
      state = [];
    }
    cms2VisualState[fieldKey] = state;
  }
  var preset = CMS2_BLOCK_PRESETS[type];
  if (!preset) return;
  state.push(cms2Clone(preset));
  cms2RenderVisualJson(fieldKey);
  cms2VisualBind(fieldKey);
  var host = document.querySelector('[data-json-builder="' + fieldKey + '"]');
  if (host) {
    var last = host.querySelector('.cms2-varray-item:last-child');
    if (last) last.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
}

function cms2RenderVisualJson(fieldKey) {
  var host = document.querySelector('[data-json-builder="' + fieldKey + '"]');
  if (!host) return;
  var state = cms2VisualState[fieldKey];
  if (state === undefined || state === null) state = {};
  host.innerHTML = cms2BlockPaletteHtml(fieldKey) + cms2VisualNode(state, [], undefined, 0);
  cms2BindBlockDrag(fieldKey);
}

function cms2InferEmptyValue() {
  return '';
}

function cms2VisualAddField(fieldKey, pathKey) {
  var state = cms2VisualState[fieldKey];
  var parts = pathKey ? pathKey.split('/').map(function(p) { return p.replace(/~1/g, '/').replace(/~0/g, '~'); }) : [];
  var parent = cms2GetPath(state, parts);
  if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return;
  var name = prompt('Field name (for example: dose, indication, notes):');
  if (!name) return;
  name = name.trim();
  if (!name || Object.prototype.hasOwnProperty.call(parent, name)) {
    showToast('That field already exists or is invalid', 'error'); return;
  }
  parent[name] = '';
  cms2RenderVisualJson(fieldKey);
}

function cms2VisualAddItem(fieldKey, pathKey) {
  var state = cms2VisualState[fieldKey];
  var parts = pathKey ? pathKey.split('/').map(function(p) { return p.replace(/~1/g, '/').replace(/~0/g, '~'); }) : [];
  var arr = cms2GetPath(state, parts);
  if (!Array.isArray(arr)) return;
  var sample = arr.length ? arr[0] : '';
  arr.push(cms2Clone(sample));
  cms2RenderVisualJson(fieldKey);
}


function cms2VisualMove(fieldKey, pathKey, direction) {
  var parts = pathKey ? pathKey.split('/').map(function(p) { return p.replace(/~1/g, '/').replace(/~0/g, '~'); }) : [];
  if (!parts.length) return;
  var index = Number(parts[parts.length - 1]);
  if (!Number.isInteger(index)) return;
  var parentParts = parts.slice(0, -1);
  var arr = cms2GetPath(cms2VisualState[fieldKey], parentParts);
  if (!Array.isArray(arr)) return;
  var target = index + direction;
  if (target < 0 || target >= arr.length) return;
  var tmp = arr[index];
  arr[index] = arr[target];
  arr[target] = tmp;
  cms2RenderVisualJson(fieldKey);
  cms2VisualBind(fieldKey);
}

function cms2VisualDuplicate(fieldKey, pathKey) {
  var parts = pathKey ? pathKey.split('/').map(function(p) { return p.replace(/~1/g, '/').replace(/~0/g, '~'); }) : [];
  if (!parts.length) return;
  var index = Number(parts[parts.length - 1]);
  if (!Number.isInteger(index)) return;
  var arr = cms2GetPath(cms2VisualState[fieldKey], parts.slice(0, -1));
  if (!Array.isArray(arr) || !arr[index]) return;
  arr.splice(index + 1, 0, cms2Clone(arr[index]));
  cms2RenderVisualJson(fieldKey);
  cms2VisualBind(fieldKey);
}

function cms2VisualRemove(fieldKey, pathKey) {
  var parts = pathKey ? pathKey.split('/').map(function(p) { return p.replace(/~1/g, '/').replace(/~0/g, '~'); }) : [];
  if (!parts.length) return;
  var state = cms2VisualState[fieldKey];
  cms2DeletePath(state, parts);
  cms2RenderVisualJson(fieldKey);
}

function cms2VisualBind(fieldKey) {
  var host = document.querySelector('[data-json-builder="' + fieldKey + '"]');
  if (!host) return;
  host.addEventListener('input', function(e) {
    var el = e.target;
    var pk = el.getAttribute('data-vpath');
    if (!pk) return;
    var parts = pk ? pk.split('/').map(function(p) { return p.replace(/~1/g, '/').replace(/~0/g, '~'); }) : [];
    var old = cms2GetPath(cms2VisualState[fieldKey], parts);
    var value;
    if (el.type === 'checkbox') value = !!el.checked;
    else if (el.type === 'number') value = el.value === '' ? null : Number(el.value);
    else value = el.value;
    cms2SetPath(cms2VisualState[fieldKey], parts, value);
  });
  host.addEventListener('click', function(e) {
    var preset = e.target.closest('[data-add-block]');
    if (preset) {
      cms2BlockAdd(fieldKey, preset.getAttribute('data-add-block')); return;
    }
    var add = e.target.closest('[data-vaddfield]');
    if (add) {
      cms2VisualAddField(fieldKey, add.getAttribute('data-vaddfield')); return;
    }
    var addItem = e.target.closest('[data-vadd]');
    if (addItem) {
      cms2VisualAddItem(fieldKey, addItem.getAttribute('data-vadd')); return;
    }
    var moveUp = e.target.closest('[data-vmove-up]');
    if (moveUp) {
      cms2VisualMove(fieldKey, moveUp.getAttribute('data-vmove-up'), -1); return;
    }
    var moveDown = e.target.closest('[data-vmove-down]');
    if (moveDown) {
      cms2VisualMove(fieldKey, moveDown.getAttribute('data-vmove-down'), 1); return;
    }
    var duplicate = e.target.closest('[data-vduplicate]');
    if (duplicate) {
      cms2VisualDuplicate(fieldKey, duplicate.getAttribute('data-vduplicate')); return;
    }
    var remove = e.target.closest('[data-vremove]');
    if (remove) {
      if (confirm('Remove this field/item?')) cms2VisualRemove(fieldKey, remove.getAttribute('data-vremove'));
    }
  });
}


function cms2BindBlockDrag(fieldKey) {
  var host = document.querySelector('[data-json-builder="' + fieldKey + '"]');
  if (!host || host.dataset.cms2DragBound === "1") return;
  host.dataset.cms2DragBound = "1";
  var dragPath = null;
  host.addEventListener('dragstart', function(e) {
    var item = e.target.closest('[data-vitem]');
    if (!item) return;
    dragPath = item.getAttribute('data-vitem');
    item.classList.add('cms2-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragPath);
    }
  });
  host.addEventListener('dragend', function(e) {
    var item = e.target.closest('[data-vitem]');
    if (item) item.classList.remove('cms2-dragging');
    dragPath = null;
    host.querySelectorAll('.cms2-drag-over').forEach(function(el){ el.classList.remove('cms2-drag-over'); });
  });
  host.addEventListener('dragover', function(e) {
    var target = e.target.closest('[data-vitem]');
    if (!target || !dragPath || target.getAttribute('data-vitem') === dragPath) return;
    e.preventDefault();
    target.classList.add('cms2-drag-over');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  host.addEventListener('dragleave', function(e) {
    var target = e.target.closest('[data-vitem]');
    if (target && !target.contains(e.relatedTarget)) target.classList.remove('cms2-drag-over');
  });
  host.addEventListener('drop', function(e) {
    var target = e.target.closest('[data-vitem]');
    if (!target || !dragPath) return;
    e.preventDefault();
    target.classList.remove('cms2-drag-over');
    var fromParts = dragPath.split('/').map(function(x){ return x.replace(/~1/g,'/').replace(/~0/g,'~'); });
    var toPath = target.getAttribute('data-vitem');
    var toParts = toPath.split('/').map(function(x){ return x.replace(/~1/g,'/').replace(/~0/g,'~'); });
    if (!fromParts.length || !toParts.length) return;
    var from = Number(fromParts[fromParts.length-1]), to = Number(toParts[toParts.length-1]);
    var fromParent = cms2GetPath(cms2VisualState[fieldKey], fromParts.slice(0,-1));
    var toParent = cms2GetPath(cms2VisualState[fieldKey], toParts.slice(0,-1));
    if (!Array.isArray(fromParent) || fromParent !== toParent || from === to) return;
    var moved = fromParent.splice(from,1)[0];
    fromParent.splice(to,0,moved);
    cms2RenderVisualJson(fieldKey);
    cms2VisualBind(fieldKey);
    cms2BindBlockDrag(fieldKey);
  });
}

function cms2PreviewEscape(value) {
  return escapeHtml(value == null ? '' : String(value));
}
function cms2PreviewBlock(block) {
  if (!block || typeof block !== 'object') return '<p>' + cms2PreviewEscape(block) + '</p>';
  var type = String(block.type || 'text').toLowerCase();
  if (type === 'heading') return '<h2>' + cms2PreviewEscape(block.text || block.title || 'Heading') + '</h2>';
  if (type === 'alert') return '<div class="cms2-preview-alert ' + cms2PreviewEscape(block.severity || 'info') + '"><strong>' + cms2PreviewEscape(block.title || 'Important') + '</strong><p>' + cms2PreviewEscape(block.message || block.text || '') + '</p></div>';
  if (type === 'checklist') {
    var items = Array.isArray(block.items) ? block.items : [];
    return '<div class="cms2-preview-section"><h4>Checklist</h4><ul class="cms2-preview-checklist">' + items.map(function(x){return '<li>☐ '+cms2PreviewEscape(typeof x==='object' ? (x.text||x.label||'') : x)+'</li>';}).join('')+'</ul></div>';
  }
  if (type === 'card') return '<article class="cms2-preview-card-block"><h3>'+cms2PreviewEscape(block.title||'Card')+'</h3><p>'+cms2PreviewEscape(block.text||block.content||'')+'</p></article>';
  if (type === 'button') return '<p><span class="cms2-preview-button">'+cms2PreviewEscape(block.label||'Open')+'</span></p>';
  if (type === 'image') return '<figure><div class="cms2-preview-media">Image: '+cms2PreviewEscape(block.alt||block.url||'')+'</div></figure>';
  if (type === 'video') return '<div class="cms2-preview-media">Video: '+cms2PreviewEscape(block.title||block.url||'')+'</div>';
  if (type === 'table') {
    var headers = Array.isArray(block.headers) ? block.headers : [];
    var rows = Array.isArray(block.rows) ? block.rows : [];
    return '<div class="cms2-preview-table-wrap"><table><thead><tr>' + headers.map(function(h){return '<th>'+cms2PreviewEscape(h)+'</th>';}).join('') + '</tr></thead><tbody>' +
      rows.map(function(row){ return '<tr>' + (Array.isArray(row) ? row : []).map(function(cell){return '<td>'+cms2PreviewEscape(cell)+'</td>';}).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }
  if (type === 'callout') return '<div class="cms2-preview-alert '+cms2PreviewEscape(block.severity||'clinical')+'"><strong>'+cms2PreviewEscape(block.title||'Clinical note')+'</strong><p>'+cms2PreviewEscape(block.text||'')+'</p></div>';
  if (type === 'accordion') return '<details class="cms2-preview-accordion"><summary>'+cms2PreviewEscape(block.title||'Expandable section')+'</summary><p>'+cms2PreviewEscape(block.content||block.text||'')+'</p></details>';
  return '<div class="cms2-preview-text">'+cms2PreviewEscape(block.text||block.content||block.message||'')+'</div>';
}
function cms2PreviewCurrent() {
  var modal=document.getElementById('cms2PreviewModal'), body=document.getElementById('cms2PreviewBody');
  if (!modal || !body) return;
  var def=CMS2_TYPES[cms2CurrentType]||{};
  var title=(document.getElementById('cms2EditorTitle')||{}).textContent || 'Content Preview';
  var state=cms2VisualState.content;
  var blocks=Array.isArray(state) ? state : (state && typeof state==='object' ? [state] : []);
  document.getElementById('cms2PreviewTitle').textContent=title+' — Preview';
  body.innerHTML=blocks.length ? blocks.map(cms2PreviewBlock).join('') : '<p class="muted">Nothing has been added yet.</p>';
  modal.style.display='flex';
}
function cms2ClosePreview() {
  var modal=document.getElementById('cms2PreviewModal');
  if (modal) modal.style.display='none';
}

function cms2ReadVisualJson(fieldKey) {
  var state = cms2VisualState[fieldKey];
  if (state === undefined) return null;
  return cms2Clone(state);
}

function cms2InitVisualEditors(item) {
  var def = CMS2_TYPES[cms2CurrentType] || {};
  def.fields.forEach(function(f) {
    if (f.type !== 'visual-json') return;
    var value = item && item[f.k] !== undefined ? item[f.k] : {};
    if (typeof value === 'string') {
      try { value = value.trim() ? JSON.parse(value) : {}; } catch(e) { value = { value: value }; }
    }
    if (value === null || value === undefined) value = {};
    cms2VisualState[f.k] = cms2Clone(value);
    var blockType = item && item.block_type ? item.block_type : null;
    /* Migrated surgery/scene records were originally stored as generic
       document blocks. Use their preserved source_type so they still get
       the correct dedicated clinical form. */
    if (blockType === 'document' && item && item[f.k] && typeof item[f.k] === 'object' &&
        item[f.k]._migration && item[f.k]._migration.source_type) {
      var migratedType = String(item[f.k]._migration.source_type).toLowerCase();
      if (cms2ClinicalFormFor(migratedType)) blockType = migratedType;
    }
    if (cms2CurrentType === 'content-block' && cms2ClinicalFormFor(blockType)) {
      cms2RenderClinicalEditor(f.k, blockType);
    } else {
      cms2RenderVisualJson(f.k);
      cms2VisualBind(f.k);
    }
  });
  cms2BindClinicalTypeSelector(item);
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
  var oldWorkflow = body.parentNode.querySelector('.cms2-workflow-bar');
  if (oldWorkflow) oldWorkflow.remove();
  var workflow = document.createElement('div');
  workflow.className = 'cms2-workflow-bar';
  workflow.innerHTML = '<div><span class="cms2-workflow-label">Publishing</span><span id="cms2WorkflowStatus" class="cms2-status-pill">Draft</span></div>' +
    '<div class="cms2-workflow-actions">' +
    '<button type="button" class="secondary" onclick="cms2SaveAs(\'draft\')">Save Draft</button>' +
    '<button type="button" class="primary" onclick="cms2SaveAs(\'published\')">Publish</button>' +
    (id ? '<button type="button" class="secondary" onclick="cms2ShowVersions()">Revision History</button>' : '') +
    '</div>';
  body.parentNode.insertBefore(workflow, body);
  cms2InitVisualEditors(item);
  if (item && item.status) {
    var statusPill = document.getElementById('cms2WorkflowStatus');
    if (statusPill) statusPill.textContent = String(item.status).replace(/^./, function(c){return c.toUpperCase();});
  }
  if (!id) {
    var nameInput = body.querySelector('[data-f="name"]');
    var slugInput = body.querySelector('[data-f="slug"]');
    if (nameInput && slugInput) {
      nameInput.addEventListener('input', function() {
        if (!slugInput.dataset.manual) {
          slugInput.value = String(nameInput.value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        }
      });
      slugInput.addEventListener('input', function() { slugInput.dataset.manual = '1'; });
    }
    var titleInput = body.querySelector('[data-f="title"]');
    var keyInput = body.querySelector('[data-f="block_key"]');
    if (titleInput && keyInput) {
      titleInput.addEventListener('input', function() {
        if (!keyInput.dataset.manual) {
          keyInput.value = String(titleInput.value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'content-block';
        }
      });
      keyInput.addEventListener('input', function() { keyInput.dataset.manual = '1'; });
    }
  }
  editor.style.display = 'block';
  editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  var cmsForm = document.getElementById('cms2Form');
  if (cmsForm) {
    cmsForm.addEventListener('input', cms2ScheduleAutoSave);
    cmsForm.addEventListener('change', cms2ScheduleAutoSave);
  }
  cms2RestoreLocalDraft();
}

function cms2CloseEditor() {
  var editor = document.getElementById('cms2Editor');
  if (editor) editor.style.display = 'none';
  cms2EditId = null;
}


var cms2AutoSaveTimer = null;
function cms2AutoSaveKey() {
  return 'uhs-cms2-autosave:' + String(cms2CurrentType || 'content') + ':' + String(cms2EditId || 'new');
}
function cms2CollectFormSnapshot() {
  var def = CMS2_TYPES[cms2CurrentType] || {};
  var body = document.getElementById('cms2Form');
  var values = {};
  if (!body) return values;
  (def.fields || []).forEach(function(f) {
    if (f.type === 'visual-json') return;
    var el = body.querySelector('[data-f="' + f.k + '"]');
    if (!el) return;
    values[f.k] = f.type === 'checkbox' ? !!el.checked : el.value;
  });
  return values;
}
function cms2ScheduleAutoSave() {
  clearTimeout(cms2AutoSaveTimer);
  cms2AutoSaveTimer = setTimeout(function() {
    try {
      localStorage.setItem(cms2AutoSaveKey(), JSON.stringify({
        savedAt: Date.now(),
        values: cms2CollectFormSnapshot(),
        visual: cms2Clone(cms2VisualState.content)
      }));
      var pill = document.getElementById('cms2WorkflowStatus');
      if (pill) {
        pill.textContent = 'Local draft';
        pill.classList.add('cms2-autosaved');
      }
    } catch (_) {}
  }, 700);
}
function cms2RestoreLocalDraft() {
  try {
    var raw = localStorage.getItem(cms2AutoSaveKey());
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (!saved || !saved.savedAt || Date.now() - Number(saved.savedAt) > 1000 * 60 * 60 * 24 * 7) return;
    if (!confirm('A recent local draft was found for this CMS item. Restore it?')) return;
    var body = document.getElementById('cms2Form');
    var def = CMS2_TYPES[cms2CurrentType] || {};
    Object.keys(saved.values || {}).forEach(function(k) {
      var el = body && body.querySelector('[data-f="' + k + '"]');
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!saved.values[k];
      else el.value = saved.values[k] == null ? '' : saved.values[k];
    });
    if (saved.visual !== undefined) {
      cms2VisualState.content = saved.visual;
      cms2InitVisualEditors(null);
    }
    showToast('Local draft restored', 'success');
  } catch (_) {}
}
function cms2ClearLocalDraft() {
  try { localStorage.removeItem(cms2AutoSaveKey()); } catch (_) {}
}

async function cms2Save(statusOverride) {
  var def = CMS2_TYPES[cms2CurrentType] || {};
  var body = document.getElementById('cms2Form');
  if (!body) return;
  var data = {};
  for (var i = 0; i < def.fields.length; i++) {
    var f = def.fields[i];
    if (f.type === 'visual-json') {
      try { data[f.k] = cms2ReadVisualJson(f.k); }
      catch(e2) { showToast('Could not read ' + f.label + ': ' + ((e2&&e2.message)||'Invalid content'), 'error'); return; }
      continue;
    }
    var el = body.querySelector('[data-f="' + f.k + '"]');
    if (!el) { data[f.k] = null; continue; }
    if (f.type === 'checkbox') { data[f.k] = !!el.checked; continue; }
    if (f.type === 'number') { data[f.k] = parseInt(el.value, 10) || 0; continue; }
    /* select-source and parent fields reference UUID columns
       server-side (parent_id, page_id, section_id, etc). The
       "(none)" option sends an empty string, which Postgres
       correctly rejects as an invalid UUID — convert it to
       null here so "no selection" actually means no value. */
    if ((f.type === 'select-source' || f.type === 'parent') && el.value === '') {
      data[f.k] = null;
      continue;
    }
    data[f.k] = el.value;
  }
  if (statusOverride && def.fields.some(function(f){ return f.k === 'status'; })) data.status = statusOverride;
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
    cms2ClearLocalDraft();
    cms2CloseEditor();
    await cms2RefreshSources();
    await cms2List();
  } catch(e) {
    showToast('Save failed: ' + ((e&&e.message)||''), 'error');
  }
}


async function cms2SaveAs(status) {
  await cms2Save(status);
}
async function cms2ShowVersions() {
  if (!cms2EditId || cms2CurrentType !== 'content-block') {
    showToast('Revision history is currently available for content blocks.', 'error'); return;
  }
  try {
    var data = await api('/api/cms-blocks/' + cms2EditId + '/versions');
    var versions = Array.isArray(data.versions) ? data.versions : [];
    var modal = document.getElementById('cms2VersionsModal');
    var body = document.getElementById('cms2VersionsBody');
    if (!modal || !body) return;
    body.innerHTML = versions.length ? versions.map(function(v) {
      var when = v.created_at ? new Date(v.created_at).toLocaleString() : 'Unknown time';
      return '<div class="cms2-version-row"><div><strong>Version ' + escapeHtml(v.version) + '</strong><span class="muted">' + escapeHtml(when) + '</span></div>' +
        '<button type="button" class="secondary" onclick="cms2RestoreVersion(' + Number(v.version) + ')">Restore</button></div>';
    }).join('') : '<p class="muted">No revisions have been recorded yet. A revision is created automatically before an edit is saved.</p>';
    modal.style.display='flex';
  } catch(e) { showToast('Could not load revision history', 'error'); }
}
async function cms2RestoreVersion(version) {
  if (!cms2EditId || !confirm('Restore version ' + version + '? The current item will remain recoverable in revision history.')) return;
  try {
    await api('/api/cms-blocks/' + cms2EditId + '/versions/restore/' + encodeURIComponent(version), {method:'POST'});
    showToast('Revision restored', 'success');
    var modal=document.getElementById('cms2VersionsModal'); if(modal) modal.style.display='none';
    await cms2RefreshSources(); await cms2List();
    cms2OpenEditor(cms2EditId);
  } catch(e) { showToast('Restore failed: ' + ((e&&e.message)||''), 'error'); }
}
function cms2CloseVersions() {
  var modal=document.getElementById('cms2VersionsModal'); if(modal) modal.style.display='none';
}

async function cms2Delete(id) {
  if (!confirm('Delete this item? It can be restored later.')) return;
  var def = CMS2_TYPES[cms2CurrentType] || {};
  try {
    await api(def.listEndpoint + '/' + id, { method: 'DELETE' });
    showToast('Deleted', 'success');
    await cms2RefreshSources();
    await cms2List();
  } catch(e) { showToast('Delete failed: ' + ((e&&e.message)||''), 'error'); }
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
window.cms2Save = cms2Save; window.cms2SaveAs = cms2SaveAs; window.cms2ShowVersions = cms2ShowVersions; window.cms2RestoreVersion = cms2RestoreVersion; window.cms2CloseVersions = cms2CloseVersions;
window.cms2Delete = cms2Delete;
window.cms2Duplicate = cms2Duplicate;
window.cms2SetStatus = cms2SetStatus;
window.cms2PreviewCurrent = cms2PreviewCurrent;
window.cms2ClosePreview = cms2ClosePreview;

(function cms4Boot() {
  function load() {
    if (typeof cms4LoadOverview === 'function') cms4LoadOverview();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
