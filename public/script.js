'use strict';

let currentUser = null;
let staffCache = [];

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const opts = {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };

  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, opts);

  let data = {};

  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const detail = [
      data.message,
      data.detail,
      data.constraint ? `constraint: ${data.constraint}` : '',
      data.table ? `table: ${data.table}` : '',
      data.column ? `column: ${data.column}` : '',
      data.code ? `code: ${data.code}` : ''
    ].filter(Boolean).join(' — ');
    throw new Error(detail || data.error || `Request failed (${res.status})`);
  }

  return data;
}

/* =========================================================
   AUTH
========================================================= */

function openAuth(mode = 'login') {
  const modal = document.getElementById('authModal');
  const loginBox = document.getElementById('authLogin');
  const signupBox = document.getElementById('authSignup');
  const message = document.getElementById('authMessage');

  if (!modal) return;

  if (loginBox) {
    loginBox.style.display = mode === 'login' ? '' : 'none';
  }

  if (signupBox) {
    signupBox.style.display = mode === 'signup' ? '' : 'none';
  }

  if (message) {
    message.textContent = '';
    message.className = 'auth-message';
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    const field = document.getElementById(
      mode === 'login' ? 'loginEmail' : 'signupDiscord'
    );

    if (field) field.focus();
  }, 50);
}

function closeAuth() {
  const modal = document.getElementById('authModal');

  if (!modal) return;

  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

function setAuthMessage(message, type = '') {
  const el = document.getElementById('authMessage');

  if (!el) return;

  el.textContent = message;
  el.className = `auth-message ${type}`.trim();
}

async function signup() {
  const email =
    (document.getElementById('signupEmail')?.value || '').trim();

  const password =
    document.getElementById('signupPassword')?.value || '';

  const dob =
    document.getElementById('signupDob')?.value || '';

  const displayName =
    (document.getElementById('signupName')?.value || '').trim();

  const discordUsername =
    (document.getElementById('signupDiscord')?.value || '').trim();

  if (!email || !password || !dob || !displayName) {
    setAuthMessage('Please complete all fields.', 'error');
    return;
  }

  if (password.length < 10) {
    setAuthMessage(
      'Password must be at least 10 characters.',
      'error'
    );
    return;
  }

  setAuthMessage('Creating your account...');

  try {
    const result = await api('/api/auth/signup', {
      method: 'POST',
      body: {
        email,
        password,
        displayName,
        dob,
        discordUsername: discordUsername || undefined
      }
    });

    currentUser = result.user || null;

    closeAuth();
    updateAuthUI();
    renderProfile();

    showSection('account');

    if (currentUser) {
      await loadStaff();
      await loadAdminList();
      initRpSystem();
    }

  } catch (err) {
    setAuthMessage(
      err.message || 'Unable to create account.',
      'error'
    );
  }
}

async function login() {
  const email =
    (document.getElementById('loginEmail')?.value || '').trim();

  const password =
    document.getElementById('loginPassword')?.value || '';

  if (!email || !password) {
    setAuthMessage(
      'Enter your email and password.',
      'error'
    );
    return;
  }

  setAuthMessage('Signing you in...');

  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: {
        email,
        password
      }
    });

    currentUser = result.user || null;

    closeAuth();
    updateAuthUI();
    renderProfile();

    showSection('account');

    if (currentUser) {
      await loadStaff();
      await loadAdminList();
      initRpSystem();
    }

  } catch (err) {
    setAuthMessage(
      err.message || 'Email or password is incorrect.',
      'error'
    );
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', {
      method: 'POST',
      body: {}
    });
  } catch (_) {}

  currentUser = null;
  staffCache = [];
  userRpActions = [];
  userTtsActions = [];
  userRpFavourites = [];
  userRpFavouritesRowId = null;
  savedScenes = [];

  updateAuthUI();
  showSection('dashboard');
}

async function loadCurrentUser() {
  try {
    const result = await api('/api/me');
    currentUser = result.user || null;

  } catch (_) {
    currentUser = null;
  }

  updateAuthUI();

  if (currentUser) {
    renderProfile();
    await loadStaff();
    await loadAdminList();
    initRpSystem();
  }
}

function updateAuthUI() {
  const loggedIn = !!currentUser;
  const admin =
    loggedIn && currentUser.role === 'admin';

  const setVisible = (id, visible) => {
    const el = document.getElementById(id);

    if (el) {
      el.style.display = visible ? '' : 'none';
    }
  };

  setVisible('headerLoginBtn', !loggedIn);
  setVisible('headerSignupBtn', !loggedIn);

  setVisible('headerProfileBtn', loggedIn);
  setVisible('headerLogoutBtn', loggedIn);

  setVisible('headerAdminBtn', admin);

  const loggedOut =
    document.getElementById('accountLoggedOut');

  const profile =
    document.getElementById('profileView');

  if (loggedOut) {
    loggedOut.style.display =
      loggedIn ? 'none' : '';
  }

  if (profile) {
    profile.style.display =
      loggedIn ? '' : 'none';
  }

  const gate =
    document.getElementById('adminGate');

  const panel =
    document.getElementById('adminPanel');

  if (gate) {
    gate.style.display =
      admin ? 'none' : '';
  }

  if (panel) {
    panel.style.display =
      admin ? '' : 'none';
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function showSection(id) {
  if (!id) return;

  document
    .querySelectorAll('.section')
    .forEach(section => {

      section.classList.toggle(
        'active',
        section.id === id
      );

    });

  document
    .querySelectorAll('.nav')
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.section === id
      );

    });

  if (id === 'account') {
    renderProfile();
  }

  if (id === 'staff' && currentUser) {
    loadStaff();
  }

  if (
    id === 'admin' &&
    currentUser?.role === 'admin'
  ) {
    refreshAdmin();
  }

  if (id === 'scenes') {
    initialiseScenes();
  }

  if (id === 'cardiac') {
    initialiseCardiac();
  }

  if (id === 'procedures') {
    initialiseProcedures();
  }

  if (id === 'documentation') {
    initialiseDocGuides();
  }

  if (id === 'trauma') {
    initialiseTraumaSection();
  }
  if (id === 'documents') {
    renderDocWorkspace();
  }
  if (id === 'rp') {
    initRpSystem();
  }
  if (id === 'surgeries') {
    initialiseSurgeries();
  }

  if (id === 'respiratory') {
    initialiseRespiratorySection();
  }

  if (id === 'pain') {
    initialisePainSection();
  }

  if (id === 'meds') {
    showMedCategory('painrelief');
  }

  if (id === 'handbook-page') {
    initRichEditor('handbook-editor', '/api/handbook');
  }
}

/* =========================================================
   PROFILE
========================================================= */

function renderProfile() {
  if (!currentUser) return;

  const setText = (id, value) => {
    const el = document.getElementById(id);

    if (el) {
      el.textContent = value || '';
    }
  };

  setText(
    'profileName',
    currentUser.displayName ||
    currentUser.display_name ||
    'NHS Member'
  );

  setText(
    'profileRank',
    currentUser.rank ||
    'Rank pending'
  );

  setText(
    'profileCallsign',
    currentUser.callsign ||
    'CALLSIGN'
  );

  setText(
    'profileSpecialty',
    currentUser.specialty || ''
  );

  const picture =
    document.getElementById('profilePicture');

  if (picture) {
    const pictureUrl =
      currentUser.pictureUrl ||
      currentUser.picture_url;

    if (pictureUrl) {
      picture.src = pictureUrl;
      picture.style.display = '';

    } else {
      picture.removeAttribute('src');
      picture.style.display = 'none';
    }
  }

  const details =
    document.getElementById('profileDetails');

  if (details) {
    details.innerHTML = `
      <p>
        <strong>Discord username:</strong>
        ${escapeHtml(currentUser.discordUsername || 'Not set')}
      </p>

      <p>
        <strong>Date of birth:</strong>
        ${escapeHtml(currentUser.dob || '')}
      </p>

      <p>
        <strong>Role:</strong>
        ${escapeHtml(currentUser.role || '')}
      </p>

      <p>
        <strong>Rank:</strong>
        ${escapeHtml(currentUser.rank || 'Pending')}
      </p>

      <p>
        <strong>Callsign:</strong>
        ${escapeHtml(
          currentUser.callsign || 'Not assigned'
        )}
      </p>

      <p>
        <strong>Specialty:</strong>
        ${escapeHtml(
          currentUser.specialty || 'Not assigned'
        )}
      </p>
    `;
  }
}

function editOwnProfile() {
  if (!currentUser) return;

  openEditWithUser(currentUser);
}

function openEditWithUser(user) {
  const setValue = (id, value) => {
    const el = document.getElementById(id);

    if (el) {
      el.value = value ?? '';
    }
  };

  setValue(
    'editId',
    user.id
  );

  setValue(
    'editName',
    user.displayName ||
    user.display_name
  );

  setValue(
    'editEmail',
    user.email
  );

  setValue(
    'editDob',
    user.dob
  );

  setValue(
    'editRank',
    user.rank
  );

  setValue(
    'editCallsign',
    user.callsign
  );

  setValue(
    'editSpecialty',
    user.specialty
  );

  setValue(
    'editDiscord',
    user.discordUsername ||
    user.discord_username
  );

  setValue(
    'editPicture',
    user.pictureUrl ||
    user.picture_url
  );

  setValue(
    'editRole',
    user.role || 'member'
  );

  setValue(
    'editTraining',
    Array.isArray(user.training)
      ? user.training.join('\n')
      : ''
  );

  const modal =
    document.getElementById('editModal');

  if (modal) {
    modal.style.display = 'flex';

    modal.setAttribute(
      'aria-hidden',
      'false'
    );
  }
}

function closeEdit() {
  const modal =
    document.getElementById('editModal');

  if (!modal) return;

  modal.style.display = 'none';

  modal.setAttribute(
    'aria-hidden',
    'true'
  );
}

async function saveProfile() {
  const id =
    document.getElementById('editId')?.value;

  if (!id || !currentUser) return;

  const training =
    (
      document.getElementById('editTraining')
        ?.value || ''
    )
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);

  const body = {
    displayName:
      document
        .getElementById('editName')
        ?.value.trim() || '',

    email:
      document
        .getElementById('editEmail')
        ?.value.trim() || '',

    dob:
      document
        .getElementById('editDob')
        ?.value || '',

    rank:
      document
        .getElementById('editRank')
        ?.value.trim() || '',

    callsign:
      document
        .getElementById('editCallsign')
        ?.value.trim() || '',

    specialty:
      document
        .getElementById('editSpecialty')
        ?.value.trim() || '',

    discordUsername:
      document
        .getElementById('editDiscord')
        ?.value.trim() || null,

    pictureUrl:
      document
        .getElementById('editPicture')
        ?.value.trim() || null,

    role:
      currentUser.role === 'admin'
        ? (
            document
              .getElementById('editRole')
              ?.value || 'member'
          )
        : currentUser.role,

    training
  };

  try {
    const result =
      await api(
        `/api/staff/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body
        }
      );

    currentUser =
      result.user || currentUser;

    closeEdit();

    updateAuthUI();
    renderProfile();

    await loadStaff();

    alert('Profile saved.');

  } catch (err) {
    alert(
      err.message ||
      'Unable to save profile.'
    );
  }
}

/* =========================================================
   STAFF
========================================================= */

async function loadStaff() {
  if (!currentUser) return;

  try {
    const result =
      await api('/api/staff');

    staffCache =
      result.staff || [];

    renderStaff();
    renderRanks();

  } catch (err) {
    console.error(
      'Unable to load staff:',
      err
    );
  }
}

function staffMatches(user, query) {
  return [
    user.display_name,
    user.displayName,
    user.rank,
    user.callsign,
    user.specialty,
    ...(Array.isArray(user.training)
      ? user.training
      : [])
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function staffCard(user) {
  const picture =
    user.picture_url ||
    user.pictureUrl;

  const pictureHtml =
    picture
      ? `
        <img
          class="staff-avatar"
          src="${escapeHtml(picture)}"
          alt=""
        >
      `
      : `
        <div
          class="staff-avatar staff-avatar-empty"
        >
          👤
        </div>
      `;

  return `
    <article class="staff-card">

      ${pictureHtml}

      <div>

        <h3>
          ${escapeHtml(
            user.display_name ||
            user.displayName ||
            'NHS Member'
          )}
        </h3>

        <p>
          ${escapeHtml(
            user.rank ||
            'Rank pending'
          )}
        </p>

        <div class="profile-badge">
          ${escapeHtml(
            user.callsign ||
            'CALLSIGN'
          )}
        </div>

        <small>
          ${escapeHtml(
            user.specialty ||
            'No specialty assigned'
          )}
        </small>

        ${
          (user.discord_username || user.discordUsername)
            ? `
              <small class="staff-discord">
                💬 ${escapeHtml(
                  user.discord_username ||
                  user.discordUsername
                )}
              </small>
            `
            : ''
        }

      </div>

    </article>
  `;
}

function renderStaff() {
  const query =
    (
      document.getElementById('rosterSearch')
        ?.value || ''
    ).toLowerCase();

  const searchQuery =
    (
      document.getElementById('staffSearchInput')
        ?.value || ''
    ).toLowerCase();

  const rank =
    document
      .getElementById('rosterRankFilter')
      ?.value || '';

  const specialty =
    document
      .getElementById('rosterSpecialtyFilter')
      ?.value || '';

  const filtered =
    staffCache.filter(user =>
      (!query || staffMatches(user, query)) &&
      (!rank || user.rank === rank) &&
      (
        !specialty ||
        user.specialty === specialty
      )
    );

  const roster =
    document.getElementById('rosterGrid');

  if (roster) {
    roster.innerHTML =
      filtered.map(staffCard).join('') ||
      `
        <div class="notice">
          No staff found.
        </div>
      `;
  }

  const searchResults =
    document.getElementById(
      'staffSearchResults'
    );

  if (searchResults) {
    const results =
      staffCache.filter(user =>
        !searchQuery ||
        staffMatches(user, searchQuery)
      );

    searchResults.innerHTML =
      results.map(staffCard).join('') ||
      `
        <div class="notice">
          No staff found.
        </div>
      `;
  }

  populateFilters();
}

function populateFilters() {
  const ranks =
    [
      ...new Set(
        staffCache
          .map(x => x.rank)
          .filter(Boolean)
      )
    ].sort();

  const specialties =
    [
      ...new Set(
        staffCache
          .map(x => x.specialty)
          .filter(Boolean)
      )
    ].sort();

  const rankSelect =
    document.getElementById(
      'rosterRankFilter'
    );

  const specialtySelect =
    document.getElementById(
      'rosterSpecialtyFilter'
    );

  if (rankSelect) {
    const old =
      rankSelect.value;

    rankSelect.innerHTML =
      '<option value="">All ranks</option>' +
      ranks
        .map(
          x =>
            `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`
        )
        .join('');

    rankSelect.value = old;
  }

  if (specialtySelect) {
    const old =
      specialtySelect.value;

    specialtySelect.innerHTML =
      '<option value="">All specialties</option>' +
      specialties
        .map(
          x =>
            `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`
        )
        .join('');

    specialtySelect.value = old;
  }
}

/* =========================================================
   STAFF TABS
========================================================= */

function showStaffTab(tab) {
  const ids = {
    roster: 'staffRosterTab',
    search: 'staffSearchTab',
    bodycam: 'staffBodycamTab',
    ranks: 'staffRanksTab',
    studentportal: 'staffStudentPortalTab',
    handbook: 'staffHandbookTab'
  };

  Object.values(ids).forEach(id => {
    const el =
      document.getElementById(id);

    if (el) {
      el.style.display = 'none';
      el.classList.remove('active');
    }
  });

  const targetId =
    ids[tab];

  if (targetId) {
    const target =
      document.getElementById(targetId);

    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }
  }

  document
    .querySelectorAll(
      '[data-staff-tab], .staff-tab'
    )
    .forEach(button => {

      const buttonTab =
        button.dataset.staffTab ||
        button.getAttribute('data-tab');

      button.classList.toggle(
        'active',
        buttonTab === tab
      );
    });

  if (tab === 'roster') {
    renderStaff();
  }

  if (tab === 'ranks') {
    renderRanks();
  }

  if (tab === 'bodycam') {
    loadBodycam();
  }

  if (tab === 'studentportal') {
    initialiseStudentPortal();
  }

  if (tab === 'handbook') {
    renderStoredPdfDocs();
  }
}

function renderRanks() {
  const list =
    document.getElementById('rankList');

  if (!list) return;

  const ranks =
    [
      ...new Set(
        staffCache
          .map(x => x.rank)
          .filter(Boolean)
      )
    ];

  list.innerHTML =
    ranks
      .map(
        (rank, i) => `
          <div class="rank-row">

            <span>
              ${i + 1}
            </span>

            <strong>
              ${escapeHtml(rank)}
            </strong>

          </div>
        `
      )
      .join('') ||
    `
      <p class="muted">
        No ranks assigned yet.
      </p>
    `;
}

function addRank() {
  alert(
    'Ranks are assigned through the staff profile editor.'
  );
}

/* =========================================================
   ADMIN
========================================================= */

async function refreshAdmin() {
  if (
    !currentUser ||
    currentUser.role !== 'admin'
  ) {
    return;
  }

  try {
    const result =
      await api('/api/staff');

    staffCache =
      result.staff || [];

    renderAdmin();

  } catch (err) {
    console.error(err);
  }
}

function renderAdmin() {
  const list =
    document.getElementById('staffList');

  if (!list) return;

  const query =
    (
      document.getElementById('adminSearch')
        ?.value || ''
    ).toLowerCase();

  const users =
    staffCache.filter(user =>
      [
        user.display_name,
        user.displayName,
        user.email,
        user.rank,
        user.callsign,
        user.specialty
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );

  list.innerHTML =
    users
      .map(
        user => `
          <article class="admin-staff-card">

            <div>

              <strong>
                ${escapeHtml(
                  user.display_name ||
                  user.displayName ||
                  ''
                )}
              </strong>

              <span>
                ${escapeHtml(
                  user.rank ||
                  'Rank pending'
                )}
              </span>

              <small>
                ${escapeHtml(
                  user.callsign ||
                  'No callsign'
                )}
                •
                ${escapeHtml(
                  user.specialty ||
                  'No specialty'
                )}
              </small>

            </div>

            <button
              class="primary"
              onclick="editStaff('${escapeHtml(user.id)}')"
            >
              Edit
            </button>

          </article>
        `
      )
      .join('') ||
    `
      <div class="notice">
        No staff found.
      </div>
    `;
}

function editStaff(id) {
  const user =
    staffCache.find(
      x => String(x.id) === String(id)
    );

  if (!user) return;

  openEditWithUser(user);
}

/* =========================================================
   PROFILE TABS
========================================================= */

function showProfileTab(tab) {
  const panels = {
    overview:
      'profileOverviewTab',

    adminjournal:
      'profileAdminJournalTab',

    privatejournal:
      'profilePrivateJournalTab'
  };

  Object
    .values(panels)
    .forEach(id => {

      const el =
        document.getElementById(id);

      if (el) {
        el.style.display = 'none';
        el.classList.remove('active');
      }

    });

  const targetId =
    panels[tab];

  if (targetId) {
    const target =
      document.getElementById(targetId);

    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }
  }

  document
    .querySelectorAll('.profile-tab')
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.profileTab === tab
      );

    });

  if (tab === 'privatejournal') {
    loadJournal();
  }

  if (tab === 'adminjournal') {
    loadStaffDevelopment();
  }
}

/* =========================================================
   JOURNAL
========================================================= */

async function loadJournal() {
  if (!currentUser) return;

  try {
    const result =
      await api('/api/journal');

    const list =
      document.getElementById(
        'privateJournalEntries'
      );

    if (!list) return;

    list.innerHTML =
      (result.entries || [])
        .map(
          entry => `
            <article class="journal-entry">

              <time>
                ${escapeHtml(
                  new Date(
                    entry.created_at
                  ).toLocaleString('en-GB')
                )}
              </time>

              <p>
                ${escapeHtml(
                  entry.body || ''
                ).replaceAll(
                  '\n',
                  '<br>'
                )}
              </p>

              <small>
                ${
                  entry.sent_to
                    ? 'Sent to admin'
                    : 'Private'
                }
              </small>

            </article>
          `
        )
        .join('') ||
      `
        <p class="muted">
          No journal entries yet.
        </p>
      `;

  } catch (err) {
    console.error(err);
  }
}

async function savePrivateJournal() {
  const body =
    (
      document.getElementById(
        'privateJournalText'
      )?.value || ''
    ).trim();

  if (!body) {
    alert('Write something first.');
    return;
  }

  try {
    await api('/api/journal', {
      method: 'POST',
      body: {
        body,
        sendTo: null
      }
    });

    const textarea =
      document.getElementById(
        'privateJournalText'
      );

    if (textarea) {
      textarea.value = '';
    }

    await loadJournal();

    alert('Saved privately.');

  } catch (err) {
    alert(
      err.message ||
      'Unable to save journal entry.'
    );
  }
}

async function sendPrivateJournalToAdmin() {
  const body =
    (
      document.getElementById(
        'privateJournalText'
      )?.value || ''
    ).trim();

  const sendTo =
    document.getElementById(
      'journalAdminRecipient'
    )?.value || '';

  if (!body || !sendTo) {
    alert(
      'Enter an entry and choose an admin.'
    );

    return;
  }

  try {
    await api('/api/journal', {
      method: 'POST',

      body: {
        body,
        sendTo
      }
    });

    const textarea =
      document.getElementById(
        'privateJournalText'
      );

    if (textarea) {
      textarea.value = '';
    }

    await loadJournal();

    alert('Entry sent.');

  } catch (err) {
    alert(
      err.message ||
      'Unable to send entry.'
    );
  }
}

/* =========================================================
   TRAINING

   Reuses the existing staff_development table/routes.
   Every logged-in user can view and tick their own
   checklist; admins can additionally edit the strengths/
   development/admin-notes feedback fields (students can\'t —
   the server enforces this even if the client didn't).
========================================================= */

const STUDENT_PATHWAY_CHECKLIST = [
  'Blue Light Trained',
  'Professional Radio Communications',
  'Medical Records & Reporting System \u2013 MDT',
  'Assisting a Paramedic',
  'Uniform Standards & Professional Appearance',
  'Command Structure & Escalation Procedures',
  'Patient Assessment (ABCDE)',
  'X-Ray & MRI',
  'Patient Observation \u2014 HR, BP, RR, SpO\u2082, BM, Temp',
  'ECG & Defibrillator',
  'Basic Life Support (BLS)',
  'Adult Resuscitation Procedures',
  'Airway Management',
  'Medication Management',
  'Burn Assessment & Burn Care',
  'Wound Assessment & Wound Care',
  'Bleeding & Haemorrhage Management',
  'Management of Unconscious Patients'
];

let currentTrainingChecklist = [];

async function loadStaffDevelopment() {
  const gate =
    document.getElementById('adminJournalGate');

  const content =
    document.getElementById('adminJournalContent');

  if (!currentUser) {
    if (gate) gate.style.display = '';
    if (content) content.style.display = 'none';
    return;
  }

  if (gate) gate.style.display = 'none';
  if (content) content.style.display = '';

  const isAdmin =
    currentUser.role === 'admin';

  const strengthsEl =
    document.getElementById('staffStrengths');

  const developmentEl =
    document.getElementById('staffDevelopment');

  [strengthsEl, developmentEl].forEach(el => {
    if (el) el.readOnly = !isAdmin;
  });

  try {
    const result =
      await api(
        `/api/staff/${encodeURIComponent(currentUser.id)}/development`
      );

    const dev =
      result.development || {};

    let checklist =
      Array.isArray(dev.checklist)
        ? dev.checklist
        : [];

    if (checklist.length === 0) {
      checklist =
        STUDENT_PATHWAY_CHECKLIST.map(
          text => ({ text, done: false })
        );
    }

    currentTrainingChecklist = checklist;
    renderTrainingChecklist();

    if (strengthsEl) {
      strengthsEl.value = dev.strengths || '';
    }

    if (developmentEl) {
      developmentEl.value = dev.development || '';
    }

    if (notesEl) {
      notesEl.value = dev.admin_notes || '';
    }

  } catch (err) {
    console.error(
      'Unable to load training record:',
      err
    );
  }
}

function renderTrainingChecklist() {
  const container =
    document.getElementById('trainingChecklist');

  if (!container) return;

  container.innerHTML =
    currentTrainingChecklist
      .map(
        (item, index) => `
          <div class="training-item">

            <input
              type="checkbox"
              ${item.done ? 'checked' : ''}
              onchange="toggleTrainingItem(${index})"
            >

            <input
              type="text"
              value="${escapeHtml(item.text)}"
              onchange="updateTrainingItemText(${index}, this.value)"
            >

            <button
              type="button"
              onclick="removeTrainingItem(${index})"
            >
              ✕
            </button>

          </div>
        `
      )
      .join('') ||
    `
      <p class="muted">
        No training items yet. Use "+ Add item" to start.
      </p>
    `;
}

function toggleTrainingItem(index) {
  if (!currentTrainingChecklist[index]) return;

  currentTrainingChecklist[index].done =
    !currentTrainingChecklist[index].done;

  renderTrainingChecklist();
}

function updateTrainingItemText(index, value) {
  if (!currentTrainingChecklist[index]) return;

  currentTrainingChecklist[index].text = value;
}

function removeTrainingItem(index) {
  currentTrainingChecklist.splice(index, 1);
  renderTrainingChecklist();
}

function addTrainingItem() {
  if (!currentUser) return;

  currentTrainingChecklist.push({
    text: '',
    done: false
  });

  renderTrainingChecklist();

  const container =
    document.getElementById('trainingChecklist');

  const inputs =
    container?.querySelectorAll('input[type="text"]');

  const lastInput =
    inputs?.[inputs.length - 1];

  if (lastInput) lastInput.focus();
}

async function saveStaffDevelopment() {
  if (!currentUser) return;

  const checklist =
    currentTrainingChecklist.filter(
      item => item.text.trim() !== ''
    );

  const strengths =
    document.getElementById('staffStrengths')?.value || '';

  const development =
    document.getElementById('staffDevelopment')?.value || '';

  const adminNotes = '';

  try {
    await api(
      `/api/staff/${encodeURIComponent(currentUser.id)}/development`,
      {
        method: 'PUT',
        body: {
          checklist,
          strengths,
          development,
          adminNotes
        }
      }
    );

    currentTrainingChecklist = checklist;
    renderTrainingChecklist();

    alert('Training & development record saved.');

  } catch (err) {
    alert(
      err.message ||
      'Unable to save training record.'
    );
  }
}

/* =========================================================
   MEDICATION RP
========================================================= */

function toggleMed(button) {
  if (!button) return;

  const card =
    button.closest('.med-card');

  if (!card) return;

  const rp =
    card.querySelector('.med-rp');

  if (!rp) return;

  const computed =
    window.getComputedStyle(rp);

  const isOpen =
    computed.display !== 'none';

  if (isOpen) {
    rp.style.display = 'none';

    button.textContent =
      'Show RP /me';

  } else {
    rp.style.display = 'block';

    button.textContent =
      'Hide RP /me';
  }
}

/* =========================================================
   COPY TEXT
========================================================= */

async function copyToClipboard(text) {
  if (!text) return false;

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);

      return true;
    }
  } catch (_) {}

  try {
    const textarea =
      document.createElement('textarea');

    textarea.value = text;

    textarea.setAttribute(
      'readonly',
      ''
    );

    textarea.style.position =
      'fixed';

    textarea.style.left =
      '-9999px';

    textarea.style.opacity =
      '0';

    document.body.appendChild(
      textarea
    );

    textarea.focus();
    textarea.select();

    const result =
      document.execCommand('copy');

    textarea.remove();

    return result;

  } catch (_) {
    return false;
  }
}

async function copyText(id) {
  const el =
    document.getElementById(id);

  if (!el) {
    console.warn(
      `copyText: element #${id} was not found`
    );

    return;
  }

  const text =
    (
      el.innerText ||
      el.textContent ||
      ''
    ).trim();

  const success =
    await copyToClipboard(text);

  if (!success) {
    console.warn(
      'Clipboard copy failed.'
    );
  }
}

async function copyRPButton(button) {
  if (!button) return;

  const item =
    button.closest(
      '.rp-item, .scene-rp-item, .scene-rp-row'
    );

  if (!item) return;

  const textEl =
    item.querySelector(
      'p, .rp-text, [data-rp-text]'
    );

  if (!textEl) return;

  const text =
    (
      textEl.innerText ||
      textEl.textContent ||
      ''
    ).trim();

  const success =
    await copyToClipboard(text);

  if (success) {
    const oldText =
      button.textContent;

    button.textContent =
      'Copied ✓';

    setTimeout(() => {
      button.textContent =
        oldText;
    }, 1200);
  }
}

/* =========================================================
   BLOOD PRESSURE
========================================================= */

function updateBP() {
  const sys =
    Number(
      document.getElementById('sys')
        ?.value || 120
    );

  const dia =
    Number(
      document.getElementById('dia')
        ?.value || 80
    );

  const s =
    document.getElementById(
      'sysDisplay'
    );

  const d =
    document.getElementById(
      'diaDisplay'
    );

  const meaning =
    document.getElementById(
      'bpMeaning'
    );

  if (s) {
    s.textContent = sys;
  }

  if (d) {
    d.textContent = dia;
  }

  if (!meaning) return;

  if (
    sys < 90 ||
    dia < 60
  ) {
    meaning.textContent =
      'Low BP / hypotension — interpret with symptoms and clinical context.';

  } else if (
    sys >= 180 ||
    dia >= 120
  ) {
    meaning.textContent =
      'Severely raised BP — urgent assessment may be required.';

  } else if (
    sys >= 140 ||
    dia >= 90
  ) {
    meaning.textContent =
      'High BP reading — repeat and interpret in context.';

  } else if (
    sys >= 121 ||
    dia >= 81
  ) {
    meaning.textContent =
      'Raised / above ideal.';

  } else {
    meaning.textContent =
      'Common reference range. Context matters.';
  }
}

/* =========================================================
   OTHER VITAL SIGN SLIDERS

   Each follows the same pattern as updateBP(): read the
   slider, update the live number, then set a plain-English
   meaning based on the value. RP/reference only.
========================================================= */

function updateHR() {
  const hr = Number(document.getElementById('hrRange')?.value || 75);
  const display = document.getElementById('hrDisplay');
  const meaning = document.getElementById('hrMeaning');

  if (display) display.textContent = hr;
  if (!meaning) return;

  if (hr < 40) {
    meaning.textContent = 'Severe bradycardia — needs urgent assessment.';
  } else if (hr < 60) {
    meaning.textContent = 'Bradycardia — may be normal in a fit/athletic patient, but review with symptoms.';
  } else if (hr <= 100) {
    meaning.textContent = 'Normal range.';
  } else if (hr <= 130) {
    meaning.textContent = 'Tachycardia — assess for an underlying cause.';
  } else {
    meaning.textContent = 'Marked tachycardia — needs urgent assessment.';
  }
}

function updateRR() {
  const rr = Number(document.getElementById('rrRange')?.value || 16);
  const display = document.getElementById('rrDisplay');
  const meaning = document.getElementById('rrMeaning');

  if (display) display.textContent = rr;
  if (!meaning) return;

  if (rr < 8) {
    meaning.textContent = 'Severe bradypnoea — needs urgent assessment.';
  } else if (rr < 12) {
    meaning.textContent = 'Bradypnoea — below the normal range.';
  } else if (rr <= 20) {
    meaning.textContent = 'Normal range.';
  } else if (rr <= 24) {
    meaning.textContent = 'Raised — assess for an underlying cause.';
  } else {
    meaning.textContent = 'Marked tachypnoea — needs urgent assessment.';
  }
}

function updateSpO2() {
  const spo2 = Number(document.getElementById('spo2Range')?.value || 98);
  const display = document.getElementById('spo2Display');
  const meaning = document.getElementById('spo2Meaning');

  if (display) display.textContent = spo2;
  if (!meaning) return;

  if (spo2 < 85) {
    meaning.textContent = 'Severe hypoxia — needs urgent assessment.';
  } else if (spo2 < 92) {
    meaning.textContent = 'Significant hypoxia — needs prompt assessment.';
  } else if (spo2 < 94) {
    meaning.textContent = 'Low — assess for an underlying cause.';
  } else {
    meaning.textContent = 'Normal range for most patients (target range may differ for some chronic respiratory conditions).';
  }
}

function updateTemp() {
  const temp = Number(document.getElementById('tempRange')?.value || 37);
  const display = document.getElementById('tempDisplay');
  const meaning = document.getElementById('tempMeaning');

  if (display) display.textContent = temp.toFixed(1);
  if (!meaning) return;

  if (temp < 35) {
    meaning.textContent = 'Hypothermia — needs assessment and active warming.';
  } else if (temp < 36.5) {
    meaning.textContent = 'Low-normal.';
  } else if (temp <= 37.5) {
    meaning.textContent = 'Normal range.';
  } else if (temp < 39) {
    meaning.textContent = 'Fever — assess for an underlying cause.';
  } else if (temp < 40) {
    meaning.textContent = 'High fever — needs assessment.';
  } else {
    meaning.textContent = 'Very high temperature — needs urgent assessment.';
  }
}

function updateBGL() {
  const bgl = Number(document.getElementById('bglRange')?.value || 6);
  const display = document.getElementById('bglDisplay');
  const meaning = document.getElementById('bglMeaning');

  if (display) display.textContent = bgl.toFixed(1);
  if (!meaning) return;

  if (bgl < 3) {
    meaning.textContent = 'Hypoglycaemia — needs urgent treatment.';
  } else if (bgl < 4) {
    meaning.textContent = 'Low — borderline hypoglycaemia.';
  } else if (bgl <= 7.8) {
    meaning.textContent = 'Normal range (approximate, non-fasting reference).';
  } else if (bgl <= 11) {
    meaning.textContent = 'Raised.';
  } else if (bgl <= 20) {
    meaning.textContent = 'High — hyperglycaemia.';
  } else {
    meaning.textContent = 'Very high — risk of DKA/HHS, needs urgent assessment.';
  }
}

function updateGCS() {
  const e = Number(document.getElementById('gcsE')?.value || 4);
  const v = Number(document.getElementById('gcsV')?.value || 5);
  const m = Number(document.getElementById('gcsM')?.value || 6);
  const total = e + v + m;

  const eDisplay = document.getElementById('gcsEDisplay');
  const vDisplay = document.getElementById('gcsVDisplay');
  const mDisplay = document.getElementById('gcsMDisplay');
  const totalDisplay = document.getElementById('gcsDisplay');
  const meaning = document.getElementById('gcsMeaning');

  if (eDisplay) eDisplay.textContent = e;
  if (vDisplay) vDisplay.textContent = v;
  if (mDisplay) mDisplay.textContent = m;
  if (totalDisplay) totalDisplay.textContent = total;
  if (!meaning) return;

  if (total === 15) {
    meaning.textContent = 'Normal — fully alert.';
  } else if (total >= 13) {
    meaning.textContent = 'Mild impairment.';
  } else if (total >= 9) {
    meaning.textContent = 'Moderate impairment.';
  } else {
    meaning.textContent = 'Severe impairment — airway at risk, needs urgent senior/anaesthetic input.';
  }
}

/* =========================================================
   PAIN

   painReliefByScore gives a specific recommendation for
   every point on the 0–10 scale, reusing the exact same
   drugs/doses already shown in the static Pain Ladder above
   so the two stay consistent. This is an RP reference only —
   see the "Do not use pain score alone" warning on the page.
========================================================= */

const painReliefByScore = [

  /* 0 */
  {
    heading: 'No pain (0/10)',
    lines: [
      'No analgesia routinely required.'
    ],
    caution:
      'Continue to monitor and reassess if the clinical picture changes.'
  },

  /* 1 */
  {
    heading: 'Mild pain (1/10) — first-line analgesia',
    lines: [
      'Paracetamol <span class="dose">500 mg–1 g PO</span>, at least 4 hours apart (max 4 g/24h).'
    ],
    caution:
      'Reassess and step up to the moderate pathway if pain persists or worsens.'
  },

  /* 2 */
  {
    heading: 'Mild pain (2/10) — first-line analgesia',
    lines: [
      'Paracetamol <span class="dose">500 mg–1 g PO</span>, at least 4 hours apart (max 4 g/24h).',
      'Ibuprofen <span class="dose">200–400 mg PO</span> can be considered if an NSAID is appropriate (OTC max 1.2 g/day).'
    ],
    caution:
      'Reassess and step up to the moderate pathway if pain persists or worsens.'
  },

  /* 3 */
  {
    heading: 'Mild pain (3/10) — first-line analgesia',
    lines: [
      'Paracetamol <span class="dose">500 mg–1 g PO</span>, at least 4 hours apart (max 4 g/24h).',
      'Ibuprofen <span class="dose">200–400 mg PO</span> can be considered if an NSAID is appropriate (OTC max 1.2 g/day).'
    ],
    caution:
      'Reassess and step up to the moderate pathway if pain persists or worsens.'
  },

  /* 4 */
  {
    heading: 'Moderate pain (4/10) — step up if required',
    lines: [
      'Paracetamol <span class="dose">500 mg–1 g PO</span> remains a base analgesic.',
      'Co-codamol (500 mg paracetamol + 8–30 mg codeine) <span class="dose">1–2 tablets, up to 4×/day</span>, 4–6 hours apart (max 8 tablets/day).'
    ],
    caution:
      'Count the paracetamol in co-codamol toward the daily paracetamol maximum.'
  },

  /* 5 */
  {
    heading: 'Moderate pain (5/10) — step up if required',
    lines: [
      'Paracetamol <span class="dose">500 mg–1 g PO</span> remains a base analgesic.',
      'Co-codamol (500 mg paracetamol + 8–30 mg codeine) <span class="dose">1–2 tablets, up to 4×/day</span>, 4–6 hours apart (max 8 tablets/day).'
    ],
    caution:
      'Count the paracetamol in co-codamol toward the daily paracetamol maximum.'
  },

  /* 6 */
  {
    heading: 'Moderate pain (6/10) — step up if required',
    lines: [
      'Paracetamol <span class="dose">500 mg–1 g PO</span> remains a base analgesic.',
      'Co-codamol (500 mg paracetamol + 8–30 mg codeine) <span class="dose">1–2 tablets, up to 4×/day</span>, 4–6 hours apart (max 8 tablets/day).'
    ],
    caution:
      'Count the paracetamol in co-codamol toward the daily paracetamol maximum. Escalate to the severe-pain pathway if pain remains uncontrolled.'
  },

  /* 7 */
  {
    heading: 'Severe pain (7/10) — stronger analgesia / escalation',
    lines: [
      'IV paracetamol supplemented with titrated IV morphine: an initial dose of <span class="dose">up to 5 mg IV</span>, then <span class="dose">1–5 mg IV increments</span> at 5-minute intervals, titrated to effect by an appropriately trained clinician.'
    ],
    caution:
      'Monitor respiratory rate, SpO₂, blood pressure and consciousness throughout.'
  },

  /* 8 */
  {
    heading: 'Severe pain (8/10) — stronger analgesia / escalation',
    lines: [
      'IV paracetamol supplemented with titrated IV morphine: an initial dose of <span class="dose">up to 5 mg IV</span>, then <span class="dose">1–5 mg IV increments</span> at 5-minute intervals, titrated to effect by an appropriately trained clinician.'
    ],
    caution:
      'Monitor respiratory rate, SpO₂, blood pressure and consciousness throughout. Escalate for senior/anaesthetic input if pain is not settling.'
  },

  /* 9 */
  {
    heading: 'Severe pain (9/10) — stronger analgesia / escalation',
    lines: [
      'IV paracetamol supplemented with titrated IV morphine: an initial dose of <span class="dose">up to 5 mg IV</span>, then <span class="dose">1–5 mg IV increments</span> at 5-minute intervals, titrated to effect by an appropriately trained clinician.'
    ],
    caution:
      'Monitor respiratory rate, SpO₂, blood pressure and consciousness throughout. Escalate for senior/anaesthetic input if pain is not settling.'
  },

  /* 10 */
  {
    heading: 'Extreme / uncontrolled pain (10/10) — emergency assessment',
    lines: [
      'Use the severe-pain pathway with appropriately titrated IV opioid analgesia (as above).'
    ],
    caution:
      'Do not simply keep giving more tablets. Find and treat the underlying cause, repeat a full ABCDE/observation set, and escalate for senior/anaesthetic support. Reassess pain, RR, SpO₂, consciousness and BP after treatment.'
  }
];

function updatePain() {
  const value =
    Number(
      document.getElementById(
        'painRange'
      )?.value || 0
    );

  const valueEl =
    document.getElementById(
      'painValue'
    );

  const meaning =
    document.getElementById(
      'painMeaning'
    );

  const medication =
    document.getElementById(
      'painMedication'
    );

  if (valueEl) {
    valueEl.textContent =
      `${value}/10`;
  }

  let label =
    'No pain';

  if (
    value >= 1 &&
    value <= 3
  ) {
    label =
      'Mild pain';

  } else if (
    value >= 4 &&
    value <= 6
  ) {
    label =
      'Moderate pain';

  } else if (
    value >= 7 &&
    value <= 9
  ) {
    label =
      'Severe pain';

  } else if (
    value === 10
  ) {
    label =
      'Extreme / uncontrolled pain';
  }

  if (meaning) {
    meaning.textContent = label;
  }

  if (medication) {
    const entry =
      painReliefByScore[value] ||
      painReliefByScore[0];

    medication.innerHTML = `
      <h4>${entry.heading}</h4>
      ${
        entry.lines
          .map(line => `<p>${line}</p>`)
          .join('')
      }
      <p class="caution">${entry.caution}</p>
    `;
  }
}

/* =========================================================
   INCIDENT SCENE DATA
========================================================= */

/* =========================================================
   BED/FLOOR CONTEXT SYSTEM & FIVEM EMOTES

   Declared here, before sceneData/proceduresData/docsData
   below, since several of those data objects call
   formatRpWithEmote() while building their rp_bed/rp_floor
   arrays — that only works if FIVEM_EMOTES already exists
   by the time this file reaches that point.
========================================================= */

/* Shared context state */
let currentContext = 'bed'; /* default to bed */

/* FiveM medical roleplay emotes mapped by keyword */
const FIVEM_EMOTES = {
  examine: '/e examine',
  check: '/e check',
  mechanic: '/e mechanic',
  bandage: '/e bandage',
  nurse: '/e nurse',
  doctor: '/e doctor',
  inject: '/e inject',
  cpr: '/e cpr',
  stitch: '/e stitch',
  treat: '/e treat',
  pickup: '/e pickup',
  carry: '/e carry',
  hold: '/e hold',
  press: '/e press',
  talk: '/e talk',
  notepad: '/e notepad',
  clean: '/e clean',
  type: '/e type',
  point: '/e point',
  radio: '/e radio',
  lean: '/e lean'
};

/* Helper: format an RP action with emote */
function formatRpWithEmote(action, emote) {
  const e = FIVEM_EMOTES[emote] || '';
  if (e) {
    return `${action} ${e}`;
  }
  return action;
}

const sceneData = {

  rtc: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe before approaching — check for traffic, fuel leaks, fire, airbag deployment and electrical hazards.',
      'Assess the mechanism of injury and vehicle damage — estimate speed, direction of impact, rollover/ejection and occupant position.',
      'Check for catastrophic external bleeding and apply direct pressure, haemostatic gauze or tourniquet as appropriate.',
      'Begin a structured <C>ABCDE assessment and reassess after every intervention.',
      'Assess airway and consider cervical-spine risk — manually stabilise the head if spinal injury is suspected.',
      'Assess breathing, chest movement, respiratory effort and signs of tension/pneumothorax or flail segment.',
      'Check pulse, blood pressure, skin colour, temperature, capillary refill and signs of shock — do not rely on a single BP reading.',
      'Assess disability: GCS/AVPU, pupil size and reaction, limb movement, glucose level.',
      'Expose only as required to identify injuries while maintaining dignity and preventing hypothermia.',
      'Systematically assess head, neck, chest, abdomen, pelvis and all four limbs — logroll if spinal precautions allow.',
      'Apply splints to suspected fractures and recheck distal neurovascular status after splinting.',
      'Record a full set of observations (HR, BP, RR, SpO2, GCS, temperature, pain score) and repeat after every intervention.',
      'Reassess observations and clinical status after treatment — watch for deterioration trends.',
      'Prepare a structured trauma handover including mechanism, injuries, observations, treatment given and response.'
    ],

    questions: [
      'Can you tell me your name and what happened today?',
      'Were you the driver or a passenger in the vehicle?',
      'Were you wearing a seatbelt at the time of the crash?',
      'Approximately how fast was the vehicle travelling when the crash happened?',
      'Did the vehicle roll over or were you ejected from it?',
      'Did you hit your head inside the vehicle?',
      'Did you lose consciousness at any point, even briefly?',
      'Do you have any neck or back pain, numbness or tingling?',
      'Where exactly is your pain — point to every place that hurts?',
      'Do you feel short of breath or is it painful to breathe deeply?',
      'Do you feel dizzy, faint or sick to your stomach?',
      'Do you have any pain or discomfort in your tummy or pelvis?',
      'Are you taking any regular medication — especially blood thinners like warfarin, apixaban or clopidogrel?',
      'Do you have any allergies to medications or anything else?',
      'Do you have any medical conditions like diabetes, epilepsy or heart problems?',
      'What is your pain level on a scale of 0 to 10 right now?'
    ],

    rp: [
      'approaches the RTC scene after confirming it is safe to enter and begins assessing the mechanism of injury and vehicle damage.',
      'checks the patient for catastrophic external bleeding before beginning a structured ABCDE assessment with spinal precautions.',
      'manually stabilises the patient\'s head and neck while assessing their airway and considering possible cervical-spine injury.',
      'observes the patient\'s chest movement, respiratory effort and breathing pattern — notes equal rise and absence of obvious chest trauma.',
      'checks the patient\'s radial pulse, skin colour, temperature and capillary refill time, then applies the BP cuff and obtains a reading.',
      'applies the blood pressure cuff and obtains a reading of 118/76 while continuing to monitor the patient\'s perfusion status.',
      'assesses the patient\'s level of consciousness using AVPU and checks their pupils for size, equality and reaction to light.',
      'systematically assesses the patient for head, chest, abdominal, pelvic and limb injuries, palpating each region in turn.',
      'suspected right femoral shaft fracture — applies a traction splint and rechecks distal pulse, sensation and movement.',
      'repeats a full set of observations — HR 92, BP 118/76, RR 20, SpO2 97%, GCS 15, pain 6/10 — and documents the trends.',
      'administrates oral paracetamol 1g for pain management and reassesses the pain score after 15 minutes.',
      'calls ahead to the receiving trauma unit with an SBAR handover including mechanism, injuries, vital signs and treatment given.',
      'prepares a structured handover for the emergency department — driver in a 40 mph frontal collision, seatbelt worn, no LOC, right femur fracture, observations stable, analgesia given.'
    ],

    rp_floor: [
      formatRpWithEmote('kneels down beside the patient on the road surface after confirming the scene is safe, and begins assessing the mechanism of injury and vehicle damage.', 'mechanic'),
      formatRpWithEmote('checks the patient for catastrophic external bleeding while kneeling on the ground beside them, before beginning a structured ABCDE assessment with spinal precautions.', 'check'),
      formatRpWithEmote('kneels at the patient\'s head on the road, manually stabilising their head and neck while assessing airway and considering cervical-spine injury.', 'hold'),
      formatRpWithEmote('leans over the patient on the ground, observing chest movement, respiratory effort and breathing pattern — notes equal rise and absence of obvious chest trauma.', 'lean'),
      formatRpWithEmote('kneels beside the patient and checks their radial pulse, skin colour, temperature and capillary refill time on the road surface.', 'check'),
      formatRpWithEmote('applies the blood pressure cuff while kneeling beside the patient on the ground and obtains a reading of 118/76.', 'treat'),
      formatRpWithEmote('kneels at eye level with the patient on the ground, assessing their level of consciousness using AVPU and checking pupil reaction.', 'examine'),
      formatRpWithEmote('systematically palpates the patient for head, chest, abdominal, pelvic and limb injuries while kneeling on the road surface beside them.', 'check'),
      formatRpWithEmote('kneels beside the patient\'s leg on the ground — suspected right femoral shaft fracture — applies a traction splint and rechecks distal pulse.', 'treat'),
      formatRpWithEmote('crouches beside the patient on the ground to repeat a full set of observations — HR 92, BP 118/76, RR 20, SpO2 97%, GCS 15, pain 6/10.', 'notepad'),
      formatRpWithEmote('kneels beside the patient on the road and administers oral paracetamol 1g for pain management.', 'inject'),
      formatRpWithEmote('steps back from the patient on the ground to radio ahead to the receiving trauma unit with an SBAR handover.', 'radio'),
      formatRpWithEmote('kneels back down beside the patient to prepare a structured handover for the crew taking over on scene.', 'notepad')
    ],

    rp_bed: [
      formatRpWithEmote('stands beside the stretcher, reviewing the mechanism of injury and vehicle damage now the patient has been extracted and moved to the ambulance.', 'doctor'),
      formatRpWithEmote('stands at the side of the stretcher and rechecks for catastrophic external bleeding before continuing the ABCDE assessment.', 'check'),
      formatRpWithEmote('stands at the head of the stretcher, maintaining manual in-line stabilisation while reassessing the patient\'s airway.', 'hold'),
      formatRpWithEmote('stands over the stretcher, observing the patient\'s chest movement and respiratory effort under the ambulance lighting.', 'examine'),
      formatRpWithEmote('stands beside the stretcher and rechecks the patient\'s radial pulse, skin colour and capillary refill time.', 'check'),
      formatRpWithEmote('reapplies the blood pressure cuff at the patient\'s arm on the stretcher and obtains an updated reading.', 'treat'),
      formatRpWithEmote('stands beside the stretcher, reassessing the patient\'s level of consciousness and pupil response under better lighting.', 'examine'),
      formatRpWithEmote('stands over the stretcher, re-palpating the patient\'s chest, abdomen, pelvis and limbs now they are secured.', 'check'),
      formatRpWithEmote('stands at the foot of the stretcher, rechecking the traction splint and confirming distal pulse, sensation and movement are intact.', 'treat'),
      formatRpWithEmote('stands beside the stretcher to repeat a full set of observations before departing for the trauma unit.', 'notepad'),
      formatRpWithEmote('stands beside the stretcher and administers oral paracetamol 1g, securing the patient for transport.', 'inject'),
      formatRpWithEmote('stands beside the stretcher and radios ahead to the receiving trauma unit with a full SBAR handover.', 'radio'),
      formatRpWithEmote('stands beside the stretcher, preparing a structured handover ready for the trauma team on arrival.', 'notepad')
  ]
  },

  explosion: {
    slideUrl: '',

    checklist: [
      'Confirm fire, fuel and explosion hazards are controlled — do not enter an unstable scene.',
      'Consider additional explosions, secondary devices and structural collapse risk.',
      'Check for catastrophic bleeding and apply direct pressure, haemostatic gauze or tourniquet as appropriate.',
      'Begin a structured <C>ABCDE assessment immediately and reassess after every intervention.',
      'Assess airway for facial burns, soot, carbonaceous sputum, stridor, hoarseness or supraglottic swelling suggesting inhalation injury.',
      'Assess breathing — respiratory rate, chest movement, oxygen saturation and signs of blast lung (hypoxia, cough, haemoptysis).',
      'Check for blast-related chest injury — pneumothorax, haemothorax, pulmonary contusion or rib fractures.',
      'Assess circulation and signs of shock — check pulse, BP, capillary refill, skin colour and temperature.',
      'Assess burns — estimate percentage using the rule of nines, assess depth and cover with appropriate dressings.',
      'Assess for other traumatic injuries — blunt force from blast wave, penetrating injury from debris, fractures.',
      'Consider hearing injury — ringing in ears, reduced hearing, tinnitus from blast overpressure.',
      'Consider eye injury — foreign bodies, burns, blast effect on the globe.',
      'Prevent heat loss — cover burns, use blankets, warm fluids if available, and limit exposure.',
      'Reassess observations and clinical status frequently — blast lung and inhalation injury can deteriorate rapidly.',
      'Escalate significant burns (>10% TBSA), airway compromise, blast lung or major trauma urgently.'
    ],

    questions: [
      'Were you inside or outside the vehicle when it exploded?',
      'How close were you to the explosion when it happened?',
      'Were you thrown by the blast wave or struck by any debris?',
      'Did you lose consciousness at any point, even briefly?',
      'Are you having any difficulty breathing or is your chest painful?',
      'Do you have ringing in your ears or reduced hearing since the explosion?',
      'Where have you been burned — show me every affected area?',
      'Did you inhale smoke or fumes before, during or after the explosion?',
      'Do you have any pain or discomfort anywhere else?',
      'Do you have any medical conditions or take any regular medication?',
      'Do you have any allergies to medications or anything else?',
      'On a scale of 0 to 10, how would you rate your pain right now?'
    ],

    rp: [
      'confirms the explosion scene is safe before approaching and checks for ongoing fire, fuel and secondary hazards.',
      'checks the patient for catastrophic bleeding and begins a rapid ABCDE assessment while noting blast proximity.',
      'examines the patient\'s mouth and airway for soot, carbonaceous sputum, burns, swelling and signs of inhalation injury.',
      'assesses respiratory effort, chest movement and oxygen saturation — notes any hypoxia, cough or haemoptysis suggesting blast lung.',
      'checks the patient for chest trauma, burns, penetrating injuries and other blast-related injuries.',
      'assesses circulation by palpating radial pulse, checking capillary refill, skin colour and applying the BP cuff.',
      'obtains a BP of 124/78, HR 96, RR 22, SpO2 94% — notes the hypoxia and applies oxygen via non-rebreather mask at 15 L/min.',
      'estimates the affected burn areas using the rule of nines — approximately 12% TBSA to the arms and face.',
      'cools the thermal burns with cool running water for 20 minutes and protects the patient from further heat loss.',
      'covers the burns with cling film or appropriate burn dressings and monitors for hypothermia.',
      'reassesses respiratory status — SpO2 improving to 98% on oxygen, chest clear to auscultation bilaterally.',
      'prepares an urgent trauma handover including blast mechanism, burn percentage, respiratory status and vital signs.'
  ]
  },


  gunshot: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe and any weapon threat is controlled before approaching — use appropriate PPE.',
      'Identify catastrophic haemorrhage immediately — check for arterial bleeding, massive haemorrhage from the wound site.',
      'Control severe external bleeding with direct pressure, haemostatic gauze, wound packing or tourniquet for limb injuries.',
      'Begin a structured <C>ABCDE assessment and identify the wound location without unnecessarily disturbing the wound.',
      'Check for entry and exit wounds — mark the locations and do not probe the wound tract.',
      'Assess airway and breathing, especially if the torso, neck or head is involved — high-flow oxygen if available.',
      'Assess circulation and signs of shock — check pulse, BP, capillary refill, skin colour — do not assume normal BP rules out haemorrhage.',
      'Record a full set of observations and reassess frequently — HR, BP, RR, SpO2, GCS, pain score, temperature.',
      'Immobilise fractures if present and recheck distal neurovascular status after any splinting.',
      'Prepare urgent trauma escalation and handover — include wound location(s), estimated blood loss, vital signs and treatment given.',
      'Document the number of wounds, entry/exit locations, estimated time of injury and all interventions.'
    ],

    questions: [
      'Where were you shot — point to every wound location you know of?',
      'How many shots did you hear and do you know how many times you were hit?',
      'Do you know how long ago this happened?',
      'Are you having any difficulty breathing?',
      'Do you have any chest or abdominal pain?',
      'Do you feel dizzy, lightheaded or faint?',
      'Can you move and feel your arms and legs normally?',
      'Are you taking any blood-thinning medication like warfarin, apixaban or clopidogrel?',
      'Do you have any allergies to any medications?',
      'Do you have any medical conditions like diabetes, heart problems or epilepsy?',
      'On a scale of 0 to 10, how bad is your pain right now?',
      'Do you feel like you\'re losing consciousness or are you struggling to stay awake?'
    ],

    rp: [
      'confirms the scene is safe before approaching the patient and applies appropriate PPE including gloves and eye protection.',
      'performs a rapid check for catastrophic haemorrhage and immediately addresses significant external bleeding with direct pressure and haemostatic gauze.',
      'applies a tourniquet to the actively bleeding limb wound and notes the time of application clearly.',
      'begins a structured ABCDE assessment while identifying the location of the entry and any exit wounds.',
      'marks the entry and exit wound locations on the dressings and avoids probing the wound tract.',
      'assesses chest movement and respiratory effort — applies an occlusive dressing to any penetrating chest wound with a three-way taped edge.',
      'checks the patient\'s pulse — finds a rapid, thready radial pulse at 112/min and BP of 104/68 suggesting hypovolaemia.',
      'cannulates an antecubital vein with a grey (14G) or green (18G) cannula and begins fluid resuscitation per local protocols.',
      'administers IV morphine 5mg for severe pain — checks pulse, respiration and sedation level before and after administration.',
      'repeats observations — HR 104, BP 108/70, RR 22, SpO2 97%, GCS 15, pain 4/10 — and documents downward trends in pulse.',
      'splints the associated femoral fracture with a traction splint and rechecks distal pulse, sensation and movement.',
      'prepares an urgent trauma team handover — gunshot wound to the right thigh with exit wound, estimated 500ml blood loss, two large-bore IVs, tourniquet applied at 14:32, last observations HR 104 / BP 108/70.'
  ]
  },


  stab: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe and any weapon threat is controlled before approaching — use appropriate PPE.',
      'Identify catastrophic haemorrhage immediately — check for arterial bleeding, massive haemorrhage from the wound site.',
      'Control severe external bleeding with direct pressure — do not remove any embedded object, stabilise it in place.',
      'Begin a structured <C>ABCDE assessment and identify the wound location without unnecessarily disturbing the wound.',
      'Assess for entry and exit wounds — mark the location(s) and do not probe the wound tract.',
      'Assess airway and breathing, especially if the neck or chest is involved — consider occlusive dressing for chest wounds.',
      'Assess circulation and signs of shock — check pulse, BP, capillary refill, skin colour and temperature.',
      'Record a full set of observations and reassess frequently — HR, BP, RR, SpO2, GCS, pain score.',
      'Prepare urgent trauma escalation — stab wounds to the neck, chest, abdomen or groin are high-risk.',
      'Document the mechanism, wound locations, estimated time of injury, treatment given and all observations.'
    ],

    questions: [
      'Where were you stabbed — point to every wound you know of?',
      'What type of weapon was used, and how long ago did this happen?',
      'Do you know if the weapon is still in place or was it removed?',
      'Are you having any difficulty breathing or any chest pain?',
      'Do you have any abdominal pain, tenderness or feeling of fullness?',
      'Do you feel dizzy, lightheaded or faint?',
      'Can you move and feel your arms and legs normally?',
      'Are you taking any blood-thinning medication like warfarin, apixaban or clopidogrel?',
      'Do you have any allergies to any medications?',
      'Do you have any medical conditions like diabetes or heart problems?',
      'On a scale of 0 to 10, how bad is your pain right now?',
      'Do you feel like you\'re losing consciousness or struggling to stay awake?'
    ],

    rp: [
      'confirms the scene is safe before approaching the patient and applies appropriate PPE including gloves.',
      'identifies a stab wound to the left anterior chest and notes there is no embedded object, but there is active bleeding.',
      'applies direct pressure with haemostatic gauze to the bleeding wound and monitors for ongoing haemorrhage.',
      'applies an occlusive dressing with a three-way taped edge to the penetrating chest wound to prevent tension pneumothorax.',
      'begins a structured ABCDE assessment — airway clear, breathing laboured with reduced air entry on the left side.',
      'checks the patient\'s pulse — radial pulse present but rapid at 106/min, BP 110/72, skin pale and cool.',
      'cannulates an antecubital vein with a green (18G) cannula for IV access.',
      'administers oxygen via non-rebreather at 15 L/min and administers IV morphine 5mg for severe pain.',
      'repeats observations — HR 102, BP 112/74, RR 24, SpO2 96% on oxygen, pain 5/10 — and documents trends.',
      'reassesses chest — air entry improving on the left after the occlusive dressing, SpO2 stable at 96%.',
      'prepares an urgent trauma handover — single stab wound to the left anterior chest, occlusive dressing applied, IV access established.'
  ]
  },


  burns: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe — check for ongoing fire, electrical, chemical or structural hazards before approaching.',
      'Stop the burning process — remove the patient from the source and extinguish any flames by stop, drop and roll or use of a fire blanket.',
      'Perform a primary survey using <C>ABCDE — burns are not the first priority if there is catastrophic haemorrhage or airway compromise.',
      'Assess airway for facial burns, soot, stridor, hoarseness or carbonaceous sputum suggesting inhalation injury — this can deteriorate rapidly.',
      'Assess breathing — respiratory rate, chest movement, oxygen saturation and signs of respiratory distress.',
      'Assess circulation and signs of shock — check pulse, BP, capillary refill, skin colour — burns can cause hypovolaemic shock.',
      'Estimate the total body surface area burned using the rule of nines or Lund and Browder chart for children.',
      'Assess burn depth — superficial (epidermal), partial thickness (blistering, painful) or full thickness (waxy, painless).',
      'Cool thermal burns with cool running water for 20 minutes within 3 hours of injury — take care to avoid hypothermia.',
      'Cover burns with cling film or sterile non-adherent dressings — do not apply creams, lotions or ice.',
      'Provide analgesia — paracetamol/ibuprofen for mild pain; IV morphine or Entonox for severe burn pain.',
      'Monitor for hypothermia and maintain body temperature with blankets and warm fluids.',
      'Reassess frequently — burns and inhalation injury can evolve over time.',
      'Escalate serious burns (>10% TBSA in adults), facial/airway burns, circumferential burns or burns in children.'
    ],

    questions: [
      'How did you get burned — was it fire, hot liquid, electricity or chemicals?',
      'How long ago did the burn happen and how long were you exposed?',
      'Were you in an enclosed space with smoke or flames — did you breathe in smoke or fumes?',
      'Do you have any difficulty breathing, coughing or a hoarse voice?',
      'Where exactly are your burns — show me everywhere you were burned?',
      'Do you have any other injuries besides the burns?',
      'Have you passed out or felt dizzy at any point?',
      'Are you taking any regular medication or do you have any medical conditions?',
      'Do you have any allergies?',
      'On a scale of 0 to 10, how bad is your pain right now?'
    ],

    rp: [
      'confirms the scene is safe before approaching and checks for ongoing fire, chemical or electrical hazards.',
      'stops the burning process by removing the patient from the source and extinguishing any remaining flames.',
      'performs a primary survey using <C>ABCDE and begins a systematic assessment of the patient.',
      'examines the patient\'s face and airway for signs of facial burns, singed nasal hair, soot in the mouth or hoarseness.',
      'listens for stridor or respiratory distress — high suspicion of inhalation injury given the enclosed space.',
      'assesses respiratory rate, chest movement and applies pulse oximetry — SpO2 95% on room air.',
      'checks circulation — radial pulse 104/min, BP 118/76, skin warm and pink, capillary refill <2 seconds.',
      'estimates the burn area using the rule of nines — approximately 15% TBSA to the anterior chest and left arm.',
      'assesses burn depth — partial thickness burns to the chest with blistering and intact capillary refill; full thickness to the left forearm.',
      'cools the thermal burns under cool running water for 20 minutes and monitors for hypothermia during cooling.',
      'covers the burns with cling film and administers IV morphine 5mg for severe burn pain — checks respiration and sedation level.',
      'repeats observations — HR 100, BP 120/78, RR 20, SpO2 97%, pain 4/10 after analgesia — and documents improvement.',
      'prepares an urgent transfer to the burns unit with full details of the mechanism, TBSA, depth, treatment and vital signs.'
  ]
  },


  smoke: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe — check for ongoing fire, smoke, structural collapse or toxic gas hazards.',
      'Remove the patient from the smoke-filled environment to fresh air as soon as it is safe to do so.',
      'Perform a primary survey using <C>ABCDE with a high index of suspicion for inhalation injury.',
      'Assess airway — look for facial burns, singed nasal hairs, carbonaceous sputum, stridor, hoarseness or altered voice.',
      'Assess breathing — respiratory rate, chest movement, accessory muscle use, wheeze, cough, oxygen saturation.',
      'Administer high-flow oxygen via non-rebreather mask at 15 L/min — monitor SpO2 response carefully.',
      'Assess circulation — pulse, BP, capillary refill — smoke inhalation rarely causes shock alone but check for associated burns or trauma.',
      'Assess disability — headache, confusion, drowsiness or reduced consciousness may suggest carbon monoxide poisoning or hypoxia.',
      'Expose and examine for associated burns or other injuries from the fire or evacuation.',
      'Monitor for deterioration — airway swelling and pulmonary oedema can evolve over hours, even with initially normal observations.',
      'Arrange appropriate specialist assessment — inhalation injury requires specialist respiratory assessment even if the patient looks well.'
    ],

    questions: [
      'Were you in an enclosed space with smoke or flames — how long were you exposed?',
      'Are you having any difficulty breathing or is your throat feeling tight?',
      'Do you have a cough, hoarse voice or any burning sensation in your throat?',
      'Do you have a headache, feel dizzy or confused?',
      'Did you lose consciousness at any point?',
      'Do you have any burns or other injuries?',
      'Do you have any known heart or lung conditions like asthma or COPD?',
      'Are you taking any regular medication?',
      'Do you have any allergies?'
    ],

    rp: [
      'confirms the scene is safe before approaching and checks for ongoing fire, smoke and structural hazards.',
      'removes the patient from the smoke-filled environment to fresh air with the help of the fire service.',
      'begins a primary survey using <C>ABCDE with a high index of suspicion for inhalation injury.',
      'examines the patient\'s face and airway — finds singed nasal hairs, soot around the nose and mouth, and a hoarse voice.',
      'listens to the chest — auscultates wheeze and reduced air entry bilaterally with a frequent cough.',
      'applies pulse oximetry — SpO2 91% on room air — and administers high-flow oxygen via non-rebreather mask at 15 L/min.',
      'monitors the patient\'s response — SpO2 rises to 97% with supplemental oxygen, respiratory rate 24.',
      'checks circulation — HR 104, BP 126/78, capillary refill <3 seconds, skin warm and pink.',
      'assesses the patient for any associated burns or other traumatic injuries from the fire.',
      'reassesses respiratory status every 5 minutes — monitors for stridor, increasing distress or declining SpO2.',
      'calls ahead to the receiving emergency department with a pre-alert for potential inhalation injury.',
      'continues to monitor the patient closely and prepares a handover detailing smoke exposure time, symptoms, observations and oxygen requirement.'
  ]
  },


  allergy: {
    slideUrl: '',

    checklist: [
      'Assess the patient immediately using ABCDE — identify any airway, breathing or circulation compromise.',
      'Ask about known allergies, the suspected trigger, onset time and previous reactions — distinguish mild allergy from anaphylaxis.',
      'Check airway — look for lip/tongue/throat swelling, stridor, hoarseness, difficulty swallowing or a sensation of throat tightness.',
      'Assess breathing — respiratory rate, wheeze, accessory muscle use, oxygen saturation — anaphylaxis often presents with respiratory distress.',
      'Assess circulation — check pulse, BP, capillary refill, skin colour and temperature — look for signs of distributive shock.',
      'Assess skin — look for urticaria (hives), erythema, angioedema (swelling of lips, eyelids, face) and pruritus.',
      'Assess disability — confusion, anxiety, sense of impending doom or reduced consciousness can accompany anaphylaxis.',
      'If airway, breathing or circulation are compromised, administer IM adrenaline (1:1000, 0.5mg) into the anterolateral thigh immediately.',
      'Position the patient appropriately — lying flat with legs raised if circulatory compromise, sitting up if respiratory distress.',
      'Administer high-flow oxygen via non-rebreather mask and monitor SpO2, pulse and BP continuously.',
      'Repeat observations and reassess frequently — anaphylaxis can improve then deteriorate again (biphasic reaction).',
      'Arrange urgent transfer to hospital — all patients with anaphylaxis should be observed in an emergency department.',
      'Document the suspected trigger, time of onset, all treatment given and the patient\'s response to each intervention.'
    ],

    questions: [
      'Do you know what caused this reaction — what did you eat, take or come into contact with?',
      'How long ago did the reaction start and how quickly did it come on?',
      'Have you had an allergic reaction like this before?',
      'Do you have any difficulty breathing, throat tightness or a feeling that your throat is closing?',
      'Do you feel dizzy, lightheaded or faint?',
      'Do you have an adrenaline auto-injector (EpiPen) with you and have you used it?',
      'Have you taken any medication for this reaction such as antihistamines?',
      'Do you have any other medical conditions like asthma or heart problems?',
      'Are you taking any regular medication?'
    ],

    rp: [
      'begins assessing the patient using ABCDE and identifies immediate airway, breathing and circulation compromise.',
      'notes widespread urticaria, facial angioedema, audible wheeze and the patient reporting throat tightness.',
      'identifies stridor and respiratory distress with SpO2 92% — calls for urgent help and prepares IM adrenaline.',
      'administers IM adrenaline 1:1000 (0.5mg) into the patient\'s right anterolateral thigh and notes the time of administration.',
      'positions the patient sitting upright to optimise breathing and administers oxygen via non-rebreather mask at 15 L/min.',
      'assesses the patient\'s response — stridor improving, SpO2 rising to 96%, wheeze less prominent after adrenaline.',
      'checks the patient\'s pulse — HR 112, BP 100/64 — and monitors for signs of improving perfusion.',
      'records a full set of observations — HR 108, BP 106/68, RR 24, SpO2 96%, GCS 15 — and repeats every 5 minutes.',
      'continues to monitor the patient closely for signs of biphasic reaction or deterioration after initial improvement.',
      'prepares a structured handover — suspected peanut anaphylaxis, IM adrenaline given at 15:22 with good initial response, observations improving.'
  ]
  },


  waterrescue: {
    slideUrl: '',

    checklist: [
      'Confirm your own safety first — do not enter the water unless trained and equipped; use reach, throw, row or wade techniques.',
      'Remove the patient from the water as safely and quickly as possible while maintaining spinal precautions if a diving or impact mechanism is suspected.',
      'Check responsiveness and breathing for no more than 10 seconds once out of the water.',
      'If not breathing normally, give 5 initial rescue breaths before starting chest compressions, given the likely hypoxic cause of arrest.',
      'Begin CPR if there are no signs of life, following standard compression ratios (30:2).',
      'Remove wet clothing and begin gentle rewarming — avoid rapid rewarming or rough handling which can cause cardiac arrhythmias.',
      'Protect the airway and monitor for vomiting — the patient may regurgitate water or stomach contents.',
      'Give high-flow oxygen if available and continuously monitor SpO2, pulse, BP and temperature.',
      'Treat any associated injuries — from diving, rocks, entrapment or rescue process — alongside the main assessment.',
      'Monitor for delayed deterioration — aspiration pneumonitis or pulmonary oedema can develop hours after an apparently good recovery.',
      'Reassess regularly and prepare a structured handover including submersion time, water type (fresh/salt/cold), treatment given and response.'
    ],

    questions: [
      'How long were you in the water or submerged, if you know?',
      'Was the water cold, and roughly what temperature would you say it was?',
      'Did you hit anything or injure yourself before or during going into the water?',
      'Have you vomited or coughed up any water since being rescued?',
      'Do you know if you can swim, or was this an accidental submersion?',
      'Do you have any medical conditions such as epilepsy, a heart condition or diabetes?',
      'Are you on any medications?',
      'Do you have any difficulty breathing or chest discomfort now?'
    ],

    rp: [
      'confirms their own safety and uses a reach or throw technique rather than entering the water themselves.',
      'with the help of bystanders, carefully removes the patient from the water.',
      'checks the patient\'s responsiveness and breathing for no more than 10 seconds — the patient is unconscious and not breathing normally.',
      'gives 5 initial rescue breaths before starting chest compressions, given the likely hypoxic cause.',
      'begins CPR at a ratio of 30 compressions to 2 breaths and continues with minimal interruptions.',
      'after the return of spontaneous circulation, carefully removes the patient\'s wet clothing.',
      'begins gentle rewarming using blankets and warm air, avoiding rapid rewarming techniques.',
      'monitors for vomiting and positions the patient in the recovery position to protect their airway.',
      'administers high-flow oxygen via non-rebreather mask and continuously monitors SpO2, pulse and BP.',
      'assesses for any associated injuries from the incident and the rescue process.',
      'repeats observations — HR 88, BP 124/76, RR 18, SpO2 98%, GCS 14, temperature 35.2C — and documents trends.',
      'continues to monitor the patient closely for any delayed deterioration from aspiration.',
      'prepares a structured handover — approximately 5 minutes submersion in cold freshwater, brief resuscitation, now self-ventilating on oxygen.'
  ]
  },



  mountainlion: {
    slideUrl: '',

    checklist: [
      'Confirm the animal threat has been neutralised or is no longer present before approaching the patient.',
      'Perform a primary survey and control any catastrophic bleeding first — direct pressure, haemostatic gauze or tourniquet if appropriate for a limb.',
      'Expose and examine all bite and claw wounds systematically, including less obvious areas like the scalp, armpits and behind the knees.',
      'Assess the depth of puncture wounds carefully — they can hide deeper tissue, tendon or vessel damage despite a small external entry.',
      'Check distal circulation, sensation and movement for any limb wounds, and reassess after any intervention.',
      'Irrigate and clean wounds thoroughly once bleeding is controlled — use warmed saline or clean water where available.',
      'Cover wounds with an appropriate clean dressing or sterile non-adherent pad; do not close puncture wounds in the field.',
      'Prioritise urgent assessment for any facial, scalp or neck wounds — these bleed heavily and may need rapid haemorrhage control.',
      'Assess for signs of infection — warmth, erythema, swelling or discharge around older wounds.',
      'Offer appropriate analgesia — paracetamol or ibuprofen for mild pain; consider oral morphine or IV opioids for significant pain.',
      'Monitor for signs of shock — tachycardia, hypotension, pale/clammy skin, delayed capillary refill, especially with significant bleeding.',
      'Reassess observations (HR, BP, RR, SpO2, GCS) after every intervention and document trends.',
      'Escalate for wound exploration, possible surgical closure and infection-risk management — document the animal species if known (dog, cat, wild animal).',
      'Document the mechanism, wound locations, treatment given, and whether the animal was domestic or wild — rabies risk may need public health notification.'
    ],

    questions: [
      'Can you tell me exactly how the attack happened — what animal was it?',
      'Where are all the places you were bitten or scratched? Please show me every spot.',
      'Do you feel any numbness, weakness or reduced movement anywhere?',
      'Are you up to date with tetanus vaccination, if you know?',
      'Do you have any allergies, particularly to antibiotics or pain relief?',
      'Do you have any medical conditions that affect your immune system, like diabetes or medications?',
      'Are you taking any blood-thinning medication like warfarin, apixaban or clopidogrel?',
      'Have you passed out or felt dizzy at any point since the attack?',
      'Do you feel short of breath or lightheaded?',
      'On a scale of 0 to 10, how bad is your pain right now?',
      'Did the animal seem aggressive or sick — was it behaving unusually?',
      'Has anyone else been attacked or is anyone else injured?'
    ],

    rp: [
      'confirms the animal threat has been neutralised before approaching the patient and ensuring scene safety.',
      'performs a primary survey using <C>ABCDE and controls any catastrophic bleeding with direct pressure.',
      'applies a tourniquet to the bleeding limb wound and notes the time of application.',
      'exposes and systematically examines all bite and claw wounds, including less obvious areas like the scalp and armpits.',
      'carefully assesses the depth of puncture wounds, noting that small external wounds can hide significant deeper damage.',
      'checks distal circulation, sensation and movement for each limb wound and documents the findings.',
      'prepares warmed saline and begins irrigating the wound sites to remove gross contamination.',
      'covers each wound with sterile non-adherent dressings and secures them with bandaging.',
      'assesses the facial and neck injuries for airway involvement and major vessel proximity.',
      'applies a haemostatic dressing to the heavily bleeding neck wound and maintains direct pressure.',
      'administers oral paracetamol 1g for mild pain and reassesses the pain score after 15 minutes.',
      'prepares IV morphine 5mg for significant pain — checks pulse, respiration and sedation level before and after.',
      'cannulates an antecubital vein with a green (18G) cannula for IV access in case of deterioration.',
      'repeats a full set of observations — HR 98, BP 128/74, RR 18, SpO2 98%, GCS 15, pain 5/10 — and documents trends.',
      'reassesses the wounds for any ongoing bleeding or swelling and reinforces dressings as needed.',
      'applies a cervical collar and spinal precautions due to the mechanism of the attack.',
      'calls ahead to the receiving trauma unit with a full SBAR handover including the animal species and wound locations.',
      'documents the mechanism of injury, all wound locations, treatments given, and the patient response in the PCR.',
      'prepares a structured handover for the emergency department staff — mechanism, injuries, vital signs, treatment and analgesia given.',
      'notes the time of the last tetanus booster and escalates for a booster if due or unknown.'
  ]
  },

  heightfall: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe, including checking for any ongoing fall risk, unstable structures or environmental hazards.',
      'Approach with spinal precautions given the mechanism — manually stabilise the head and minimise unnecessary movement.',
      'Perform a primary survey using <C>ABCDE and control any catastrophic bleeding first.',
      'Assess for spinal tenderness, deformity, step-off or neurological symptoms — do not logroll until spinal injury is assessed.',
      'Assess the pelvis gently for instability or pain without excessive manipulation.',
      'Check for lower-limb and other fractures — assess distal circulation, sensation and movement in all four limbs.',
      'Assess for head injury — check GCS, pupil size and reaction, and monitor level of consciousness closely.',
      'Assess the chest and abdomen for signs of internal injury — pain, tenderness, bruising or distension.',
      'Splint any fractures identified and reassess neurovascular status after splinting.',
      'Record a full set of observations and repeat them regularly — HR, BP, RR, SpO2, GCS, pain score, temperature.',
      'Escalate urgently for suspected spinal, pelvic or multi-system injury.',
      'Document the estimated height, landing surface, body position on landing, mechanism and all clinical findings.'
    ],

    questions: [
      'Can you tell me what happened and how you fell?',
      'Approximately how high did you fall from?',
      'What surface did you land on and what part of your body hit first?',
      'Did you hit your head during the fall or landing?',
      'Did you lose consciousness at any point, even briefly?',
      'Do you have any neck or back pain, numbness, tingling or weakness?',
      'Can you feel and move your arms and legs?',
      'Do you have any pain in your hips, pelvis or lower back?',
      'Do you feel short of breath or have any chest or abdominal pain?',
      'Are you taking any blood-thinning medication?',
      'Do you have any medical conditions or allergies?',
      'On a scale of 0 to 10, how bad is your pain right now?'
    ],

    rp: [
      'confirms the scene is safe and approaches the patient with spinal precautions, manually stabilising the head.',
      'introduces themselves and begins a primary survey using <C>ABCDE while maintaining manual in-line stabilisation.',
      'checks for catastrophic bleeding and controls any external haemorrhage found.',
      'assesses the airway while maintaining spinal alignment — airway is patent.',
      'assesses breathing — respiratory rate 20, chest movement symmetrical, oxygen saturation 97% on room air.',
      'checks circulation — radial pulse 96/min, BP 130/84, capillary refill <2 seconds, skin warm and dry.',
      'assesses disability — GCS 15, pupils equal and reactive, patient alert and orientated.',
      'palpates the cervical and thoracic spine gently for tenderness or step-off — no midline tenderness reported.',
      'assesses the pelvis gently for pain or instability — no pelvic tenderness or crepitus detected.',
      'assesses the lower limbs — no deformity, distal pulse strong, sensation and movement intact bilaterally.',
      'applies a cervical collar and prepares for a logroll to assess the back and complete spinal assessment.',
      'repeats observations — HR 92, BP 124/78, RR 18, SpO2 98%, GCS 15, pain 4/10 — and documents the fall mechanism.',
      'prepares a structured handover — 4m fall landing on feet, no LOC, no spinal tenderness, observations stable, ongoing spinal precautions.'
  ]
  },



  melee: {
    slideUrl: '',

    checklist: [
      'Confirm the scene is safe and any assailant risk has passed before approaching the patient.',
      'Perform a primary survey using <C>ABCDE and control any catastrophic bleeding first.',
      'Assess level of consciousness and look for signs of head injury — GCS, pupils, focal neurological signs.',
      'Examine the chest for signs of blunt injury — bruising, rib tenderness, respiratory effort and oxygenation.',
      'Examine the abdomen for tenderness, guarding or distension suggesting internal organ injury.',
      'Fully expose the patient and check systematically for bruising, swelling, deformity and wounds from strikes or weapons.',
      'Assess the neck carefully for any signs of strangulation — bruising, petechiae, voice change, difficulty swallowing.',
      'Assess and splint any suspected fractures, checking distal neurovascular status before and after.',
      'Do not be falsely reassured by a lack of visible external injury — blunt trauma can hide serious internal injury.',
      'Record a full set of observations and repeat them regularly — watch for trends suggesting deterioration.',
      'Offer appropriate analgesia based on pain severity and reassess after treatment.',
      'Document the mechanism, number of blows or assailants where known, weapon type and all clinical findings.'
    ],

    questions: [
      'Can you tell me exactly what happened and how many times you were hit?',
      'Were you hit with a weapon like a bat or pipe, or with fists and feet?',
      'Did you lose consciousness at any point, even briefly?',
      'Where does it hurt the most — point to every place that hurts?',
      'Do you have any pain in your tummy, or does it hurt to breathe?',
      'Were you grabbed or squeezed around your neck at any point?',
      'Do you feel any numbness, tingling or weakness anywhere?',
      'Do you feel dizzy, lightheaded or sick to your stomach?',
      'Are you taking any blood-thinning medication?',
      'Do you have any medical conditions or allergies?',
      'On a scale of 0 to 10, how bad is your pain right now?'
    ],

    rp: [
      'confirms the scene is safe before approaching the patient.',
      'performs a primary survey using <C>ABCDE and controls any catastrophic bleeding first.',
      'assesses the patient\'s level of consciousness — GCS 15, alert and orientated, pupils equal and reactive.',
      'examines the chest for signs of blunt injury — bruising and tenderness over the left ribcage, symmetrical chest movement.',
      'examines the abdomen — no tenderness, guarding or distension noted.',
      'fully exposes the patient and systematically checks for bruising, swelling and deformity across the torso and limbs.',
      'carefully assesses the neck for any signs of strangulation — no bruising, voice clear, no difficulty swallowing.',
      'assesses and splints a suspected right forearm fracture — checks distal pulse, sensation and movement before and after splinting.',
      'administers oral paracetamol 1g for pain and reassesses the pain score after 15 minutes.',
      'repeats observations — HR 88, BP 126/78, RR 18, SpO2 98%, GCS 15, pain 3/10 after analgesia.',
      'stays alert for signs of internal injury despite the lack of obvious external wounds given the blunt mechanism.',
      'prepares a structured handover — assaulted with a bat, blunt chest trauma, right forearm fracture, observations stable, analgesia given.'
  ]
  }
};


/* =========================================================
   CARDIAC ASSESSMENT & CARE DATA

   Two categories: "assessment" (suspected cardiac chest
   pain / ACS) and "care" (cardiac arrest / resuscitation).
   Mirrors the incident-scene checklist/questions/RP pattern
   above but is a fully independent system (separate element
   IDs, classes and functions) so it can\'t interfere with the
   Incident Scenes page.
========================================================= */

const cardiacData = {

  assessment: {

    checklistTitle:
      'Cardiac assessment checklist',

    questionsTitle:
      'Chest pain history — ask the patient',

    checklist: [
      'Confirm the scene is safe before approaching.',
      'Introduce yourself and gain the patient\u2019s consent to assess them.',
      'Begin a structured ABCDE assessment.',
      'Assess airway patency.',
      'Assess breathing rate, effort and oxygen saturation.',
      'Check pulse rate, rhythm and character, and blood pressure in both arms if dissection is suspected.',
      'Take a structured SOCRATES pain history for the chest pain.',
      'Attach a 12-lead ECG and review for ST changes, T-wave changes or new bundle branch block as early as possible.',
      'Give supplemental oxygen only if the patient is hypoxic, not routinely.',
      'Consider aspirin 300 mg if indicated and there is no clear contraindication.',
      'Consider GTN for symptom relief if blood pressure allows.',
      'Gain IV access and take bloods, including troponin, per local protocol.',
      'Continue cardiac monitoring and repeat a full set of observations.',
      'Identify red-flag features and escalate promptly if present.',
      'Prepare a structured ATMIST/SBAR handover.'
    ],

    questions: [
      'Can you describe what the pain feels like?',
      'Where exactly is the pain?',
      'Does it spread anywhere — your arm, jaw or back?',
      'When did it start, and what were you doing?',
      'Is the pain constant, or does it come and go?',
      'Does anything make it better or worse?',
      'On a scale of 0 to 10, how severe is the pain?',
      'Do you feel short of breath, sweaty, sick or light-headed?',
      'Have you had pain like this before?',
      'Do you have a history of heart problems, high blood pressure, diabetes or high cholesterol?',
      'Do you smoke, or have you smoked in the past?',
      'Is there a family history of heart disease?',
      'What medications are you currently taking?',
      'Do you have any allergies?'
    ],

    rp: [
      'introduces themselves to the patient, gains consent and begins a structured ABCDE assessment focused on the chest pain.',
      'checks the patient\u2019s airway is clear and assesses their breathing rate, effort and oxygen saturation.',
      'palpates the patient\u2019s radial pulse, checks blood pressure in both arms and assesses skin colour, temperature and capillary refill.',
      'takes a structured SOCRATES pain history, asking about the site, onset, character, radiation, associated symptoms, timing, exacerbating/relieving factors and severity of the chest pain.',
      'attaches a 12-lead ECG monitor and reviews the trace for ST changes, T-wave abnormalities or a new bundle branch block.',
      'checks the patient\u2019s oxygen saturation before deciding whether supplemental oxygen is clinically indicated.',
      'checks for aspirin allergy and bleeding risk before preparing the indicated 300 mg aspirin loading dose.',
      'checks the patient\u2019s blood pressure and cardiac history before considering GTN for symptom relief.',
      'gains IV access and prepares blood samples, including troponin, according to local protocol.',
      'continues cardiac monitoring and repeats a full set of observations, watching closely for deterioration.',
      'identifies red-flag features in the assessment and escalates the case for urgent senior/cardiology review.',
      'prepares a structured ATMIST handover summarising the history, ECG findings and treatment given so far.'
  ]
  },

  care: {

    checklistTitle:
      'Cardiac arrest / resuscitation checklist',

    questionsTitle:
      'Ask bystanders / witnesses',

    checklist: [
      'Confirm the scene is safe before approaching.',
      'Check for a response by shaking the shoulders and shouting.',
      'Open the airway and look, listen and feel for normal breathing for no more than 10 seconds.',
      'Shout for help, call for resuscitation support and request an AED/defibrillator.',
      'Begin chest compressions immediately at the centre of the chest.',
      'Compress at a rate of 100–120 per minute to a depth of 5–6cm, allowing full recoil.',
      'Give compressions and ventilations at a ratio of 30:2 where trained and equipped to do so.',
      'Attach the AED/defibrillator as soon as it arrives and follow its prompts.',
      'Stand clear during rhythm analysis and shock delivery, then resume compressions immediately.',
      'Swap the compressor role roughly every 2 minutes to maintain compression quality.',
      'Consider and treat the reversible causes (4 Hs and 4 Ts) where trained to do so.',
      'On return of spontaneous circulation, reassess ABCDE, obtain a 12-lead ECG and titrate oxygen to target.',
      'Continue close monitoring of consciousness, breathing, circulation and temperature in post-ROSC care.',
      'Prepare a structured handover including collapse time, initial rhythm, shocks and drugs given, and response to treatment.'
    ],

    questions: [
      'Did anyone see what happened?',
      'What time did they collapse?',
      'Were they breathing normally before this happened?',
      'Has anyone already started CPR?',
      'Does the patient have any known heart conditions?',
      'Is there a defibrillator nearby?',
      'Did they complain of chest pain, breathlessness or feeling unwell beforehand?',
      'Does anyone know their medical history or current medications?',
      'Has anyone already called for further help?'
    ],

    rp: [
      'confirms the scene is safe, checks for a response by shaking the patient\u2019s shoulders and shouting, and opens the airway to check for normal breathing.',
      'shouts for help, requests an AED/defibrillator and calls for resuscitation support after confirming the patient is unresponsive and not breathing normally.',
      'begins chest compressions at the centre of the patient\u2019s chest at a rate of 100 to 120 per minute, allowing full recoil between compressions.',
      'delivers compressions and ventilations at a ratio of 30 to 2 while resuscitation equipment is prepared.',
      'attaches the AED/defibrillator, follows the voice prompts and stands clear of the patient during rhythm analysis.',
      'delivers a shock when advised by the defibrillator and immediately resumes chest compressions afterwards.',
      'swaps the compressor role with a colleague every two minutes to maintain effective compression quality.',
      'considers the reversible causes of cardiac arrest and treats any that are identified.',
      'reassesses the patient\u2019s ABCDE, obtains a 12-lead ECG and titrates oxygen following return of spontaneous circulation.',
      'continues close monitoring of the patient\u2019s consciousness, breathing, circulation and temperature during post-resuscitation care.',
      'prepares a structured handover including the time of collapse, initial rhythm, shocks delivered and treatment given.'
  ]
  }
};

let currentCardiacCategory = 'assessment';
let currentCardiacRPMode = 'slash';

function showCardiacCategory(name) {
  if (!cardiacData[name]) {
    console.warn(
      `Unknown cardiac category: ${name}`
    );

    return;
  }

  currentCardiacCategory = name;

  document
    .querySelectorAll('.cardiac-panel')
    .forEach(el => {

      const active =
        el.id === `cardiac-${name}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.cardcat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showCardiacCategory('${name}')`
        ) ||
        onclick.includes(
          `showCardiacCategory("${name}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderCardiacChecklist();
  renderCardiacQuestions();
  renderCardiacRP();
}

function renderCardiacChecklist() {
  const container =
    document.getElementById('cardiacChecklist');

  const titleEl =
    document.getElementById('cardiacChecklistTitle');

  if (!container) return;

  const category =
    cardiacData[currentCardiacCategory];

  if (!category) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      category.checklistTitle || 'Checklist';
  }

  container.innerHTML =
    category.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-cardiac-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderCardiacQuestions() {
  const container =
    document.getElementById('cardiacQuestions');

  const titleEl =
    document.getElementById('cardiacQuestionsTitle');

  if (!container) return;

  const category =
    cardiacData[currentCardiacCategory];

  if (!category) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      category.questionsTitle || 'Ask directly';
  }

  container.innerHTML =
    category.questions
      .map(
        (question, index) => `
          <div class="question-row">

            <span>
              ${index + 1}
            </span>

            <p id="cardiacQ-${index}">
              ${escapeHtml(question)}
            </p>

            <div class="question-buttons">
              <button
                type="button"
                onclick="copyText('cardiacQ-${index}')"
              >
                Copy
              </button>
            </div>

          </div>
        `
      )
      .join('');
}

function setCardiacRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentCardiacRPMode = mode;

  document
    .querySelectorAll('.crpt')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setCardiacRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setCardiacRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderCardiacRP();
}

function renderCardiacRP() {
  const container =
    document.getElementById('cardiacRPList');

  if (!container) return;

  const category =
    cardiacData[currentCardiacCategory];

  if (!category) {
    container.innerHTML = '';
    return;
  }

  const contentKey = 'cardiac-rp-' + currentCardiacCategory;
  const rpList = getEditableItems(contentKey, category.rp);

  renderEditableList('cardiacRPList', rpList, contentKey, (action, index) => {
    const command =
      currentCardiacRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentCardiacRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="cardiacRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('cardiacRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseCardiac() {
  currentCardiacCategory = 'assessment';
  currentCardiacRPMode = 'slash';

  showCardiacCategory('assessment');
  setCardiacRPMode('slash');
}

/* =========================================================
   PROCEDURES

   Full prep-through-procedure walkthroughs. Each entry has
   its own prep checklist, procedure checklist, patient
   questions and RP action library. Independent system —
   separate element IDs/classes/functions from both the
   Incident Scenes and Cardiac systems above, so none of the
   three can interfere with each other.
========================================================= */


/* =========================================================
   PATIENT QUESTION LIBRARY
========================================================= */

var patientQuestionLib = {
  "general": [
    "/tts Can you tell me your name and date of birth?",
    "/tts Can you tell me what happened today?",
    "/tts Do you have any medical conditions?",
    "/tts Are you taking any regular medication?",
    "/tts Do you have any allergies?",
    "/tts On a scale of 0 to 10, how much pain are you in?",
    "/tts Can you point to where it hurts?"
  ],
  "chest-pain": [
    "/tts Can you describe the pain? Is it sharp, dull, crushing or burning?",
    "/tts When did the pain start?",
    "/tts Does the pain go anywhere else? Like your arm, jaw or back?",
    "/tts Does anything make it better or worse?",
    "/tts Do you feel short of breath?",
    "/tts Have you had a heart attack or heart problems before?"
  ],
  "trauma": [
    "/tts What happened? Can you walk me through it?",
    "/tts Where is your pain?",
    "/tts Can you feel your hands and feet?",
    "/tts Did you hit your head or lose consciousness?",
    "/tts Do you have any neck or back pain?",
    "/tts Do you feel dizzy or lightheaded?"
  ],
  "respiratory": [
    "/tts When did the breathing difficulty start?",
    "/tts Do you have asthma, COPD or any lung condition?",
    "/tts Have you used your inhaler already?",
    "/tts Can you speak in full sentences?",
    "/tts Do you have any chest pain when you breathe?"
  ],
  "neuro": [
    "/tts Can you tell me what day it is today?",
    "/tts Can you tell me where you are?",
    "/tts Can you lift both arms up for me?",
    "/tts Can you squeeze my hands?",
    "/tts Can you smile for me? Show me your teeth.",
    "/tts Did you have a seizure? How long did it last?"
  ],
  "cardiac": [
    "/tts Do you have any chest pain or discomfort?",
    "/tts Do you feel your heart racing or skipping beats?",
    "/tts Do you have a history of heart disease?",
    "/tts Do you smoke or vape?",
    "/tts Do you have diabetes?"
  ],
  "abdominal": [
    "/tts Where is the pain in your stomach?",
    "/tts When did the pain start?",
    "/tts Is the pain constant or does it come and go?",
    "/tts Have you been sick or had diarrhoea?",
    "/tts Have you had any surgery on your stomach before?"
  ]
};

/* =========================================================
   DOCUMENTATION BUILDER (Patient Care Record)
========================================================= */

function generatePcr() {
  var fields = [];
  var ids = ["pcr_date","pcr_type","pcr_location","pcr_name","pcr_age","pcr_gender","pcr_complaint","pcr_history","pcr_allergies","pcr_meds","pcr_bp","pcr_hr","pcr_rr","pcr_spo2","pcr_temp","pcr_gcs","pcr_pain","pcr_airway","pcr_breathing","pcr_circulation","pcr_disability","pcr_exposure","pcr_treatment","pcr_medsGiven","pcr_procedures","pcr_response","pcr_disposition","pcr_handover","pcr_clinician"];
  var vals = {};
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    vals[id] = el ? el.value : '';
  });
  var t = '=== PATIENT CARE RECORD (RP) ===\n\n';
  t += 'Date/Time: ' + vals.pcr_date + ' | Type: ' + vals.pcr_type + ' | Location: ' + vals.pcr_location + '\n\n';
  t += 'Patient: ' + vals.pcr_name + ' | Age: ' + vals.pcr_age + ' | Gender: ' + vals.pcr_gender + '\n';
  t += 'Complaint: ' + vals.pcr_complaint + '\n';
  t += 'History: ' + vals.pcr_history + '\n';
  t += 'Allergies: ' + vals.pcr_allergies + ' | Medications: ' + vals.pcr_meds + '\n\n';
  t += 'OBS: BP ' + vals.pcr_bp + ' | HR ' + vals.pcr_hr + ' | RR ' + vals.pcr_rr + ' | SpO2 ' + vals.pcr_spo2 + ' | Temp ' + vals.pcr_temp + ' | GCS ' + vals.pcr_gcs + ' | Pain ' + vals.pcr_pain + '\n\n';
  t += 'ABCDE: A=' + vals.pcr_airway + ' B=' + vals.pcr_breathing + ' C=' + vals.pcr_circulation + ' D=' + vals.pcr_disability + ' E=' + vals.pcr_exposure + '\n\n';
  t += 'Treatment: ' + vals.pcr_treatment + '\n';
  t += 'Meds Given: ' + vals.pcr_medsGiven + '\n';
  t += 'Procedures: ' + vals.pcr_procedures + '\n';
  t += 'Response: ' + vals.pcr_response + '\n\n';
  t += 'Disposition: ' + vals.pcr_disposition + '\n';
  t += 'Handover: ' + vals.pcr_handover + '\n';
  t += 'Clinician: ' + vals.pcr_clinician + '\n';
  t += '\n--- RP DOCUMENTATION ONLY ---';
  var out = document.getElementById('pcrOutput');
  if (out) out.textContent = t;
}

function copyPcr() {
  var out = document.getElementById('pcrOutput');
  if (out && out.textContent && out.textContent.indexOf('PATIENT CARE RECORD') >= 0) copyTextInline(out.textContent);
  else showToast('Generate a PCR first', 'error');
}

function clearPcr() {
  document.querySelectorAll('#pcrForm input, #pcrForm textarea').forEach(function(el) { el.value = ''; });
  var out = document.getElementById('pcrOutput');
  if (out) out.textContent = 'Fill in the form above and click Generate.';
  showToast('Cleared', 'info');
}

window.generatePcr = generatePcr;
window.copyPcr = copyPcr;
window.clearPcr = clearPcr;
/* =========================================================
   CMS FRONTEND LAYER (Defaults + Overrides)
   Every data consumer can call cmsGet(type) to receive
   DB content when present, falling back to built-in JS
   defaults when not. Safe by construction - never breaks.
========================================================= */

var cmsCache = {};
var cmsCacheTime = {};
var CMS_CACHE_TTL = 30000; /* 30s */
var cmsFallbacks = {};
/*
 * Phase 5 cutover:
 * Structured CMS is authoritative. Legacy editable_content is retained only
 * as an emergency rollback path and is disabled for normal public reads.
 * The server exposes the same switch to avoid accidental split-brain reads.
 */
var CMS_LEGACY_FALLBACK = false;

/* Fetch a content type from the structured CMS, then built-in defaults. */
async function cmsGet(type, fallbackFn) {
  var now = Date.now();
  if (cmsCache[type] && cmsCacheTime[type] && (now - cmsCacheTime[type] < CMS_CACHE_TTL)) {
    return cmsCache[type];
  }
  try {
    var structured = await api('/api/public/cms/blocks/' + encodeURIComponent(type));
    if (structured && structured.ok && Array.isArray(structured.items) && structured.items.length > 0) {
      var structuredItems = [];
      structured.items.forEach(function(i) {
        var val = (typeof i.content === 'string') ? JSON.parse(i.content) : i.content;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          val._cmsKey = i.content_key || i.block_key;
          val._cmsName = i.title || val.name || val.title || i.content_key || i.block_key;
          val._cmsOrder = i.order_index || 0;
        }
        structuredItems.push(val);
      });
      structuredItems.sort(function(a, b) { return (a._cmsOrder || 0) - (b._cmsOrder || 0); });
      cmsCache[type] = structuredItems;
      cmsCacheTime[type] = now;
      return structuredItems;
    }
  } catch (e) {
    /* Structured CMS unavailable — built-in defaults remain the safe normal path. */
  }

  /* Emergency rollback only. Set CMS_LEGACY_FALLBACK=true in the source if a
     controlled rollback is required; normal production builds keep this false. */
  if (CMS_LEGACY_FALLBACK) {
    try {
      var res = await api('/api/cms/' + encodeURIComponent(type));
      if (res && res.ok && Array.isArray(res.items)) {
        var published = res.items.filter(function(i) { return i.is_published !== false; });
        var items = [];
        published.forEach(function(i) {
          var val = (typeof i.content === 'string') ? JSON.parse(i.content) : i.content;
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            val._cmsKey = i.content_key;
            val._cmsName = i.item_name || val.name || val.title || i.content_key;
            val._cmsOrder = i.order_index || 0;
          }
          items.push(val);
        });
        items.sort(function(a, b) { return (a._cmsOrder || 0) - (b._cmsOrder || 0); });
        if (items.length > 0) {
          cmsCache[type] = items;
          cmsCacheTime[type] = now;
          return items;
        }
      }
    } catch (e) {
      /* fall through to built-in defaults */
    }
  }

  var fallback = fallbackFn ? fallbackFn() : (cmsFallbacks[type] || []);
  return fallback;
}

/* Patch a built-in object with a CMS override (by matching key/name) */
function cmsApply(collection, items, keyField) {
  var map = {};
  (items || []).forEach(function(it) {
    if (!it) return;
    var k = it._cmsKey || it[keyField] || it.name || it.title || '';
    if (k) map[k] = it;
  });
  Object.keys(map).forEach(function(k) {
    collection[k] = map[k];
  });
}

window.cmsGet = cmsGet;
window.cmsApply = cmsApply;


/* ---- Google Slides URL helper ---- */

const proceduresData = {

  colonoscopy: {
    slideUrl: '',

    prepTitle:
      'Colonoscopy — preparation',

    stepsTitle:
      'Colonoscopy — procedure',

    questionsTitle:
      'Before you begin — ask the patient',

    prepChecklist: [
      'Confirm the patient\u2019s identity, the planned procedure and signed consent.',
      'Check for allergies and any anticoagulant/antiplatelet or diabetes medication that may need adjusting beforehand.',
      'Confirm bowel preparation was taken as instructed and the bowel is adequately clear.',
      'Confirm the patient followed the low-residue/clear-fluid diet and fasting instructions.',
      'Check the colonoscope, light source and processor are all working correctly before starting.',
      'Check the expiry date and packaging integrity of the biopsy forceps, snare and specimen pots.',
      'Open the biopsy forceps, snare, specimen pots and any other sterile instruments using an aseptic non-touch technique, without touching the working ends, and arrange them within reach in order of likely use.',
      'Site an IV cannula for sedation/analgesia access.',
      'Attach monitoring: SpO\u2082, ECG and non-invasive blood pressure.',
      'Check the expiry and packaging of the sedation/analgesia drugs, draw up and label them.',
      'Give prescribed sedation/analgesia, titrated to effect per local protocol.',
      'Position the patient in the left lateral position with knees drawn up.',
      'Perform a final safety time-out — correct patient, procedure, consent and equipment.'
    ],

    procedureChecklist: [
      'Perform a digital rectal examination before inserting the scope.',
      'Gently insert the colonoscope and advance under direct vision, using air/CO\u2082 insufflation to open the lumen.',
      'Advance through the sigmoid, descending, transverse and ascending colon to the caecum, identifying landmarks such as the ileocaecal valve and appendix orifice.',
      'Withdraw slowly and systematically, carefully inspecting all mucosal surfaces.',
      'Take biopsies of any abnormal areas as clinically indicated.',
      'Perform polypectomy if a polyp is found and appropriate, sending specimens for histology.',
      'Aspirate excess air/fluid as the scope is withdrawn to reduce post-procedure discomfort.',
      'Remove the scope and document findings, including any biopsies or polyps taken.',
      'Move the patient to recovery and continue monitoring until sedation wears off.'
    ],

    questions: [
      'Have you taken all of your bowel preparation as instructed?',
      'When did you last have a bowel movement, and was it clear liquid?',
      'Do you have any allergies, including to latex or sedative medications?',
      'Are you taking any blood-thinning medication?',
      'Do you have diabetes, and have you adjusted your medication as advised?',
      'Do you understand the procedure, and have you signed the consent form?',
      'Do you have someone to accompany you home after sedation?'
    ],

    rp: [
      'confirms the patient\u2019s identity, procedure and signed consent before beginning the pre-procedure safety checks.',
      'checks the colonoscope, light source and processor are all working correctly before starting.',
      'checks the expiry date and packaging of the biopsy forceps, snare and specimen pots, opening them using an aseptic non-touch technique.',
      'checks the patient has completed their bowel preparation and followed the fasting instructions.',
      'sites an IV cannula and attaches SpO\u2082, ECG and blood pressure monitoring before sedation.',
      'checks the expiry of the sedation/analgesia drugs and draws them up, labelling each syringe clearly.',
      'titrates IV sedation and analgesia to effect while continuously monitoring the patient\u2019s observations.',
      'positions the patient in the left lateral position and performs a final team time-out before starting.',
      'performs a digital rectal examination before gently inserting the colonoscope.',
      'advances the colonoscope to the caecum, identifying the ileocaecal valve and appendix orifice as landmarks.',
      'withdraws the colonoscope slowly, systematically inspecting the mucosa for abnormalities.',
      'takes a biopsy of a suspicious area and sends the specimen for histology.',
      'performs a polypectomy on an identified polyp and retrieves the specimen.',
      'withdraws the scope, aspirates residual air and documents the procedure findings.',
      'transfers the patient to recovery and continues monitoring until they are fully alert.'
  ]
  },

  cannulation: {
    slideUrl: '',

    prepTitle:
      'IV cannulation — preparation',

    stepsTitle:
      'IV cannulation — procedure',

    questionsTitle:
      'Before you begin — ask the patient',

    prepChecklist: [
      'Confirm the patient\u2019s identity and explain the procedure, gaining verbal consent.',
      'Check for allergies (latex, adhesive, chlorhexidine) and any bleeding disorders or anticoagulants.',
      'Select an appropriate vein and cannula size for the intended use.',
      'Check the expiry date and packaging integrity of the cannula, flush syringe and dressing.',
      'Gather a tray, tourniquet, alcohol wipe, gauze, gloves and a sharps bin, and bring the sharps bin to the point of use.',
      'Open the cannula, flush syringe and dressing packaging onto the tray using a non-touch technique, keeping the cannula tip and dressing adhesive uncontaminated.',
      'Apply a tourniquet and identify a suitable vein.',
      'Don gloves and clean the site with an alcohol wipe, allowing it to dry.'
    ],

    procedureChecklist: [
      'Anchor the vein and insert the cannula at the correct angle, bevel up.',
      'Advance until flashback is seen in the chamber.',
      'Lower the angle, advance slightly further, then withdraw the needle slightly.',
      'Release the tourniquet and apply digital pressure proximal to the cannula tip.',
      'Remove the needle fully and dispose of it immediately in a sharps bin.',
      'Attach the cap/extension set and flush to confirm patency.',
      'Secure the cannula with a sterile dressing and label with date and time.',
      'Document the procedure, including site, gauge and number of attempts.'
    ],

    questions: [
      'Do you have any allergies to latex, adhesive dressings or antiseptic solutions?',
      'Have you had a cannula before, and did you have any problems with it?',
      'Are you on any blood-thinning medication?',
      'Which arm would you prefer, and do you have a preferred site?',
      'Do you feel any pain or discomfort during insertion?'
    ],

    rp: [
      'explains the cannulation procedure to the patient and gains verbal consent.',
      'checks for allergies and bleeding risk before selecting an appropriate vein and cannula size.',
      'checks the expiry date and packaging of the cannula, flushes syringe and dressing before opening them.',
      'opens the cannula, flushes syringe and dressing onto the tray using a non-touch technique.',
      'applies a tourniquet, cleans the site with an alcohol wipe and allows it to dry.',
      'inserts the cannula at the correct angle and confirms flashback in the chamber.',
      'advances the cannula off the needle, releases the tourniquet and applies digital pressure.',
      'removes the needle and immediately disposes of it in the sharps bin.',
      'flushes the cannula to confirm patency before securing it with a sterile dressing.',
      'labels the cannula with the date and time and documents the procedure in the notes.'
    ],

    rp_floor: [
      formatRpWithEmote('kneels beside the patient on the ground and explains the cannulation procedure, gaining verbal consent.', 'talk'),
      formatRpWithEmote('kneels on the ground, checking for allergies and bleeding risk before selecting an appropriate vein and cannula size.', 'check'),
      formatRpWithEmote('checks the expiry date and packaging of the cannula while kneeling beside the patient on the ground.', 'check'),
      formatRpWithEmote('opens the cannula and flushes the syringe onto a tray set on the ground, using a non-touch technique.', 'clean'),
      formatRpWithEmote('applies a tourniquet and cleans the site with an alcohol wipe while kneeling beside the patient on the ground.', 'clean'),
      formatRpWithEmote('kneels steady beside the patient on the ground, inserts the cannula at the correct angle and confirms flashback.', 'inject'),
      formatRpWithEmote('advances the cannula off the needle, releases the tourniquet and applies digital pressure while kneeling on the ground.', 'press'),
      formatRpWithEmote('removes the needle and immediately disposes of it in a sharps bin brought to the ground beside the patient.', 'clean'),
      formatRpWithEmote('flushes the cannula to confirm patency, still kneeling on the ground beside the patient, before securing it.', 'inject'),
      formatRpWithEmote('labels the cannula and documents the procedure on a notepad while kneeling on the ground.', 'notepad')
    ],

    rp_bed: [
      formatRpWithEmote('stands beside the bed and explains the cannulation procedure to the patient, gaining verbal consent.', 'talk'),
      formatRpWithEmote('stands at the bedside, checking for allergies and bleeding risk before selecting an appropriate vein and cannula size.', 'check'),
      formatRpWithEmote('checks the expiry date and packaging of the cannula at the bedside tray.', 'check'),
      formatRpWithEmote('opens the cannula and flushes the syringe onto the bedside tray using a non-touch technique.', 'clean'),
      formatRpWithEmote('applies a tourniquet and cleans the site with an alcohol wipe at the patient\'s bedside.', 'clean'),
      formatRpWithEmote('inserts the cannula at the correct angle under good lighting and confirms flashback in the chamber.', 'inject'),
      formatRpWithEmote('advances the cannula off the needle, releases the tourniquet and applies digital pressure at the bedside.', 'press'),
      formatRpWithEmote('removes the needle and immediately disposes of it in the bedside sharps bin.', 'clean'),
      formatRpWithEmote('flushes the cannula to confirm patency before securing it with a sterile dressing at the bedside.', 'inject'),
      formatRpWithEmote('labels the cannula with the date and time and documents the procedure in the patient\'s notes.', 'notepad')
  ]
  },

  catheterisation: {
    slideUrl: '',

    prepTitle:
      'Urinary catheterisation — preparation',

    stepsTitle:
      'Urinary catheterisation — procedure',

    questionsTitle:
      'Before you begin — ask the patient',

    prepChecklist: [
      'Confirm identity, explain the procedure and gain consent (verbal, and written where local policy requires).',
      'Check for latex allergy and any urethral trauma or recent surgery that would contraindicate catheterisation.',
      'Check the expiry date and packaging integrity of the catheterisation pack, catheter and drainage bag.',
      'Gather the sterile catheterisation pack, appropriate catheter size, lubricant/anaesthetic gel and drainage bag.',
      'Position the patient appropriately with adequate privacy.',
      'Perform hand hygiene and don non-sterile gloves to prepare the trolley.',
      'Open the outer packaging of the sterile catheterisation pack onto a clean trolley, then open the inner sterile wrap using its corners to create a sterile field without reaching over it.',
      'Perform hand hygiene again and don sterile gloves before touching the sterile field.',
      'Open the catheter, lubricant/anaesthetic gel, syringe and drainage bag onto the sterile field using a non-touch technique.',
      'Clean the genital area with antiseptic solution using an aseptic technique.'
    ],

    procedureChecklist: [
      'Apply anaesthetic lubricant gel to the urethra and allow time for it to take effect.',
      'Gently insert the catheter into the urethra until urine flows.',
      'Advance slightly further to ensure the balloon sits in the bladder, not the urethra.',
      'Inflate the balloon with the recommended volume of sterile water.',
      'Gently withdraw the catheter until resistance is felt, confirming correct balloon position.',
      'Connect the catheter to a sterile drainage bag.',
      'Secure the catheter appropriately to prevent traction injury.',
      'Document the procedure, catheter size, residual volume and any complications.'
    ],

    questions: [
      'Do you have any allergies, particularly to latex or anaesthetic gel?',
      'Have you had a catheter before, and did you have any problems?',
      'Do you have any pain, and how would you rate it?',
      'Have you had any recent urethral or prostate surgery?'
    ],

    rp: [
      'explains the catheterisation procedure to the patient and gains their consent.',
      'checks for latex allergy and recent urological surgery before preparing a sterile catheterisation pack.',
      'checks the expiry date and packaging of the catheterisation pack, catheter and drainage bag.',
      'dons non-sterile gloves and opens the outer packaging of the catheterisation pack onto a clean trolley.',
      'opens the inner sterile wrap using its corners to create a sterile field, then re-glove with sterile gloves.',
      'opens the catheter, lubricant/anaesthetic gel, syringe and drainage bag onto the sterile field using a non-touch technique.',
      'positions the patient appropriately and performs an aseptic clean of the genital area.',
      'applies anaesthetic lubricant gel to the urethra and allows time for it to take effect.',
      'gently inserts the catheter until urine flows, then advances it slightly further.',
      'inflates the catheter balloon with the recommended volume of sterile water.',
      'connects the catheter to a sterile drainage bag and secures it to prevent traction.',
      'documents the catheter size, residual volume and any complications in the notes.'
  ]
  },

  ngtube: {
    slideUrl: '',

    prepTitle:
      'NG tube insertion — preparation',

    stepsTitle:
      'NG tube insertion — procedure',

    questionsTitle:
      'Before you begin — ask the patient',

    prepChecklist: [
      'Confirm identity, explain the procedure and gain consent.',
      'Check for base-of-skull fracture, facial trauma or oesophageal varices as contraindications.',
      'Check the expiry date and packaging integrity of the NG tube, syringe and pH testing strips.',
      'Open the NG tube packaging using a clean technique, keeping the tube itself untouched until insertion.',
      'Measure the tube from nose to earlobe to xiphisternum (NEX measurement) to estimate insertion length, and note the mark on the tube.',
      'Position the patient sitting upright with their head slightly flexed.',
      'Prepare water, a cup and straw, a syringe, pH testing strips and tape/fixation device within reach.'
    ],

    procedureChecklist: [
      'Lubricate the tip of the tube and insert it through the nostril.',
      'Advance the tube along the floor of the nasal cavity, asking the patient to swallow/sip water as it passes the oropharynx.',
      'Continue advancing to the pre-measured length.',
      'Check for signs of respiratory distress or coiling in the mouth, which suggest incorrect placement.',
      'Aspirate fluid from the tube and test with pH strips to confirm gastric placement (pH \u22645.5 per local protocol).',
      'Secure the tube to the nose and, where used, arrange an X-ray to confirm position if pH testing is inconclusive.',
      'Document the procedure, NEX measurement, pH result and confirmation method.'
    ],

    questions: [
      'Do you have any nasal or facial injuries?',
      'Have you had an NG tube before, and did you have any problems?',
      'Do you have any swallowing difficulties?',
      'Do you feel any pain, coughing or breathlessness during insertion?'
    ],

    rp: [
      'explains the NG tube insertion to the patient and gains their consent.',
      'checks the expiry date and packaging integrity of the NG tube, syringe and pH testing strips.',
      'opens the NG tube packaging using a clean technique, keeping the tube itself untouched.',
      'checks for facial trauma and contraindications before measuring the tube from nose to earlobe to xiphisternum.',
      'positions the patient upright with their head slightly flexed before lubricating and inserting the tube.',
      'asks the patient to sip water and swallow as the tube passes the oropharynx, watching for signs of respiratory distress.',
      'advances the tube to the measured length and checks it hasn\u2019t coiled in the mouth.',
      'aspirates fluid from the tube and tests it with pH strips to confirm correct gastric placement.',
      'secures the tube to the patient\u2019s nose and documents the pH result and confirmation method.'
  ]
  },

  intubation: {
    slideUrl: '',

    prepTitle:
      'Endotracheal intubation — preparation',

    stepsTitle:
      'Endotracheal intubation — procedure',

    questionsTitle:
      'Pre-intubation team checks',

    prepChecklist: [
      'Confirm the indication for intubation and gain team consensus on the plan.',
      'Assess for difficult airway predictors — mouth opening, neck mobility, previous airway history.',
      'Check the expiry date and packaging integrity of the endotracheal tubes, bougie and airway adjuncts.',
      'Open the endotracheal tube packaging for the primary size and one size up/down, check the cuff for leaks by inflating and deflating it with a syringe, then leave it ready without contaminating the tube tip.',
      'Open the laryngoscope handle and blade, test the light works, and open the bougie and LMA backup onto a clean surface.',
      'Attach and test the suction unit, and open a suction catheter within reach.',
      'Draw up and clearly label the RSI drugs — commonly fentanyl 1\u20133 micrograms/kg IV as pre-treatment, ketamine 1\u20132 mg/kg IV as the induction agent, and rocuronium 1\u20131.2 mg/kg IV (or suxamethonium 1\u20131.5 mg/kg IV where used) as the paralytic — checking each dose with a second checker.',
      'Position the patient in the sniffing position and pre-oxygenate with high-flow oxygen for at least 3 minutes.',
      'Attach monitoring: SpO\u2082, ECG, blood pressure and capnography, and confirm the capnography is working before starting.',
      'Assign team roles — team lead, drug administration, airway assistant and cricoid pressure if used.',
      'Perform a final team time-out confirming the primary and backup airway plans, drug doses and equipment checks.'
    ],

    procedureChecklist: [
      'Announce and administer fentanyl 1\u20133 micrograms/kg IV as pre-treatment analgesia.',
      'Announce and administer the induction agent — ketamine 1\u20132 mg/kg IV — and confirm loss of consciousness.',
      'Announce and administer the paralytic — rocuronium 1\u20131.2 mg/kg IV, or suxamethonium 1\u20131.5 mg/kg IV where used — per protocol.',
      'Wait for full muscle relaxation and loss of consciousness before attempting laryngoscopy.',
      'Perform laryngoscopy and visualise the vocal cords.',
      'Insert the endotracheal tube through the cords under direct/video vision, using a bougie if the view is difficult.',
      'Inflate the cuff and carefully remove the laryngoscope.',
      'Confirm placement with continuous waveform capnography, chest rise and bilateral air entry on auscultation.',
      'Secure the tube at the correct depth and note the position at the teeth/lips.',
      'Ventilate the patient by bagging with a bag-valve device on high-flow oxygen at an appropriate rate, watching for chest rise — escalate to a transport ventilator only if crew training and equipment allow.',
      'Reconfirm tube position with capnography and auscultation after any patient movement, and prepare a structured handover for the receiving hospital team, who will confirm placement further (including X-ray if needed).',
      'Document the procedure: drugs and doses given, tube size, depth, number of attempts and confirmation method.'
    ],

    questions: [
      'Does the patient have any known difficult airway history?',
      'Is there a documented allergy to fentanyl, ketamine, rocuronium, suxamethonium or any other planned drug?',
      'What is the patient\u2019s estimated weight, to confirm the mg/kg doses?',
      'What is the plan if intubation fails — Plan B and Plan C?',
      'Who is giving cricoid pressure, if used, and who is timing the apnoea?',
      'Is suction immediately available and working?',
      'Is the difficult airway trolley/kit accessible in the room?'
    ],

    rp: [
      'assesses the patient\u2019s airway for difficult intubation predictors and gathers the required equipment and drugs.',
      'checks the expiry and packaging of the endotracheal tubes and airway adjuncts, then opens the primary tube and tests the cuff for leaks.',
      'opens the laryngoscope, bougie and LMA backup onto a clean surface and tests the laryngoscope light.',
      'attaches and tests the suction unit before opening a suction catheter within reach.',
      'draws up and clearly labels fentanyl, ketamine and rocuronium at the doses confirmed with their second checker.',
      'pre-oxygenates the patient with high-flow oxygen and positions them in the sniffing position before induction.',
      'confirms the airway plan, drug doses and team roles during a final pre-intubation time-out.',
      'announces and administers fentanyl at 1 to 3 micrograms per kilogram IV as pre-treatment analgesia.',
      'announces and administers ketamine at 1 to 2 milligrams per kilogram IV as the induction agent and waits for loss of consciousness.',
      'announces and administers rocuronium at 1 to 1.2 milligrams per kilogram IV and monitors for full muscle relaxation.',
      'performs laryngoscopy and visualises the vocal cords before passing the endotracheal tube.',
      'inserts the endotracheal tube through the vocal cords, using a bougie to assist with a difficult view.',
      'inflates the tube cuff and carefully removes the laryngoscope.',
      'confirms correct tube placement with continuous waveform capnography, chest rise and bilateral air entry.',
      'secures the endotracheal tube at the correct depth and notes the position at the teeth.',
      'bags the patient with a bag-valve device on high-flow oxygen at an appropriate rate, watching for good chest rise.',
      'reconfirms tube position with capnography and auscultation after moving the patient and prepares a structured handover for the receiving hospital team.',
      'documents the drugs and doses given, tube size, depth and confirmation method used.'
  ]
  },

  intubationHospital: {

    prepTitle:
      'Endotracheal intubation (in hospital) — preparation',

    stepsTitle:
      'Endotracheal intubation (in hospital) — procedure',

    questionsTitle:
      'Pre-intubation team checks',

    prepChecklist: [
      'Confirm the indication for intubation and gain team consensus on the plan, involving anaesthetics/ICU as appropriate.',
      'Assess for difficult airway predictors — mouth opening, neck mobility, previous airway history — and check the anaesthetic chart if available.',
      'Check the expiry date and packaging integrity of the endotracheal tubes, bougie and airway adjuncts.',
      'Open the endotracheal tube packaging for the primary size and one size up/down, check the cuff for leaks by inflating and deflating it with a syringe, then leave it ready without contaminating the tube tip.',
      'Check the anaesthetic machine/ventilator is switched on, self-tested and ready, with the circuit and filters correctly attached.',
      'Open the laryngoscope handle and blade, test the light works, and open the bougie and supraglottic airway backup onto a clean surface.',
      'Attach and test the suction unit, and open a suction catheter within reach.',
      'Draw up and clearly label the RSI drugs — commonly fentanyl 1\u20133 micrograms/kg IV, propofol 1.5\u20132.5 mg/kg IV (or ketamine 1\u20132 mg/kg IV) as the induction agent, and rocuronium 1\u20131.2 mg/kg IV (or suxamethonium 1\u20131.5 mg/kg IV where used) — checking each dose with a second checker.',
      'Position the patient in the sniffing position and pre-oxygenate using the anaesthetic circuit or high-flow oxygen for at least 3 minutes.',
      'Attach monitoring: SpO\u2082, ECG, blood pressure and capnography, and confirm the capnography is working before starting.',
      'Assign team roles — team lead, drug administration, airway assistant and cricoid pressure if used — including an ODP/anaesthetic assistant where available.',
      'Perform a WHO-style final team time-out confirming the primary and backup airway plans, drug doses and equipment checks.'
    ],

    procedureChecklist: [
      'Announce and administer fentanyl 1\u20133 micrograms/kg IV as pre-treatment analgesia.',
      'Announce and administer the induction agent — propofol 1.5\u20132.5 mg/kg IV, or ketamine 1\u20132 mg/kg IV — and confirm loss of consciousness.',
      'Announce and administer the paralytic — rocuronium 1\u20131.2 mg/kg IV, or suxamethonium 1\u20131.5 mg/kg IV where used — per protocol.',
      'Wait for full muscle relaxation and loss of consciousness before attempting laryngoscopy.',
      'Perform laryngoscopy and visualise the vocal cords.',
      'Insert the endotracheal tube through the cords under direct/video vision, using a bougie if the view is difficult.',
      'Inflate the cuff and carefully remove the laryngoscope.',
      'Confirm placement with continuous waveform capnography, chest rise and bilateral air entry on auscultation.',
      'Secure the tube at the correct depth and note the position at the teeth/lips.',
      'Connect the tube to the ventilator/anaesthetic circuit and set ventilation parameters — rate, tidal volume, PEEP and FiO\u2082 — per protocol.',
      'Arrange a portable chest X-ray to confirm tube position and depth.',
      'Document the procedure: drugs and doses given, tube size, depth, number of attempts and confirmation method.'
    ],

    questions: [
      'Does the patient have any known difficult airway history or anaesthetic chart notes?',
      'Is there a documented allergy to fentanyl, propofol, ketamine, rocuronium, suxamethonium or any other planned drug?',
      'What is the patient\u2019s weight, to confirm the mg/kg doses?',
      'What is the plan if intubation fails — Plan B and Plan C, including supraglottic rescue and surgical airway?',
      'Who is giving cricoid pressure, if used, and who is timing the apnoea?',
      'Is suction immediately available and working?',
      'Is the difficult airway trolley accessible, and is an ODP/anaesthetic assistant present?',
      'Is an ICU/recovery bed booked for the patient after the procedure?'
    ],

    rp: [
      'assesses the patient\u2019s airway for difficult intubation predictors and reviews the anaesthetic chart if available.',
      'checks the expiry and packaging of the endotracheal tubes and airway adjuncts, then opens the primary tube and tests the cuff for leaks.',
      'checks the anaesthetic machine is switched on, self-tested and confirms the circuit is correctly attached.',
      'opens the laryngoscope, bougie and supraglottic airway backup onto a clean surface and tests the laryngoscope light.',
      'attaches and tests the suction unit before opening a suction catheter within reach.',
      'draws up and clearly labels fentanyl, propofol and rocuronium at the doses confirmed with their second checker.',
      'pre-oxygenates the patient using the anaesthetic circuit and positions them in the sniffing position before induction.',
      'confirms the airway plan, drug doses and team roles with the ODP and anaesthetist during a final WHO-style time-out.',
      'announces and administers fentanyl at 1 to 3 micrograms per kilogram IV as pre-treatment analgesia.',
      'announces and administers propofol at 1.5 to 2.5 milligrams per kilogram IV as the induction agent and waits for loss of consciousness.',
      'announces and administers rocuronium at 1 to 1.2 milligrams per kilogram IV and monitors for full muscle relaxation.',
      'performs laryngoscopy and visualises the vocal cords before passing the endotracheal tube.',
      'inserts the endotracheal tube through the vocal cords, using a bougie to assist with a difficult view.',
      'inflates the tube cuff and carefully removes the laryngoscope.',
      'confirms correct tube placement with continuous waveform capnography, chest rise and bilateral air entry.',
      'secures the endotracheal tube at the correct depth and notes the position at the teeth.',
      'connects the tube to the ventilator and sets the rate, tidal volume, PEEP and FiO\u2082 according to protocol.',
      'arranges a portable chest X-ray to confirm tube position and depth.',
      'documents the drugs and doses given, tube size, depth and confirmation method used.'
  ]
  },

  chesttube: {
    slideUrl: '',

    prepTitle:
      'Chest tube / finger thoracostomy (on scene) — preparation',

    stepsTitle:
      'Chest tube / finger thoracostomy (on scene) — procedure',

    questionsTitle:
      'Scene / team questions',

    prepChecklist: [
      'Confirm the indication \u2014 suspected tension pneumothorax with respiratory distress, unilateral absent breath sounds, hypotension, or traumatic/peri-arrest with a plausible chest injury.',
      'Position the patient supine, or as safely possible, and expose the chest fully.',
      'Identify the landmark \u2014 the 4th or 5th intercostal space, anterior to the mid-axillary line, on the affected side.',
      'Check the expiry date and packaging integrity of the thoracostomy/drain kit, scalpel and dressings.',
      'Open the kit using an aseptic non-touch technique, laying out the scalpel, forceps, dressing and any drain/valve within reach.',
      'Clean the skin with antiseptic solution.',
      'Give local anaesthetic if the patient is conscious and time allows \u2014 this is often omitted in a critical or peri-arrest patient.',
      'Don sterile gloves and appropriate PPE for blood exposure risk.'
    ],

    procedureChecklist: [
      'Make a 2\u20133cm incision through the skin at the identified landmark.',
      'Bluntly dissect through the chest wall muscle layers with forceps or a finger, staying just above the rib to avoid the neurovascular bundle.',
      'Puncture the parietal pleura and confirm entry with a rush of air or blood.',
      'Sweep a finger through the opening to clear any adhesions and confirm the pleural space.',
      'Insert a chest drain through the thoracostomy opening if equipped and trained to do so, or leave it as a finger thoracostomy if no drain is carried.',
      'Attach a one-way (Heimlich) valve or underwater seal if a drain is placed, to prevent air re-entry.',
      'Secure the drain \u2014 or dress the open thoracostomy \u2014 and immediately reassess breathing and observations.',
      'Continue to monitor for re-accumulation of the pneumothorax during transport.',
      'Prepare a structured handover including the indication, side, technique used and the patient\u2019s response.'
    ],

    questions: [
      'Which side is the suspected tension pneumothorax on?',
      'What are the patient\u2019s current observations and trend?',
      'Is this patient peri-arrest or in traumatic cardiac arrest?',
      'Is a formal chest drain and valve carried, or is this a finger thoracostomy only?',
      'Has the patient had any chest trauma that changes the approach, such as a nearby penetrating injury?'
    ],

    rp: [
      'confirms the suspected tension pneumothorax based on respiratory distress, absent breath sounds and hypotension.',
      'exposes the patient\u2019s chest fully and identifies the 4th or 5th intercostal space, anterior to the mid-axillary line.',
      'checks the expiry and packaging of the thoracostomy kit before opening it using an aseptic non-touch technique.',
      'cleans the skin with antiseptic solution and gives local anaesthetic if the patient is conscious and time allows.',
      'makes a 2 to 3 centimetre incision at the landmark and bluntly dissects through the chest wall with forceps.',
      'punctures the parietal pleura and confirms entry with a rush of air.',
      'sweeps a finger through the opening to clear adhesions and confirms the pleural space.',
      'inserts a chest drain through the thoracostomy opening and attaches a one-way valve to prevent air re-entry.',
      'secures the drain, immediately reassesses the patient\u2019s breathing and observations, and continues to monitor during transport.',
      'prepares a structured handover including the indication, side, technique used and the patient\u2019s response.'
  ]
  },

  chesttubeHospital: {

    prepTitle:
      'Chest tube insertion (in hospital) — preparation',

    stepsTitle:
      'Chest tube insertion (in hospital) — procedure',

    questionsTitle:
      'Before you begin',

    prepChecklist: [
      'Confirm the indication and gain consent where the patient is conscious and it isn\u2019t a peri-arrest emergency.',
      'Confirm the site and side with a chest X-ray or ultrasound where available and time allows.',
      'Position the patient semi-recumbent with the arm on the affected side raised behind their head.',
      'Identify the landmark \u2014 the "triangle of safety" (anterior to latissimus dorsi, lateral to pectoralis major, above the 5th intercostal space).',
      'Check the expiry date and packaging integrity of the chest drain kit, local anaesthetic and underwater seal drainage system.',
      'Perform hand hygiene and don a sterile gown and gloves.',
      'Open the sterile chest drain pack onto a trolley, then open the drain, dilators, scalpel, sutures and dressings onto the sterile field using a non-touch technique.',
      'Clean the skin with antiseptic solution and apply a sterile drape.',
      'Infiltrate local anaesthetic through the skin, muscle and down to the pleura at the landmark.'
    ],

    procedureChecklist: [
      'Make a small incision at the landmark and bluntly dissect down to the pleura, staying above the rib.',
      'Confirm entry into the pleural space with a rush of air or fluid, or using the Seldinger technique with needle aspiration and guidewire insertion per kit instructions.',
      'Insert the chest drain into the pleural space, directing it apically for a pneumothorax or basally for a haemothorax/effusion.',
      'Connect the drain to an underwater seal drainage system, checking for swing and bubbling.',
      'Suture the drain in place and apply an occlusive dressing.',
      'Confirm drain position with a chest X-ray.',
      'Reassess breathing, oxygen saturation and observations after insertion.',
      'Document the procedure: indication, side, drain size, technique and confirmation method.',
      'Prescribe or confirm ongoing analgesia \u2014 chest drains are painful.'
    ],

    questions: [
      'Has the patient given consent, and do they understand the procedure?',
      'Is there a coagulopathy or anticoagulant use that needs correcting first?',
      'Has the correct side been confirmed on imaging?',
      'Does the patient have any known pleural adhesions from previous surgery or infection?',
      'Is analgesia prescribed and ready for after the procedure?',
      'Who will confirm drain position on the post-procedure X-ray?'
    ],

    rp: [
      'confirms the indication and gains the patient\u2019s consent where possible.',
      'confirms the correct side and sites using a chest X-ray or ultrasound before starting.',
      'positions the patient semi-recumbent with their arm raised behind their head on the affected side.',
      'identifies the triangle of safety as their landmark for insertion.',
      'checks the expiry and packaging of the chest drain kit before opening it onto a sterile field.',
      'cleans the skin with antiseptic solution and applies a sterile drape.',
      'infiltrates local anaesthetic through the skin, muscle and down to the pleura.',
      'makes a small incision and bluntly dissects down to the pleura, staying above the rib.',
      'confirms entry into the pleural space and inserts the chest drain, directing it apically or basally as appropriate.',
      'connects the drain to an underwater seal system and checks for swing and bubbling.',
      'sutures the drain in place and applies an occlusive dressing.',
      'requests a chest X-ray to confirm drain position.',
      'reassesses the patient\u2019s breathing, oxygen saturation and observations after the procedure.',
      'documents the indication, side, drain size, technique and confirmation method.'
  ]
  },

  cannularemoval: {
    slideUrl: '',

    prepTitle:
      'Cannula removal — preparation',

    stepsTitle:
      'Cannula removal — procedure',

    questionsTitle:
      'Before you begin — ask the patient',

    prepChecklist: [
      'Confirm the cannula is no longer needed, or check for signs it needs removing \u2014 redness, swelling, pain, leaking or blockage.',
      'Explain the procedure to the patient and gain verbal consent.',
      'Perform hand hygiene and don non-sterile gloves.',
      'Gather sterile gauze, tape or a dressing, and a sharps bin for the used cannula.',
      'Check the insertion site for signs of infection \u2014 redness, warmth, swelling or pus \u2014 before removal.'
    ],

    procedureChecklist: [
      'Loosen the dressing/tape securing the cannula without pulling on the cannula itself.',
      'Apply gentle pressure over the insertion site with gauze as the cannula is withdrawn.',
      'Withdraw the cannula smoothly in a single motion, in line with the vein.',
      'Apply firm pressure over the site for at least 30 seconds, longer if the patient is on blood thinners.',
      'Check the cannula tip is intact \u2014 escalate immediately if any part appears to have broken off.',
      'Apply a clean dressing once bleeding has stopped.',
      'Dispose of the cannula safely in a sharps bin.',
      'Document the date, time and reason for removal, and the condition of the site.'
    ],

    questions: [
      'Are you on any blood-thinning medication?',
      'Have you noticed any pain, redness or swelling at the site?',
      'Have you had any problems with bleeding after cannula removal before?',
      'Do you have any allergies to adhesive dressings?'
    ],

    rp: [
      'checks the cannula site for signs of infection and confirms it\u2019s no longer needed before removing it.',
      'explains the procedure to the patient and gains their consent.',
      'loosens the dressing without pulling on the cannula itself.',
      'withdraws the cannula smoothly in a single motion, applying gentle pressure with gauze.',
      'applies firm pressure over the site for at least 30 seconds to control any bleeding.',
      'checks the cannula tip is intact before disposing of it safely in the sharps bin.',
      'applies a clean dressing once the bleeding has stopped.',
      'documents the date, time, reason for removal and the condition of the site.'
  ]
  },

  centralline: {
    slideUrl: '',

    prepTitle:
      'Central line insertion — preparation',

    stepsTitle:
      'Central line insertion — procedure',

    questionsTitle:
      'Before you begin',

    prepChecklist: [
      'Confirm the indication for central venous access and gain consent where possible.',
      'Position the patient appropriately for the chosen site \u2014 commonly head-down (Trendelenburg) for internal jugular or subclavian access, to distend the vein and reduce air embolism risk.',
      'Identify the landmark and confirm the site with ultrasound where available.',
      'Check the expiry date and packaging integrity of the central line kit, local anaesthetic and dressing.',
      'Perform hand hygiene and don a sterile gown, gloves, hat and mask \u2014 full aseptic/maximal barrier precautions.',
      'Open the central line kit onto a sterile trolley, then open the guidewire, dilator, catheter and syringes onto the sterile field using a non-touch technique.',
      'Clean the skin thoroughly with antiseptic solution and apply a large sterile drape.',
      'Infiltrate local anaesthetic at the insertion site.'
    ],

    procedureChecklist: [
      'Locate the vein using ultrasound guidance or anatomical landmarks, and insert the introducer needle while aspirating.',
      'Confirm venous blood return and thread the guidewire through the needle using the Seldinger technique.',
      'Remove the needle, leaving the guidewire in place, and make a small skin incision if needed.',
      'Pass the dilator over the guidewire to create a tract, then remove the dilator.',
      'Thread the central line catheter over the guidewire into the vein, then remove the guidewire.',
      'Confirm blood can be aspirated from each lumen and flush each lumen with saline.',
      'Suture the catheter in place and apply a sterile dressing.',
      'Confirm catheter tip position with a chest X-ray before the line is used for infusions.',
      'Document the procedure: site, number of attempts, confirmation method and any complications.'
    ],

    questions: [
      'Has the patient given consent, and do they understand the procedure?',
      'Is there a coagulopathy or anticoagulant use that needs correcting first?',
      'Does the patient have any known difficult vascular access or previous central lines?',
      'Is ultrasound guidance available for this insertion?',
      'Who will confirm catheter position on the post-procedure X-ray?'
    ],

    rp: [
      'confirms the indication for central venous access and gains the patient\u2019s consent where possible.',
      'positions the patient appropriately and identifies the insertion site using ultrasound guidance.',
      'checks the expiry and packaging of the central line kit before opening it onto a sterile trolley.',
      'puts on a sterile gown, gloves, hat and mask, following full aseptic precautions.',
      'cleans the skin thoroughly and applies a large sterile drape before infiltrating local anaesthetic.',
      'inserts the introducer needle under ultrasound guidance and confirms venous blood return.',
      'threads the guidewire through the needle using the Seldinger technique, then removes the needle.',
      'passes the dilator over the guidewire to create a tract before threading the central line catheter into place.',
      'confirms blood can be aspirated from each lumen and flushes each lumen with saline.',
      'sutures the catheter in place and applies a sterile dressing.',
      'arranges a chest X-ray to confirm catheter tip position before it\u2019s used for infusions.',
      'documents the site, number of attempts, confirmation method and any complications.'
  ]
  },

  dialysiscatheter: {
    slideUrl: '',

    prepTitle:
      'Dialysis catheter insertion — preparation',

    stepsTitle:
      'Dialysis catheter insertion — procedure',

    questionsTitle:
      'Before you begin',

    prepChecklist: [
      'Confirm the indication for urgent dialysis access and gain consent where possible.',
      'Position the patient appropriately for the chosen site \u2014 commonly internal jugular, with femoral as an alternative; subclavian is generally avoided to protect future fistula options.',
      'Identify the landmark and confirm the site with ultrasound where available.',
      'Check the expiry date and packaging integrity of the dialysis catheter kit \u2014 wider bore than a standard central line \u2014 local anaesthetic and dressing.',
      'Perform hand hygiene and don a sterile gown, gloves, hat and mask \u2014 full aseptic/maximal barrier precautions.',
      'Open the dialysis catheter kit onto a sterile trolley, then open the guidewire, sequential dilators, catheter and syringes onto the sterile field using a non-touch technique.',
      'Clean the skin thoroughly with antiseptic solution and apply a large sterile drape.',
      'Infiltrate local anaesthetic at the insertion site.'
    ],

    procedureChecklist: [
      'Locate the vein using ultrasound guidance and insert the introducer needle while aspirating.',
      'Confirm venous blood return and thread the guidewire through the needle using the Seldinger technique.',
      'Remove the needle, leaving the guidewire in place, and make a small skin incision to allow the larger dilators through.',
      'Progressively dilate the tract with the sequential dilators provided, since dialysis catheters are wider-bore than standard central lines.',
      'Thread the dual-lumen dialysis catheter over the guidewire into the vein, then remove the guidewire.',
      'Confirm blood can be aspirated from both the red (arterial) and blue (venous) lumens.',
      'Instil the correct lock solution into each lumen per protocol, then cap both ports securely.',
      'Suture the catheter in place and apply a sterile dressing.',
      'Confirm catheter tip position with a chest X-ray before the line is used for dialysis.',
      'Document the procedure: site, catheter size, number of attempts, lock solution used and confirmation method.'
    ],

    questions: [
      'Has the patient given consent, and do they understand the procedure?',
      'Is there a coagulopathy or anticoagulant use that needs correcting first?',
      'Does the patient have any previous dialysis lines, fistulas or vascular access history?',
      'Is ultrasound guidance available for this insertion?',
      'Which lock solution and dose does local protocol specify for this catheter?',
      'Who will confirm catheter position on the post-procedure X-ray?'
    ],

    rp: [
      'confirms the indication for urgent dialysis access and gains the patient\u2019s consent where possible.',
      'positions the patient appropriately and identifies the insertion site using ultrasound guidance.',
      'checks the expiry and packaging of the dialysis catheter kit before opening it onto a sterile trolley.',
      'puts on a sterile gown, gloves, hat and mask, following full aseptic precautions.',
      'cleans the skin thoroughly and applies a large sterile drape before infiltrating local anaesthetic.',
      'inserts the introducer needle under ultrasound guidance and confirms venous blood return.',
      'threads the guidewire through the needle using the Seldinger technique, then removes the needle.',
      'progressively dilates the tract with the sequential dilators, given the wider bore of the dialysis catheter.',
      'threads the dual-lumen catheter over the guidewire into the vein, then removes the guidewire.',
      'confirms blood can be aspirated from both the red and blue lumens.',
      'instils the correct lock solution into each lumen and caps both ports securely.',
      'sutures the catheter in place and applies a sterile dressing.',
      'arranges a chest X-ray to confirm catheter tip position before it\u2019s used for dialysis.',
      'documents the site, catheter size, number of attempts, lock solution and confirmation method.'
    ]
  },

  castapplication: {
    slideUrl: '',

    prepTitle:
      'Cast application — preparation',

    stepsTitle:
      'Cast application — procedure',

    questionsTitle:
      'Before you begin',

    prepChecklist: [
      'Confirm the fracture is suitable for casting \u2014 stable, non-displaced, or already reduced.',
      'Confirm neurovascular status is normal before casting, and document it clearly.',
      'Explain the procedure to the patient and gain consent.',
      'Gather the correct width of stockinette, padding/wool and plaster or fibreglass casting material.',
      'Check the expiry and packaging of the casting material.',
      'Position the patient and the limb in the correct functional position for the injury.',
      'Have water at the correct temperature ready if using plaster of Paris \u2014 warmer water sets faster.',
      'Protect the patient\u2019s clothing and the surrounding area from splashes and drips.'
    ],

    procedureChecklist: [
      'Apply the stockinette smoothly over the limb, extending beyond where the cast will end.',
      'Apply padding evenly, with extra layers over bony prominences and pressure points.',
      'Wet the casting material according to the manufacturer\u2019s instructions.',
      'Apply the casting material in a smooth spiral, overlapping each turn by about half its width.',
      'Mould the cast while it\u2019s still workable to match the limb\u2019s natural contours, using the flat of the hand rather than fingertips to avoid pressure points.',
      'Hold the joint in the correct position without moving it until the material begins to set.',
      'Trim and fold back the stockinette/padding edges before the cast fully hardens.',
      'Check the cast isn\u2019t too tight \u2014 it should fit two fingers comfortably at the top.',
      'Recheck distal circulation, sensation and movement once the cast has set.',
      'Elevate the limb and give the patient clear cast-care advice.'
    ],

    questions: [
      'Do you have any allergies to plaster, fibreglass or padding materials?',
      'Have you had a cast before, and did you have any problems with it?',
      'Do you have any conditions affecting your skin or circulation?',
      'Are you able to keep the limb elevated for the first few days?'
    ],

    rp: [
      'confirms the fracture is suitable for casting and checks neurovascular status is normal beforehand.',
      'explains the procedure to the patient and gains their consent.',
      'gathers the correct stockinette, padding and casting material, checking the expiry and packaging.',
      'positions the limb in the correct functional position for the injury.',
      'applies the stockinette smoothly, extending it beyond where the cast will end.',
      'applies padding evenly, adding extra layers over bony prominences and pressure points.',
      'wets the casting material according to the manufacturer\u2019s instructions.',
      'applies the casting material in a smooth spiral, overlapping each turn by about half its width.',
      'moulds the cast with the flat of the hand while it\u2019s still workable, holding the joint still until it sets.',
      'trims and folds back the stockinette and padding edges before the cast fully hardens.',
      'checks the finished cast fits two fingers comfortably at the top.',
      'rechecks distal circulation, sensation and movement once the cast has set.',
      'elevates the limb and gives the patient clear cast-care advice.'
    ]
  },

  castremoval: {
    slideUrl: '',

    prepTitle:
      'Cast removal — preparation',

    stepsTitle:
      'Cast removal — procedure',

    questionsTitle:
      'Before you begin',

    prepChecklist: [
      'Confirm the reason for cast removal and check if imaging or a follow-up is planned afterwards.',
      'Check the cast for damage, wetness or signs of complications before starting.',
      'Explain the procedure to the patient — they will hear the saw and feel vibration, but it should not hurt.',
      'Reassure the patient that the cast saw does not cut skin and moves quickly.',
      'Gather the cast saw, two spreaders, and scissors/pliers if the cast needs splitting afterwards.',
      'Position the patient comfortably with the limb supported and accessible.',
      'Warn the patient the saw will feel warm against the cast.',
      'Given the vibration and warmth, keep the saw blade moving gently and avoid pressing hard in one spot.'
    ],

    procedureChecklist: [
      'Plan a safe cutting line, usually along the length of the cast, avoiding any area where the skin may be prominent or fragile.',
      'Support the limb beneath the cast with your hand during cutting so the cast does not drag on the skin as it moves.',
      'Start the cut with the saw moving, then bring it gently onto the cast surface.',
      'Cut along the planned line with short, light strokes, keeping the blade moving and angled to follow the cast.',
      'Stop cutting if the patient reports pain or burning, or if you see or smell smoke, and lift the blade immediately.',
      'Reassure and pause if the patient becomes anxious, and continue only when comfortable.',
      'Once cut, insert a spreader into the saw cut and gently open it to split the cast apart.',
      'Cut or unfasten any padding with scissors, taking care not to snip the skin.',
      'Remove the cast halves and padding carefully, inspecting the skin as it is revealed.',
      'Check the underlying limb \\u2014 neurovascular status, skin condition, swelling and bony alignment.',
      'Document the removal, the condition of the limb and any follow-up required.'
    ],

    questions: [
      'Is the cast feeling too tight or painful at all?',
      'Has there been any numbness, tingling, or change in colour of your fingers/toes?',
      'Do you have any skin conditions or allergies to adhesive materials?',
      'Have you any other casts that will need attention today?'
    ],

    rp: [
      'confirms the reason for cast removal and checks the cast for damage or complications first.',
      'explains the procedure and reassures the patient that the cast saw cuts by vibration and will not cut their skin.',
      'positions the limb comfortably and supports it beneath the cast.',
      'warns the patient the saw will feel warm against the cast.',
      'starts the cast saw and brings it gently onto the cast alongside the planned cutting line.',
      'cuts along the cast with short, light strokes, keeping the blade moving to avoid friction burns.',
      'pauses and reassures the patient if they become anxious or report discomfort.',
      'inserts a spreader into the cut and gently opens it to split the cast apart.',
      'cuts and unfastens the padding with scissors, taking care not to snip the skin.',
      'removes the cast halves and padding carefully, inspecting the skin as it is revealed.',
      'checks the underlying limb for neurovascular status, skin condition, swelling and alignment.',
      'documents the removal and the condition of the limb, and gives after-care advice.'
    ]
  },

  jointreduction: {
    slideUrl: '',

    prepTitle:
      'Joint reduction — preparation',

    stepsTitle:
      'Joint reduction — procedure',

    questionsTitle:
      'Before you begin',

    prepChecklist: [
      'Confirm the dislocation clinically, and with imaging first where the situation allows.',
      'Assess and document neurovascular status before any reduction attempt.',
      'Explain the procedure to the patient, including what they may feel, and gain consent.',
      'Ensure appropriate analgesia and/or procedural sedation is given, with monitoring in place.',
      'Gather any joint-specific equipment needed \u2014 traction sheet, positioning aids.',
      'Ensure adequate staff are present, including someone to monitor sedation if it\u2019s used.',
      'Position the patient appropriately for the specific joint and technique being used.'
    ],

    procedureChecklist: [
      'Apply steady, gentle traction in the line of the deformity, avoiding sudden or forceful movement.',
      'Use the joint-specific technique indicated for this dislocation.',
      'Feel or listen for a clunk as the joint relocates.',
      'Stop and reassess if reduction isn\u2019t achieved after a reasonable attempt \u2014 repeated forceful attempts risk further injury.',
      'Reassess neurovascular status immediately after reduction.',
      'Confirm successful reduction with imaging where indicated.',
      'Immobilise/splint the joint in a stable, safe position following reduction.',
      'Monitor the patient until any sedation given has fully worn off.',
      'Document the technique used, number of attempts, neurovascular findings before and after, and post-reduction imaging.',
      'Arrange follow-up and give the patient clear aftercare advice.'
    ],

    questions: [
      'Has the patient given consent, and do they understand the procedure?',
      'Have they eaten or drunk recently, if sedation is being considered?',
      'Do they have any allergies to the analgesia or sedation being used?',
      'Has this joint been dislocated before?',
      'Who will monitor the patient if procedural sedation is given?'
    ],

    rp: [
      'confirms the dislocation clinically and reviews imaging where available before attempting reduction.',
      'assesses and documents neurovascular status before the reduction attempt.',
      'explains the procedure to the patient, including what they may feel, and gains consent.',
      'ensures adequate analgesia and/or procedural sedation is given, with monitoring in place.',
      'positions the patient appropriately for the specific joint and technique being used.',
      'applies steady, gentle traction in the line of the deformity, avoiding sudden or forceful movement.',
      'uses the joint-specific technique indicated for this dislocation.',
      'feels for a clunk as the joint relocates, confirming successful reduction.',
      'reassesses neurovascular status immediately after the reduction.',
      'confirms successful reduction with imaging where indicated.',
      'immobilises the joint in a stable, safe position following reduction.',
      'monitors the patient until any sedation given has fully worn off.',
      'documents the technique used, neurovascular findings before and after, and post-reduction imaging.',
      'arranges follow-up and gives the patient clear aftercare advice.'
    ]
  },

  rsi: {
    slideUrl: '',

    prepTitle:
      'RSI — preparation',

    stepsTitle:
      'RSI — procedure',

    questionsTitle:
      'Before you begin — team brief',

    prepChecklist: [
      'Confirm the indication for RSI and that it\u2019s within the team\u2019s scope and equipment.',
      'Complete a full team brief, assigning roles \u2014 team leader, airway, drugs, monitoring, and manual in-line stabilisation if trauma is suspected.',
      'Prepare and check all airway equipment, including a backup plan and surgical airway kit, following a "plan A to D" approach.',
      'Draw up and label all RSI drugs, with a second person independently checking each one.',
      'Attach full monitoring \u2014 SpO\u2082, ECG, capnography ready, non-invasive BP.',
      'Position the patient optimally, with suction immediately to hand.',
      'Pre-oxygenate for at least 3 minutes where possible, aiming for the highest achievable SpO\u2082 before induction.',
      'Confirm IV/IO access is patent and running.'
    ],

    procedureChecklist: [
      'Give fentanyl 1\u20133 micrograms/kg IV as a co-induction agent, to blunt the response to laryngoscopy.',
      'Give the induction agent \u2014 ketamine 1\u20132 mg/kg IV, or propofol 1.5\u20132.5 mg/kg IV \u2014 immediately followed by the paralytic.',
      'Give the paralytic \u2014 rocuronium 1\u20131.2 mg/kg IV, or suxamethonium 1\u20131.5 mg/kg IV \u2014 straight after the induction agent.',
      'Maintain manual in-line stabilisation throughout if cervical spine injury is suspected.',
      'Wait for full paralysis, confirmed by loss of muscle tone/jaw relaxation, before attempting laryngoscopy.',
      'Perform laryngoscopy and pass the tube under direct/video vision.',
      'Confirm placement with continuous capnography waveform, plus chest rise and bilateral air entry.',
      'Secure the tube and note the depth at the teeth/lips.',
      'Move to the backup plan immediately if intubation isn\u2019t successful within the agreed attempt limit \u2014 don\u2019t repeat the same failing attempt indefinitely.',
      'Begin sedation and, if needed, further paralysis for ongoing ventilation once the tube is confirmed and secured.',
      'Document the drugs, doses, number of attempts and confirmation method.'
    ],

    questions: [
      'Is the team ready, and has every role been assigned?',
      'What\u2019s the backup plan if intubation isn\u2019t successful?',
      'Has full monitoring been attached and is it working?',
      'Has pre-oxygenation been adequate?',
      'Are the drugs drawn up, labelled and independently checked?'
    ],

    rp: [
      'confirms the indication for RSI and that the team and equipment are ready.',
      'completes a full team brief, assigning roles including team leader, airway, drugs and monitoring.',
      'checks all airway equipment, including the backup plan and surgical airway kit.',
      'draws up and labels the RSI drugs, with a second person independently checking each one.',
      'attaches full monitoring, including continuous capnography.',
      'pre-oxygenates the patient for at least 3 minutes before induction.',
      'gives fentanyl 1 to 3 micrograms per kilogram IV as a co-induction agent.',
      'gives ketamine 1 to 2 milligrams per kilogram IV as the induction agent.',
      'gives rocuronium 1 to 1.2 milligrams per kilogram IV as the paralytic, immediately after induction.',
      'maintains manual in-line stabilisation throughout, given the suspected cervical spine injury.',
      'waits for full paralysis before attempting laryngoscopy.',
      'performs laryngoscopy and passes the tube under direct vision.',
      'confirms placement with continuous capnography, chest rise and bilateral air entry.',
      'secures the tube and notes the depth at the teeth.',
      'moves to the backup plan immediately, as intubation wasn\u2019t successful within the agreed attempt limit.',
      'documents the drugs, doses, number of attempts and confirmation method.'
    ]
  },

  chestdecompression: {
    slideUrl: '',

    prepTitle:
      'Needle chest decompression — preparation',

    stepsTitle:
      'Needle chest decompression — procedure',

    questionsTitle:
      'Confirm before decompressing',

    prepChecklist: [
      'Confirm the clinical diagnosis of tension pneumothorax \u2014 this is a clinical diagnosis, not an X-ray one; don\u2019t delay for imaging.',
      'Identify the correct landmark \u2014 2nd intercostal space, mid-clavicular line, or 5th intercostal space, anterior axillary line (the "safe triangle") \u2014 on the affected side.',
      'Select a long, large-bore cannula suitable for chest decompression.',
      'Clean the skin quickly if time allows, without delaying a genuinely time-critical decompression.',
      'Prepare a way to secure the cannula once inserted.'
    ],

    procedureChecklist: [
      'Insert the cannula at the chosen landmark, angled just over the top of the rib below to avoid the neurovascular bundle.',
      'Advance until a hiss or rush of air confirms entry into the pleural space and relief of the tension.',
      'Withdraw the needle, leaving the plastic cannula in place.',
      'Secure the cannula so it can\u2019t fall out or kink.',
      'Reassess the patient immediately \u2014 breathing, SpO\u2082, heart rate and blood pressure should improve.',
      'Stay alert for re-accumulation of the tension pneumothorax, since a cannula alone can block or dislodge.',
      'Prepare for a formal chest drain as soon as possible, since needle decompression is a temporary measure.',
      'Document the indication, side, landmark used and the patient\u2019s response.'
    ],

    questions: [
      'Which side is the suspected tension pneumothorax on?',
      'What are the patient\u2019s current observations and trend?',
      'Is this patient peri-arrest or in traumatic cardiac arrest?',
      'Has a formal chest drain been requested or arranged for follow-up?'
    ],

    rp: [
      'confirms the clinical diagnosis of tension pneumothorax without delaying for imaging.',
      'identifies the correct landmark for decompression on the affected side.',
      'selects a long, large-bore cannula suitable for chest decompression.',
      'inserts the cannula angled just over the top of the rib below, avoiding the neurovascular bundle.',
      'advances until a rush of air confirms entry into the pleural space.',
      'withdraws the needle, leaving the plastic cannula in place.',
      'secures the cannula so it can\u2019t fall out or kink.',
      'reassesses the patient immediately, checking breathing, SpO\u2082, heart rate and blood pressure.',
      'stays alert for re-accumulation of the tension pneumothorax.',
      'prepares for a formal chest drain as soon as possible.',
      'documents the indication, side, landmark used and the patient\u2019s response.'
    ]
  }
};

let currentProcedure = 'cannulation';
let currentProcedureRPMode = 'slash';
let currentProcedureSetting = 'onscene';

const PROCEDURE_SETTINGS = {
  cannulation: 'onscene',
  intubation: 'onscene',
  chesttube: 'onscene',
  rsi: 'onscene',
  chestdecompression: 'onscene',
  intubationHospital: 'hospital',
  colonoscopy: 'hospital',
  catheterisation: 'hospital',
  ngtube: 'hospital',
  chesttubeHospital: 'hospital',
  cannularemoval: 'hospital',
  centralline: 'hospital',
  dialysiscatheter: 'hospital',
  castapplication: 'hospital',
  castremoval: 'hospital',
  jointreduction: 'hospital'
};

function showProcedureSetting(setting) {
  if (setting !== 'onscene' && setting !== 'hospital') {
    setting = 'onscene';
  }

  currentProcedureSetting = setting;

  document
    .querySelectorAll('.procsetting')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showProcedureSetting('${setting}')`
        ) ||
        onclick.includes(
          `showProcedureSetting("${setting}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  const onsceneTabs =
    document.getElementById('onsceneProcTabs');

  const hospitalTabs =
    document.getElementById('hospitalProcTabs');

  if (onsceneTabs) {
    onsceneTabs.style.display =
      setting === 'onscene' ? '' : 'none';
  }

  if (hospitalTabs) {
    hospitalTabs.style.display =
      setting === 'hospital' ? '' : 'none';
  }

  const defaultProcedure =
    setting === 'onscene'
      ? 'cannulation'
      : 'colonoscopy';

  showProcedure(defaultProcedure);
}

function showProcedure(name) {
  if (!proceduresData[name]) {
    console.warn(
      `Unknown procedure: ${name}`
    );

    return;
  }

  currentProcedure = name;

  document
    .querySelectorAll('.procedure-panel')
    .forEach(el => {

      const active =
        el.id === `procedure-${name}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.proccat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showProcedure('${name}')`
        ) ||
        onclick.includes(
          `showProcedure("${name}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderProcedureSlides();
  renderProcedurePrepChecklist();
  renderProcedureChecklist();
  renderProcedureQuestions();
  renderProcedureRP();
}

function renderProcedurePrepChecklist() {
  const container =
    document.getElementById('procedurePrepChecklist');

  const titleEl =
    document.getElementById('procedurePrepTitle');

  if (!container) return;

  const procedure =
    proceduresData[currentProcedure];

  if (!procedure) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      procedure.prepTitle || 'Preparation';
  }

  container.innerHTML =
    procedure.prepChecklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-procedure-prep-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderProcedureChecklist() {
  const container =
    document.getElementById('procedureChecklist');

  const titleEl =
    document.getElementById('procedureStepsTitle');

  if (!container) return;

  const procedure =
    proceduresData[currentProcedure];

  if (!procedure) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      procedure.stepsTitle || 'Procedure';
  }

  container.innerHTML =
    procedure.procedureChecklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-procedure-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderProcedureQuestions() {
  const container =
    document.getElementById('procedureQuestions');

  const titleEl =
    document.getElementById('procedureQuestionsTitle');

  if (!container) return;

  const procedure =
    proceduresData[currentProcedure];

  if (!procedure) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      procedure.questionsTitle || 'Ask the patient directly';
  }

  container.innerHTML =
    procedure.questions
      .map(
        (question, index) => `
          <div class="question-row">

            <span>
              ${index + 1}
            </span>

            <p id="procedureQ-${index}">
              ${escapeHtml(question)}
            </p>

            <div class="question-buttons">
              <button
                type="button"
                onclick="copyText('procedureQ-${index}')"
              >
                Copy
              </button>
            </div>

          </div>
        `
      )
      .join('');
}

function setProcedureRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentProcedureRPMode = mode;

  document
    .querySelectorAll('.prpt')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setProcedureRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setProcedureRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderProcedureRP();
}

function renderProcedureRP() {
  const container =
    document.getElementById('procedureRPList');

  if (!container) return;

  const procedure =
    proceduresData[currentProcedure];

  if (!procedure) {
    container.innerHTML = '';
    return;
  }

  const defaultRpList = procedure['rp_' + currentContext] || procedure.rp;
  const contentKey = 'procedure-rp-' + currentProcedure + '-' + currentContext;
  const rpList = getEditableItems(contentKey, defaultRpList);

  renderEditableList('procedureRPList', rpList, contentKey, (action, index) => {
    const command =
      currentProcedureRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentProcedureRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="procedureRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('procedureRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseProcedures() {
  currentProcedureSetting = 'onscene';
  currentProcedure = 'cannulation';
  currentProcedureRPMode = 'slash';

  showProcedureSetting('onscene');
  setProcedureRPMode('slash');
}

/* =========================================================
   SPECIALIST GUIDES — HART & HEMS

   Independent system, same pattern as Cardiac and
   Procedures above (own data object, own classes/IDs,
   own functions), so it can\'t interfere with any of the
   other tabbed systems on the page.
========================================================= */

const docsData = {

  hart: {

    checklistTitle:
      'HART activation guide',

    questionsTitle:
      'Scene / command questions',

    checklist: [
      'Receive activation and initial scene information from control — nature of hazard, estimated casualties and location.',
      'Check the expiry date and integrity of PPE and respiratory protection equipment before donning.',
      'Open the PPE packaging using a systematic technique, laying items out in the order they\u2019ll be donned — undersuit, oversuit, gloves, then respirator/mask.',
      'Mobilise the HART vehicle/equipment and don the appropriate PPE for the hazard type before entering the hot/warm zone.',
      'Check the respirator/breathing apparatus seal and cylinder pressure, then complete a buddy check of PPE donning before entering.',
      'Open and check the medical kit bag, confirming haemorrhage control equipment, airway adjuncts and monitoring are present and in date.',
      'Liaise with the police/fire incident commander and agree a safe system of work, including the hot, warm and cold zones.',
      'Enter the hazardous area only within the agreed safe system of work, with a nominated safety officer/buddy.',
      'Perform rapid triage and life-saving interventions — catastrophic haemorrhage control, airway opening — within the hot/warm zone.',
      'Extract casualties to the casualty clearing point in the warm/cold zone as safely and quickly as possible.',
      'Hand over casualties to conventional ambulance crews for ongoing treatment and conveyance.',
      'Decontaminate equipment and personnel as required before leaving the hazard area.',
      'Attend a structured debrief and complete documentation of the incident.'
    ],

    questions: [
      'What is the nature of the hazard — chemical, biological, radiological, nuclear, explosive, structural, water or height?',
      'How many casualties are estimated, and what is their approximate location?',
      'Is the scene declared safe to enter, and what PPE level is required?',
      'Who is the incident commander, and what are the agreed hot/warm/cold zones?',
      'Is there a marauding or ongoing threat requiring police clearance first?',
      'What extraction routes and casualty clearing points have been agreed?'
    ],

    rp: [
      'receives the HART activation from control, noting the hazard type, estimated casualties and location.',
      'checks the expiry date and integrity of the PPE and respiratory protection equipment before donning.',
      'opens the PPE packaging and lays it out in the order it will be donned.',
      'dons the appropriate level of PPE for the hazard before approaching the outer cordon.',
      'checks their respirator seal and cylinder pressure and completes a buddy check with a colleague before entering.',
      'opens and checks the medical kit bag, confirming haemorrhage control equipment and airway adjuncts are present and in date.',
      'liaises with the police/fire incident commander to agree a safe system of work and confirms the hot, warm and cold zones.',
      'enters the hazardous area within the agreed safe system of work alongside a nominated safety buddy.',
      'performs rapid triage and controls catastrophic haemorrhage on the casualties within the hot zone.',
      'extracts the casualty to the casualty clearing point in the warm zone as quickly and safely as possible.',
      'hands over the casualty to a conventional ambulance crew at the casualty clearing point.',
      'decontaminates their equipment and PPE before leaving the hazardous area.',
      'attends the incident debrief and completes the required HART documentation.'
  ]
  },

  hems: {

    checklistTitle:
      'HEMS request-to-handover guide',

    questionsTitle:
      'Confirm before the aircraft arrives',

    checklist: [
      'Ground crew requests HEMS via ambulance control, giving mechanism, injuries, location and a proposed safe landing site.',
      'Confirm weather and landing site suitability, and identify hazards such as wires, livestock or loose debris for the crew.',
      'Establish scene safety and a landing marshal if required, keeping bystanders well clear of the rotor disc.',
      'Check the expiry date and packaging integrity of trauma kit, dressings and IV/IO equipment while awaiting the aircraft.',
      'Open the trauma bag/rucksack and lay out haemorrhage control, airway and IV/IO equipment ready for the crew\u2019s arrival.',
      'Clear and prepare an accessible space for the crew\u2019s RSI kit and blood product cool box on arrival.',
      'Hand over to the HEMS crew on arrival using a structured ATMIST handover — mechanism, injuries, treatment and observations.',
      'Support the HEMS crew with any advanced interventions they perform, such as RSI, thoracostomy or blood transfusion.',
      'Package the patient for air transport, securing lines, tubes and monitoring appropriately.',
      'Assist with safe loading of the patient onto the aircraft.',
      'Confirm the receiving major trauma centre and ensure a pre-alert has been sent.',
      'Complete joint documentation and a structured handover to the receiving trauma team.'
    ],

    questions: [
      'Is there a safe landing site nearby, and are there any overhead hazards?',
      'What is the mechanism of injury and the suspected injuries?',
      'What treatment and interventions have already been given?',
      'What are the patient\u2019s current observations, and how are they trending?',
      'Which major trauma centre is the patient being taken to?',
      'Does the patient need an advanced intervention only the HEMS crew can provide, such as RSI or blood products?'
    ],

    rp: [
      'requests HEMS via control, providing the mechanism of injury, casualty details and a proposed landing site.',
      'identifies and clears a safe landing site, checking for overhead wires and loose debris.',
      'briefs bystanders to stay clear of the rotor disc and assigns a landing marshal if required.',
      'checks the expiry date and packaging of the trauma kit and IV/IO equipment while awaiting the aircraft.',
      'opens the trauma bag and lays out haemorrhage control and airway equipment ready for the crew\u2019s arrival.',
      'clears a space for the HEMS crew\u2019s RSI kit and blood product cool box ahead of their arrival.',
      'hands over to the arriving HEMS crew using a structured ATMIST handover.',
      'assists the HEMS crew with advanced interventions, including prehospital RSI and blood product administration.',
      'helps package the patient for air transport, securing all lines, tubes and monitoring.',
      'assists with safely loading the patient onto the aircraft.',
      'confirms the receiving major trauma centre and ensures a pre-alert has been sent.',
      'completes joint documentation and prepares a structured handover for the receiving trauma team.'
  ]
  },

  training: {

    checklistTitle:
      'Major Incident Triage Tool \u2014 the triage sieve',

    questionsTitle:
      'Command / control questions',

    checklist: [
      'Confirm the scene is safe and appropriate PPE is worn before approaching any casualty.',
      'Check the casualty for catastrophic external bleeding \u2014 if present, triage them as P1 immediately.',
      'Control any catastrophic bleeding with a pressure dressing, tourniquet or haemostatic packing.',
      'If there is no catastrophic bleeding, ask the casualty to walk \u2014 if they can, triage them as P3.',
      'If they cannot walk, open the airway if required and check whether they are breathing.',
      'If an adult is not breathing, triage them as dead.',
      'In a child under 12 who is not breathing, consider 5 rescue breaths first if the cause is submersion, immersion or smoke inhalation, then recheck for breathing.',
      'If still not breathing after this, triage the child as dead.',
      'If breathing, check whether the casualty is aged over 2 years, breathing 12\u201323 times per minute, and has a heart rate of 100 or more.',
      'If all three criteria are met, triage the casualty as P2.',
      'If any of these criteria are not met, triage the casualty as P1.',
      'Place any unconscious but breathing casualty who isn\u2019t already prioritised into the recovery position.',
      'Record the casualty\u2019s triage category on the tally chart and move on to the next casualty.'
    ],

    questions: [
      'Is the scene declared safe, and what hazards are present?',
      'Has a major incident been formally declared, and has METHANE been passed to control?',
      'How many casualties are there in total, and how many of each triage category so far?',
      'What resources \u2014 ambulances, HART, additional crews \u2014 have been requested?',
      'Where is the casualty clearing point, and how are triaged casualties being moved there?'
    ],

    rp: [
      'confirms the scene is safe and dons appropriate PPE before approaching any casualty.',
      'checks the casualty for catastrophic external bleeding as their first triage step.',
      'controls the catastrophic bleeding with a pressure dressing, tourniquet or haemostatic packing.',
      'asks the casualty to walk, and triages them as P3 since they are able to.',
      'opens the airway if required and checks whether the casualty is breathing.',
      'triages the casualty as dead, as they are not breathing and show no signs of life.',
      'gives 5 rescue breaths to the child before rechecking for breathing, given the submersion/smoke inhalation history.',
      'checks whether the casualty is aged over 2 years, breathing 12 to 23 times per minute, and has a heart rate of 100 or more.',
      'triages the casualty as P2, as they meet all three physiological criteria.',
      'triages the casualty as P1, as they fall outside the safe physiological range.',
      'places the breathing but unconscious casualty into the recovery position before moving to the next casualty.',
      'records the casualty\u2019s triage category on the tally chart and moves on.',
      'passes a structured METHANE message back to control to declare the major incident.'
  ]
  },

  docs: {
    checklistTitle: 'Guides',
    questionsTitle: 'Questions',
    checklist: [],
    questions: [],
    rp: []
  },

  slides: {
    checklistTitle: 'Guides',
    questionsTitle: 'Questions',
    checklist: [],
    questions: [],
    rp: []
  }
};

let currentDocGuide = 'hart';
let currentDocRPMode = 'slash';

function showDocGuide(name) {
  if (!docsData[name]) {
    console.warn(
      `Unknown specialist guide: ${name}`
    );

    return;
  }

  currentDocGuide = name;

  document
    .querySelectorAll('.doc-panel')
    .forEach(el => {

      const active =
        el.id === `doc-${name}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.doccat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showDocGuide('${name}')`
        ) ||
        onclick.includes(
          `showDocGuide("${name}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderDocChecklist();
  renderDocQuestions();
  renderDocRP();

  /* Initialize rich text editors for Docs/Slides */
  if (name === 'docs') {
    initRichEditor('doc-editor', '/api/doc-content/docs');
    const rpPanel = document.getElementById('docRPPanel');
    if (rpPanel) rpPanel.style.display = 'none';
  } else if (name === 'slides') {
    initRichEditor('slides-editor', '/api/doc-content/slides');
    const rpPanel = document.getElementById('docRPPanel');
    if (rpPanel) rpPanel.style.display = 'none';
  } else {
    const rpPanel = document.getElementById('docRPPanel');
    if (rpPanel) rpPanel.style.display = '';
  }

  /* Hide the RP panel for Training since it has no guide content */
  const rpPanel = document.getElementById('docRPPanel');
  if (rpPanel) {
    rpPanel.style.display = name === 'training' ? 'none' : '';
  }
}

function renderDocChecklist() {
  const container =
    document.getElementById('docChecklist');

  const titleEl =
    document.getElementById('docChecklistTitle');

  if (!container) return;

  const guide =
    docsData[currentDocGuide];

  if (!guide) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      guide.checklistTitle || 'Guide';
  }

  container.innerHTML =
    guide.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-doc-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderDocQuestions() {
  const container =
    document.getElementById('docQuestions');

  const titleEl =
    document.getElementById('docQuestionsTitle');

  if (!container) return;

  const guide =
    docsData[currentDocGuide];

  if (!guide) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      guide.questionsTitle || 'Confirm before proceeding';
  }

  container.innerHTML =
    guide.questions
      .map(
        (question, index) => `
          <div class="question-row">

            <span>
              ${index + 1}
            </span>

            <p id="docQ-${index}">
              ${escapeHtml(question)}
            </p>

            <div class="question-buttons">
              <button
                type="button"
                onclick="copyText('docQ-${index}')"
              >
                Copy
              </button>
            </div>

          </div>
        `
      )
      .join('');
}

function setDocRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentDocRPMode = mode;

  document
    .querySelectorAll('.dpt')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setDocRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setDocRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderDocRP();
}

function renderDocRP() {
  const container =
    document.getElementById('docRPList');

  if (!container) return;

  const guide =
    docsData[currentDocGuide];

  if (!guide) {
    container.innerHTML = '';
    return;
  }

  const defaultRpList = guide['rp_' + currentContext] || guide.rp;
  const contentKey = 'doc-rp-' + currentDocGuide + '-' + currentContext;
  const rpList = getEditableItems(contentKey, defaultRpList);

  renderEditableList('docRPList', rpList, contentKey, (action, index) => {
    const command =
      currentDocRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentDocRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="docRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('docRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseDocGuides() {
  currentDocGuide = 'hart';
  currentDocRPMode = 'slash';

  showDocGuide('hart');
  setDocRPMode('slash');
  renderStoredPdfDocs();
}

/* =========================================================
   DOCUMENTS (multi-file per section, persisted in PostgreSQL)
   Each section can hold many files. Sorted alphabetically.
   Only admins can delete. Files survive redeploys.
========================================================= */

const DOC_SECTIONS = ["hart", "hems", "training", "staff-handbook", "equipment", "docs", "slides", "abcde", "blood", "cardiac", "dashboard", "emergencies", "fluids", "meds", "neuro", "observations", "pain", "procedures", "respiratory", "rp", "scenes", "trauma", "account", "admin"];

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function renderStoredPdfDocs() {
  for (const section of DOC_SECTIONS) {
    const el = document.getElementById(`pdfContent-${section}`);
    if (!el) continue;
    try {
      const result = await api(`/api/documents/${encodeURIComponent(section)}`);
      if (result && result.documents && result.documents.length > 0) {
        const docs = [...result.documents].sort((a, b) =>
          (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
        );
        const isAdmin = currentUser && currentUser.role === "admin";
        el.innerHTML = docs.map(doc => {
          const isPptx = doc.name && doc.name.toLowerCase().endsWith(".pptx");
          const icon = isPptx ? "📊" : "📄";
          const typeLabel = isPptx ? "PPTX" : "PDF";
          const serveUrl = `${window.location.origin}/api/serve-doc/by-id/${doc.id}`;
          let embed, viewBtn;
          if (isPptx) {
            const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(serveUrl)}`;
            embed = `<iframe src="${officeUrl}" class="pdf-inline-embed" title="${escapeHtml(doc.name)}"></iframe>`;
            viewBtn = `<button type="button" class="pdf-view-btn" onclick="window.open('${serveUrl}','_blank')">\u{1f441} View</button>`;
          } else {
            embed = `<embed src="${serveUrl}" class="pdf-inline-embed" type="application/pdf" title="${escapeHtml(doc.name)}">`;
            viewBtn = `<button type="button" class="pdf-view-btn" onclick="window.open('${serveUrl}','_blank')">\u{1f441} View ${typeLabel}</button>`;
          }
          const removeBtn = isAdmin
            ? `<button type="button" class="danger-small" onclick="removeDocById('${doc.id}')">Remove</button>`
            : "";
          return `
            <div class="pdf-card">
              <div class="pdf-card-head">
                <span class="pdf-card-icon">${icon}</span>
                <span>${escapeHtml(doc.name)}</span>
                ${viewBtn}
                <button type="button" class="pdf-download-btn" onclick="window.open('${serveUrl}','_blank')">\u2b07 Download</button>
                ${removeBtn}
              </div>
              <div class="pdf-card-body">${embed}</div>
            </div>
          `;
        }).join("");
      } else {
        el.innerHTML = "";
      }
    } catch (err) {
      console.error(`Failed to load documents for ${section}:`, err);
      el.innerHTML = "";
    }
  }
}

async function handleDocPdf(section, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const btn = document.querySelector(`label[for="pdfInput-${section}"]`);
  const original = btn ? btn.textContent : "";
  if (btn) btn.textContent = "⏳ Uploading…";
  try {
    const buffer = await file.arrayBuffer();
    const base64 = await arrayBufferToBase64(buffer);
    await api(`/api/documents/${encodeURIComponent(section)}`, {
      method: "POST",
      body: { name: file.name, data: base64 }
    });
    await renderStoredPdfDocs();
  } catch (err) {
    console.error(err);
    alert("Could not upload that file. " + (err && err.message ? err.message : "The file may be too large or not valid."));
  } finally {
    if (btn) btn.textContent = original;
    input.value = "";
  }
}

async function removeDocById(id) {
  if (!confirm("Remove this document? Only admins can do this.")) return;
  try {
    await api(`/api/documents/by-id/${encodeURIComponent(id)}`, { method: "DELETE" });
    await renderStoredPdfDocs();
  } catch (err) {
    alert("Could not remove document. " + (err && err.message ? err.message : "You may not have admin permissions."));
  }
}

async function syncDocumentsFromServer() {
  await renderStoredPdfDocs();
}

window.handleDocPdf = handleDocPdf;
window.removeDocById = removeDocById;
window.renderStoredPdfDocs = renderStoredPdfDocs;

/* =========================================================
   FRACTURE GUIDE

   Sits within the Trauma section. Independent system —
   own IDs/classes/functions, same pattern as the other
   checklist + RP systems above.
========================================================= */

const fractureData = {

  checklist: [
    'Make the scene safe and use appropriate PPE.',
    'Follow the primary survey (ABCDE) first and treat any life-threatening problems before focusing on the limb injury.',
    'Establish the mechanism and timing of the injury.',
    'Look for deformity, swelling, bruising, an open wound or bleeding, and compare with the uninjured side.',
    'Assess neurovascular status using P-C-C-M-S \u2014 Pulse, Colour, Capillary refill, Movement, Sensation \u2014 before treating the injury.',
    'If there\u2019s an open fracture, cover the wound and control bleeding without pressing on exposed bone \u2014 never push bone back in or attempt to straighten the limb.',
    'Offer appropriate analgesia and reassess the pain score regularly.',
    'Support the injured area in the position found \u2014 don\u2019t force a deformed limb straight or attempt realignment.',
    'Splint/immobilise, supporting the joints above and below the injury and padding the pressure points.',
    'Remove rings, watches and other constrictive items early, before swelling increases.',
    'Recheck P-C-C-M-S neurovascular status after splinting and report any deterioration promptly.',
    'Stay alert for red flags of compartment syndrome \u2014 pain out of proportion to the injury, tense swelling, or new numbness \u2014 and escalate urgently if suspected.',
    'Call for emergency backup where red flags or major trauma are present.',
    'Document the mechanism, findings, treatment given and neurovascular checks before and after.'
  ],

  questions: [
    'Can you tell me exactly what happened and how?',
    'Where does it hurt, and can you point to the worst area?',
    'Can you feel me touching your fingers/toes normally?',
    'Can you wiggle your fingers/toes for me?',
    'Have you been able to put any weight on it or use it since the injury?',
    'Do you feel any pins and needles, numbness, or pain that feels far worse than you\u2019d expect?',
    'Have you had any previous fractures or bone problems?',
    'Do you take any blood-thinning medication?',
    'Do you have any allergies, particularly to pain relief medication?'
  ],

  rp: [
    'makes the scene safe and puts on appropriate PPE before approaching.',
    'follows the primary survey and treats any life-threatening problems before focusing on the limb injury.',
    'exposes the injured limb and compares it with the uninjured side for deformity, swelling and wounds.',
    'assesses pulse, colour, capillary refill, movement and sensation distal to the injury before treating it.',
    'covers any open wound and controls bleeding without pressing directly on exposed bone.',
    'offers appropriate analgesia and reassesses the patient\u2019s pain score regularly.',
    'supports the limb in the position found without forcing it straight or attempting realignment.',
    'splints the limb, supporting the joints above and below the injury and padding the pressure points.',
    'removes the patient\u2019s rings and watch before swelling increases further.',
    'rechecks pulse, colour, capillary refill, movement and sensation after splinting.',
    'stays alert for signs of compartment syndrome, including pain out of proportion to the injury.',
    'documents the mechanism of injury, their findings and the treatment I\u2019ve given.',
    'applies padding to the wrist and moulds a below-elbow plaster cast, holding the position until it sets.',
    'applies padding and moulds a cast/splint around the hand and wrist, keeping the knuckles slightly flexed.',
    'applies a padded finger splint, or buddy-straps the injured finger to the one beside it for support.',
    'applies padding and a full-length cast from above the elbow to the hand, holding the correct forearm rotation until it sets.',
    'applies padding and a full-length cast from above the knee to the foot, checking the ankle sits at a neutral angle.',
    'applies padding and a below-knee cast, holding the ankle at a neutral right angle while it sets.',
    'applies padding and a below-knee walking cast/boot, keeping the foot in a neutral position.',
    'checks the finished cast fits two fingers comfortably at the top, then elevate the limb and gives the patient cast-care advice.'
  ]
};

let currentFractureTab = 'patterns';
let currentFractureRPMode = 'slash';

function showFractureTab(tab) {
  const validTabs = ['patterns', 'recognition', 'management', 'redflags', 'regions', 'xray'];

  if (!validTabs.includes(tab)) {
    tab = 'patterns';
  }

  currentFractureTab = tab;

  document
    .querySelectorAll('.fracture-panel')
    .forEach(el => {

      const active =
        el.id === `fracture-${tab}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.fxcat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showFractureTab('${tab}')`
        ) ||
        onclick.includes(
          `showFractureTab("${tab}")`
        )
      ) {
        button.classList.add('active');
      }
    });
}

function renderFractureChecklist() {
  const container =
    document.getElementById('fractureChecklist');

  if (!container) return;

  container.innerHTML =
    fractureData.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-fracture-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderFractureQuestions() {
  const container =
    document.getElementById('fractureQuestions');

  if (!container) return;

  container.innerHTML =
    fractureData.questions
      .map(
        (question, index) => `
          <div class="question-row">

            <span>
              ${index + 1}
            </span>

            <p id="fractureQ-${index}">
              ${escapeHtml(question)}
            </p>

            <div class="question-buttons">
              <button
                type="button"
                onclick="copyText('fractureQ-${index}')"
              >
                Copy
              </button>
            </div>

          </div>
        `
      )
      .join('');
}

function setFractureRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentFractureRPMode = mode;

  document
    .querySelectorAll('.frpt')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setFractureRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setFractureRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderFractureRP();
}

function renderFractureRP() {
  const container =
    document.getElementById('fractureRPList');

  if (!container) return;

  const contentKey = 'fracture-rp';
  const rpList = getEditableItems(contentKey, fractureData.rp);

  renderEditableList('fractureRPList', rpList, contentKey, (action, index) => {
    const command =
      currentFractureRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentFractureRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="fractureRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('fractureRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseFractureGuide() {
  currentFractureTab = 'patterns';
  currentFractureRPMode = 'slash';

  showFractureTab('patterns');
  renderFractureChecklist();
  renderFractureQuestions();
  renderFractureRP();
}

/* =========================================================
   RESPIRATORY SECTION — TABS

   Two tabs: Assessment (static, existing content) and
   Airway Management (new comprehensive guide with its own
   checklist + questions + RP library).
========================================================= */

const airwayData = {

  checklist: [
    'Assess airway patency first \u2014 look, listen and feel for breathing and any obstruction.',
    'Try simple positioning first \u2014 head-tilt/chin-lift, or jaw thrust if trauma is suspected.',
    'Suction visible secretions, blood or vomit before proceeding further.',
    'Insert a basic adjunct (OPA or NPA) if positioning alone isn\u2019t sufficient, choosing the correct size for the patient.',
    'Step up to a supraglottic airway (i-gel/LMA) if a basic adjunct isn\u2019t maintaining the airway adequately.',
    'Consider a definitive airway (ETT) if the supraglottic device isn\u2019t adequate, or prolonged ventilatory control is needed.',
    'Confirm correct tube/device placement with capnography and clinical signs.',
    'Reassess regularly \u2014 be ready to step back down the ladder if a simpler option becomes sufficient again.',
    'Document the device used, size and confirmation method.'
  ],

  questions: [
    'What size adjunct/device has already been tried, and did it work?',
    'Is there any reason to avoid a nasal airway, such as suspected base-of-skull fracture?',
    'Is capnography attached and confirming correct placement?',
    'Who is managing the airway, and who is documenting?'
  ],

  rp: [
    'assesses airway patency, looking, listening and feeling for breathing and any obstruction.',
    'positions the airway using head-tilt/chin-lift, or jaw thrust given the suspected trauma.',
    'suctions visible secretions, blood or vomit from the airway.',
    'selects the correctly sized basic adjunct for the patient and inserts it.',
    'steps up to a supraglottic airway once the basic adjunct isn\u2019t maintaining the airway adequately.',
    'prepares for a definitive airway, as the supraglottic device isn\u2019t proving adequate.',
    'confirms correct device placement with capnography and clinical signs.',
    'reassesses the airway regularly, ready to step back down the ladder if appropriate.',
    'documents the device used, size and confirmation method.'
  ]
};

let currentRespiratoryTab = 'assessment';
let currentAirwayRPMode = 'slash';

function showRespiratoryCategory(tab) {
  const validTabs = ['assessment', 'airway'];

  if (!validTabs.includes(tab)) {
    tab = 'assessment';
  }

  currentRespiratoryTab = tab;

  document
    .querySelectorAll('.respiratory-panel')
    .forEach(el => {

      const active =
        el.id === `respiratory-${tab}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.respcat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showRespiratoryCategory('${tab}')`
        ) ||
        onclick.includes(
          `showRespiratoryCategory("${tab}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  if (tab === 'airway') {
    renderAirwayChecklist();
    renderAirwayQuestions();
    renderAirwayRP();
  }
}

function renderAirwayChecklist() {
  const container =
    document.getElementById('airwayChecklist');

  if (!container) return;

  container.innerHTML =
    airwayData.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-airway-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderAirwayQuestions() {
  const container =
    document.getElementById('airwayQuestions');

  if (!container) return;

  container.innerHTML =
    airwayData.questions
      .map(
        (question, index) => `
          <div class="question-row">

            <span>
              ${index + 1}
            </span>

            <p id="airwayQ-${index}">
              ${escapeHtml(question)}
            </p>

            <div class="question-buttons">
              <button
                type="button"
                onclick="copyText('airwayQ-${index}')"
              >
                Copy
              </button>
            </div>

          </div>
        `
      )
      .join('');
}

function setAirwayRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentAirwayRPMode = mode;

  document
    .querySelectorAll('.arpt')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setAirwayRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setAirwayRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderAirwayRP();
}

function renderAirwayRP() {
  const container =
    document.getElementById('airwayRPList');

  if (!container) return;

  const contentKey = 'airway-rp';
  const rpList = getEditableItems(contentKey, airwayData.rp);

  renderEditableList('airwayRPList', rpList, contentKey, (action, index) => {
    const command =
      currentAirwayRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentAirwayRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="airwayRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('airwayRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseRespiratorySection() {
  currentRespiratoryTab = 'assessment';
  currentAirwayRPMode = 'slash';

  showRespiratoryCategory('assessment');

  /*
    Pre-render the airway checklist/questions/RP even though
    its panel isn\'t visible yet, so it's ready the moment
    someone clicks the Airway Management tab.
  */
  renderAirwayChecklist();
  renderAirwayQuestions();
  renderAirwayRP();
}

/* =========================================================
   PAIN SECTION — TABS

   Three tabs: Scale (interactive slider, moved from
   Observations), Management (the pain ladder), Medication
   (the dose quick-reference table).
========================================================= */

function showPainTab(tab) {
  const validTabs = ['scale', 'management', 'medication'];

  if (!validTabs.includes(tab)) {
    tab = 'scale';
  }

  document
    .querySelectorAll('.pain-panel')
    .forEach(el => {

      const active =
        el.id === `pain-${tab}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.paincat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showPainTab('${tab}')`
        ) ||
        onclick.includes(
          `showPainTab("${tab}")`
        )
      ) {
        button.classList.add('active');
      }
    });
}

function initialisePainSection() {
  showPainTab('scale');
  updatePain();
}

/* =========================================================
   MEDICATIONS — CATEGORY TABS
========================================================= */

function showMedCategory(cat) {
  const validCats = ['painrelief', 'sedation', 'allergies', 'cardiac', 'respiratory', 'emergencies'];

  if (!validCats.includes(cat)) {
    cat = 'painrelief';
  }

  document
    .querySelectorAll('.medcat-panel')
    .forEach(el => {

      const active =
        el.id === `medcat-${cat}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.medcat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showMedCategory('${cat}')`
        ) ||
        onclick.includes(
          `showMedCategory("${cat}")`
        )
      ) {
        button.classList.add('active');
      }
    });
}

/* =========================================================
   TRAUMA SECTION — TOP-LEVEL TABS

   Six tabs: Overview and Fractures are static/self-contained
   (Fractures keeps its own entire nested tab system,
   completely untouched). Head/Chest/Abdominal & Pelvic/
   Spinal share one checklist + questions + RP block, using
   the same pattern as HART/HEMS/Training in Documentation.
========================================================= */

const traumaGuideData = {

  head: {

    checklistTitle:
      'Head injury — assessment',

    checklist: [
      'Ensure scene safety and consider cervical spine precautions given the mechanism.',
      'Perform a primary survey using ABCDE, correcting any airway/breathing/circulation problems first.',
      'Assess and record GCS, noting the eye, verbal and motor components separately.',
      'Check pupils for size, equality and reaction to light.',
      'Look for signs of skull fracture — Battle\u2019s sign, panda eyes, CSF leak from the nose/ear, haemotympanum.',
      'Ask about loss of consciousness, amnesia, vomiting, seizure activity and anticoagulant use.',
      'Monitor the GCS trend closely and escalate urgently for any deterioration.',
      'Maintain cervical spine precautions until they\u2019ve been appropriately cleared.',
      'Document the mechanism, initial and repeat GCS, and examination findings.'
    ],

    questions: [
      'Can you tell me what happened?',
      'Did you lose consciousness, and if so for how long?',
      'Do you remember what happened just before or after the injury?',
      'Have you vomited since the injury?',
      'Have you had any seizures?',
      'Do you take any blood-thinning medication?',
      'Do you have a headache, and how severe is it?'
    ],

    rp: [
      'ensures the scene is safe and considers cervical spine precautions given the mechanism.',
      'performs a primary survey and corrects any airway, breathing or circulation problems first.',
      'assesses and records the patient\u2019s GCS, noting the eye, verbal and motor components separately.',
      'checks the patient\u2019s pupils for size, equality and reaction to light.',
      'looks for signs of a skull fracture, including bruising behind the ear or around the eyes and any fluid leaking from the nose or ear.',
      'asks about loss of consciousness, memory loss, vomiting, seizures and anticoagulant use.',
      'monitors the patient\u2019s GCS trend closely and escalates urgently for any deterioration.',
      'maintains cervical spine precautions until they\u2019ve been appropriately cleared.',
      'documents the mechanism, initial and repeats GCS, and their examination findings.'
  ]
  },

  chest: {

    checklistTitle:
      'Chest injury — assessment',

    checklist: [
      'Ensure scene safety and perform a primary survey using ABCDE.',
      'Expose the chest fully and look for wounds, bruising, asymmetry or paradoxical movement.',
      'Listen for breath sounds on both sides and assess respiratory rate and effort.',
      'Look for tracheal deviation, distended neck veins or surgical emphysema.',
      'Cover any open chest wound with a dressing sealed on three sides.',
      'Support a flail segment gently without strapping it rigidly.',
      'Give oxygen if hypoxic and monitor SpO\u2082 continuously.',
      'Reassess breathing regularly and escalate urgently for any deterioration or suspected tension pneumothorax.',
      'Document findings, interventions and the patient\u2019s response.'
    ],

    questions: [
      'Can you tell me what happened?',
      'Where does it hurt, and does it hurt more when you breathe in?',
      'Are you finding it hard to breathe?',
      'Do you have any pain in the tip of your shoulder?',
      'Do you have any past chest or lung conditions?'
    ],

    rp: [
      'ensures the scene is safe and performs a primary survey using ABCDE.',
      'exposes the patient\u2019s chest fully and looks for wounds, bruising, asymmetry or paradoxical movement.',
      'listens for breath sounds on both sides and assesses the patient\u2019s respiratory rate and effort.',
      'checks for tracheal deviation, distended neck veins or surgical emphysema.',
      'covers the open chest wound with a dressing sealed on three sides.',
      'gently supports the flail segment without strapping it rigidly.',
      'gives oxygen and continuously monitors the patient\u2019s oxygen saturation.',
      'reassesses the patient\u2019s breathing regularly and escalates urgently for any deterioration.',
      'documents their findings, the interventions given and the patient\u2019s response.'
  ]
  },

  abdopelvic: {

    checklistTitle:
      'Abdominal & pelvic trauma — assessment',

    checklist: [
      'Ensure scene safety and perform a primary survey using ABCDE.',
      'Expose the abdomen and pelvis fully, looking for bruising, wounds, distension or seatbelt marks.',
      'Gently palpate the abdomen for tenderness, guarding or rigidity, without excessive repeated examination.',
      'Avoid repeatedly springing or manipulating the pelvis if a pelvic fracture is suspected.',
      'Apply a pelvic binder at the level of the greater trochanters if indicated and trained to do so.',
      'Assess for blood at the urethral meatus or a leg length discrepancy.',
      'Monitor for signs of shock, as abdominal/pelvic bleeding can be substantial and concealed.',
      'Reassess regularly, as findings can evolve even when the initial exam looks reassuring.',
      'Document findings, interventions and the patient\u2019s response.'
    ],

    questions: [
      'Can you tell me what happened?',
      'Where is your pain, and how severe is it?',
      'Were you wearing a seatbelt?',
      'Do you feel any pain in your hips or pelvis?',
      'Have you passed urine since the injury, and was there any blood?',
      'Do you feel dizzy, faint or unusually thirsty?'
    ],

    rp: [
      'ensures the scene is safe and performs a primary survey using ABCDE.',
      'exposes the abdomen and pelvis fully, looking for bruising, wounds, distension or seatbelt marks.',
      'gently palpates the abdomen for tenderness, guarding or rigidity.',
      'avoids springing or manipulating the pelvis, given the suspected pelvic fracture.',
      'applies a pelvic binder at the level of the greater trochanters.',
      'assesses for blood at the urethral meatus and checks for any leg length discrepancy.',
      'monitors closely for signs of shock, given the risk of concealed bleeding.',
      'reassesses the patient regularly, as abdominal findings can evolve over time.',
      'documents their findings, the interventions given and the patient\u2019s response.'
  ]
  },

  spinal: {

    checklistTitle:
      'Spinal injury — assessment',

    checklist: [
      'Ensure scene safety and consider spinal precautions immediately given the mechanism.',
      'Perform a primary survey using ABCDE, maintaining spinal alignment throughout.',
      'Assess for spinal tenderness, deformity or a step noted on gentle palpation.',
      'Assess for any neurological symptoms \u2014 weakness, numbness, tingling or loss of bladder/bowel control.',
      'Maintain manual in-line stabilisation of the head and neck until an appropriate device is applied.',
      'Use a coordinated log roll with a team to examine the back and move the patient safely.',
      'Avoid unnecessary movement or repeated examination once spinal injury is suspected.',
      'Reassess neurological status regularly and escalate urgently for any deterioration.',
      'Document the mechanism, examination findings and neurological status before and after any movement.'
    ],

    questions: [
      'Can you tell me what happened?',
      'Do you have any pain in your neck or back?',
      'Do you feel any numbness, tingling or weakness anywhere?',
      'Can you move your hands and feet for me?',
      'Have you lost control of your bladder or bowels since the injury?'
    ],

    rp: [
      'ensures the scene is safe and applies spinal precautions immediately given the mechanism.',
      'performs a primary survey while maintaining spinal alignment throughout.',
      'assesses for spinal tenderness, deformity or a step on gentle palpation.',
      'assesses for any weakness, numbness, tingling or loss of bladder or bowel control.',
      'maintains manual in-line stabilisation of the head and neck until an appropriate device is applied.',
      'coordinates a log roll with their team to examine the patient\u2019s back safely.',
      'avoids unnecessary movement now that spinal injury is suspected.',
      'reassesses the patient\u2019s neurological status regularly and escalates urgently for any deterioration.',
      'documents the mechanism, their findings and the neurological status before and after any movement.'
  ]
  },

  dislocations: {

    checklistTitle:
      'Joint dislocation — assessment',

    checklist: [
      'Ensure the scene is safe and perform a primary survey using ABCDE.',
      'Expose and compare the joint with the uninjured side, looking for deformity and swelling.',
      'Assess and document distal circulation, sensation and movement before any treatment.',
      'Offer appropriate analgesia and reassess the pain score regularly.',
      'Support the joint in the position found, without attempting reduction outside your scope or training.',
      'Splint/immobilise the joint in the most comfortable position for transport if reduction isn\u2019t being attempted.',
      'Recheck distal circulation, sensation and movement after any splinting or reduction attempt.',
      'Stay alert for signs of associated nerve or vessel injury, particularly with shoulder, elbow, hip or knee dislocations.',
      'Document the mechanism, joint involved, findings and any treatment given.'
    ],

    questions: [
      'Can you tell me exactly what happened?',
      'Have you dislocated this joint before?',
      'Can you feel me touching your fingers/toes normally?',
      'Can you move your fingers/toes for me?',
      'Where does it hurt the most?',
      'Do you have any allergies to pain relief medication?'
    ],

    rp: [
      'confirms the scene is safe and performs a primary survey using ABCDE.',
      'exposes and compares the joint with the uninjured side, looking for deformity and swelling.',
      'assesses and documents distal circulation, sensation and movement before any treatment.',
      'offers appropriate analgesia and reassesses the patient\u2019s pain score regularly.',
      'supports the joint in the position found, without attempting reduction outside their scope.',
      'splints the joint in the most comfortable position for transport.',
      'rechecks distal circulation, sensation and movement after splinting.',
      'stays alert for signs of associated nerve or vessel injury.',
      'documents the mechanism, joint involved, findings and treatment given.'
    ]
  }
};

let currentTraumaTab = 'overview';
let currentTraumaGuideRPMode = 'slash';

const TRAUMA_GUIDE_TABS = ['head', 'chest', 'abdopelvic', 'spinal', 'dislocations'];

function showTraumaTab(tab) {
  const validTabs = ['overview', 'head', 'chest', 'abdopelvic', 'spinal', 'dislocations', 'fractures'];

  if (!validTabs.includes(tab)) {
    tab = 'overview';
  }

  currentTraumaTab = tab;

  document
    .querySelectorAll('.trauma-panel')
    .forEach(el => {

      const active =
        el.id === `trauma-${tab}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.traumacat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showTraumaTab('${tab}')`
        ) ||
        onclick.includes(
          `showTraumaTab("${tab}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  const guideBlock =
    document.getElementById('traumaGuideBlock');

  const showGuideBlock =
    TRAUMA_GUIDE_TABS.includes(tab);

  if (guideBlock) {
    guideBlock.style.display =
      showGuideBlock ? '' : 'none';
  }

  if (showGuideBlock) {
    renderTraumaGuideChecklist();
    renderTraumaGuideQuestions();
    renderTraumaGuideRP();
  }
}

function renderTraumaGuideChecklist() {
  const container =
    document.getElementById('traumaGuideChecklist');

  const titleEl =
    document.getElementById('traumaGuideChecklistTitle');

  if (!container) return;

  const guide =
    traumaGuideData[currentTraumaTab];

  if (!guide) {
    container.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      guide.checklistTitle || 'Guide';
  }

  container.innerHTML =
    guide.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-trauma-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function renderTraumaGuideQuestions() {
  const container =
    document.getElementById('traumaGuideQuestions');

  if (!container) return;

  const guide =
    traumaGuideData[currentTraumaTab];

  if (!guide) {
    container.innerHTML = '';
    return;
  }


  const rpList = guide["rp_" + currentContext] || guide.rp;
  container.innerHTML =
    guide.questions
      .map(
        (question, index) => `
          <div class="question-row">

            <span>
              ${index + 1}
            </span>

            <p id="traumaGuideQ-${index}">
              ${escapeHtml(question)}
            </p>

            <div class="question-buttons">
              <button
                type="button"
                onclick="copyText('traumaGuideQ-${index}')"
              >
                Copy
              </button>
            </div>

          </div>
        `
      )
      .join('');
}

function setTraumaGuideRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentTraumaGuideRPMode = mode;

  document
    .querySelectorAll('.trpt')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setTraumaGuideRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setTraumaGuideRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderTraumaGuideRP();
}

function renderTraumaGuideRP() {
  const container =
    document.getElementById('traumaGuideRPList');

  if (!container) return;

  const guide =
    traumaGuideData[currentTraumaTab];

  if (!guide) {
    container.innerHTML = '';
    return;
  }

  const contentKey = 'trauma-rp-' + currentTraumaTab;
  const rpList = getEditableItems(contentKey, guide.rp);

  renderEditableList('traumaGuideRPList', rpList, contentKey, (action, index) => {
    const command =
      currentTraumaGuideRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentTraumaGuideRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="traumaGuideRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('traumaGuideRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseTraumaSection() {
  currentTraumaTab = 'overview';
  currentTraumaGuideRPMode = 'slash';

  showTraumaTab('overview');

  /*
    Pre-render the fracture guide's own nested checklist/
    questions/RP even though its panel isn\'t visible yet, so
    it's ready the moment someone clicks the Fractures tab.
  */
  initialiseFractureGuide();
}

/* =========================================================
   STUDENT PORTAL

   Four tabs: Rules (static HTML, no JS needed), Treatments
   (checklist + RP), Vitals (checklist + RP), Medications
   (static med-cards reusing the existing toggleMed()).
   Independent system — own classes/IDs/functions, same
   pattern as Cardiac/Procedures/Documentation above.
========================================================= */

const studentTreatmentData = {

  checklist: [
    'Ensure the scene is safe before approaching the patient.',
    'Introduce yourself, explain your role as a student paramedic under supervision, and gain consent.',
    'Perform a primary survey — check responsiveness, airway, breathing and circulation.',
    'Call for your supervising paramedic immediately if the patient is unresponsive, has airway/breathing/circulation compromise, or looks seriously unwell.',
    'Control any visible catastrophic bleeding with direct pressure or a dressing.',
    'Position the patient appropriately for their condition — for example, the recovery position if unresponsive but breathing.',
    'Provide oxygen via the appropriate device if indicated and within your scope.',
    'Take a full set of observations and a basic history.',
    'Offer basic pain relief from the student formulary if appropriate and indicated.',
    'Reassess the patient regularly and report any changes to your supervising paramedic.',
    'Hand over to your supervising paramedic or a qualified crew member for anything outside your scope.',
    'Document your findings and actions, and have them countersigned by your supervisor.'
  ],

  rp: [
    'confirms the scene is safe before approaching the patient.',
    'introduces themselves as a student paramedic working under supervision and gains the patient\u2019s consent.',
    'performs a primary survey, checking responsiveness, airway, breathing and circulation.',
    'calls for their supervising paramedic immediately after identifying a seriously unwell or deteriorating patient.',
    'applies direct pressure and a dressing to control visible catastrophic bleeding.',
    'positions the patient appropriately for their condition, using the recovery position where indicated.',
    'administers oxygen via the appropriate device, within their scope of practice.',
    'takes a full set of observations and a basic patient history.',
    'offers paracetamol or ibuprofen from the student formulary for mild to moderate pain, checking for contraindications first.',
    'reassesses the patient regularly and reports any changes to their supervising paramedic.',
    'hands over the patient to their supervising paramedic for anything outside their scope of practice.',
    'documents their findings and actions and has them countersigned by their supervisor.'
  ]
};

const studentVitalsData = {

  checklist: [
    'Introduce yourself to the patient and explain that you\u2019ll be taking their observations.',
    'Count the respiratory rate over a full minute, observing rate, depth and effort.',
    'Attach a pulse oximeter and record the oxygen saturation (SpO\u2082).',
    'Palpate the radial or brachial pulse and record the rate, rhythm and character.',
    'Apply the blood pressure cuff and record a manual or automated blood pressure.',
    'Measure the patient\u2019s temperature using the appropriate device.',
    'Assess the patient\u2019s level of consciousness using AVPU or GCS.',
    'Check the pupils for size, equality and reaction to light if indicated.',
    'Check capillary blood glucose if indicated — for example, altered consciousness or a diabetic history.',
    'Record all observations on the patient care record.',
    'Compare the observations to the normal range and flag any that are abnormal.',
    'Report any abnormal or deteriorating observations to your supervising paramedic immediately.'
  ],

  rp: [
    'introduces themselves to the patient and explains that I\u2019ll be taking their observations.',
    'counts the patient\u2019s respiratory rate over a full minute, noting rate, depth and effort.',
    'attaches a pulse oximeter and records the oxygen saturation.',
    'palpates the patient\u2019s radial pulse and records the rate, rhythm and character.',
    'applies the blood pressure cuff and records the patient\u2019s blood pressure.',
    'measures the patient\u2019s temperature using the appropriate device.',
    'assesses the patient\u2019s level of consciousness using AVPU.',
    'checks the patient\u2019s pupils for size, equality and reaction to light.',
    'checks the patient\u2019s capillary blood glucose where indicated.',
    'records all of the observations on the patient care record.',
    'compares the observations to the normal range and flags anything abnormal.',
    'reports the abnormal observations to their supervising paramedic immediately.'
  ]
};

let currentStudentTab = 'rules';
let currentStudentTreatmentRPMode = 'slash';
let currentStudentVitalsRPMode = 'slash';

function showStudentTab(tab) {
  const validTabs = ['rules', 'treatments', 'vitals', 'medications', 'pathway', 'fto', 'walkthroughs'];

  if (!validTabs.includes(tab)) {
    tab = 'rules';
  }

  currentStudentTab = tab;

  document
    .querySelectorAll('.student-panel')
    .forEach(el => {

      const active =
        el.id === `student-${tab}`;

      el.classList.toggle(
        'active',
        active
      );
    });

  document
    .querySelectorAll('.sptab')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `showStudentTab('${tab}')`
        ) ||
        onclick.includes(
          `showStudentTab("${tab}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  if (tab === 'treatments') {
    renderStudentTreatmentChecklist();
    renderStudentTreatmentRP();
  }

  if (tab === 'vitals') {
    renderStudentVitalsChecklist();
    renderStudentVitalsRP();
  }
}

function renderStudentTreatmentChecklist() {
  const container =
    document.getElementById('studentTreatmentChecklist');

  if (!container) return;

  container.innerHTML =
    studentTreatmentData.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-student-treatment-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function setStudentTreatmentRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentStudentTreatmentRPMode = mode;

  document
    .querySelectorAll('.sprpt-treat')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setStudentTreatmentRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setStudentTreatmentRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderStudentTreatmentRP();
}

function renderStudentTreatmentRP() {
  const container =
    document.getElementById('studentTreatmentRPList');

  if (!container) return;

  const contentKey = 'student-treatment-rp';
  const rpList = getEditableItems(contentKey, studentTreatmentData.rp);

  renderEditableList('studentTreatmentRPList', rpList, contentKey, (action, index) => {
    const command =
      currentStudentTreatmentRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentStudentTreatmentRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="studentTreatmentRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('studentTreatmentRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function renderStudentVitalsChecklist() {
  const container =
    document.getElementById('studentVitalsChecklist');

  if (!container) return;

  container.innerHTML =
    studentVitalsData.checklist
      .map(
        (item, index) => `
          <label class="check-row">

            <input
              type="checkbox"
              data-student-vitals-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

function setStudentVitalsRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentStudentVitalsRPMode = mode;

  document
    .querySelectorAll('.sprpt-vitals')
    .forEach(button => {

      button.classList.remove('active');

      const onclick =
        button.getAttribute('onclick') || '';

      if (
        onclick.includes(
          `setStudentVitalsRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setStudentVitalsRPMode("${mode}")`
        )
      ) {
        button.classList.add('active');
      }
    });

  renderStudentVitalsRP();
}

function renderStudentVitalsRP() {
  const container =
    document.getElementById('studentVitalsRPList');

  if (!container) return;

  const contentKey = 'student-vitals-rp';
  const rpList = getEditableItems(contentKey, studentVitalsData.rp);

  renderEditableList('studentVitalsRPList', rpList, contentKey, (action, index) => {
    const command =
      currentStudentVitalsRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentStudentVitalsRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="studentVitalsRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('studentVitalsRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

function initialiseStudentPortal() {
  currentStudentTab = 'rules';
  currentStudentTreatmentRPMode = 'slash';
  currentStudentVitalsRPMode = 'slash';

  showStudentTab('rules');
}

/* =========================================================
   PATHWAY TO PARAMEDIC — TEACH/SHOW/DO TABLE

   Each row has 3 checkboxes (teach/show/do). Wired once at
   page load since the table is static HTML, not re-rendered.
========================================================= */

function updatePathwayRowStatus(row) {
  if (!row) return;

  const teach = row.querySelector('[data-stage="teach"]');
  const show = row.querySelector('[data-stage="show"]');
  const doStage = row.querySelector('[data-stage="do"]');
  const status = row.querySelector('.pathway-status');

  const complete =
    !!teach?.checked &&
    !!show?.checked &&
    !!doStage?.checked;

  if (status) {
    status.textContent = complete ? '✓ Complete' : '';
    status.classList.toggle('complete', complete);
  }

  row.classList.toggle('pathway-complete', complete);
}

function initialisePathwayTable() {
  document
    .querySelectorAll('#pathwayTableBody input[type="checkbox"]')
    .forEach(checkbox => {

      checkbox.addEventListener('change', () => {
        updatePathwayRowStatus(checkbox.closest('tr'));
      });

    });
}

/* =========================================================
   CURRENT INCIDENT SCENE
========================================================= */

let currentScene = 'rtc';
let currentSceneRPMode = 'slash';

/* =========================================================
   INCIDENT SCENE TABS
========================================================= */

function showScenario(name) {
  if (!sceneData[name]) {
    console.warn(
      `Unknown scene: ${name}`
    );

    return;
  }

  currentScene = name;

  document
    .querySelectorAll('.scenario')
    .forEach(el => {

      const active =
        el.id === `scenario-${name}`;

      el.classList.toggle(
        'active',
        active
      );

      /*
        Some versions of the CSS only use
        display rather than .active, so this
        makes the scene switch work either way.
      */

      el.style.display =
        active ? '' : 'none';
    });

  const sceneButtons =
    document.querySelectorAll('.scen');

  sceneButtons.forEach(button => {
    button.classList.remove('active');

    const onclick =
      button.getAttribute('onclick') || '';

    const dataScene =
      button.dataset.scene || '';

    if (
      dataScene === name ||
      onclick.includes(
        `showScenario('${name}')`
      ) ||
      onclick.includes(
        `showScenario("${name}")`
      )
    ) {
      button.classList.add('active');
    }
  });

  renderSceneSlides();
  renderSceneChecklist();
  renderSceneQuestions();
  renderSceneRP();
}

/* =========================================================
   SCENE CHECKLIST
========================================================= */

function renderSceneChecklist() {
  const container =
    document.getElementById(
      'sceneChecklist'
    );

  if (!container) return;

  const scene =
    sceneData[currentScene];

  if (
    !scene ||
    !Array.isArray(scene.checklist)
  ) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML =
    scene.checklist
      .map(
        (item, index) => `
          <label class="scene-check-item">

            <input
              type="checkbox"
              data-scene-check="${index}"
            >

            <span>
              ${escapeHtml(item)}
            </span>

          </label>
        `
      )
      .join('');
}

/* =========================================================
   RICH TEXT EDITOR (Google Docs-style)
   Used in Docs, Slides, and Handbook document sections
========================================================= */

let activeEditors = {};
let editorSaveTimers = {};

function initRichEditor(editorId, saveEndpoint) {
  const editor = document.getElementById(editorId);
  if (!editor) return;

  const toolbar = editor.parentElement.querySelector('.editor-toolbar');
  if (!toolbar) return;

  activeEditors[editorId] = { editor, saveEndpoint };
  
  /* Load saved content */
  const saved = localStorage.getItem(`editor_${editorId}`);
  if (saved) {
    editor.innerHTML = saved;
  }

  /* Toolbar buttons */
  toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.value || null;
      document.execCommand(cmd, false, val);
      editor.focus();
    });
  });

  /* Auto-save on input */
  editor.addEventListener('input', () => {
    clearTimeout(editorSaveTimers[editorId]);
    editorSaveTimers[editorId] = setTimeout(() => {
      saveEditorContent(editorId);
    }, 1000);
  });

  /* Save immediately when leaving */
  editor.addEventListener('blur', () => {
    saveEditorContent(editorId);
  });
  
  /* Heading shortcuts */
  toolbar.querySelectorAll('[data-block]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const block = btn.dataset.block;
      document.execCommand('formatBlock', false, block);
      editor.focus();
    });
  });
}

function saveEditorContent(editorId) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  
  const content = editor.innerHTML;
  localStorage.setItem(`editor_${editorId}`, content);
  
  const config = activeEditors[editorId];
  if (config && config.saveEndpoint) {
    try {
      api(config.saveEndpoint, {
        method: 'PUT',
        body: { content }
      }).catch(() => {});
    } catch (_) {}
  }
}

function loadEditorContent(editorId, content) {
  const editor = document.getElementById(editorId);
  if (!editor || !content) return;
  editor.innerHTML = content;
  localStorage.setItem(`editor_${editorId}`, content);
}

/* Insert image into editor at cursor position */
function insertImageToEditor(editorId, url) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  editor.focus();
  document.execCommand('insertImage', false, url);
  saveEditorContent(editorId);
}

/* Insert table into editor */
function insertTableToEditor(editorId) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  editor.focus();
  const table = '<table border="1" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table>';
  document.execCommand('insertHTML', false, table);
  saveEditorContent(editorId);
}


function clearHandbook() {
  if (!confirm('Clear the entire handbook? This cannot be undone.')) return;
  const editor = document.getElementById('handbook-editor');
  if (editor) {
    editor.innerHTML = '';
    saveEditorContent('handbook-editor');
  }
}

window.clearHandbook = clearHandbook;


/* =========================================================
   ADMIN EDIT MODE — inline editing for RP actions
========================================================= */

let editMode = false;

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('editModeToggle');
  if (btn) {
    btn.textContent = editMode ? ' Editing ON' : ' Edit Mode';
    btn.classList.toggle('active', editMode);
  }
  const active = document.querySelector('.section.active');
  if (active) {
    const id = active.id;
        if (id === 'scenes') { renderSceneSlides(); renderSceneRP(); }

    if (id === 'procedures') { renderProcedureSlides(); renderProcedureRP(); }

    if (id === 'documentation') renderDocRP();
    if (id === 'cardiac') renderCardiacRP();
    if (id === 'trauma') { renderFractureRP(); renderTraumaGuideRP(); }
    if (id === 'respiratory') renderAirwayRP();
    if (id === 'staff') { renderStudentTreatmentRP(); renderStudentVitalsRP(); }
  }
}

async function saveEditableContent(key, content) {
  try {
    await api('/api/content/' + encodeURIComponent(key), { method: 'PUT', body: { content } });
    return true;
  } catch (_) { return false; }
}

window._editCache = window._editCache || {};
window._editContentLoaded = window._editContentLoaded || {};

/*
  Returns the current items for a content key synchronously
  (from cache, or the hardcoded default on first call), and
  kicks off a background fetch to check for server-saved
  edits — if found, updates the cache and re-renders whatever
  section is currently visible. This avoids making every
  render*RP() function async.
*/
function getEditableItems(contentKey, defaultItems) {
  if (!window._editCache[contentKey]) {
    window._editCache[contentKey] = (defaultItems || []).slice();
  }

  if (!window._editContentLoaded[contentKey]) {
    window._editContentLoaded[contentKey] = true;
    loadEditableItemsFromServer(contentKey);
  }

  return window._editCache[contentKey];
}

async function loadEditableItemsFromServer(contentKey) {
  try {
    const result = await api('/api/content/' + encodeURIComponent(contentKey));
    if (result && Array.isArray(result.content) && result.content.length > 0) {
      window._editCache[contentKey] = result.content;
      triggerReRender();
    }
  } catch (_) {
    /* no saved content yet — keep using the default already cached */
  }
}

let _dragSourceIndex = null;
let _dragContentKey = null;

function handleDragStart(e) {
  const wrap = e.currentTarget;
  _dragSourceIndex = parseInt(wrap.dataset.index, 10);
  _dragContentKey = wrap.dataset.contentKey;
  wrap.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  const wrap = e.currentTarget;
  if (wrap.dataset.contentKey !== _dragContentKey) return;
  wrap.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  const wrap = e.currentTarget;
  wrap.classList.remove('drag-over');
  if (wrap.dataset.contentKey !== _dragContentKey) return;
  const targetIndex = parseInt(wrap.dataset.index, 10);
  if (_dragSourceIndex === null || targetIndex === _dragSourceIndex) return;
  reorderEditItem(_dragContentKey, _dragSourceIndex, targetIndex);
}

function handleDragEnd() {
  document.querySelectorAll('.edit-item-wrap.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.edit-item-wrap.drag-over').forEach(el => el.classList.remove('drag-over'));
  _dragSourceIndex = null;
  _dragContentKey = null;
}

function reorderEditItem(contentKey, fromIndex, toIndex) {
  const items = window._editCache && window._editCache[contentKey];
  if (!items) return;
  const moved = items.splice(fromIndex, 1)[0];
  items.splice(toIndex, 0, moved);
  window._editCache[contentKey] = items;
  saveEditableContent(contentKey, items);
  triggerReRender();
}

function renderEditableList(containerId, items, contentKey, renderItem) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:12px">No items yet.</p>';
    if (editMode) {
      const addBtn = document.createElement('div');
      addBtn.className = 'edit-add-wrap';
      addBtn.innerHTML = '<button type="button" class="secondary" onclick="addEditItem(\'' + contentKey + '\')">+ Add Item</button>';
      container.appendChild(addBtn);
    }
    return;
  }
  container.innerHTML = items.map(function(item, i) {
    var html = renderItem(item, i);
    if (editMode) {
      return '<div class="edit-item-wrap" draggable="true" data-index="' + i + '" data-content-key="' + contentKey + '" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)" ondragend="handleDragEnd()">' +
        '<div class="edit-item-controls">' +
        '<span class="edit-drag-handle" title="Drag to reorder">\u22ee\u22ee</span>' +
        '<button type="button" class="edit-item-btn" onclick="moveEditItem(\'' + contentKey + '\',' + i + ',-1)" title="Move up">\u2191</button>' +
        '<button type="button" class="edit-item-btn" onclick="moveEditItem(\'' + contentKey + '\',' + i + ',1)" title="Move down">\u2193</button>' +
        '<button type="button" class="edit-item-btn danger-item" onclick="removeEditItem(\'' + contentKey + '\',' + i + ')" title="Remove">\u2715</button>' +
        '</div><div class="edit-item-content" onclick="editItemInline(\'' + contentKey + '\',' + i + ')">' +
        html + '</div></div>';
    }
    return html;
  }).join('');
  if (editMode) {
    var addBtn = document.createElement('div');
    addBtn.className = 'edit-add-wrap';
    addBtn.innerHTML = '<button type="button" class="secondary" onclick="addEditItem(\'' + contentKey + '\')">+ Add Item</button>';
    container.appendChild(addBtn);
  }
}

function moveEditItem(contentKey, index, direction) {
  var newIndex = index + direction;
  if (newIndex < 0) return;
  var items = window._editCache && window._editCache[contentKey];
  if (!items || newIndex >= items.length) return;
  var tmp = items[index]; items[index] = items[newIndex]; items[newIndex] = tmp;
  window._editCache[contentKey] = items;
  saveEditableContent(contentKey, items);
  triggerReRender();
}

function removeEditItem(contentKey, index) {
  var items = window._editCache && window._editCache[contentKey];
  if (!items) return;
  items.splice(index, 1);
  window._editCache[contentKey] = items;
  saveEditableContent(contentKey, items);
  triggerReRender();
}

function addEditItem(contentKey) {
  var text = prompt('Enter the new item text:');
  if (!text || !text.trim()) return;
  var items = window._editCache && window._editCache[contentKey];
  if (!items) return;
  items.push(text.trim());
  window._editCache[contentKey] = items;
  saveEditableContent(contentKey, items);
  triggerReRender();
}

function editItemInline(contentKey, index) {
  if (!editMode) return;
  var items = window._editCache && window._editCache[contentKey];
  if (!items) return;
  var newText = prompt('Edit item:', items[index]);
  if (newText && newText.trim() && newText.trim() !== items[index]) {
    items[index] = newText.trim();
    window._editCache[contentKey] = items;
    saveEditableContent(contentKey, items);
    triggerReRender();
  }
}

function triggerReRender() {
  var active = document.querySelector('.section.active');
  if (active) {
    var id = active.id;
        if (id === 'scenes') { renderSceneSlides(); renderSceneRP(); }

    if (id === 'procedures') { renderProcedureSlides(); renderProcedureRP(); }

    if (id === 'documentation') renderDocRP();
    if (id === 'cardiac') renderCardiacRP();
    if (id === 'trauma') { renderFractureRP(); renderTraumaGuideRP(); }
    if (id === 'respiratory') renderAirwayRP();
    if (id === 'staff') { renderStudentTreatmentRP(); renderStudentVitalsRP(); }
  }
}

window.toggleEditMode = toggleEditMode;
window.moveEditItem = moveEditItem;
window.removeEditItem = removeEditItem;
window.addEditItem = addEditItem;
window.editItemInline = editItemInline;
window.saveEditableContent = saveEditableContent;
window.getEditableItems = getEditableItems;
window.loadEditableItemsFromServer = loadEditableItemsFromServer;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;
window.reorderEditItem = reorderEditItem;


/* =========================================================
   RP ACTION BUILDER SYSTEM
========================================================= */

let userRpActions = [];
let userTtsActions = [];
let userRpFavourites = [];
let userRpFavouritesRowId = null;
let userRpCategories = [];
const RP_STORAGE_KEY = 'uhs_rp_actions';
const TTS_STORAGE_KEY = 'uhs_tts_actions';
const RP_FAV_KEY = 'uhs_rp_favs';

/* Toast notification system */
function showToast(message, type) {
  type = type || 'success';
  var container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  var icons = { success: '\u2713\uFE0F', error: '\u2716\uFE0F', info: '\u2139\uFE0F' };
  toast.innerHTML = (icons[type] || '') + ' ' + message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toastOut .3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
}

/* Load user RP actions from the server. Favourites are stored as a
   single server-side row (data.ids = array of favourited action ids);
   userRpFavouritesRowId tracks that row so toggleFavourite() knows
   whether to PUT (row exists) or POST (first favourite ever). */
async function loadUserRpActions() {
  userRpActions = [];
  if (!currentUser) return;
  try {
    var result = await api('/api/user-content/rp_action');
    userRpActions = (result && Array.isArray(result.items))
      ? result.items.map(function(item) {
          return Object.assign({}, item.data, { _serverId: item.id });
        })
      : [];
  } catch (e) {
    userRpActions = [];
  }
  try {
    var favResult = await api('/api/user-content/rp_favourite');
    if (favResult && Array.isArray(favResult.items) && favResult.items.length > 0) {
      userRpFavourites = favResult.items[0].data.ids || [];
      userRpFavouritesRowId = favResult.items[0].id;
    } else {
      userRpFavourites = [];
      userRpFavouritesRowId = null;
    }
  } catch (e) {
    userRpFavourites = [];
    userRpFavouritesRowId = null;
  }
  if (!currentUser) { userRpCategories = []; return; }
  try {
    var cats = JSON.parse(localStorage.getItem('uhs_rp_cats') || '[]');
    userRpCategories = cats;
  } catch(e) { userRpCategories = []; }
}

/* Load TTS actions from the server */
async function loadUserTtsActions() {
  userTtsActions = [];
  if (!currentUser) return;
  try {
    var result = await api('/api/user-content/tts_action');
    userTtsActions = (result && Array.isArray(result.items))
      ? result.items.map(function(item) {
          return Object.assign({}, item.data, { _serverId: item.id });
        })
      : [];
  } catch (e) {
    userTtsActions = [];
  }
}

/* Open the Add RP Action modal */
function openAddRpAction() {
  var modal = document.getElementById('rpActionModal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('rpActionName').value = '';
  document.getElementById('rpActionCommand').value = '';
  document.getElementById('rpActionEmote').value = '';
  document.getElementById('rpActionLocation').value = 'standing';
  document.getElementById('rpActionCategory').value = '';
  document.getElementById('rpActionDesc').value = '';
  document.getElementById('rpActionTags').value = '';
  document.getElementById('rpActionModalTitle').textContent = 'Add /me Action';
  document.getElementById('rpActionSaveBtn').onclick = function() { saveRpAction(null); };
  document.getElementById('rpActionName').focus();
}

/* Save an RP action (new or edit) — now persists to the server */
async function saveRpAction(editIndex) {
  var name = document.getElementById('rpActionName').value.trim();
  var command = document.getElementById('rpActionCommand').value.trim();
  var emote = document.getElementById('rpActionEmote').value.trim();
  var location = document.getElementById('rpActionLocation').value;
  var category = document.getElementById('rpActionCategory').value.trim();
  var desc = document.getElementById('rpActionDesc').value.trim();
  var tags = document.getElementById('rpActionTags').value.trim();

  if (!name || !command) {
    showToast('Name and command are required', 'error');
    return;
  }

  var isEdit = editIndex !== null;
  var existing = isEdit ? userRpActions[editIndex] : null;

  var actionData = {
    id: (existing && existing.id) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    name: name,
    command: command,
    emote: emote,
    location: location || 'standing',
    category: category || 'General',
    description: desc,
    tags: tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean),
    isDefault: false,
    isFavourite: false,
    createdAt: (existing && existing.createdAt) || new Date().toISOString()
  };

  try {
    if (isEdit && existing && existing._serverId) {
      var updateResult = await api('/api/user-content/rp_action/' + existing._serverId, {
        method: 'PUT',
        body: { data: actionData }
      });
      userRpActions[editIndex] = Object.assign({}, updateResult.item.data, { _serverId: updateResult.item.id });
      showToast('Action updated', 'success');
    } else {
      var createResult = await api('/api/user-content/rp_action', {
        method: 'POST',
        body: { data: actionData }
      });
      userRpActions.push(Object.assign({}, createResult.item.data, { _serverId: createResult.item.id }));
      showToast('Action added', 'success');
    }
  } catch (e) {
    showToast('Failed to save action', 'error');
    return;
  }

  closeModal('rpActionModal');
  renderUserRpActions();
  renderDashboardRpActions();
}

/* Edit an RP action — unchanged, just opens the modal with existing values */
function editRpAction(index) {
  var action = userRpActions[index];
  if (!action) return;
  var modal = document.getElementById('rpActionModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('rpActionName').value = action.name || '';
  document.getElementById('rpActionCommand').value = action.command || '';
  document.getElementById('rpActionEmote').value = action.emote || '';
  document.getElementById('rpActionLocation').value = action.location || 'standing';
  document.getElementById('rpActionCategory').value = action.category || '';
  document.getElementById('rpActionDesc').value = action.description || '';
  document.getElementById('rpActionTags').value = (action.tags || []).join(', ');
  document.getElementById('rpActionModalTitle').textContent = 'Edit /me Action';
  document.getElementById('rpActionSaveBtn').onclick = function() { saveRpAction(index); };
}

/* Delete an RP action — now deletes from the server */
async function deleteRpAction(index) {
  if (!confirm('Delete this RP action?')) return;
  var action = userRpActions[index];
  if (!action) return;
  try {
    if (action._serverId) {
      await api('/api/user-content/rp_action/' + action._serverId, { method: 'DELETE' });
    }
  } catch (e) {
    showToast('Failed to delete action', 'error');
    return;
  }
  userRpActions.splice(index, 1);
  renderUserRpActions();
  renderDashboardRpActions();
  showToast('Action deleted', 'info');
}

/* Duplicate an RP action — now creates a new row on the server */
async function duplicateRpAction(index) {
  var original = userRpActions[index];
  if (!original) return;
  var copy = JSON.parse(JSON.stringify(original));
  delete copy._serverId;
  copy.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  copy.name = copy.name + ' (Copy)';
  copy.createdAt = new Date().toISOString();
  try {
    var result = await api('/api/user-content/rp_action', {
      method: 'POST',
      body: { data: copy }
    });
    userRpActions.push(Object.assign({}, result.item.data, { _serverId: result.item.id }));
    renderUserRpActions();
    showToast('Action duplicated', 'success');
  } catch (e) {
    showToast('Failed to duplicate action', 'error');
  }
}

/* Toggle favourite — unchanged for now, stays on localStorage
   (favourites/categories migration is a separate follow-up) */
async function toggleFavourite(id) {
  var idx = userRpFavourites.indexOf(id);
  if (idx >= 0) {
    userRpFavourites.splice(idx, 1);
  } else {
    userRpFavourites.push(id);
  }
  try {
    if (userRpFavouritesRowId) {
      await api('/api/user-content/rp_favourite/' + userRpFavouritesRowId, {
        method: 'PUT',
        body: { data: { ids: userRpFavourites } }
      });
    } else {
      var result = await api('/api/user-content/rp_favourite', {
        method: 'POST',
        body: { data: { ids: userRpFavourites } }
      });
      userRpFavouritesRowId = result.item.id;
    }
  } catch (e) {
    showToast('Failed to save favourite', 'error');
  }
  renderUserRpActions();
  renderDashboardRpActions();
}

/* Move action up/down — now persists the new order to the server */
async function moveRpAction(index, direction) {
  var newIndex = index + direction;
  if (newIndex < 0 || newIndex >= userRpActions.length) return;
  var tmp = userRpActions[index];
  userRpActions[index] = userRpActions[newIndex];
  userRpActions[newIndex] = tmp;
  renderUserRpActions();
  try {
    await api('/api/user-content/rp_action/reorder', {
      method: 'PUT',
      body: { order: userRpActions.map(function(a) { return a._serverId; }).filter(Boolean) }
    });
  } catch (e) {
    showToast('Failed to save new order', 'error');
  }
}

/* Render user RP actions */
async function renderUserRpActions() {
  var container = document.getElementById('userRpActionsList');
  if (!container) return;
  await loadUserRpActions();
  var searchInput = document.getElementById('rpLibrarySearch');
  var query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  if (userRpActions.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCDD</div><h3>No custom RP actions yet</h3><p>Click "+ Add /me" to create your first action.</p></div>';
    return;
  }
  var html = '';
  var categories = {};
  userRpActions.forEach(function(a, i) {
    if (query && (a.name || '').toLowerCase().indexOf(query) < 0 && (a.command || '').toLowerCase().indexOf(query) < 0 && (a.category || '').toLowerCase().indexOf(query) < 0) {
      return;
    }
    var cat = a.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ action: a, index: i });
  });
  var totalFiltered = 0;
  for (var k in categories) { totalFiltered += categories[k].length; }
  if (totalFiltered === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDD0D</div><h3>No matching actions</h3><p>Try a different search term.</p></div>';
    return;
  }
  Object.keys(categories).sort().forEach(function(cat) {
    html += '<div class="rp-category-header"><h3>' + escapeHtml(cat) + '</h3><span>' + categories[cat].length + ' actions</span></div>';
    categories[cat].forEach(function(item) {
      var a = item.action;
      var i = item.index;
      var isFav = userRpFavourites.indexOf(a.id) >= 0;
      var locClass = a.location || 'standing';
      html += '<div class="rp-card" data-index="' + i + '">';
      html += '<div class="rp-card-header">';
      html += '<div class="rp-card-title">';
      html += '<span class="drag-handle" onmousedown="event.preventDefault()">\u2630</span>';
      html += '<span>' + escapeHtml(a.name) + '</span>';
      html += '</div>';
      html += '<div class="rp-card-meta">';
      html += '<span class="location-badge ' + locClass + '">\uD83D\uDCCD ' + a.location + '</span>';
      if (a.emote) html += '<span>\uD83C\uDFAD /e ' + escapeHtml(a.emote) + '</span>';
      html += '</div>';
      html += '</div>';
      html += '<div class="rp-card-body">/me ' + escapeHtml(a.command) + '</div>';
      html += '<div class="rp-card-actions">';
      html += '<button class="primary" onclick="copyTextInline(\'/me ' + escapeHtml(a.command) + '\')">Copy /me</button>';
      if (a.emote) html += '<button class="secondary" onclick="copyTextInline(\'/e ' + escapeHtml(a.emote) + '\')">Copy /e</button>';
      html += '<button class="secondary" onclick="editRpAction(' + i + ')">Edit</button>';
      html += '<button class="secondary" onclick="duplicateRpAction(' + i + ')">Duplicate</button>';
      html += '<button class="secondary" onclick="moveRpAction(' + i + ',' + (-1) + ')">\u25B2</button>';
      html += '<button class="secondary" onclick="moveRpAction(' + i + ',1)">\u25BC</button>';
      html += '<button class="fav-btn ' + (isFav ? 'active' : '') + '" onclick="toggleFavourite(\'' + a.id + '\')">' + (isFav ? '\u2605' : '\u2606') + '</button>';
      html += '<button class="danger-small" onclick="deleteRpAction(' + i + ')">\u2716</button>';
      html += '</div></div>';
    });
  });
  container.innerHTML = html;
}
/* Render TTS actions */
async function renderUserTtsActions() {
  var container = document.getElementById('userTtsActionsList');
  if (!container) return;
  await loadUserTtsActions();
  var searchInput = document.getElementById('rpTtsSearch');
  var query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  if (userTtsActions.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCE3</div><h3>No /tts questions yet</h3><p>Click "+ Add /tts" to create your first question.</p></div>';
    return;
  }
  var html = '';
  userTtsActions.forEach(function(a, i) {
    if (query && (a.name || '').toLowerCase().indexOf(query) < 0 && (a.command || '').toLowerCase().indexOf(query) < 0) {
      return;
    }
    html += '<div class="tts-card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">';
    html += '<strong>' + escapeHtml(a.name) + '</strong>';
    html += '<span style="font-size:11px;color:#7a95a3">' + (a.category || 'General') + '</span>';
    html += '</div>';
    html += '<div class="tts-command">/tts ' + escapeHtml(a.command) + '</div>';
    html += '<div class="rp-card-actions" style="border:0;padding:6px 0 0;background:transparent">';
    html += '<button class="primary" onclick="copyTextInline(\'/tts ' + escapeHtml(a.command) + '\')">Copy /tts</button>';
    html += '<button class="secondary" onclick="editTtsAction(' + i + ')">Edit</button>';
    html += '<button class="secondary" onclick="duplicateTtsAction(' + i + ')">Duplicate</button>';
    html += '<button class="danger-small" onclick="deleteTtsAction(' + i + ')">\u2716</button>';
    html += '</div></div>';
  });
  container.innerHTML = html;
}
/* TTS CRUD */
function openAddTtsAction() {
  var modal = document.getElementById('ttsModal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('ttsName').value = '';
  document.getElementById('ttsCommand').value = '';
  document.getElementById('ttsCategory').value = '';
  document.getElementById('ttsSituation').value = '';
  document.getElementById('ttsModalTitle').textContent = 'Add /tts Question';
  document.getElementById('ttsSaveBtn').onclick = function() { saveTtsAction(null); };
  document.getElementById('ttsName').focus();
}

async function saveTtsAction(editIndex) {
  var name = document.getElementById('ttsName').value.trim();
  var command = document.getElementById('ttsCommand').value.trim();
  var category = document.getElementById('ttsCategory').value.trim();
  var situation = document.getElementById('ttsSituation').value.trim();
  if (!name || !command) { showToast('Name and command are required', 'error'); return; }

  var isEdit = editIndex !== null;
  var existing = isEdit ? userTtsActions[editIndex] : null;

  var actionData = {
    id: (existing && existing.id) || Date.now().toString(36),
    name: name,
    command: command,
    category: category || 'General',
    situation: situation,
    createdAt: (existing && existing.createdAt) || new Date().toISOString()
  };

  try {
    if (isEdit && existing && existing._serverId) {
      var updateResult = await api('/api/user-content/tts_action/' + existing._serverId, {
        method: 'PUT',
        body: { data: actionData }
      });
      userTtsActions[editIndex] = Object.assign({}, updateResult.item.data, { _serverId: updateResult.item.id });
      showToast('Question updated', 'success');
    } else {
      var createResult = await api('/api/user-content/tts_action', {
        method: 'POST',
        body: { data: actionData }
      });
      userTtsActions.push(Object.assign({}, createResult.item.data, { _serverId: createResult.item.id }));
      showToast('Question added', 'success');
    }
  } catch (e) {
    showToast('Failed to save question', 'error');
    return;
  }

  closeModal('ttsModal');
  renderUserTtsActions();
}

function editTtsAction(index) {
  var a = userTtsActions[index];
  if (!a) return;
  var modal = document.getElementById('ttsModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('ttsName').value = a.name || '';
  document.getElementById('ttsCommand').value = a.command || '';
  document.getElementById('ttsCategory').value = a.category || '';
  document.getElementById('ttsSituation').value = a.situation || '';
  document.getElementById('ttsModalTitle').textContent = 'Edit /tts Question';
  document.getElementById('ttsSaveBtn').onclick = function() { saveTtsAction(index); };
}

async function deleteTtsAction(index) {
  if (!confirm('Delete this /tts question?')) return;
  var a = userTtsActions[index];
  if (!a) return;
  try {
    if (a._serverId) {
      await api('/api/user-content/tts_action/' + a._serverId, { method: 'DELETE' });
    }
  } catch (e) {
    showToast('Failed to delete question', 'error');
    return;
  }
  userTtsActions.splice(index, 1);
  renderUserTtsActions();
  showToast('Question deleted', 'info');
}

async function duplicateTtsAction(index) {
  var original = userTtsActions[index];
  if (!original) return;
  var copy = JSON.parse(JSON.stringify(original));
  delete copy._serverId;
  copy.id = Date.now().toString(36);
  copy.name = copy.name + ' (Copy)';
  try {
    var result = await api('/api/user-content/tts_action', {
      method: 'POST',
      body: { data: copy }
    });
    userTtsActions.push(Object.assign({}, result.item.data, { _serverId: result.item.id }));
    renderUserTtsActions();
    showToast('Question duplicated', 'success');
  } catch (e) {
    showToast('Failed to duplicate question', 'error');
  }
}

/* Copy text inline */
function copyTextInline(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied!', 'success');
    }).catch(function() {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('Copied!', 'success'); } catch(e) { showToast('Failed to copy', 'error'); }
  document.body.removeChild(ta);
}

/* Close modal */
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
  }
}

/* Render RP actions on dashboard */
async function renderDashboardRpActions() {
  var container = document.getElementById('dashboardQuickActions');
  if (!container) return;
  await loadUserRpActions();
  var actions = userRpActions.slice(0, 8);
  if (actions.length === 0) {
    container.innerHTML = '<p class="muted">Add custom /me actions to see them here.</p>';
    return;
  }
  var html = '';
  actions.forEach(function(a) {
    html += '<div class="dash-quick-item">';
    html += '<span class="cmd">/me ' + escapeHtml(a.name) + '</span>';
    html += '<button class="copy-mini" onclick="copyTextInline(\'/me ' + escapeHtml(a.command) + '\')">Copy</button>';
    html += '</div>';
  });
  container.innerHTML = html;
}

/* Init */
async function initRpSystem() {
  await renderUserRpActions();
  await renderUserTtsActions();
  await renderDashboardRpActions();
  renderDashboardFavourites();
}

window.openAddRpAction = openAddRpAction;
window.saveRpAction = saveRpAction;
window.editRpAction = editRpAction;
window.deleteRpAction = deleteRpAction;
window.duplicateRpAction = duplicateRpAction;
window.toggleFavourite = toggleFavourite;
window.moveRpAction = moveRpAction;
window.openAddTtsAction = openAddTtsAction;
window.saveTtsAction = saveTtsAction;
window.editTtsAction = editTtsAction;
window.deleteTtsAction = deleteTtsAction;
window.duplicateTtsAction = duplicateTtsAction;
window.copyTextInline = copyTextInline;
window.closeModal = closeModal;

/* =========================================================
   RP TAB SYSTEM, SBAR, SCENE BUILDER, EXPORT/IMPORT
========================================================= */

/* Tab switching */
function showRpTab(tab) {
  var tabs = ['library', 'tts', 'builder', 'sbar', 'pcr', 'questions'];
  tabs.forEach(function(t) {
    var panel = document.getElementById('rp-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.rptab').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + tab + "'") >= 0 || onclick.indexOf('"' + tab + '"') >= 0);
  });
  if (tab === 'library') { renderUserRpActions(); }
  if (tab === 'tts') { renderUserTtsActions(); }
  if (tab === 'builder') { renderSceneQuickAdd(); }
}

/* SBAR Builder */
function generateSbar() {
  var s = document.getElementById('sbarSituation');
  var b = document.getElementById('sbarBackground');
  var a = document.getElementById('sbarAssessment');
  var r = document.getElementById('sbarRecommendation');
  var name = document.getElementById('sbarName');
  var age = document.getElementById('sbarAge');
  var complaint = document.getElementById('sbarComplaint');
  var treatment = document.getElementById('sbarTreatment');
  var response = document.getElementById('sbarResponse');
  var dest = document.getElementById('sbarDestination');
  var output = document.getElementById('sbarOutput');
  if (!output) return;
  var text = '**SBAR HANDOVER**\n\n';
  text += '**S - Situation:** ' + (s ? s.value : '') + '\n';
  if (name && name.value) text += 'Patient: ' + name.value + (age && age.value ? ', ' + age.value : '') + '\n';
  if (complaint && complaint.value) text += 'Chief complaint: ' + complaint.value + '\n';
  text += '\n**B - Background:** ' + (b ? b.value : '') + '\n';
  text += '\n**A - Assessment:** ' + (a ? a.value : '') + '\n';
  if (treatment && treatment.value) text += 'Treatment given: ' + treatment.value + '\n';
  if (response && response.value) text += 'Response: ' + response.value + '\n';
  text += '\n**R - Recommendation:** ' + (r ? r.value : '') + '\n';
  if (dest && dest.value) text += 'Destination: ' + dest.value;
  output.textContent = text;
  showToast('Handover generated', 'success');
}

function copySbar() {
  var output = document.getElementById('sbarOutput');
  if (!output || !output.textContent || output.textContent.indexOf('SBAR HANDOVER') < 0) {
    showToast('Generate a handover first', 'error');
    return;
  }
  copyTextInline(output.textContent);
}

function clearSbar() {
  ['sbarSituation','sbarBackground','sbarAssessment','sbarRecommendation','sbarName','sbarAge','sbarComplaint','sbarTreatment','sbarResponse','sbarDestination'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var output = document.getElementById('sbarOutput');
  if (output) output.textContent = 'Fill in the fields above and click "Generate Handover" to create your SBAR.';
  showToast('Cleared', 'info');
}

/* Scene Builder */
var sceneActions = [];

function addToScene(text) {
  sceneActions.push(text);
  renderSceneBuilder();
  showToast('Added to scene', 'success');
}

function removeFromScene(index) {
  sceneActions.splice(index, 1);
  renderSceneBuilder();
}

function moveSceneAction(index, dir) {
  var ni = index + dir;
  if (ni < 0 || ni >= sceneActions.length) return;
  var tmp = sceneActions[index];
  sceneActions[index] = sceneActions[ni];
  sceneActions[ni] = tmp;
  renderSceneBuilder();
}

function renderSceneBuilder() {
  var container = document.getElementById('sceneBuilderList');
  if (!container) return;
  if (sceneActions.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:12px;text-align:center">Add actions from your library below to build a scene.</p>';
    return;
  }
  var html = '';
  sceneActions.forEach(function(a, i) {
    html += '<div class="scene-action-row">';
    html += '<span class="order">' + (i + 1) + '</span>';
    html += '<span class="content">' + escapeHtml(a) + '</span>';
    html += '<button class="act-copy" onclick="copyTextInline(\'' + escapeHtml(a) + '\')">Copy</button>';
    html += '<button class="secondary" style="padding:3px 6px;font-size:11px" onclick="moveSceneAction(' + i + ',-1)">\u25B2</button>';
    html += '<button class="secondary" style="padding:3px 6px;font-size:11px" onclick="moveSceneAction(' + i + ',1)">\u25BC</button>';
    html += '<button class="danger-small" style="padding:3px 6px;font-size:11px" onclick="removeFromScene(' + i + ')">\u2716</button>';
    html += '</div>';
  });
  container.innerHTML = html;
}

async function renderSceneQuickAdd() {
  var container = document.getElementById('sceneQuickAddList');
  if (!container) return;
  await loadUserRpActions();
  var actions = userRpActions.slice(0, 12);
  if (actions.length === 0) {
    container.innerHTML = '<p class="muted" style="font-size:12px">Add actions to your library first.</p>';
    return;
  }
  var html = '';
  actions.forEach(function(a) {
    var text = '/me ' + a.command;
    if (a.emote) text += ' /e ' + a.emote;
    html += '<button class="secondary" style="font-size:11px;padding:5px 8px" onclick="addToScene(\'' + escapeHtml(text) + '\')">' + escapeHtml(a.name) + '</button>';
  });
  container.innerHTML = html;
}

function copyScene() {
  if (sceneActions.length === 0) {
    showToast('No actions in scene', 'error');
    return;
  }
  var text = sceneActions.map(function(a, i) { return (i + 1) + '. ' + a; }).join('\n');
  copyTextInline(text);
}

function clearScene() {
  if (sceneActions.length === 0) return;
  if (!confirm('Clear the scene builder?')) return;
  sceneActions = [];
  renderSceneBuilder();
  showToast('Scene cleared', 'info');
}

var SCENES_KEY = 'uhs_saved_scenes';
var savedScenes = [];

/* Load saved scenes from the server */
async function loadSavedScenes() {
  try {
    var result = await api('/api/user-content/scene');
    savedScenes = (result && Array.isArray(result.items))
      ? result.items.map(function(item) {
          return Object.assign({}, item.data, { _serverId: item.id });
        })
      : [];
  } catch (e) {
    savedScenes = [];
  }
}

async function saveScene() {
  var name = document.getElementById('sceneBuilderName');
  if (!name || !name.value.trim()) {
    showToast('Enter a scene name', 'error');
    return;
  }
  if (sceneActions.length === 0) {
    showToast('Add some actions first', 'error');
    return;
  }
  var sceneData = {
    id: Date.now().toString(36),
    name: name.value.trim(),
    actions: [].concat(sceneActions),
    createdAt: new Date().toISOString()
  };
  try {
    var result = await api('/api/user-content/scene', {
      method: 'POST',
      body: { data: sceneData }
    });
    savedScenes.push(Object.assign({}, result.item.data, { _serverId: result.item.id }));
    showToast('Scene saved', 'success');
    renderSavedScenes();
  } catch (e) {
    showToast('Failed to save scene', 'error');
  }
}

async function renderSavedScenes() {
  var container = document.getElementById('savedScenesContainer');
  if (!container) return;
  await loadSavedScenes();
  if (savedScenes.length === 0) {
    container.innerHTML = '<p class="muted" style="font-size:12px">No saved scenes yet.</p>';
    return;
  }
  var html = '';
  savedScenes.forEach(function(s, i) {
    html += '<div class="rp-card" style="margin:6px 0">';
    html += '<div class="rp-card-header"><strong>' + escapeHtml(s.name) + '</strong><span style="font-size:11px;color:#7a95a3">' + (s.actions || []).length + ' actions</span></div>';
    html += '<div class="rp-card-actions">';
    html += '<button class="primary" onclick="loadSavedScene(' + i + ')">Load</button>';
    html += '<button class="secondary" onclick="deleteSavedScene(' + i + ')">Delete</button>';
    html += '</div></div>';
  });
  container.innerHTML = html;
}

function loadSavedScene(index) {
  if (!savedScenes[index]) return;
  sceneActions = [].concat(savedScenes[index].actions || []);
  renderSceneBuilder();
  showToast('Scene loaded', 'success');
}

async function deleteSavedScene(index) {
  var scene = savedScenes[index];
  if (!scene) return;
  try {
    if (scene._serverId) {
      await api('/api/user-content/scene/' + scene._serverId, { method: 'DELETE' });
    }
  } catch (e) {
    showToast('Failed to delete scene', 'error');
    return;
  }
  savedScenes.splice(index, 1);
  renderSavedScenes();
  showToast('Scene deleted', 'info');
}

/* Export/Import */
async function exportRpProfile() {
  await loadUserRpActions();
  await loadUserTtsActions();
  await loadSavedScenes();
  var data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    rpActions: userRpActions,
    ttsActions: userTtsActions,
    scenes: savedScenes
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'UHS-RP-Profile.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Profile exported', 'success');
}

function importRpProfile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = async function(e) {
    try {
      var data = JSON.parse(e.target.result);
      var importedCount = 0;

      if (data.rpActions && Array.isArray(data.rpActions) && data.rpActions.length > 0) {
        await api('/api/user-content/rp_action/migrate', {
          method: 'POST',
          body: { items: data.rpActions }
        });
        importedCount += data.rpActions.length;
      }
      if (data.ttsActions && Array.isArray(data.ttsActions) && data.ttsActions.length > 0) {
        await api('/api/user-content/tts_action/migrate', {
          method: 'POST',
          body: { items: data.ttsActions }
        });
      }
      if (data.scenes && Array.isArray(data.scenes) && data.scenes.length > 0) {
        await api('/api/user-content/scene/migrate', {
          method: 'POST',
          body: { items: data.scenes }
        });
      }
      await renderUserRpActions();
      await renderUserTtsActions();
      await renderSavedScenes();
      showToast('Imported ' + importedCount + ' actions', 'success');
    } catch(err) {
      showToast('Invalid file format', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

async function resetRpLibrary() {
  if (!confirm('Reset your entire RP library? This cannot be undone.')) return;
  try {
    await loadUserRpActions();
    for (var i = 0; i < userRpActions.length; i++) {
      if (userRpActions[i]._serverId) {
        await api('/api/user-content/rp_action/' + userRpActions[i]._serverId, { method: 'DELETE' });
      }
    }
    if (userRpFavouritesRowId) {
      await api('/api/user-content/rp_favourite/' + userRpFavouritesRowId, { method: 'DELETE' });
      userRpFavouritesRowId = null;
    }
    await loadUserTtsActions();
    for (var j = 0; j < userTtsActions.length; j++) {
      if (userTtsActions[j]._serverId) {
        await api('/api/user-content/tts_action/' + userTtsActions[j]._serverId, { method: 'DELETE' });
      }
    }
    await loadSavedScenes();
    for (var k = 0; k < savedScenes.length; k++) {
      if (savedScenes[k]._serverId) {
        await api('/api/user-content/scene/' + savedScenes[k]._serverId, { method: 'DELETE' });
      }
    }
  } catch (e) {
    showToast('Failed to reset library', 'error');
  }
  localStorage.removeItem('uhs_rp_cats');
  userRpActions = [];
  userTtsActions = [];
  userRpFavourites = [];
  savedScenes = [];
  sceneActions = [];
  await renderUserRpActions();
  await renderUserTtsActions();
  await renderSavedScenes();
  renderSceneBuilder();
  showToast('Library reset', 'info');
}

window.showRpTab = showRpTab;
window.generateSbar = generateSbar;
window.copySbar = copySbar;
window.clearSbar = clearSbar;
window.addToScene = addToScene;
window.removeFromScene = removeFromScene;
window.moveSceneAction = moveSceneAction;
window.copyScene = copyScene;
window.clearScene = clearScene;
window.saveScene = saveScene;
window.loadSavedScene = loadSavedScene;
window.deleteSavedScene = deleteSavedScene;
window.exportRpProfile = exportRpProfile;
window.importRpProfile = importRpProfile;
window.resetRpLibrary = resetRpLibrary;

/* =========================================================
   MOBILE MENU, EQUIPMENT, EMERGENCY MODE, DRAG-DROP
========================================================= */

/* Mobile menu toggle */
function toggleMobileMenu() {
  var sidebar = document.querySelector('.sidebar');
  var btn = document.getElementById('mobileMenuBtn');
  if (!sidebar) return;
  sidebar.classList.toggle('mobile-open');
  if (btn) {
    btn.textContent = sidebar.classList.contains('mobile-open') ? '\u2715' : '\u2630';
  }
}

/* Close mobile menu */
document.addEventListener('click', function(e) {
  var sidebar = document.querySelector('.sidebar');
  var btn = document.getElementById('mobileMenuBtn');
  if (!sidebar || !btn) return;
  if (sidebar.classList.contains('mobile-open') && !sidebar.contains(e.target) && !btn.contains(e.target)) {
    sidebar.classList.remove('mobile-open');
    btn.textContent = '\u2630';
  }
});

/* Equipment data */
var equipmentData = {
  airway: [
    { name: 'Oropharyngeal Airway (OPA)', purpose: 'Maintains airway in unconscious patients by preventing tongue obstruction', rp: '/me selects the correct sized OPA, opens the patient\'s mouth and inserts it gently with a 180-degree rotation technique' },
    { name: 'Nasopharyngeal Airway (NPA)', purpose: 'Maintains airway in semi-conscious patients with intact gag reflex', rp: '/me lubricates the NPA and inserts it gently into the patient\'s nostril, angling towards the ear' },
    { name: 'Bag-Valve-Mask (BVM)', purpose: 'Provides positive-pressure ventilation to patients who are not breathing adequately', rp: '/me attaches the BVM to oxygen, seals the mask over the patient\'s face and ventilates at the appropriate rate' },
    { name: 'Suction Unit', purpose: 'Clears the airway of blood, secretions or foreign material', rp: '/me turns on the suction unit, selects the appropriate catheter and clears the patient\'s airway under direct vision' },
    { name: 'Laryngeal Mask Airway (LMA)', purpose: 'Supraglottic airway device used as an alternative to intubation', rp: '/me deflates the cuff, lubricates the LMA and inserts it along the palate into position' },
    { name: 'Endotracheal Tube (ETT)', purpose: 'Definitive airway secured past the vocal cords for mechanical ventilation', rp: '/me prepares the ETT, checks the cuff and uses a laryngoscope to visualise the cords before passing the tube' },
    { name: 'Laryngoscope', purpose: 'Provides direct visualisation of the vocal cords for intubation', rp: '/me checks the laryngoscope blade is firmly attached and the light is bright before use' }
  ],
  breathing: [
    { name: 'Oxygen Cylinder', purpose: 'Portable oxygen supply for pre-hospital use', rp: '/me checks the cylinder pressure, opens the valve and sets the flow rate as prescribed' },
    { name: 'Non-Rebreathe Mask', purpose: 'Delivers high-concentration oxygen (60-80%) to spontaneously breathing patients', rp: '/me selects the non-rebreathe mask, fills the reservoir bag and adjusts the flow to 15L/min' },
    { name: 'Nasal Cannula', purpose: 'Delivers low-concentration oxygen (24-40%) for patients who cannot tolerate a mask', rp: '/me places the nasal cannula in the patient\'s nostrils and loops the tubing behind their ears' },
    { name: 'Nebuliser', purpose: 'Delivers aerosolised medication directly to the airways', rp: '/me draws up the medication, pours it into the nebuliser chamber and attaches it to the mask or mouthpiece' },
    { name: 'Chest Decompression Needle', purpose: 'Relieves tension pneumothorax by releasing trapped air from the pleural space', rp: '/me identifies the 2nd intercostal space in the mid-clavicular line and inserts the large-bore needle' },
    { name: 'Chest Drain Kit', purpose: 'Definitive drainage of pneumothorax or haemothorax via intercostal drain', rp: '/me preps the chest drain kit, drapes the area and makes an incision at the triangle of safety' }
  ],
  circulation: [
    { name: 'IV Cannula', purpose: 'Peripheral venous access for fluid and medication administration', rp: '/me selects an appropriate vein, cleans the site and inserts the cannula at the correct angle' },
    { name: 'IV Giving Set', purpose: 'Connects IV fluid bags to cannulas for infusion', rp: '/me primes the giving set with fluid, ensuring no air bubbles remain in the line' },
    { name: 'Tourniquet', purpose: 'Applies venous pressure to make veins more visible for cannulation', rp: '/me applies the tourniquet a few inches above the intended cannulation site' },
    { name: 'ECG Monitor', purpose: 'Records the electrical activity of the heart', rp: '/me attaches the ECG leads to the patient\'s chest and limbs according to the correct configuration' },
    { name: 'Defibrillator (AED)', purpose: 'Delivers a controlled electric shock to the heart in cardiac arrest', rp: '/me turns on the defibrillator, applies the pads to the patient\'s bare chest and follows the prompts' },
    { name: 'Blood Pressure Cuff', purpose: 'Measures systolic and diastolic blood pressure', rp: '/me selects the correct cuff size and wraps it around the patient\'s upper arm at heart level' }
  ],
  trauma: [
    { name: 'Pelvic Binder', purpose: 'Stabilises a fractured pelvis by reducing pelvic volume and controlling haemorrhage', rp: '/me applies the pelvic binder at the level of the greater trochanters and tightens it securely' },
    { name: 'Cervical Collar', purpose: 'Immobilises the cervical spine following trauma', rp: '/me measures the patient\'s neck and applies the correctly sized cervical collar' },
    { name: 'Spinal Board', purpose: 'Provides full spinal immobilisation for transportation', rp: '/me log rolls the patient onto the spinal board while maintaining inline spinal stabilisation' },
    { name: 'Scoop Stretcher', purpose: 'Used to lift patients with suspected spinal injuries onto a stretcher', rp: '/me separates the scoop stretcher halves and positions them under the patient before clipping together' },
    { name: 'Haemostatic Dressing', purpose: 'Promotes rapid clotting in severe bleeding wounds', rp: '/me exposes the wound, packs the haemostatic dressing directly into the bleeding source and holds pressure' },
    { name: 'Tourniquet (Trauma)', purpose: 'Controls life-threatening limb haemorrhage when direct pressure fails', rp: '/me applies the tourniquet high on the limb and tightens it until bleeding stops' }
  ],
  cardiac: [
    { name: 'AED (Automated External Defibrillator)', purpose: 'Analyses heart rhythm and delivers shock if needed', rp: '/me turns on the AED, attaches the pads and follows the voice prompts' },
    { name: 'Manual Defibrillator', purpose: 'Allows manual selection of energy level and synchronised cardioversion', rp: '/me selects the appropriate energy level, charges the defibrillator and ensures everyone is clear before delivering the shock' },
    { name: 'ECG Machine (12-lead)', purpose: 'Records a full 12-lead ECG for cardiac assessment', rp: '/me positions the 10 ECG leads correctly and acquires the 12-lead trace' },
    { name: 'Transcutaneous Pacing Pads', purpose: 'Provides temporary cardiac pacing in bradycardia with compromise', rp: '/me applies the pacing pads in the anterior-posterior position and sets the pacing rate' }
  ],
  monitoring: [
    { name: 'Pulse Oximeter', purpose: 'Measures oxygen saturation and pulse rate non-invasively', rp: '/me clips the pulse oximeter onto the patient\'s finger and waits for a stable waveform' },
    { name: 'Thermometer', purpose: 'Measures body temperature via tympanic, oral or axillary route', rp: '/me places the thermometer probe in the patient\'s ear and records the temperature' },
    { name: 'Glucometer', purpose: 'Measures capillary blood glucose level', rp: '/me pricks the patient\'s finger, applies the blood to the test strip and reads the result' },
    { name: 'ETCO2 Monitor (Capnograph)', purpose: 'Measures end-tidal carbon dioxide during ventilation and CPR', rp: '/me attaches the capnograph to the endotracheal tube and monitors the waveform' },
    { name: 'Penlight', purpose: 'Used to assess pupil response', rp: '/me shines a penlight into each eye and observes for direct and consensual response' }
  ],
  medication: [
    { name: 'Syringe (Various Sizes)', purpose: 'For drawing up and administering medications', rp: '/me selects the appropriate syringe size for the medication being prepared' },
    { name: 'Sharps Bin', purpose: 'Safe disposal of needles and sharps', rp: '/me disposes of the used needle directly into the sharps bin at the point of use' },
    { name: 'Drug Ampoule Opener', purpose: 'Safely opens glass ampoules', rp: '/me places the ampoule in the opener and snaps the neck cleanly away from the patient' },
    { name: 'Alcohol Wipes', purpose: 'Cleans skin before injection or cannulation', rp: '/me cleans the intended site with an alcohol wipe using a circular motion' }
  ],
  ppe: [
    { name: 'Gloves (Nitrile)', purpose: 'Hand protection against bodily fluids and contaminants', rp: '/me gloves up, checking the gloves for any tears before patient contact' },
    { name: 'FFP3 Mask', purpose: 'Respiratory protection against airborne particles', rp: '/me fits the FFP3 mask and performs a seal check before entering the hazard area' },
    { name: 'Apron', purpose: 'Protects uniform from bodily fluid splashes', rp: '/me puts on a disposable apron before approaching the patient' },
    { name: 'Safety Goggles', purpose: 'Eye protection against splashes and droplets', rp: '/me puts on safety goggles as part of standard PPE' }
  ]
};

/* Expanded equipment catalogue: theatre, burns, extrication, paediatrics, obstetric and infection-control RP kit. */
equipmentData.surgical = [
  { name: 'General Surgical Tray', purpose: 'Core sterile instruments for general surgical cases', rp: '/me checks the general surgical tray, confirms the instrument count and verifies sterile packaging before opening it' },
  { name: 'Laparoscopic Tower', purpose: 'Camera, light and display system for laparoscopic procedures', rp: '/me powers up the laparoscopic tower, checks the camera and light source and confirms the display is working' },
  { name: 'Laparoscopic Instrument Set', purpose: 'Reusable/sterile instruments for laparoscopic theatre cases', rp: '/me checks the laparoscopic instruments, seals and packaging before laying them out on the sterile field' },
  { name: 'Orthopaedic Instrument Set', purpose: 'Specialist instruments for fracture and orthopaedic cases', rp: '/me checks the orthopaedic set, confirms the required instruments are present and verifies the packaging' },
  { name: 'Vascular Instrument Set', purpose: 'Specialist atraumatic instruments for vascular surgery', rp: '/me checks the vascular tray and confirms the specialist instruments and repair materials are ready' },
  { name: 'Surgical Suction', purpose: 'Removes blood and fluid from the operative field', rp: '/me connects the suction tubing, checks the canister and confirms suction is functioning' },
  { name: 'Electrosurgical Unit', purpose: 'Provides controlled surgical energy for haemostasis and tissue work', rp: '/me checks the electrosurgical unit, cables and return electrode before the case starts' },
  { name: 'Surgical Diathermy Pencil', purpose: 'Handpiece used with an electrosurgical unit', rp: '/me checks the diathermy pencil and cable are intact and ready on the sterile field' },
  { name: 'Operating Theatre Light', purpose: 'Focused illumination of the operative field', rp: '/me adjusts the theatre light over the operative field and confirms clear illumination' },
  { name: 'Instrument Count Board', purpose: 'Supports documented swab, instrument and sharp counts', rp: '/me completes the theatre count with the scrub team and records the count status' },
  { name: 'Specimen Container', purpose: 'Secure container for tissue or removed material sent for analysis', rp: '/me labels the specimen container and confirms patient and specimen details with the team' },
  { name: 'Surgical Skin Marker', purpose: 'Marks operative site or relevant anatomy before preparation', rp: '/me confirms the operative site and marks it as directed before final skin preparation' },
  { name: 'Sterile Drapes', purpose: 'Creates and maintains the sterile operative field', rp: '/me opens the sterile drapes and helps establish the sterile field without contaminating the packs' },
  { name: 'Sterile Gown & Gloves', purpose: 'Maintains sterile technique for theatre staff', rp: '/me performs surgical hand preparation and dons the sterile gown and gloves' },
  { name: 'Suture & Closure Set', purpose: 'Supports wound closure at the end of a procedure', rp: '/me checks the closure materials and confirms the required sizes are available' },
  { name: 'Surgical Stapler', purpose: 'Device used for selected surgical closure or anastomosis', rp: '/me checks the stapler packaging and confirms the correct device is available for the planned case' },
  { name: 'Patient Warming System', purpose: 'Helps maintain temperature during longer procedures', rp: '/me applies the patient warming system and confirms the temperature monitoring is active' },
  { name: 'Blood Warmer / Rapid Infusion Set', purpose: 'Supports warmed blood/fluid delivery when clinically required', rp: '/me checks the blood warming and rapid infusion equipment is available and functioning' },
  { name: 'Recovery Trolley', purpose: 'Supports immediate post-operative transfer and monitoring', rp: '/me checks the recovery trolley, monitoring equipment and oxygen supply before receiving the patient' }
];

equipmentData.burns = [
  { name: 'Burns Assessment Chart', purpose: 'Supports documentation of burn depth, location and estimated extent', rp: '/me opens the burns assessment chart and records the affected areas, depth and estimated extent' },
  { name: 'Non-Adherent Burn Dressing', purpose: 'Provides a protective dressing that minimises adherence to injured skin', rp: '/me selects a non-adherent dressing and covers the affected area without applying it directly to an exposed wound bed' },
  { name: 'Cling Film / Temporary Burn Cover', purpose: 'Temporary protective cover for appropriate thermal burns during transfer', rp: '/me applies a loose protective cling-film cover over the burn as part of transfer preparation' },
  { name: 'Burns Dressing Pack', purpose: 'Sterile supplies for burn dressing changes', rp: '/me opens the burns dressing pack and checks all sterile contents before the dressing change' },
  { name: 'Thermal Blanket', purpose: 'Helps reduce heat loss and hypothermia risk', rp: '/me covers the patient with a thermal blanket while keeping the injured areas accessible' },
  { name: 'Irrigation / Cooling Water Supply', purpose: 'Provides appropriate running water for initial thermal burn cooling', rp: '/me positions the affected area under a safe running water supply and monitors the patient for heat loss' },
  { name: 'Burns Measuring Tape', purpose: 'Supports documentation of burn size and distribution', rp: '/me measures the affected area and records the dimensions in the burns chart' },
  { name: 'Hydrogel Burn Dressing', purpose: 'Specialist dressing option for selected burns according to local protocol', rp: '/me checks the hydrogel dressing pack and prepares it for use according to the local burns protocol' },
  { name: 'Sterile Gauze', purpose: 'Protective absorbent dressing material', rp: '/me selects sterile gauze and prepares it for the burn dressing' },
  { name: 'Eye Protection', purpose: 'Protects staff during burn cleaning or irrigation', rp: '/me puts on eye protection before beginning the burn care setup' }
];

equipmentData.extrication = [
  { name: 'Scoop Stretcher', purpose: 'Allows lifting with reduced patient movement', rp: '/me assembles the scoop stretcher around the patient and confirms the locks are secure' },
  { name: 'Extrication Collar', purpose: 'Provides support where cervical spine protection is indicated', rp: '/me checks the collar size and applies it while maintaining appropriate manual support' },
  { name: 'Cutting / Glass Management Kit', purpose: 'Supports safe access around damaged vehicles and broken glass', rp: '/me checks the vehicle-access kit and confirms the crew has appropriate eye and hand protection' },
  { name: 'Vacuum Mattress', purpose: 'Provides moulded support for transport of selected trauma patients', rp: '/me prepares the vacuum mattress and checks the valve before transferring the patient onto it' },
  { name: 'Trauma Stretcher', purpose: 'Primary transport platform for injured patients', rp: '/me locks the trauma stretcher, checks the brakes and prepares it for patient transfer' },
  { name: 'Head Blocks / Stabilisation Aids', purpose: 'Supports head positioning during selected trauma transfers', rp: '/me checks the head stabilisation aids and positions them without compromising the airway' },
  { name: 'Blanket & Foil Pack', purpose: 'Provides thermal protection during prolonged extrication', rp: '/me prepares the thermal protection pack and covers exposed areas while the extrication continues' },
  { name: 'Scene Lighting', purpose: 'Portable lighting for dark or poorly lit scenes', rp: '/me sets up the portable scene light and directs it over the patient care area' }
];

equipmentData.paediatric = [
  { name: 'Paediatric BVM Set', purpose: 'Age/size-appropriate ventilation equipment', rp: '/me selects the paediatric BVM size and checks the mask, valve and oxygen connection' },
  { name: 'Paediatric Airway Set', purpose: 'Age/size-appropriate airway adjuncts', rp: '/me lays out the paediatric airway sizes and confirms the appropriate options are available' },
  { name: 'Paediatric BP Cuffs', purpose: 'Age-appropriate non-invasive blood pressure measurement', rp: '/me selects the correct paediatric cuff and prepares it for observations' },
  { name: 'Paediatric Pulse Oximeter Probe', purpose: 'Suitable sensor for smaller fingers or feet', rp: '/me selects the paediatric pulse oximeter probe and checks for a stable reading' },
  { name: 'Paediatric Weighing Scales', purpose: 'Supports weight-based clinical calculations where appropriate', rp: '/me checks the paediatric scales and records the patient\'s measured weight' },
  { name: 'Paediatric Immobilisation Set', purpose: 'Supports safe positioning and transport of injured children', rp: '/me prepares the appropriately sized paediatric immobilisation equipment for transport' },
  { name: 'Paediatric Observation Chart', purpose: 'Records age-appropriate observations and trends', rp: '/me opens the paediatric observation chart and records the latest observations' }
];

equipmentData.obstetric = [
  { name: 'Maternity / Delivery Pack', purpose: 'Sterile supplies for delivery-related care', rp: '/me opens the maternity pack and checks the sterile contents are intact' },
  { name: 'Neonatal Resuscitation Bag', purpose: 'Ventilation equipment for a newborn requiring resuscitation support', rp: '/me prepares the neonatal resuscitation bag and checks the oxygen connection and mask size' },
  { name: 'Neonatal Warmth Pack', purpose: 'Supports thermal protection of the newborn', rp: '/me prepares the neonatal warmth pack and keeps the newborn protected from heat loss' },
  { name: 'Maternity Pads', purpose: 'Absorbent supplies for post-delivery care', rp: '/me prepares maternity pads and places them within easy reach for post-delivery care' },
  { name: 'Cord Clamp', purpose: 'Used as part of umbilical cord management after birth', rp: '/me checks the cord clamp packaging and prepares it for the maternity team' },
  { name: 'Obstetric Monitoring Kit', purpose: 'Supports maternal observations and fetal assessment where appropriate', rp: '/me prepares the obstetric monitoring equipment and confirms it is functioning' }
];

equipmentData.infection = [
  { name: 'FFP3 Respirator', purpose: 'Respiratory protection for appropriate airborne-risk situations', rp: '/me fits the FFP3 respirator and completes the required seal check' },
  { name: 'Fluid-Resistant Gown', purpose: 'Protects clothing and skin from fluid exposure', rp: '/me dons the fluid-resistant gown before entering the patient care area' },
  { name: 'Face Shield', purpose: 'Protects face and eyes from splash exposure', rp: '/me puts on the face shield before starting a splash-risk procedure' },
  { name: 'Apron & Glove Pack', purpose: 'Quick-access PPE for routine patient contact', rp: '/me selects the appropriate PPE and checks the gloves and apron before patient contact' },
  { name: 'Clinical Waste Bag', purpose: 'Segregates appropriate contaminated clinical waste', rp: '/me opens the clinical waste bag and disposes of used contaminated items correctly' },
  { name: 'Sharps Container', purpose: 'Safe point-of-use disposal of sharps', rp: '/me places the used sharp directly into the approved sharps container' },
  { name: 'Hand Hygiene Station', purpose: 'Supports hand hygiene before and after patient contact', rp: '/me performs hand hygiene before approaching the patient and again after the procedure' }
];

equipmentData.documentation = [
  { name: 'PCR / Patient Care Record', purpose: 'Records assessment, treatment, observations and handover', rp: '/me opens the patient care record and documents the assessment, treatment and outcome' },
  { name: 'SBAR Handover Sheet', purpose: 'Structures transfer of patient information between teams', rp: '/me prepares the SBAR handover and checks that the key clinical details are complete' },
  { name: 'Incident / Scene Form', purpose: 'Documents scene information and major events', rp: '/me completes the incident form with mechanism, findings, actions and timings' },
  { name: 'Observation Chart', purpose: 'Tracks vital signs and trends over time', rp: '/me records the latest observations on the chart and compares them with the previous set' },
  { name: 'Consent Documentation', purpose: 'Records consent discussions and procedure status where applicable', rp: '/me checks the consent documentation is complete and filed with the patient record' },
  { name: 'Specimen Label Set', purpose: 'Supports accurate identification of specimens', rp: '/me labels the specimen with the required patient and specimen identifiers and checks it with the team' }
];

/* Equipment category switcher */
function showEquipmentCategory(cat) {
  document.querySelectorAll('.eq-panel').forEach(function(p) { p.style.display = 'none'; });
  document.querySelectorAll('.eqcat').forEach(function(b) { b.classList.remove('active'); });
  var panel = document.getElementById('eq-' + cat);
  if (panel) panel.style.display = '';
  var grid = document.getElementById('eqGrid-' + cat);
  if (!grid) return;
  var items = equipmentData[cat] || [];
  if (items.length === 0) {
    grid.innerHTML = '<p class="muted">No equipment items listed for this category.</p>';
    return;
  }
  grid.innerHTML = items.map(function(item) {
    return '<article class="med-card">' +
      '<div class="med-top"><span>' + escapeHtml(item.name) + '</span></div>' +
      '<p><strong>Purpose:</strong> ' + escapeHtml(item.purpose) + '</p>' +
      '<button onclick="copyTextInline(\'' + escapeHtml(item.rp) + '\')">Copy /me</button>' +
      '<div class="med-rp">' + escapeHtml(item.rp) + '</div></article>';
  }).join('');
  document.querySelectorAll('.eqcat').forEach(function(b) {
    var onclick = b.getAttribute('onclick') || '';
    if (onclick.indexOf("'" + cat + "'") >= 0 || onclick.indexOf('"' + cat + '"') >= 0) {
      b.classList.add('active');
    }
  });
}

/* Emergency mode */
var emergencyData = {
  'cardiac-arrest': {
    title: 'Cardiac Arrest - Adult',
    priorities: ['Scene safety - check responsiveness (shake and shout)', 'Open airway - head-tilt chin-lift or jaw thrust', 'Assess breathing - look, listen, feel for up to 10 seconds', 'Start CPR 30:2 if not breathing normally (agonal gasping = arrest)', 'Attach AED / defibrillator as soon as available - minimise pauses', 'IV/IO access - adrenaline 1mg every 3-5 minutes (after 2nd shock)', 'Identify and treat reversible causes - 4 Hs and 4 Ts', 'Consider mechanical CPR device if prolonged resuscitation'],
    assessment: ['Unresponsive to voice and pain', 'Not breathing OR agonal gasping only', 'No signs of life (no cough, no movement, no breathing)', 'Carotid pulse check - central pulse only (max 10 sec)', 'ECG rhythm check: shockable (VF/pVT) or non-shockable (PEA/asystole)', 'ETCO2 waveform capnography - target > 2 kPa during CPR', 'Check for reversible causes throughout'],
    management: ['CPR at 100-120 compressions/min, depth 5-6 cm', 'Allow full chest recoil - minimise interruptions to < 10 seconds', 'Ventilate with BVM + 15 L O2 - 30:2 (2 breaths over 1 second each)', 'Shockable rhythm: defibrillate 150-200 J (biphasic), then CPR 2 min', 'Adrenaline 1mg IV/IO after 2nd shock, then every 3-5 min', 'Amiodarone 300mg IV after 3rd shock (5% dextrose flush)', 'Non-shockable: adrenaline 1mg ASAP, then every 3-5 min', 'Consider airway adjunct - OPA/NPA, then SGA or intubation', 'Identify 4 Hs: Hypoxia, Hypovolaemia, Hyper/hypokalaemia, Hypothermia', 'Identify 4 Ts: Tension pneumothorax, Tamponade, Toxins, Thrombosis'],
    redflags: ['Unwitnessed arrest - poor prognosis', 'Prolonged downtime without CPR', 'ETCO2 persistently < 2 kPa - ineffective CPR', 'Recurrent VF/pVT despite amiodarone', 'Signs of life but no ROSC after 20 min'],
    rp: ['/me checks the patient for responsiveness - gently shakes and shouts', '/me opens the airway using the head-tilt chin-lift manoeuvre', '/me places their cheek near the mouth and listens for 10 seconds', '/me begins chest compressions at 100-120 per minute', '/me attaches the defibrillator pads to the patient bare chest', '/me clears the area and delivers a 200J biphasic shock', '/me establishes IV access and draws up 1mg adrenaline'],
    questions: ['How long has the patient been unresponsive?', 'Did anyone witness the collapse?', 'Has CPR been started already?', 'Does the patient have any known medical conditions?'],
    handover: 'TIME OF COLLAPSE: [HH:MM] | ONSET: WITNESSED / UNWITNESSED | BYSTANDER CPR: YES / NO | INITIAL RHYTHM: VF / pVT / PEA / ASYSTOLE | SHOCKS: [x] | ADRENALINE: [x]mg | ROSC: YES / NO'
  },
  'major-trauma': {
    title: 'Major Trauma',
    priorities: ['Scene safety - METHANE report if required', 'Control catastrophic haemorrhage - tourniquet / haemostatic dressing', 'C-spine manual immobilisation - cervical collar application', 'ABCDE assessment with concurrent haemorrhage control', 'Consider pelvic binder if suspected pelvic fracture', 'IV/IO access - 2x large-bore cannulae', 'Tranexamic acid 1g IV over 10 minutes (within 3 hours of injury)', 'Permissive hypotension (target SBP 80-90)', 'Scoop and run to MTC / trauma unit'],
    assessment: ['Mechanism of injury - RTC, fall, stabbing, GSW, blast', 'Catastrophic haemorrhage - exsanguinating external bleed', 'Airway with C-spine - patency, GCS, signs of obstruction', 'Breathing - respiratory rate, chest expansion, tracheal deviation, JVD', 'Circulation - pulse, CRT, BP, skin colour, external bleeding sites', 'Disability - GCS / AVPU, pupils, limb movement', 'Exposure - full body log roll, palpate spine, pelvis, long bones'],
    management: ['Direct pressure + haemostatic dressing for junctional wounds', 'Tourniquet for life-threatening limb haemorrhage - note time applied', 'Pelvic binder at greater trochanter level if suspected pelvic fracture', 'Cervical collar + blocks + tape for C-spine immobilisation', 'Tranexamic acid 1g IV (over 10 min) ideally within 1 hour of injury', 'IV fluids - warmed crystalloid, 250-500 mL boluses (permissive hypotension)', 'Chest decompression - needle thoracostomy if tension pneumothorax', 'Analgesia - morphine / fentanyl / ketamine (IV/IO titrated)', 'Keep warm - remove wet clothing, apply blanket, warm fluids'],
    redflags: ['Systolic BP < 90 mmHg - decompensating haemorrhage', 'Reduced consciousness (GCS < 13) with significant MOI', 'Open pneumothorax / sucking chest wound', 'Pelvic instability on gentle palpation', 'Penetrating injury to torso, neck or proximal limb', 'Anticoagulant therapy with any bleeding'],
    rp: ['/me confirms the scene is safe and dons appropriate PPE before approaching', '/me identifies catastrophic external bleeding and applies direct pressure', '/me applies a tourniquet to the proximal limb, noting the time', '/me manually stabilises the patient head and neck while an assistant applies a cervical collar', '/me exposes the chest to inspect for open wounds or deformity', '/me gains IV access via an antecubital vein with a 14G cannula', '/me administers tranexamic acid 1g IV over 10 minutes'],
    questions: ['What happened and where is your pain?', 'Can you tell me where you are injured?', 'Can you feel your hands and feet?', 'Do you have any neck or back pain?', 'Are you on any blood-thinning medication?'],
    handover: 'MECHANISM: [RTC/fall/stabbing/GSW] | TYPE: BLUNT / PENETRATING | HAEMORRHAGE CONTROL: TOURNIQUET / PELVIC BINDER / HAEMOSTATIC | C-SPINE: YES / NO | GCS: [E][V][M]=[total] | TXA: YES / NO | SBP: [value] | HR: [value] | DEST: MTC / TU / ED'
  },
  'chest-pain': {
    title: 'Chest Pain - ACS',
    priorities: ['Assess ABCDE', 'Position the patient upright', '12-lead ECG within 10 minutes of arrival', 'Obtain SOCRATES pain history', 'Aspirin 300mg - chewed or dispersed (if no contraindications)', 'GTN spray 400mcg SL - repeat after 5 min if pain persists', 'Oxygen ONLY if SpO2 < 94% or signs of hypoxaemia', 'Pain assessment (scale 0-10) before and after each intervention', 'Consider morphine 2.5-5mg IV if severe pain uncontrolled by GTN'],
    assessment: ['SOCRATES: Site, Onset, Character, Radiation, Alleviating/Associations, Timing, Exacerbating, Severity', 'ECG interpretation - ST elevation, ST depression, T-wave inversion, LBBB', 'Heart rate and rhythm', 'Blood pressure - bilateral if suspected aortic dissection', 'Cardiac auscultation - heart sounds, murmurs, pericardial rub', 'Jugular venous pressure (JVP)'],
    management: ['12-lead ECG - record and transmit to receiving hospital', 'Aspirin 300mg chewed or crushed + dispersed in water', 'GTN spray 400mcg SL - caution if SBP < 90 mmHg', 'Morphine 2.5-5mg IV + metoclopramide 10mg IV for nausea', 'Oxygen via mask/NIV if SpO2 < 94%', 'Primary PCI centre if STEMI confirmed', 'Consider differentials: aortic dissection, pulmonary embolism, pericarditis'],
    redflags: ['Sudden tearing chest pain radiating to back - aortic dissection', 'Hypotension (SBP < 90) with chest pain - cardiogenic shock', 'Cardiac-sounding chest pain with diaphoresis and vomiting', 'ECG: ST elevation, hyperacute T-waves, new LBBB', 'Pain unresponsive to GTN + morphine', 'Chest pain with syncope or near-syncope'],
    rp: ['/me positions the patient upright at 45 degrees with the back well supported', '/me obtains a 12-lead ECG - attaching the limb leads and precordial leads', '/me takes a SOCRATES pain history', '/me administers 300mg aspirin - the patient chews and swallows', '/me checks the blood pressure before offering GTN spray', '/me administers GTN spray 400mcg sublingually', '/me obtains IV access and draws up morphine 2.5mg'],
    questions: ['Can you describe the pain?', 'When did the pain first start?', 'Is the pain going anywhere - arm, jaw, back?', 'On a scale of 0-10, how severe is the pain?', 'Does anything make it better or worse?', 'Do you have any history of heart problems?'],
    handover: 'AGE: [age] | ONSET: [time] | PAIN: [0-10] | ECG: STEMI / NSTEMI / UA | HR: [value] | BP: [value] | SpO2: [%] | ASPIRIN: YES / NO | GTN: [doses] | MORPHINE: [mg] | DEST: PCI CENTRE / ED / CDU'
  },
  'stroke': {
    title: 'Stroke (FAST positive)',
    priorities: ['FAST assessment - Facial droop, Arm weakness, Speech problems, Time', 'ABC assessment', 'Check blood glucose - exclusion of hypoglycaemia mimicking stroke', '12-lead ECG - atrial fibrillation is common cause', 'Baseline observations - BP, HR, SpO2, temp', 'Time of onset / last known well - establish thrombolysis window', 'Pre-alert receiving hospital - stroke team activation', 'Head elevated 30 degrees, maintain normoxia (SpO2 > 94%)'],
    assessment: ['Facial droop - ask patient to smile (symmetry of nasolabial folds)', 'Arm weakness - ask patient to raise both arms palms up for 10 seconds', 'Speech - ask patient to repeat a simple sentence', 'Time - exact time of onset OR last known well (LKW)', 'Blood glucose - exclude hypo as a stroke mimic', 'GCS / AVPU - level of consciousness', 'Pupils - size, symmetry, reaction to light'],
    management: ['Maintain SpO2 > 94% - oxygen only if hypoxic', 'Head of bed at 30 degrees - reduce intracranial pressure', 'Keep nil by mouth - swallow assessment before anything oral', 'Record vital signs every 15 minutes', 'Thrombolysis (alteplase) within 4.5 hours if meets criteria', 'Avoid excessive BP lowering unless SBP > 220'],
    redflags: ['Sudden onset of FAST symptoms', 'Time of onset / LKW > 4.5 hours', 'Seizure at onset', 'GCS < 13', 'Rapidly deteriorating conscious level', 'Blood glucose < 4 mmol/L', 'Anticoagulant therapy - increased bleeding risk'],
    rp: ['/me assesses the patient using the FAST stroke scale', '/me asks the patient to smile and notes any asymmetry', '/me asks to raise both arms and hold for 10 seconds', '/me asks the patient to repeat a simple sentence', '/me checks blood glucose via finger-prick test', '/me attaches ECG leads and observes the rhythm strip', '/me positions the patient at 30 degrees head elevation'],
    questions: ['What time did these symptoms start?', 'When were you last completely normal?', 'Can you lift both arms for me?', 'Can you repeat this sentence?', 'Do you have any weakness or numbness down one side?', 'Are you on any blood-thinning medication?'],
    handover: 'ONSET / LKW: [HH:MM] | FAST: FACE [Y/N] ARM [Y/N] SPEECH [Y/N] | GCS: [E][V][M]=[total] | BM: [mmol/L] | SBP: [value] | HR: [value] | ECG: SR / AF / OTHER | ANTICOAG: YES / NO | DEST: HASU / CSC / ED'
  },
  'anaphylaxis': {
    title: 'Anaphylaxis',
    priorities: ['Remove the trigger if possible', 'Call for help immediately - anaphylaxis requires team response', 'IM Adrenaline 500mcg (0.5mL of 1:1000) - anterolateral thigh', 'Position supine with legs elevated', 'High-flow oxygen via non-rebreathe mask if respiratory compromise', 'IV access if not delaying adrenaline administration', 'After initial response - chlorphenamine 10mg + hydrocortisone 200mg', 'Observe for biphasic reaction - up to 12 hours'],
    assessment: ['Airway compromise - stridor, hoarse voice, tongue swelling, laryngeal oedema', 'Breathing - wheeze, respiratory distress, increased work of breathing', 'Circulation - hypotension, tachycardia, signs of shock', 'Skin - generalised urticaria, erythema, angioedema (lips, eyes, face)', 'Gastrointestinal - nausea, vomiting, abdominal pain'],
    management: ['Adrenaline 500mcg IM - the FIRST line treatment, do not delay', 'Repeat adrenaline IM after 5 minutes if no improvement', 'Oxygen 15L/min via non-rebreathe mask', 'IV fluids - 500mL to 1000mL crystalloid bolus for hypotension', 'Chlorphenamine 10mg IM/IV slow - antihistamine', 'Hydrocortisone 200mg IM/IV slow - steroid', 'Salbutamol nebuliser 5mg if severe bronchospasm'],
    redflags: ['Airway compromise - stridor, hoarse voice, difficulty speaking', 'Rapid onset - minutes after exposure', 'Hypotension or loss of consciousness', 'Previous anaphylaxis with similar trigger', 'Poor response to first adrenaline dose', 'Biphasic reaction - recurrence after initial recovery'],
    rp: ['/me recognises the signs of anaphylaxis and calls for immediate assistance', '/me removes the trigger and positions the patient supine with legs elevated', '/me prepares 1:1000 adrenaline 500mcg and administers IM into the anterolateral thigh', '/me applies high-flow oxygen at 15 L/min via a non-rebreathing mask', '/me reassesses the patient after 3 minutes', '/me gains IV access and prepares a 500mL bolus of warmed crystalloid'],
    questions: ['What did you eat or come into contact with?', 'Do you have any known allergies?', 'Have you had a reaction like this before?', 'Do you have an adrenaline auto-injector?', 'When did the symptoms first start?', 'Are you having difficulty swallowing or breathing?'],
    handover: 'TRIGGER: [known/unknown] | ONSET: IMMEDIATE / [minutes] | AIRWAY: STRIDOR / HOARSE / CLEAR | BREATHING: WHEEZE / DISTRESS / NORMAL | CIRCULATION: BP [value] HR [value] | ADRENALINE: [x] doses | RESPONSE: GOOD / PARTIAL / POOR'
  },
  'seizure': {
    title: 'Seizure - Adult',
    priorities: ['Time the seizure - note exact start time', 'Protect the airway - do NOT insert anything into the mouth', 'Move hazards away from the patient', 'Cushion the head with a soft object', 'Remove restrictive clothing', 'Do NOT restrain the patient', 'After the seizure - C-spine if fall, AVPU, airway check', 'Blood glucose - seizure may be caused by hypoglycaemia', 'Midazolam 10mg buccal/IM if seizure > 5 minutes'],
    assessment: ['Seizure type - generalised tonic-clonic, focal, absence', 'Duration of the active seizure', 'Airway during and after the seizure', 'Breathing - respiratory rate and SpO2', 'Post-ictal state - level of consciousness, confusion', 'Blood glucose - capillary test', 'Injury assessment - tongue, head, shoulder'],
    management: ['Midazolam 10mg buccal or IM (first line) - repeat once after 10 min', 'IV lorazepam 4mg (if IV access and trained)', 'OR diazepam 10mg PR if no other route available', 'Treat hypoglycaemia if BM < 4 - glucagon IM 1mg or 50mL 50% dextrose IV', 'Oxygen if hypoxic during the post-ictal phase', 'Transport to ED for first or prolonged seizure'],
    redflags: ['Seizure lasting > 5 minutes - status epilepticus', 'Multiple seizures without recovery between', 'First seizure ever - requires ED assessment', 'Seizure in pregnancy - eclampsia until proven otherwise', 'Prolonged post-ictal confusion > 30 minutes', 'Focal seizure - may indicate structural brain lesion'],
    rp: ['/me notes the time the seizure started and moves hazards away', '/me cushions the patient head with a rolled-up jacket or blanket', '/me takes a protective position without restraining the patient', '/me times the seizure duration', '/me clears the airway once the seizure stops', '/me assesses the patient breathing and SpO2 post-ictal', '/me checks blood glucose via finger-prick test'],
    questions: ['Has this seizure ever happened before?', 'Do you have epilepsy or a seizure disorder?', 'Did you miss any seizure medication?', 'Did you hit your head during the seizure?', 'Are you pregnant or could you be pregnant?', 'Have you taken any alcohol or drugs today?'],
    handover: 'SEIZURE TYPE: GENERALISED / FOCAL / OTHER | DURATION: [mins] | RECOVERED: YES / NO | POST-ICTAL GCS: [E][V][M]=[total] | BM: [mmol/L] | HEAD INJURY: YES / NO | FIRST SEIZURE: YES / NO | KNOWN EPILEPSY: YES / NO | MEDICATION: [drug] [dose]'
  },
  'respiratory': {
    title: 'Respiratory Distress',
    priorities: ['Airway assessment - patent? obstruction? stridor?', 'Position upright - tripod position to optimise breathing', 'Oxygen if SpO2 < 94% - titrate to 94-98%', 'Nebulised salbutamol 5mg if asthmatic or COPD exacerbation', 'Ipratropium bromide 500mcg nebulised added if severe', 'Auscultate chest - identify wheeze, crackles, silent chest', 'Continuous monitoring - SpO2, RR, HR, conscious level', 'Consider NIV (CPAP/BiPAP) if worsening despite treatment'],
    assessment: ['Respiratory rate and depth', 'SpO2 - target 94-98% (88-92% if at risk of CO2 retention)', 'Auscultation - wheeze, crackles, silent chest, reduced breath sounds', 'Accessory muscle use', 'Ability to speak in full sentences', 'Percussion - dull (consolidation/effusion), hyperresonant (pneumothorax)', 'Tracheal deviation - suggests tension pneumothorax'],
    management: ['Oxygen therapy - target SpO2 94-98% (88-92% if known CO2 retainer)', 'Salbutamol 5mg nebulised - driven by oxygen', 'Ipratropium bromide 500mcg nebulised - add if severe', 'Hydrocortisone 200mg IV or prednisolone 40-50mg PO for acute asthma/COPD', 'Magnesium sulphate 2g IV over 20 min if severe asthmatic not responding', 'CPAP/BiPAP if type 1 respiratory failure not improving', 'Needle thoracostomy if tension pneumothorax'],
    redflags: ['Silent chest - NO breath sounds (critically severe obstruction)', 'Inability to speak in sentences', 'Respiratory rate > 30 or < 8', 'SpO2 < 88% despite high-flow oxygen', 'Drowsiness or confusion - CO2 narcosis', 'Tracheal deviation with distended neck veins - tension pneumothorax', 'GCS falling - respiratory fatigue / impending arrest'],
    rp: ['/me positions the patient upright in the tripod position', '/me attaches the pulse oximeter and sets up high-flow oxygen', '/me auscultates the chest for wheeze or crackles', '/me prepares and administers a salbutamol 5mg nebuliser', '/me adds ipratropium bromide 500mcg to the nebuliser', '/me assesses ability to speak in full sentences', '/me gains IV access and draws up IV hydrocortisone 200mg'],
    questions: ['When did the breathing difficulty start?', 'Do you have asthma or COPD?', 'Have you used your inhaler?', 'Can you speak in full sentences?', 'Are you coughing anything up?', 'Do you have any chest pain or fever?'],
    handover: 'DIAGNOSIS: ASTHMA / COPD / PNEUMONIA / PE / OTHER | RR: [value] | SpO2: [%] | HR: [value] | BP: [value] | SPEECH: FULL SENTENCES / PHRASES / WORDS | AUSCULTATION: WHEEZE / CRACKLES / SILENT CHEST / CLEAR | SALBUTAMOL: [x] NEB | OXYGEN: [L/min] | DEST: ED / RESP UNIT / ICU'
  },
  'haemorrhage': {
    title: 'Major Haemorrhage',
    priorities: ['Scene safety - blood-borne virus PPE', 'Identify and expose the source of bleeding', 'Direct pressure immediately', 'Tourniquet if life-threatening limb bleeding - note time', 'Haemostatic dressing for junctional wounds', 'Pelvic binder if suspected pelvic fracture', 'IV/IO access - 2x large-bore cannulae (14G or 16G)', 'Tranexamic acid 1g IV over 10 minutes', 'Activate major haemorrhage protocol if > 2L blood loss'],
    assessment: ['Source of bleeding - external visible wound / internal concealed', 'Severity - amount of blood loss, rate of bleeding', 'Signs of shock - tachycardia, pallor, delayed CRT, cool peripheries', 'Blood pressure - compensatory then decompensated', 'Level of consciousness - falling GCS', 'Capillary refill time - prolonged > 2 seconds'],
    management: ['Direct pressure for minimum 10 minutes before reassessing', 'Tourniquet applied 5-8 cm above wound - tightened until bleeding stops', 'Haemostatic dressing packed into wound cavity - hold pressure 3 min', 'Pelvic binder at greater trochanter level', 'Tranexamic acid 1g IV (within 3 hours of injury)', 'IV fluids - warmed crystalloid 250-500mL boluses (SBP 80-90)', 'Chest seal for open/sucking pneumothorax', 'Do NOT remove penetrating objects'],
    redflags: ['SBP < 90 mmHg - decompensated shock', 'Bleeding not controlled by direct pressure + haemostatic', 'Intra-abdominal bleeding with distension', 'Anticoagulant use with any haemorrhage', 'Penetrating torso trauma with hypotension'],
    rp: ['/me confirms scene safety and dons gloves, apron and eye protection', '/me exposes the injury site by cutting away clothing', '/me applies direct pressure onto the wound using sterile gauze', '/me applies a tourniquet 5-8 cm above the wound', '/me notes the time of tourniquet application', '/me gains IV access with a 14G cannula in the antecubital fossa', '/me administers 1g tranexamic acid IV over 10 minutes'],
    questions: ['Where are you bleeding from?', 'Are you on any blood-thinning medication?', 'Do you feel dizzy or lightheaded?', 'Can you feel your hands and feet?', 'When did the injury happen?'],
    handover: 'MECHANISM: [blunt/penetrating] | SITE: [limb/torso/neck] | CONTROL: PRESSURE / TOURNIQUET / HAEMOSTATIC / BINDER | TOURNIQUET TIME: [HH:MM] | TXA: YES / NO | SBP: [value] | HR: [value] | EST BLOOD LOSS: [mL] | SHOCK: YES / NO | DEST: MTC / TU / ED'
  },
  'sepsis': {
    title: 'Sepsis',
    priorities: ['Recognise red flags - NEWS2 > 5 or clinical suspicion + organ dysfunction', 'Call for senior help / sepsis team', 'Sepsis Six bundle - complete within 1 hour', 'High-flow oxygen to target SpO2 94-98%', 'Take blood cultures BEFORE antibiotics', 'IV antibiotics according to local formulary', 'IV fluid resuscitation - 500mL crystalloid boluses (up to 30 mL/kg)', 'Check lactate and blood gases', 'Monitor urine output'],
    assessment: ['Temperature - pyrexia, hypothermia, rigors', 'Heart rate - tachycardia common, bradycardia in late sepsis', 'Respiratory rate - tachypnoea', 'Blood pressure - hypotension (SBP < 100) is a red flag', 'Mental status - confusion, agitation, reduced GCS', 'Signs of infection source - chest, urine, abdomen, skin', 'Lactate - > 2 mmol/L indicates tissue hypoperfusion'],
    management: ['Oxygen - target SpO2 94-98% via non-rebreathe mask', 'Blood cultures - 2 sets from separate venepuncture sites', 'IV antibiotics - piperacillin-tazobactam 4.5g IV', 'IV fluids - 500mL crystalloid bolus stat, reassess', 'Check FBC, U+E, CRP, lactate, blood gases', 'IV paracetamol 1g for pyrexia', 'Vasopressors if refractory hypotension'],
    redflags: ['SBP < 90 mmHg - decompensating', 'Lactate > 4 mmol/L - severe tissue hypoperfusion', 'Respiratory rate > 25', 'GCS < 13 or acute confusion', 'Neutropenic sepsis - any fever in chemotherapy patient', 'Not improving after 1 hour of Sepsis Six'],
    rp: ['/me assesses for sepsis red flags using NEWS2', '/me applies high-flow oxygen via non-rebreathe mask at 15 L/min', '/me takes blood cultures from two separate venepuncture sites', '/me administers IV piperacillin-tazobactam 4.5g over 30 minutes', '/me administers a 500mL warmed crystalloid bolus', '/me checks lactate via venous blood gas', '/me reassesses the NEWS2 score after the fluid bolus'],
    questions: ['Do you feel feverish or have you been shivering?', 'Have you had any recent infections?', 'Have you been feeling generally unwell?', 'Have you had any recent surgery or procedures?', 'Do you have any long-term health conditions?'],
    handover: 'SOURCE: [chest/urine/abdo/skin/line] | RED FLAGS: SBP<90 / RR>25 / GCS<13 / LACTATE [mmol/L] | NEWS2: [value] | ABX: [drug] [dose] | FLUIDS: [mL] | LACTATE: [mmol/L] | BP: [value] | HR: [value] | DEST: ED / HDU / ICU'
  },
  'overdose': {
    title: 'Overdose and Poisoning',
    priorities: ['ABC assessment - airway and breathing first in any overdose', 'Check level of consciousness - GCS / AVPU', 'Identify the substance - tablets, packaging, witness history', 'Estimate quantity, time of ingestion and route', 'Call for help early - many overdoses deteriorate quickly', 'Monitor respiratory rate - opioid overdose causes respiratory depression', 'Naloxone 400-800mcg IM/IV for suspected opioid poisoning', '12-lead ECG for cardiotoxic substances', 'Transport to ED - all intentional overdoses require assessment'],
    assessment: ['Level of consciousness - GCS trend is critical', 'Respiratory rate and depth - aim for RR > 12', 'Pupil size and reaction - pinpoint (opioids), dilated (TCAs, amphetamines)', 'ECG - QRS widening (TCA), QT prolongation (antipsychotics, methadone)', 'Skin - sweating (serotonin syndrome), dry (anticholinergics)', 'Temperature - hyperpyrexia (serotonin syndrome, MDMA)'],
    management: ['Naloxone 400-800mcg IM/IV - repeat every 2-3 min up to 10mg', 'IV fluids - crystalloid for hypotension', 'Sodium bicarbonate 8.4% 50mL IV for TCA with QRS > 120ms', 'Benzodiazepines for seizure control - diazepam 10mg IV', 'N-acetylcysteine (NAC) for paracetamol overdose - IV infusion', 'ECG monitoring for arrhythmias'],
    redflags: ['GCS < 8 or dropping - airway protection required', 'Respiratory rate < 10 - naloxone and ventilatory support', 'QRS > 120ms - sodium bicarbonate needed', 'QTc > 500ms - risk of torsades de pointes', 'Seizures or cardiac arrhythmias', 'Mixed overdose - especially opioid + sedative + alcohol'],
    rp: ['/me assesses the patient level of consciousness using AVPU', '/me checks respiratory rate over 30 seconds', '/me checks pupil size and reaction to light', '/me collects medication packets found at the scene', '/me contacts relatives to confirm what was taken', '/me administers naloxone 400mcg IM into the anterolateral thigh', '/me attaches the 12-lead ECG and examines the trace'],
    questions: ['What did you take?', 'How much did you take?', 'When did you take it?', 'Did you take anything else including alcohol?', 'Is this a regular medication?', 'Have you had any vomiting?'],
    handover: 'SUBSTANCE: [name] | QUANTITY: [dose] | TIME: [HH:MM] | CO-INGESTANTS: ALCOHOL / OTHER / NONE | GCS: [E][V][M]=[total] | RR: [value] | SpO2: [%] | ECG: SR / QRS WIDENING / QT PROLONG | PUPILS: PINPOINT / DILATED / NORMAL | NALOXONE: [dose] | RESPONSE: YES / NO | DEST: ED / RESUS / MH ACT'
  },
  'hypothermia': {
    title: 'Hypothermia',
    priorities: ['Remove the patient from the cold environment', 'Remove wet clothing and dry the patient', 'Cover with warm blankets and a foil blanket/body bag', 'Passively rewarm - head and neck covered, reflective blanket', 'Active warming - forced air warming, warmed IV fluids', 'Handle the patient gently - avoid rough movement (risk of cardiac arrest)', 'Assess conscious level - mild, moderate or severe hypothermia', 'Monitor core temperature - tympanic or oesophageal', 'ECG monitoring - look for J (Osborn) waves'],
    assessment: ['Core temperature: mild 32-35 C, moderate 28-32 C, severe < 28 C', 'Conscious level - mild: shivering, confusion; moderate: reduced GCS, no shivering; severe: unconscious', 'Respiratory rate - progressive bradypnoea as temperature drops', 'Heart rate - progressive bradycardia, atrial fibrillation common', 'ECG - Osborn (J) waves in V4-V6, prolonged PR/QT', 'Blood glucose - hyperglycaemia then hypoglycaemia'],
    management: ['Mild (32-35 C): passive external rewarming - blankets, warm room', 'Moderate (28-32 C): active external rewarming - forced air, warm IV fluids', 'Severe (< 28 C): active internal rewarming - warmed IV fluids, warm oxygen', 'Warmed crystalloid IV (40 C) - avoid cold fluids', 'Monitor for afterdrop - core temp continues falling after removal from cold', 'Treat hypoglycaemia and correct fluid losses'],
    redflags: ['Core temperature < 28 C - high risk of VF/pVT arrest', 'No shivering - indicates moderate-severe hypothermia', 'GCS < 8 - airway protection required', 'ECG with J waves + bradycardia', 'Hypothermic cardiac arrest - not dead until warm and dead'],
    rp: ['/me removes the patient from the cold environment and moves them inside', '/me removes wet layers of clothing and dries the patient thoroughly', '/me wraps the patient in a warmed foil blanket and standard blankets', '/me covers the head and neck with a hat and scarf', '/me measures core temperature using a low-reading tympanic thermometer', '/me attaches a 3-lead ECG and examines for J waves', '/me gains IV access and attaches a fluid warmer set to 40 degrees'],
    questions: ['How long were you out in the cold?', 'Were you wearing appropriate clothing?', 'Do you feel very cold or have you stopped shivering?', 'Have you taken any alcohol or drugs today?', 'Do you have any medical conditions?'],
    handover: 'CORE TEMP: [C] | SEVERITY: MILD / MODERATE / SEVERE | GCS: [E][V][M]=[total] | SHIVERING: YES / NO | ECG: SR / AF / J WAVES / VF | HR: [value] | BP: [value] | REWARMING: PASSIVE / ACTIVE EXTERNAL / ACTIVE INTERNAL | DEST: ED / ECMO CENTRE'
  },
  'burns': {
    title: 'Burns',
    priorities: ['Scene safety - no fire, no chemical, no electrical risk', 'Stop the burning process - remove clothing, cool the burn', 'Cool running water over the burn for 20 minutes', 'ABCDE assessment - burns can be distracting, assess for other injuries', 'Cover the burn with cling film or sterile non-adherent dressing', 'Assess TBSA - Wallace rule of 9s or palmar method', 'IV access through unburned skin if possible', 'IV fluids - Parkland formula: 4 mL x TBSA% x weight (kg) in first 24hr', 'Analgesia - morphine 2.5-5mg IV titrated', 'Airway management - early intubation if inhalation injury'],
    assessment: ['Type of burn: thermal, chemical, electrical, radiation', 'Depth - superficial (erythema), partial-thickness (blisters, moist), full-thickness (white/charred, dry)', 'TBSA - Wallace rule of 9s: head 9%, arm 9%, leg 18%, front 18%, back 18%', 'Airway - facial burns, singed nasal hairs, carbonaceous sputum, stridor', 'Breathing - inhalation injury, carbon monoxide poisoning', 'Circumferential burns to limbs - check distal pulses and CRT'],
    management: ['Cool the burn - 20 minutes of cool running water (do not use ice)', 'Cover with cling film or sterile non-adherent burn dressing', 'Parkland formula: 4mL x TBSA% x weight (kg) = total first 24hr fluid', 'Analgesia - morphine 2.5-5mg IV titrated to pain', 'Burn > 10% TBSA in adults - IV fluids mandatory', 'Face and neck burns - early intubation before airway oedema worsens', 'Carbon monoxide - high-flow oxygen, check COHb levels', 'Pre-alert burns centre for significant burns'],
    redflags: ['Airway compromise - stridor, hoarse voice, facial swelling', 'Burn > 25% TBSA - consider as major trauma', 'Full-thickness circumferential burns to limb, torso or neck', 'Inhalation injury - enclosed space, carbonaceous sputum, facial burns', 'Electrical burns - may have hidden internal injury'],
    rp: ['/me ensures the scene is safe and removes the patient from the burn source', '/me cools the burn under running cool water for 20 minutes', '/me assesses the extent of the burn using the Wallace rule of 9s', '/me covers the burn with transparent cling film applied loosely', '/me gains IV access through unburned skin and calculates Parkland fluid needs', '/me administers morphine 2.5mg IV for pain relief', '/me checks for circumferential burns to the limbs and distal pulses'],
    questions: ['How did the burn happen?', 'When did the burn happen?', 'Was it in an enclosed space?', 'Were you exposed to any smoke or fumes?', 'Do you have any pain elsewhere besides the burn?', 'Do you have any medical conditions?', 'Are you up to date with your tetanus vaccination?'],
    handover: 'MECHANISM: THERMAL / CHEMICAL / ELECTRICAL | ENCLOSED SPACE: YES / NO | TBSA: [%] | DEPTH: SUPERFICIAL / PARTIAL / FULL-THICKNESS | FACE: [Y/N] | HANDS: [Y/N] | FEET: [Y/N] | CIRCUMFERENTIAL: [Y/N] | AIRWAY: STRIDOR / HOARSE / CLEAR | INHALATION: YES / NO | FLUIDS: [mL] PARKLAND | MORPHINE: [mg] | DEST: BURNS CENTRE / ED'
  }
};

function activateEmergency(key) {
  var data = emergencyData[key];
  if (!data) return;
  document.getElementById('emergency-title').textContent = data.title;
  document.getElementById('emergency-priorities').innerHTML = '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">' + (data.priorities || []).map(function(p, i) { return '<li style="padding:6px 10px;background:#0f2029;border-radius:6px;font-size:13px;border-left:3px solid #41b6e6">' + (i+1) + '. ' + escapeHtml(p) + '</li>'; }).join('') + '</ul>' || '<p class="muted">No priorities listed.</p>';
  document.getElementById('emergency-assessment').innerHTML = '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">' + (data.assessment || []).map(function(p) { return '<li style="padding:6px 10px;background:#0f2029;border-radius:6px;font-size:13px">' + escapeHtml(p) + '</li>'; }).join('') + '</ul>' || '<p class="muted">No assessment steps listed.</p>';
  document.getElementById('emergency-management').innerHTML = '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">' + (data.management || []).map(function(p) { return '<li style="padding:6px 10px;background:#0f2029;border-radius:6px;font-size:13px;border-left:3px solid #005eb8">' + escapeHtml(p) + '</li>'; }).join('') + '</ul>' || '<p class="muted">No management steps listed.</p>';
  document.getElementById('emergency-redflags').innerHTML = '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">' + (data.redflags || []).map(function(p) { return '<li style="padding:6px 10px;background:#2a1018;border-radius:6px;font-size:13px;border-left:3px solid #a9313e">' + escapeHtml(p) + '</li>'; }).join('') + '</ul>' || '<p class="muted">No red flags listed.</p>';
  document.getElementById('emergency-rp').innerHTML = '<div style="display:grid;gap:8px">' + (data.rp || []).map(function(r, i) {
    return '<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;background:#0f2029;border:1px solid #203842;border-radius:8px;padding:8px 10px"><span style="font-size:12px;font-family:monospace;color:#b0c5cc">' + escapeHtml(r) + '</span><button onclick="copyTextInline(\'' + escapeHtml(r) + '\')" style="background:#18313c;color:#dff5f5;border:1px solid #31535f;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap">Copy</button></div>';
  }).join('') || '<p class="muted" style="padding:12px">No RP actions listed.</p>';
  document.getElementById('emergency-questions').innerHTML = '<div style="display:grid;gap:8px">' + (data.questions || []).map(function(q) {
    return '<div style="padding:10px 12px;background:#0f2029;border:1px solid #203842;border-radius:8px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px"><span style="font-size:12px;color:#41b6e6;font-family:monospace">/tts ' + escapeHtml(q) + '</span><button onclick="copyTextInline(\'/tts ' + escapeHtml(q) + '\')" style="background:#18313c;color:#dff5f5;border:1px solid #31535f;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap">TTS</button></div>';
  }).join('') || '<p class="muted" style="padding:12px">No questions listed.</p>';
  document.getElementById('emergency-handover').textContent = data.handover || 'No handover summary available.';
  document.getElementById('emergency-active').style.display = '';
}

function deactivateEmergency() {
  document.getElementById('emergency-active').style.display = 'none';
}

function copyEmergencyHandover() {
  var el = document.getElementById('emergency-handover');
  if (!el) return;
  copyTextInline(el.textContent);
}

/* Drag-and-drop for RP actions */
function enableDragReorder(containerId, itemsArray, saveFn, renderFn) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.drag-handle').forEach(function(handle, idx) {
    handle.setAttribute('draggable', 'true');
    handle.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/plain', idx);
      this.closest('.edit-item-wrap').classList.add('dragging');
    });
    handle.addEventListener('dragend', function() {
      document.querySelectorAll('.edit-item-wrap').forEach(function(el) { el.classList.remove('dragging', 'drag-over'); });
    });
  });
  container.addEventListener('dragover', function(e) {
    e.preventDefault();
    var target = e.target.closest('.edit-item-wrap');
    if (target) target.classList.add('drag-over');
  });
  container.addEventListener('dragleave', function(e) {
    var target = e.target.closest('.edit-item-wrap');
    if (target) target.classList.remove('drag-over');
  });
  container.addEventListener('drop', function(e) {
    e.preventDefault();
    var from = parseInt(e.dataTransfer.getData('text/plain'));
    var target = e.target.closest('.edit-item-wrap');
    if (!target || isNaN(from)) return;
    var to = parseInt(target.dataset.index);
    if (from === to) return;
    var item = itemsArray.splice(from, 1)[0];
    itemsArray.splice(to, 0, item);
    if (saveFn) saveFn();
    if (renderFn) renderFn();
  });
}

window.showEquipmentCategory = showEquipmentCategory;
window.activateEmergency = activateEmergency;
window.deactivateEmergency = deactivateEmergency;
window.toggleMobileMenu = toggleMobileMenu;

/* =========================================================
   ADMIN PORTAL - Tab system and content management
========================================================= */

function showAdminTab(tab) {
  var tabs = ['dashboard', 'staff', 'content', 'rp', 'medications', 'equipment', 'documents', 'foundation', 'backup', 'cms'];
  var prefixes = ['adminDashTab', 'adminStaffTab', 'adminContentTab', 'adminRpTab', 'adminMedsTab', 'adminEquipTab', 'adminDocsTab', 'adminFoundationTab', 'adminBackupTab', 'adminCmsTab'];
  tabs.forEach(function(t, i) {
    var panel = document.getElementById(prefixes[i]);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.admintab').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + tab + "'") >= 0 || onclick.indexOf('"' + tab + '"') >= 0);
  });
  if (tab === 'cms') cmsInit();
  if (tab === 'foundation') cms2Init();
  if (tab === 'documents') loadAdminDocuments();
  if (tab === 'rp') renderAdminRpActions();
}

/* =========================================================
   CMS RETIREMENT CHECK
   Read-only admin diagnostic. Useful on Render Free plans
   where Shell/SSH is unavailable.
========================================================= */
async function runCmsRetirementCheck() {
  var container = document.getElementById('cmsRetirementCheckResult');
  if (!container) return;

  container.style.display = 'block';
  container.innerHTML = '<p class="muted">Checking production CMS…</p>';

  try {
    var report = await api('/api/admin/cms-retirement-check');

    var safe = report.safe_to_retire_legacy_table === true;
    var blockers = Array.isArray(report.blockers) ? report.blockers : [];
    var missing = report.legacy && Array.isArray(report.legacy.missing_structured_equivalent)
      ? report.legacy.missing_structured_equivalent
      : [];

    var legacyTotal = report.legacy ? Number(report.legacy.total || 0) : 0;
    var legacyPublished = report.legacy ? Number(report.legacy.published || 0) : 0;

    var html = '';
    html += '<div style="padding:14px;border:1px solid ' +
      (safe ? '#315f46' : '#664d2a') +
      ';border-radius:10px;background:#0f2029">';

    html += '<div style="font-weight:700;font-size:15px;margin-bottom:10px">' +
      (safe ? '✅ Safe to retire legacy table' : '⚠️ Legacy retirement is not ready') +
      '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px">';
    html += '<div class="info"><strong>Legacy records</strong><br>' + legacyTotal + '</div>';
    html += '<div class="info"><strong>Legacy published</strong><br>' + legacyPublished + '</div>';
    html += '<div class="info"><strong>Missing structured</strong><br>' + missing.length + '</div>';
    html += '<div class="info"><strong>Blockers</strong><br>' + blockers.length + '</div>';
    html += '</div>';

    if (blockers.length) {
      html += '<div style="margin-top:8px"><strong>Blockers</strong><ul style="margin:6px 0 0 20px">';
      blockers.forEach(function(item) {
        html += '<li>' + escapeHtml(String(item)) + '</li>';
      });
      html += '</ul></div>';
    }

    if (missing.length) {
      html += '<details style="margin-top:10px"><summary><strong>' +
        missing.length + ' legacy records need structured equivalents</strong></summary>';
      html += '<div style="max-height:220px;overflow:auto;margin-top:8px">';
      missing.forEach(function(item) {
        html += '<div style="padding:5px 0;border-bottom:1px solid #203542;font-size:12px">' +
          escapeHtml((item.content_type || '') + ': ' + (item.content_key || '')) +
          '</div>';
      });
      html += '</div></details>';
    }

    html += '<p class="muted" style="margin:10px 0 0;font-size:11px">Generated: ' +
      escapeHtml(String(report.generated_at || '')) + '</p>';
    html += '</div>';

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML =
      '<div style="padding:12px;border:1px solid #663c3c;border-radius:10px;background:#201316">' +
      '<strong>❌ Check failed</strong><p class="muted" style="margin:6px 0 0">' +
      escapeHtml(error && error.message ? error.message : 'Unable to run the check.') +
      '</p></div>';
  }
}


async function runCmsLegacyMigration() {
  var confirmed = confirm(
    'This will copy all legacy editable_content records into the structured CMS as DRAFT content.\n\n' +
    'Nothing in the legacy table will be deleted or modified.\n\n' +
    'Continue?'
  );
  if (!confirmed) return;

  var container = document.getElementById('cmsRetirementCheckResult');
  if (container) {
    container.style.display = 'block';
    container.innerHTML = '<p class="muted">Migrating legacy content safely… Please do not close this page.</p>';
  }

  try {
    var result = await api('/api/admin/cms-migrate-legacy', {
      method: 'POST',
      body: { confirm: 'MIGRATE_LEGACY_CONTENT' }
    });
    var r = result.result || {};
    var mr = r.migration_result || {};
    if (container) {
      container.innerHTML =
        '<div style="padding:14px;border:1px solid #315f46;border-radius:10px;background:#0f2029">' +
        '<strong>✅ Legacy migration completed</strong>' +
        '<p class="muted" style="margin:6px 0 10px">' + escapeHtml(result.message || '') + '</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
        '<div class="info"><strong>Blocks</strong><br>' + Number(mr.blocks || 0) + '</div>' +
        '<div class="info"><strong>Sections</strong><br>' + Number(mr.sections || 0) + '</div>' +
        '<div class="info"><strong>Navigation</strong><br>' + Number(mr.navigation || 0) + '</div>' +
        '<div class="info"><strong>Categories</strong><br>' + Number(mr.categories || 0) + '</div>' +
        '<div class="info"><strong>Versions</strong><br>' + Number(mr.versions || 0) + '</div>' +
        '</div></div>';
    }
    showToast('Legacy content migrated as drafts', 'success');
    await runCmsRetirementCheck();
    if (typeof cms2RefreshSources === 'function') await cms2RefreshSources();
    if (typeof cms2List === 'function') await cms2List();
  } catch (error) {
    if (container) {
      container.innerHTML =
        '<div style="padding:12px;border:1px solid #663c3c;border-radius:10px;background:#201316">' +
        '<strong>❌ Migration failed</strong><p class="muted" style="margin:6px 0 0">' +
        escapeHtml(error && error.message ? error.message : 'Unable to migrate legacy content.') +
        '</p></div>';
    }
    showToast('Migration failed: ' + (error && error.message ? error.message : ''), 'error');
  }
}

async function promoteCmsMigrated() {
  var confirmed = confirm(
    'This will PUBLISH structured content that was published in the legacy CMS.\n\n' +
    'It will not delete the legacy records. Migrated navigation remains draft for manual approval.\n\n' +
    'Continue?'
  );
  if (!confirmed) return;

  var container = document.getElementById('cmsRetirementCheckResult');
  if (container) {
    container.style.display = 'block';
    container.innerHTML = '<p class="muted">Publishing migrated content…</p>';
  }

  try {
    var result = await api('/api/admin/cms-promote-migrated', {
      method: 'POST',
      body: { confirm: 'PUBLISH_MIGRATED_CONTENT' }
    });
    var r = result.result || {};
    showToast('Published ' + Number(r.published_blocks || 0) + ' migrated content blocks', 'success');
    await runCmsRetirementCheck();
    if (typeof cms2RefreshSources === 'function') await cms2RefreshSources();
    if (typeof cms2List === 'function') await cms2List();
  } catch (error) {
    if (container) {
      container.innerHTML =
        '<div style="padding:12px;border:1px solid #663c3c;border-radius:10px;background:#201316">' +
        '<strong>❌ Publish failed</strong><p class="muted" style="margin:6px 0 0">' +
        escapeHtml(error && error.message ? error.message : 'Unable to publish migrated content.') +
        '</p></div>';
    }
    showToast('Publish failed: ' + (error && error.message ? error.message : ''), 'error');
  }
}

/* Load admin documents list */
async function loadAdminDocuments() {
  var container = document.getElementById('adminDocList');
  if (!container) return;
  container.innerHTML = '<p class="muted">Loading...</p>';
  try {
    var sections = ['hart', 'hems', 'training', 'staff-handbook', 'docs', 'slides', 'rp', 'equipment', 'admin'];
    var html = '';
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      var result = await api('/api/documents/' + encodeURIComponent(s));
      if (result && result.documents && result.documents.length > 0) {
        html += '<div class="admin-category-section"><h3 style="font-size:14px;color:#eaf2f4;margin:16px 0 8px;border-left:3px solid #41b6e6;padding-left:10px">' + s.charAt(0).toUpperCase() + s.slice(1) + '</h3>';
        result.documents.forEach(function(doc) {
          html += '<div class="admin-doc-row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0f2029;border:1px solid #29434f;border-radius:8px;margin:4px 0">';
          html += '<span style="color:#c9d6da;font-size:13px">' + escapeHtml(doc.name) + '</span>';
          html += '<button class="danger-small" onclick="deleteAdminDoc(' + doc.id + ', \'' + s + '\')">Remove</button>';
          html += '</div>';
        });
        html += '</div>';
      }
    }
    if (!html) html = '<p class="muted">No documents uploaded yet.</p>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<p class="muted">Error loading documents.</p>';
  }
}

async function deleteAdminDoc(id, section) {
  if (!confirm('Delete this document?')) return;
  try {
    await api('/api/documents/by-id/' + encodeURIComponent(id), { method: 'DELETE' });
    showToast('Document deleted', 'success');
    loadAdminDocuments();
    renderStoredPdfDocs();
  } catch(e) {
    showToast('Failed to delete', 'error');
  }
}

/* Render admin RP actions */
async function renderAdminRpActions() {
  var container = document.getElementById('adminRpList');
  var searchInput = document.getElementById('adminRpSearch');
  if (!container) return;
  await loadUserRpActions();
  var query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  var filtered = userRpActions.filter(function(a) {
    if (!query) return true;
    return (a.name || '').toLowerCase().indexOf(query) >= 0 ||
           (a.command || '').toLowerCase().indexOf(query) >= 0 ||
           (a.category || '').toLowerCase().indexOf(query) >= 0;
  });
  if (filtered.length === 0) {
    container.innerHTML = '<p class="muted">' + (query ? 'No matching actions.' : 'No custom RP actions yet.') + '</p>';
    return;
  }
  var html = '';
  filtered.forEach(function(a, i) {
    var realIndex = userRpActions.indexOf(a);
    html += '<div class="rp-card" style="margin:6px 0">';
    html += '<div class="rp-card-header">';
    html += '<span style="font-weight:700;color:#eaf2f4;font-size:13px">' + escapeHtml(a.name || '') + '</span>';
    html += '<span style="font-size:11px;color:#7a95a3">' + (a.category || 'General') + '</span>';
    html += '</div>';
    html += '<div class="rp-card-body" style="font-size:12px;padding:10px 16px">/me ' + escapeHtml(a.command || '') + '</div>';
    html += '<div class="rp-card-actions" style="padding:8px 16px">';
    html += '<button class="secondary" onclick="editRpAction(' + realIndex + ')">Edit</button>';
    html += '<button class="secondary" onclick="duplicateRpAction(' + realIndex + ')">Duplicate</button>';
    html += '<button class="danger-small" onclick="deleteRpAction(' + realIndex + ')">Delete</button>';
    html += '</div></div>';
  });
  container.innerHTML = html;
}

/* Content editor */
var adminContentKey = '';

function openContentEditor(key) {
  adminContentKey = key;
  var wrap = document.getElementById('adminContentEditorWrap');
  var title = document.getElementById('adminContentEditorTitle');
  var editor = document.getElementById('adminContentEditor');
  if (!wrap || !editor) return;
  wrap.style.display = '';
  title.textContent = 'Editing: ' + key.charAt(0).toUpperCase() + key.slice(1);
  var saved = localStorage.getItem('editor_' + key);
  if (saved) {
    editor.innerHTML = saved;
  } else {
    editor.innerHTML = '<h2>' + key.charAt(0).toUpperCase() + key.slice(1) + '</h2><p>Start editing this content...</p>';
  }
  var status = document.getElementById('adminEditorStatus');
  if (status) status.textContent = 'Editing ' + key + ' - changes save locally.';
}

function saveAdminContent() {
  var editor = document.getElementById('adminContentEditor');
  if (!editor) return;
  var content = editor.innerHTML;
  localStorage.setItem('editor_' + adminContentKey, content);
  var status = document.getElementById('adminEditorStatus');
  if (status) status.textContent = 'Saved at ' + new Date().toLocaleTimeString();
  showToast('Content saved locally', 'success');
}

function closeContentEditor() {
  var wrap = document.getElementById('adminContentEditorWrap');
  if (wrap) wrap.style.display = 'none';
}

/* Admin RP search */
document.addEventListener('DOMContentLoaded', function() {
  var searchInput = document.getElementById('adminRpSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      renderAdminRpActions();
    });
  }
});

window.showAdminTab = showAdminTab;
window.loadAdminDocuments = loadAdminDocuments;
window.deleteAdminDoc = deleteAdminDoc;
window.openContentEditor = openContentEditor;
window.saveAdminContent = saveAdminContent;
window.closeContentEditor = closeContentEditor;
window.renderAdminRpActions = renderAdminRpActions;

/* Dashboard favourites renderer */
function renderPatientQuestions() {
  var container = document.getElementById('patientQuestionsList');
  if (!container) return;
  var html = '';
  Object.keys(patientQuestionLib).forEach(function(cat) {
    html += '<div class="rp-category-header"><h3>' + cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ') + '</h3><span>' + patientQuestionLib[cat].length + ' questions</span></div>';
    patientQuestionLib[cat].forEach(function(q) {
      html += '<div class="tts-card">';
      html += '<div class="tts-command">' + escapeHtml(q) + '</div>';
      html += '<button class="act-copy" style="margin-top:6px" onclick="copyTextInline(\'' + escapeHtml(q) + '\')">Copy /tts</button>';
      html += '</div>';
    });
  });
  container.innerHTML = html || '<p class="muted">No questions loaded.</p>';
}

async function renderDashboardFavourites() {
  var container = document.getElementById("dashboardFavourites");
  if (!container) return;
  await loadUserRpActions();
  var favs = userRpActions.filter(function(a) { return userRpFavourites.indexOf(a.id) >= 0; });
  if (favs.length === 0) {
    container.innerHTML = '<p class="muted">Star actions from your RP library to see them here.</p>';
    return;
  }
  var html = "";
  favs.slice(0, 12).forEach(function(a) {
    html += '<div class="dash-quick-item"><span class="cmd">/me ' + escapeHtml(a.name) + '</span>';
    html += '<button class="copy-mini" onclick="copyTextInline(\'/me ' + escapeHtml(a.command) + '\')">Copy</button></div>';
  });
  container.innerHTML = html;
}
window.initRichEditor = initRichEditor;
window.saveEditorContent = saveEditorContent;
window.loadEditorContent = loadEditorContent;
window.insertImageToEditor = insertImageToEditor;
window.insertTableToEditor = insertTableToEditor;
window.renderDashboardFavourites = renderDashboardFavourites;

/* Render scene questions */
function renderSceneQuestions() {
  var container = document.getElementById('sceneQuestions');
  if (!container) return;
  var scene = sceneData[currentScene];
  if (!scene || !Array.isArray(scene.questions)) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = scene.questions.map(function(q) {
    return '<div class="scene-question">' + escapeHtml(q) + '</div>';
  }).join('');
}

/* =========================================================
   /ME + F8 SCENE TABS
========================================================= */

/* Context toggle function - shared pattern for all sections */
function setSectionContext(context, prefix, renderFn) {
  if (context !== 'bed' && context !== 'floor') context = 'bed';
  currentContext = context;
  document.querySelectorAll(`.${prefix}-context-btn`).forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.context === context) btn.classList.add('active');
  });
  renderFn();
}

function setSceneContext(context) {
  setSectionContext(context, 'scene', renderSceneRP);
}
function setProcedureContext(context) {
  setSectionContext(context, 'proc', renderProcedureRP);
}
function setDocContext(context) {
  setSectionContext(context, 'doc', renderDocRP);
}
function setStudentContext(context) {
  setSectionContext(context, 'student', () => {
    renderStudentTreatmentRP();
    renderStudentVitalsRP();
  });
}
function setCardiacContext(context) {
  setSectionContext(context, 'cardiac', renderCardiacRP);
}
function setSceneRPMode(mode) {
  if (
    mode !== 'slash' &&
    mode !== 'f8'
  ) {
    mode = 'slash';
  }

  currentSceneRPMode = mode;

  document
    .querySelectorAll('.srpt')
    .forEach(button => {

      button.classList.remove(
        'active'
      );

      const onclick =
        button.getAttribute('onclick') || '';

      const dataMode =
        button.dataset.mode ||
        button.dataset.rpMode ||
        '';

      if (
        dataMode === mode ||
        onclick.includes(
          `setSceneRPMode('${mode}')`
        ) ||
        onclick.includes(
          `setSceneRPMode("${mode}")`
        )
      ) {
        button.classList.add(
          'active'
        );
      }

    });

  renderSceneRP();
}

/* =========================================================
   RENDER SCENE RP
========================================================= */

function renderSceneRP() {
  const container =
    document.getElementById(
      'sceneRPList'
    );

  if (!container) return;

  const scene =
    sceneData[currentScene];

  if (
    !scene ||
    (!Array.isArray(scene.rp) && !Array.isArray(scene['rp_' + currentContext]))
  ) {
    container.innerHTML = '';
    return;
  }

  const defaultRpList = scene['rp_' + currentContext] || scene.rp;
  const contentKey = 'scene-rp-' + currentScene + '-' + currentContext;
  const rpList = getEditableItems(contentKey, defaultRpList);

  renderEditableList('sceneRPList', rpList, contentKey, (action, index) => {
    const command =
      currentSceneRPMode === 'f8'
        ? `ME ${action}`
        : `/me ${action}`;

    return `
      <div class="rp-item scene-rp-item">

        <span>
          ${
            currentSceneRPMode === 'f8'
              ? 'ME • F8'
              : '/me'
          }
        </span>

        <p
          id="sceneRP-${index}"
          class="rp-text"
        >
          ${escapeHtml(command)}
        </p>

        <button
          type="button"
          onclick="copyText('sceneRP-${index}')"
        >
          Copy
        </button>

      </div>
    `;
  });
}

/* =========================================================
   INITIALISE SCENES
========================================================= */

function initialiseScenes() {
  let detectedScene =
    'rtc';

  const activeScene =
    document.querySelector(
      '.scenario.active'
    );

  if (
    activeScene &&
    activeScene.id.startsWith(
      'scenario-'
    )
  ) {
    const possible =
      activeScene.id.replace(
        'scenario-',
        ''
      );

    if (sceneData[possible]) {
      detectedScene =
        possible;
    }
  }

  currentScene =
    detectedScene;

  currentSceneRPMode =
    'slash';

  showScenario(
    currentScene
  );

  setSceneRPMode(
    'slash'
  );
}

/* =========================================================
   BODYCAM
========================================================= */

let adminListCache = [];

async function loadAdminList() {
  try {
    const result = await api('/api/admins');
    adminListCache = result.admins || [];

  } catch (err) {
    console.error(
      'Unable to load admin list:',
      err
    );

    adminListCache = [];
  }

  populateAdminSelect('bodycamRecipient');
  populateAdminSelect('journalAdminRecipient');
}

function populateAdminSelect(id) {
  const select =
    document.getElementById(id);

  if (!select) return;

  const old =
    select.value;

  select.innerHTML =
    '<option value="">Choose an admin / higher-up...</option>' +
    adminListCache
      .map(
        admin => `
          <option value="${escapeHtml(admin.id)}">
            ${escapeHtml(
              admin.display_name ||
              'Admin'
            )}${
              admin.rank
                ? ` — ${escapeHtml(admin.rank)}`
                : ''
            }
          </option>
        `
      )
      .join('');

  select.value = old;
}

async function submitBodycam() {
  const message =
    document.getElementById(
      'bodycamSubmitMessage'
    );

  const setMsg = (text, type = '') => {
    if (message) {
      message.textContent = text;
      message.className =
        `auth-message ${type}`.trim();
    }
  };

  const recipientId =
    document.getElementById('bodycamRecipient')
      ?.value || '';

  const title =
    (
      document.getElementById('bodycamTitle')
        ?.value || ''
    ).trim();

  const dateValue =
    document.getElementById('bodycamDate')
      ?.value || '';

  const videoUrl =
    (
      document.getElementById('bodycamUrl')
        ?.value || ''
    ).trim();

  const notes =
    (
      document.getElementById('bodycamNotes')
        ?.value || ''
    ).trim();

  if (!recipientId || !title || !videoUrl) {
    setMsg(
      'Choose a recipient, enter a title and a video link.',
      'error'
    );

    return;
  }

  /*
    <input type="datetime-local"> gives a value like
    2025-01-30T14:20 with no timezone. Convert it to a
    full ISO string so the server's z.string().datetime()
    check accepts it.
  */

  const incidentAt =
    dateValue
      ? new Date(dateValue).toISOString()
      : null;

  setMsg('Sending bodycam submission...');

  try {
    await api('/api/bodycam/link', {
      method: 'POST',
      body: {
        recipientId,
        title,
        incidentAt,
        videoUrl,
        notes
      }
    });

    setMsg('Bodycam submission sent.', 'success');

    const titleEl =
      document.getElementById('bodycamTitle');

    const dateEl =
      document.getElementById('bodycamDate');

    const urlEl =
      document.getElementById('bodycamUrl');

    const notesEl =
      document.getElementById('bodycamNotes');

    if (titleEl) titleEl.value = '';
    if (dateEl) dateEl.value = '';
    if (urlEl) urlEl.value = '';
    if (notesEl) notesEl.value = '';

    await loadBodycam();

  } catch (err) {
    setMsg(
      err.message ||
      'Unable to send bodycam submission.',
      'error'
    );
  }
}

function embeddableVideoUrl(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname.includes('youtube.com') ||
      parsed.hostname.includes('youtu.be')
    ) {
      const videoId =
        parsed.hostname.includes('youtu.be')
          ? parsed.pathname.replace('/', '')
          : parsed.searchParams.get('v');

      return videoId
        ? `https://www.youtube.com/embed/${videoId}`
        : null;
    }

    if (parsed.hostname.includes('vimeo.com')) {
      const videoId =
        parsed.pathname.split('/').filter(Boolean).pop();

      return videoId
        ? `https://player.vimeo.com/video/${videoId}`
        : null;
    }

  } catch (_) {}

  return null;
}

function bodycamCard(item) {
  const isRecipient =
    currentUser &&
    String(item.recipient_id) === String(currentUser.id);

  const isAdmin =
    currentUser?.role === 'admin';

  const canReview =
    (isRecipient || isAdmin) &&
    item.status !== 'reviewed';

  const embedUrl =
    embeddableVideoUrl(item.video_url || '');

  const mediaHtml =
    embedUrl
      ? `
        <iframe
          class="bodycam-embed"
          src="${escapeHtml(embedUrl)}"
          frameborder="0"
          allowfullscreen
        ></iframe>
      `
      : item.video_url
        ? `
          <video
            class="bodycam-video"
            src="${escapeHtml(item.video_url)}"
            controls
          ></video>
        `
        : '';

  const dateLabel =
    item.incident_at
      ? new Date(item.incident_at).toLocaleString('en-GB')
      : 'No date given';

  return `
    <article class="bodycam-card">

      <h4>${escapeHtml(item.title || 'Untitled submission')}</h4>

      <div class="bodycam-meta">
        From ${escapeHtml(item.sender_name || 'Unknown')}
        to ${escapeHtml(item.recipient_name || 'Unknown')}
        • ${escapeHtml(dateLabel)}

        <span class="bodycam-status${item.status === 'reviewed' ? ' reviewed' : ''}">
          ${item.status === 'reviewed' ? 'Reviewed' : 'Awaiting review'}
        </span>
      </div>

      ${
        item.notes
          ? `<p>${escapeHtml(item.notes).replaceAll('\n', '<br>')}</p>`
          : ''
      }

      ${mediaHtml}

      <div class="bodycam-actions">
        <a
          href="${escapeHtml(item.video_url || '#')}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open video link ↗
        </a>

        ${
          canReview
            ? `
              <button
                type="button"
                onclick="reviewBodycam('${escapeHtml(item.id)}')"
              >
                Mark reviewed
              </button>
            `
            : ''
        }
      </div>

    </article>
  `;
}

async function loadBodycam() {
  const inbox =
    document.getElementById('bodycamInbox');

  if (!inbox || !currentUser) return;

  try {
    const result =
      await api('/api/bodycam');

    const submissions =
      result.submissions || [];

    inbox.innerHTML =
      submissions.map(bodycamCard).join('') ||
      `
        <div class="notice">
          No bodycam submissions yet.
        </div>
      `;

  } catch (err) {
    console.error(
      'Unable to load bodycam submissions:',
      err
    );

    inbox.innerHTML =
      `
        <div class="notice">
          Unable to load bodycam submissions.
        </div>
      `;
  }
}

async function reviewBodycam(id) {
  if (!id) return;

  try {
    await api(
      `/api/bodycam/${encodeURIComponent(id)}/review`,
      {
        method: 'POST',
        body: {}
      }
    );

    await loadBodycam();

  } catch (err) {
    alert(
      err.message ||
      'Unable to mark this submission as reviewed.'
    );
  }
}

/* =========================================================
   EXTRA CLICK SUPPORT
========================================================= */

/*
  This allows copy buttons inside dynamically
  generated RP rows to work even if the HTML
  does not have an inline onclick handler.
*/

document.addEventListener(
  'click',
  async event => {

    const copyButton =
      event.target.closest(
        '[data-copy-target]'
      );

    if (copyButton) {
      const target =
        copyButton.dataset.copyTarget;

      if (target) {
        await copyText(target);
      }

      return;
    }

    const genericCopy =
      event.target.closest(
        '.scene-rp-item button'
      );

    if (
      genericCopy &&
      !genericCopy.getAttribute(
        'onclick'
      )
    ) {
      await copyRPButton(
        genericCopy
      );
    }

  }
);

/* =========================================================
   STARTUP
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    /*
      Main navigation
    */

    document
      .querySelectorAll('.nav')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const section =
              button.dataset.section;

            if (section) {
              showSection(section);
            }

          }
        );

      });

    /*
      BP controls
    */

    document
      .getElementById('sys')
      ?.addEventListener(
        'input',
        updateBP
      );

    document
      .getElementById('dia')
      ?.addEventListener(
        'input',
        updateBP
      );

    /*
      Other vital sign sliders
    */

    document
      .getElementById('hrRange')
      ?.addEventListener('input', updateHR);

    document
      .getElementById('rrRange')
      ?.addEventListener('input', updateRR);

    document
      .getElementById('spo2Range')
      ?.addEventListener('input', updateSpO2);

    document
      .getElementById('tempRange')
      ?.addEventListener('input', updateTemp);

    document
      .getElementById('bglRange')
      ?.addEventListener('input', updateBGL);

    document
      .getElementById('gcsE')
      ?.addEventListener('input', updateGCS);

    document
      .getElementById('gcsV')
      ?.addEventListener('input', updateGCS);

    document
      .getElementById('gcsM')
      ?.addEventListener('input', updateGCS);

    /*
      Pain
    */

    document
      .getElementById('painRange')
      ?.addEventListener(
        'input',
        updatePain
      );

    /*
      Staff
    */

    document
      .getElementById('rosterSearch')
      ?.addEventListener(
        'input',
        renderStaff
      );

    document
      .getElementById(
        'rosterRankFilter'
      )
      ?.addEventListener(
        'change',
        renderStaff
      );

    document
      .getElementById(
        'rosterSpecialtyFilter'
      )
      ?.addEventListener(
        'change',
        renderStaff
      );

    document
      .getElementById(
        'staffSearchInput'
      )
      ?.addEventListener(
        'input',
        renderStaff
      );

    document
      .getElementById(
        'adminSearch'
      )
      ?.addEventListener(
        'input',
        renderAdmin
      );

    /*
      Auth modal background click
    */

    document
      .getElementById('authModal')
      ?.addEventListener(
        'click',
        event => {

          if (
            event.target.id ===
            'authModal'
          ) {
            closeAuth();
          }

        }
      );

    /*
      Edit modal background click
    */

    document
      .getElementById('editModal')
      ?.addEventListener(
        'click',
        event => {

          if (
            event.target.id ===
            'editModal'
          ) {
            closeEdit();
          }

        }
      );

    /*
      Escape closes modals
    */

    document.addEventListener(
      'keydown',
      event => {

        if (
          event.key === 'Escape'
        ) {
          closeAuth();
          closeEdit();
        }

      }
    );

    /*
      Initialise tools
    */

    updateBP();
    updateHR();
    updateRR();
    updateSpO2();
    updateTemp();
    updateBGL();
    updateGCS();
    updatePain();
    initialisePathwayTable();

    /*
      Initialise incident scenes.
    */

    initialiseScenes();

    /*
      Load login session. initRpSystem() now runs inside
      loadCurrentUser() itself, only when actually logged in —
      previously it ran unconditionally here, which meant every
      logged-out visitor triggered two 401s on page load.
    */

    await loadCurrentUser();

    /*
      Sync documents from server so uploads persist across sessions.
    */

    syncDocumentsFromServer();
  }
);

/* =========================================================
   GLOBAL INLINE HANDLERS

   IMPORTANT:
   Your HTML uses onclick="..."
   so these functions MUST be attached to window.
========================================================= */

window.openAuth =
  openAuth;

window.closeAuth =
  closeAuth;

window.signup =
  signup;

window.login =
  login;

window.logout =
  logout;

window.showSection =
  showSection;

window.editOwnProfile =
  editOwnProfile;

window.closeEdit =
  closeEdit;

window.saveProfile =
  saveProfile;

window.editStaff =
  editStaff;

window.refreshAdmin =
  refreshAdmin;

window.showStaffTab =
  showStaffTab;

window.addTrainingItem =
  addTrainingItem;

window.toggleTrainingItem =
  toggleTrainingItem;

window.updateTrainingItemText =
  updateTrainingItemText;

window.removeTrainingItem =
  removeTrainingItem;

window.saveStaffDevelopment =
  saveStaffDevelopment;

window.showProfileTab =
  showProfileTab;

window.savePrivateJournal =
  savePrivateJournal;

window.sendPrivateJournalToAdmin =
  sendPrivateJournalToAdmin;

window.toggleMed =
  toggleMed;

window.updateBP =
  updateBP;

window.updatePain =
  updatePain;

window.showScenario =
  showScenario;

window.setSceneRPMode =
  setSceneRPMode;

window.setSceneContext =
  setSceneContext;

window.setProcedureContext =
  setProcedureContext;

window.setDocContext =
  setDocContext;

window.setStudentContext =
  setStudentContext;

window.setCardiacContext =
  setCardiacContext;

window.showCardiacCategory =
  showCardiacCategory;

window.setCardiacRPMode =
  setCardiacRPMode;

window.showProcedure =
  showProcedure;

window.showProcedureSetting =
  showProcedureSetting;

window.setProcedureRPMode =
  setProcedureRPMode;

window.showDocGuide =
  showDocGuide;

window.setDocRPMode =
  setDocRPMode;

window.showStudentTab =
  showStudentTab;

window.setStudentTreatmentRPMode =
  setStudentTreatmentRPMode;

window.setStudentVitalsRPMode =
  setStudentVitalsRPMode;

window.showFractureTab =
  showFractureTab;

window.setFractureRPMode =
  setFractureRPMode;

window.showTraumaTab =
  showTraumaTab;

window.setTraumaGuideRPMode =
  setTraumaGuideRPMode;

window.showRespiratoryCategory =
  showRespiratoryCategory;

window.setAirwayRPMode =
  setAirwayRPMode;

window.showPainTab =
  showPainTab;

window.showMedCategory =
  showMedCategory;

window.copyText =
  copyText;

window.copyRPButton =
  copyRPButton;

window.submitBodycam =
  submitBodycam;

window.loadBodycam =
  loadBodycam;

window.reviewBodycam =
  reviewBodycam;

window.addRank =
  addRank;

/* =========================================================
   ESCAPE HTML
========================================================= */



/* ---- Google Slides embed helper ---- */
function slidesEmbedUrl(url) {
  if (!url) return '';
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return 'https://docs.google.com/presentation/d/' + match[1] + '/embed';
  }
  return url;
}

function renderProcedureSlides() {
  var container = document.getElementById('procedureSlides');
  var frame = document.getElementById('procedureSlidesFrame');
  if (!container || !frame) return;
  var proc = proceduresData[currentProcedure];
  if (proc && proc.slideUrl && proc.slideUrl.trim()) {
    frame.src = slidesEmbedUrl(proc.slideUrl.trim());
    container.style.display = '';
  } else {
    frame.src = '';
    container.style.display = 'none';
  }
}

function renderSceneSlides() {
  var container = document.getElementById('sceneSlides');
  var frame = document.getElementById('sceneSlidesFrame');
  if (!container || !frame) return;
  var scene = sceneData[currentScene];
  if (scene && scene.slideUrl && scene.slideUrl.trim()) {
    frame.src = slidesEmbedUrl(scene.slideUrl.trim());
    container.style.display = '';
  } else {
    frame.src = '';
    container.style.display = 'none';
  }
}




/* =========================================================
   SURGERIES DATA & FUNCTIONS
========================================================= */

var surgeriesData = {

  bulletHead: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for bullet removal from the head/neck.",
      "Cross-match blood products and ensure they are available in theatre before starting.",
      "Check the patient's GCS, pupil size and reactivity, and any focal neurological deficits.",
      "Review imaging (CT head/neck) to localise the bullet and plan the surgical approach.",
      "Ensure neurosurgical or vascular surgical team is available for this senior-led procedure.",
      "Prepare the craniotomy or cervical exploration tray with microsurgical instruments.",
      "Position the patient in head fixation (Mayfield clamp) or appropriate neck positioning.",
      "Administer prophylactic antibiotics per local protocol.",
      "Complete a team time-out with correct patient, procedure, side and imaging reviewed."
    ],
    questions: [
      "Do you understand the procedure and the risks, including the possibility of neurological injury or death?",
      "Do you have any allergies to medications, latex or anaesthetic agents?",
      "When did you last eat or drink anything?",
      "Are you taking any blood-thinning medication like warfarin, apixaban or clopidogrel?",
      "Do you have any other medical conditions that could affect anaesthesia or surgery?"
    ],
    rp: [
      "confirms the patient's identity, consent and imaging before prepping for bullet removal from the head.",
      "reviews the CT head to localise the bullet fragment and plans the safest surgical corridor.",
      "checks the craniotomy tray and instruments are all present and sterile before opening the first package.",
      "opens the sterile craniotomy kit using an aseptic non-touch technique, checking the expiry date on each package.",
      "arranges the microsurgical instruments on the sterile field in order of likely use during the procedure.",
      "positions the patient's head in the Mayfield clamp and preps the surgical site with antiseptic solution.",
      "makes an incision through the scalp and reflects the flap to expose the underlying skull.",
      "performs a craniotomy with a craniotome, creating a bone flap to access the intracranial cavity.",
      "opens the dura with a dural hook and microscissors, revealing the underlying brain parenchyma.",
      "identifies the bullet tract and carefully dissects down to the projectile using microsurgical technique.",
      "removes the bullet fragment with fine forceps and inspects the tract for any further fragments.",
      "achieves meticulous haemostasis with bipolar diathermy and haemostatic agents.",
      "closes the dura in a watertight fashion and replaces the bone flap with titanium plates and screws.",
      "documents the procedure, bullet fragment size and location, and the patient's post-operative neurological status."
  ]
  },

  bulletChest: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for bullet removal from the chest.",
      "Cross-match blood products and ensure at least 4 units available before starting.",
      "Review imaging (chest X-ray, CT chest) to localise the bullet and plan the surgical approach.",
      "Ensure large-bore IV access x2 is in place before induction.",
      "Prepare for possible massive transfusion if haemodynamically unstable.",
      "Prepare the thoracotomy tray with rib spreader, vascular clamps and chest tube equipment.",
      "Consider double-lumen endotracheal tube for lung isolation if VATS approach planned.",
      "Administer prophylactic antibiotics per protocol.",
      "Complete a team time-out with correct patient, procedure, side and imaging reviewed."
    ],
    questions: [
      "Do you understand the procedure and the risks, including bleeding, infection and the need for a chest drain?",
      "Do you have any allergies to medications, latex or anaesthetic agents?",
      "Are you taking any blood-thinning medication?",
      "Do you have any lung conditions like asthma or COPD that could affect anaesthesia?",
      "Do you have any other medical conditions that could affect surgery?"
    ],
    rp: [
      "confirms the patient's identity, consent and imaging before prepping for bullet removal from the chest.",
      "reviews the chest CT to localise the bullet and plans the surgical approach.",
      "checks the thoracotomy tray and confirms all instruments are present and sterile.",
      "opens the sterile thoracotomy kit, checking the sterilisation indicators and expiry dates on each package.",
      "arranges the rib spreader, vascular clamps and chest tube on the sterile field in order of use.",
      "intubates the patient with a double-lumen endotracheal tube for lung isolation.",
      "positions the patient in the lateral decubitus position and preps the chest with antiseptic.",
      "makes a posterolateral thoracotomy incision through the 5th intercostal space.",
      "opens the chest cavity with the rib spreader and identifies the bullet location within the pleural space.",
      "clamps and ligates any bleeding vessels and carefully removes the bullet fragment.",
      "irrigates the pleural cavity with warmed saline and inspects for any further injury.",
      "inserts a chest tube and connects it to an underwater seal drainage system.",
      "closes the thoracotomy in layers and documents the procedure and bullet fragment details.",
      "continues post-operative monitoring in ICU with the chest tube to underwater seal."
  ]
  },

  bulletAbdomen: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for exploratory laparotomy.",
      "Cross-match blood products with at least 4 units available and massive transfusion protocol on standby.",
      "Review imaging (CT abdomen with IV contrast) to localise the bullet and assess organ injury.",
      "Ensure large-bore IV access x2, arterial line and central line if indicated.",
      "Prepare the laparotomy tray with self-retaining retractors, vascular clamps and bowel instruments.",
      "Warm the operating theatre and patient to prevent the lethal triad of hypothermia, acidosis and coagulopathy.",
      "Administer prophylactic antibiotics per protocol.",
      "Complete a team time-out with correct patient, procedure and imaging reviewed."
    ],
    questions: [
      "Do you understand the risks of exploratory laparotomy, including possible organ removal or stoma formation?",
      "Do you have any allergies to medications, latex or anaesthetic agents?",
      "When did you last eat or drink?",
      "Are you taking any blood-thinning medication?",
      "Do you have any medical conditions that could affect anaesthesia or surgery?"
    ],
    rp: [
      "confirms the patient's identity, consent and imaging before prepping for exploratory laparotomy.",
      "reviews the CT abdomen to identify the bullet path and assess which organs are at risk.",
      "checks the laparotomy tray and confirms all instruments, retractors and clamps are present.",
      "opens the sterile laparotomy kit using an aseptic technique, checking all packaging carefully.",
      "arranges the self-retaining retractors, bowel clamps and vascular instruments on the sterile field.",
      "induces general anaesthesia with rapid sequence induction and positions the patient supine.",
      "makes a midline laparotomy incision from xiphisternum to pubis and enters the peritoneal cavity.",
      "evacuates haemoperitoneum and packs all four quadrants to control bleeding.",
      "identifies the bullet path through the abdominal cavity and assesses the organs involved.",
      "retrieves the bullet fragment from the retroperitoneum and inspects for any further injuries.",
      "repairs the small bowel perforation with primary closure and checks for other injuries.",
      "irrigates the abdominal cavity with warmed saline and achieves haemostasis.",
      "decides on damage control and packs the abdomen with a temporary closure (Bogota bag).",
      "documents the procedure, bullet fragment details, injuries found and the plan for second-look surgery."
  ]
  },

  bulletLimb: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for bullet removal from the limb.",
      "Review X-ray/CT to localise the bullet and assess for associated fracture.",
      "Check distal neurovascular status before prepping and document findings.",
      "Ensure tourniquet is available proximally and applied but not inflated.",
      "Prepare the orthopaedic or general surgical tray with appropriate instruments.",
      "Administer prophylactic antibiotics per protocol.",
      "Complete a team time-out with correct patient, side, procedure and imaging reviewed."
    ],
    questions: [
      "Do you understand the procedure and the risks of nerve or blood vessel injury?",
      "Do you have any allergies to medications, anaesthetic agents or latex?",
      "Are you taking any blood-thinning medication?",
      "Do you feel any numbness, tingling or weakness in the affected limb currently?",
      "Do you have any other medical conditions?"
    ],
    rp: [
      "confirms the patient's identity, consent and imaging before prepping for bullet removal from the limb.",
      "reviews the limb X-ray to localise the bullet and assess for associated fracture.",
      "checks the surgical tray and confirms all instruments and supplies are available.",
      "opens the sterile surgical pack, checking the sterilisation indicators and expiry dates.",
      "prepares the irrigation solution and arranges the instruments on the sterile field.",
      "marks the bullet location on the skin using X-ray guidance and preps the limb with antiseptic.",
      "makes an incision over the marked site and dissects through subcutaneous tissue and muscle.",
      "identifies the bullet tract and carefully dissects down to the projectile avoiding neurovascular structures.",
      "removes the bullet fragment with forceps and inspects the wound for any remaining fragments.",
      "irrigates the wound thoroughly with warmed saline and achieves haemostasis.",
      "checks distal neurovascular status again and documents pulse, sensation and movement.",
      "closes the wound in layers over a drain if needed and applies a sterile dressing.",
      "documents the procedure, bullet fragment details and neurovascular status post-operatively."
  ]
  },

  bulletMultiple: {
    checklist: [
      "Activate massive transfusion protocol immediately.",
      "Assess the patient systematically and identify which wounds are life-threatening.",
      "Cross-match blood products and ensure at least 6 units available.",
      "Coordinate multiple surgical teams as needed.",
      "Prepare multiple surgical trays in the same or adjacent theatres.",
      "Apply damage control principles and control haemorrhage and contamination first.",
      "Warm the theatre and use rapid infusers and warming devices.",
      "Complete a team time-out with all teams present.",
      "Document the surgical plan, order of procedures and the damage control strategy."
    ],
    questions: [
      "Do you understand that we will need to operate on multiple areas of your body?",
      "Do you have any allergies to medications or anaesthetic agents?",
      "Are you taking any blood-thinning medication?",
      "Do you have any other medical conditions that could affect your care?"
    ],
    rp: [
      "assesses the patient with multiple gunshot wounds and prioritises life-threatening haemorrhage.",
      "activates the massive transfusion protocol and coordinates the theatre team.",
      "performs an emergency thoracotomy for the chest wound while the abdominal team prepares.",
      "controls the chest haemorrhage with vascular clamps and packs the thoracic cavity.",
      "makes a midline laparotomy incision and rapidly packs all four quadrants to control bleeding.",
      "identifies and manages the abdominal injuries while the orthopaedic team addresses the limb wounds.",
      "removes accessible bullet fragments and documents all wound locations and injuries found.",
      "packs both the chest and abdomen and applies a temporary closure.",
      "transfers the patient to ICU for continued resuscitation and warming before definitive surgery.",
      "documents the damage control procedures, injuries found, estimated blood loss and the plan for second-look surgery."
  ]
  },

  fractureRepair: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for ORIF of the fracture.",
      "Review X-rays to plan the surgical approach and implant selection.",
      "Check distal neurovascular status before prepping and document the findings.",
      "Administer prophylactic antibiotics per protocol within 60 minutes of incision.",
      "Prepare the orthopaedic fracture tray with appropriate implants.",
      "Ensure the image intensifier and C-arm is available and working.",
      "Position the patient appropriately for the planned surgical approach.",
      "Apply a tourniquet if operating on a limb and document inflation time.",
      "Complete a team time-out with correct patient, side, procedure and implants confirmed."
    ],
    questions: [
      "Do you understand the procedure and the risks of infection, non-union and hardware problems?",
      "Do you have any allergies to medications, metal implants or anaesthetic agents?",
      "Are you taking any blood-thinning medication?",
      "Do you smoke? Smoking significantly increases the risk of non-union.",
      "Do you have any other medical conditions that could affect healing or anaesthesia?"
    ],
    rp: [
      "confirms the patient's identity, consent and imaging before prepping for fracture repair.",
      "reviews the X-rays to plan the surgical approach and selects the appropriate implants.",
      "checks the orthopaedic tray and confirms the plates, screws and instruments are all present.",
      "opens the sterile implant packages, checking the sizes and expiry dates on each one.",
      "arranges the implants on the sterile field in order of use and confirms the sizes with the team.",
      "positions the patient on the operating table and preps the limb with antiseptic solution.",
      "makes an incision over the fracture site and dissects down to the bone through appropriate tissue planes.",
      "reduces the fracture under direct vision and image intensifier guidance.",
      "temporarily holds the reduction with bone clamps and confirms alignment on X-ray.",
      "drills and inserts the appropriate plate and screws to achieve stable fixation.",
      "confirms the final position and screw length with image intensifier.",
      "irrigates the wound and closes in layers over a drain if needed.",
      "applies a sterile dressing and documents the procedure, implant details and neurovascular status."
  ]
  },

  haemorrhageControl: {
    checklist: [
      "Activate massive transfusion protocol immediately.",
      "Ensure large-bore IV access x2, arterial line and central line are in place.",
      "Cross-match blood products with at least 6 units O-negative available immediately.",
      "Prepare the emergency laparotomy and thoracotomy tray with vascular clamps.",
      "Warm the theatre to 26-28 degrees C and use a rapid infuser.",
      "Consider REBOA catheter if the patient is exsanguinating from sub-diaphragmatic bleeding.",
      "Call for senior surgical help immediately.",
      "Complete a team time-out with the priority being haemorrhage control.",
      "Document the damage control strategy and plan for second-look surgery."
    ],
    questions: [
      "Do you understand that we need to operate immediately to stop the bleeding?",
      "Do you have any allergies to medications or anaesthetic agents?",
      "Are you taking any blood-thinning medication?",
      "Do you have any other medical conditions that could affect your care?"
    ],
    rp: [
      "declares a major haemorrhage emergency and activates the massive transfusion protocol.",
      "calls for senior surgical help and prepares the theatre for emergency damage control surgery.",
      "induces the patient with a rapid sequence induction and preps the abdomen and chest rapidly.",
      "makes a midline laparotomy incision and enters the peritoneal cavity to find the source of bleeding.",
      "identifies the actively bleeding vessel and clamps it with vascular forceps to achieve immediate control.",
      "packs all four quadrants of the abdomen with laparotomy pads to control ongoing bleeding.",
      "ligates the bleeding vessel with suture ligatures and checks for any further haemorrhage.",
      "controls any contamination from bowel injuries with staples or ligation.",
      "packs the abdomen and applies a temporary closure (Bogota bag).",
      "transfers the patient to ICU for continued resuscitation, warming and correction of coagulopathy."
  ]
  },

  debridement: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for wound debridement.",
      "Assess the wound under anaesthesia and document size, depth, contamination and structures involved.",
      "Prepare the debridement tray with scalpel, scissors, forceps, retractors and irrigation equipment.",
      "Ensure at least 3-6 litres of warmed saline for irrigation of significant contamination.",
      "Take wound swabs for microbiology culture before starting the debridement.",
      "Administer prophylactic antibiotics per protocol.",
      "Consider the need for tetanus booster and rabies PEP if an animal bite.",
      "Complete a team time-out with correct patient, procedure and wound location confirmed."
    ],
    questions: [
      "Do you understand the procedure and that we may need to leave the wound open for a second operation?",
      "Do you have any allergies to medications, anaesthetic agents or dressings?",
      "When did you last eat or drink?",
      "Are you taking any blood-thinning medication?",
      "Do you have any other medical conditions?"
    ],
    rp: [
      "confirms the patient's identity, consent and wound assessment before prepping for debridement.",
      "checks the debridement tray and confirms all instruments and irrigation equipment are ready.",
      "opens the sterile debridement pack, checking the sterilisation indicators and expiry dates.",
      "pours warmed saline into the irrigation basin and arranges instruments on the sterile field.",
      "preps the wound with antiseptic solution and drapes the area to maintain a sterile field.",
      "excises all devitalised skin edges with a scalpel and removes non-viable tissue from the wound base.",
      "irrigates the wound with high-pressure warmed saline to remove all visible contamination.",
      "identifies and removes a small fragment of foreign material deep in the wound.",
      "assesses the deep structures and confirms tendons, nerves and vessels are intact and viable.",
      "takes wound swabs for microbiology and cultures the removed foreign material.",
      "decides the wound is too contaminated for primary closure and packs with saline-soaked gauze.",
      "applies a sterile dressing and documents the plan for second-look debridement in 24-48 hours.",
      "prescribes IV antibiotics and arranges for regular wound checks and dressing changes."
  ]
  },

  amputation: {
    checklist: [
      "Confirm the patient's identity, procedure and signed consent for amputation.",
      "Mark the limb clearly with an indelible marker and confirm the correct side and level.",
      "Review imaging to determine the level of viable tissue.",
      "Cross-match blood products with at least 2 units available for major amputations.",
      "Prepare the amputation tray with large scalpel, saw, bone cutter and vascular clamps.",
      "Administer prophylactic antibiotics per protocol.",
      "Apply a tourniquet proximally and document inflation time.",
      "Complete a team time-out with correct patient, side, level and procedure confirmed.",
      "Document the consent process and the non-salvageable status of the limb."
    ],
    questions: [
      "Do you understand that the limb cannot be saved and that amputation is permanent?",
      "Do you have any allergies to medications, anaesthetic agents or latex?",
      "Are you taking any blood-thinning medication?",
      "Do you smoke? Smoking significantly impairs wound healing after amputation.",
      "Do you have any other medical conditions like diabetes or peripheral vascular disease?",
      "Have you discussed the rehabilitation process and prosthetic options with the team?"
    ],
    rp: [
      "confirms the patient's identity, consent and the marked limb before prepping for amputation.",
      "reviews the imaging to determine the most distal level of viable tissue for the amputation.",
      "confirms the correct side and level one final time with the entire theatre team.",
      "checks the amputation tray and confirms the scalpel, saw, bone cutter and vascular clamps are present.",
      "opens the sterile amputation kit, checking the sterility indicators and expiry dates on each package.",
      "arranges the instruments on the sterile field and prepares the suture materials.",
      "preps the limb with antiseptic solution and applies a tourniquet proximally.",
      "makes a fish-mouth incision through the skin and subcutaneous tissue at the planned level.",
      "divides the muscles at the level of the skin incision and allows them to retract proximally.",
      "identifies and ligates the major vessels with suture ligatures, then releases the tourniquet to check haemostasis.",
      "identifies the major nerves and divides them cleanly under tension so they retract into the muscle.",
      "cuts the bone cleanly at the chosen level with a saw and rounds the bone edges with a rongeur.",
      "irrigates the wound, achieves meticulous haemostasis and places a drain in the wound.",
      "fashions the muscle flaps to create a padded stump and closes the skin in layers.",
      "applies a sterile dressing and a stump bandage, and documents the procedure and level of amputation.",
      "arranges post-operative physiotherapy, prosthetic referral and psychological support for the patient."
  ]
  },

  emergencyField: {
    checklist: [
      "Confirm the scene is safe before beginning any field surgery.",
      "Only proceed if the patient will die before reaching hospital without intervention.",
      "Control catastrophic haemorrhage first with tourniquet, haemostatic gauze or direct pressure.",
      "Perform a rapid primary survey using <C>ABCDE.",
      "Assess whether the patient can be stabilised and transported instead.",
      "Prepare the field surgery kit and establish a clean working area.",
      "Don appropriate PPE including sterile gloves, mask and eye protection.",
      "Have a clear plan and communicate it to the team before starting.",
      "Document all interventions and timings for handover to the hospital team."
    ],
    questions: [
      "Do you understand that we need to operate here because there is no time to get you to hospital?",
      "Do you have any allergies to medications or anaesthetic agents?",
      "Do you know if you have any medical conditions or take any medications?",
      "Can you feel the area I am about to work on?"
    ],
    rp: [
      "assesses the patient rapidly and determines that field surgery is needed to save their life.",
      "calls for assistance and prepares the field surgery kit on a clean surface.",
      "opens the sterile field surgical pack, checking the contents are intact and uncontaminated.",
      "arranges the instruments, dressings and haemostatic agents on the sterile field.",
      "administers procedural sedation if available and the patient is conscious.",
      "cleans the surgical site with antiseptic solution and drapes the area with sterile towels.",
      "makes a controlled incision through the skin and subcutaneous tissue to access the bleeding vessel.",
      "identifies the source of haemorrhage and clamps the vessel with haemostatic forceps.",
      "ligates the vessel with suture material and checks for any further bleeding.",
      "irrigates the wound with clean water or saline and packs with haemostatic gauze if needed.",
      "closes the wound with temporary sutures or staples, leaving a drain if necessary.",
      "applies a sterile dressing and bandages the wound securely.",
      "monitors the patient's vital signs and prepares for urgent evacuation to hospital.",
      "documents the procedure, findings and treatment given for the handover to the surgical team."
  ]
  }

};

/* Enhanced surgery workflow + additional surgery references.
   Content is intentionally RP-friendly and high-level; follow local clinical policy in real care. */
var surgeryWorkflow = {
  intake: ["Confirm patient, procedure, site and indication", "Review allergies, relevant history, imaging and observations", "Confirm consent/status and senior surgical plan"],
  equipment: ["Select the named theatre tray", "Check sterile packs, packaging, expiry and integrity", "Confirm implants, specimens, blood/support equipment and backups"],
  prep: ["Assign theatre roles and complete briefing", "Position patient safely and complete skin/site preparation", "Attach appropriate monitoring and confirm anaesthetic plan"],
  timeout: ["Team time-out: patient, procedure, site and key risks", "Confirm imaging, equipment, implants and anticipated blood loss", "Record start time and any agreed special precautions"],
  procedure: ["Perform the planned operation under the appropriate surgical team", "Keep actions coordinated with the theatre team", "Document key findings, specimens, implants and complications"],
  close: ["Confirm haemostasis and complete instrument/swab/sharp counts", "Close/dress the operative site as directed by the surgical team", "Label and send specimens/removed items correctly"],
  recovery: ["Transfer to recovery with monitoring and clear instructions", "Recheck observations, pain, airway/breathing and operative site", "Escalate unexpected deterioration promptly"],
  handover: ["Structured SBAR/PCR handover", "Record operation, findings, treatment and outstanding tasks", "Document destination, post-op plan and follow-up"]
};

Object.assign(surgeriesData, {
  appendectomy: {
    checklist: ["Confirm patient, procedure and side/site; review imaging and blood results.", "Confirm consent, allergies, fasting status and peri-operative plan.", "Prepare laparoscopic/general surgical tray and specimen supplies.", "Check sterile packaging, equipment function and counts.", "Complete theatre briefing and time-out.", "Confirm post-operative recovery and handover plan."],
    questions: ["Do you understand the planned operation and possible risks?", "Do you have medication, latex or anaesthetic allergies?", "When did you last eat or drink?", "Are you taking regular medicines or blood thinners?"],
    rp: ["confirms the patient, consent and imaging with the theatre team.", "checks the laparoscopic tower, sterile tray, specimen container and backup equipment.", "checks sterile packaging and expiry information before opening the selected packs.", "arranges equipment on the sterile field and confirms counts with the scrub team.", "participates in the team time-out before the operation begins.", "documents the key operative findings and any specimen sent to pathology.", "confirms counts, dressing and recovery plan before transfer to recovery.", "gives a structured post-operative handover and documents outstanding tasks."]
  },
  cholecystectomy: {
    checklist: ["Confirm indication, patient identity, consent and imaging.", "Check allergies, blood results and peri-operative medication plan.", "Prepare laparoscopic tower, general surgical instruments and specimen bag.", "Check sterile packaging, equipment function and counts.", "Complete team briefing and time-out.", "Confirm recovery, specimen and handover plan."],
    questions: ["Do you understand the planned gallbladder operation and possible risks?", "Any allergies or previous anaesthetic problems?", "When did you last eat or drink?", "What regular medicines do you take?"],
    rp: ["confirms the patient, consent and imaging before theatre preparation.", "checks the laparoscopic tower, camera, instruments and specimen bag.", "inspects sterile packaging and expiry information before opening packs.", "sets out equipment in order of use and confirms counts.", "completes the team time-out and records the operation start.", "documents the operative findings and specimen handling.", "checks counts, dressing and recovery instructions at the end of the case.", "hands the patient over to recovery with a concise SBAR."]
  },
  bowelResection: {
    checklist: ["Confirm indication, imaging, consent and possible stoma planning.", "Review blood results, allergies and blood availability where required.", "Prepare bowel/general surgical tray, suction, specimen and stoma supplies as applicable.", "Check sterile packaging, equipment and counts.", "Complete team briefing and time-out.", "Confirm monitored recovery and handover requirements."],
    questions: ["Do you understand that the operation may involve removal of bowel and possible diversion?", "Any allergies or regular medicines?", "When did you last eat or drink?", "Have you previously had abdominal surgery?"],
    rp: ["confirms the planned bowel procedure, consent and imaging.", "checks the bowel tray, suction, specimen containers and any stoma supplies.", "checks packaging integrity and arranges the sterile equipment with the scrub team.", "completes the theatre time-out and confirms the planned procedure.", "documents key findings, specimens and any diversion required.", "confirms counts and dressing before leaving theatre.", "gives recovery a structured handover including outstanding investigations and review."]
  },
  splenectomy: {
    checklist: ["Confirm indication, imaging, consent and blood availability.", "Review allergies, medication and relevant blood results.", "Prepare upper-abdominal surgical equipment, suction and specimen supplies.", "Check sterile packaging, equipment and counts.", "Complete team briefing/time-out.", "Confirm monitored recovery and specialist follow-up plan."],
    questions: ["Do you understand the reason for removing the spleen and the expected aftercare?", "Any allergies or blood-thinning medication?", "When did you last eat or drink?", "Any significant previous medical conditions?"],
    rp: ["confirms the indication, patient identity and consent.", "checks the abdominal tray, suction, haemostasis equipment and specimen container.", "inspects sterile packaging and expiry information before opening the selected packs.", "arranges equipment and confirms counts with the theatre team.", "completes the time-out and records the operation start.", "documents specimen handling and key findings.", "confirms counts, dressing and monitored recovery plan.", "hands over the patient and outstanding tasks to recovery/ward staff."]
  },
  jointWashout: {
    checklist: ["Confirm joint, side, indication and imaging/results.", "Document baseline distal neurovascular status.", "Confirm consent, allergies and antibiotic plan where applicable.", "Prepare orthopaedic/arthroscopy equipment, irrigation and specimen containers.", "Check sterile packaging, equipment and counts.", "Complete team time-out and recovery plan."],
    questions: ["Do you understand the planned joint washout and possible risks?", "Any allergies or regular medication?", "Any numbness, weakness or circulation problems in the limb?", "When did you last eat or drink?"],
    rp: ["confirms the correct joint and side with the team.", "checks the orthopaedic tray, irrigation system and specimen containers.", "checks sterile packaging and arranges equipment on the sterile field.", "records baseline neurovascular status and completes the time-out.", "documents findings and specimens collected for laboratory review.", "confirms dressing, counts and post-operative observations.", "hands over the neurovascular monitoring and review plan."]
  },
  vascularRepair: {
    checklist: ["Confirm injured vessel/site, imaging and baseline distal perfusion.", "Confirm consent/status, blood availability and senior vascular support.", "Prepare vascular instruments, clamps, repair materials and perfusion assessment equipment.", "Check sterile packaging, equipment and counts.", "Complete a vascular theatre briefing and time-out.", "Confirm monitored recovery and post-operative perfusion checks."],
    questions: ["Do you understand the need for specialist vascular surgery and its risks?", "Any allergies or blood-thinning medication?", "Any previous vascular conditions or surgery?", "When did you last eat or drink?"],
    rp: ["confirms the vascular injury, imaging and distal perfusion status.", "checks the vascular tray, repair materials and perfusion assessment equipment.", "inspects sterile packaging and confirms all required equipment is available.", "completes the theatre briefing and time-out with the vascular team.", "documents the repair, findings and distal perfusion assessment.", "confirms counts, dressing and monitored recovery requirements.", "gives a structured handover including the required vascular observations."]
  }
,
  skinGraft: {
    checklist: [
      "Confirms the patient identity, procedure, recipient site and planned donor site with the theatre team.",
      "Reviews the RP case briefing, relevant wound/burn description, allergies and stated peri-operative requirements.",
      "Checks the skin-graft/plastics tray, sterile drapes, skin markers, measuring supplies and dressing packs.",
      "Checks the dermatome, graft-handling instruments and mesher setup if the scenario calls for meshing.",
      "Verifies sterile pack seals, expiry/indicator status and that required equipment is present before opening.",
      "Completes the theatre briefing and site-specific time-out for donor and recipient sites.",
      "Records the planned graft type, donor/recipient locations and key intra-operative RP findings.",
      "Confirms final counts, dressings, recovery destination and handover information."
    ],
    questions: [
      "Do you understand which area is being covered and where the donor skin is being taken from?",
      "Do you have any medication, latex, antiseptic or anaesthetic allergies?",
      "Have you had previous grafting or reconstructive surgery?",
      "Have you had any problems with wound healing or previous operations?",
      "Is there anything you want the theatre team to know before we start?"
    ],
    rp: [
      "introduces themselves to the theatre team and confirms the patient, planned skin graft and operative side.",
      "checks the theatre board and verbally confirms the recipient site and planned donor site against the case briefing.",
      "positions the patient for the scenario while maintaining appropriate access to both the donor and recipient areas.",
      "checks the monitoring setup and confirms the anaesthetic team is ready before the surgical preparation begins.",
      "opens the sterile outer packaging without contaminating the field and passes the required sterile supplies to the scrub team.",
      "checks each sterile pack for an intact seal and confirms the required graft instruments are available before opening the field.",
      "lays out the skin-graft tray, sterile measuring equipment, dressings and graft-handling supplies in an organised theatre setup.",
      "checks the dermatome and associated equipment, confirming it is ready for the planned graft-harvesting stage.",
      "checks the mesher and carrier supplies are available when the theatre plan calls for a meshed graft.",
      "assists with exposing and preparing the donor and recipient areas while maintaining the sterile field.",
      "confirms the planned donor and recipient sites aloud with the surgeon immediately before the grafting stage.",
      "marks the relevant RP landmarks with the theatre team and records the planned graft dimensions.",
      "assists the scrub team by passing the requested graft instruments in sequence while maintaining sterile technique.",
      "carefully receives the prepared graft onto the sterile field and avoids handling the graft unnecessarily.",
      "checks the graft orientation with the surgical team before it is positioned onto the prepared recipient area.",
      "assists with positioning the graft over the recipient area and keeps the graft edges aligned with the marked wound margins.",
      "passes the requested fixation and dressing materials as the surgeon secures the graft in the scenario.",
      "applies the planned recipient-site dressing without disturbing the graft and checks that the dressing is secure.",
      "prepares the donor-site dressing and confirms that the donor site has been covered before leaving theatre.",
      "checks the sterile field for any displaced items or contamination and alerts the scrub team if anything requires replacement.",
      "performs the final instrument, swab and equipment count with the scrub team and reports the result aloud.",
      "records the RP procedure details including donor site, recipient site, graft type, dressings and notable theatre findings.",
      "assists with transferring the patient from the operating position and keeps the donor and recipient dressings protected.",
      "gives recovery staff a structured handover covering the procedure, donor site, recipient site, dressings, observations and outstanding tasks.",
      "confirms the theatre is ready for recovery and remains available for any immediate post-operative requests from the surgical team."
    ]
  }
});

var currentSurgery = 'bulletHead';
var currentSurgeryRPMode = 'slash';
var currentSurgeryContext = 'bed';

/* Load surgery data from CMS and merge into surgeriesData */
async function cmsLoadSurgeries() {
  try {
    var items = await cmsGet('surgery');
    if (!items || items.length === 0) return;
    items.forEach(function(it) {
      if (!it || !it._cmsKey) return;
      var key = it._cmsKey.replace(/^surgery-/, '');
      if (surgeriesData[key]) {
        /* Merge CMS fields into the hardcoded data */
        if (it.checklist) surgeriesData[key].checklist = it.checklist;
        if (it.questions) surgeriesData[key].questions = it.questions;
        if (it.rp) surgeriesData[key].rp = it.rp;
        if (it.name) surgeriesData[key].name = it.name;
        if (it.indications) surgeriesData[key].indications = it.indications;
        if (it.risks) surgeriesData[key].risks = it.risks;
        if (it.equipment) surgeriesData[key].equipment = it.equipment;
      }
    });
  } catch(e) {
    /* Fall through to hardcoded defaults */
  }
}

function showSurgery(name) {
  var data = surgeriesData[name];
  if (!data) { console.warn('Unknown surgery: ' + name); return; }
  currentSurgery = name;
  document.querySelectorAll('.surgery-panel').forEach(function(el) {
    el.classList.toggle('active', el.id === 'surgery-' + name);
  });
  document.querySelectorAll('.surgeon').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + name + "'") >= 0 || onclick.indexOf('"' + name + '"') >= 0);
  });
  renderSurgeryPrepChecklist();
  renderSurgeryQuestions();
  renderSurgeryRP();
  renderSurgeryWorkflow();
  renderAllSurgeryRoleActions(name);
}


var surgeryRoleActions = {
  surgeon: [
    "takes the lead for {SURGERY}, confirms the operative plan aloud and checks the intended site with the team.",
    "reviews the available assessment, imaging and observations with the team before entering the operative phase.",
    "confirms the operative equipment and specialist items are present, sterile and ready before requesting the start.",
    "participates in the team time-out, confirming patient, procedure, site, allergies and the agreed surgical plan.",
    "positions at the operating field and coordinates the assistant and scrub nurse as the procedure begins.",
    "works through the operative sequence while communicating key findings, changes in plan and requests for equipment.",
    "pauses for a deliberate final check of haemostasis, field condition, counts and closure plan before finishing.",
    "dictates the key operative findings and procedure summary, then gives the recovery team a structured handover."
  ],
  assistant: [
    "checks the planned position and operative side with the surgeon before helping prepare " + "{SURGERY}.",
    "assists with patient positioning and ensures pressure areas, lines and monitoring equipment remain accessible.",
    "helps prepare the operative field and maintains a clear working view for the surgeon without contaminating the sterile field.",
    "anticipates instruments and equipment requested by the surgeon and keeps the operative field organised.",
    "assists with exposure and retraction as directed, maintaining steady positioning while watching the surrounding field.",
    "communicates relevant changes to the surgeon and anaesthetist and confirms any additional equipment requested.",
    "supports the final field check and closure phase, helping confirm dressings, drains and equipment are accounted for.",
    "assists with transfer and gives the receiving team a concise summary of the procedure, dressings and immediate concerns."
  ],
  scrub: [
    "checks the sterile packs, instrument trays, indicator strips and specialist equipment for " + "{SURGERY} before opening.",
    "arranges the sterile field in a logical sequence and confirms critical instruments with the surgeon before incision.",
    "participates in the surgical time-out and confirms the sterile setup matches the planned procedure.",
    "passes instruments cleanly and anticipates the next stage while maintaining awareness of the sterile field.",
    "keeps used instruments organised, manages sharps safely and communicates when additional sterile equipment is required.",
    "maintains an accurate running count and raises any discrepancy immediately rather than allowing the procedure to continue unnoticed.",
    "prepares the closure instruments and requested dressings, then completes the final count with the circulating nurse.",
    "helps secure and organise the final sterile dressing setup and confirms the field is clear before leaving theatre."
  ],
  circulator: [
    "checks the theatre environment, equipment, patient identity and documentation before the start of " + "{SURGERY}.",
    "confirms required equipment, implants, blood products or specialist items are available and records relevant checks.",
    "supports the time-out by reading back patient, procedure and site details and documenting the team confirmation.",
    "opens additional sterile supplies without breaking the sterile field and responds to requests from the scrub team.",
    "monitors theatre workflow, equipment status and documentation while remaining ready to obtain additional supplies.",
    "records key procedural events and specimen or implant details as directed by the theatre team.",
    "coordinates the final count, specimen labelling, documentation and transfer paperwork before the patient leaves theatre.",
    "helps coordinate safe transfer and communicates the documented procedure and outstanding tasks to recovery."
  ],
  anaesthetist: [
    "reviews the patient, airway plan, allergies, observations and anaesthetic requirements before " + "{SURGERY}.",
    "checks monitoring, airway equipment, vascular access and emergency equipment before induction or procedural sedation.",
    "confirms the patient is ready for the operative phase and communicates the anaesthetic plan to the theatre team.",
    "maintains continuous monitoring during the procedure and announces significant changes clearly to the surgical team.",
    "coordinates with the surgeon before major operative stages when changes in position, blood loss or physiological stability may matter.",
    "reassesses the patient throughout the case and prepares the team for emergence or transfer when the operation is nearing completion.",
    "confirms the patient is stable for transfer and communicates analgesia, airway, monitoring and recovery considerations.",
    "gives a structured anaesthetic handover to recovery, including the procedure, relevant events and immediate monitoring priorities."
  ],
  recovery: [
    "receives the patient and confirms identity, procedure, allergies and the theatre handover before taking over care.",
    "checks airway, breathing, circulation, neurological status and immediate observations on arrival in recovery.",
    "checks operative dressings, drains, lines and any documented equipment or specimen requirements.",
    "confirms the post-operative monitoring and escalation plan with the anaesthetist and surgical team.",
    "documents observations and recovery progress while watching for deterioration or unexpected changes.",
    "communicates concerns promptly to the appropriate senior clinician and records the response.",
    "confirms the receiving destination and outstanding instructions before the patient leaves recovery.",
    "completes the final handover, ensuring the receiving team understands the procedure, dressings, observations and ongoing plan."
  ]
};

function getSurgeryRoleTitle(name) {
  var panel = document.getElementById('surgery-' + name);
  if (!panel) return name;
  var h3 = panel.querySelector('.scenario-hero h3');
  return h3 ? h3.textContent.trim() : name;
}

function renderSurgeryRoleActions(name, role) {
  var panel = document.getElementById('surgery-' + name);
  if (!panel) return;
  var target = panel.querySelector('#surgery-role-' + name + '-' + role + ' .surgery-role-actions');
  if (!target) return;
  var title = getSurgeryRoleTitle(name);
  var actions = (surgeryRoleActions[role] || []).map(function(action) {
    return action.replace(/\{SURGERY\}/g, title);
  });
  target.innerHTML = actions.map(function(action, index) {
    var id = 'roleRp-' + name + '-' + role + '-' + index;
    return '<div class="surgery-role-action">'
      + '<span class="num">' + (index + 1) + '</span>'
      + '<span class="cmd">/me ' + escapeHtml(action) + '</span>'
      + '<button class="edit-small" onclick="copyText(\'' + id + '\')">Copy</button>'
      + '<span id="' + id + '" style="display:none">/me ' + escapeHtml(action) + '</span>'
      + '</div>';
  }).join('');
}

function showSurgeryRole(name, role) {
  var block = document.querySelector('[data-surgery-roles="' + name + '"]');
  if (!block) return;
  block.querySelectorAll('.surgery-role-tab').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + role + "'") >= 0 || onclick.indexOf('"' + role + '"') >= 0);
  });
  block.querySelectorAll('.surgery-role-panel').forEach(function(el) {
    el.classList.toggle('active', el.id === 'surgery-role-' + name + '-' + role);
  });
  renderSurgeryRoleActions(name, role);
}

function renderAllSurgeryRoleActions(name) {
  ["surgeon","assistant","scrub","circulator","anaesthetist","recovery"].forEach(function(role) {
    renderSurgeryRoleActions(name, role);
  });
}

function renderSurgeryPrepChecklist() {
  var container = document.getElementById('surgeryPrepChecklist');
  if (!container) return;
  var surgery = surgeriesData[currentSurgery];
  if (!surgery || !surgery.checklist) { container.innerHTML = ''; return; }
  container.innerHTML = surgery.checklist.map(function(item) {
    return '<div class="check-row"><input type="checkbox"><span>' + escapeHtml(item) + '</span></div>';
  }).join('');
}

function renderSurgeryQuestions() {
  var container = document.getElementById('surgeryQuestions');
  if (!container) return;
  var surgery = surgeriesData[currentSurgery];
  if (!surgery || !surgery.questions) { container.innerHTML = ''; return; }
  container.innerHTML = surgery.questions.map(function(q) {
    return '<div class="question-row"><p>' + escapeHtml(q) + '</p></div>';
  }).join('');
}

function renderSurgeryRP() {
  var container = document.getElementById('surgeryRPList');
  if (!container) return;
  var surgery = surgeriesData[currentSurgery];
  if (!surgery || !surgery.rp) {
    container.innerHTML = '<p class="muted">No RP actions for this surgery.</p>';
    return;
  }
  var mode = currentSurgeryRPMode;
  container.innerHTML = surgery.rp.map(function(action, index) {
    var prefix = mode === 'f8' ? 'ME ' : '/me ';
    var modeLabel = mode === 'f8' ? 'ME - F8' : '/me';
    var command = prefix + action;
    return '<div class="rp-item staff-row" style="grid-template-columns:auto 1fr auto">'
      + '<span style="color:#41b6e6;font-weight:800;font-size:11px;min-width:55px;white-space:nowrap">' + modeLabel + '</span>'
      + '<p style="color:#c9d6da;font-size:13px;margin:0" id="surgeryRP-' + index + '">' + escapeHtml(command) + '</p>'
      + '<button class="edit-small" onclick="copyText(\'surgeryRP-' + index + '\')">Copy</button>'
      + '</div>';
  }).join('');
}

function renderSurgeryWorkflow() {
  var container = document.getElementById('surgeryWorkflow');
  if (!container) return;
  var surgery = surgeriesData[currentSurgery] || {};
  var names = [
    ['01', 'Brief & assess', surgery.checklist && surgery.checklist[0] || surgeryWorkflow.intake[0]],
    ['02', 'Equipment', ' '.concat(surgeryWorkflow.equipment[0], ' ', surgeryWorkflow.equipment[1])],
    ['03', 'Prep & package', surgeryWorkflow.prep[0] + ' ' + surgeryWorkflow.equipment[1]],
    ['04', 'Time-out', surgeryWorkflow.timeout[0]],
    ['05', 'Start → procedure', surgery.rp && surgery.rp[0] || surgeryWorkflow.procedure[0]],
    ['06', 'Specimen / implant', surgery.rp && surgery.rp[Math.min(4, surgery.rp.length - 1)] || surgeryWorkflow.procedure[2]],
    ['07', 'Close & count', surgeryWorkflow.close[0] + ' ' + surgeryWorkflow.close[1]],
    ['08', 'Recovery', surgeryWorkflow.recovery[0] + ' ' + surgeryWorkflow.recovery[1]],
    ['09', 'Handover', surgeryWorkflow.handover[0] + ' ' + surgeryWorkflow.handover[1]]
  ];
  container.innerHTML = '<div class="surgery-workflow">' + names.map(function(step) {
    return '<div class="surgery-workflow-step"><strong>' + escapeHtml(step[0] + ' · ' + step[1]) + '</strong><span>' + escapeHtml(step[2]) + '</span></div>';
  }).join('') + '</div>';
}

function showBurnDepth(depth) {
  if (['first','second','third'].indexOf(depth) < 0) depth = 'first';
  document.querySelectorAll('.burn-depth-panel').forEach(function(panel) {
    panel.style.display = 'none';
    panel.classList.remove('active');
  });
  document.querySelectorAll('.burn-depth-tab').forEach(function(btn) { btn.classList.remove('active'); });
  var panel = document.getElementById('burn-depth-' + depth);
  if (panel) { panel.style.display = ''; panel.classList.add('active'); }
  document.querySelectorAll('.burn-depth-tab').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    if (onclick.indexOf("'" + depth + "'") >= 0 || onclick.indexOf('"' + depth + '"') >= 0) btn.classList.add('active');
  });
}

function setSurgeryRPMode(mode) {
  if (mode !== 'slash' && mode !== 'f8') mode = 'slash';
  currentSurgeryRPMode = mode;
  document.querySelectorAll('.srpt').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + mode + "'") >= 0 || onclick.indexOf('"' + mode + '"') >= 0);
  });
  renderSurgeryRP();
}

function setSurgeryContext(context) {
  if (context !== 'bed' && context !== 'floor') context = 'bed';
  currentSurgeryContext = context;
  document.querySelectorAll('.surgery-context-btn').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + context + "'") >= 0 || onclick.indexOf('"' + context + '"') >= 0);
  });
  renderSurgeryRP();
}

async function initialiseSurgeries() {
  currentSurgery = 'bulletHead';
  currentSurgeryRPMode = 'slash';
  currentSurgeryContext = 'bed';
  await cmsLoadSurgeries();
  showSurgery('bulletHead');
}

window.showSurgery = showSurgery;
window.renderSurgeryPrepChecklist = renderSurgeryPrepChecklist;
window.renderSurgeryQuestions = renderSurgeryQuestions;
window.renderSurgeryRP = renderSurgeryRP;
window.initialiseSurgeries = initialiseSurgeries;
window.setSurgeryRPMode = setSurgeryRPMode;
window.setSurgeryContext = setSurgeryContext;

/* =========================================================
   DOCUMENT WORKSPACE
========================================================= */

var docCurrentFolder = '';
var docCache = [];
var docFolderCache = [];

async function renderDocWorkspace() {
  if (!currentUser) { docCache = []; docFolderCache = []; renderDocFolderList(); renderDocGrid(); return; }
  try {
    var res = await api('/api/documents/uploaded');
    if (res && res.documents) {
      docCache = res.documents;
    }
    if (res && res.folders) {
      docFolderCache = res.folders;
    }
  } catch(e) {
    docCache = [];
  }
  renderDocFolderList();
  renderDocGrid();
}

function renderDocFolderList() {
  var container = document.getElementById('docFolderList');
  if (!container) return;
  var html = '<div class="doc-folder-item active" data-folder="" onclick="selectDocFolder(&#39;&#39;)" style="padding:8px 10px;border-radius:6px;cursor:pointer;color:#c9d6da;font-size:13px;display:flex;align-items:center;gap:8px;background:#132733"><span>📂</span><span>All Documents</span></div>';
  docFolderCache.forEach(function(f) {
    var active = docCurrentFolder === String(f.id) ? 'background:#132733' : '';
    html += '<div class="doc-folder-item" data-folder="' + f.id + '" onclick="selectDocFolder(&#39;' + f.id + '&#39;)" style="padding:8px 10px;border-radius:6px;cursor:pointer;color:#c9d6da;font-size:13px;display:flex;align-items:center;gap:8px;' + active + '">';
    html += '<span>📁</span><span>' + escapeHtml(f.name) + '</span>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function selectDocFolder(folderId) {
  docCurrentFolder = folderId;
  document.querySelectorAll('.doc-folder-item').forEach(function(el) {
    el.style.background = el.dataset.folder === folderId ? '#132733' : '';
  });
  renderDocGrid();
}

function renderDocGrid() {
  var container = document.getElementById('docGrid');
  if (!container) return;
  var search = (document.getElementById('docSearchInput')?.value || '').toLowerCase();
  var filtered = docCache.filter(function(d) {
    if (docCurrentFolder && String(d.folder_id) !== docCurrentFolder) return false;
    if (search) {
      var n = (d.name || '').toLowerCase();
      var desc = (d.description || '').toLowerCase();
      var tags = (d.tags || '').toLowerCase();
      if (n.indexOf(search) < 0 && desc.indexOf(search) < 0 && tags.indexOf(search) < 0) return false;
    }
    return true;
  });
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No documents found</h3><p>Upload a file or create a folder to get started.</p></div>';
    return;
  }
  var html = '';
  filtered.forEach(function(d) {
    var ext = (d.name || '').split('.').pop().toLowerCase();
    var icon = '📄';
    if (['png','jpg','jpeg','gif','svg'].indexOf(ext) >= 0) icon = '🖼️';
    else if (['pdf'].indexOf(ext) >= 0) icon = '📕';
    else if (['docx','doc'].indexOf(ext) >= 0) icon = '📝';
    else if (['pptx','ppt'].indexOf(ext) >= 0) icon = '📽️';
    else if (['xlsx','xls','csv'].indexOf(ext) >= 0) icon = '📊';
    else if (['mp4','webm'].indexOf(ext) >= 0) icon = '🎬';
    
    html += '<div class="staff-row" style="grid-template-columns:auto 1fr auto;padding:12px">';
    html += '<span style="font-size:24px;margin-right:8px">' + icon + '</span>';
    html += '<div style="min-width:0">';
    html += '<h4 style="margin:0;color:#eaf2f4;font-size:14px;cursor:pointer" onclick="previewDoc(' + d.id + ')">' + escapeHtml(d.name) + '</h4>';
    if (d.description) html += '<p style="margin:2px 0 0;color:#7a95a3;font-size:11px">' + escapeHtml(d.description) + '</p>';
    html += '<p style="margin:2px 0 0;color:#5a7583;font-size:10px">' + new Date(d.created_at).toLocaleDateString() + ' · ' + ext.toUpperCase() + '</p>';
    html += '</div>';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
    html += '<button class="edit-small" onclick="previewDoc(' + d.id + ')">👁 View</button>';
    html += '<button class="edit-small" onclick="openDocEditMeta(&#39;" + d.id + "&#39;)">\u2710 Edit</button>';
    html += '<button class="danger-small" onclick="deleteDoc(&#39;" + d.id + "&#39;)">\u2715</button>';
    html += '</div>';
    html += '</div>';
  });
  container.innerHTML = html;
}

async function handleDocUpload(input) {
  var files = input.files;
  if (!files || files.length === 0) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var reader = new FileReader();
    reader.onload = async function(e) {
      var base64 = e.target.result.split(',')[1];
      try {
        await api('/api/documents/uploaded', {
          method: 'POST',
          body: { name: file.name, data: base64, folder_id: docCurrentFolder || null }
        });
        showToast('Uploaded: ' + file.name, 'success');
        renderDocWorkspace();
      } catch(err) {
        showToast('Upload failed: ' + file.name, 'error');
      }
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}

async function showCreateFolderModal() {
  if (!currentUser || currentUser.role !== 'admin') { showToast('Only admins can create folders', 'error'); return; }
  var container = document.getElementById('newFolderParent');
  if (container) {
    var html = '<option value="">Root (no parent)</option>';
    docFolderCache.forEach(function(f) {
      html += '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
    });
    container.innerHTML = html;
  }
  var modal = document.getElementById('createFolderModal');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('newFolderName').focus();
}

async function createDocFolder() {
  var name = document.getElementById('newFolderName')?.value?.trim();
  if (!name) { showToast('Enter a folder name', 'error'); return; }
  var parent = document.getElementById('newFolderParent')?.value || null;
  try {
    await api('/api/folders', { method: 'POST', body: { name: name, parent_id: parent } });
    showToast('Folder created', 'success');
    closeModal('createFolderModal');
    document.getElementById('newFolderName').value = '';
    renderDocWorkspace();
  } catch(e) {
    showToast('Failed to create folder', 'error');
  }
}

function previewDoc(id) {
  var container = document.getElementById('docPreviewContent');
  if (!container) return;
  var doc = docCache.find(function(d) { return d.id === id; });
  if (!doc) {
    container.innerHTML = '<p>Document not found.</p>';
    var m = document.getElementById('docPreviewModal');
    m.style.display = 'flex';
    m.setAttribute('aria-hidden', 'false');
    return;
  }
  var ext = (doc.name || '').split('.').pop().toLowerCase();
  var viewUrl = '/api/serve-doc/by-id/' + id;
  if (['png','jpg','jpeg','gif','svg'].indexOf(ext) >= 0) {
    container.innerHTML = '<div style="text-align:center"><img src="' + viewUrl + '" style="max-width:100%;max-height:80vh;border-radius:8px"></div>';
  } else if (ext === 'pdf') {
    container.innerHTML = '<iframe src="' + viewUrl + '" style="width:100%;height:80vh;border:0;border-radius:8px"></iframe>';
  } else {
    container.innerHTML = '<div style="text-align:center;padding:40px"><span style="font-size:64px">📄</span><h3>' + escapeHtml(doc.name) + '</h3><p style="color:#7a95a3">Preview not available for this file type.</p><a href="' + viewUrl + '" download="' + escapeHtml(doc.name) + '" class="primary" style="display:inline-block;margin-top:12px;padding:10px 20px;border-radius:8px;background:#005eb8;color:#fff;text-decoration:none">⬇ Download</a></div>';
  }
  var modal = document.getElementById('docPreviewModal');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

async function openDocEditMeta(id) {
  var doc = docCache.find(function(d) { return d.id === id; });
  var name = doc ? doc.name : '';
  document.getElementById('docEditMetaId').value = id;
  document.getElementById('docEditMetaTitle').textContent = 'Edit: ' + name;
  document.getElementById('docEditMetaName').value = name;
  var doc = docCache.find(function(d) { return d.id === id; });
  if (doc) {
    document.getElementById('docEditMetaDesc').value = doc.description || '';
    document.getElementById('docEditMetaTags').value = doc.tags || '';
  }
  var sel = document.getElementById('docEditMetaFolder');
  if (sel) {
    var html = '<option value="">None (root)</option>';
    docFolderCache.forEach(function(f) {
      var selected = doc && String(doc.folder_id) === String(f.id) ? 'selected' : '';
      html += '<option value="' + f.id + '" ' + selected + '>' + escapeHtml(f.name) + '</option>';
    });
    sel.innerHTML = html;
  }
  var modal = document.getElementById('docEditMetaModal');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

async function saveDocMeta() {
  var id = document.getElementById('docEditMetaId').value;
  var name = document.getElementById('docEditMetaName').value.trim();
  var desc = document.getElementById('docEditMetaDesc').value.trim();
  var tags = document.getElementById('docEditMetaTags').value.trim();
  var folder = document.getElementById('docEditMetaFolder').value;
  if (!id || !name) { showToast('Name is required', 'error'); return; }
  try {
    await api('/api/documents/' + id + '/meta', { method: 'PUT', body: { name: name, description: desc, tags: tags, folder_id: folder || null } });
    showToast('Saved', 'success');
    closeModal('docEditMetaModal');
    renderDocWorkspace();
  } catch(e) {
    showToast('Save failed', 'error');
  }
}

async function deleteDoc(id) {
  var doc = docCache.find(function(d) { return d.id === id; });
  var name = doc ? doc.name : 'this document';
  if (!confirm('Delete "' + name + '"?')) return;
  try {
    await api('/api/documents/by-id/' + id, { method: 'DELETE' });
    showToast('Deleted: ' + name, 'success');
    renderDocWorkspace();
  } catch(e) {
    showToast('Delete failed', 'error');
  }
}


window.renderDocWorkspace = renderDocWorkspace;
window.handleDocUpload = handleDocUpload;
window.showCreateFolderModal = showCreateFolderModal;
window.createDocFolder = createDocFolder;
window.selectDocFolder = selectDocFolder;
window.previewDoc = previewDoc;
window.openDocEditMeta = openDocEditMeta;
window.saveDocMeta = saveDocMeta;
window.deleteDoc = deleteDoc;
window.closeModal = closeModal;
/* Populate the equipment library on first load. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    showEquipmentCategory('airway');
    renderSurgeryWorkflow();
  });
} else {
  showEquipmentCategory('airway');
  renderSurgeryWorkflow();
}

function escapeHtml(value) {
  return String(
    value ?? ''
  )
    .replaceAll(
      '&',
      '&amp;'
    )
    .replaceAll(
      '<',
      '&lt;'
    )
    .replaceAll(
      '>',
      '&gt;'
    )
    .replaceAll(
      '"',
      '&quot;'
    )
    .replaceAll(
      "'",
      '&#039;'
    );
}


// Secondary Survey tab controller
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-secondary-tab]');
  if (!tab) return;
  const card = tab.closest('#secondary-survey');
  if (!card) return;

  const name = tab.getAttribute('data-secondary-tab');
  card.querySelectorAll('[data-secondary-tab]').forEach(t => {
    t.classList.toggle('active', t === tab);
    t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
  });
  card.querySelectorAll('[data-secondary-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.getAttribute('data-secondary-panel') === name);
  });
});

// Enhanced ABCDE tab controller
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-abcde-tab]');
  if (!tab) return;
  const card = tab.closest('#abcde-assessment');
  if (!card) return;
  const name = tab.getAttribute('data-abcde-tab');
  card.querySelectorAll('[data-abcde-tab]').forEach(t => t.classList.toggle('active', t === tab));
  card.querySelectorAll('[data-abcde-panel]').forEach(p => p.classList.toggle('active', p.getAttribute('data-abcde-panel') === name));
});

// ABCDE RP command copy buttons: /me for chat, me for F8.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('.abcde-enhanced .copy-action');
  if (!button) return;
  const value = button.getAttribute('data-copy') || '';
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = original; }, 900);
  } catch (err) {
    const area = document.createElement('textarea');
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
});

// Documentation / HART / HEMS tab controller
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-doc-tab]');
  if (!tab) return;
  const section = tab.closest('#documentation');
  if (!section) return;
  const name = tab.getAttribute('data-doc-tab');
  section.querySelectorAll('[data-doc-tab]').forEach(t => t.classList.toggle('active', t === tab));
  section.querySelectorAll('[data-doc-panel]').forEach(p => p.classList.toggle('active', p.getAttribute('data-doc-panel') === name));
});

// Dashboard Update Log navigation: use the site's existing section/navigation
// behavior where possible, with a hash fallback.
document.addEventListener('click', (event) => {
  const link = event.target.closest('.update-log-item[data-update-target]');
  if (!link) return;
  const targetId = link.getAttribute('data-update-target');
  const target = document.getElementById(targetId);
  if (!target) return; // retain normal anchor behavior if the target is unavailable

  event.preventDefault();

  // Close any open menus/overlays if the app exposes a common close hook.
  document.querySelectorAll('.section.active').forEach(section => {
    if (section !== target) section.classList.remove('active');
  });
  target.classList.add('active');
  target.scrollIntoView({behavior:'smooth', block:'start'});
  history.pushState(null, '', '#' + targetId);

  // Sync common nav controls that use data-target.
  document.querySelectorAll('[data-target]').forEach(nav => {
    nav.classList.toggle('active', nav.getAttribute('data-target') === targetId);
  });
});
