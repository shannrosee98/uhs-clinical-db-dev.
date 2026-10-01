'use strict';

let currentUser = null;
let staffCache = [];
let adminListCache = [];
let currentContext = 'bed';

var FIVEM_EMOTES = {
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

function formatRpWithEmote(action, emote) {
  const map = (typeof FIVEM_EMOTES !== 'undefined' && FIVEM_EMOTES)
    ? FIVEM_EMOTES
    : {};
  const e = map[emote] || '';
  return e ? `${action} ${e}` : String(action || '');
}


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
  const message = document.getElementById('authMessage');

  if (!modal) return;

  if (loginBox) loginBox.style.display = '';
  if (message) {
    message.textContent = '';
    message.className = 'auth-message';
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    const field = document.getElementById('loginEmail');
    if (field) field.focus();
  }, 50);
}

function closeAuth() {
  const modal = document.getElementById('authModal');

  if (!modal) return;

  // Move focus out of the modal before hiding it so aria-hidden never
  // contains the active/focused element.
  const active = document.activeElement;
  if (active && modal.contains(active) && typeof active.blur === 'function') {
    active.blur();
  }

  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

function setAuthMessage(message, type = '') {
  const el = document.getElementById('authMessage');

  if (!el) return;

  el.textContent = message;
  el.className = `auth-message ${type}`.trim();
}
async function login() {
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const password = document.getElementById('loginPassword')?.value || '';

  if (!email || !password) {
    setAuthMessage('Enter your email and password.', 'error');
    return;
  }

  setAuthMessage('Signing you in...');

  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    currentUser = result.user || null;
    closeAuth();
    updateAuthUI();

    if (currentUser) {
      if (currentUser.role === 'admin') showSection('admin');
      initRpSystem();
    }
  } catch (err) {
    setAuthMessage(err.message || 'Email or password is incorrect.', 'error');
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
    initRpSystem();
  }
}

function updateAuthUI() {
  const loggedIn = !!currentUser;
  const admin = loggedIn && currentUser.role === 'admin';

  const setVisible = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  };

  setVisible('headerAdminBtn', true);
  setVisible('headerLogoutBtn', admin);

  const gate = document.getElementById('adminGate');
  const panel = document.getElementById('adminPanel');

  if (gate) gate.style.display = admin ? 'none' : '';
  if (panel) panel.style.display = admin ? '' : 'none';
}

/* =========================================================
   NAVIGATION
========================================================= */


/* =========================================================
   LEARNING PLATFORM ROUTING / BREADCRUMBS
========================================================= */
var LEARNING_ROUTE_META = {
  dashboard:{title:'Home',parent:null},
  learn:{title:'Learn',parent:'Home'},
  'clinical-topics':{title:'Clinical Topics',parent:'Home'},
  assessments:{title:'Assessments',parent:'Home'},
  procedures:{title:'Procedures',parent:'Clinical'},
  meds:{title:'Medications',parent:'Clinical'},
  equipment:{title:'Equipment',parent:'Clinical'},
  pathways:{title:'Pathways',parent:'Home'},
  scenarios:{title:'Scenarios',parent:'Practise'},
  'study-tools':{title:'Study Tools',parent:'Practise'},
  reference:{title:'Reference',parent:'Home'},
  abcde:{title:'ABCDE',parent:'Assessments'},
  observations:{title:'Observations',parent:'Assessments'},
  cardiac:{title:'Cardiology',parent:'Clinical Topics'},
  respiratory:{title:'Respiratory',parent:'Clinical Topics'},
  neuro:{title:'Neurology',parent:'Clinical Topics'},
  trauma:{title:'Trauma',parent:'Clinical Topics'},
  stroke:{title:'Stroke',parent:'Clinical Topics'},
  emergencies:{title:'Emergency Conditions',parent:'Clinical Topics'},
  'emergency-mode':{title:'Emergency Mode',parent:'Pathways'},
  pain:{title:'Pain Assessment',parent:'Assessments'},
  fluids:{title:'Fluids & Resuscitation',parent:'Clinical Topics'},
  blood:{title:'Blood & Transfusion',parent:'Clinical Topics'},
  scenes:{title:'Incident Scenarios',parent:'Scenarios'},
  documentation:{title:'Documentation & Handover',parent:'Study Tools'},
  surgeries:{title:'Surgical Reference',parent:'Procedures'},
  rp:{title:'FiveM RP Actions',parent:'Study Tools'},
  documents:{title:'Reference Documents',parent:'Reference'}
};
function renderLearningBreadcrumb(id){
  var section=document.getElementById(id); if(!section) return;
  var old=section.querySelector(':scope > .learning-breadcrumb');
  if(old) old.remove();
  var meta=LEARNING_ROUTE_META[id]; if(!meta) return;
  var wrap=document.createElement('div'); wrap.className='learning-breadcrumb'; wrap.setAttribute('aria-label','Breadcrumb');
  var home=document.createElement('button'); home.type='button'; home.textContent='Home'; home.onclick=function(){showSection('dashboard')}; wrap.appendChild(home);
  if(meta.parent){
    var sep=document.createElement('span'); sep.textContent='›'; wrap.appendChild(sep);
    var parent=document.createElement('span'); parent.textContent=meta.parent; wrap.appendChild(parent);
  }
  var sep2=document.createElement('span'); sep2.textContent='›'; wrap.appendChild(sep2);
  var current=document.createElement('strong'); current.textContent=meta.title; wrap.appendChild(current);
  section.insertBefore(wrap,section.firstChild);
}
function refreshLearningBreadcrumbs(){ Object.keys(LEARNING_ROUTE_META).forEach(renderLearningBreadcrumb); }
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

  if (id === 'pathways') {
    renderPathwaysLibrary();
  }

}

/* =========================================================
   INCIDENT SCENE DATA
   Restored after the Phase 1 scene UI cleanup. The scene
   renderer still depends on this built-in data set.
========================================================= */

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
              name="procedure-prep-${index}"
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
              name="procedure-check-${index}"
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

  const contextList = procedure['rp_' + currentContext];
  const defaultRpList = Array.isArray(contextList) && contextList.length
    ? contextList
    : (Array.isArray(procedure.rp) ? procedure.rp : []);

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
              name="documentation-check-${index}"
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

const DOC_SECTIONS = ["hart", "hems", "training", "staff-handbook", "equipment", "docs", "slides", "abcde", "blood", "cardiac", "dashboard", "emergencies", "fluids", "meds", "neuro", "observations", "pain", "procedures", "respiratory", "rp", "scenes", "trauma", "admin"];

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
              name="fracture-check-${index}"
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
              name="airway-check-${index}"
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


/* =========================================================
   MEDICATION RANK AUTHORISATION REFERENCE
   Source: handbook screenshots supplied by the user for medication/rank
   permissions and listed presentations. Minimum/maximum fields are a
   separate typical-adult reference layer researched against UK clinical
   guidance; they are not a substitute for local prescribing protocols.
========================================================= */

const medicationAuthorityData = [
  {name:'Adrenaline', indication:'Cardiac arrest, anaphylaxis', dose:'1mg/10ml (IV) / 0.5mg (IM)', ranks:['Paramedic','Doctor'], minDose:'500 micrograms', maxDose:'1 mg', doseNote:'per dose; indication-dependent'},
  {name:'Amiodarone', indication:'Cardiac arrest (pulseless VT/VF)', dose:'300mg/10ml', ranks:['Paramedic'], minDose:'150 mg', maxDose:'300 mg', doseNote:'IV bolus; rhythm/protocol-dependent'},
  {name:'Atropine', indication:'Symptomatic bradycardia (<40 pulse)', dose:'600 mcg', ranks:['Paramedic'], minDose:'500 micrograms', maxDose:'3 mg', doseNote:'500 microgram repeat doses; 3 mg is the total adult maximum in bradycardia'},
  {name:'Diazepam', indication:'Acute muscle spasms, seizure control', dose:'5mg', ranks:['Paramedic','Doctor'], minDose:'5 mg', maxDose:'10 mg', doseNote:'per dose; indication/route-dependent'},
  {name:'Ipratropium Bromide', indication:'Life-threatening asthma, COPD', dose:'250mcg/3ml', ranks:['Paramedic','Doctor'], minDose:'250 micrograms', maxDose:'500 micrograms', doseNote:'per nebulised dose'},
  {name:'Morphine Sulfate', indication:'Moderate to severe pain relief', dose:'10mg/1ml', ranks:['Paramedic','HEMS','Doctor'], minDose:'2.5 mg', maxDose:'10 mg', doseNote:'IV titration range; route/clinical response dependent'},
  {name:'TXA', indication:'Major trauma, catastrophic bleeding', dose:'100mg/1ml', ranks:['Paramedic','HEMS','Doctor'], minDose:'1 g', maxDose:'2 g', doseNote:'1 g loading dose + 1 g over 8 hours for major trauma'},
  {name:'Glucose (IV)', indication:'Hypoglycemia (unconscious)', dose:'10% or 50g/500ml', ranks:['Paramedic'], minDose:'10 g', maxDose:'25 g', doseNote:'IV rescue dose; concentration/route dependent'},
  {name:'Ketamine', indication:'Severe pain management, sedation', dose:'10mg/1ml', ranks:['Advanced Paramedic','HEMS'], minDose:'0.1 mg/kg', maxDose:'2 mg/kg', doseNote:'analgesia to procedural/induction dosing; indication-dependent'},
  {name:'Midazolam', indication:'Status epilepticus (seizures), sedation', dose:'5mg/5ml', ranks:['Advanced Paramedic','HEMS','Doctor'], minDose:'2.5 mg', maxDose:'10 mg', doseNote:'per dose; indication/route-dependent'},
  {name:'Prednisolone', indication:'Moderate acute asthma, croup', dose:'5mg', ranks:['Advanced Paramedic','Doctor'], minDose:'40 mg', maxDose:'50 mg', doseNote:'adult acute asthma course; local protocol may differ'},
  {name:'Fentanyl', indication:'Severe pain management', dose:'100mcg/2ml', ranks:['Advanced Paramedic','HEMS'], minDose:'25 micrograms', maxDose:'100 micrograms', doseNote:'IV titrated dose'},
  {name:'Propofol', indication:'Induction of anaesthesia, sedation', dose:'10mg/1ml', ranks:['Advanced Paramedic','HEMS'], minDose:'1 mg/kg', maxDose:'2.5 mg/kg', doseNote:'adult induction bolus; infusion dosing is separate'},
  {name:'Suxamethonium', indication:'Paralytic for rapid sequence intubation', dose:'100mg/2ml', ranks:['Advanced Paramedic','HEMS'], minDose:'1 mg/kg', maxDose:'1.5 mg/kg', doseNote:'IV RSI dose'},
  {name:'Ondansetron', indication:'Nausea and vomiting', dose:'4mg/2ml', ranks:['Advanced Paramedic','HEMS'], minDose:'4 mg', maxDose:'8 mg', doseNote:'per dose; route/indication-dependent'},
  {name:'Noradrenaline', indication:'Severe hypotension, shock', dose:'4mg/4ml', ranks:['Advanced Paramedic','HEMS'], minDose:'0.05 micrograms/kg/min', maxDose:'0.5 micrograms/kg/min', doseNote:'IV infusion; titrate to effect in critical care'},
  {name:'Sodium Bicarbonate', indication:'Severe acidosis, hyperkalaemia', dose:'8.4%', ranks:['Advanced Paramedic','HEMS'], minDose:'50 mmol', maxDose:'100 mmol', doseNote:'IV; only for specific indications, not routine cardiac arrest'},
  {name:'Calcium Chloride', indication:'Hyperkalaemia, calcium channel blocker OD', dose:'10%', ranks:['Advanced Paramedic','HEMS'], minDose:'10 mmol', maxDose:'20 mmol', doseNote:'10% IV; indication-dependent and requires appropriate access'},
  {name:'Magnesium Sulfate', indication:'Eclampsia, severe asthma, arrhythmias', dose:'50%', ranks:['Advanced Paramedic','HEMS'], minDose:'1.2 g', maxDose:'2 g', doseNote:'IV; indication-dependent'},
  {name:'Hypertonic Saline', indication:'Raised intracranial pressure (TBI)', dose:'3%', ranks:['Advanced Paramedic','HEMS'], minDose:'100 mL', maxDose:'250 mL', doseNote:'3% saline bolus; indication/protocol-dependent'},
  {name:'Mannitol', indication:'Raised intracranial pressure', dose:'20%', ranks:['Advanced Paramedic','HEMS'], minDose:'0.25 g/kg', maxDose:'1 g/kg', doseNote:'IV; neurocritical-care indication dependent'},
  {name:'Oxygen', indication:'Hypoxia, major trauma, shock', dose:'Gas', ranks:['HEMS','Doctor'], minDose:'2 L/min', maxDose:'15 L/min', doseNote:'flow rate; titrate to target saturation/clinical state'},
  {name:'Rocuronium', indication:'Paralytic for advanced intubation (RSI)', dose:'50mg/5ml', ranks:['HEMS'], minDose:'0.6 mg/kg', maxDose:'1.2 mg/kg', doseNote:'IV neuromuscular blockade; RSI commonly uses the upper end'},
  {name:'PRBC', indication:'Massive haemorrhage, severe trauma', dose:'1 unit', ranks:['HEMS'], minDose:'1 unit', maxDose:'4 units', doseNote:'transfusion is protocol/lab/clinical-state dependent'},
  {name:'FFP', indication:'Coagulopathy in major bleeding', dose:'1 unit', ranks:['HEMS'], minDose:'1 unit', maxDose:'4 units', doseNote:'transfusion is protocol/lab/clinical-state dependent'},
  {name:'Amoxicillin', indication:'Infections', dose:'Tablet (500mg)', ranks:['Doctor'], minDose:'500 mg', maxDose:'1 g', doseNote:'per dose; route/indication-dependent'},
  {name:'Aspirin', indication:'Suspected heart attack / ACS', dose:'Tablet (300g)', ranks:['Doctor'], minDose:'75 mg', maxDose:'300 mg', doseNote:'per dose; ACS loading differs from maintenance'},
  {name:'Chlorphenamine', indication:'Allergic reaction', dose:'Ampoule Injection', ranks:['Doctor'], minDose:'4 mg', maxDose:'10 mg', doseNote:'route/indication-dependent'},
  {name:'Co-amoxiclav', indication:'Open fracture to prevent infections', dose:'Oral Solution (125mg)', ranks:['Doctor'], minDose:'1.2 g', maxDose:'1.2 g', doseNote:'IV adult dose commonly used for serious/open-fracture infection prophylaxis'},
  {name:'Codeine', indication:'Mild to severe pain', dose:'Tablet (15mg)', ranks:['Doctor'], minDose:'15 mg', maxDose:'60 mg', doseNote:'per oral dose'},
  {name:'Glucose', indication:'Hypoglycemia / low blood sugar', dose:'Solution Infusion', ranks:['Doctor'], minDose:'10 g', maxDose:'25 g', doseNote:'hypoglycaemia rescue dose; route/concentration-dependent'},
  {name:'GTN', indication:'Cardiac chest pain, angina', dose:'Inhaler (400 mcg)', ranks:['Doctor'], minDose:'400 micrograms', maxDose:'800 micrograms', doseNote:'sublingual dose; repeat dosing depends on protocol'},
  {name:'Ibuprofen', indication:'Mild to moderate pain relief', dose:'Tablet (400mg)', ranks:['Doctor'], minDose:'200 mg', maxDose:'400 mg', doseNote:'per oral dose'},
  {name:'Metoclopramide', indication:'Nausea and vomiting', dose:'Ampoule Injection', ranks:['Doctor'], minDose:'10 mg', maxDose:'10 mg', doseNote:'adult dose per administration'},
  {name:'Naloxone IV', indication:'Drug overdose', dose:'Ampoule Injection', ranks:['Doctor'], minDose:'100 micrograms', maxDose:'400 micrograms', doseNote:'titrate IV to adequate ventilation; repeated doses may be required'},
  {name:'Naloxone IM', indication:'Drug overdose', dose:'Ampoule Injection', ranks:['Doctor'], minDose:'400 micrograms', maxDose:'800 micrograms', doseNote:'IM rescue dose; repeated doses may be required'},
  {name:'Naproxen', indication:'Acute and chronic musculoskeletal pain', dose:'Tablet (250mg)', ranks:['Doctor'], minDose:'250 mg', maxDose:'500 mg', doseNote:'per oral dose'},
  {name:'Paracetamol IV', indication:'Mild to moderate pain relief', dose:'Solution Infusion', ranks:['Doctor'], minDose:'1 g', maxDose:'1 g', doseNote:'adult IV dose; weight/clinical factors may require adjustment'},
  {name:'Paracetamol 1g', indication:'Mild to moderate pain relief', dose:'Tablet (500mg per screenshot)', ranks:['Doctor'], minDose:'500 mg', maxDose:'1 g', doseNote:'per oral dose'},
  {name:'Salbutamol Neb', indication:'Asthmatic attack and COPD', dose:'Nebuliser (2.5mg)', ranks:['Doctor'], minDose:'2.5 mg', maxDose:'5 mg', doseNote:'per nebulised dose; severe cases may use higher protocol-specific dosing'},
  {name:'Sodium Chloride', indication:'Fluids', dose:'Solution Infusion', ranks:['Doctor'], minDose:'250 mL', maxDose:'1000 mL', doseNote:'IV fluid bolus; indication/clinical state dependent'}
];

let selectedMedicationAuthorityRank = 'all';

function showMedicationAuthorityRank(rank) {
  const validRanks = ['all', 'Paramedic', 'Advanced Paramedic', 'HEMS', 'Doctor'];
  selectedMedicationAuthorityRank = validRanks.includes(rank) ? rank : 'all';

  document.querySelectorAll('.med-rank-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.rank === selectedMedicationAuthorityRank);
    button.setAttribute('aria-selected', button.dataset.rank === selectedMedicationAuthorityRank ? 'true' : 'false');
  });

  renderMedicationAuthority();
}

function renderMedicationAuthority() {
  const body = document.getElementById('medicationAuthorityBody');
  if (!body) return;

  const query = (document.getElementById('medAuthoritySearch')?.value || '').trim().toLowerCase();

  const rows = medicationAuthorityData.filter(item => {
    const rankMatches =
      selectedMedicationAuthorityRank === 'all' ||
      item.ranks.includes(selectedMedicationAuthorityRank);

    const queryMatches =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.indication.toLowerCase().includes(query) ||
      item.ranks.some(rank => rank.toLowerCase().includes(query));

    return rankMatches && queryMatches;
  });

  body.innerHTML = rows.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.indication)}</td>
      <td>${escapeHtml(item.dose)}</td>
      <td><strong>${escapeHtml(item.minDose || 'Not specified')}</strong></td>
      <td><strong>${escapeHtml(item.maxDose || 'Not specified')}</strong><br><small class="med-dose-note">${escapeHtml(item.doseNote || '')}</small></td>
      <td>${item.ranks.map(rank => `<span class="med-rank-chip">${escapeHtml(rank)}</span>`).join(' ')}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="muted">No medications authorised for this rank.</td></tr>';
}

function showMedCategory(cat) {
  const validCats = ['painrelief', 'sedation', 'allergies', 'cardiac', 'respiratory', 'emergencies', 'authority'];

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

  if (cat === 'authority') renderMedicationAuthority();

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
              name="trauma-check-${index}"
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
              name="student-treatment-check-${index}"
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
              name="student-vitals-check-${index}"
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

function renderSceneQuestions() {
  const container =
    document.getElementById('sceneQuestions');

  if (!container) return;

  const scene =
    sceneData[currentScene];

  if (!scene || !Array.isArray(scene.questions)) {
    container.innerHTML = '';
    return;
  }

  const questions = getEditableItems(
    'scene-questions-' + currentScene,
    scene.questions
  );

  container.innerHTML = questions
    .map((question, index) => `
      <div class="scene-question-item">
        <span class="scene-question-number">${index + 1}</span>
        <p>${escapeHtml(question)}</p>
      </div>
    `)
    .join('');
}

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
              name="scene-check-${index}"
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
  }
}

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

function renderEmergencyFullReference(key, data) {
  var box = document.getElementById('emergency-full-reference');
  if (!box || !data) return;
  var list = function(items, cls) {
    if (!items || !items.length) return '<p class="muted">No information listed in the current emergency dataset.</p>';
    return '<ul class="' + (cls || 'emergency-reference-list') + '">' +
      items.map(function(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') +
      '</ul>';
  };
  var actions = (data.rp || []).map(function(action) {
    return '<div class="emergency-reference-action"><code>' + escapeHtml(action) + '</code>' +
      '<button type="button" class="secondary" onclick="copyTextInline(' + JSON.stringify(action) + ')">Copy /me</button></div>';
  }).join('');
  var actionBlock = actions ?
    '<div class="emergency-reference-block"><h4>🎭 RP Action Library</h4><div class="emergency-reference-actions">' + actions + '</div></div>' :
    '<div class="emergency-reference-block"><h4>🎭 RP Action Library</h4><p class="muted">No RP actions are listed in the current emergency dataset.</p></div>';

  box.innerHTML =
    '<div class="emergency-reference-shell">' +
      '<div class="emergency-reference-head">' +
        '<div class="emergency-reference-kicker">FULL EMERGENCY REFERENCE</div>' +
        '<h3>' + escapeHtml(data.title || key) + '</h3>' +
        '<p>Expanded reference built from the existing UHS Emergency Mode dataset: priorities, assessment, management, red flags, patient questions, RP actions and handover.</p>' +
        '<div class="emergency-reference-note">Source basis: current UHS Clinical Desk emergency-mode content. This panel does not add independently verified clinical guidance; local UHS SOP/CMS review remains required before real-world use.</div>' +
      '</div>' +
      '<div class="emergency-reference-grid">' +
        '<div class="emergency-reference-block"><h4>🚑 Immediate Priorities</h4>' + list(data.priorities) + '</div>' +
        '<div class="emergency-reference-block"><h4>🔍 Assessment</h4>' + list(data.assessment) + '</div>' +
        '<div class="emergency-reference-block"><h4>💊 Management & Interventions</h4>' + list(data.management) + '</div>' +
        '<div class="emergency-reference-block"><h4>🚨 Red Flags</h4>' + list(data.redflags) + '</div>' +
        '<div class="emergency-reference-block"><h4>💬 Patient Questions</h4>' + list(data.questions) + '</div>' +
        actionBlock +
        '<div class="emergency-reference-block" style="grid-column:1/-1"><h4>📋 Handover Template</h4><div class="emergency-reference-handover">' + escapeHtml(data.handover || '') + '</div><div style="margin-top:8px"><button type="button" class="primary" onclick="copyEmergencyHandover()">Copy Handover</button></div></div>' +
      '</div>' +
    '</div>';
  box.style.display = 'block';
}


/* =========================================================
   DIAGNOSIS / MDT-STYLE CLINICAL REASONING
   FiveM learning/RP aid only — not a real-world diagnostic tool.
========================================================= */
var emergencyDiagnosisProfiles = {
  'cardiac-arrest': {
    symptoms:['Collapse / unresponsiveness','No normal breathing or agonal breathing','No signs of life'],
    observations:['GCS / AVPU severely reduced','No normal respiratory effort','No central pulse / signs of circulation','ECG rhythm abnormal or absent'],
    findings:['VF / pVT','PEA / asystole','Reversible cause suggested by 4 Hs / 4 Ts'],
    history:['Witnessed or unwitnessed collapse','Bystander CPR / AED use','Known cardiac disease or significant medical history'],
    differentials:['Cardiac arrest','Respiratory arrest with progression to cardiac arrest','Toxicological arrest','Traumatic arrest']
  },
  'major-trauma': {
    symptoms:['Severe pain after significant mechanism','Bleeding','Breathlessness or chest pain','Weakness, numbness or reduced movement'],
    observations:['Hypotension / falling BP','Tachycardia','Reduced GCS','Abnormal respiratory rate or SpO₂','Delayed capillary refill / shock features'],
    findings:['Catastrophic haemorrhage','Chest injury signs','Pelvic or long-bone injury','Spinal neurological deficit','Penetrating injury'],
    history:['RTC / fall / assault / penetrating injury','Time and mechanism of injury','Anticoagulant use','Known medical conditions'],
    differentials:['Major trauma with haemorrhagic shock','Thoracic trauma','Pelvic / long-bone trauma','Head or spinal trauma']
  },
  'chest-pain': {
    symptoms:['Central or chest discomfort','Pressure / tightness','Pain radiating to arm, jaw or back','Sweating, nausea or vomiting','Breathlessness'],
    observations:['Abnormal heart rate or rhythm','Abnormal BP','Low SpO₂ where present','ECG changes'],
    findings:['ST elevation / depression','T-wave changes','Unequal pulses or marked BP difference','Signs of heart failure'],
    history:['Onset and timing','SOCRATES pain history','Previous cardiac disease','Risk factors / medications'],
    differentials:['Acute coronary syndrome','Aortic dissection','Pulmonary embolism','Pericarditis','Pneumothorax']
  },
  'stroke': {
    symptoms:['Facial weakness','Arm or leg weakness','Speech or language disturbance','Sudden visual disturbance','Sudden balance / coordination problem'],
    observations:['Blood glucose abnormal','GCS / AVPU altered','BP abnormal','Pupil or neurological findings'],
    findings:['FAST / BE-FAST positive','Focal neurological deficit','Possible cortical signs','Possible posterior circulation signs'],
    history:['Last known well / symptom onset','Anticoagulant or antiplatelet medication','Previous stroke / TIA','Baseline function'],
    differentials:['Acute ischaemic stroke','Intracerebral haemorrhage','Subarachnoid haemorrhage','TIA','Stroke mimic such as hypoglycaemia']
  },
  'anaphylaxis': {
    symptoms:['Sudden breathing difficulty','Swelling of lips, tongue or throat','Wheeze / stridor','Dizziness or collapse','Rash / flushing where present'],
    observations:['Low SpO₂','Tachycardia','Hypotension','Increased respiratory rate'],
    findings:['Airway swelling','Wheeze / bronchospasm','Circulatory compromise','Skin or mucosal changes'],
    history:['Recent food / drug / sting exposure','Known allergy','Previous anaphylaxis','Time from exposure to symptoms'],
    differentials:['Anaphylaxis','Severe asthma','Angioedema','Vasovagal episode','Other shock state']
  },
  'seizure': {
    symptoms:['Witnessed convulsive activity','Loss of consciousness','Post-event confusion','Tongue injury or incontinence where present'],
    observations:['GCS / AVPU reduced post-event','Abnormal SpO₂ or respiratory rate','Blood glucose abnormal','Temperature elevated where relevant'],
    findings:['Ongoing convulsion','Focal neurological deficit','Persistent reduced consciousness','Signs of injury'],
    history:['Known epilepsy','Duration of seizure','Medication adherence','Possible toxicological / metabolic trigger'],
    differentials:['Generalised seizure','Focal seizure','Status epilepticus','Syncope / seizure mimic','Hypoglycaemia-related event']
  },
  'respiratory': {
    symptoms:['Shortness of breath','Wheeze','Cough','Chest tightness','Difficulty speaking full sentences'],
    observations:['Low SpO₂','Raised respiratory rate','Tachycardia','Abnormal work of breathing'],
    findings:['Wheeze','Crackles','Reduced / absent air entry','Cyanosis','Accessory muscle use'],
    history:['Asthma / COPD history','Onset and trigger','Infection symptoms','Cardiac history / previous episodes'],
    differentials:['Asthma exacerbation','COPD exacerbation','Pneumonia','Pulmonary oedema','Pneumothorax','Pulmonary embolism']
  },
  'haemorrhage': {
    symptoms:['Visible heavy bleeding','Weakness','Dizziness / collapse','Pain at bleeding site'],
    observations:['Falling BP','Tachycardia','Reduced GCS','Delayed capillary refill','Pale / cool skin'],
    findings:['Active external haemorrhage','Expanding wound / concealed bleeding concern','Shock features'],
    history:['Mechanism','Estimated blood loss where known','Anticoagulants','Bleeding disorders'],
    differentials:['Major external haemorrhage','Internal haemorrhage','Traumatic haemorrhagic shock','GI or other non-traumatic bleeding']
  },
  'sepsis': {
    symptoms:['Fever or feeling very unwell','Confusion','Breathlessness','Reduced urine output','Pain or suspected infection source'],
    observations:['Temperature abnormal','Tachycardia','Tachypnoea','Hypotension','Low SpO₂ where present','Altered mental status'],
    findings:['Suspected infection source','Poor perfusion','New confusion','Clinical deterioration'],
    history:['Recent infection / procedure','Immunosuppression or significant comorbidity','Recent antibiotics','Onset and progression'],
    differentials:['Sepsis / infection-related deterioration','Septic shock','Pneumonia','Urinary infection','Other shock / metabolic cause']
  },
  'overdose': {
    symptoms:['Reduced consciousness','Vomiting','Confusion','Abnormal behaviour','Breathing difficulty'],
    observations:['GCS / AVPU reduced','Respiratory rate abnormal','SpO₂ abnormal','Pupils abnormal','Blood glucose abnormal'],
    findings:['Needle marks / medication packets where present','Abnormal pupil size','Respiratory depression','Seizure or arrhythmia'],
    history:['Substance / medication taken','Approximate amount and time','Co-ingestants','Intent / circumstances','Usual medications'],
    differentials:['Toxicological poisoning / overdose','Hypoglycaemia','Stroke','Seizure','Head injury','Other metabolic cause']
  },
  'hypothermia': {
    symptoms:['Cold exposure','Shivering or cessation of shivering','Confusion','Drowsiness','Poor coordination'],
    observations:['Low core temperature','Bradycardia','Reduced respiratory rate','Reduced GCS'],
    findings:['Cold skin','Altered mental state','Poor perfusion','Arrhythmia concern'],
    history:['Duration of exposure','Wet clothing / immersion','Environmental conditions','Alcohol or drug exposure'],
    differentials:['Accidental hypothermia','Cold-water immersion','Hypoglycaemia','Intoxication','Other altered-consciousness cause']
  },
  'burns': {
    symptoms:['Burn pain','Skin injury','Breathing difficulty after smoke exposure','Blistering or tissue damage'],
    observations:['HR / BP changes','SpO₂ where relevant','Respiratory rate','Temperature','GCS if altered'],
    findings:['Burn depth / appearance','Burn extent','Facial / airway involvement','Circumferential burns','Associated trauma'],
    history:['Mechanism: thermal / chemical / electrical','Time of injury','Enclosed-space exposure','First aid already given'],
    differentials:['Thermal burn','Chemical burn','Electrical injury','Inhalation injury','Associated traumatic injury']
  }
};

var activeEmergencyDiagnosis = { key:null, selections:{} };

function setEmergencyTab(tab) {
  document.querySelectorAll('[data-emergency-tab]').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-emergency-tab') === tab);
    btn.setAttribute('aria-selected', btn.getAttribute('data-emergency-tab') === tab ? 'true' : 'false');
  });
  document.querySelectorAll('[data-emergency-panel]').forEach(function(panel) {
    panel.classList.toggle('active', panel.getAttribute('data-emergency-panel') === tab);
  });
}

function renderEmergencyDiagnosis(key) {
  var profile = emergencyDiagnosisProfiles[key];
  var root = document.getElementById('emergency-diagnosis-panel');
  if (!profile || !root) return;
  activeEmergencyDiagnosis.key = key;
  activeEmergencyDiagnosis.selections = {};
  var groups = [
    ['Symptoms', 'symptoms', 'symptom'],
    ['Observations', 'observations', 'observation'],
    ['Examination / Findings', 'findings', 'finding'],
    ['History / Context', 'history', 'history']
  ];
  root.innerHTML =
    '<div class="diagnosis-banner"><strong>🩺 MDT-style diagnostic reasoning</strong><span>Record the findings first, then compare the pattern with possible working diagnoses and differentials.</span></div>' +
    '<div class="diagnosis-grid">' +
    groups.map(function(group) {
      var title=group[0], arr=profile[group[1]]||[], type=group[2];
      return '<article class="diagnosis-card"><div class="diagnosis-card-head"><h3>'+escapeHtml(title)+'</h3><span>'+arr.length+' prompts</span></div><div class="diagnosis-checks">' +
        arr.map(function(item,i){
          var id='dx-'+type+'-'+i;
          return '<label class="diagnosis-check" for="'+id+'"><input id="'+id+'" type="checkbox" data-dx-group="'+type+'" value="'+escapeHtml(item)+'"><span>'+escapeHtml(item)+'</span></label>';
        }).join('')+'</div></article>';
    }).join('') +
    '</div>' +
    '<div class="diagnosis-actions"><button type="button" class="primary" onclick="calculateEmergencyDiagnosis()">🧠 Generate Working Diagnosis</button><button type="button" class="secondary" onclick="clearEmergencyDiagnosis()">Clear Findings</button></div>' +
    '<div id="emergency-diagnosis-result" class="diagnosis-result"><h3>Working diagnosis</h3><p>Select the relevant symptoms, observations, findings and history, then generate the diagnostic reasoning summary.</p></div>' +
    '<div class="diagnosis-disclaimer"><strong>FiveM learning / RP:</strong> This is a structured diagnostic-reasoning aid for roleplay and study. It does not establish a real-world diagnosis and should not replace clinical assessment, senior review or local guidance.</div>';
}

function calculateEmergencyDiagnosis() {
  var key=activeEmergencyDiagnosis.key, profile=emergencyDiagnosisProfiles[key];
  var root=document.getElementById('emergency-diagnosis-result');
  if (!profile || !root) return;
  var selected=[];
  document.querySelectorAll('#emergency-diagnosis-panel input[data-dx-group]:checked').forEach(function(input){ selected.push({group:input.getAttribute('data-dx-group'),value:input.value}); });
  var selectedText=selected.map(function(x){return x.value.toLowerCase();}).join(' ');
  var scores=(profile.differentials||[]).map(function(dx){
    var score=0, words=dx.toLowerCase().split(/[^a-z0-9]+/).filter(function(w){return w.length>3;});
    words.forEach(function(w){ if(selectedText.indexOf(w)>=0) score++; });
    return {name:dx,score:score};
  }).sort(function(a,b){return b.score-a.score;});
  var top=scores[0] || {name:'Undetermined',score:0};
  var working=top.score>0 ? top.name : 'No single working diagnosis selected';
  var findings=selected.length ? selected.map(function(x){return '<li><strong>'+escapeHtml(x.group)+'</strong>: '+escapeHtml(x.value)+'</li>';}).join('') : '<li>No findings selected.</li>';
  root.innerHTML='<h3>Working diagnosis</h3><div class="diagnosis-working">'+escapeHtml(working)+'</div>' +
    '<p class="diagnosis-note">This is a pattern-matching RP aid. Consider the full assessment and competing differentials rather than treating one finding as diagnostic.</p>' +
    '<div class="diagnosis-result-grid"><div><h4>Recorded findings</h4><ul>'+findings+'</ul></div><div><h4>Possible differentials</h4><ol>'+scores.map(function(x){return '<li>'+escapeHtml(x.name)+(x.score?' <span class="diagnosis-score">'+x.score+' match'+(x.score===1?'':'es')+'</span>':'')+'</li>';}).join('')+'</ol></div></div>' +
    '<div class="diagnosis-next"><strong>MDT / escalation:</strong> confirm the history, observations, examination and investigations, document the working diagnosis, and escalate to the appropriate senior clinician/team when required.</div>';
}

function clearEmergencyDiagnosis() {
  document.querySelectorAll('#emergency-diagnosis-panel input[type="checkbox"]').forEach(function(input){input.checked=false;});
  var result=document.getElementById('emergency-diagnosis-result');
  if(result) result.innerHTML='<h3>Working diagnosis</h3><p>Select the relevant symptoms, observations, findings and history, then generate the diagnostic reasoning summary.</p>';
}
function activateEmergency(key) {
  var data = emergencyData[key];
  if (!data) return;
  document.getElementById('emergency-title').textContent = data.title;
  setEmergencyTab('overview');
  renderEmergencyDiagnosis(key);
  renderEmergencyFullReference(key, data);
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
  var fullReference = document.getElementById('emergency-full-reference');
  if (fullReference) {
    fullReference.style.display = 'none';
    fullReference.innerHTML = '';
  }
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
   VITAL SIGN CALCULATORS (Observations page)

   Each function reads its slider(s), updates the numeric
   display, and writes a plain-language clinical meaning into
   the matching .meaning element. Matches the reference bands
   already printed on the Observations/Pain pages.
========================================================= */

function updateBP() {
  var sysEl = document.getElementById('sys');
  var diaEl = document.getElementById('dia');
  if (!sysEl || !diaEl) return;

  var sys = Number(sysEl.value);
  var dia = Number(diaEl.value);

  var sysDisplay = document.getElementById('sysDisplay');
  var diaDisplay = document.getElementById('diaDisplay');
  if (sysDisplay) sysDisplay.textContent = sys;
  if (diaDisplay) diaDisplay.textContent = dia;

  var meaning = document.getElementById('bpMeaning');
  if (!meaning) return;

  if (sys >= 180 || dia >= 120) {
    meaning.textContent = 'Severely raised — needs urgent clinical assessment, particularly with concerning symptoms or signs of acute organ damage.';
  } else if (sys >= 140 || dia >= 90) {
    meaning.textContent = 'High BP — NICE uses this as the clinic threshold for further assessment/confirmation.';
  } else if (sys >= 120 || dia >= 80) {
    meaning.textContent = 'Raised / above ideal — not automatically hypertension; repeat and consider the clinical context.';
  } else if (sys < 90 || dia < 60) {
    meaning.textContent = 'Low BP / hypotension — may be significant if symptomatic: dizziness, weakness, confusion or fainting.';
  } else {
    meaning.textContent = 'Common reference range — often regarded as a healthy/ideal range, but context matters.';
  }
}

function updateHR() {
  var el = document.getElementById('hrRange');
  if (!el) return;
  var hr = Number(el.value);

  var display = document.getElementById('hrDisplay');
  if (display) display.textContent = hr;

  var meaning = document.getElementById('hrMeaning');
  if (!meaning) return;

  if (hr < 40) {
    meaning.textContent = 'Marked bradycardia — significantly slow heart rate, reassess urgently.';
  } else if (hr < 60) {
    meaning.textContent = 'Bradycardia — below the typical adult resting range.';
  } else if (hr <= 100) {
    meaning.textContent = 'Normal adult resting range.';
  } else if (hr <= 130) {
    meaning.textContent = 'Tachycardia — above the typical adult resting range.';
  } else {
    meaning.textContent = 'Marked tachycardia — significant, reassess urgently.';
  }
}

function updateRR() {
  var el = document.getElementById('rrRange');
  if (!el) return;
  var rr = Number(el.value);

  var display = document.getElementById('rrDisplay');
  if (display) display.textContent = rr;

  var meaning = document.getElementById('rrMeaning');
  if (!meaning) return;

  if (rr < 12) {
    meaning.textContent = 'Bradypnoea — below the typical adult resting range.';
  } else if (rr <= 20) {
    meaning.textContent = 'Normal adult resting range.';
  } else if (rr <= 24) {
    meaning.textContent = 'Raised respiratory rate — reassess and monitor closely.';
  } else {
    meaning.textContent = 'Marked tachypnoea — significant, escalate.';
  }
}

function updateSpO2() {
  var el = document.getElementById('spo2Range');
  if (!el) return;
  var spo2 = Number(el.value);

  var display = document.getElementById('spo2Display');
  if (display) display.textContent = spo2;

  var meaning = document.getElementById('spo2Meaning');
  if (!meaning) return;

  if (spo2 < 92) {
    meaning.textContent = 'Low oxygen saturation — significant hypoxia, escalate urgently.';
  } else if (spo2 < 96) {
    meaning.textContent = 'Mildly low — monitor closely and reassess.';
  } else {
    meaning.textContent = 'Normal oxygen saturation range.';
  }
}

function updateTemp() {
  var el = document.getElementById('tempRange');
  if (!el) return;
  var temp = Number(el.value);

  var display = document.getElementById('tempDisplay');
  if (display) display.textContent = temp.toFixed(1);

  var meaning = document.getElementById('tempMeaning');
  if (!meaning) return;

  if (temp < 35) {
    meaning.textContent = 'Hypothermia — significantly low body temperature.';
  } else if (temp < 36.1) {
    meaning.textContent = 'Mildly low — below the typical normal range.';
  } else if (temp <= 37.9) {
    meaning.textContent = 'Normal body temperature range.';
  } else if (temp <= 39) {
    meaning.textContent = 'Fever — raised body temperature.';
  } else {
    meaning.textContent = 'High fever — significant, escalate.';
  }
}

function updateBGL() {
  var el = document.getElementById('bglRange');
  if (!el) return;
  var bgl = Number(el.value);

  var display = document.getElementById('bglDisplay');
  if (display) display.textContent = bgl.toFixed(1);

  var meaning = document.getElementById('bglMeaning');
  if (!meaning) return;

  if (bgl < 4) {
    meaning.textContent = 'Hypoglycaemia — low blood glucose.';
  } else if (bgl <= 7) {
    meaning.textContent = 'Normal fasting reference range.';
  } else if (bgl <= 11) {
    meaning.textContent = 'Slightly raised — acceptable in a non-fasting reading, but note the context.';
  } else {
    meaning.textContent = 'Hyperglycaemia — high blood glucose.';
  }
}

function updateGCS() {
  var eEl = document.getElementById('gcsE');
  var vEl = document.getElementById('gcsV');
  var mEl = document.getElementById('gcsM');
  if (!eEl || !vEl || !mEl) return;

  var e = Number(eEl.value);
  var v = Number(vEl.value);
  var m = Number(mEl.value);
  var total = e + v + m;

  var eDisplay = document.getElementById('gcsEDisplay');
  var vDisplay = document.getElementById('gcsVDisplay');
  var mDisplay = document.getElementById('gcsMDisplay');
  var totalDisplay = document.getElementById('gcsDisplay');
  if (eDisplay) eDisplay.textContent = e;
  if (vDisplay) vDisplay.textContent = v;
  if (mDisplay) mDisplay.textContent = m;
  if (totalDisplay) totalDisplay.textContent = total;

  var meaning = document.getElementById('gcsMeaning');
  if (!meaning) return;

  if (total >= 15) {
    meaning.textContent = 'Fully alert — normal Glasgow Coma Scale score.';
  } else if (total >= 13) {
    meaning.textContent = 'Mild impairment of consciousness.';
  } else if (total >= 9) {
    meaning.textContent = 'Moderate impairment of consciousness.';
  } else {
    meaning.textContent = 'Severe impairment — often considered for airway protection and urgent escalation.';
  }
}

function updatePain() {
  var el = document.getElementById('painRange');
  if (!el) return;
  var pain = Number(el.value);

  var value = document.getElementById('painValue');
  if (value) value.textContent = pain + '/10';

  var meaning = document.getElementById('painMeaning');
  if (meaning) {
    if (pain === 0) {
      meaning.textContent = 'No pain.';
    } else if (pain <= 3) {
      meaning.textContent = 'Mild pain.';
    } else if (pain <= 6) {
      meaning.textContent = 'Moderate pain.';
    } else if (pain <= 9) {
      meaning.textContent = 'Severe pain.';
    } else {
      meaning.textContent = 'Worst pain imaginable.';
    }
  }

  var medication = document.getElementById('painMedication');
  if (medication) {
    if (pain === 0) {
      medication.textContent = '';
    } else if (pain <= 3) {
      medication.textContent = 'Mild: paracetamol 500 mg–1 g PO (≥4 hours apart, max 4 g/24h), ± ibuprofen 200–400 mg PO where an NSAID is appropriate.';
    } else if (pain <= 6) {
      medication.textContent = 'Moderate: paracetamol as above; consider co-codamol (1–2 tablets, 4–6 hours apart, max 8 tablets/24h) for appropriate acute injuries.';
    } else {
      medication.textContent = 'Severe: for major trauma, NICE recommends IV morphine as first-line, titrated to effect by an appropriately trained clinician.';
    }
  }
}

/* =========================================================
   CLIPBOARD COPY HELPERS

   copyText(id) copies the text content of a specific element
   (used by inline onclick="copyText('someId')" buttons).
   copyRPButton(button) is the generic delegated-click handler
   for RP copy buttons that don't carry their own onclick —
   it copies the nearest .rp-text sibling within the same item.
========================================================= */

async function copyText(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var text = el.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  } catch (_) {
    fallbackCopy(text);
    showToast('Copied to clipboard', 'success');
  }
}

async function copyRPButton(button) {
  if (!button) return;
  var item = button.closest('.rp-item, .scene-rp-item, .rp-card');
  if (!item) return;
  var textEl = item.querySelector('.rp-text, p');
  if (!textEl) return;
  var text = textEl.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    fallbackCopy(text);
  }
  var original = button.textContent;
  button.textContent = 'Copied!';
  setTimeout(function() {
    button.textContent = original;
  }, 1200);
}

/* =========================================================
   MEDICATION RP TOGGLE
========================================================= */

function toggleMed(button) {
  var card = button?.closest('.med-card');
  if (!card) return;

  var rp = card.querySelector('.med-rp');
  if (!rp) return;

  var open = rp.style.display === 'block';
  rp.style.display = open ? 'none' : 'block';
  button.textContent = open ? 'Show RP /me' : 'Hide RP /me';
}

/* =========================================================
   CARDIAC ASSESSMENT & CARE — RP LIBRARY

   Mirrors the scene/procedure RP pattern (rp / rp_bed /
   rp_floor arrays rendered through the shared bed/floor
   context switch and copy/edit-mode helpers).
========================================================= */

var cardiacData = {
  assessment: {
    rp: [
      'introduces themselves to the patient and asks about their chest pain using SOCRATES.',
      'attaches continuous cardiac monitoring and takes a full set of observations.',
      'checks SpO₂ before deciding whether supplemental oxygen is needed.',
      'applies the 12-lead ECG and reviews it for ST changes or a new bundle branch block.',
      'asks about aspirin allergies before considering aspirin administration.',
      'compares the current ECG against any previous ECG available.',
      'escalates to a senior clinician after finding a dynamic or abnormal ECG.'
    ],
    rp_bed: [
      formatRpWithEmote('sits beside the bed and asks the patient about their chest pain using SOCRATES.', 'talk'),
      formatRpWithEmote('attaches continuous cardiac monitoring at the bedside and takes a full set of observations.', 'check'),
      formatRpWithEmote('checks the patient\'s SpO₂ at the bedside before deciding whether supplemental oxygen is needed.', 'check'),
      formatRpWithEmote('applies the 12-lead ECG at the bedside and reviews it for ST changes or a new bundle branch block.', 'check'),
      formatRpWithEmote('asks the patient about aspirin allergies before considering aspirin administration.', 'talk'),
      formatRpWithEmote('compares the current ECG against any previous ECG available on the chart.', 'notepad'),
      formatRpWithEmote('steps away from the bedside to escalate to a senior clinician after finding an abnormal ECG.', 'radio')
    ],
    rp_floor: [
      formatRpWithEmote('kneels beside the patient on the ground and asks about their chest pain using SOCRATES.', 'talk'),
      formatRpWithEmote('attaches continuous cardiac monitoring while kneeling on the ground and takes a full set of observations.', 'check'),
      formatRpWithEmote('checks the patient\'s SpO₂ while kneeling on the ground before deciding whether supplemental oxygen is needed.', 'check'),
      formatRpWithEmote('applies the 12-lead ECG while kneeling beside the patient on the ground.', 'check'),
      formatRpWithEmote('asks the patient about aspirin allergies before considering aspirin administration.', 'talk'),
      formatRpWithEmote('compares the current ECG against any previous ECG available.', 'notepad'),
      formatRpWithEmote('stands up from beside the patient to escalate to a senior clinician after finding an abnormal ECG.', 'radio')
    ]
  },
  care: {
    rp: [
      'checks for a response and normal breathing for no more than 10 seconds before starting CPR.',
      'starts chest compressions at the centre of the chest, rate 100-120 per minute.',
      'attaches the AED/defibrillator as soon as it is available and follows its prompts.',
      'stands clear during rhythm analysis and shock delivery, then resumes compressions immediately.',
      'swaps the compressor role roughly every 2 minutes to maintain compression quality.',
      'considers the 4 Hs and 4 Ts while resuscitation continues.',
      'obtains a 12-lead ECG and arranges urgent cardiology referral after return of spontaneous circulation.'
    ],
    rp_bed: [
      formatRpWithEmote('checks for a response and normal breathing at the bedside for no more than 10 seconds before starting CPR.', 'check'),
      formatRpWithEmote('starts chest compressions on the patient in the bed, rate 100-120 per minute.', 'cpr'),
      formatRpWithEmote('attaches the AED/defibrillator at the bedside as soon as it is available and follows its prompts.', 'check'),
      formatRpWithEmote('stands clear of the bed during rhythm analysis and shock delivery, then resumes compressions immediately.', 'press'),
      formatRpWithEmote('swaps the compressor role at the bedside roughly every 2 minutes to maintain compression quality.', 'cpr'),
      formatRpWithEmote('considers the 4 Hs and 4 Ts at the bedside while resuscitation continues.', 'notepad'),
      formatRpWithEmote('obtains a 12-lead ECG at the bedside after return of spontaneous circulation.', 'check')
    ],
    rp_floor: [
      formatRpWithEmote('checks for a response and normal breathing on the ground for no more than 10 seconds before starting CPR.', 'check'),
      formatRpWithEmote('kneels over the patient on the ground and starts chest compressions, rate 100-120 per minute.', 'cpr'),
      formatRpWithEmote('attaches the AED/defibrillator on the ground as soon as it is available and follows its prompts.', 'check'),
      formatRpWithEmote('stands clear during rhythm analysis and shock delivery, then resumes compressions immediately.', 'press'),
      formatRpWithEmote('swaps the compressor role on the ground roughly every 2 minutes to maintain compression quality.', 'cpr'),
      formatRpWithEmote('considers the 4 Hs and 4 Ts while resuscitation continues on the ground.', 'notepad'),
      formatRpWithEmote('obtains a 12-lead ECG on the ground after return of spontaneous circulation.', 'check')
    ]
  }
};

var currentCardiacCategory = 'assessment';
var currentCardiacRPMode = 'slash';

var cardiacChecklistData = {
  assessment: [
    'Introduce yourself and gain consent',
    'SOCRATES chest pain history',
    'Full set of observations including SpO₂',
    '12-lead ECG within 10 minutes of contact',
    'Oxygen only if SpO₂ below target range',
    'Escalate red flags early'
  ],
  care: [
    'Confirm unresponsive, not breathing normally',
    'Start high-quality chest compressions immediately',
    'Attach AED/defibrillator as soon as available',
    'Minimise interruptions to compressions',
    'Swap compressor role every 2 minutes',
    'Consider the 4 Hs and 4 Ts',
    'Post-ROSC: target SpO₂ 94-98%, 12-lead ECG'
  ]
};

var cardiacQuestionsData = {
  assessment: [
    'Can you describe the pain — sharp, heavy, tight or crushing?',
    'Does the pain move anywhere, such as your arm, jaw or back?',
    'When did the pain start, and has anything made it better or worse?',
    'Have you had chest pain like this before?',
    'Are you allergic to aspirin?'
  ],
  care: [
    'Can you hear me? Are you okay? (checking for a response)',
    'Bystander: how long ago did they collapse?',
    'Bystander: has anyone started CPR or used a defibrillator yet?',
    'Does the patient have any known heart conditions?'
  ]
};

function showCardiacCategory(category) {
  if (!cardiacData[category]) category = 'assessment';
  currentCardiacCategory = category;

  document.querySelectorAll('.cardiac-panel').forEach(function(panel) {
    panel.classList.toggle('active', panel.id === 'cardiac-' + category);
  });

  document.querySelectorAll('.cardcat').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + category + "'") >= 0);
  });

  renderCardiacChecklist();
  renderCardiacQuestions();
  renderCardiacRP();
}

function renderCardiacChecklist() {
  var container = document.getElementById('cardiacChecklist');
  if (!container) return;
  var items = cardiacChecklistData[currentCardiacCategory] || [];
  container.innerHTML = items.map(function(item, i) {
    return '<div class="check-row"><input type="checkbox" name="cardiac-check-' + currentCardiacCategory + '-' + i + '"><span>' + escapeHtml(item) + '</span></div>';
  }).join('');
}

function renderCardiacQuestions() {
  var container = document.getElementById('cardiacQuestions');
  if (!container) return;
  var items = cardiacQuestionsData[currentCardiacCategory] || [];
  container.innerHTML = items.map(function(q) {
    return '<div class="question-row"><p>' + escapeHtml(q) + '</p></div>';
  }).join('');
}

function setCardiacRPMode(mode) {
  if (mode !== 'slash' && mode !== 'f8') mode = 'slash';
  currentCardiacRPMode = mode;

  document.querySelectorAll('.crpt').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.indexOf("'" + mode + "'") >= 0);
  });

  renderCardiacRP();
}

function renderCardiacRP() {
  var container = document.getElementById('cardiacRPList');
  if (!container) return;

  var category = cardiacData[currentCardiacCategory];
  if (!category) { container.innerHTML = ''; return; }

  var context = (typeof currentContext !== 'undefined' && currentContext) || 'bed';
  var rpList = category['rp_' + context] || category.rp || [];

  if (!rpList.length) {
    container.innerHTML = '<p class="muted">No RP actions for this category.</p>';
    return;
  }

  var mode = currentCardiacRPMode;
  container.innerHTML = rpList.map(function(action, index) {
    var prefix = mode === 'f8' ? 'ME ' : '/me ';
    return (
      '<div class="rp-item scene-rp-item">' +
        '<span>' + (mode === 'f8' ? 'ME • F8' : '/me') + '</span>' +
        '<p id="cardiacRP-' + index + '" class="rp-text">' + escapeHtml(prefix + action) + '</p>' +
        '<button type="button" onclick="copyText(\'cardiacRP-' + index + '\')">Copy</button>' +
      '</div>'
    );
  }).join('');
}

function initialiseCardiac() {
  currentCardiacCategory = 'assessment';
  currentCardiacRPMode = 'slash';
  showCardiacCategory('assessment');
}


/* =========================================================
   ACCESSIBILITY: FORM FIELD IDENTITY
   Give dynamically-rendered form controls a stable id/name when
   a component has not supplied one. This prevents browser
   autofill/accessibility warnings without changing behaviour.
========================================================= */
let uhsFormFieldCounter = 0;
function ensureUhsFormFieldIdentity(root = document) {
  const fields = [];
  if (root && root.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA)$/.test(root.tagName)) {
    fields.push(root);
  }
  if (root?.querySelectorAll) {
    fields.push(...root.querySelectorAll('input, select, textarea'));
  }
  fields.forEach((field) => {
    if (field.id || field.name) return;
    let base = 'uhs-field';
    const owner = field.closest('[id]');
    if (owner?.id) base += '-' + owner.id.replace(/[^a-zA-Z0-9_-]/g, '-');
    let id;
    do {
      uhsFormFieldCounter += 1;
      id = `${base}-${uhsFormFieldCounter}`;
    } while (document.getElementById(id));
    field.id = id;
    field.name = id;
  });
}

/* =========================================================
   STARTUP
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    ensureUhsFormFieldIdentity(document);
    if (window.MutationObserver) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) ensureUhsFormFieldIdentity(node);
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

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


window.login =
  login;

window.logout =
  logout;

window.showSection =
  showSection;
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

/* Surgery reference data is application-owned; no CMS runtime dependency. */
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


/* =========================================================
   PROCEDURE-SPECIFIC SURGERY ROLE ACTIONS

   Each surgery gets its own surgeon/assistant/scrub/circulator/
   anaesthetist/recovery actions, reflecting the actual steps,
   instruments and suture/closure technique for that operation.
   renderSurgeryRoleActions() checks this map first and only
   falls back to the generic surgeryRoleActions template below
   for a surgery (or role) not yet covered here.
========================================================= */

/* =========================================================
   PER-SURGERY, PER-ROLE RP ACTIONS

   Each surgery has its own realistic, detailed set of
   /me actions for every role (surgeon, assistant, scrub,
   circulator, anaesthetist, recovery), covering the full
   WHO Sign In / Time Out / Sign Out flow, procedure-specific
   operative technique with real suture materials and sizes,
   and a structured handover to recovery.

   renderSurgeryRoleActions() checks this map first and only
   falls back to the generic surgeryRoleActions template below
   for a surgery (or role) not yet covered here.
========================================================= */

var surgeryRoleActionsBySurgery = {

  bulletHead: {
    surgeon: [
      "confirms patient identity, consent and the intended entry point and trajectory with the team during the WHO Sign In.",
      "reviews the CT head and CT angiogram with the team, marking the planned craniotomy site relative to the bullet tract.",
      "confirms the patient is positioned supine with the head fixed in a horseshoe headrest or pins, with a slight rotation to bring the entry wound uppermost.",
      "checks the shave line and skin markings before scrubbing the scalp with chlorhexidine and applying sterile drapes.",
      "leads the WHO Time Out immediately before incision, confirming the side, site and neurosurgical plan with the whole team.",
      "infiltrates the scalp margins with local anaesthetic and adrenaline to reduce bleeding before making the incision.",
      "makes the scalp incision and reflects the scalp flap, controlling bleeding from the scalp edges with Raney clips, artery forceps and diathermy.",
      "drills the burr holes and completes the craniotomy with the craniotome, elevating the bone flap to expose the dura over the bullet tract.",
      "inspects the dura for tears and controls epidural bleeding from the middle meningeal vessels with bipolar diathermy and haemostatic packing.",
      "opens the dura in a curvilinear fashion and inspects the brain surface along the tract for contusion, laceration and active bleeding.",
      "gently debrides devitalised brain tissue and removes accessible bone fragments and the bullet or fragments under direct vision and image guidance.",
      "irrigates the tract thoroughly with warm saline to clear debris and reduce the risk of infection.",
      "achieves haemostasis of the brain surface with bipolar diathermy, haemostatic matrix and cottonoid pressure, checking for any deep bleeding along the tract.",
      "places a small drain into the resection cavity if there is ongoing ooze or a large dead space.",
      "closes the dura with a continuous 4-0 Nurolon suture, using a dural substitute patch to achieve a watertight repair where the defect is large.",
      "replaces the bone flap, or discards it in favour of a delayed cranioplasty if there is significant swelling, and secures it with titanium plates and screws.",
      "closes the galea and pericranium with interrupted 2-0 Vicryl sutures to obliterate dead space.",
      "closes the scalp skin with staples, checking the wound edges are well opposed.",
      "applies a light gauze and crepe head dressing and confirms no ongoing scalp bleeding.",
      "completes the WHO Sign Out, confirming instrument, swab and needle counts with the scrub team and checking the specimen labelling.",
      "dictates the operative findings, including the trajectory, structures involved and any fragments retrieved.",
      "gives a structured neurosurgical handover to recovery, including the baseline GCS, pupil findings and post-operative imaging plan."
    ],
    assistant: [
      "helps position the patient supine and secures the head in the pinned headrest, checking pressure points are padded.",
      "assists with scrubbing and draping, ensuring the sterile field is maintained around the head.",
      "holds retractors to maintain scalp flap exposure during the craniotomy.",
      "applies suction continuously to keep the field clear of blood and irrigation fluid during dural opening.",
      "assists with cottonoid placement and gentle brain retraction during exploration of the tract.",
      "helps identify and retrieve bone and bullet fragments, passing them to the scrub nurse for the specimen pot.",
      "assists with haemostasis by holding pressure with cottonoids while the surgeon uses the bipolar diathermy.",
      "cuts sutures as the surgeon places the continuous dural closure.",
      "holds the bone flap steady while the surgeon secures the titanium plates and screws.",
      "assists with layered closure of the galea, cutting sutures as each stitch is tied.",
      "helps apply the head dressing and checks it is secure without being too tight.",
      "assists with removing the head pins and repositioning the patient for transfer.",
      "helps transfer the patient onto the recovery trolley, supporting the head and airway throughout.",
      "confirms the swab, needle and instrument counts alongside the surgeon and scrub nurse before closure is completed."
    ],
    scrub: [
      "checks the craniotomy instrument set, including the craniotome, perforators and dural instruments, against the count sheet.",
      "gowns and gloves the surgeon and assistant, then sets up the sterile trolley and Mayo stand.",
      "hands over the local anaesthetic and syringe for scalp infiltration.",
      "passes the scalpel for the scalp incision, followed by Raney clips and artery forceps for haemostasis.",
      "passes the periosteal elevator and craniotome for the bone flap, keeping the drill bits and burrs organised.",
      "hands the surgeon the dural hooks and dural scissors for opening the dura.",
      "maintains a continuous swab and needle count as the tract is explored and fragments are removed.",
      "prepares and labels the specimen pot for the retrieved bullet and bone fragments, keeping it separate from tissue specimens.",
      "loads the 4-0 Nurolon suture for the dural closure and passes it on request.",
      "passes the titanium plating set and screws for refixation of the bone flap.",
      "loads the 2-0 Vicryl for the galeal layer and the skin stapler for the scalp closure.",
      "performs the first instrument, swab and needle count with the circulator before the dura is closed.",
      "performs the final count with the circulator before skin closure and confirms it is correct.",
      "prepares the head dressing materials and hands them to the surgeon and assistant.",
      "signs off the final count documentation and ensures all specimens are ready for collection."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies and the marked entry site with the awake patient or notes.",
      "positions the theatre table, headrest and pinning equipment, and confirms the patient is safely secured before draping.",
      "opens additional sterile drapes, gowns and the craniotomy set as requested by the scrub nurse.",
      "documents blood loss, irrigation fluid used and the timing of key steps throughout the procedure.",
      "liaises with the blood bank to ensure cross-matched blood is available given the risk of intracranial bleeding.",
      "coordinates the WHO Time Out with the full team immediately before incision.",
      "labels the retrieved bullet and bone fragment specimens and arranges chain of custody documentation for forensic retention.",
      "liaises with histology and the forensic team regarding handling of the bullet fragment as potential evidence.",
      "retrieves additional equipment such as intraoperative drill bits or extra haemostatic agents as needed.",
      "coordinates the WHO Sign Out, confirming counts, specimen labelling and any equipment concerns with the team.",
      "confirms the final instrument, swab and needle counts with the scrub nurse and surgeon.",
      "documents the total procedure time and any deviations from the surgical plan.",
      "communicates the operative summary and post-operative imaging plan to the recovery team and neurosurgical ward."
    ],
    anaesthetist: [
      "performs a pre-operative airway and neurological assessment, noting the baseline GCS, pupil size and reactivity.",
      "establishes large-bore intravenous access and an arterial line for continuous blood pressure monitoring.",
      "induces anaesthesia carefully to avoid sudden swings in blood pressure that could worsen intracranial bleeding.",
      "secures the airway with a cuffed endotracheal tube, confirming placement with capnography.",
      "inserts a urinary catheter and, where indicated, a central line for vasoactive drug administration.",
      "sets up invasive blood pressure monitoring and monitors end-tidal carbon dioxide closely to control cerebral blood flow.",
      "maintains anaesthesia with agents chosen to minimise increases in intracranial pressure, avoiding hypotension and hypoxia.",
      "monitors for signs of rising intracranial pressure, communicating any bradycardia, hypertension or pupillary changes to the surgeon immediately.",
      "manages fluid administration carefully, avoiding hypotonic fluids and maintaining cerebral perfusion pressure.",
      "monitors temperature and takes steps to prevent hyperthermia, which can worsen neurological injury.",
      "plans analgesia for emergence, balancing adequate pain control with the need for a clear neurological assessment.",
      "plans emergence to allow rapid neurological assessment, avoiding excessive sedation where possible.",
      "extubates once the patient meets criteria, or arranges transfer to intensive care ventilated if the neurological status requires it.",
      "gives a structured handover to recovery, covering the anaesthetic course, fluid balance, and the target parameters for blood pressure and oxygenation."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, including the trajectory, findings and baseline neurological status.",
      "performs an initial ABCDE assessment on arrival, prioritising airway patency and breathing adequacy.",
      "records a baseline Glasgow Coma Scale score, pupil size and reactivity, and limb power for comparison.",
      "monitors oxygen saturation, respiratory rate and airway patency closely as the anaesthetic wears off.",
      "assesses pain and titrates analgesia carefully, aware that opioids can mask neurological deterioration if overused.",
      "checks the head dressing for any fresh bleeding or swelling and inspects for cerebrospinal fluid leakage.",
      "monitors blood pressure closely, escalating for hypertension or hypotension that could affect cerebral perfusion.",
      "repeats neurological observations at frequent intervals, watching for any drop in GCS, new pupil asymmetry or limb weakness.",
      "monitors fluid balance and urine output, remaining vigilant for signs of diabetes insipidus after brain injury.",
      "escalates immediately to the neurosurgical team for any fall in GCS of two points or more, new pupillary changes or seizure activity.",
      "documents all observations, interventions and communications clearly in the recovery record.",
      "confirms readiness for ward or high dependency transfer against local discharge criteria before handover.",
      "gives a structured handover to the receiving ward, including the neuro-observation frequency and escalation thresholds."
    ]
  },

  bulletChest: {
    surgeon: [
      "confirms patient identity, consent and the side of the chest wound with the team during the WHO Sign In.",
      "reviews the chest X-ray and CT chest with the team, noting the likely trajectory and any signs of tension pneumothorax or haemothorax.",
      "confirms the patient is positioned appropriately, often supine with the affected side slightly elevated, or lateral for a formal thoracotomy.",
      "checks that a working chest drain or finger thoracostomy has been performed if there are signs of tension pneumothorax before induction.",
      "supervises skin prep with chlorhexidine over the chest, axilla and upper abdomen, and draping to allow extension of the incision if needed.",
      "leads the WHO Time Out immediately before incision, confirming the side, planned approach and availability of blood products.",
      "makes the incision, choosing a clamshell, anterolateral or posterolateral thoracotomy depending on the injury and haemodynamic status.",
      "divides the intercostal muscles and enters the pleural cavity, evacuating blood and clot with suction.",
      "inserts a rib spreader to gain exposure and rapidly assesses the lung, pericardium, great vessels and diaphragm for injury.",
      "controls active bleeding from a lung laceration with digital pressure, staplers or non-anatomical resection as required.",
      "opens the pericardium longitudinally if tamponade is suspected, evacuating clot and inspecting the heart for injury.",
      "controls a cardiac wound with digital pressure and repairs it with pledgeted 3-0 or 4-0 Prolene sutures, avoiding the coronary vessels.",
      "inspects the great vessels and controls any active bleeding with vascular clamps, repairing or shunting as the injury allows.",
      "cross-clamps the descending aorta if the patient is in extremis, to redistribute blood flow to the heart and brain.",
      "inspects the diaphragm for injury and repairs any defect with interrupted or continuous 0 or 1 non-absorbable suture.",
      "irrigates the pleural cavity thoroughly with warm saline and rechecks all injured structures for haemostasis.",
      "places one or two large-bore intercostal chest drains, positioning them apically for air and basally for fluid.",
      "closes the pericardium loosely with interrupted 2-0 Vicryl sutures if it was opened, leaving a window to prevent tamponade.",
      "approximates the ribs with pericostal 1 or 0 Vicryl sutures, then closes the intercostal muscle and chest wall layers with 0 Vicryl.",
      "closes the subcutaneous layer with 2-0 Vicryl and the skin with a subcuticular 3-0 Monocryl suture or staples.",
      "completes the WHO Sign Out, confirming counts, drain positions and specimen labelling with the team.",
      "dictates the operative findings and gives a structured handover to recovery, highlighting the injuries repaired and the chest drain output to monitor."
    ],
    assistant: [
      "helps position the patient for the thoracotomy and assists with prepping and draping the chest field.",
      "holds the rib spreader steady and adjusts retraction to optimise exposure as the surgeon works.",
      "applies continuous suction to clear blood and clot from the pleural cavity.",
      "assists with packing the chest to control diffuse bleeding while the surgeon identifies the source.",
      "holds vascular clamps or provides digital pressure on a bleeding vessel while the surgeon prepares to repair it.",
      "assists with cardiac or great vessel repair by holding tissue, cutting sutures and keeping the field visible.",
      "helps position and secure the intercostal chest drains, ensuring they are connected to the underwater seal correctly.",
      "assists with rib approximation, holding the pericostal sutures under tension as the surgeon ties them.",
      "cuts sutures during closure of the intercostal muscle, chest wall and subcutaneous layers.",
      "assists with the final skin closure, ensuring the drains exit through separate stab incisions and are secured.",
      "helps confirm chest drain function, checking for swing and bubbling before dressing.",
      "assists with applying the chest dressing and securing the drain tubing.",
      "helps transfer the patient to recovery, supporting the chest drains and monitoring lines during the move.",
      "confirms swab, needle and instrument counts alongside the surgeon and scrub nurse before closure is completed."
    ],
    scrub: [
      "checks the thoracotomy instrument set, including rib spreaders, vascular clamps and a thoracic stapler, against the count sheet.",
      "gowns and gloves the surgical team and prepares the sterile trolley with the thoracotomy tray ready.",
      "passes the scalpel for the skin incision and heavy scissors or diathermy for the intercostal muscle division.",
      "hands over the rib spreader once the pleural cavity is entered.",
      "keeps large swabs and packs readily available for rapid haemorrhage control and maintains an accurate running count.",
      "passes vascular clamps and Prolene sutures promptly if a great vessel or cardiac injury is identified.",
      "loads the 3-0 or 4-0 pledgeted Prolene for cardiac repair and has additional sutures ready in case of further injury.",
      "passes the thoracic stapling device for lung resection or wedge repair as required.",
      "prepares and connects the underwater seal drainage system before the chest drains are inserted.",
      "loads the 1 or 0 Vicryl for pericostal and chest wall closure, and the 2-0 Vicryl for the subcutaneous layer.",
      "loads the 3-0 Monocryl for the subcuticular skin closure or prepares the skin stapler.",
      "performs an interim instrument, swab and needle count with the circulator before the chest is closed around the drains.",
      "performs the final count with the circulator before skin closure and confirms it is correct.",
      "prepares any tissue specimens for pathology, labelling and documenting them accurately.",
      "prepares the chest dressing and hands it to the surgeon and assistant for application."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies and the injured side.",
      "positions the theatre table and prepares for rapid conversion between supine and lateral positioning if needed.",
      "opens additional sterile packs, chest drains and the thoracotomy set as requested by the scrub nurse.",
      "documents blood loss, chest drain output and fluid and blood product administration throughout the case.",
      "activates the massive transfusion protocol and liaises with the blood bank for urgent blood products.",
      "coordinates the WHO Time Out with the full team immediately before incision.",
      "retrieves additional equipment such as the thoracic stapler, vascular clamps or a cell salvage device as required.",
      "labels any retrieved bullet fragments and arranges chain of custody documentation for forensic retention.",
      "coordinates the WHO Sign Out, confirming counts, drain numbers and specimen labelling with the team.",
      "confirms the final instrument, swab and needle counts with the scrub nurse and surgeon.",
      "documents the total procedure time, cross-clamp time if used, and any deviations from the surgical plan.",
      "liaises with the intensive care unit to prepare a bed for post-operative ventilatory support.",
      "communicates the operative summary, drain output targets and blood product requirements to the recovery team."
    ],
    anaesthetist: [
      "performs a rapid pre-operative assessment of airway, breathing and circulatory status, recognising signs of tension pneumothorax or tamponade.",
      "establishes large-bore intravenous access and an arterial line, anticipating major blood loss.",
      "performs a rapid sequence induction, prepared for haemodynamic instability during induction.",
      "secures the airway with a double-lumen tube or bronchial blocker where one-lung ventilation is needed for surgical access.",
      "confirms correct positioning of the double-lumen tube with auscultation and fibreoptic bronchoscopy where available.",
      "inserts a central line and sets up invasive blood pressure monitoring given the risk of major haemorrhage.",
      "activates the massive transfusion protocol and administers blood products guided by clinical status and coagulation results.",
      "manages one-lung ventilation carefully, balancing oxygenation against surgical exposure needs.",
      "monitors closely for signs of tension pneumothorax, air embolism or cardiac tamponade, alerting the surgeon immediately.",
      "monitors temperature and coagulation status, treating hypothermia and coagulopathy aggressively.",
      "communicates continuously with the surgeon about blood pressure, blood loss and the need for aortic cross-clamping if required.",
      "plans analgesia for emergence, considering regional techniques such as a paravertebral block once haemodynamically stable.",
      "plans emergence, deciding between early extubation and ventilated transfer to intensive care based on the extent of injury.",
      "gives a structured handover to recovery or intensive care, covering fluid balance, blood products given and chest drain output."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, including the injuries repaired and chest drain positions.",
      "performs an initial ABCDE assessment on arrival, with particular attention to respiratory rate, effort and oxygen saturation.",
      "monitors the chest drains closely for swing, bubbling and volume of output, escalating for sudden increases in blood loss.",
      "auscultates the chest regularly to check for equal air entry and to detect a developing pneumothorax.",
      "assesses pain and titrates analgesia, supporting effective breathing and coughing to prevent atelectasis.",
      "monitors vital signs closely, watching for signs of ongoing haemorrhage, tamponade or tension pneumothorax.",
      "checks the chest wound and dressing for bleeding or surgical emphysema.",
      "monitors fluid balance and urine output, continuing blood product support as directed.",
      "encourages deep breathing exercises and early mobilisation of the unaffected limbs where appropriate.",
      "escalates immediately to the surgical team for chest drain output above the agreed threshold, sudden desaturation or haemodynamic instability.",
      "documents all observations, drain outputs and interventions clearly in the recovery record.",
      "confirms readiness for ward or high dependency transfer against local discharge criteria.",
      "gives a structured handover to the receiving ward, including chest drain management and respiratory monitoring requirements."
    ]
  },

  bulletAbdomen: {
    surgeon: [
      "confirms patient identity, consent and the presence of peritonism or haemodynamic instability with the team during the WHO Sign In.",
      "reviews available imaging and the mechanism of injury with the team, anticipating likely injured structures along the bullet trajectory.",
      "confirms the patient is positioned supine with both arms extended, prepped from nipples to knees to allow access for chest extension or vascular harvest.",
      "supervises rapid skin prep with chlorhexidine and draping widely enough to extend the incision if needed.",
      "leads the WHO Time Out immediately before incision, confirming the plan, availability of blood products and readiness for a damage control approach.",
      "makes a long midline incision and enters the peritoneal cavity rapidly, evacuating blood and clot with suction.",
      "performs four-quadrant packing with large abdominal packs to control diffuse haemorrhage before a systematic exploration.",
      "systematically explores the abdomen, examining the bowel, mesentery, liver, spleen, stomach and retroperitoneum for injury.",
      "controls active bleeding from a solid organ injury with direct pressure, packing, or resection such as a splenectomy where the spleen is unsalvageable.",
      "identifies bowel perforations and controls contamination promptly with bowel clamps or a rapid stapled resection.",
      "inspects the retroperitoneum and great vessels for injury, controlling any active bleeding with vascular clamps or direct pressure.",
      "decides between damage control surgery with temporary closure or definitive repair based on the patient's physiology, coagulation status and temperature.",
      "performs a rapid bowel resection with a linear stapler where indicated, leaving bowel ends stapled and unjoined if a damage control approach is chosen.",
      "repairs any accessible vascular injury with 4-0 or 5-0 Prolene sutures, or ligates a non-essential vessel if repair is not feasible.",
      "irrigates the peritoneal cavity thoroughly with warm saline to remove contamination and blood.",
      "removes the packs sequentially, rechecking each quadrant for rebleeding before proceeding to closure.",
      "performs a formal anastomosis with a stapler or hand-sewn technique using 3-0 PDS if the patient's physiology allows definitive repair.",
      "places intra-abdominal drains near any repair at risk of leakage or ongoing ooze.",
      "closes the abdominal fascia with a continuous loop 1 PDS suture, or applies a temporary abdominal closure device if a damage control approach is chosen.",
      "closes the subcutaneous layer with 2-0 Vicryl and the skin with staples, or leaves the skin open if there is significant contamination.",
      "completes the WHO Sign Out, confirming counts, pack numbers and specimen labelling with the team.",
      "dictates the operative findings and gives a structured handover to recovery, including the plan for a possible return to theatre for a second look."
    ],
    assistant: [
      "helps position and prep the patient, ensuring the field extends from the chest to the knees.",
      "assists with rapid entry into the peritoneal cavity and helps place the four-quadrant packs.",
      "retracts the bowel and abdominal wall to give the surgeon a clear view during systematic exploration.",
      "applies suction continuously to keep the field clear of blood during the search for the source of bleeding.",
      "holds bowel clamps or provides pressure on a bleeding vessel while the surgeon prepares definitive control.",
      "assists with the bowel resection, holding the bowel steady while the stapler is fired.",
      "helps with vascular repair by holding tissue and cutting sutures as the surgeon ties them.",
      "assists with pack removal, checking each quadrant methodically with the surgeon for rebleeding.",
      "helps position intra-abdominal drains and secures them before closure.",
      "assists with fascial closure, maintaining tension on the sutures or holding the temporary closure device in place.",
      "cuts sutures during closure of the subcutaneous layer and skin.",
      "helps apply the abdominal dressing or temporary abdominal closure dressing.",
      "assists with transferring the patient to intensive care or recovery, supporting drains and lines during the move.",
      "confirms swab, needle and instrument counts alongside the surgeon and scrub nurse before closure is completed."
    ],
    scrub: [
      "checks the laparotomy instrument set, including bowel clamps, vascular clamps and a linear stapler, against the count sheet.",
      "gowns and gloves the surgical team and prepares the trolley with the major laparotomy tray ready.",
      "passes the scalpel for the midline incision and heavy scissors or diathermy to enter the peritoneum.",
      "has large abdominal packs ready immediately for four-quadrant packing and keeps a strict pack count.",
      "passes bowel clamps and staplers promptly as bowel injuries are identified.",
      "keeps additional swabs and packs readily available throughout the prolonged exploration, maintaining a continuous count.",
      "loads the 4-0 or 5-0 Prolene for vascular repair and has ligatures ready for vessels to be tied off.",
      "passes the linear stapler for bowel resection and reloads cartridges as required.",
      "loads the 1 PDS for fascial closure, or prepares the temporary abdominal closure system if damage control is planned.",
      "loads the 2-0 Vicryl for the subcutaneous layer and prepares the skin stapler or leaves the skin tray ready if closure is deferred.",
      "performs an interim instrument, swab and needle count with the circulator before packs are removed.",
      "performs the final count with the circulator before fascial closure and confirms it is correct.",
      "prepares any resected specimens, such as the spleen or bowel segment, for pathology and labels them accurately.",
      "prepares the abdominal dressing or temporary closure materials and hands them to the surgeon.",
      "documents the final count sign-off and confirms all packs used have been accounted for and removed."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies and the suspected extent of injury.",
      "positions the theatre table and prepares warming equipment given the risk of prolonged surgery and hypothermia.",
      "opens additional sterile packs, staplers and vascular instruments as requested by the scrub nurse.",
      "documents blood loss, pack numbers used and fluid and blood product administration throughout the case.",
      "activates the massive transfusion protocol and liaises continuously with the blood bank for urgent blood products.",
      "coordinates the WHO Time Out with the full team immediately before incision.",
      "tracks the number of abdominal packs inserted and removed, cross-checking with the scrub nurse at every stage.",
      "labels any retrieved bullet fragments and arranges chain of custody documentation for forensic retention.",
      "liaises with histology regarding any resected organ or bowel specimens sent for pathology.",
      "coordinates the WHO Sign Out, confirming counts, pack numbers and specimen labelling with the team.",
      "confirms the final instrument, swab and needle counts with the scrub nurse and surgeon.",
      "documents the total procedure time and confirms the plan for a possible re-look laparotomy with the team.",
      "liaises with intensive care to prepare a bed and communicates the operative summary and ongoing resuscitation needs to the receiving team."
    ],
    anaesthetist: [
      "performs a rapid pre-operative assessment, recognising signs of haemorrhagic shock and the need for urgent surgery.",
      "establishes large-bore intravenous access and an arterial line, anticipating massive blood loss.",
      "performs a rapid sequence induction, prepared for cardiovascular collapse on induction of a hypovolaemic patient.",
      "secures the airway with a cuffed endotracheal tube and confirms placement with capnography.",
      "inserts a central line and activates the massive transfusion protocol, administering blood products in a balanced ratio.",
      "sets up invasive blood pressure monitoring and near-patient coagulation testing to guide transfusion.",
      "maintains permissive hypotension where appropriate until haemorrhage is controlled, then restores normal perfusion.",
      "monitors core temperature closely and uses active warming measures to prevent the lethal triad of hypothermia, acidosis and coagulopathy.",
      "communicates continuously with the surgeon about blood loss, blood pressure and the need for a damage control approach.",
      "corrects coagulopathy with blood products and adjuncts such as tranexamic acid or calcium as guided by results.",
      "plans analgesia appropriate to the extent of surgery and the patient's physiological reserve.",
      "plans emergence, favouring a ventilated transfer to intensive care where a damage control or second-look approach is planned.",
      "liaises with intensive care regarding ongoing resuscitation and correction of physiology before any planned return to theatre.",
      "gives a structured handover to recovery or intensive care, covering blood products given, fluid balance and the plan for further surgery."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, including the injuries found and whether closure was temporary or definitive.",
      "performs an initial ABCDE assessment on arrival, with close attention to haemodynamic stability and ongoing bleeding.",
      "monitors vital signs closely, watching for signs of ongoing haemorrhage or evolving abdominal compartment syndrome.",
      "checks the abdominal dressing or temporary closure device for bleeding, tension and drain function.",
      "monitors intra-abdominal drains for volume and character of output, escalating for sudden increases.",
      "assesses pain and titrates analgesia, aware of the risk of masking signs of an evolving abdominal complication.",
      "monitors fluid balance, urine output and ongoing blood product requirements closely.",
      "monitors for signs of abdominal compartment syndrome, including rising airway pressures, reduced urine output and abdominal distension.",
      "escalates immediately to the surgical team for haemodynamic instability, rising drain output or signs of compartment syndrome.",
      "liaises with intensive care regarding the plan and timing for a possible second-look laparotomy.",
      "documents all observations, drain outputs and interventions clearly in the recovery record.",
      "confirms readiness for intensive care or ward transfer against local discharge criteria before handover.",
      "gives a structured handover to the receiving team, including the plan for re-look surgery and escalation thresholds."
    ]
  },

  bulletLimb: {
    surgeon: [
      "confirms patient identity, consent and the affected limb with the team during the WHO Sign In, checking for a correctly marked limb.",
      "reviews imaging and assesses distal pulses, sensation and motor function with the team before proceeding.",
      "confirms the patient is positioned to allow full access to the limb, with a tourniquet applied proximally but not yet inflated.",
      "supervises skin prep with chlorhexidine along the whole limb circumference and draping to allow extension of the incision.",
      "leads the WHO Time Out immediately before incision, confirming the correct limb, side and surgical plan with the team.",
      "exsanguinates the limb and inflates the tourniquet if needed, with the inflation time noted and communicated to the team.",
      "makes the incision along the bullet tract, extending it proximally and distally as needed for neurovascular exposure.",
      "explores the wound systematically, identifying the artery, vein, nerve, muscle and bone in the zone of injury.",
      "controls active arterial bleeding with proximal and distal vascular control, using vessel loops or bulldog clamps.",
      "assesses the extent of vascular injury and decides between primary repair, interposition grafting or ligation based on the vessel involved and limb viability.",
      "performs a primary arterial repair with 6-0 or 7-0 Prolene sutures, or inserts an interposition vein graft where the defect is too large for tension-free repair.",
      "inspects the accompanying vein and repairs it with 6-0 Prolene where feasible to support venous outflow.",
      "identifies and assesses any nerve injury, tagging the nerve ends with fine non-absorbable suture for later or immediate repair.",
      "debrides devitalised muscle and skin edges thoroughly, removing any obviously non-viable tissue and foreign material.",
      "assesses the compartments of the limb and performs a fasciotomy of all affected compartments if there is any concern for compartment syndrome.",
      "releases the tourniquet, documenting the total tourniquet time, and confirms haemostasis and distal perfusion before proceeding.",
      "irrigates the wound thoroughly with copious warm saline to reduce contamination.",
      "stabilises any associated fracture with external fixation as required to protect the vascular and nerve repair.",
      "leaves the fasciotomy wounds and heavily contaminated skin open for delayed primary closure, applying a negative pressure dressing.",
      "closes any primarily closable skin with interrupted 3-0 Nylon sutures, avoiding tension over the repair.",
      "completes the WHO Sign Out, confirming counts, tourniquet time documentation and specimen labelling with the team.",
      "dictates the operative findings and gives a structured handover to recovery, including neurovascular status to monitor and the plan for return to theatre."
    ],
    assistant: [
      "helps position the limb and applies the tourniquet cuff, ready for inflation once the limb is exsanguinated.",
      "assists with prepping and draping the limb circumferentially to allow full access.",
      "retracts skin and soft tissue to help expose the neurovascular bundle during the surgeon's exploration.",
      "holds vessel loops or provides gentle traction to help achieve proximal and distal vascular control.",
      "assists with the vascular repair by holding the vessel steady, cutting sutures and irrigating the anastomosis.",
      "helps harvest a vein graft from an uninjured area if an interposition graft is required.",
      "assists with debridement, helping to identify and remove devitalised tissue under the surgeon's direction.",
      "helps perform the fasciotomy incisions, retracting the skin and fascia to confirm all compartments are released.",
      "assists with checking distal pulses and capillary refill once the tourniquet is released.",
      "helps apply external fixation, holding the limb in position while pins or clamps are placed.",
      "assists with irrigation of the wound and helps count and remove all packs used.",
      "cuts sutures during closure of any primarily closable skin and helps apply the negative pressure dressing to open wounds.",
      "helps splint or dress the limb appropriately to protect the repair.",
      "assists with transferring the patient to recovery, supporting the limb carefully throughout the move."
    ],
    scrub: [
      "checks the vascular and orthopaedic instrument sets, including vascular clamps, vessel loops and an external fixation set, against the count sheet.",
      "gowns and gloves the surgical team and prepares the trolley with the limb exploration tray ready.",
      "applies the tourniquet cuff and has the exsanguination bandage ready before the surgeon begins.",
      "passes the scalpel for the incision and retractors for exposure of the neurovascular bundle.",
      "passes bulldog clamps and vessel loops for vascular control as the artery and vein are identified.",
      "loads the 6-0 or 7-0 Prolene for the arterial repair and has additional sutures ready for the venous repair.",
      "prepares the vein graft instruments and sutures if an interposition graft is required.",
      "passes tagging sutures for any identified nerve injury and keeps them clearly labelled.",
      "maintains a continuous swab, needle and instrument count throughout the prolonged exploration and repair.",
      "passes the fasciotomy knife and retractors for release of the limb compartments.",
      "prepares the external fixation set, passing pins, clamps and the fixator frame as required.",
      "loads the 3-0 Nylon for any primary skin closure and prepares the negative pressure dressing materials for open wounds.",
      "performs an interim instrument, swab and needle count with the circulator before the fasciotomy wounds are dressed.",
      "performs the final count with the circulator before closure is completed and confirms it is correct.",
      "prepares any tissue or foreign material specimens for documentation and hands over the dressing materials to the surgeon."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies and the correctly marked limb.",
      "positions the theatre table and tourniquet equipment, confirming the tourniquet pressure and timer are set correctly.",
      "opens additional sterile supplies, vascular grafts or the external fixation set as requested by the scrub nurse.",
      "documents the tourniquet inflation and deflation times prominently and communicates elapsed time to the team at intervals.",
      "documents blood loss, fluids given and the timing of key steps throughout the procedure.",
      "liaises with the blood bank if significant blood loss occurs or transfusion is anticipated.",
      "coordinates the WHO Time Out with the full team immediately before incision.",
      "labels any retrieved bullet fragments and arranges chain of custody documentation for forensic retention.",
      "retrieves additional equipment such as further vascular instruments or fixator components as required.",
      "coordinates the WHO Sign Out, confirming counts, tourniquet documentation and specimen labelling with the team.",
      "confirms the final instrument, swab and needle counts with the scrub nurse and surgeon.",
      "documents the total tourniquet time and procedure time in the patient record.",
      "communicates the operative summary, neurovascular status and the plan for a return to theatre for delayed closure to the recovery team."
    ],
    anaesthetist: [
      "performs a pre-operative assessment, checking for other injuries and establishing baseline distal neurovascular status.",
      "establishes intravenous access appropriate to the anticipated blood loss from a prolonged vascular repair.",
      "induces anaesthesia with a technique appropriate to the patient's overall physiological status and associated injuries.",
      "secures the airway with a cuffed endotracheal tube or supraglottic device as appropriate, confirming placement with capnography.",
      "sets up monitoring including invasive blood pressure measurement if significant blood loss is anticipated.",
      "monitors blood loss closely during vascular repair, communicating with the surgeon about the timing of tourniquet release.",
      "anticipates the physiological effects of tourniquet release, including transient hypotension and acidosis from reperfusion.",
      "manages fluid and blood product administration guided by ongoing losses and haemodynamic response.",
      "monitors temperature and takes measures to keep the patient warm throughout a potentially prolonged repair.",
      "plans analgesia, considering a regional nerve block once any nerve injury has been assessed and documented by the surgeon.",
      "communicates with the surgeon about the plan for fasciotomy and any additional physiological changes expected.",
      "plans emergence, considering the need for a return to theatre and the impact of any regional block on limb assessment.",
      "extubates once the patient meets criteria, or arranges transfer to a monitored bed if further surgery is planned imminently.",
      "gives a structured handover to recovery, covering fluid balance, tourniquet time and the analgesia plan."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, including the vascular repair performed and tourniquet time.",
      "performs an initial ABCDE assessment on arrival, then focuses on the neurovascular status of the affected limb.",
      "checks distal pulses, capillary refill, colour and temperature of the limb at frequent intervals.",
      "assesses sensation and motor function distal to the injury, comparing with the documented baseline.",
      "monitors for signs of compartment syndrome, including pain out of proportion, pain on passive stretch and a tense swollen limb.",
      "checks the wound, fasciotomy sites and any negative pressure dressing for bleeding or dressing failure.",
      "assesses pain and titrates analgesia, remaining alert to pain out of proportion as a red flag for compartment syndrome.",
      "monitors fluid balance and watches for signs of reperfusion injury following tourniquet release.",
      "escalates immediately to the surgical team for any loss of pulse, worsening pain, altered sensation or a tense compartment.",
      "keeps the limb elevated and appropriately splinted while avoiding constrictive dressings.",
      "documents all neurovascular observations and interventions clearly in the recovery record.",
      "confirms readiness for ward transfer against local discharge criteria, including neurovascular observation frequency.",
      "gives a structured handover to the receiving ward, including the escalation thresholds for neurovascular compromise and the plan for delayed closure."
    ]
  },

  bulletMultiple: {
    surgeon: [
      "leads the WHO Sign In, confirming the patient's identity, the working diagnosis of multiple gunshot wounds, consent status for damage control laparotomy and thoracotomy, and known allergies with the whole team.",
      "reviews the trauma primary survey findings, the FAST scan, and the chest and abdominal X-rays with the team, mapping every entry and exit wound and agreeing which cavity is bleeding fastest and needs opening first.",
      "confirms the patient is positioned supine with both arms extended on boards to allow simultaneous access to chest and abdomen, and checks the diathermy pad and warming blanket are in place.",
      "supervises a wide chlorhexidine skin prep from neck to knees and draping to allow extension into either chest, from a laparotomy into a sternotomy or thoracotomy without redraping.",
      "leads the WHO Time Out immediately before incision, confirming the team, the planned combined approach, antibiotic timing, and that blood products are cross-matched and immediately available.",
      "makes a long midline laparotomy incision from xiphoid to pubis in one firm stroke through skin and linea alba, entering the peritoneum sharply while protecting the underlying bowel.",
      "packs all four quadrants of the abdomen swiftly with large swabs to tamponade bleeding while the team catches up with resuscitation, then removes the packs one quadrant at a time to identify the source.",
      "identifies a bleeding mesenteric vessel and a shattered segment of small bowel from the bullet tract, and applies a vascular clamp proximally to control the haemorrhage before it is addressed definitively.",
      "controls the injured vessel with a fine 5-0 Prolene suture ligature, confirming distal perfusion by feeling for a pulse and checking capillary return in the adjacent bowel wall.",
      "resects the devitalised segment of small bowel with a linear stapler, leaving the ends stapled in discontinuity rather than performing an anastomosis, in keeping with damage control principles given the patient's physiology.",
      "inspects the liver and spleen for a second bullet tract, controls a bleeding liver laceration with direct pressure and topical haemostatic agent, and packs around it rather than attempting formal resection.",
      "calls for the anaesthetist's latest observations and confirms the patient remains too unstable for a prolonged definitive repair, committing the team to an abbreviated damage control strategy.",
      "moves to the second wound site, extending the approach into a left anterolateral thoracotomy through the fifth intercostal space to address the chest wound and ongoing haemothorax.",
      "evacuates a large haemothorax with suction, identifies a bleeding intercostal vessel and a peripheral lung laceration, and controls the intercostal bleeding with a suture ligature under direct vision.",
      "repairs the lung laceration with a running 3-0 Prolene suture on a large curved needle, using a non-crushing technique to avoid tearing the friable lung tissue further.",
      "inserts a large-bore intercostal chest drain under direct vision, secures it with a strong silk suture, and confirms good swing and drainage before closing the chest wall.",
      "returns to the abdomen, re-packs the four quadrants with fresh swabs for definitive damage control packing, and confirms with the team that bleeding is now controlled to an acceptable rate.",
      "irrigates both cavities with warmed saline to clear clot and contamination, and rechecks every quadrant and the chest cavity once more before committing to closure.",
      "performs a temporary abdominal closure using a Bogota bag or vacuum-assisted dressing rather than formal fascial closure, given the ongoing swelling and the plan for a re-look laparotomy within 24 to 48 hours.",
      "closes the thoracotomy in layers, approximating the ribs with heavy 1 Vicryl pericostal sutures, then closing the muscle layers with 0 Vicryl and the skin with a 3-0 Monocryl subcuticular stitch.",
      "leads the WHO Sign Out, confirming instrument, swab, and needle counts are correct, that both specimens and drains are labelled, and documenting the plan for planned re-look surgery.",
      "dictates a detailed operative note describing both wound tracts, the damage control decisions made, and gives a structured handover to the recovery team and the intensive care unit."
    ],
    assistant: [
      "helps position the patient supine with arms extended and confirms padding of pressure points before the drapes go up.",
      "assists with the wide prep and draping, holding limbs and adjusting the lights to give access to both chest and abdomen.",
      "holds retractors to open the midline incision and helps pack all four quadrants quickly alongside the surgeon during the initial haemorrhage control phase.",
      "provides steady suction to keep the operative field visible while the surgeon identifies the bleeding mesenteric vessel and bowel injury.",
      "holds the vascular clamp steady on the mesenteric vessel while the surgeon places the ligature, then confirms it is secure before release.",
      "assists the stapled bowel resection by holding the bowel loops atraumatically and cutting the stapler after firing.",
      "helps retract the liver to expose the laceration and holds pressure with a swab while the topical haemostatic agent is applied.",
      "repositions to help open the thoracotomy incision, using a rib spreader once placed and retracting lung tissue gently to expose the bleeding vessel.",
      "cuts the suture ties as the surgeon ligates the intercostal vessel and repairs the lung laceration, keeping tension appropriate for a friable tissue closure.",
      "helps guide and secure the chest drain, checking the underwater seal bottle is bubbling and swinging correctly before it is strapped.",
      "assists repacking the abdomen with fresh swabs, counting each one in and out loud with the scrub nurse as it is placed.",
      "helps irrigate both cavities with warmed saline, directing the sucker to clear pooling fluid from the pelvis and the costophrenic recess.",
      "holds the temporary abdominal closure dressing in place while the surgeon secures it, and assists with the layered thoracotomy closure by cutting sutures at each layer.",
      "assists final skin closure and dressing application, and helps the team log roll and transfer the patient safely onto the intensive care bed for handover."
    ],
    scrub: [
      "checks the major trauma laparotomy and thoracotomy instrument trays against the count sheet, confirming vascular clamps, a linear stapler, and rib spreaders are present and functioning.",
      "gowns and gloves the surgeon and assistant, and arranges the back table with instruments grouped in the order they will be needed for a combined chest and abdominal approach.",
      "passes the scalpel for the midline incision, followed immediately by large abdominal packs for the initial four-quadrant packing.",
      "hands the surgeon a vascular clamp for the bleeding mesenteric vessel, followed by fine 5-0 Prolene on a small curved needle for the ligature.",
      "loads and passes the linear stapler for the bowel resection, confirming the correct cartridge size before firing, and receives the resected specimen into a labelled pot.",
      "prepares topical haemostatic agent and passes it with a swab on a stick for the liver laceration, keeping additional packs ready on the trolley.",
      "readies the thoracotomy set in advance, passing the scalpel and rib spreader once the surgeon extends into the chest, and keeps suction tubing primed.",
      "passes heavy silk for the intercostal vessel ligature and then 3-0 Prolene on a large curved needle for the lung laceration repair.",
      "hands over the chest drain and connecting tubing, confirming the underwater seal set is assembled and ready before insertion.",
      "maintains a continuous swab, needle, and instrument count throughout both the abdominal and thoracic phases, calling out each count clearly with the circulator.",
      "passes fresh packs for definitive damage control packing and loads the temporary abdominal closure dressing set for the vacuum-assisted closure.",
      "loads 1 Vicryl for the pericostal rib sutures, then 0 Vicryl for the chest wall muscle layer, and finally 3-0 Monocryl for the subcuticular thoracotomy closure.",
      "labels both the bowel specimen and any retained bullet fragments correctly with patient details and site, double-checking against the request forms.",
      "performs the final swab, needle, and instrument counts with the circulator before closure is completed, and reports any discrepancy immediately.",
      "prepares the final dressings for both wounds and hands them to the surgeon, then helps break down and account for all sharps at the end of the case."
    ],
    circulator: [
      "completes the WHO Sign In with the anaesthetist and surgeon, confirming the patient's identity, the consent for damage control surgery, and known allergies.",
      "confirms the patient's blood group and that a massive transfusion protocol has been activated, chasing the blood bank for the next round of red cells, plasma, and platelets.",
      "sets up the operating table and equipment for a combined laparotomy and thoracotomy approach, ensuring the rib spreader, thoracotomy tray, and extra suction are ready before draping.",
      "opens additional sterile packs, vascular clamps, and the linear stapler onto the sterile field as requested during the procedure.",
      "documents estimated blood loss, fluids and blood products given, and timings of each phase of the operation on the intraoperative record throughout the case.",
      "coordinates the WHO Time Out, confirming the surgical plan, antibiotic administration, and availability of cross-matched blood before the incision is made.",
      "liaises with the blood bank by phone as further units are needed, and confirms with the lab that a group and save or crossmatch sample has been sent if not already available.",
      "labels the resected bowel segment and any retrieved bullet fragments correctly and arranges transport to histology or forensics as required, keeping a chain of evidence log for police property.",
      "assists in repositioning theatre lights and equipment as the team moves from the abdominal to the thoracic phase of the operation.",
      "coordinates with the intensive care unit to confirm bed availability and readiness for a damage control patient requiring ongoing resuscitation and a planned re-look.",
      "confirms the swab, needle, and instrument counts with the scrub nurse at each phase and before final closure, documenting the outcome clearly.",
      "coordinates the WHO Sign Out, confirming specimen labelling, drain documentation, and the postoperative plan for re-look laparotomy.",
      "communicates the operative findings and the plan for staged surgery to the recovery team and intensive care in advance of transfer.",
      "completes the final theatre documentation, including swab and instrument count sign-off, and files the intraoperative record in the patient's notes."
    ],
    anaesthetist: [
      "performs a rapid pre-operative assessment focusing on airway, breathing, and circulation, noting hypotension and tachycardia consistent with ongoing haemorrhage from multiple wounds.",
      "secures two large-bore peripheral cannulae and inserts an arterial line for continuous blood pressure monitoring and frequent blood gas sampling.",
      "activates the massive transfusion protocol and begins resuscitation with warmed blood products in a balanced ratio, aiming for permissive hypotension rather than normalising blood pressure before bleeding is controlled.",
      "performs a rapid sequence induction with cricoid pressure, anticipating a full stomach and haemodynamic instability, and titrates induction agents cautiously given the patient's shock state.",
      "secures the airway with an endotracheal tube, confirms placement with capnography and bilateral air entry, and inserts an orogastric tube to decompress the stomach.",
      "inserts a central venous line for reliable access and monitoring, and places a urinary catheter to track ongoing urine output as a marker of end-organ perfusion.",
      "maintains anaesthesia with a balanced technique, adjusting depth carefully as the surgical team packs and controls bleeding, and warns the surgeon promptly of any haemodynamic deterioration.",
      "monitors temperature continuously, uses a forced-air warming blanket and fluid warmer throughout, and treats developing coagulopathy proactively with tranexamic acid and clotting products guided by near-patient testing.",
      "communicates closely with the surgeon during the transition from abdominal to thoracic access, anticipating changes in ventilation and haemodynamics as the chest is opened.",
      "manages one-lung considerations and adjusts ventilator settings as the thoracotomy is performed, watching oxygen saturation and airway pressures closely.",
      "titrates vasopressors and further blood products in response to ongoing blood loss, keeping the surgical team informed of the patient's evolving physiological trend rather than a single reading.",
      "plans analgesia for the postoperative period, favouring intravenous opioids and regional techniques where appropriate given the planned re-look surgery and ongoing ventilatory support.",
      "prepares for an unstable, un-extubated transfer to intensive care rather than emergence in theatre, given the damage control strategy and anticipated coagulopathy and hypothermia.",
      "hands over to the intensive care team using a structured format covering airway, ventilation, haemodynamics, blood products given, and outstanding physiological concerns."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, noting the multiple wound sites, damage control approach taken, and the plan for a re-look laparotomy.",
      "performs an immediate ABCDE reassessment on arrival, confirming airway security, ventilator settings, and haemodynamic stability before settling the patient.",
      "monitors airway and breathing closely given the patient remains intubated and ventilated, checking tube position, capnography, and oxygen saturation continuously.",
      "checks the temporary abdominal closure dressing and both drain sites for ongoing bleeding or leakage, and monitors drain output volume and character closely.",
      "monitors the chest drain for swing, bubbling, and output, escalating promptly if output exceeds an agreed threshold suggesting ongoing thoracic haemorrhage.",
      "tracks fluid balance closely, comparing input from blood products and fluids against urine output and drain losses to identify ongoing occult bleeding.",
      "monitors core temperature and coagulation trends, escalating for further warming or blood product support if hypothermia or coagulopathy is identified.",
      "assesses sedation and analgesia requirements, titrating infusions carefully given the patient's ongoing critical illness and planned return to theatre.",
      "sets clear escalation criteria for the nursing team, including falling blood pressure, rising drain output, or oxygen desaturation, with instructions to call the surgical team immediately.",
      "documents vital signs, drain outputs, and fluid balance at frequent intervals in line with the critical care observation protocol.",
      "confirms the timing and readiness for the planned re-look laparotomy with the surgical team and keeps the patient adequately resuscitated in preparation.",
      "hands over to the intensive care nursing team with a full ongoing care plan, including monitoring frequency, escalation thresholds, and the anticipated timing of further surgery."
    ]
  },

  fractureRepair: {
    surgeon: [
      "leads the WHO Sign In, confirming the patient's identity, the specific fracture and side being operated on, consent for open reduction and internal fixation, and any known allergies.",
      "reviews the pre-operative X-rays and confirms the fracture pattern, chosen implant, and templated plate or nail size with the team before the patient is prepped.",
      "confirms the patient's positioning on the operating table, checks the image intensifier can move freely to obtain adequate views, and marks the operative limb.",
      "supervises skin prep with chlorhexidine and application of a sterile tourniquet if appropriate, and drapes the limb to allow full access to the fracture site.",
      "leads the WHO Time Out immediately before incision, confirming the correct limb and level, implant availability, and image intensifier readiness with the whole team.",
      "exsanguinates the limb with an Esmarch bandage and inflates the tourniquet to the agreed pressure, noting the tourniquet time clearly for the record.",
      "makes the planned incision directly over the fracture site, carrying dissection down through subcutaneous tissue and fascia while protecting adjacent nerves and vessels.",
      "exposes the fracture ends carefully, clearing haematoma and interposed soft tissue while preserving the periosteal blood supply as much as possible.",
      "reduces the fracture under direct vision, using bone-holding forceps and a periosteal elevator to restore length, rotation, and alignment.",
      "confirms the reduction is satisfactory using the image intensifier in two planes before proceeding to fixation.",
      "applies the chosen plate along the bone shaft, contouring it as needed to match the bone's natural profile, and secures it provisionally with a bone clamp.",
      "drills pilot holes for each screw using the appropriate guide, measures screw length with a depth gauge, and inserts screws sequentially to achieve compression across the fracture.",
      "checks screw purchase and plate position on the image intensifier, adjusting or replacing any screw that appears too long or poorly positioned.",
      "assesses fracture stability by gently stressing the construct manually, confirming rigid fixation before releasing the reduction clamps.",
      "irrigates the wound thoroughly with warmed saline to clear bone debris and reduce infection risk.",
      "releases the tourniquet and achieves haemostasis with diathermy, checking carefully for any bleeding points that were masked while the tourniquet was inflated.",
      "closes the deep fascial layer with 0 Vicryl, restoring the soft tissue envelope over the plate.",
      "closes the subcutaneous layer with 2-0 Vicryl to reduce tension on the skin edges.",
      "closes the skin with a 3-0 Monocryl subcuticular stitch or staples depending on wound tension, and applies a sterile dressing.",
      "applies a backslab or splint as appropriate to protect the fixation and documents the neurovascular status of the limb before the patient leaves theatre.",
      "leads the WHO Sign Out, confirming instrument and swab counts, documenting total tourniquet time, and confirming the implant details for the record.",
      "dictates a detailed operative note describing the fracture pattern, reduction technique, and fixation used, and hands over to recovery with clear post-operative instructions."
    ],
    assistant: [
      "helps position the limb and confirms the tourniquet cuff is correctly padded and placed before inflation.",
      "assists with exsanguination of the limb using the Esmarch bandage and confirms tourniquet pressure and time with the surgeon.",
      "retracts soft tissue to maintain clear exposure of the fracture site throughout the dissection and reduction.",
      "holds the limb in the reduced position using manual traction while the surgeon applies bone-holding forceps.",
      "helps position the image intensifier and adjusts the limb as needed to obtain clear anteroposterior and lateral views.",
      "holds the plate in position against the bone while the surgeon drills and inserts the first screws.",
      "operates the drill or hands instruments as directed during screw placement, and holds tension on the reduction clamps as required.",
      "assists in checking construct stability by supporting the limb while the surgeon stresses the fixation manually.",
      "helps irrigate the wound thoroughly, directing the sucker to clear debris and fluid from the surgical field.",
      "assists haemostasis after tourniquet release, dabbing bleeding points and holding pressure as the surgeon diathermies vessels.",
      "cuts sutures at each layer of closure, from the deep fascia through to the subcuticular skin closure.",
      "helps apply the backslab or splint, holding the limb in the correct position while the plaster or splint material sets.",
      "checks and documents distal pulses, capillary refill, and sensation in the limb immediately after the dressing and splint are applied.",
      "assists the transfer of the patient onto the recovery trolley, protecting the operated limb throughout."
    ],
    scrub: [
      "checks the orthopaedic trauma set and the specific plate and screw system against the count sheet, confirming the correct implant sizes are available as templated.",
      "gowns and gloves the surgical team and organises the back table with reduction instruments, drill, and implants in the sequence they will be used.",
      "passes the scalpel for the incision and retractors to establish exposure of the fracture site.",
      "hands the surgeon the periosteal elevator and bone-holding forceps for fracture exposure and reduction.",
      "passes the appropriate plate, pre-selected and contoured if needed, and hands the bone clamp to hold it in provisional position.",
      "loads the drill with the correct sized bit for pilot holes, then passes the depth gauge and appropriate length screws in sequence as each hole is drilled.",
      "maintains a continuous instrument, swab, and needle count throughout the procedure, calling out counts clearly with the circulator at set intervals.",
      "passes irrigation fluid and a bulb syringe or pulse lavage device for thorough wound irrigation before closure.",
      "loads 0 Vicryl for the deep fascial closure, then 2-0 Vicryl for the subcutaneous layer, and finally 3-0 Monocryl or a skin stapler for the skin.",
      "prepares the backslab or splint materials in advance so they are ready as soon as the wound is dressed.",
      "labels any bone or tissue specimens sent for histology or microbiology correctly with patient details and site.",
      "performs the final swab, needle, and instrument counts with the circulator before the dressing is applied, reporting any discrepancy immediately.",
      "hands over sterile dressings and splint padding for the final application, and assists in accounting for all sharps used during fixation.",
      "documents the specific implant batch numbers and sizes used for the fixation on the implant record sheet."
    ],
    circulator: [
      "completes the WHO Sign In, confirming the patient's identity, the correct limb and fracture, consent, and allergy status with the team.",
      "confirms the correct implant set and back-up sizes are available in theatre before the case starts, liaising with the implant company representative if required.",
      "sets up the image intensifier and confirms it is positioned correctly and functioning before draping begins.",
      "applies the tourniquet cuff correctly and documents the time of inflation and the pressure setting clearly on the intraoperative record.",
      "opens additional sterile instruments, drill bits, or implant sizes onto the field as requested during the procedure.",
      "documents blood loss, tourniquet time, and any fluids given throughout the case on the intraoperative record.",
      "coordinates the WHO Time Out, confirming correct limb, side, and level, and antibiotic prophylaxis timing before incision.",
      "records the tourniquet deflation time and communicates the total tourniquet duration clearly to the surgical and anaesthetic teams.",
      "labels any specimens sent for microbiology or histology and arranges transport to the appropriate laboratory.",
      "confirms swab, needle, and instrument counts with the scrub nurse at the end of the procedure before closure is completed.",
      "coordinates the WHO Sign Out, confirming implant documentation, count outcomes, and the post-operative weight-bearing and immobilisation plan.",
      "communicates the fixation performed and the mobility plan clearly to the recovery team ahead of transfer.",
      "completes the theatre register and implant documentation, including batch numbers, for the patient's permanent record.",
      "liaises with the ward to confirm bed availability and any specific post-operative positioning or elevation requirements for the limb."
    ],
    anaesthetist: [
      "performs a pre-operative assessment focusing on the patient's fitness for anaesthesia, any other injuries, and suitability for a regional technique if appropriate.",
      "discusses with the patient and surgical team whether a regional nerve block, spinal, or general anaesthetic is most appropriate for the specific fracture being fixed.",
      "secures peripheral intravenous access and confirms baseline observations before induction.",
      "performs a peripheral nerve block under ultrasound guidance where appropriate, confirming an adequate sensory and motor block before surgery begins.",
      "induces general anaesthesia if required, securing the airway with a supraglottic device or endotracheal tube depending on the planned position and duration of surgery.",
      "positions monitoring appropriately for the planned limb position, ensuring pressure points are padded and access for the image intensifier is unobstructed.",
      "monitors blood pressure and heart rate closely during tourniquet inflation, being alert to the hypertensive response that can occur with prolonged tourniquet time.",
      "tracks tourniquet time throughout the case and communicates clearly with the surgeon as it approaches locally agreed safe limits.",
      "manages fluid administration conservatively given the generally lower blood loss of an isolated fracture fixation, adjusting for any additional injuries present.",
      "watches for signs of fat embolism or tourniquet-related complications, particularly with long bone fractures, and alerts the surgical team to any physiological concern.",
      "plans multimodal analgesia including regional blockade, paracetamol, and opioids as needed, tailored to the specific fracture and fixation performed.",
      "manages emergence from anaesthesia smoothly, aiming for a calm wake-up that avoids sudden limb movement that could disrupt the fresh fixation.",
      "extubates once the patient is breathing adequately and protective reflexes have returned, keeping the limb supported and still during transfer.",
      "hands over to recovery with a structured summary covering anaesthetic technique, block details, tourniquet time, and analgesia plan."
    ],
    recovery: [
      "receives a structured SBAR handover covering the fracture fixed, the implant used, tourniquet time, and the anaesthetic technique including any regional block performed.",
      "performs an initial ABCDE assessment on arrival, with particular attention to airway and breathing if a general anaesthetic was used.",
      "monitors respiratory rate and oxygen saturation closely as the patient emerges from anaesthesia and any regional block begins to be assessed.",
      "assesses pain using a structured pain score and titrates analgesia promptly, being mindful that a regional block may mask early compartment syndrome symptoms.",
      "checks the dressing and splint for any bleeding or excessive swelling, and confirms the limb is elevated appropriately to reduce oedema.",
      "performs regular neurovascular observations of the operated limb, checking pulses, capillary refill, sensation, and movement distal to the fixation.",
      "monitors specifically for signs of compartment syndrome, including pain out of proportion to the injury, pain on passive stretch, and tightness of the limb, escalating immediately if suspected.",
      "tracks fluid balance and monitors for any signs of fat embolism syndrome in patients with long bone fractures, including confusion, breathlessness, or a petechial rash.",
      "sets clear escalation criteria for the ward team, including any change in neurovascular status or uncontrolled pain, with instructions to contact the surgical team urgently.",
      "documents all observations, pain scores, and neurovascular checks clearly and at the frequency specified in the post-operative instructions.",
      "confirms the weight-bearing status and mobility restrictions with the surgical team before the patient is mobilised or transferred.",
      "hands over to the ward nursing team with a full ongoing care plan, including neurovascular monitoring frequency, analgesia plan, and physiotherapy or mobility instructions."
    ]
  },

  haemorrhageControl: {
    surgeon: [
      "leads the WHO Sign In, confirming the patient's identity, the clinical picture of active haemorrhage, consent for damage control surgery, and known allergies with the team.",
      "reviews the resuscitation status and physiological parameters with the anaesthetist, confirming the patient meets criteria for an abbreviated damage control approach rather than definitive repair.",
      "confirms the patient's positioning supine with wide access, and checks that additional suction, blood warmers, and cell salvage equipment are set up before draping.",
      "supervises rapid but thorough skin prep and draping to allow immediate wide access to the suspected source of bleeding.",
      "leads an abbreviated WHO Time Out given the time pressure, confirming the surgical plan, blood availability, and the damage control philosophy with the whole team.",
      "makes a rapid midline incision and enters the relevant cavity swiftly, prioritising speed of access to control life-threatening haemorrhage over meticulous dissection.",
      "packs the cavity systematically to tamponade diffuse bleeding, then removes packs sequentially to localise the specific source of haemorrhage.",
      "applies a vascular clamp directly to a major bleeding vessel identified on exploration, controlling flow proximally and distally before attempting any definitive step.",
      "considers temporary intravascular shunting of a major vessel if formal repair is not feasible in the patient's current physiological state, to preserve distal perfusion.",
      "ligates non-essential bleeding vessels rapidly with 2-0 or 3-0 Vicryl ties rather than attempting time-consuming repair, in keeping with abbreviated surgery principles.",
      "controls solid organ bleeding with direct packing and topical haemostatic agents rather than formal resection, deferring definitive management to a planned re-look.",
      "actively communicates with the anaesthetist throughout, adjusting the pace and extent of surgery based on the patient's temperature, acidosis, and coagulation status rather than a fixed operative plan.",
      "controls contamination from any hollow viscus injury with rapid stapling or clamping, deliberately deferring formal repair or anastomosis to a subsequent operation.",
      "reassesses all previously packed areas once the immediate source is controlled, checking systematically for any missed bleeding point.",
      "irrigates the cavity briefly to clear gross contamination without prolonging the operation unnecessarily.",
      "leaves definitive haemostatic packs in place where ongoing oozing is present, accepting a degree of permissive hypotension and coagulopathic ooze rather than pursuing perfect haemostasis at the cost of time.",
      "performs a temporary closure using a vacuum-assisted closure device or similar laparostomy technique rather than formal layered closure, to accommodate visceral swelling and allow rapid re-entry.",
      "secures the temporary closure dressing firmly, confirming adequate suction and seal before the patient leaves theatre.",
      "leads the WHO Sign Out, confirming swab, needle, and instrument counts, documenting all packs left in situ clearly, and confirming the plan for a mandatory re-look within 24 to 48 hours.",
      "dictates a detailed operative note specifying the source of haemorrhage, the damage control manoeuvres performed, the number and location of packs left in place, and hands over clearly to the intensive care and recovery teams."
    ],
    assistant: [
      "helps position the patient and ensures suction, warming devices, and cell salvage are connected and functioning before the incision.",
      "assists rapid entry into the cavity, retracting firmly to allow the surgeon immediate access to the bleeding source.",
      "helps pack all areas of the cavity quickly, working alongside the surgeon under significant time pressure.",
      "holds the vascular clamp steady on the major bleeding vessel while the surgeon assesses options for shunting or ligation.",
      "assists with insertion of a temporary vascular shunt if used, holding the vessel ends and securing the shunt in position.",
      "cuts ties as the surgeon rapidly ligates non-essential bleeding vessels, keeping pace with the surgeon's speed.",
      "helps apply direct pressure and hold topical haemostatic agents in place over solid organ injuries.",
      "provides continuous suction to keep the field visible despite ongoing oozing, prioritising the areas the surgeon is actively working on.",
      "assists in controlling contamination from any hollow viscus injury, holding bowel or other structures atraumatically while the surgeon staples or clamps.",
      "helps reassess previously packed quadrants, holding retractors while the surgeon checks systematically for missed bleeding.",
      "assists with the brief irrigation of the cavity, directing suction to clear the worst of the contamination quickly.",
      "helps position and secure the temporary vacuum-assisted closure dressing, ensuring an adequate seal before the drapes come down.",
      "assists the rapid transfer of the patient onto the intensive care bed, keeping the temporary closure protected during the move."
    ],
    scrub: [
      "checks the damage control laparotomy set against the count sheet under time pressure, confirming vascular clamps, shunts, and a stapling device are immediately available.",
      "gowns and gloves the team rapidly and organises the back table for speed, keeping the most likely-needed instruments closest to hand.",
      "passes the scalpel for rapid entry and immediately follows with large packs for the initial four-quadrant packing.",
      "hands the surgeon a vascular clamp the moment a major bleeding vessel is identified, anticipating the need before it is verbally requested.",
      "prepares and passes a vascular shunt if requested, along with the fine sutures needed to secure it in place.",
      "loads 2-0 and 3-0 Vicryl ties in rapid succession for the surgeon to ligate multiple bleeding vessels quickly.",
      "prepares topical haemostatic agents in advance and passes them promptly to control solid organ bleeding.",
      "maintains an accurate running count of packs placed in the cavity, calling out the running total clearly and repeatedly given the number involved.",
      "passes the stapling device for rapid control of a hollow viscus injury, confirming the correct cartridge before firing.",
      "prepares the vacuum-assisted closure or laparostomy dressing set in advance, anticipating the temporary closure once haemorrhage is controlled.",
      "performs the swab, needle, and instrument count with the circulator before temporary closure, cross-checking the number of packs left in situ against the surgeon's stated count.",
      "documents clearly, on the count board and count sheet, the exact number and location of packs left inside the patient for the re-look procedure.",
      "prepares the final dressing over the temporary closure and hands it to the surgeon, confirming suction tubing is connected correctly.",
      "accounts for all sharps and disposables used during the abbreviated procedure before the patient leaves theatre."
    ],
    circulator: [
      "completes an expedited WHO Sign In given the urgency, confirming identity, consent, and allergies while resuscitation continues in parallel.",
      "confirms the massive transfusion protocol is active and coordinates continuous delivery of blood products from the blood bank throughout the procedure.",
      "sets up the table with additional suction canisters, blood warmers, and cell salvage equipment before the patient is draped.",
      "opens vascular clamps, shunts, staplers, and packs onto the sterile field rapidly as requested, anticipating the pace of a damage control case.",
      "documents blood loss, blood products transfused, and timings continuously throughout the procedure, given how rapidly the situation is evolving.",
      "coordinates an abbreviated but complete WHO Time Out, confirming the damage control plan and blood availability with the team before the incision.",
      "liaises directly and repeatedly with the blood bank by phone to ensure an uninterrupted supply of red cells, plasma, and platelets throughout the case.",
      "keeps a clear running record of the number of packs placed and communicates this number repeatedly with the scrub nurse to prevent any retained pack.",
      "coordinates with the intensive care unit to confirm immediate bed availability given the patient will remain critically unstable after surgery.",
      "confirms swab, needle, instrument, and pack counts explicitly with the scrub nurse before temporary closure, documenting the exact number of packs left in situ.",
      "coordinates the WHO Sign Out, ensuring the mandatory re-look timing is documented clearly and communicated to all relevant teams.",
      "communicates the damage control findings and the retained pack count clearly to the recovery and intensive care teams ahead of transfer.",
      "completes the theatre documentation promptly, flagging the case clearly as a damage control procedure with a scheduled re-look.",
      "confirms with the ward and theatre coordinator that theatre space is reserved for the planned re-look laparotomy within the required timeframe."
    ],
    anaesthetist: [
      "performs a rapid assessment of the patient's physiological status, recognising the triad of hypothermia, acidosis, and coagulopathy that drives the damage control decision.",
      "secures large-bore intravenous access and an arterial line rapidly, prioritising monitoring that will guide resuscitation throughout the abbreviated procedure.",
      "activates or continues the massive transfusion protocol, delivering blood products in a balanced ratio guided by near-patient coagulation testing rather than waiting for formal laboratory results.",
      "induces anaesthesia with agents and doses adjusted for the patient's haemodynamic instability, anticipating a significant drop in blood pressure on induction.",
      "secures the airway promptly, confirms correct tube placement, and establishes protective ventilation while resuscitation continues.",
      "practises permissive hypotension deliberately, accepting a lower target blood pressure than normal until the surgeon confirms the bleeding source is controlled.",
      "monitors temperature continuously and uses active warming measures aggressively, recognising hypothermia as a key driver of the lethal triad in this scenario.",
      "communicates changes in the patient's physiology to the surgeon in real time, explicitly flagging when acidosis or coagulopathy is worsening to help guide the pace of surgery.",
      "administers tranexamic acid early if not already given, and continues to correct coagulopathy proactively with clotting products guided by near-patient testing.",
      "avoids prolonged attempts at physiological normalisation in theatre, recognising that ongoing resuscitation will continue into the intensive care phase rather than being completed on the table.",
      "plans for the patient to remain sedated, ventilated, and unextubated at the end of the procedure given the severity of ongoing physiological derangement.",
      "coordinates closely with the surgical team on the timing of temporary closure, ensuring the patient is as stable as achievable before transfer.",
      "prepares a clear plan for ongoing resuscitation targets to hand over to the intensive care team, including temperature, coagulation, and blood pressure goals.",
      "hands over to the intensive care team using a structured format covering the lethal triad status, blood products given, and outstanding resuscitation priorities."
    ],
    recovery: [
      "receives a structured SBAR handover emphasising the damage control nature of the surgery, the number of packs left in situ, and the mandatory timing of the planned re-look.",
      "performs an immediate ABCDE reassessment, recognising the patient will likely remain intubated, ventilated, and haemodynamically unstable on arrival.",
      "monitors airway and ventilation closely, checking tube position and ventilator settings given the patient is not expected to wake or extubate at this stage.",
      "closely monitors the temporary abdominal or cavity closure dressing for any external bleeding or leakage, escalating immediately if soaking is observed.",
      "tracks all drain and dressing output volumes and character meticulously, recognising that ongoing significant loss may indicate uncontrolled haemorrhage.",
      "monitors temperature continuously and continues active warming, working to reverse the hypothermia component of the lethal triad established in theatre.",
      "reviews coagulation results and blood gas trends frequently, escalating for further blood product correction if acidosis or coagulopathy is not improving.",
      "monitors fluid balance closely, comparing blood products and fluids given against urine output and drain losses to track ongoing resuscitation progress.",
      "sets explicit escalation criteria including falling blood pressure, rising drain output, or worsening acidosis, with instructions to alert the surgical team immediately.",
      "documents vital signs, drain outputs, temperature, and coagulation trends at the frequency required for a critically unstable damage control patient.",
      "confirms the exact number of packs left in situ against the operative note and theatre count documentation to ensure nothing is unaccounted for before the re-look.",
      "hands over to the intensive care team with a complete ongoing resuscitation and monitoring plan, including the confirmed time booked for the mandatory re-look procedure."
    ]
  },

  debridement: {
    surgeon: [
      "leads the WHO Sign In, confirming the patient's identity, the wound to be debrided, consent for debridement with possible delayed closure, and any known allergies.",
      "assesses the wound with the team, noting the extent of contamination, presence of devitalised tissue, and any signs of established infection before planning the extent of excision.",
      "confirms the patient's positioning to give full access to the wound and surrounding healthy tissue margins.",
      "supervises skin prep with an appropriate antiseptic solution and drapes widely enough to allow extension of the debridement if further non-viable tissue is found.",
      "leads the WHO Time Out immediately before starting, confirming the correct wound, the plan for debridement, and whether closure or a dressing is anticipated at the end.",
      "excises the wound edges sharply back to healthy, bleeding tissue, using the classic signs of viability including colour, consistency, contractility, and capacity to bleed to guide each excision.",
      "systematically removes all visibly devitalised, necrotic, and heavily contaminated tissue from the wound bed, working from superficial to deep layers.",
      "explores the wound bed carefully for foreign material, retained debris, or pockets of contamination, removing anything identified with fine forceps.",
      "assesses each tissue layer in turn, including skin, fat, fascia, and muscle, excising any muscle that fails to contract on direct stimulation or fails to bleed when cut.",
      "controls bleeding from cut tissue edges with diathermy and fine ties as debridement proceeds, avoiding excessive thermal damage to marginal viable tissue.",
      "irrigates the wound bed thoroughly using a pulse lavage system with several litres of warmed saline to mechanically reduce the bacterial load and clear residual debris.",
      "reassesses the wound bed after irrigation, repeating excision of any tissue that still appears non-viable until only healthy, well-perfused tissue remains.",
      "takes deep tissue samples for microbiology from multiple sites within the wound bed before any further irrigation or dressing is applied.",
      "decides between primary closure, delayed primary closure, or negative pressure wound therapy based on the degree of contamination and tissue loss identified.",
      "closes the deep tissue layer with 2-0 or 3-0 Vicryl where primary closure is appropriate, ensuring no dead space remains that could harbour infection.",
      "closes the skin with interrupted 3-0 Nylon sutures or skin staples if primary closure is chosen, or applies a negative pressure wound therapy dressing if closure is deferred.",
      "applies a bridle or packing dressing appropriately if the wound is left open for planned delayed primary closure, ensuring the wound bed is protected.",
      "documents the extent of tissue excised, the condition of the wound bed at the end of the procedure, and the specific closure or dressing strategy chosen.",
      "leads the WHO Sign Out, confirming swab, needle, and instrument counts, specimen labelling for microbiology, and the plan for further debridement if required.",
      "dictates a detailed operative note describing the wound findings, the tissue excised, and the closure strategy, and hands over to recovery with a clear wound care plan."
    ],
    assistant: [
      "helps position the patient to give clear access to the wound and assists with the wide antiseptic prep and draping.",
      "retracts the wound edges to give clear exposure as the surgeon excises devitalised tissue layer by layer.",
      "provides continuous suction and swabbing to keep the wound bed visible throughout the excision.",
      "helps identify areas of questionable tissue viability, pointing out colour or bleeding changes for the surgeon to assess.",
      "assists haemostasis by holding pressure and cutting ties as the surgeon controls bleeding from the cut tissue edges.",
      "operates or assists the pulse lavage device during irrigation, directing the jet evenly across the entire wound bed.",
      "helps reposition the limb or wound area to allow irrigation and inspection of the full depth and extent of the cavity.",
      "assists specimen collection for microbiology, holding the wound open at the correct site while the surgeon takes deep tissue samples.",
      "helps prepare the wound bed for the chosen closure method, whether that is holding tissue for suturing or preparing the area for a negative pressure dressing.",
      "cuts sutures during layered closure if primary closure is performed, working through the deep and skin layers in sequence.",
      "assists application of the negative pressure wound therapy dressing, ensuring an even foam fit and a good seal around the wound edges.",
      "helps apply the final dressing or packing, checking it is secure and appropriately padded before the drapes are removed.",
      "assists the safe transfer of the patient to recovery, protecting the wound and dressing throughout the move."
    ],
    scrub: [
      "checks the debridement instrument set against the count sheet, confirming sharp excision instruments, pulse lavage equipment, and dressing supplies are all present.",
      "gowns and gloves the surgical team and organises the back table with excision instruments arranged for sequential use from superficial to deep tissue.",
      "passes the scalpel and toothed forceps for sharp excision of the wound edges and progressively deeper tissue.",
      "hands the surgeon fine dissecting scissors and forceps for careful exploration of the wound bed for foreign material or debris.",
      "passes diathermy and fine ties as needed to control bleeding from the cut tissue edges throughout the excision.",
      "prepares and connects the pulse lavage system with warmed saline, ensuring it is functioning correctly before handing it to the surgeon or assistant.",
      "prepares sterile specimen pots labelled clearly in advance for the multiple deep tissue samples that will be sent for microbiology.",
      "maintains a continuous swab, needle, and instrument count throughout the excision and irrigation phases, calling out counts clearly with the circulator.",
      "loads 2-0 or 3-0 Vicryl for the deep closure layer and 3-0 Nylon or a skin stapler for the skin closure if primary closure is chosen.",
      "prepares the negative pressure wound therapy dressing set in advance in case delayed closure or negative pressure therapy is the chosen strategy.",
      "labels each microbiology specimen accurately with the specific site within the wound it was taken from, avoiding any mix-up between samples.",
      "prepares packing material or a bridle dressing set if the wound is to be left open for planned delayed primary closure.",
      "performs the final swab, needle, and instrument count with the circulator before the dressing is applied, reporting any discrepancy immediately.",
      "hands over the final dressing materials and confirms all sharps and disposable items are accounted for at the end of the case."
    ],
    circulator: [
      "completes the WHO Sign In, confirming the patient's identity, the wound to be debrided, consent, and allergy status with the team.",
      "sets up the table and equipment for the procedure, ensuring the pulse lavage system and negative pressure wound therapy equipment are available before draping.",
      "opens additional sterile instruments or dressing supplies onto the field as requested during the excision.",
      "documents the volume of irrigation fluid used, estimated blood loss, and timings of each phase of the procedure on the intraoperative record.",
      "coordinates the WHO Time Out, confirming the correct wound, the planned extent of debridement, and antibiotic timing before the excision begins.",
      "liaises with the microbiology laboratory to confirm the correct sample containers and transport requirements for multiple deep tissue specimens.",
      "labels each microbiology specimen correctly as it is handed off, cross-checking the site recorded against the surgeon's description.",
      "arranges prompt transport of all specimens to the laboratory to avoid any delay in processing.",
      "confirms swab, needle, and instrument counts with the scrub nurse before closure or dressing application, documenting the outcome clearly.",
      "coordinates the WHO Sign Out, confirming specimen documentation, count outcomes, and the wound closure or dressing strategy chosen.",
      "communicates the wound findings and the chosen closure strategy clearly to the recovery team ahead of transfer.",
      "liaises with the ward or tissue viability team in advance if negative pressure wound therapy or planned delayed closure will require specialist follow-up.",
      "completes the theatre documentation, including microbiology sample details, for the patient's permanent record.",
      "confirms with the team whether a further planned debridement is anticipated and communicates this to theatre scheduling."
    ],
    anaesthetist: [
      "performs a pre-operative assessment focusing on the patient's overall physiological reserve, noting any signs of systemic sepsis arising from the wound.",
      "discusses with the surgical team whether general or regional anaesthesia is more appropriate given the wound location and anticipated duration.",
      "secures intravenous access and sends baseline bloods including inflammatory markers and cultures if systemic infection is suspected.",
      "administers appropriate broad-spectrum antibiotics before incision in line with local protocols for a contaminated or infected wound.",
      "induces anaesthesia with an awareness that patients with significant wound sepsis may have a reduced physiological reserve and altered drug requirements.",
      "positions and pads the patient carefully to protect the wound area and any pressure points during the procedure.",
      "monitors for signs of systemic inflammatory response or evolving sepsis throughout the procedure, alerting the surgical team to any haemodynamic change.",
      "manages fluid administration appropriately, recognising that significant fluid shifts can occur with extensive contaminated wounds.",
      "monitors temperature closely, using active warming given that prolonged wound exposure and irrigation with fluid can contribute to heat loss.",
      "communicates with the surgeon about the extent of tissue excised and any evolving concern about the adequacy of source control.",
      "plans multimodal analgesia appropriate to the wound size and location, considering regional techniques where suitable.",
      "manages emergence and extubation once the patient is stable, aiming for a smooth wake-up that avoids disturbing the fresh dressing.",
      "hands over to recovery with a structured summary covering anaesthetic technique, antibiotics given, and any intraoperative physiological concerns.",
      "documents clearly any signs of sepsis identified intraoperatively to guide the ongoing postoperative antibiotic and monitoring plan."
    ],
    recovery: [
      "receives a structured SBAR handover covering the extent of debridement performed, the closure or dressing strategy chosen, and any signs of sepsis noted intraoperatively.",
      "performs an initial ABCDE assessment on arrival, paying particular attention to signs of ongoing systemic infection such as fever or tachycardia.",
      "monitors airway and breathing closely as the patient emerges from anaesthesia, particularly if a general anaesthetic and antibiotics were given together.",
      "assesses pain using a structured pain score and titrates analgesia promptly, being mindful that a large debrided wound can be significantly painful.",
      "checks the wound dressing or negative pressure wound therapy device for correct function, ensuring an adequate seal and appropriate suction if applicable.",
      "monitors for any bleeding through the dressing and checks the wound area for increasing swelling or discolouration suggesting a developing complication.",
      "tracks vital signs closely for early signs of systemic inflammatory response or sepsis, given the wound was contaminated or infected before debridement.",
      "monitors fluid balance and urine output, particularly if the patient showed any signs of systemic sepsis before or during the procedure.",
      "sets clear escalation criteria for the ward team, including fever, spreading erythema, or dressing breakdown, with instructions to contact the surgical team promptly.",
      "documents all observations, pain scores, and wound checks clearly and at the frequency specified in the post-operative instructions.",
      "confirms the plan for further debridement, dressing changes, or definitive closure with the surgical team before the patient is transferred.",
      "hands over to the ward nursing team with a full ongoing care plan, including dressing change instructions, antibiotic plan, and the timing of any planned return to theatre."
    ]
  },

  amputation: {
    surgeon: [
      "confirms patient identity, procedure, and level of amputation, and consent for amputation with the team before starting.",
      "confirms the affected limb and marks the site with the patient and team during WHO Sign In.",
      "reviews the vascular and imaging findings and confirms the planned level of amputation with the vascular team.",
      "confirms patient positioning on the table and checks the tourniquet is correctly sited proximal to the operative level.",
      "supervises skin prep with chlorhexidine and alcohol and drapes the limb to expose the planned flaps.",
      "leads the WHO Time Out immediately before incision, confirming the correct limb, level, and equipment available.",
      "marks out anterior and posterior skin flaps and incises through skin and subcutaneous tissue.",
      "inflates the tourniquet once haemostasis is required and notes the inflation time to the team.",
      "divides the muscle layers in planned planes, identifying and clamping the major vessels as they are encountered.",
      "identifies and doubly ligates the named vessels such as the femoral artery and vein with 2-0 silk ties and transfixion sutures.",
      "identifies the major nerves, gently draws them distally, and transects them cleanly with a fresh blade to reduce neuroma risk.",
      "divides the bone at the planned level with an amputation saw and smooths the cut edge with a bone file.",
      "releases the tourniquet and checks for bleeding, achieving haemostasis with diathermy and further ties as needed.",
      "performs myodesis or myoplasty, suturing the muscle groups over the bone end with 0 Vicryl to form a stable stump.",
      "checks flap length and vascularity before trimming the skin flaps to shape the stump.",
      "closes the deep fascial layer with 2-0 Vicryl sutures.",
      "closes the subcutaneous layer with 3-0 Vicryl sutures.",
      "closes the skin flaps with staples or 3-0 Nylon sutures, avoiding tension across the suture line.",
      "inserts a suction drain into the stump if there is concern about bleeding or dead space.",
      "dresses the stump with a soft dressing and compression bandage, moulding it to shape.",
      "completes WHO Sign Out, confirming counts and specimen labelling with the team.",
      "dictates the operative note including the level of amputation, vessels ligated, and nerve handling, and gives a structured handover to recovery."
    ],
    assistant: [
      "helps position the patient and confirms the tourniquet is correctly applied before prep begins.",
      "holds the limb steady during skin prep and draping.",
      "retracts the skin flaps to expose the underlying muscle during incision.",
      "holds vessels on clamps while the surgeon ligates and divides them.",
      "provides steady counter-traction on nerves so they can be cleanly transected.",
      "suctions blood and irrigation fluid to keep the operative field clear.",
      "supports the limb during bone division and holds the specimen once it is amputated.",
      "helps fashion the myodesis by holding the muscle flaps in position for suturing.",
      "cuts sutures during the fascial closure layer.",
      "cuts sutures during the subcutaneous closure layer.",
      "helps evert the skin edges during closure with staples or Nylon sutures.",
      "assists with inserting and securing the stump drain.",
      "helps apply the compression dressing and bandage to the stump.",
      "helps transfer the patient onto the recovery trolley, supporting the stump throughout the move.",
      "hands over positioning and drain details to recovery staff alongside the surgeon."
    ],
    scrub: [
      "checks the amputation instrument set, saw, and bone equipment against the count sheet before the case.",
      "gowns and gloves the surgeon and assistant, and lays out the sterile trolley.",
      "hands over the skin marker and prep swabs for marking and prepping the limb.",
      "passes the scalpel for the flap incisions.",
      "passes clamps and 2-0 silk ties for securing the major vessels.",
      "passes the tourniquet controls and confirms inflation and deflation times with the circulator.",
      "hands over the amputation saw and bone file for the osteotomy.",
      "maintains a continuous swab and needle count throughout the vascular and bone stages.",
      "loads 0 Vicryl for the myodesis and hands it over in sequence.",
      "loads 2-0 Vicryl for the fascial layer closure.",
      "loads 3-0 Vicryl for the subcutaneous layer closure.",
      "loads 3-0 Nylon sutures or the stapler for skin closure.",
      "prepares the drain and connects it to the vacuum bottle once it is sited.",
      "labels the amputated limb specimen and prepares it for the porter or pathology as directed.",
      "performs the final swab, needle, and instrument count with the circulator before closure is complete.",
      "prepares the stump dressing and compression bandage for application."
    ],
    circulator: [
      "leads WHO Sign In, confirming patient identity, consent, allergies, and the marked limb.",
      "sets up the theatre table, tourniquet system, and amputation saw before the patient arrives.",
      "positions the patient on the table and applies the tourniquet under the surgeon's direction.",
      "opens additional sterile instruments and sutures as requested during the case.",
      "documents tourniquet inflation and deflation times on the intraoperative record.",
      "liaises with blood bank to confirm cross-matched blood is available given the risk of blood loss.",
      "coordinates the WHO Time Out before incision, confirming limb, level, and equipment.",
      "labels the amputated limb specimen and arranges appropriate disposal or pathology transfer.",
      "documents swab, needle, and instrument counts throughout the procedure.",
      "coordinates the WHO Sign Out with the team before the patient leaves theatre.",
      "confirms the final counts are correct and signs off with the scrub nurse.",
      "communicates the level of amputation and any complications to the ward and recovery team in advance.",
      "prepares the recovery bay for a limb amputation patient, including stump positioning aids."
    ],
    anaesthetist: [
      "assesses the patient's airway, cardiovascular status, and fitness for anaesthesia given any comorbidities.",
      "establishes IV access and an arterial line if significant blood loss is anticipated.",
      "discusses regional options with the patient, planning a sciatic and femoral nerve block or epidural to reduce phantom limb pain risk.",
      "performs the nerve block or epidural under ultrasound guidance before induction.",
      "induces general anaesthesia and secures the airway with a supraglottic device or endotracheal tube.",
      "sets up standard monitoring including ECG, pulse oximetry, blood pressure, and capnography.",
      "maintains anaesthesia and monitors for haemodynamic changes around tourniquet inflation and release.",
      "administers IV fluids and blood products as needed to match blood loss from vessel ligation.",
      "communicates with the surgeon about tourniquet time and any signs of tourniquet-related hypertension or discomfort.",
      "gives further analgesia and antiemetics in preparation for emergence.",
      "reduces anaesthetic depth and prepares for emergence once closure and dressing are underway.",
      "extubates the patient once airway reflexes have returned and breathing is adequate.",
      "reviews the regional block's effect and documents the analgesic plan for the next 24 hours.",
      "gives a structured handover to recovery covering the anaesthetic technique, block performed, and analgesia plan."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, including level of amputation and nerve block performed.",
      "carries out an initial ABCDE reassessment on arrival in recovery.",
      "monitors airway and breathing closely until the patient is fully awake following general anaesthesia.",
      "assesses pain using a numerical scale and titrates IV opioids alongside the regional block already in place.",
      "checks the stump dressing for strike-through bleeding and marks any ooze with the time it was noted.",
      "checks distal perfusion and colour of the remaining limb where relevant and monitors for signs of compartment syndrome.",
      "monitors drain output and empties or documents the volume as needed.",
      "monitors fluid balance closely given the risk of ongoing blood loss from the amputation site.",
      "watches for signs of hypovolaemia such as tachycardia or hypotension and escalates promptly if observed.",
      "offers early reassurance and orientation to the patient regarding the limb loss and phantom limb sensations.",
      "documents observations on the recovery chart at the required intervals.",
      "liaises with the physiotherapy and prosthetics team to flag early rehabilitation needs.",
      "confirms discharge criteria are met before handing over to the ward nurse.",
      "gives a structured handover to the ward covering stump care, drain, analgesia plan, and escalation thresholds."
    ]
  },

  emergencyField: {
    surgeon: [
      "arrives on scene and completes a rapid primary survey, identifying catastrophic haemorrhage as the immediate threat to life.",
      "confirms scene safety and command structure with the ambulance and fire crews before approaching the casualty.",
      "applies or checks the arterial tourniquet already sited proximal to the injury and notes the time of application.",
      "assesses the entrapped or mangled limb and determines that field amputation is necessary to complete extrication and save life.",
      "confirms the decision for on-scene amputation with the retrieval team leader and the receiving hospital by radio.",
      "confirms verbal consent from the casualty if conscious, or proceeds under best interests if unconscious with life at immediate risk.",
      "prepares the limited field kit, checking the amputation knife, gigli saw, and haemostatic dressings are available.",
      "cleans the operative field as best as possible with the antiseptic available in the austere environment.",
      "infiltrates local anaesthetic where possible while the medic manages systemic analgesia and sedation.",
      "incises through skin and soft tissue at the most distal viable level to preserve length while ensuring rapid extrication.",
      "controls major vessels with direct pressure, haemostatic gauze packing, and improvised clamps or ties as they are encountered.",
      "divides the remaining soft tissue and completes division of the bone with the gigli saw or trauma shears as available.",
      "achieves further haemostasis with a second tourniquet, haemostatic dressing, or pressure bandage once the limb is free.",
      "inspects the stump for ongoing bleeding and reinforces the tourniquet if haemostasis is inadequate.",
      "packs the wound with haemostatic gauze and applies a bulky pressure dressing rather than attempting formal closure.",
      "splints and immobilises the residual limb for transport.",
      "reassesses the casualty's airway, breathing, and circulation immediately after the amputation is completed.",
      "documents the time of tourniquet application, the level of amputation, and estimated blood loss for the receiving team.",
      "hands the casualty over to the extrication team for rapid movement to the ambulance or helicopter.",
      "gives a verbal handover to the retrieval medic covering the mechanism of injury, procedure performed, and drugs given.",
      "prepares a written or radio pre-alert to the receiving hospital trauma team.",
      "accompanies the casualty to hospital and gives a structured handover to the trauma team on arrival."
    ],
    assistant: [
      "helps carry the field kit to the casualty and sets up a clean area for equipment on scene.",
      "holds manual in-line stabilisation or supports the injured limb during assessment.",
      "maintains direct pressure on the wound while the tourniquet and equipment are prepared.",
      "hands the surgeon the amputation knife, gigli saw, and haemostatic dressings in sequence.",
      "holds the limb steady and provides counter-traction during the incision and bone division.",
      "applies additional haemostatic gauze packing under direction as bleeding points are encountered.",
      "helps apply the second tourniquet or pressure bandage once the limb is free.",
      "retrieves the amputated limb and bags it for transport alongside the casualty where protocol requires.",
      "assists in splinting and immobilising the residual limb.",
      "helps log-roll or reposition the casualty for extrication once the procedure is complete.",
      "carries equipment and assists moving the casualty to the stretcher or carry sheet.",
      "supports the airway and breathing checks immediately after the procedure.",
      "helps load the casualty into the ambulance or onto the helicopter.",
      "assists the medic with drug administration and documentation during transport."
    ],
    scrub: [
      "checks the contents of the trauma and amputation kit bag against the standard list before approaching the casualty.",
      "lays out the available sterile and clean equipment on a groundsheet or kit roll.",
      "opens and hands over haemostatic dressings and gauze as bleeding points are controlled.",
      "hands over the amputation knife and gigli saw in the correct sequence for the procedure.",
      "prepares and hands over improvised clamps or ties for any accessible vessels.",
      "tracks usage of dressings, gauze, and sharps given the limited field stock available.",
      "prepares the second tourniquet and pressure dressing ready for application once the limb is free.",
      "manages the sharps and blade safely in the confined and uncontrolled scene environment.",
      "prepares a bag or container for the amputated limb if it is to be transported with the casualty.",
      "assists with preparing splinting equipment for the residual limb.",
      "keeps a running note of equipment and drugs used ready for the handover.",
      "repacks remaining kit and secures used sharps before the team moves to extricate the casualty.",
      "hands over a list of equipment and consumables used to the ambulance crew or receiving hospital."
    ],
    circulator: [
      "establishes scene safety and liaises with fire and rescue regarding entrapment and extrication timelines.",
      "confirms casualty identity where possible and gathers any available allergy or medical history from bystanders or documents.",
      "sets up additional lighting, shelter, or equipment to support the procedure in the field environment.",
      "opens additional dressings, drugs, or equipment from the ambulance on request during the procedure.",
      "documents times of key events including tourniquet application, drug administration, and start of the procedure.",
      "liaises with the ambulance control room and receiving hospital to pre-alert the trauma team.",
      "coordinates the retrieval or air ambulance team if summoned for rapid transport.",
      "manages the flow of bystanders and non-essential personnel away from the immediate scene.",
      "tracks drugs and controlled substances used and administered against the medic's records.",
      "coordinates the final equipment and drug count before the casualty is moved.",
      "communicates the working diagnosis, procedure performed, and estimated blood loss to the receiving hospital by radio.",
      "prepares the ambulance or helicopter for immediate departure once the casualty is loaded."
    ],
    anaesthetist: [
      "assesses the casualty's airway, breathing, and level of consciousness before any sedation or analgesia is given.",
      "establishes IV or intraosseous access given the difficulty of cannulation in a trauma casualty in the field.",
      "administers IV or intranasal analgesia such as ketamine or fentanyl in titrated doses appropriate to the setting.",
      "plans and administers procedural sedation, most often ketamine, given its haemodynamic stability in trauma.",
      "monitors the airway continuously during sedation, ready to manage it if reflexes are lost.",
      "sets up basic monitoring including pulse oximetry, blood pressure, and heart rate given the equipment available.",
      "titrates further doses of ketamine or analgesia based on the casualty's response during the procedure.",
      "communicates with the surgeon about the casualty's physiological status and any deterioration during the amputation.",
      "administers IV fluids cautiously to support blood pressure while avoiding over-resuscitation before haemorrhage is controlled.",
      "monitors for signs of hypovolaemic shock throughout the procedure and escalates fluid or blood product use if carried.",
      "prepares additional analgesia for the transport phase, anticipating pain as sedation wears off.",
      "documents all drugs, doses, and times given for handover to the receiving team.",
      "reassesses the airway and breathing once the procedure is complete and sedation is easing.",
      "gives a structured handover to the receiving hospital team covering sedation, analgesia, and physiological trends."
    ],
    recovery: [
      "receives a structured SBAR handover from the retrieval team covering mechanism of injury, procedure performed in the field, and drugs given.",
      "carries out a full ABCDE reassessment on arrival in the emergency department.",
      "reassesses the tourniquet for correct application and effectiveness, timing total tourniquet time from the field record.",
      "removes the field dressing under controlled conditions to inspect the stump for ongoing bleeding or contamination.",
      "sends bloods including group and save or crossmatch given the likely need for transfusion.",
      "reassesses pain and titrates further IV analgesia or opioids as needed.",
      "checks for signs of hypovolaemic shock and initiates further fluid or blood product resuscitation as indicated.",
      "examines the stump for viability, contamination, and the adequacy of the field haemostasis.",
      "arranges urgent imaging and alerts theatre for formal surgical washout and definitive stump revision.",
      "monitors for signs of compartment syndrome or ongoing ischaemia in any retained limb segments.",
      "documents all findings and compares them against the field record for continuity of care.",
      "liaises with the trauma team leader to plan definitive surgical management and any further amputation revision.",
      "provides early psychological support and orientation to the casualty regarding the injury and treatment so far.",
      "hands over to the ward or theatre team with a full continuity of care plan including field interventions and ongoing needs."
    ]
  },

  appendectomy: {
    surgeon: [
      "confirms patient identity, the diagnosis of appendicitis, and consent for laparoscopic or open appendectomy with the team.",
      "confirms the correct site and reviews imaging findings such as ultrasound or CT with the team before starting.",
      "checks patient positioning supine with a slight head-down tilt to allow the small bowel to fall away from the pelvis.",
      "supervises skin prep with chlorhexidine and drapes the abdomen to expose the umbilicus and right iliac fossa.",
      "leads the WHO Time Out immediately before incision, confirming the procedure and any antibiotic prophylaxis given.",
      "makes a small infra-umbilical incision and establishes pneumoperitoneum with a Veress needle or open Hasson technique.",
      "inserts the camera port and two further working ports under direct vision in the suprapubic and left iliac fossa positions.",
      "performs a full laparoscopic survey of the abdomen to confirm the diagnosis and exclude other pathology.",
      "identifies the appendix, caecum, and terminal ileum, and assesses the degree of inflammation or perforation present.",
      "mobilises the appendix using atraumatic graspers, freeing any adhesions to bring it into view.",
      "creates a window in the mesoappendix close to the appendix wall, identifying the appendiceal artery.",
      "divides the mesoappendix and appendiceal artery between clips, with a vessel sealing device, or with a stapler.",
      "secures the base of the appendix with two endoloops or a linear stapler, ensuring a healthy caecal margin is preserved.",
      "divides the appendix between the secured points and confirms the staple line or endoloop is secure and not bleeding.",
      "converts to an open gridiron incision if laparoscopic access is difficult or the appendix cannot be safely delivered.",
      "places the appendix specimen into a retrieval bag and removes it through the umbilical port site.",
      "inspects the appendix stump and caecal pole for bleeding or leakage before desufflating.",
      "irrigates the peritoneal cavity with warm saline if the appendix was perforated or gangrenous, aspirating all fluid and checking for collections.",
      "considers leaving a drain in the pelvis if there is a significant collection or ongoing contamination.",
      "closes the fascia at the umbilical port and any port 10mm or larger with a 0 Vicryl or 2-0 Vicryl suture.",
      "closes the skin at each port site with a subcuticular 4-0 Monocryl suture or skin glue.",
      "dictates the operative note detailing the findings, degree of inflammation, and any complications, and gives a structured handover to recovery."
    ],
    assistant: [
      "helps position the patient supine with head-down tilt and checks pressure points before draping.",
      "holds the camera to give the surgeon a stable view during the laparoscopic survey.",
      "adjusts the camera angle to follow the appendix as it is mobilised and the mesoappendix is windowed.",
      "provides counter-traction on the caecum or appendix tip with a second grasper during dissection.",
      "holds retractors to maintain exposure if the case converts to an open gridiron incision.",
      "suctions blood or contaminated fluid to keep the field clear during dissection and division.",
      "holds the specimen retrieval bag open to receive the appendix once it is divided.",
      "assists in guiding the retrieval bag and specimen out through the umbilical port.",
      "helps irrigate and aspirate the peritoneal cavity if the appendix was perforated.",
      "cuts sutures during closure of the fascia at each larger port site.",
      "cuts sutures or supports the skin edges during the subcuticular skin closure.",
      "helps apply dressings to each port site or the open wound.",
      "assists with removing the drapes and helps transfer the patient to the recovery trolley."
    ],
    scrub: [
      "checks the laparoscopic stack, appendectomy instrument set, and staplers against the count sheet before the case.",
      "gowns and gloves the surgeon and assistant and sets up the sterile trolley and camera lead.",
      "hands over the Veress needle or Hasson trocar for establishing pneumoperitoneum.",
      "passes the camera and working ports for insertion under direct vision.",
      "passes atraumatic graspers and the diathermy hook or scissors for mobilising the appendix.",
      "loads and hands over clips, the vessel sealing device, or the linear stapler for the mesoappendix and appendiceal artery.",
      "prepares and hands over the endoloops or stapler for securing the appendix base.",
      "maintains a continuous swab, needle, and instrument count throughout the laparoscopic and any open stages.",
      "hands over the retrieval bag for specimen removal and receives the specimen once it is delivered.",
      "prepares suction and irrigation equipment if the appendix is perforated or gangrenous.",
      "loads 0 Vicryl or 2-0 Vicryl for fascial closure at each larger port site.",
      "loads 4-0 Monocryl for the subcuticular skin closure at each port site.",
      "labels the appendix specimen pot correctly and sends it for histology as directed.",
      "performs the final swab, needle, and instrument count with the circulator before the ports are removed.",
      "prepares dressings or skin glue for each port site."
    ],
    circulator: [
      "leads WHO Sign In, confirming patient identity, consent, allergies, and the site of surgery.",
      "sets up the laparoscopic stack, insufflator, and diathermy before the patient arrives in theatre.",
      "positions the patient supine on the table and applies safety straps before head-down tilt is used.",
      "opens additional sterile instruments, staplers, or sutures as requested during the case.",
      "documents insufflation pressures, operative times, and any conversion to open surgery on the intraoperative record.",
      "liaises with the laboratory regarding any blood tests or crossmatch needed if bleeding or sepsis is a concern.",
      "coordinates the WHO Time Out before incision and confirms antibiotic prophylaxis has been given.",
      "labels the appendix specimen pot and arranges prompt transfer to histology.",
      "documents swab, needle, and instrument counts throughout the procedure.",
      "coordinates the WHO Sign Out with the team before the patient leaves theatre.",
      "confirms the final counts are correct and signs off with the scrub nurse.",
      "communicates the operative findings and any perforation to the ward and recovery team in advance."
    ],
    anaesthetist: [
      "assesses the patient's airway, hydration status, and degree of systemic upset from appendicitis or peritonitis.",
      "establishes IV access and gives IV fluids to correct any dehydration or sepsis-related hypotension before induction.",
      "gives IV antibiotics as prophylaxis in good time before the incision is made.",
      "induces general anaesthesia with a rapid sequence technique if there is concern about a full stomach or peritonitis.",
      "secures the airway with an endotracheal tube and confirms placement with capnography.",
      "sets up standard monitoring including ECG, pulse oximetry, blood pressure, and capnography for the laparoscopic case.",
      "monitors closely for the physiological effects of pneumoperitoneum, including raised airway pressures and reduced venous return.",
      "communicates with the surgeon about insufflation pressures if there are signs of cardiovascular compromise.",
      "gives further IV fluids and antiemetics as the case progresses, anticipating postoperative nausea and vomiting.",
      "plans multimodal analgesia including paracetamol, an NSAID if not contraindicated, and local anaesthetic infiltration at the port sites.",
      "reduces anaesthetic depth and prepares for emergence as the ports are removed and dressings applied.",
      "extubates the patient once airway reflexes have returned and reverses any residual neuromuscular blockade.",
      "reviews the analgesic plan and documents it clearly for the recovery team.",
      "gives a structured handover to recovery covering the anaesthetic technique, fluids given, and analgesia plan."
    ],
    recovery: [
      "receives a structured SBAR handover from the surgical and anaesthetic team, including whether the appendix was perforated.",
      "carries out an initial ABCDE reassessment on arrival in recovery.",
      "monitors airway and breathing closely until the patient is fully awake following general anaesthesia.",
      "assesses pain using a numerical scale and titrates IV analgesia alongside the multimodal plan already in place.",
      "checks each port site or the open wound for bleeding, leakage, or early signs of infection.",
      "monitors temperature closely, given the risk of intra-abdominal collection if the appendix was perforated.",
      "monitors fluid balance and encourages early oral fluids once the patient is alert and observations are stable.",
      "watches for signs of ileus or abdominal distension and escalates if bowel sounds are absent or pain is worsening.",
      "monitors for signs of sepsis such as tachycardia, fever, or hypotension and escalates promptly if observed.",
      "checks the drain, if one was left in situ, and documents the volume and nature of any output.",
      "documents observations on the recovery chart at the required intervals.",
      "encourages early mobilisation once the patient is stable and pain is controlled.",
      "confirms discharge criteria are met before handing over to the ward nurse.",
      "gives a structured handover to the ward covering wound care, antibiotic plan if perforated, and escalation thresholds."
    ]
  },

  cholecystectomy: {
    surgeon: [
      "confirms patient identity, consent for laparoscopic cholecystectomy, and reviews the ultrasound imaging with the team during WHO Sign In.",
      "confirms the surgical site and discusses the plan for possible conversion to open surgery if anatomy proves unclear.",
      "checks patient positioning - supine with reverse Trendelenburg and a split-leg or French position for access.",
      "supervises skin prep with chlorhexidine and draping of the abdomen from xiphisternum to umbilicus.",
      "leads the WHO Time Out immediately before incision, confirming patient, procedure, antibiotics, and equipment.",
      "makes a small infraumbilical incision and establishes pneumoperitoneum with a Veress needle or open Hasson technique.",
      "inserts the 10mm umbilical camera port, then places three further working ports under direct vision.",
      "performs a full laparoscopic inspection of the abdomen and confirms the anatomy and degree of inflammation of the gallbladder.",
      "retracts the gallbladder fundus cephalad over the liver and retracts Hartmann's pouch laterally to open Calot's triangle.",
      "dissects the peritoneum overlying Calot's triangle with hook diathermy and blunt dissection.",
      "achieves the critical view of safety, clearly identifying the cystic duct and cystic artery separately entering the gallbladder before any clipping.",
      "applies proximal and distal clips to the cystic duct and divides it, then repeats the same technique for the cystic artery.",
      "considers an intra-operative cholangiogram if stones are suspected in the common bile duct, cannulating the cystic duct stump and confirming free flow of contrast into the duodenum.",
      "dissects the gallbladder off the liver bed with hook diathermy, working from the fundus toward the infundibulum while maintaining haemostasis.",
      "manages unexpected bleeding from the cystic artery or liver bed with pressure, additional clips, or diathermy, and remains vigilant for bile duct injury, converting to open surgery if the anatomy is unclear.",
      "inspects the liver bed and clip sites carefully for haemostasis and any bile leak once the gallbladder is fully freed.",
      "places the gallbladder into a retrieval bag and extracts it through the umbilical port, extending the incision slightly if large stones are present.",
      "irrigates the subhepatic space with warm saline, aspirates thoroughly, and rechecks final haemostasis under direct vision.",
      "removes each port under direct vision, checking every port site for bleeding as it is withdrawn.",
      "closes the umbilical fascial defect with a 0 Vicryl or 1 PDS suture, then closes each port site with 3-0 Monocryl subcuticular sutures.",
      "leads the WHO Sign Out, confirming the specimen is labelled correctly and counts are complete before dressings are applied.",
      "dictates the operative findings and gives a structured handover to recovery covering the procedure and any concerns."
    ],
    assistant: [
      "helps position the patient supine with arms tucked, checking pressure points and the safety strap.",
      "assists with prepping and draping the abdomen ahead of Time Out.",
      "confirms the plan and patient details with the team during the WHO Time Out.",
      "assists with insertion of the umbilical port and confirms pneumoperitoneum pressure on the insufflator display.",
      "holds the laparoscopic camera, keeping the operative field centred and the horizon level throughout the dissection.",
      "retracts the gallbladder fundus cephalad to maintain exposure of Calot's triangle.",
      "provides lateral retraction on Hartmann's pouch to help achieve the critical view of safety.",
      "passes tension on tissue as the clip applier and scissors are used for the cystic duct and artery.",
      "suctions blood and irrigation fluid to keep the field clear during dissection off the liver bed.",
      "assists with positioning for an intra-operative cholangiogram and helps time the radiograph if one is performed.",
      "manoeuvres the retrieval bag into position and assists with extraction of the specimen through the umbilical port.",
      "assists with a final laparoscopic inspection for haemostasis before desufflation.",
      "cuts sutures during fascial and skin closure at each port site.",
      "helps apply dressings to all four port sites.",
      "assists with safe transfer of the patient onto the bed and through to recovery."
    ],
    scrub: [
      "checks the laparoscopic instrument set and count sheet against local policy before the list starts.",
      "sets up the laparoscopic stack, camera lead, and diathermy on the back table.",
      "gowns and gloves the surgeon and assistant, and helps drape the patient.",
      "passes the Veress needle or Hasson trocar for initial pneumoperitoneum access.",
      "passes the 10mm camera port and the three working ports in sequence as requested.",
      "passes the atraumatic grasper used for fundal and infundibular retraction.",
      "passes the dissecting hook and scissors for the Calot's triangle dissection.",
      "loads and passes the clip applier for cystic duct and cystic artery ligation, tracking clip count.",
      "prepares and passes the cholangiogram catheter and contrast if an intra-operative cholangiogram is requested.",
      "passes hook diathermy for dissection of the gallbladder off the liver bed and monitors the diathermy settings.",
      "opens and passes the specimen retrieval bag at the correct moment.",
      "loads 0 Vicryl or 1 PDS on a curved needle for fascial closure of the extended umbilical port.",
      "loads 3-0 Monocryl on a curved cutting needle for subcuticular closure of each port site.",
      "performs the swab, needle, and instrument count with the circulator before and after closure.",
      "labels the specimen pot with the patient's details and hands it to the circulator for despatch.",
      "confirms the final count sign-off and prepares dressings for all port sites."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies, and site with the team.",
      "confirms fasting status and checks that pre-operative bloods and imaging are available in theatre.",
      "positions the operating table, insufflator, diathermy machine, and laparoscopic stack.",
      "assists with safe transfer and positioning of the patient onto the table.",
      "opens sterile disposables including ports, clip cartridges, and the retrieval bag as requested by the scrub team.",
      "documents insufflation pressures, diathermy settings, and case timings on the intra-operative record.",
      "opens the cholangiogram catheter and contrast set and liaises with radiography if an intra-operative cholangiogram is needed.",
      "coordinates the WHO Time Out immediately before incision.",
      "retrieves the specimen pot, labels it with the patient's details, and arranges despatch to histology.",
      "liaises with the blood bank regarding group and save status given the small risk of bleeding.",
      "coordinates the WHO Sign Out, confirming counts, specimens, and any equipment issues.",
      "completes the swab, needle, and instrument count with the scrub nurse.",
      "documents the case fully in the theatre register and patient notes.",
      "communicates the operative plan and any complications to the recovery team ahead of transfer."
    ],
    anaesthetist: [
      "reviews the patient pre-operatively, checking airway, cardiorespiratory status, and fitness for pneumoperitoneum.",
      "establishes IV access and administers pre-induction antibiotics as prescribed.",
      "pre-oxygenates the patient and performs induction with propofol and an opioid.",
      "secures the airway with an endotracheal tube and confirms bilateral air entry and a capnography trace.",
      "sets up standard monitoring, including ECG, non-invasive blood pressure, pulse oximetry, and end-tidal carbon dioxide.",
      "inserts an orogastric tube to decompress the stomach before port insertion.",
      "maintains anaesthesia with a volatile agent and titrates neuromuscular blockade for adequate abdominal relaxation.",
      "monitors for the physiological effects of pneumoperitoneum, including raised airway pressures, reduced venous return, and hypercarbia, adjusting ventilation as needed.",
      "communicates with the surgeon about insufflation pressure and haemodynamic changes during the Calot's triangle dissection.",
      "administers intravenous paracetamol and an opioid for multimodal analgesia ahead of emergence.",
      "gives antiemetic prophylaxis given the recognised risk of nausea after laparoscopic surgery.",
      "manages fluid balance conservatively given the short expected operative duration.",
      "reverses neuromuscular blockade, extubates once protective reflexes return, and confirms adequate spontaneous ventilation.",
      "gives a structured handover to the recovery team covering airway management, analgesia given, and fluids administered."
    ],
    recovery: [
      "receives a structured SBAR handover from the anaesthetist and surgeon on arrival in recovery.",
      "performs an initial ABCDE assessment, checking airway patency, oxygen saturations, and haemodynamic stability.",
      "applies oxygen and continuous monitoring, and checks the patient is rousable and orientated.",
      "assesses pain using a numerical scale and titrates intravenous analgesia as prescribed.",
      "checks all four port sites for bleeding, bruising, or leakage through the dressings.",
      "monitors for shoulder tip pain from residual pneumoperitoneum and reassures the patient this is expected.",
      "observes for signs of bile leak or bleeding, including increasing abdominal pain, distension, tachycardia, or hypotension.",
      "monitors fluid balance and encourages early oral intake once the patient is fully alert.",
      "escalates to the surgical team immediately if the patient develops fever, worsening pain, jaundice, or haemodynamic instability suggestive of bile duct injury.",
      "manages post-operative nausea with prescribed antiemetics.",
      "documents observations, pain scores, and fluid balance on the recovery chart.",
      "confirms readiness for discharge from recovery against local criteria before transfer.",
      "gives a structured handover to the ward nurse covering the operative course, analgesia plan, and escalation criteria."
    ]
  },

  bowelResection: {
    surgeon: [
      "confirms patient identity, consent for bowel resection with possible stoma formation, and reviews the CT imaging with the team during WHO Sign In.",
      "confirms the stoma site has been marked pre-operatively by the stoma nurse and discusses the patient's wishes with the team.",
      "checks patient positioning - supine with arms out, a warming blanket, and sequential compression devices applied.",
      "supervises skin prep with chlorhexidine and draping from xiphisternum to pubis.",
      "leads the WHO Time Out immediately before incision, confirming patient, procedure, antibiotics, VTE prophylaxis, and equipment.",
      "makes a midline laparotomy incision and enters the peritoneal cavity, or establishes laparoscopic ports if a minimally invasive approach is planned.",
      "performs a full systematic exploration of the abdomen and confirms the extent of disease requiring resection.",
      "mobilises the affected bowel segment along the white line of Toldt, taking care to protect the ureter and gonadal vessels.",
      "identifies and preserves the mesenteric blood supply, isolating only the vessels feeding the segment to be resected.",
      "divides the mesentery between clamps or with a vessel-sealing device, securing larger vessels with 2-0 Vicryl ties or clips.",
      "applies bowel clamps proximal and distal to the intended resection margins to prevent contamination.",
      "divides the bowel at clear, well-vascularised resection margins using a linear stapler or between clamps.",
      "removes the specimen and hands it to the scrub nurse for orientation and labelling.",
      "decides between primary anastomosis and stoma formation based on contamination, bowel viability, and patient factors.",
      "fashions a hand-sewn end-to-end anastomosis with interrupted 3-0 PDS, or forms a stapled side-to-side anastomosis with a linear cutting stapler and closes the enterotomy with a further staple load or 3-0 Vicryl.",
      "performs an air or saline leak test on the anastomosis, checking for bubbling or leakage under gentle distension.",
      "matures a defunctioning loop stoma at the pre-marked site if required, securing it to the skin with interrupted 3-0 Vicryl.",
      "manages unexpected bleeding from mesenteric vessels with pressure, ties, or clips, and remains vigilant for injury to adjacent structures such as the ureter or duodenum.",
      "irrigates the abdominal cavity with warm saline and checks haemostasis along the mesenteric edge and resection line.",
      "places an abdominal drain near the anastomosis if indicated and secures it with a suture.",
      "closes the fascia with a continuous 1 PDS loop suture using a mass-closure technique, closes the subcutaneous layer with 3-0 Vicryl, and closes the skin with staples or 3-0 Monocryl subcuticular suture.",
      "leads the WHO Sign Out, dictates the operative findings, and gives a structured handover to recovery covering the anastomosis or stoma and drain output to monitor."
    ],
    assistant: [
      "helps position the patient supine with arms extended, checking pressure points and warming devices.",
      "assists with prepping and draping the abdomen from xiphisternum to pubis.",
      "confirms the plan and stoma site marking with the team during Time Out.",
      "holds retractors to provide exposure of the abdominal cavity following the laparotomy.",
      "assists with mobilisation of the bowel, providing counter-traction along the line of Toldt.",
      "helps identify and protect the ureter and gonadal vessels during mobilisation.",
      "holds bowel clamps in place proximal and distal to the resection margins.",
      "assists with division of the mesentery, holding tissue under tension for accurate vessel ligation.",
      "suctions blood and fluid to keep the field clear during resection and anastomosis.",
      "assists with firing the stapler, checking correct tissue alignment and clearance of surrounding structures.",
      "helps perform the air or saline leak test by occluding the bowel proximally and assisting with instillation.",
      "assists with stoma formation, helping deliver the loop of bowel through the abdominal wall defect.",
      "cuts sutures during fascial, subcutaneous, and skin closure.",
      "assists with drain placement and securing.",
      "helps apply dressings and assists with transfer of the patient to recovery."
    ],
    scrub: [
      "checks the laparotomy and bowel resection instrument set, including staplers, against the count sheet.",
      "sets up the diathermy, suction, and stapling devices on the back table.",
      "gowns and gloves the surgical team and assists with draping.",
      "passes the scalpel for the midline incision and diathermy for haemostasis on entry.",
      "passes retractors and packs for abdominal exploration and exposure.",
      "passes dissecting scissors and a vessel-sealing device for bowel mobilisation.",
      "passes bowel clamps for proximal and distal control before resection.",
      "loads and passes the linear stapler for bowel division and anastomosis, confirming staple cartridge type and colour.",
      "prepares the specimen tray and receives the resected bowel segment for labelling and orientation.",
      "passes suture and instillation equipment for the leak test.",
      "loads 3-0 PDS for a hand-sewn anastomosis if required, or additional staple loads for a stapled anastomosis.",
      "loads a 1 PDS loop for fascial mass closure and 3-0 Vicryl for the subcutaneous layer.",
      "loads 3-0 Monocryl or prepares skin staples for skin closure.",
      "performs the swab, needle, and instrument count with the circulator before and after closure, accounting for stapler cartridges.",
      "labels the specimen pot accurately with orientation noted and hands it to the circulator.",
      "confirms the final count sign-off and prepares a stoma bag and dressings."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies, and stoma site marking with the team.",
      "confirms fasting status, VTE prophylaxis, and the availability of cross-matched blood given the risk of bleeding.",
      "positions the operating table, warming devices, and sequential compression devices.",
      "opens additional sterile supplies including stapler cartridges and drains as requested by the scrub team.",
      "documents case timings, blood loss, and fluid administration on the intra-operative record.",
      "liaises with the stoma nurse to confirm the pre-marked stoma site matches the surgical plan.",
      "coordinates the WHO Time Out immediately before incision.",
      "retrieves the resected specimen, confirms orientation with the surgeon, labels it, and arranges despatch to histology.",
      "liaises with the blood bank regarding availability of cross-matched blood throughout the case.",
      "coordinates the WHO Sign Out, confirming counts, specimens, and stapler cartridge accounting.",
      "completes the swab, needle, and instrument count with the scrub nurse, including staple line counts.",
      "documents the case fully in the theatre register and patient notes.",
      "arranges a stoma bag and stoma nurse review if a stoma has been formed.",
      "communicates the operative plan, drain details, and stoma status to the recovery team and ward ahead of transfer."
    ],
    anaesthetist: [
      "reviews the patient pre-operatively, assessing fluid status, nutrition, and fitness for major abdominal surgery.",
      "establishes IV access, including a second large-bore cannula, and considers arterial line placement for a prolonged case.",
      "administers pre-induction antibiotics and performs induction as clinically indicated.",
      "secures the airway with an endotracheal tube and confirms bilateral air entry and a capnography trace.",
      "sets up invasive and non-invasive monitoring, including arterial pressure, central access if indicated, and a urinary catheter for output monitoring.",
      "considers epidural or spinal analgesia insertion pre-operatively for post-operative pain control.",
      "maintains anaesthesia with a balanced technique and titrates neuromuscular blockade for adequate abdominal relaxation.",
      "manages fluid therapy with a goal-directed approach, balancing crystalloid administration against third-space losses.",
      "communicates with the surgeon about blood loss and haemodynamic changes during mesenteric dissection and bowel resection.",
      "requests blood products from the blood bank if blood loss becomes significant and monitors haemoglobin intra-operatively.",
      "administers multimodal analgesia including intravenous paracetamol and opioids ahead of emergence.",
      "gives antiemetic prophylaxis and plans for post-operative nausea management.",
      "reverses neuromuscular blockade, extubates once protective reflexes return, and confirms haemodynamic stability.",
      "gives a structured handover to recovery covering fluid balance, blood loss, analgesia plan, and stoma or drain status."
    ],
    recovery: [
      "receives a structured SBAR handover from the anaesthetist and surgeon, including details of the resection, anastomosis or stoma, and drain placement.",
      "performs an initial ABCDE assessment, checking airway patency, respiratory rate, and haemodynamic stability.",
      "applies oxygen and continuous monitoring, and checks that any epidural or analgesia infusion is running correctly.",
      "assesses pain using a numerical scale and titrates analgesia, liaising with the acute pain team if an epidural is sited.",
      "checks the midline wound dressing for bleeding or leakage and inspects any stoma for colour and viability.",
      "monitors drain output for volume and character, escalating if output suggests bleeding or an anastomotic leak.",
      "monitors fluid balance closely, including urine output via the catheter, given the risk of third-space losses.",
      "observes for signs of anastomotic leak, including tachycardia, fever, increasing abdominal pain, or peritonism.",
      "escalates to the surgical team immediately if drain output, vital signs, or wound appearance suggest bleeding or leak.",
      "manages post-operative nausea and encourages early mobilisation once stable, per enhanced recovery protocol.",
      "documents observations, pain scores, drain output, and fluid balance on the recovery chart.",
      "confirms readiness for discharge from recovery against local criteria before transfer to the ward.",
      "gives a structured handover to the ward nurse covering the anastomosis or stoma, drain management, and escalation criteria."
    ]
  },

  splenectomy: {
    surgeon: [
      "confirms patient identity, consent for splenectomy, and reviews imaging confirming splenic injury or pathology with the team during WHO Sign In.",
      "confirms cross-matched blood is available given the risk of significant haemorrhage.",
      "checks patient positioning - supine with a slight right lateral tilt and a bolster under the left flank.",
      "supervises skin prep with chlorhexidine and draping for a midline or left subcostal incision.",
      "leads the WHO Time Out immediately before incision, confirming patient, procedure, antibiotics, blood availability, and equipment.",
      "makes a midline or left subcostal incision and enters the peritoneal cavity, packing all four quadrants if trauma is suspected.",
      "performs a full systematic exploration of the abdomen and confirms the extent of splenic injury or pathology.",
      "divides the splenocolic ligament to mobilise the splenic flexure away from the spleen.",
      "divides the gastrosplenic ligament, ligating the short gastric vessels individually between clips or ties to protect the greater curve of the stomach.",
      "divides the splenorenal and splenophrenic ligaments to fully mobilise the spleen medially into the wound.",
      "carefully dissects the splenic hilum, identifying the splenic artery and vein separately from the tail of the pancreas.",
      "ligates the splenic artery first with 2-0 Vicryl ties or a vascular stapler to reduce splenic congestion before venous division.",
      "ligates and divides the splenic vein with 2-0 Vicryl ties or a vascular stapler, taking care to avoid injury to the tail of the pancreas.",
      "manages unexpected bleeding from the hilum with direct pressure, additional ties, or a vascular clamp, remaining vigilant for injury to the pancreatic tail or stomach wall.",
      "removes the spleen and hands it to the scrub nurse for weighing and labelling.",
      "inspects the pancreatic tail for injury or leakage of pancreatic fluid and places a drain if there is any concern.",
      "searches the operative field systematically for accessory spleens around the hilum, splenic pedicle, and greater omentum, removing any found.",
      "irrigates the left upper quadrant with warm saline and checks haemostasis along the hilum and ligament pedicles.",
      "places a drain in the splenic bed if there is a pancreatic tail concern or ongoing ooze, securing it with a suture.",
      "closes the fascia with a continuous 1 PDS loop suture using a mass-closure technique, closes the subcutaneous layer with 3-0 Vicryl, and closes the skin with staples or 3-0 Monocryl subcuticular suture.",
      "leads the WHO Sign Out, confirms the specimen and any accessory spleen findings are documented, and dictates the operative note.",
      "gives a structured handover to recovery, including advice on arranging post-splenectomy vaccination and lifelong infection-risk precautions."
    ],
    assistant: [
      "helps position the patient supine with a bolster under the left flank, checking pressure points.",
      "assists with prepping and draping for the midline or left subcostal incision.",
      "confirms blood availability and the plan with the team during Time Out.",
      "holds retractors to expose the left upper quadrant following the laparotomy.",
      "assists with division of the splenocolic and gastrosplenic ligaments, providing counter-traction.",
      "helps ligate the short gastric vessels, holding tissue under tension for accurate clip or tie placement.",
      "assists with mobilisation of the spleen medially, supporting the organ to avoid capsular tears.",
      "retracts the tail of the pancreas away from the hilum during dissection of the splenic artery and vein.",
      "suctions blood to keep the field clear during hilar dissection and vessel ligation.",
      "assists with controlling unexpected bleeding from the hilum by applying pressure or holding a vascular clamp.",
      "helps search for accessory spleens around the hilum and omentum.",
      "assists with drain placement and securing if a pancreatic tail concern is identified.",
      "cuts sutures during fascial, subcutaneous, and skin closure.",
      "helps apply dressings and assists with transfer of the patient to recovery."
    ],
    scrub: [
      "checks the laparotomy and splenectomy instrument set, including vascular clamps and ties, against the count sheet.",
      "sets up diathermy, suction, and vascular instruments on the back table.",
      "gowns and gloves the surgical team and assists with draping.",
      "passes the scalpel for the incision and diathermy for haemostasis on entry.",
      "passes packs and retractors for abdominal exploration and left upper quadrant exposure.",
      "passes dissecting scissors and clip appliers for division of the splenic ligaments and short gastric vessels.",
      "passes right-angled dissectors and 2-0 Vicryl ties for careful dissection and ligation of the splenic artery and vein at the hilum.",
      "keeps a vascular stapler and additional vascular clamps immediately available in case of hilar bleeding.",
      "prepares the specimen tray and weighing scale for the spleen once removed.",
      "passes instruments to assist the search for accessory spleens.",
      "loads a 1 PDS loop for fascial mass closure and 3-0 Vicryl for the subcutaneous layer.",
      "loads 3-0 Monocryl or prepares skin staples for skin closure.",
      "performs the swab, needle, and instrument count with the circulator before and after closure.",
      "labels the specimen pot with the patient's details and weight, and hands it to the circulator for despatch to histology.",
      "confirms the final count sign-off and prepares dressings and a drain bag if required.",
      "documents any accessory spleens removed as separate specimens where applicable."
    ],
    circulator: [
      "completes the WHO Sign In, confirming patient identity, consent, allergies, and site with the team.",
      "confirms cross-matched blood is available in theatre given the risk of major haemorrhage.",
      "positions the operating table with a bolster for left flank access and sets up warming devices.",
      "opens additional sterile supplies including vascular staplers, clips, and drains as requested by the scrub team.",
      "documents case timings, blood loss, and fluid or blood product administration on the intra-operative record.",
      "coordinates the WHO Time Out immediately before incision.",
      "retrieves the spleen specimen, confirms weight with the scrub nurse, labels it, and arranges despatch to histology.",
      "liaises with the blood bank throughout the case, particularly during hilar dissection, to ensure blood is immediately available.",
      "coordinates the WHO Sign Out, confirming counts, specimens, and any accessory spleens documented.",
      "completes the swab, needle, and instrument count with the scrub nurse.",
      "documents the case fully in the theatre register and patient notes.",
      "liaises with the ward and pharmacy to arrange post-splenectomy vaccinations and prophylactic antibiotics.",
      "communicates the operative plan, drain details, and blood loss to the recovery team ahead of transfer.",
      "arranges an alert flag in the patient's records noting lifelong asplenia."
    ],
    anaesthetist: [
      "reviews the patient pre-operatively, assessing haemodynamic stability and the degree of blood loss if the indication is trauma.",
      "establishes wide-bore IV access, including a second large-bore cannula, and considers arterial line placement given the risk of major haemorrhage.",
      "cross-checks blood availability with the blood bank before induction.",
      "performs a rapid sequence induction if the patient is unstable or has a full stomach, or a standard induction if elective.",
      "secures the airway with an endotracheal tube and confirms bilateral air entry and a capnography trace.",
      "sets up invasive monitoring including arterial pressure and large-bore access for rapid transfusion if required.",
      "maintains anaesthesia with a balanced technique, remaining ready to transfuse rapidly during hilar dissection.",
      "communicates closely with the surgeon about blood loss during ligament division and hilar vessel control, transfusing proactively if bleeding is brisk.",
      "monitors for haemodynamic instability and corrects coagulopathy with blood products as guided by the clinical picture and laboratory results.",
      "administers multimodal analgesia including intravenous paracetamol and opioids ahead of emergence.",
      "gives antibiotic prophylaxis as directed, noting the increased infection risk after splenectomy.",
      "reverses neuromuscular blockade, extubates once protective reflexes return, and confirms haemodynamic stability.",
      "gives a structured handover to recovery covering total blood loss, products transfused, and haemodynamic trend.",
      "flags the need for post-splenectomy vaccination and infection-risk counselling to be arranged before discharge."
    ],
    recovery: [
      "receives a structured SBAR handover from the anaesthetist and surgeon, including total blood loss and any accessory spleens found.",
      "performs an initial ABCDE assessment, checking airway patency, respiratory rate, and haemodynamic stability closely given the risk of rebleeding.",
      "applies oxygen and continuous monitoring, watching closely for tachycardia or hypotension suggesting ongoing bleeding.",
      "assesses pain using a numerical scale and titrates analgesia as prescribed.",
      "checks the wound dressing and any drain for bleeding, volume, and character of output.",
      "monitors for signs of concealed haemorrhage, including abdominal distension, a falling haemoglobin, or haemodynamic deterioration, and escalates immediately.",
      "monitors for signs of pancreatic tail injury, such as raised drain amylase or persistent output, escalating to the surgical team if suspected.",
      "monitors fluid balance and urine output closely given the risk of ongoing blood loss.",
      "escalates to the surgical team immediately if vital signs, drain output, or wound appearance suggest bleeding or complication.",
      "documents observations, pain scores, drain output, and fluid balance on the recovery chart.",
      "confirms readiness for discharge from recovery against local criteria before transfer to the ward.",
      "counsels the patient on the need for pneumococcal, meningococcal, and Hib vaccination, along with an annual influenza vaccine, as part of post-splenectomy care.",
      "educates the patient on lifelong infection risk after splenectomy, including seeking urgent medical attention for fever and considering prophylactic antibiotics as advised.",
      "gives a structured handover to the ward nurse covering the operative course, vaccination plan, and escalation criteria."
    ]
  },

  jointWashout: {
    surgeon: [
      "confirms the patient's identity, consent, and the correct joint and side with the team during the WHO Sign In.",
      "reviews the pre-operative bloods, inflammatory markers, and any prior joint aspirate or imaging with the anaesthetist and theatre team.",
      "confirms the planned approach, either arthroscopic washout or open arthrotomy, and discusses the threshold for converting to open if needed.",
      "checks the positioning of the limb on the table, confirms the tourniquet is applied but not yet inflated, and confirms limb holder position for arthroscopy.",
      "performs the skin prep with chlorhexidine in alcohol and confirms sterile draping of the limb with the assistant.",
      "pauses for the WHO Time Out immediately before incision, confirming the joint, side, and any implants with the full team.",
      "inflates the tourniquet to the agreed pressure and notes the tourniquet time on the whiteboard.",
      "establishes the initial arthroscopic portal with a scalpel and blunt trocar, confirming free flow of joint fluid.",
      "aspirates a sample of turbid joint fluid before any irrigation begins and hands it to the scrub nurse for microbiology.",
      "inserts the arthroscope and performs a systematic diagnostic survey of the joint, noting synovitis, fibrin, and any loculated pus.",
      "establishes a second working portal under direct vision and introduces the inflow and outflow cannulae.",
      "takes a synovial biopsy from the most inflamed area of synovium for histology and further microbiology.",
      "performs pulsatile lavage of the joint with several litres of warmed normal saline, working systematically through each compartment and recess.",
      "debrides visibly infected or necrotic synovium and fibrinous debris with a shaver and grasper under direct vision.",
      "inspects the articular cartilage for erosion and checks for any loose bodies, retrieving them with a grasper.",
      "converts to a formal open arthrotomy if the infection is not adequately accessible arthroscopically, extending the incision along the anatomical plane.",
      "confirms haemostasis within the joint and surrounding soft tissues before deflating the tourniquet.",
      "deflates the tourniquet, checks for bleeding points, and achieves haemostasis with diathermy as needed.",
      "closes the portal or wound capsule with 2-0 Vicryl, the subcutaneous layer with 3-0 Monocryl, and the skin with 4-0 Monocryl subcuticular sutures or Steri-Strips.",
      "inserts an intra-articular drain if the degree of contamination warrants ongoing drainage, securing it with a 2-0 silk stitch.",
      "applies a bulky compressive dressing and confirms the limb is placed in an appropriate resting position or splint.",
      "completes the WHO Sign Out, confirms counts are correct with the scrub nurse, dictates the operative note, and hands over to recovery with the antibiotic and mobilisation plan."
    ],
    assistant: [
      "helps position the patient on the table and applies the tourniquet under the surgeon's direction.",
      "assists with skin prep and draping, ensuring the limb is free to be manipulated during the procedure.",
      "holds the limb in the required position throughout the case to allow access to each portal.",
      "holds the arthroscope steady and adjusts the camera angle as the surgeon directs the diagnostic survey.",
      "operates the inflow and outflow tubing, monitoring joint distension and clearing debris from the field.",
      "assists with retrieval of the joint fluid sample and passes it directly to the scrub nurse for labelling.",
      "retracts soft tissue during any conversion to open arthrotomy, keeping the field clear for the surgeon.",
      "suctions blood and debris from the field during debridement, keeping the view clear for the shaver.",
      "assists in checking each compartment of the joint is reached during the pulsatile lavage.",
      "cuts sutures as the surgeon closes the capsule, subcutaneous layer, and skin.",
      "helps insert and secure the intra-articular drain, connecting it to the vacuum bottle.",
      "assists in applying the compressive dressing and positioning the limb in the resting splint.",
      "helps monitor the tourniquet time throughout the case and reminds the team as it approaches the safe limit.",
      "assists with the final swab, needle, and instrument count before closure begins.",
      "helps transfer the patient onto the trolley and assists with the move to recovery."
    ],
    scrub: [
      "checks the arthroscopy tower, shaver system, and instrument set against the count sheet before the list starts.",
      "gowns and gloves the surgeon and assistant, and sets up the sterile trolley with the arthroscopic and open instrument sets available.",
      "prepares the inflow and outflow tubing and connects the arthroscopic pump, confirming pressure settings with the circulator.",
      "passes the scalpel and blunt trocar for the initial portal, followed by the arthroscope sheath.",
      "hands over a sterile pot to collect the initial joint fluid aspirate for microbiology before irrigation starts.",
      "passes the second trocar and cannula for the working portal under the surgeon's direction.",
      "passes the biopsy grasper for the synovial sample and places it into a separate labelled specimen pot.",
      "manages the irrigation fluid bags, keeping a running tally of the volume used for the pulsatile lavage.",
      "passes the shaver handpiece and appropriate burr or cutter attachments for synovial debridement.",
      "passes retractors and diathermy if the case converts to an open arthrotomy, adjusting the set accordingly.",
      "maintains a continuous swab, needle, and instrument count throughout the procedure, calling it aloud with the circulator.",
      "loads 2-0 Vicryl for the capsular layer, 3-0 Monocryl for the subcutaneous layer, and 4-0 Monocryl for the skin closure.",
      "prepares the intra-articular drain and vacuum bottle for insertion when requested.",
      "labels all specimen pots clearly with patient details and site, confirming this with the circulator before they leave the room.",
      "performs the final count with the circulator and confirms it is correct before skin closure is completed.",
      "prepares the dressing and splint materials ready for application at the end of the case."
    ],
    circulator: [
      "confirms the patient's identity, consent, and the correct joint and side during the WHO Sign In, checking the surgical marking.",
      "confirms any drug allergies and reviews the antibiotic plan with the anaesthetist before induction.",
      "sets up the operating table, tourniquet, and arthroscopy pump and irrigation fluid warmer ahead of the list.",
      "positions the patient with the team and applies the tourniquet cuff, documenting the starting pressure.",
      "opens the arthroscopy instrument set and any additional sterile supplies requested by the scrub nurse.",
      "documents the tourniquet inflation time and reminds the team as the safe duration approaches.",
      "records the volume of irrigation fluid used throughout the pulsatile lavage on the intra-operative chart.",
      "liaises with the microbiology laboratory to confirm urgent processing of the joint fluid and synovial biopsy samples.",
      "labels each specimen pot with the patient's details, site, and time taken, and arranges prompt transport to the laboratory.",
      "coordinates the WHO Time Out before incision and the WHO Sign Out before the patient leaves theatre.",
      "documents the tourniquet deflation time and total tourniquet duration in the notes.",
      "confirms the final swab, needle, and instrument count with the scrub nurse and documents it.",
      "communicates the operative findings and post-operative antibiotic plan to the recovery team ahead of transfer.",
      "assists with the transfer of the patient to the trolley and confirms recovery is ready to receive them."
    ],
    anaesthetist: [
      "reviews the patient's observations, inflammatory markers, and any signs of sepsis before induction.",
      "establishes intravenous access and sends off any outstanding blood cultures if sepsis is suspected.",
      "discusses with the surgeon whether a general or regional anaesthetic technique is most appropriate for the joint involved.",
      "pre-oxygenates the patient and performs a smooth induction, securing the airway with a laryngeal mask or endotracheal tube as planned.",
      "administers the pre-operative antibiotic dose after discussion with the surgeon about timing relative to sample collection.",
      "sites a peripheral nerve block or regional technique if appropriate for post-operative analgesia.",
      "establishes full monitoring including oxygen saturation, capnography, blood pressure, and temperature.",
      "monitors for haemodynamic changes consistent with sepsis, including tachycardia and hypotension, and treats with fluids or vasopressors as needed.",
      "communicates with the surgeon about tourniquet inflation and deflation, anticipating the physiological changes on release.",
      "manages fluid balance carefully, watching for signs of reperfusion after tourniquet deflation.",
      "plans post-operative analgesia, balancing opioid and non-opioid options with any regional block already sited.",
      "lightens the anaesthetic towards the end of the procedure and prepares for a smooth emergence.",
      "extubates the patient once protective reflexes have returned and transfers care to the recovery team.",
      "gives a structured handover to recovery covering the anaesthetic technique, antibiotics given, analgesia plan, and any sepsis concerns."
    ],
    recovery: [
      "receives a structured SBAR handover from the anaesthetist and surgeon covering the diagnosis, procedure performed, and findings.",
      "performs an initial airway, breathing, circulation, disability, and exposure assessment on arrival.",
      "monitors oxygen saturation, respiratory rate, and level of consciousness closely during emergence from anaesthesia.",
      "checks the surgical dressing for any active bleeding or excessive ooze and reinforces it if required.",
      "assesses the limb's neurovascular status, checking distal pulses, capillary refill, sensation, and movement.",
      "monitors temperature closely, given the risk of an ongoing septic focus, and escalates any spike above the agreed threshold.",
      "assesses pain using a validated pain score and titrates intravenous analgesia according to the prescribed plan.",
      "checks the intra-articular drain if present for volume and character of output, documenting it on the fluid balance chart.",
      "monitors heart rate and blood pressure for any signs of ongoing sepsis, escalating to the surgical team if the patient becomes tachycardic or hypotensive.",
      "confirms the antibiotic plan and administers the next scheduled dose according to the prescription chart.",
      "checks the limb is correctly positioned in the splint or resting position as instructed by the surgeon.",
      "documents all observations, drain output, and analgesia given clearly in the recovery record.",
      "confirms the patient meets discharge criteria from recovery before contacting the ward to arrange transfer.",
      "gives a full handover to the ward nurse, including the mobilisation plan, antibiotic course, and specific signs of infection to watch for."
    ]
  },

  vascularRepair: {
    surgeon: [
      "confirms the patient's identity, consent, and the injured limb or vessel with the team during the WHO Sign In.",
      "reviews the mechanism of injury, pre-operative imaging or CT angiogram, and the distal pulse examination with the team.",
      "confirms the availability of cross-matched blood and discusses the transfusion threshold with the anaesthetist.",
      "checks the patient's positioning on the table to allow access to both the injury site and a potential vein harvest site.",
      "preps the skin widely from above the injury to below it, including a leg prepped for possible vein harvest, and drapes the field.",
      "pauses for the WHO Time Out immediately before incision, confirming the limb, the level of injury, and blood availability.",
      "makes the incision directly over the injured vessel, extending proximally and distally to gain adequate exposure.",
      "identifies and gains proximal control of the vessel with a vascular sling or soft clamp before approaching the injury directly.",
      "gains distal control of the vessel in the same way, ensuring both ends are secured before manipulating the injury.",
      "assesses the extent of the injury, distinguishing a contusion or intimal flap from a partial laceration or complete transection.",
      "debrides the damaged vessel ends back to healthy tissue with visibly normal intima and adventitia.",
      "flushes both the proximal and distal ends with heparinised saline and confirms good inflow and backbleeding.",
      "decides between a primary end-to-end repair, a patch angioplasty, or an interposition graft based on the length of the defect.",
      "performs a primary end-to-end anastomosis with interrupted or continuous 6-0 or 7-0 Prolene sutures, spatulating the vessel ends if narrowing is a concern.",
      "harvests a segment of great saphenous vein from the contralateral leg if an interposition graft is required, reversing it before use.",
      "fashions the interposition graft and completes the proximal and distal anastomoses with fine 6-0 Prolene sutures, checking for a watertight seal.",
      "releases the clamps sequentially, checking each anastomosis for leaks and reinforcing any bleeding points with an additional suture.",
      "confirms distal perfusion with a hand-held Doppler, checking for a triphasic or biphasic signal at the ankle or wrist.",
      "considers and performs a fasciotomy of the affected compartments if there is a significant risk of reperfusion injury or compartment syndrome.",
      "achieves haemostasis in the surrounding soft tissues and irrigates the wound thoroughly before closure.",
      "closes the deep fascia with 0 or 2-0 Vicryl, the subcutaneous layer with 3-0 Monocryl, and the skin with staples or 3-0 Nylon sutures, leaving fasciotomy wounds open if performed.",
      "completes the WHO Sign Out, dictates the operative note detailing the repair performed, and hands over to recovery with clear neurovascular monitoring instructions."
    ],
    assistant: [
      "helps position the patient and ensures both the injury site and a potential donor leg are accessible and prepped.",
      "assists with the wide skin prep and draping, keeping the field sterile for a possible vein harvest.",
      "retracts soft tissue to help the surgeon gain proximal and distal exposure of the injured vessel.",
      "holds vascular slings and soft clamps steady to maintain proximal and distal control throughout the repair.",
      "suctions blood from the field continuously to keep the operative view clear during vessel dissection.",
      "assists in harvesting the saphenous vein graft if required, handling the vein gently to avoid trauma.",
      "holds the vessel steady with fine forceps during the anastomosis, keeping tension even for the surgeon.",
      "cuts the fine Prolene sutures as the surgeon completes each throw of the anastomosis.",
      "helps release the vascular clamps slowly and watches closely for any bleeding points at the suture line.",
      "assists with the hand-held Doppler assessment, positioning the probe over the distal pulses.",
      "helps perform the fasciotomy incisions if required, retracting the fascia to allow full compartment release.",
      "cuts sutures as the surgeon closes the fascia, subcutaneous layer, and skin.",
      "assists with dressing the wound and any fasciotomy sites, and helps apply a splint if needed.",
      "helps monitor and document the total ischaemic time throughout the procedure.",
      "assists with the final swab, needle, and instrument count before closure is completed.",
      "helps transfer the patient onto the trolley for transfer to recovery, keeping the limb supported."
    ],
    scrub: [
      "checks the vascular instrument set, including fine forceps, vascular clamps, and Doppler probe, against the count sheet.",
      "gowns and gloves the surgical team and sets up the sterile trolley with both the vascular and general surgical sets available.",
      "passes the scalpel for the initial incision and retractors to establish exposure of the injured vessel.",
      "passes the vascular slings and soft clamps for proximal and distal control as the surgeon requests them.",
      "prepares heparinised saline for flushing the vessel ends and has it ready throughout the repair.",
      "passes fine instruments for vein harvest if an interposition graft is needed, keeping the vein moist in saline.",
      "loads 6-0 and 7-0 Prolene sutures on fine needle holders for the anastomosis, anticipating the surgeon's next request.",
      "passes the fasciotomy blade and retractors promptly if the surgeon decides compartment release is needed.",
      "manages a continuous swab, needle, and instrument count throughout the procedure, calling it aloud with the circulator.",
      "keeps the hand-held Doppler probe sterile and ready for the surgeon to check distal perfusion.",
      "loads 0 or 2-0 Vicryl for the fascia, 3-0 Monocryl for the subcutaneous layer, and staples or 3-0 Nylon for the skin.",
      "prepares dressing materials and splints ready for application at the end of the case.",
      "labels any tissue sent for histology, such as a segment of debrided vessel, and confirms this with the circulator.",
      "performs the final count with the circulator and confirms it is correct before the skin is closed.",
      "assists in preparing any fasciotomy wound dressings if the wounds are left open.",
      "hands over the used vascular instruments for cleaning and confirms all sharps are accounted for at the end of the case."
    ],
    circulator: [
      "confirms the patient's identity, consent, and the injured limb during the WHO Sign In, checking the surgical marking.",
      "confirms the group and save or cross-match status with the blood bank and ensures blood is available in theatre or on standby.",
      "sets up the operating table and positions equipment to allow wide access for both the injury site and a vein harvest leg.",
      "opens the vascular instrument set and Doppler probe, and any additional sterile supplies requested during the case.",
      "liaises with the blood bank throughout the case if transfusion is required, documenting units given.",
      "documents the time of proximal and distal clamp application and release, tracking total ischaemic time.",
      "coordinates the WHO Time Out before incision and confirms blood availability is documented before the surgeon proceeds.",
      "labels any specimens sent for histology and arranges transport to the laboratory promptly.",
      "documents fluid and blood products given throughout the procedure on the intra-operative record.",
      "coordinates the WHO Sign Out and confirms the final swab, needle, and instrument count with the scrub nurse.",
      "communicates the extent of the injury, repair performed, and any fasciotomy to the recovery team ahead of transfer.",
      "assists with positioning the limb appropriately for transfer and confirms recovery is ready to receive the patient.",
      "documents the total ischaemic time and the type of repair performed clearly in the theatre record.",
      "escalates urgently to the blood bank and senior staff if massive transfusion is required during the case."
    ],
    anaesthetist: [
      "assesses the patient for signs of haemorrhagic shock, including heart rate, blood pressure, and capillary refill, before induction.",
      "establishes large-bore intravenous access, or central access if peripheral access is difficult, and sends bloods including a group and save or cross-match.",
      "considers an arterial line for continuous blood pressure monitoring given the risk of haemodynamic instability.",
      "performs a rapid sequence induction if the patient is unstable or has a full stomach, securing the airway promptly.",
      "administers blood products and intravenous fluids to maintain adequate perfusion, guided by ongoing blood loss.",
      "establishes full monitoring including invasive blood pressure, capnography, oxygen saturation, and temperature.",
      "communicates closely with the surgeon about clamp application and release, anticipating hypotension on reperfusion.",
      "treats hyperkalaemia or acidosis proactively if a prolonged period of limb ischaemia is anticipated before reperfusion.",
      "maintains the patient's temperature with warming devices, given the risk of coagulopathy with prolonged surgery and blood loss.",
      "manages ongoing blood loss and transfusion requirements, keeping the surgeon updated on the patient's physiological status.",
      "plans post-operative analgesia, considering the extent of the repair and any fasciotomy wounds.",
      "lightens the anaesthetic towards the end of the case once the surgeon confirms the repair and any fasciotomy are complete.",
      "extubates the patient once stable and protective reflexes have returned, or plans a period of ventilation if the patient remains unstable.",
      "gives a structured handover to recovery covering blood loss, transfusion given, ischaemic time, and neurovascular monitoring priorities."
    ],
    recovery: [
      "receives a structured SBAR handover covering the vessel injured, the repair performed, ischaemic time, and blood products given.",
      "performs an initial airway, breathing, circulation, disability, and exposure assessment on arrival.",
      "checks distal pulses, capillary refill, limb colour, and temperature at frequent, clearly documented intervals.",
      "uses a hand-held Doppler to confirm a signal at the distal pulse points if they are difficult to palpate directly.",
      "monitors the wound and any fasciotomy sites closely for bleeding, swelling, or signs of compartment syndrome.",
      "assesses pain regularly, being alert to pain out of proportion to examination as a possible sign of compartment syndrome.",
      "monitors blood pressure and heart rate closely, watching for signs of ongoing bleeding or hypovolaemia.",
      "checks the patient's coagulation status and temperature, escalating promptly if there are signs of coagulopathy.",
      "escalates immediately to the surgical team if distal pulses are lost, the limb becomes cold or pale, or pain increases suddenly.",
      "monitors urine output closely as a marker of adequate perfusion, particularly after significant blood loss.",
      "documents all neurovascular observations, drain output, and analgesia given clearly in the recovery record.",
      "liaises with the surgical team regarding the threshold for returning to theatre if perfusion appears compromised.",
      "confirms the patient meets discharge criteria from recovery before arranging transfer to a monitored ward bed.",
      "gives a full handover to the ward nurse, emphasising the frequency of neurovascular observations required and clear escalation criteria."
    ]
  },

  skinGraft: {
    surgeon: [
      "confirms the patient's identity, consent, and the recipient wound site and planned donor site with the team during the WHO Sign In.",
      "reviews the wound bed, previous debridement, and any relevant wound swabs or imaging with the team.",
      "marks the planned donor site, commonly the anterolateral thigh, and confirms this with the patient if awake or with the consent form.",
      "checks the patient's positioning allows access to both the recipient wound and the donor site simultaneously.",
      "preps and drapes both the recipient wound and the donor site separately to avoid cross-contamination.",
      "pauses for the WHO Time Out immediately before incision, confirming both the recipient and donor sites with the team.",
      "debrides the recipient wound bed sharply back to healthy, bleeding tissue, removing any residual slough or non-viable tissue.",
      "achieves haemostasis in the recipient bed with diathermy and pressure, ensuring a clean surface for graft take.",
      "measures the recipient defect to determine the size of split-thickness graft required from the donor site.",
      "applies lubricant to the donor site and harvests a split-thickness skin graft with a dermatome set to the planned thickness.",
      "inspects the harvested graft for adequate thickness and uniformity before passing it to the scrub nurse.",
      "passes the graft through a mesher if wider coverage or drainage of exudate is required, selecting the appropriate mesh ratio.",
      "lays the graft onto the recipient bed, orientating the dermal side down, and trims it to fit the wound edges precisely.",
      "secures the graft to the wound edges with fine sutures or skin staples, ensuring firm even contact with the underlying bed.",
      "checks the graft lies flat without folds or air pockets, expressing any trapped fluid or blood from beneath it.",
      "applies a non-adherent contact layer over the graft followed by a tie-over bolster dressing to maintain firm, even pressure.",
      "secures the tie-over sutures around the bolster with 2-0 or 3-0 silk, checking the dressing is snug but not compromising perfusion.",
      "controls bleeding at the donor site with adrenaline-soaked swabs and topical haemostatic agents as needed.",
      "dresses the donor site with an appropriate low-adherent or alginate dressing suited to a partial-thickness wound.",
      "reviews both sites once dressed, confirming there is no active bleeding through either dressing before drapes are removed.",
      "completes the WHO Sign Out, confirms counts are correct with the scrub nurse, and dictates the operative note detailing graft thickness, mesh ratio, and donor site.",
      "hands over to recovery with clear instructions on graft immobilisation, donor site analgesia, and the timing of the first dressing check."
    ],
    assistant: [
      "helps position the patient to allow simultaneous access to the recipient wound and the donor site.",
      "assists with prepping and draping both sites separately, keeping them clearly distinguished throughout the case.",
      "retracts and holds tension on the skin at the donor site to help the surgeon achieve an even dermatome pass.",
      "assists with debridement of the recipient bed, holding retractors and suctioning as the surgeon works.",
      "helps apply pressure and diathermy to control bleeding in the recipient bed before the graft is laid.",
      "helps stretch and hold the graft steady while the surgeon feeds it through the mesher.",
      "assists in positioning and trimming the graft over the recipient bed, keeping it orientated correctly.",
      "cuts sutures as the surgeon secures the graft edges and applies the tie-over bolster stitches.",
      "helps apply firm, even pressure while the tie-over bolster dressing is secured in place.",
      "assists with haemostasis at the donor site, applying adrenaline-soaked swabs under the surgeon's direction.",
      "helps apply the donor site dressing, ensuring it is smooth and free of wrinkles.",
      "assists with a final check of both dressings for any bleeding before the drapes are removed.",
      "helps with positioning aids or splints to immobilise the grafted area after the dressing is complete.",
      "assists with the final swab, needle, and instrument count before the case ends.",
      "helps transfer the patient onto the trolley, protecting both the graft and donor sites during the move."
    ],
    scrub: [
      "checks the dermatome, mesher, and general instrument set against the count sheet before the list begins.",
      "gowns and gloves the surgical team and prepares separate trolleys or trays for the recipient and donor sites.",
      "passes sharp debridement instruments and diathermy for preparation of the recipient wound bed.",
      "prepares the dermatome, setting the blade and depth gauge to the thickness requested by the surgeon.",
      "applies lubricant to the donor site drape or skin as directed, and passes the dermatome for the harvest.",
      "receives the harvested graft onto a saline-moistened swab or backing and keeps it protected until needed.",
      "sets up and passes the graft mesher, loading the graft onto the correct carrier for the chosen mesh ratio.",
      "passes fine sutures or a skin stapler for securing the graft to the recipient wound edges.",
      "prepares the non-adherent contact layer and tie-over bolster materials ready for application.",
      "loads 2-0 or 3-0 silk for the tie-over sutures and passes them in sequence as the surgeon secures the bolster.",
      "maintains a continuous swab, needle, and instrument count throughout the procedure, calling it aloud with the circulator.",
      "prepares adrenaline-soaked swabs and topical haemostatic agents for donor site bleeding control.",
      "prepares the donor site dressing materials, selecting the appropriate low-adherent or alginate product.",
      "labels any tissue sent for histology, such as a wound bed biopsy, and confirms this with the circulator.",
      "performs the final count with the circulator and confirms it is correct before both dressings are completed.",
      "hands over used sharps and the dermatome blade for safe disposal at the end of the case."
    ],
    circulator: [
      "confirms the patient's identity, consent, and both the recipient wound site and marked donor site during the WHO Sign In.",
      "confirms any allergies, particularly to adhesive dressings or topical agents, with the anaesthetist.",
      "sets up the operating table and equipment to allow access to both the recipient and donor sites.",
      "opens the dermatome blade, mesher components, and any additional sterile supplies requested by the scrub nurse.",
      "documents the size of the recipient defect and the size and location of the donor site harvested.",
      "coordinates the WHO Time Out before incision, confirming both the recipient and donor sites with the team.",
      "labels any specimens sent for histology and arranges prompt transport to the laboratory.",
      "documents the graft thickness, mesh ratio, and any topical agents used on the intra-operative record.",
      "liaises with the tissue viability or dressings team in advance regarding specialist bolster or negative pressure equipment if required.",
      "coordinates the WHO Sign Out and confirms the final swab, needle, and instrument count with the scrub nurse.",
      "communicates the graft details and donor site location to the recovery team ahead of transfer.",
      "documents positioning aids or splints applied to protect the grafted area during transfer.",
      "assists with transferring the patient onto the trolley, protecting both dressed sites during the move.",
      "confirms recovery is ready to receive the patient and briefs them on the planned first dressing check date."
    ],
    anaesthetist: [
      "assesses the patient's fitness for anaesthesia, noting the extent and location of the wound requiring grafting.",
      "establishes intravenous access and discusses with the surgeon the expected duration of the combined harvest and grafting procedure.",
      "selects an appropriate general or regional anaesthetic technique based on the size and location of the donor and recipient sites.",
      "induces anaesthesia and secures the airway with a laryngeal mask or endotracheal tube as planned.",
      "establishes standard monitoring including oxygen saturation, capnography, blood pressure, and temperature.",
      "positions the patient carefully with the surgical team to allow simultaneous access to both operative sites.",
      "maintains normothermia throughout the case, being mindful of heat loss from two exposed wound areas.",
      "manages fluid balance appropriately, accounting for insensible losses from the open donor and recipient sites.",
      "communicates with the surgeon about the anticipated pain from the donor site, which is often more painful than the recipient site.",
      "plans multimodal analgesia in advance, anticipating that donor site pain typically exceeds graft site pain post-operatively.",
      "lightens the anaesthetic towards the end of the case once both dressings are confirmed complete.",
      "extubates the patient once stable and protective reflexes have returned.",
      "gives a structured handover to recovery covering the anaesthetic technique, analgesia plan, and which site is likely to be more painful.",
      "advises recovery on positioning to protect both the graft and donor site during emergence and early recovery."
    ],
    recovery: [
      "receives a structured SBAR handover covering the recipient site, donor site location, graft thickness, and mesh ratio used.",
      "performs an initial airway, breathing, circulation, disability, and exposure assessment on arrival.",
      "checks both the graft dressing and the donor site dressing for any strike-through bleeding or excessive ooze.",
      "assesses pain separately at both sites, being alert that the donor site is often more painful than the graft site.",
      "titrates analgesia according to the prescribed multimodal plan, escalating if pain is poorly controlled.",
      "checks the grafted area is immobilised and protected from pressure or shearing forces while the patient recovers.",
      "monitors for signs of the bolster dressing being too tight, such as excessive pain or swelling distal to it.",
      "monitors temperature and general observations, watching for early signs of infection at either site.",
      "avoids disturbing the tie-over bolster dressing unless there is a specific concern, as early graft take depends on it remaining undisturbed.",
      "monitors fluid balance, particularly if the harvested area is large relative to the patient's size.",
      "escalates to the surgical team if there is uncontrolled bleeding through either dressing or signs of compartment-type pain under the bolster.",
      "documents all observations, dressing checks, and analgesia given clearly in the recovery record.",
      "confirms the patient meets discharge criteria from recovery before arranging transfer to the ward.",
      "gives a full handover to the ward nurse, specifying the planned date for the first dressing change and signs of graft failure to watch for."
    ]
  }

};

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
    "washes and scrubs in for " + "{SURGERY} using a timed surgical scrub technique, then dries hands with a sterile towel.",
    "gowns and gloves using a closed-glove technique, keeping hands above waist level and within the sterile zone.",
    "checks the sterile packs, instrument trays, indicator strips and specialist equipment for " + "{SURGERY} before opening.",
    "opens each sterile pack using an aseptic non-touch technique, checking the sterility indicator has changed colour and the expiry date is valid.",
    "sets up the back table and Mayo stand, arranging instruments in a logical sequence by stage of the procedure.",
    "lays out packaged sutures, blades, swabs and specialist disposables onto the sterile field without breaking sterility.",
    "tests the diathermy/cautery lead and suction tubing on the sterile field before connecting them to theatre equipment.",
    "performs the initial instrument, swab and sharps count aloud with the circulating nurse before the surgeon starts.",
    "arranges the sterile field in a logical sequence and confirms critical instruments with the surgeon before incision.",
    "participates in the surgical time-out and confirms the sterile setup matches the planned procedure.",
    "passes instruments cleanly and anticipates the next stage while maintaining awareness of the sterile field.",
    "keeps used instruments organised, manages sharps safely and communicates when additional sterile equipment is required.",
    "maintains an accurate running count and raises any discrepancy immediately rather than allowing the procedure to continue unnoticed.",
    "receives any excised tissue onto a sterile dish and confirms the specimen details with the surgeon before it leaves the field.",
    "prepares the closure instruments and requested dressings, then completes the final count with the circulating nurse.",
    "helps secure and organise the final sterile dressing setup and confirms the field is clear before leaving theatre.",
    "breaks down the instrument trays after " + "{SURGERY}, separating sharps for safe disposal before instruments go for decontamination.",
    "double-checks no instruments, swabs or sharps remain on the trolley before it is wheeled out for cleaning."
  ],
  circulator: [
    "checks the theatre is clean, equipment is in place and the correct case notes are available before " + "{SURGERY} begins.",
    "confirms the patient's identity, consent and marked site against the notes on arrival in the anaesthetic room.",
    "checks the theatre environment, equipment, patient identity and documentation before the start of " + "{SURGERY}.",
    "confirms required equipment, implants, blood products or specialist items are available and records relevant checks.",
    "helps position the patient and pads pressure points before the sterile field is established.",
    "ties the scrub nurse's gown and adjusts theatre lighting and equipment positioning without entering the sterile field.",
    "supports the time-out by reading back patient, procedure and site details and documenting the team confirmation.",
    "opens additional sterile supplies without breaking the sterile field and responds to requests from the scrub team.",
    "monitors theatre workflow, equipment status and documentation while remaining ready to obtain additional supplies.",
    "records key procedural events and specimen or implant details as directed by the theatre team.",
    "receives the labelled specimen container, checks the label against the request form and completes specimen documentation for pathology.",
    "packages the specimen for transport per local protocol and arranges prompt collection by the lab.",
    "coordinates the final count, specimen labelling, documentation and transfer paperwork before the patient leaves theatre.",
    "segregates sharps, clinical waste and used linen into the correct bins at the end of " + "{SURGERY}.",
    "sends used instruments for decontamination and confirms replacement trays are ready for the next case.",
    "coordinates the terminal clean of theatre and equipment between cases, checking surfaces and floors are decontaminated.",
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
  var specific = surgeryRoleActionsBySurgery[name] && surgeryRoleActionsBySurgery[name][role];
  var actions = specific
    ? specific.slice()
    : (surgeryRoleActions[role] || []).map(function(action) {
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
  container.innerHTML = surgery.checklist.map(function(item, i) {
    return '<div class="check-row"><input type="checkbox" name="surgery-prep-check-' + currentSurgery + '-' + i + '"><span>' + escapeHtml(item) + '</span></div>';
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
  if (!surgery || !Array.isArray(surgery.rp) || surgery.rp.length === 0) {
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
      + '<button class="edit-small surgery-rp-copy" type="button" data-copy-target="surgeryRP-' + index + '">Copy</button>'
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

document.addEventListener('click', function(event) {
  var btn = event.target.closest('.surgery-rp-copy');
  if (!btn) return;
  var id = btn.getAttribute('data-copy-target');
  var el = id ? document.getElementById(id) : null;
  if (!el) return;
  var text = el.textContent || '';
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function() {
      var old = btn.textContent; btn.textContent = 'Copied!';
      setTimeout(function(){ btn.textContent = old; }, 900);
    }).catch(function(){ if (typeof copyText === 'function') copyText(id); });
  } else if (typeof copyText === 'function') {
    copyText(id);
  }
});

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

// Dashboard Update Log navigation
document.addEventListener('click', (event) => {
  const item = event.target.closest('.update-log-item[data-update-target]');
  if (!item) return;

  const targetId = item.getAttribute('data-update-target');
  const target = document.getElementById(targetId);
  if (!target) return;

  event.preventDefault();

  // Use the application's real navigation function when available.
  if (typeof window.showSection === 'function') {
    window.showSection(targetId);
  } else {
    document.querySelectorAll('.section').forEach(section => {
      section.classList.toggle('active', section.id === targetId);
    });
  }

  const subTargetId = item.getAttribute('data-update-subtarget');
  const subTarget = subTargetId ? document.getElementById(subTargetId) : null;
  const destination = subTarget || target;

  setTimeout(() => {
    destination.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 30);

  try {
    history.replaceState(null, '', '#' + (subTargetId || targetId));
  } catch (_) {}
});


/* =========================================================
   ROSTER SIDE FILTERS
========================================================= */
document.addEventListener('input', (event) => {
  if (event.target?.id === 'paramedicRosterSearch') renderSideRoster('paramedic');
  if (event.target?.id === 'hospitalRosterSearch') renderSideRoster('hospital');
});
document.addEventListener('change', (event) => {
  if (event.target?.id === 'paramedicRosterRankFilter' || event.target?.id === 'paramedicRosterSpecialtyFilter') renderSideRoster('paramedic');
  if (event.target?.id === 'hospitalRosterRankFilter' || event.target?.id === 'hospitalRosterSpecialtyFilter') renderSideRoster('hospital');
  if (event.target?.id === 'editStaffSide') {
    populateRankSelect(document.getElementById('editRank')?.value || '', event.target.value);
  }
});


/* =========================================================
   PHASE 2 — GLOBAL KNOWLEDGE SEARCH
========================================================= */
(function initPhase2KnowledgeSearch(){
  const badgeMap = {
    dashboard:['Knowledge Hub'],
    abcde:['STUDY','REAL-WORLD REFERENCE','FIVEM RP'],
    trauma:['STUDY','REAL-WORLD REFERENCE','FIVEM RP'],
    emergencies:['STUDY','FIVEM RP'],
    'emergency-mode':['FIVEM RP','RP PROCEDURE'],
    scenes:['FIVEM RP','RP PROCEDURE'],
    procedures:['STUDY','FIVEM RP','RP PROCEDURE'],
    surgeries:['STUDY','FIVEM RP','RP PROCEDURE'],
    meds:['STUDY','REAL-WORLD REFERENCE','FIVEM RP'],
    equipment:['STUDY','FIVEM RP'],
    cardiac:['STUDY','REAL-WORLD REFERENCE','FIVEM RP'],
    respiratory:['STUDY','REAL-WORLD REFERENCE','FIVEM RP'],
    pain:['STUDY','REAL-WORLD REFERENCE','FIVEM RP'],
    documentation:['STUDY','FIVEM RP','RP PROCEDURE'],
    rp:['FIVEM RP','RP PROCEDURE'],
    documents:['REAL-WORLD REFERENCE','STUDY']
  };

  const pageDescriptions = {
    dashboard:'Your central UHS knowledge hub for clinical reference, procedures and FiveM RP resources.',
    abcde:'Structured primary survey reference with clinical checks, equipment, reassessment and RP actions.',
    trauma:'Trauma assessment and treatment reference for rapid scene-to-handover use.',
    emergencies:'Emergency presentations, immediate actions and RP-ready response guidance.',
    'emergency-mode':'Fast-access emergency RP workflow for active incidents.',
    scenes:'Scenario-based scene guides, assessment prompts and RP actions.',
    procedures:'Procedure references with preparation, equipment, workflow and RP actions.',
    surgeries:'Surgical procedure library with theatre workflow and role-specific RP actions.',
    meds:'Medication reference including indications, forms, dose reference and rank authorisation.',
    equipment:'Equipment library organised by clinical task, with practical FiveM /me actions.',
    cardiac:'Cardiac assessment, treatment references and RP procedure guidance.',
    respiratory:'Respiratory assessment and treatment references with RP support.',
    pain:'Pain assessment and management reference for clinical and RP use.',
    documentation:'Documentation, SBAR, HART, HEMS and handover reference material.',
    rp:'FiveM RP action library for clinical scenes and procedures.',
    documents:'Reference documents and stored clinical resources.'
  };

  function addKnowledgeBadges(){
    document.querySelectorAll('section.section').forEach(section=>{
      const labels=badgeMap[section.id];
      if(!labels) return;
      const heading=section.querySelector('h1,h2,h3');
      if(!heading) return;
      let header=section.querySelector(':scope > .knowledge-page-header');
      if(!header){
        header=document.createElement('div');
        header.className='knowledge-page-header';
        const copy=document.createElement('div');
        copy.className='knowledge-page-copy';
        const title=document.createElement('div');
        title.className='knowledge-page-kicker';
        title.textContent='UHS KNOWLEDGE HUB';
        copy.appendChild(title);
        const description=document.createElement('p');
        description.className='knowledge-page-description';
        description.textContent=pageDescriptions[section.id] || 'Clinical Desk reference material and FiveM RP resources.';
        copy.appendChild(description);
        const tools=document.createElement('div');
        tools.className='knowledge-page-tools';
        const search=document.createElement('button');
        search.type='button';
        search.className='knowledge-search-link';
        search.textContent='⌕ Search knowledge';
        search.addEventListener('click',openSearch);
        tools.appendChild(search);
        header.append(copy,tools);
        heading.insertAdjacentElement('beforebegin',header);
      }
      let wrap=header.querySelector('.knowledge-badges');
      if(!wrap){
        wrap=document.createElement('div');
        wrap.className='knowledge-badges';
        header.querySelector('.knowledge-page-copy').appendChild(wrap);
      }
      if(!wrap.childElementCount){
        labels.forEach(label=>{
          const b=document.createElement('span');
          b.className='knowledge-badge';
          b.dataset.knowledgeType=label.toLowerCase().replace(/[^a-z]+/g,'-');
          b.textContent=label;
          wrap.appendChild(b);
        });
      }
      heading.classList.add('knowledge-page-title');
    });
  }

  function buildIndex(){
    const entries=[];
    document.querySelectorAll('section.section').forEach(section=>{
      const title=(section.querySelector('h1,h2,h3')?.textContent||section.id||'').trim();
      const text=(section.innerText||'').replace(/\s+/g,' ').trim();
      if(text) entries.push({id:section.id,title,text});
    });
    return entries;
  }

  let entries=[];
  let selected=-1;

  function openSearch(){
    let overlay=document.getElementById('uhsGlobalSearch');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='uhsGlobalSearch';
      overlay.className='uhs-global-search';
      overlay.innerHTML='<div class="uhs-search-dialog" role="dialog" aria-modal="true" aria-label="Global knowledge search"><div class="uhs-search-top"><input id="uhsSearchInput" class="uhs-search-input" autocomplete="off" placeholder="Search the Clinical Desk… (Ctrl+K)" aria-label="Search knowledge"><button type="button" class="uhs-search-close" id="uhsSearchClose">Close</button></div><div class="uhs-search-hint">Search clinical topics, procedures, medications, equipment, RP actions and documents.</div><div class="uhs-search-results" id="uhsSearchResults"></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click',e=>{if(e.target===overlay) closeSearch();});
      document.getElementById('uhsSearchClose').addEventListener('click',closeSearch);
    }
    entries=buildIndex();
    overlay.classList.add('open');
    const input=document.getElementById('uhsSearchInput');
    input.value='';
    selected=-1;
    renderResults('');
    setTimeout(()=>input.focus(),0);
  }

  function closeSearch(){
    document.getElementById('uhsGlobalSearch')?.classList.remove('open');
  }

  function renderResults(query){
    const box=document.getElementById('uhsSearchResults');
    if(!box) return;
    const q=query.trim().toLowerCase();
    if(!q){
      box.innerHTML='<div class="uhs-search-empty">Start typing to search the Clinical Desk.</div>';
      return;
    }
    const terms=q.split(/\s+/).filter(Boolean);
    const results=entries.map(item=>{
      const hay=(item.title+' '+item.text).toLowerCase();
      const score=terms.reduce((s,t)=>s+(item.title.toLowerCase().includes(t)?8:0)+(hay.includes(t)?1:0),0);
      return {...item,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,30);
    if(!results.length){box.innerHTML='<div class="uhs-search-empty">No matching knowledge found.</div>';selected=-1;return;}
    box.innerHTML=results.map((r,i)=>{
      const pos=r.text.toLowerCase().indexOf(q);
      const snippet=pos>=0?r.text.slice(Math.max(0,pos-80),pos+180):r.text.slice(0,220);
      return '<button type="button" class="uhs-search-result'+(i===selected?' selected':'')+'" data-search-section="'+r.id+'"><strong>'+escapeHtml(r.title)+'</strong><small>'+escapeHtml(snippet)+'</small></button>';
    }).join('');
    box.querySelectorAll('[data-search-section]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.searchSection;
      closeSearch();
      if(typeof showSection==='function') showSection(id);
      const target=document.getElementById(id);
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }));
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault(); openSearch(); return;
    }
    const overlay=document.getElementById('uhsGlobalSearch');
    if(!overlay?.classList.contains('open')) return;
    if(e.key==='Escape'){e.preventDefault();closeSearch();}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const buttons=[...document.querySelectorAll('.uhs-search-result')];
      if(!buttons.length) return;
      e.preventDefault();
      selected=Math.max(0,Math.min(buttons.length-1,selected+(e.key==='ArrowDown'?1:-1)));
      buttons.forEach((b,i)=>b.classList.toggle('selected',i===selected));
      buttons[selected]?.scrollIntoView({block:'nearest'});
    }
    if(e.key==='Enter'&&selected>=0){
      e.preventDefault();
      document.querySelectorAll('.uhs-search-result')[selected]?.click();
    }
  });
  document.addEventListener('input',e=>{
    if(e.target?.id==='uhsSearchInput'){selected=-1;renderResults(e.target.value);}
  });

  addKnowledgeBadges();
  window.openGlobalKnowledgeSearch=openSearch;
})();


/* Stroke Clinical Pathways — configurable knowledge/RP data */
window.uhsStrokeData = {
  version: 'STROKE-1.0',
  lastClinicalReview: '2026-09-27',
  status: 'requires-local-review-before-real-world-use',
  sources: [
    {name:'NICE NG128', role:'stroke/TIA diagnosis and initial management'},
    {name:'NICE TA990', role:'tenecteplase for acute ischaemic stroke'},
    {name:'UK Metalyse SmPC', role:'current product information'},
    {name:'UK Actilyse SmPC', role:'current product information'},
    {name:'NHS stroke guidance', role:'recognition and treatment overview'},
    {name:'Resuscitation Council UK', role:'ABCDE assessment'}
  ],
  authorityRoles: [
    'Consultant Paramedic','Advanced Paramedic','Paramedic','Student Paramedic',
    'HART Advanced Paramedic','HART Paramedic','HEMS Doctor','HEMS Paramedic',
    'Consultant Doctor','Senior Doctor','Junior Doctor','Medical Student'
  ],
  sourceDocuments: [
    {title:'Stroke Roleplay Addendum — Real Doses, Observations & Playable Pathways', status:'supplied source material'},
    {title:'FiveM Stroke SOP — Field Response, Hospital Management, Rank Permissions & MDT', status:'supplied source material'},
    {title:'FiveM Stroke Guide — UK/NHS-Informed Roleplay Protocol', status:'supplied source material'}
  ],
  contentTypes: [
    'strokeTypes','strokeSymptoms','strokeObservations','strokePathways',
    'strokeMedications','strokePermissions','strokeEquipment','strokeScenarios',
    'strokeMeActions','strokeDoActions','strokeMDTRoles','strokeReferences',
    'strokeMedicationPrepActions'
  ],
  medicationPrepActions: {
    packageOpening: [
      'Confirm authorisation, indication, medication name, strength, expiry and packaging integrity.',
      'Open sealed packaging using the appropriate technique and keep medication identity visible.',
      'Inspect ampoule/vial contents and packaging for damage, contamination or unexpected appearance.'
    ],
    doseDrawing: [
      'Confirm the authorised dose, concentration and route from the current medication record/protocol.',
      'Select suitable drawing-up equipment and maintain aseptic technique.',
      'Draw the verified volume, check syringe markings, remove visible air as appropriate and perform the final safety check.'
    ],
    administration: [
      'Confirm patient identity, allergies, indication, authorised dose and route.',
      'Administer using the configured route and appropriate technique while monitoring the patient.',
      'Reassess response/adverse effects and document medication, dose, route, time, clinician and outcome.'
    ]
  }
};

(function initialiseStrokeUI(){
  function activateStrokeTab(tab){
    var key = tab.getAttribute('data-stroke-tab');
    document.querySelectorAll('[data-stroke-tab]').forEach(function(btn){
      btn.classList.toggle('active', btn === tab);
      btn.setAttribute('aria-selected', btn === tab ? 'true' : 'false');
    });
    document.querySelectorAll('[data-stroke-panel]').forEach(function(panel){
      panel.classList.toggle('active', panel.getAttribute('data-stroke-panel') === key);
    });
  }
  document.addEventListener('click', function(event){
    var tab = event.target.closest && event.target.closest('[data-stroke-tab]');
    if(tab){ activateStrokeTab(tab); return; }
    var action = event.target.closest && event.target.closest('.stroke-rp-action');
    if(action){
      var text = action.getAttribute('data-rp') || '';
      if(text && typeof copyTextInline === 'function') copyTextInline(text);
    }
  });
})();

window.addEventListener('load', function(){ try{ refreshLearningBreadcrumbs(); }catch(e){ console.warn('Learning breadcrumbs unavailable',e); } });


/* =========================================================
   CLINICAL ASSESSMENT & DIAGNOSIS ENGINE
   Educational/FiveM RP reasoning aid. No definitive diagnosis.
========================================================= */
const diagnosisIncidentData = {
  rtc:{label:'RTC',group:'Trauma',questions:['Vehicle type','Approximate speed','Seat position','Seatbelt','Airbag deployment','Intrusion','Extrication','Ejection','Impact direction','Loss of consciousness','Head strike'],symptoms:['Pain','Bleeding','Shortness of breath','Dizziness','Loss of consciousness','Numbness / tingling','Reduced movement'],diff:['Head injury','Chest injury','Abdominal or pelvic injury','Spinal injury','Limb injury','Major haemorrhage']},
  'motorcycle-collision':{label:'Motorcycle Collision',group:'Trauma',questions:['Speed','Helmet use','Impact direction','Ejection','Sliding distance','Head strike','Loss of consciousness','Other vehicles'],symptoms:['Pain','Bleeding','Breathing difficulty','Headache','Numbness / tingling','Reduced movement'],diff:['Head injury','Chest trauma','Spinal injury','Limb injury','Major haemorrhage']},
  'pedestrian-collision':{label:'Pedestrian Collision',group:'Trauma',questions:['Vehicle speed','Impact direction','Ejection / secondary impact','Head strike','Loss of consciousness','Time since incident'],symptoms:['Pain','Bleeding','Breathing difficulty','Confusion','Limb weakness'],diff:['Head injury','Chest trauma','Abdominal/pelvic trauma','Spinal injury','Limb injury']},
  fall:{label:'Fall',group:'Trauma',questions:['Height','Landing position','Head strike','Loss of consciousness','Anticoagulants','Time since fall'],symptoms:['Headache','Neck/back pain','Pain','Weakness','Numbness','Dizziness'],diff:['Head injury','Spinal injury','Fracture','Soft tissue injury','Intracranial injury']},
  'crush-injury':{label:'Crush Injury',group:'Trauma',questions:['Body region trapped','Duration of entrapment','Force/mechanism','Bleeding','Extrication status','Time since injury'],symptoms:['Severe pain','Swelling','Numbness','Reduced movement','Weakness'],diff:['Major haemorrhage','Limb injury','Compartment-related concern','Crush-related systemic deterioration']},
  'stab-wound':{label:'Stab Wound',group:'Trauma',questions:['Number of wounds','Body region','Bleeding','Depth if known','Object retained','Time since injury'],symptoms:['Pain','Bleeding','Shortness of breath','Abdominal pain','Weakness','Collapse'],diff:['Penetrating trauma','Major haemorrhage','Chest injury','Abdominal injury','Vascular injury']},
  'gunshot-injury':{label:'Gunshot Injury',group:'Trauma',questions:['Number of wounds','Entry wounds','Exit wounds','Body regions','Bleeding','Loss of consciousness','Respiratory symptoms','Neurological symptoms'],symptoms:['Pain','Bleeding','Shortness of breath','Weakness','Numbness','Collapse'],diff:['Significant penetrating trauma','Major haemorrhage','Chest injury','Abdominal/pelvic injury','Neurological injury']},
  'assault':{label:'Assault',group:'Trauma',questions:['Mechanism','Weapons involved','Head strike','Loss of consciousness','Number of assailants','Time since incident'],symptoms:['Pain','Bleeding','Headache','Confusion','Breathing difficulty','Numbness'],diff:['Head injury','Soft tissue injury','Fracture','Penetrating trauma','Psychological distress']},
  'animal-attack':{label:'Animal Attack',group:'Trauma',questions:['Animal','Bite/scratch','Location','Depth','Bleeding','Contamination','Time since injury','Tetanus status','Exposure/travel context'],symptoms:['Pain','Bleeding','Swelling','Reduced movement','Numbness','Fever'],diff:['Bite/laceration injury','Neurovascular injury','Infection risk','Tetanus-related concern','Exposure-related concern']},
  'industrial-accident':{label:'Industrial Accident',group:'Trauma',questions:['Mechanism','Machinery involved','Entrapment','Chemical/electrical exposure','Height','Protective equipment'],symptoms:['Pain','Burns','Bleeding','Breathing difficulty','Confusion','Weakness'],diff:['Trauma','Burns','Electrical/chemical injury','Inhalation injury','Major haemorrhage']},
  'head-injury':{label:'Head Injury',group:'Trauma',questions:['Mechanism','Head strike','Loss of consciousness','Amnesia','Anticoagulants','Vomiting','Seizure'],symptoms:['Headache','Vomiting','Confusion','Dizziness','Visual change','Weakness'],diff:['Head injury','Intracranial injury','Post-traumatic seizure','Cervical injury']},
  'spinal-injury':{label:'Spinal Injury',group:'Trauma',questions:['Mechanism','Neck/back pain','Neurological symptoms','Loss of consciousness','Movement after injury'],symptoms:['Neck pain','Back pain','Numbness','Weakness','Loss of sensation','Reduced movement'],diff:['Spinal injury','Cord-related neurological deficit','Musculoskeletal injury']},
  'limb-injury':{label:'Limb Injury',group:'Trauma',questions:['Limb','Mechanism','Open wound','Deformity','Time since injury'],symptoms:['Pain','Swelling','Bruising','Deformity','Reduced movement','Numbness'],diff:['Fracture','Dislocation','Soft tissue injury','Neurovascular injury']},
  'major-haemorrhage':{label:'Major Haemorrhage',group:'Trauma',questions:['Bleeding source','Visible blood loss','Mechanism','Anticoagulants','Tourniquet already applied'],symptoms:['Bleeding','Weakness','Dizziness','Collapse','Thirst'],diff:['Major haemorrhage','Occult bleeding','Traumatic injury','Shock']},
  burns:{label:'Burns',group:'Trauma',questions:['Mechanism','Burn source','Body surface area estimate','Depth if known','Inhalation exposure','Chemical/electrical exposure','Time since burn'],symptoms:['Pain','Blistering','Skin damage','Breathing difficulty','Hoarseness','Confusion'],diff:['Thermal burn','Inhalation injury','Chemical injury','Electrical injury','Associated trauma']},
  'chest-pain':{label:'Chest Pain',group:'Medical',questions:['Onset','Location','Radiation','Character','Severity','Duration','Exertional/rest','Associated symptoms','Previous cardiac history','Risk factors'],symptoms:['Central chest pressure','Radiating pain','Sweating','Nausea','Shortness of breath','Palpitations','Syncope'],diff:['Acute coronary syndrome','Pulmonary embolism','Aortic dissection','Pneumothorax','Pericarditis','Musculoskeletal pain']},
  stroke:{label:'Stroke',group:'Medical',questions:['Last known well','Symptom onset','FAST findings','Speech','Facial weakness','Arm weakness','Leg weakness','Visual symptoms','Gaze deviation','Neglect','Seizure','Glucose','Anticoagulants'],symptoms:['Facial weakness','Arm weakness','Leg weakness','Speech difficulty','Visual change','Gaze deviation','Neglect','Seizure','Headache','Confusion'],diff:['Acute stroke','Hypoglycaemia','Seizure/post-ictal deficit','Migraine','Other neurological causes']},
  seizure:{label:'Seizure',group:'Medical',questions:['Witnessed seizure','Duration','Recovery','Previous seizures','Medication adherence','Injury','Pregnancy where applicable'],symptoms:['Jerking movements','Loss of consciousness','Confusion','Tongue injury','Headache','Weakness'],diff:['Seizure','Syncope','Hypoglycaemia','Stroke/neurological event','Post-ictal state']},
  'shortness-of-breath':{label:'Shortness of Breath',group:'Medical',questions:['Onset','Duration','Trigger','Asthma/COPD history','Chest pain','Fever','Cough','Previous episodes'],symptoms:['Breathlessness','Wheeze','Cough','Sputum','Chest tightness','Stridor','Difficulty speaking'],diff:['Asthma','COPD exacerbation','Pneumonia','Pulmonary oedema','Pulmonary embolism','Pneumothorax','Anaphylaxis']},
  asthma:{label:'Asthma',group:'Medical',questions:['Known asthma','Trigger','Inhaler use','Previous severe attacks','Duration','Ability to speak'],symptoms:['Wheeze','Breathlessness','Chest tightness','Cough','Difficulty speaking'],diff:['Asthma exacerbation','Anaphylaxis','Pneumothorax','Pneumonia','Other respiratory causes']},
  'copd-exacerbation':{label:'COPD Exacerbation',group:'Medical',questions:['Known COPD','Usual oxygen/symptoms','Change in sputum','Infection symptoms','Previous admissions'],symptoms:['Breathlessness','Cough','Increased sputum','Wheeze','Fatigue'],diff:['COPD exacerbation','Pneumonia','Pulmonary oedema','Pulmonary embolism','Pneumothorax']},
  anaphylaxis:{label:'Anaphylaxis',group:'Medical',questions:['Likely trigger','Time of exposure','Previous reaction','Airway symptoms','Skin/mucosal symptoms','Asthma history'],symptoms:['Airway swelling','Wheeze','Breathlessness','Rash','Swelling','Collapse','Abdominal symptoms'],diff:['Anaphylaxis','Asthma','Allergic reaction without systemic compromise','Other causes of shock']},
  sepsis:{label:'Sepsis',group:'Medical',questions:['Suspected infection source','Onset','Fever/rigors','Recent infection','Recent surgery','Immunosuppression'],symptoms:['Fever','Confusion','Weakness','Breathlessness','Reduced urine','Pain'],diff:['Sepsis','Severe infection without sepsis','Dehydration','Other causes of physiological deterioration']},
  hypoglycaemia:{label:'Hypoglycaemia',group:'Medical',questions:['Diabetes','Diabetes medication','Food intake','Last glucose reading','Time of symptoms'],symptoms:['Sweating','Confusion','Weakness','Shaking','Reduced consciousness','Seizure'],diff:['Hypoglycaemia','Stroke mimic','Seizure','Intoxication/other altered consciousness']},
  hyperglycaemia:{label:'Hyperglycaemia',group:'Medical',questions:['Diabetes','Medication adherence','Fluid intake','Vomiting','Known DKA/HHS history'],symptoms:['Thirst','Polyuria','Weakness','Vomiting','Abdominal pain','Confusion'],diff:['Hyperglycaemia','DKA/HHS-type presentation','Dehydration','Other metabolic causes']},
  'abdominal-pain':{label:'Abdominal Pain',group:'Medical',questions:['Onset','Location','Character','Radiation','Vomiting','Bowel symptoms','Urinary symptoms','Pregnancy where applicable','Previous abdominal history'],symptoms:['Abdominal pain','Vomiting','Diarrhoea','Constipation','Fever','Bleeding','Collapse'],diff:['Gastrointestinal cause','Appendicitis-type presentation','Biliary/pancreatic cause','Renal/urinary cause','Gynaecological cause','Vascular/other emergency']},
  collapse:{label:'Collapse',group:'Medical',questions:['Witnessed/unwitnessed','Prodrome','Loss of consciousness','Recovery time','Exertional','Cardiac history','Medication'],symptoms:['Syncope','Dizziness','Palpitations','Chest pain','Weakness','Confusion'],diff:['Syncope','Cardiac cause','Seizure','Hypoglycaemia','Stroke/neurological event']},
  'reduced-consciousness':{label:'Reduced Consciousness',group:'Medical',questions:['Last known normal','Onset','Witnessed event','Diabetes','Medication/overdose concern','Trauma','Infection symptoms'],symptoms:['Reduced consciousness','Confusion','Seizure','Weakness','Vomiting','Fever'],diff:['Metabolic cause','Stroke/neurological event','Seizure/post-ictal state','Poisoning/overdose','Trauma','Infection/sepsis']},
  'poisoning-overdose':{label:'Poisoning / Overdose',group:'Medical',questions:['Substance','Amount if known','Time','Route','Co-ingestants','Packaging available','Intent/context'],symptoms:['Reduced consciousness','Vomiting','Confusion','Seizure','Breathing difficulty','Chest pain'],diff:['Poisoning/overdose','Mixed ingestion','Traumatic/medical cause','Metabolic cause']},
  'pregnancy':{label:'Pregnancy',group:'Other',questions:['Gestation','Parity','Onset','Bleeding','Pain','Fetal movement where applicable','Complications'],symptoms:['Abdominal pain','Bleeding','Dizziness','Headache','Reduced fetal movement','Contractions'],diff:['Pregnancy-related emergency','Obstetric bleeding','Hypertensive pregnancy complication','Non-obstetric cause']},
  'paediatric-emergency':{label:'Paediatric Emergency',group:'Other',questions:['Age','Weight','Carer history','Birth/medical history','Immunisations where relevant','Onset'],symptoms:['Breathing difficulty','Fever','Reduced consciousness','Pain','Rash','Vomiting'],diff:['Respiratory illness','Infection','Trauma','Metabolic cause','Other paediatric emergency']},
  'psychiatric-emergency':{label:'Psychiatric Emergency',group:'Other',questions:['Presenting concern','Risk to self/others','Substances','Known history','Support person','Immediate safety concerns'],symptoms:['Agitation','Confusion','Low mood','Distress','Perceptual disturbance','Suicidal thoughts'],diff:['Psychiatric presentation','Substance-related presentation','Delirium/medical cause','Neurological/metabolic cause']},
  'environmental-emergency':{label:'Environmental Emergency',group:'Other',questions:['Environment','Exposure duration','Temperature','Protective clothing','Associated trauma','Rescue circumstances'],symptoms:['Confusion','Weakness','Shivering','Heat symptoms','Breathing difficulty','Collapse'],diff:['Environmental illness','Trauma','Dehydration','Altered consciousness from another cause']},
  'unknown-medical':{label:'Unknown Medical Emergency',group:'Other',questions:['What happened?','Onset','Known conditions','Medication','Allergies','Recent illness','Witnessed events'],symptoms:['Pain','Breathlessness','Confusion','Weakness','Collapse','Fever'],diff:['Insufficient information','Medical emergency requiring focused assessment','Trauma or toxicological cause']},
  'multiple-patients':{label:'Multiple Patients',group:'Other',questions:['Number of patients','Scene hazards','Mechanism','Resources available','Casualty distribution'],symptoms:['Multiple presentations'],diff:['Multiple-casualty incident','Trauma','Medical emergency','Environmental/scene hazard']}
};
const diagnosisIncidentOrder = Object.keys(diagnosisIncidentData);
const diagnosisSteps = ['incident','patient','symptoms','body','observations','abcde','assessment','reasoning','treatment','reassessment','handover'];
const diagnosisState = {step:0,incident:null,data:{},performed:{},mode:'learning',role:'paramedic',example:false};

const diagnosisMedicationData={"schema_version":"1.0.0","rp_only":true,"age_group":"16+","global_warning":"REAL MEDICATION INFORMATION — FIVEM ROLE-PLAY ONLY. This content is fictionalised for FiveM gameplay and must not be used to diagnose or treat a real person. In a real emergency, call 999 or 112.","administration_requirements":["Confirm the patient's age group is 16 years or older.","Confirm allergy status before administration.","Record relevant observations before administration.","Check consciousness, respiratory rate, oxygen saturation and blood pressure.","Check pregnancy status where relevant.","Check relevant renal and hepatic history.","Check which medicines have already been administered.","Record medication name, dose, route, time, staff member and response.","Repeat observations after administration.","High-risk medicines require senior RP clinician authorisation."],"medications":[{"id":"morphine-sulfate-iv-adult","generic_name":"Morphine sulfate","display_name":"Morphine sulfate injection","category":"Analgesia","routes":["intravenous"],"concentration_examples":["1 mg/mL solution for injection"],"indications":["Moderate to severe traumatic pain","Severe acute pain where opioid analgesia is appropriate"],"adult_dose":{"initial":"1-10 mg IV","administration":"Give slowly over 4-5 minutes","maximum_initial_loading_dose":"15 mg","repeat":"Only after reassessment and according to the authorised pathway or local RP protocol","dose_adjustment":"Use a reduced dose in older, frail or opioid-sensitive patients"},"rp_display_dose":"1-10 mg IV slowly over 4-5 minutes; maximum initial loading dose 15 mg. RP-ONLY DOSE.","do_not_give_if":["Respiratory depression","Coma or markedly reduced consciousness","Known morphine or opioid hypersensitivity","Acute severe asthma or severe obstructive airway disease","Acute alcoholism or significant alcohol intoxication","Suspected raised intracranial pressure or serious head injury without senior authorisation","Moderate to severe renal impairment","Severe or acute liver failure","Recent monoamine oxidase inhibitor use","Severe uncontrolled hypotension or shock without senior authorisation"],"cautions":["Older age","Frailty","Hypotension","Shock","Pregnancy","Breastfeeding","Concurrent alcohol use","Concurrent benzodiazepines or sedatives","Concurrent central nervous system depressants","Previous opioid dependence or opioid tolerance"],"required_pre_administration_checks":["Respiratory rate","Oxygen saturation","Blood pressure","Heart rate","Consciousness or sedation level","Pain score","Allergy status","Recent opioid or sedative administration"],"monitoring_after_administration":["Respiratory rate","Oxygen saturation","Consciousness or sedation level","Blood pressure","Heart rate","Pain score","Nausea or vomiting"],"important_adverse_effects":["Respiratory depression","Drowsiness","Reduced consciousness","Hypotension","Nausea","Vomiting","Confusion","Pruritus","Urinary retention","Constipation"],"important_interactions":["Alcohol","Benzodiazepines","Sedatives","Anaesthetic agents","Other opioids","Other central nervous system depressants","Monoamine oxidase inhibitors"],"overdose_trigger":{"if":["Respiratory rate below 10/min","Falling oxygen saturation","Marked sedation","Loss of airway protection","Pinpoint pupils with respiratory depression"],"action":["Block further opioid administration.","Escalate immediately to the senior RP clinician.","Start the opioid toxicity pathway.","Consider naloxone according to the naloxone medication entry.","Repeat airway and breathing assessment."]},"senior_authorisation_required":true,"rp_only":true,"source":{"title":"Morphine sulfate 1 mg in 1 mL solution for injection — MHRA Summary of Product Characteristics","url":"https://mhraproducts4853.blob.core.windows.net/docs/4bae43d632c68ff32aa2f8ad18092dbd4b119716"},"last_reviewed":"2025-02-01"},{"id":"tranexamic-acid-iv-trauma-adult","generic_name":"Tranexamic acid","display_name":"Tranexamic acid injection","category":"Haemorrhage control","routes":["intravenous"],"concentration_examples":["100 mg/mL solution for injection","500 mg/5 mL solution for injection"],"indications":["Major trauma with active bleeding","Major trauma with suspected significant haemorrhage","Major trauma with a high risk of significant haemorrhage"],"adult_dose":{"loading_dose":"1 g IV","loading_administration":"Give over 10 minutes","maintenance_dose":"1 g IV infusion over 8 hours","time_limit":"Give as soon as possible and normally within 3 hours of injury"},"rp_display_dose":"1 g IV over 10 minutes, followed by 1 g IV infusion over 8 hours. RP-ONLY DOSE.","do_not_give_if":["More than 3 hours since injury unless a senior clinician documents a specific reason","Known hypersensitivity to tranexamic acid","Acute venous thrombosis","Acute arterial thrombosis","History of seizures unless specifically authorised","Severe renal impairment without an approved renal-adjusted protocol"],"cautions":["History of seizures","Severe renal impairment","Known thromboembolic disease","Suspected disseminated intravascular coagulation","Uncertainty about the time of injury"],"required_pre_administration_checks":["Time of injury","Evidence of active or suspected major bleeding","Known thrombosis","History of seizures","Renal history","Allergy status"],"monitoring_after_administration":["Ongoing external bleeding","Heart rate","Blood pressure","Mental state","Response to haemorrhage control","Evidence of deterioration"],"important_adverse_effects":["Nausea","Vomiting","Hypotension if administered too rapidly","Seizures","Thromboembolic complications","Hypersensitivity reaction"],"important_interactions":["Other antifibrinolytic medicines","Medicines increasing thrombotic risk"],"administration_warning":"Do not administer rapidly as an undiluted IV bolus in the RP system. Record the start and completion time of the infusion.","senior_authorisation_required":true,"rp_only":true,"source":{"title":"NICE: Major trauma: assessment and initial management","url":"https://www.nice.org.uk/guidance/ng39/chapter/recommendations"},"dose_source":{"title":"NICE evidence review: tranexamic acid in major trauma","url":"https://www.nice.org.uk/guidance/ng39/evidence/full-guideline-pdf-2308122833"},"last_reviewed":"2025-02-01"},{"id":"naloxone-iv-opioid-toxicity-adult","generic_name":"Naloxone hydrochloride","display_name":"Naloxone injection","category":"Antidote","routes":["intravenous","intramuscular","intraosseous"],"concentration_examples":["400 micrograms/mL solution for injection or infusion"],"indications":["Suspected opioid toxicity with respiratory depression","Suspected opioid overdose with inadequate airway protection","Opioid-induced respiratory depression"],"adult_dose":{"initial_iv_or_io":"100-400 micrograms IV or IO","repeat":"Repeat small doses every 60 seconds according to response","severe_toxicity":"Larger cumulative doses may be required in severe toxicity or potent-opioid exposure","intramuscular":"400 micrograms IM when IV or IO access is unavailable","infusion":"Requires senior clinician authorisation and an appropriate infusion protocol"},"rp_display_dose":"For opioid-related respiratory depression, give 100-400 micrograms IV/IO and titrate to adequate breathing. Repeat according to the overdose pathway. RP-ONLY DOSE.","treatment_goal":"Restore adequate respiratory effort and airway protection, not necessarily complete reversal of unconsciousness or analgesia.","do_not_give_if":["No evidence of opioid toxicity","Normal breathing with no respiratory compromise","Known hypersensitivity unless the patient is in a life-threatening opioid emergency"],"cautions":["Long-acting opioids","Methadone exposure","Potent synthetic opioid exposure","Opioid dependence","Mixed overdose","Stimulant co-use","Risk of acute opioid withdrawal","Pulmonary oedema after reversal"],"required_pre_administration_checks":["Respiratory rate","Oxygen saturation","Consciousness","Pupil findings","Evidence of opioid exposure","Blood glucose where appropriate","Consideration of alternative diagnoses"],"monitoring_after_administration":["Respiratory rate","Oxygen saturation","Consciousness","Airway protection","Heart rate","Blood pressure","Agitation or acute withdrawal","Recurrence of respiratory depression"],"important_adverse_effects":["Acute opioid withdrawal","Agitation","Pain crisis","Nausea","Vomiting","Tachycardia","Hypertension","Pulmonary oedema","Seizures in complex or mixed toxicity"],"important_interactions":["Reverses the effects of opioid medicines","May precipitate acute withdrawal in opioid-dependent patients"],"observation_requirement":["Continue close monitoring after the last naloxone dose.","The observation period must be longer for long-acting opioids or recurrent respiratory depression.","Escalate if repeated boluses are required."],"senior_authorisation_required":true,"rp_only":true,"source":{"title":"NHS Specialist Pharmacy Service: Reversing an adult opioid overdose with naloxone","url":"https://www.sps.nhs.uk/articles/reversing-an-adult-opioid-overdose-with-naloxone/"},"product_source":{"title":"Naloxone 400 micrograms/mL solution for injection or infusion — MHRA Summary of Product Characteristics","url":"https://mhraproducts4853.blob.core.windows.net/docs/03256f422edd052a167aedf9046e55f28f685c6c"},"last_reviewed":"2025-02-01"}]};
function diagnosisEscape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function diagnosisSave(){try{localStorage.setItem('uhsDiagnosisCase',JSON.stringify(diagnosisState));document.getElementById('diagnosis-save-state').textContent='Saved locally';}catch(e){}}
function diagnosisLoad(){try{const x=JSON.parse(localStorage.getItem('uhsDiagnosisCase'));if(x&&x.data){Object.assign(diagnosisState,x);return true;}}catch(e){}return false;}
function diagnosisNewCase(){diagnosisState.step=0;diagnosisState.incident=null;diagnosisState.data={};diagnosisState.performed={};diagnosisState.mode='learning';diagnosisState.role='paramedic';diagnosisState.example=false;diagnosisRender();}
function diagnosisLoadExample(){diagnosisNewCase();diagnosisState.incident='stroke';diagnosisState.data={age:'67',sex:'Unknown',weight:'Unknown',lastKnownWell:'10:15',symptoms:['Facial weakness','Arm weakness','Speech difficulty'],HR:'88',BP:'156/88',RR:'18',SpO2:'97',glucose:'6.4',GCS:'14',AVPU:'Alert',pain:'0',abcde:{A:'Patent; speaking',B:'No obvious respiratory distress',C:'Pulse and BP recorded',D:'Focal neurological deficit present',E:'No additional injury identified'},body:['Face','Right arm']};diagnosisState.example=true;diagnosisState.step=6;diagnosisRender();}
function diagnosisHowItWorks(){alert('Choose an incident, record what is actually known, complete observations and ABCDE, then review the clinical reasoning guide. Results are possible clinical considerations—not definitive diagnoses. Actions are only marked performed when you select them.');}

function diagnosisShowPathways(){
 const box=document.getElementById('diagnosis-pathway-library'); if(!box)return;
 box.hidden=false;
 box.innerHTML=`<div class="diagnosis-library-head"><div><div class="diagnosis-kicker">REFERENCE · PRACTISE</div><h2>Clinical Pathway Library</h2><p>Role-play learning pathways. These are fictionalised simulation resources and are not real-world clinical advice.</p></div><button class="secondary" onclick="document.getElementById('diagnosis-pathway-library').hidden=true">Close</button></div>
 <div class="diagnosis-library-controls"><input id="diagnosis-pathway-search" placeholder="Search incident, symptom or diagnosis…" oninput="diagnosisFilterPathways()"><select id="diagnosis-pathway-severity" onchange="diagnosisFilterPathways()"><option value="">All severities</option><option>Minor</option><option>Moderate</option><option>Serious</option><option>Critical</option></select></div>
 <div id="diagnosis-pathway-results" class="diagnosis-pathway-grid"></div>`;
 diagnosisFilterPathways();
 box.scrollIntoView({behavior:'smooth',block:'start'});
}
function diagnosisValueArray(value){
 if(Array.isArray(value)) return value;
 if(value==null) return [];
 if(typeof value==='object') return Object.entries(value).flatMap(([k,v])=>{
   if(Array.isArray(v)) return [`${k.replace(/_/g,' ')}:`,...v];
   if(v&&typeof v==='object') return [`${k.replace(/_/g,' ')}:`,...diagnosisValueArray(v)];
   return [`${k.replace(/_/g,' ')}: ${v}`];
 });
 return [String(value)];
}
function diagnosisSeverityList(p){
 const v=p?.severity;
 return Array.isArray(v)?v.map(String):v?[String(v)]:[];
}
function diagnosisSeverityLabel(p){
 const vals=diagnosisSeverityList(p);
 return vals.length?vals.map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' / '):'Reference';
}
function diagnosisSeverityMatches(p,sev){
 return !sev || diagnosisSeverityList(p).some(x=>x.toLowerCase()===sev.toLowerCase());
}
function diagnosisTextList(value){
 const rows=diagnosisValueArray(value);
 return rows.length?`<ul>${rows.map(x=>`<li>${diagnosisEscape(x)}</li>`).join('')}</ul>`:'<p class="diagnosis-muted">No entries supplied.</p>';
}
function diagnosisObjectSections(value){
 if(!value||typeof value!=='object'||Array.isArray(value)) return diagnosisTextList(value);
 return Object.entries(value).map(([k,v])=>{
   if(v&&typeof v==='object'&&!Array.isArray(v)){
     return `<div class="pathway-sub"><strong>${diagnosisEscape(k.replace(/_/g,' '))}</strong>${Object.entries(v).map(([sk,sv])=>`<div><strong>${diagnosisEscape(sk.replace(/_/g,' '))}</strong>${diagnosisTextList(sv)}</div>`).join('')}</div>`;
   }
   return `<div class="pathway-sub"><strong>${diagnosisEscape(k.replace(/_/g,' '))}</strong>${diagnosisTextList(v)}</div>`;
 }).join('');
}
function diagnosisHandoverHtml(h){
 if(!h) return '<p>No handover template supplied.</p>';
 if(typeof h==='string') return `<pre>${diagnosisEscape(h)}</pre>`;
 return Object.entries(h).map(([k,v])=>`<div class="pathway-sub"><strong>${diagnosisEscape(k.replace(/_/g,' '))}</strong><pre>${diagnosisEscape(typeof v==='string'?v:JSON.stringify(v,null,2))}</pre></div>`).join('');
}
function diagnosisExampleHtml(c){
 const obs=c.observations&&typeof c.observations==='object'
   ? `<div class="pathway-example-observations">${Object.entries(c.observations).map(([k,v])=>`<span><strong>${diagnosisEscape(k.replace(/_/g,' '))}</strong> ${diagnosisEscape(v)}</span>`).join('')}</div>`:'';
 return `<div class="diagnosis-example-case"><strong>${diagnosisEscape(c.severity||c.id||'RP example')}</strong><p>${diagnosisEscape(c.description||'')}</p>${obs}<p><strong>Likely diagnosis:</strong> ${diagnosisEscape(c.likely_diagnosis||'Further assessment required.')}</p>${diagnosisTextList(c.red_flags)}</div>`;
}

function diagnosisSimulationMarkdownHtml(markdown){
 const lines=String(markdown||'').replace(/\r\n?/g,'\n').split('\n');
 const out=[];
 let listOpen=false, inFence=false;
 const closeList=()=>{if(listOpen){out.push('</ul>');listOpen=false;}};
 const inline=(value)=>{
   let x=diagnosisEscape(value);
   x=x.replace(/\\>$/,'>');
   x=x.replace(/\\$/,'');
   x=x.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
   x=x.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
   return x;
 };
 for(let raw of lines){
   let line=raw.trim();
   if(line==='```'){
     closeList();
     if(inFence){ out.push('</div>'); inFence=false; }
     else { out.push('<div class="simulation-code-block">'); inFence=true; }
     continue;
   }
   if(inFence){
     if(/^\/me\b|^\/do\b/.test(line)){
       out.push(`<div class="simulation-action"><code>${inline(line)}</code></div>`);
     } else if(line){
       out.push(`<div class="simulation-code-line"><code>${inline(line)}</code></div>`);
     } else {
       out.push('<div class="simulation-code-gap"></div>');
     }
     continue;
   }
   if(!line){closeList();continue;}
   if(line==='---'){closeList();out.push('<hr>');continue;}
   if(/^#{1,6}\s+/.test(line)){
     closeList();
     const level=(line.match(/^#+/)||['#'])[0].length;
     const text=line.replace(/^#{1,6}\s+/,'');
     const tag=level<=2?'h3':'h4';
     out.push(`<${tag}>${inline(text)}</${tag}>`);
     continue;
   }
   if(/^[-*]\s+/.test(line)){
     if(!listOpen){out.push('<ul>');listOpen=true;}
     out.push(`<li>${inline(line.replace(/^[-*]\s+/,''))}</li>`);
     continue;
   }
   let content=line;
   if(/^\\?>\s?/.test(content)){
     closeList();
     content=content.replace(/^\\?>\s?/,'');
     out.push(`<blockquote>${inline(content)}</blockquote>`);
     continue;
   }
   if(/^>\s?/.test(content)){
     closeList();
     content=content.replace(/^>\s?/,'');
     out.push(`<blockquote>${inline(content)}</blockquote>`);
     continue;
   }
   closeList();
   out.push(`<p>${inline(content)}</p>`);
 }
 closeList();
 if(inFence) out.push('</div>');
 return out.join('');
}

function diagnosisPathwaySearchText(p){
 return diagnosisValueArray([
   p.title,p.short_title,p.category,p.severity,p.incident_description,
   p.differentials,p.differential_diagnoses,p.focused_examination,p.scene_safety,
   p.mechanism,p.mechanism_questions,p.initial_impression,p.escalation_criteria,
   p.simulation_markdown
 ]).join(' ').toLowerCase();
}
function diagnosisFilterPathways(targetId='diagnosis-pathway-results'){
 const q=(document.getElementById('diagnosis-pathway-search')?.value||'').toLowerCase();
 const sev=(document.getElementById('diagnosis-pathway-severity')?.value||'');
 const out=document.getElementById(targetId); if(!out)return;
 const rows=Object.values(diagnosisPathways).filter(p=>diagnosisPathwaySearchText(p).includes(q)&&diagnosisSeverityMatches(p,sev));
 out.innerHTML=rows.length?rows.map(p=>diagnosisPathwayCard(p)).join(''):'<div class="diagnosis-empty">No pathway matches that search.</div>';
}
function diagnosisPathwayCard(p){
 const diagnosis=p.rp_diagnosis?.[0]||p.likely_rp_diagnoses?.moderate?.[0]||p.likely_rp_diagnoses?.serious?.[0]||'Further assessment required.';
 const pid=diagnosisEscape(p.id);
 return `<article class="diagnosis-pathway-card">
   <div class="diagnosis-pathway-top"><span class="diagnosis-pathway-category">${diagnosisEscape(p.category||'Clinical')}</span><span class="diagnosis-severity">${diagnosisEscape(diagnosisSeverityLabel(p))}</span></div>
   <h3>${diagnosisEscape(p.title)}</h3><p>${diagnosisEscape(p.incident_description||diagnosis)}</p>
   <div class="diagnosis-pathway-actions"><button class="secondary" onclick="openPathwayPage('${pid}')">Open pathway</button><button class="secondary" onclick="diagnosisUsePathway('${pid}')">Use in assessment</button></div>
 </article>`;
}

function getDiagnosisPathway(id){
 const direct=diagnosisPathways[id];
 if(direct) return {key:id,pathway:direct};
 const found=Object.entries(diagnosisPathways).find(([key,p])=>p?.id===id);
 return found ? {key:found[0],pathway:found[1]} : null;
}
function diagnosisOpenPathway(id){
 const resolved=getDiagnosisPathway(id);
 const p=resolved?.pathway; if(!p)return;
 const pathwayId=p.id||resolved.key||id;
 const el=document.getElementById('pathway-detail-'+pathwayId); if(!el)return;
 el.hidden=!el.hidden; if(el.hidden)return;
 const scene=p.scene_safety||[];
 const mechanism=p.mechanism||p.mechanism_questions||[];
 const differentials=p.differentials||p.differential_diagnoses||[];
 const management=p.management||p.immediate_management||[];
 const reassessment=p.reassessment||[];
 const docs=p.documentation||[];
 const escalation=p.escalation_criteria||[];
 const focused=p.focused_examination||[];
 const likely=p.rp_diagnosis||p.likely_rp_diagnoses||[];
 const examples=p.example_cases||[];
 const simulation=Array.isArray(p.simulation_sequence)?p.simulation_sequence:[];
 if(p.full_markdown_guide && p.simulation_markdown){
   el.innerHTML=`<div class="diagnosis-pathway-disclaimer">${diagnosisEscape(p.disclaimer||'FOR ROLE-PLAY ONLY.')}</div><div class="diagnosis-simulation-document diagnosis-full-markdown-guide">${diagnosisSimulationMarkdownHtml(p.simulation_markdown)}</div>`;
   return;
 }
 const sections=[
  ['1 · Scene & mechanism',`<strong>Scene safety</strong>${diagnosisTextList(scene)}<strong>Mechanism / context</strong>${diagnosisTextList(mechanism)}${p.initial_impression?`<strong>Initial impression</strong>${diagnosisTextList(p.initial_impression)}`:''}`],
  ['2 · Primary survey',diagnosisObjectSections(p.primary_survey)],
  ['3 · Observations & focused examination',`<strong>Observations</strong>${diagnosisObjectSections(p.observations)}<strong>Focused examination</strong>${diagnosisObjectSections(focused)}`],
  ['4 · Diagnostic reasoning',`<strong>Possible considerations</strong>${diagnosisTextList(differentials)}<strong>Likely RP diagnoses</strong>${diagnosisObjectSections(likely)}`],
  ['5 · Management & escalation',`<strong>Immediate management</strong>${diagnosisTextList(management)}<strong>Escalate for</strong>${diagnosisTextList(escalation)}<strong>Disposition</strong>${diagnosisObjectSections(p.disposition)}`],
  ['5a · Complete simulation',p.simulation_markdown?`<div class="diagnosis-simulation-document">${diagnosisSimulationMarkdownHtml(p.simulation_markdown)}</div>`:(simulation.length?`<ol class="diagnosis-simulation-sequence">${simulation.map(x=>`<li>${diagnosisEscape(x)}</li>`).join('')}</ol>`:'<p>No simulation sequence supplied.</p>')],
  ['6 · Reassessment',diagnosisObjectSections(reassessment)],
  ['7 · Handover & documentation',diagnosisHandoverHtml(p.handover)+`<strong>Documentation</strong>${diagnosisTextList(docs)}`],
  ['8 · Medication / equipment reference',diagnosisMedicationRefHtml(p)+`<p>Use the existing UHS equipment reference and server-authorised RP procedures.</p>`],
  ['9 · Example RP cases',examples.length?examples.map(diagnosisExampleHtml).join(''):'<p>No example cases supplied.</p>']
 ];
 el.innerHTML=`<div class="diagnosis-pathway-disclaimer">FOR ROLE-PLAY ONLY. This pathway is fictionalised for FiveM gameplay and is not real-world medical advice. Adult scope: 16+.</div>${sections.map(([title,body])=>`<section class="diagnosis-pathway-section"><h4>${diagnosisEscape(title)}</h4>${body}</section>`).join('')}`;
}
function focusPathwayGuide(id){
 const resolved=getDiagnosisPathway(id);
 if(resolved?.pathway){ openPathwayPage(id); return; }
 const root=document.getElementById('pathways-library');
 if(!root){showSection('pathways'); return;}
}

function pathwayPageButton(id,label,active){
 return `<button type="button" class="pathway-page-tab${active?' active':''}" onclick="openPathwayHospitalTab('${diagnosisEscape(id)}','${diagnosisEscape(label)}')">${diagnosisEscape(label)}</button>`;
}
function openPathwayHospitalTab(id,tab){
 const resolved=getDiagnosisPathway(id), p=resolved?.pathway;
 if(!p)return;
 openPathwayPage(id,'Hospital Staff Guide',tab);
}
function pathwayPageSection(title,body){
 return `<section class="pathway-page-section"><h3>${diagnosisEscape(title)}</h3>${body||'<p class="pathway-empty">No pathway-specific content supplied.</p>'}</section>`;
}
function pathwaySafeArray(v){ return Array.isArray(v)?v:(v==null?[]:[v]); }

function renderPathwayMarkdownTab(markdown){
  if(!markdown) return '<p class="pathway-empty">No pathway-specific content supplied.</p>';
  return `<div class="diagnosis-simulation-document pathway-tab-markdown">${diagnosisSimulationMarkdownHtml(markdown)}</div>`;
}
function renderPathwayTabContent(p,key,fallback=''){
  const content=p.tab_content && p.tab_content[key];
  return renderPathwayMarkdownTab(content || fallback);
}

function renderPathwayOverview(p){
 const tab=p.tab_content?.overview;
 if(tab) return renderPathwayMarkdownTab(tab);
 const summary=p.incident_description||p.short_title||'Clinical pathway guide.';
 const severity=diagnosisSeverityLabel(p);
 const differentials=p.differentials||p.differential_diagnoses||[];
 return `
 <div class="pathway-page-hero"><div><div class="eyebrow">${diagnosisEscape(p.category||'CLINICAL PATHWAY')}</div><h1>${diagnosisEscape(p.title)}</h1><p>${diagnosisEscape(summary)}</p></div><span class="diagnosis-severity">${diagnosisEscape(severity)}</span></div>
 ${pathwayPageSection('At a glance',`<div class="pathway-info-grid"><div><strong>Category</strong><span>${diagnosisEscape(p.category||'Clinical')}</span></div><div><strong>Severity</strong><span>${diagnosisEscape(severity)}</span></div><div><strong>Scope</strong><span>FiveM RP learning guide</span></div></div>`)}
 ${pathwayPageSection('Purpose',`<p>${diagnosisEscape(p.disclaimer||'This pathway is fictionalised for FiveM role-play and is not real-world medical advice. Follow your server-authorised procedures, medications and doses.')}</p>`)}
 ${differentials.length?pathwayPageSection('Clinical considerations',diagnosisTextList(differentials)):''}`;
}

function renderPathwayAbout(p){
 const tab=p.tab_content?.about;
 if(tab) return renderPathwayMarkdownTab(tab);
 const scene=p.scene_safety||[], mechanism=p.mechanism||p.mechanism_questions||[], impression=p.initial_impression;
 return `
 ${pathwayPageSection('About this pathway',`<p>${diagnosisEscape(p.about||p.incident_description||'This page contains the pathway-specific learning material available in the library.')}</p>`)}
 ${scene.length?pathwayPageSection('Scene & context',diagnosisTextList(scene)):''}
 ${mechanism.length?pathwayPageSection('Mechanism / presentation',diagnosisTextList(mechanism)):''}
 ${impression?pathwayPageSection('Initial impression',diagnosisTextList(impression)):''}
 ${p.simulation_markdown?pathwayPageSection('Simulation resource',`<div class="diagnosis-simulation-document">${diagnosisSimulationMarkdownHtml(p.simulation_markdown)}</div>`):''}`;
}

function renderParamedicGuide(p){
 const tab=p.tab_content?.paramedic;
 if(tab) return renderPathwayMarkdownTab(tab);
 const primary=p.primary_survey, focused=p.focused_examination||[], management=p.management||p.immediate_management||[], escalation=p.escalation_criteria||[], reassessment=p.reassessment||[], disposition=p.disposition;
 const simulation=p.simulation_markdown;
 return `
 ${pathwayPageSection('Primary survey',diagnosisObjectSections(primary))}
 ${focused.length?pathwayPageSection('Focused examination',diagnosisObjectSections(focused)):''}
 ${management.length?pathwayPageSection('Management',diagnosisTextList(management)):''}
 ${escalation.length?pathwayPageSection('Escalation',diagnosisTextList(escalation)):''}
 ${disposition?pathwayPageSection('Disposition',diagnosisObjectSections(disposition)):''}
 ${reassessment.length?pathwayPageSection('Reassessment',diagnosisObjectSections(reassessment)):''}
 ${simulation?pathwayPageSection('Complete simulation',`<div class="diagnosis-simulation-document">${diagnosisSimulationMarkdownHtml(simulation)}</div>`):''}`;
}

function renderHospitalWard(p){
 const tab=p.tab_content?.hospital_ward;
 if(tab) return renderPathwayMarkdownTab(tab);
 const observations=p.observations, reassessment=p.reassessment||[], handover=p.handover, docs=p.documentation||[], management=p.management||p.immediate_management||[];
 return `
 ${pathwayPageSection('On Ward',`<p>Ward-facing pathway material supplied for this guide.</p>`)}
 ${observations?pathwayPageSection('Observations & monitoring',diagnosisObjectSections(observations)):''}
 ${reassessment.length?pathwayPageSection('Reassessment',diagnosisObjectSections(reassessment)):''}
 ${management.length?pathwayPageSection('Ongoing management',diagnosisTextList(management)):''}
 ${handover?pathwayPageSection('Handover',diagnosisHandoverHtml(handover)):''}
 ${docs.length?pathwayPageSection('Documentation',diagnosisTextList(docs)):''}`;
}

function renderHospitalSurgery(p){
 const tab=p.tab_content?.hospital_surgery;
 if(tab) return renderPathwayMarkdownTab(tab);
 const candidates=[p.surgery,p.in_surgery,p.surgical_management,p.operation,p.operating_theatre,p.theatre,p.surgical_plan].filter(Boolean);
 return `
 ${pathwayPageSection('In Surgery',candidates.length?diagnosisObjectSections(candidates.length===1?candidates[0]:{pathway_specific_surgical_content:candidates}):'<p class="pathway-empty">No pathway-specific surgery content has been supplied for this guide.</p>')}
 <div class="pathway-rp-notice"><strong>RP scope:</strong> Use only surgical actions, equipment, medication and doses authorised by your server.</div>`;
}

function openPathwayPage(id,tab='Overview',hospitalTab='On Ward',pushHistory=true){
 const resolved=getDiagnosisPathway(id), p=resolved?.pathway;
 if(!p)return;
 const root=document.getElementById('pathways-library');
 if(!root)return;
 const tabs=['Overview','About','Paramedic Side guide','Hospital Staff Guide'];
 const active=tabs.includes(tab)?tab:'Overview';
 const hospitalActive=(hospitalTab==='In Surgery')?'In Surgery':'On Ward';
 let body='';
 if(active==='Overview') body=renderPathwayOverview(p);
 else if(active==='About') body=renderPathwayAbout(p);
 else if(active==='Paramedic Side guide') body=renderParamedicGuide(p);
 else body=`<div class="pathway-hospital-intro"><h2>Hospital Staff Guide</h2><p>Use the nested tabs to view the ward and surgical role-play guidance for this pathway.</p></div><div class="pathway-nested-tabs">${pathwayPageButton(p.id,'On Ward',hospitalActive==='On Ward')}${pathwayPageButton(p.id,'In Surgery',hospitalActive==='In Surgery')}</div>${hospitalActive==='In Surgery'?renderHospitalSurgery(p):renderHospitalWard(p)}`;
 root.innerHTML=`<div class="pathway-page">
   <div class="pathway-page-topbar"><button type="button" class="secondary" onclick="renderPathwaysLibrary()">← Back to pathway library</button><span class="pathway-page-kicker">PATHWAY GUIDE</span></div>
   <div class="pathway-page-tabs" role="tablist">
    ${tabs.map(t=>`<button type="button" class="pathway-page-tab${active===t?' active':''}" role="tab" aria-selected="${active===t}" onclick="openPathwayPage('${diagnosisEscape(p.id)}','${diagnosisEscape(t)}')">${diagnosisEscape(t)}</button>`).join('')}
   </div>
   <div class="pathway-page-content">${body}</div>
 </div>`;
 if(pushHistory){try{history.pushState({pathwayId:p.id,tab:active,hospitalTab:hospitalActive},'',`#pathway-${encodeURIComponent(p.id)}`);}catch(e){}}
 root.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPathwaysLibrary(){
 const root=document.getElementById('pathways-library');
 if(!root)return;
 try {
  window.uhsPathwayRegistry = diagnosisPathways;
 } catch(e) {
  root.innerHTML='<div class="diagnosis-empty">The pathway library could not be loaded.</div>';
  console.error('Pathway library registry error',e);
  return;
 }
 if(!root)return;
 const cats=[...new Set(Object.values(diagnosisPathways).map(p=>p.category||'Clinical'))].sort();
 root.innerHTML=`<div class="pathway-library-toolbar"><div class="pathway-library-toolbar-title"><strong>Complete pathway library</strong><span>${Object.keys(diagnosisPathways).length} pathways</span></div><input id="pathways-library-search" type="search" placeholder="Search all pathway guides…" aria-label="Search all pathway guides"><select id="pathways-library-category" aria-label="Filter pathway category"><option value="">All categories</option>${cats.map(c=>`<option>${diagnosisEscape(c)}</option>`).join('')}</select><select id="pathways-library-severity" aria-label="Filter pathway severity"><option value="">All severities</option><option>Minor</option><option>Moderate</option><option>Serious</option><option>Critical</option></select></div><div id="pathways-library-results" class="diagnosis-pathway-grid"></div>`;
 const render=()=>{
   const q=(document.getElementById('pathways-library-search')?.value||'').toLowerCase();
   const cat=document.getElementById('pathways-library-category')?.value||'';
   const sev=document.getElementById('pathways-library-severity')?.value||'';
   const out=document.getElementById('pathways-library-results');
   const rows=Object.values(diagnosisPathways).filter(p=>(!q||diagnosisPathwaySearchText(p).includes(q))&&(!cat||p.category===cat)&&diagnosisSeverityMatches(p,sev));
   out.innerHTML=rows.length?rows.map(p=>diagnosisPathwayCard(p)).join(''):'<div class="diagnosis-empty">No pathway guides match your filters.</div>';
 };
 ['pathways-library-search','pathways-library-category','pathways-library-severity'].forEach(id=>document.getElementById(id)?.addEventListener('input',render));
 ['pathways-library-category','pathways-library-severity'].forEach(id=>document.getElementById(id)?.addEventListener('change',render));
 render();
}
function diagnosisUsePathway(id){
 const resolved=getDiagnosisPathway(id);
 const p=resolved?.pathway; if(!p)return;
 if(!diagnosisIncidentData[id]) diagnosisIncidentData[id]={label:p.title,group:p.category,questions:p.mechanism,symptoms:[...(p.differentials||[]),...(p.focused_examination||[])]};
 diagnosisState.incident=id; diagnosisState.data={pathwayTitle:p.title, symptoms:[], body:[]}; diagnosisState.performed={}; diagnosisState.step=1; diagnosisState.example=false; diagnosisSave(); diagnosisRender();
 document.getElementById('diagnosis')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function diagnosisStep(n){diagnosisState.step=Math.max(0,Math.min(diagnosisSteps.length-1,n));diagnosisRender();}
function diagnosisSet(k,v){diagnosisState.data[k]=v;diagnosisSave();}
function diagnosisToggle(k,v){let a=diagnosisState.data[k]||[];a=a.includes(v)?a.filter(x=>x!==v):a.concat(v);diagnosisState.data[k]=a;diagnosisSave();}
function diagnosisIncidentCard(key){const d=diagnosisIncidentData[key];return `<button class="diagnosis-incident-card" onclick="diagnosisChooseIncident('${key}')"><span>${d.group}</span><strong>${diagnosisEscape(d.label)}</strong><small>${d.diff.slice(0,2).map(diagnosisEscape).join(' · ')}</small></button>`;}
function diagnosisChooseIncident(key){diagnosisState.incident=key;diagnosisState.data={};diagnosisState.performed={};diagnosisState.step=1;diagnosisState.example=false;diagnosisSave();diagnosisRender();}
function diagnosisField(label,key,type='text',placeholder=''){const val=diagnosisState.data[key]||'';const safeKey=diagnosisEscape(String(key).replace(/[^a-zA-Z0-9_-]/g,'-'));return `<label class="diagnosis-field"><span>${diagnosisEscape(label)}</span><input id="diagnosis-field-${safeKey}" name="diagnosis-${safeKey}" type="${type}" value="${diagnosisEscape(val)}" placeholder="${diagnosisEscape(placeholder)}" onchange="diagnosisSet('${key}',this.value)"></label>`;}
function diagnosisCheckGroup(title,key,items){const selected=diagnosisState.data[key]||[];const safeKey=diagnosisEscape(String(key).replace(/[^a-zA-Z0-9_-]/g,'-'));return `<fieldset class="diagnosis-fieldset"><legend>${diagnosisEscape(title)}</legend><div class="diagnosis-checkgrid">${items.map((x,i)=>`<label><input id="diagnosis-check-${safeKey}-${i}" name="diagnosis-${safeKey}" type="checkbox" ${selected.includes(x)?'checked':''} onchange="diagnosisToggle('${key}','${diagnosisEscape(x).replace(/'/g,"\\'")}')"><span>${diagnosisEscape(x)}</span></label>`).join('')}</div></fieldset>`;}
function diagnosisRoleTabs(){return `<div class="diagnosis-role-tabs">${[['paramedic','🚑 Paramedic'],['hospital','🏥 Hospital'],['mdt','👥 MDT']].map(([k,l])=>`<button class="${diagnosisState.role===k?'active':''}" onclick="diagnosisState.role='${k}';diagnosisRender()">${l}</button>`).join('')}</div>`;}
const diagnosisPathways={"rtc":{"id":"road-traffic-collision","title":"Road Traffic Collision","short_title":"RTC","category":"Trauma","age_group":"16+","rp_only":true,"disclaimer":"FOR FIVE M ROLE-PLAY ONLY. This guide is fictionalised for FiveM gameplay and is not real-world medical advice. Use only the equipment, medications, doses and procedures authorised by your server.","last_reviewed":"2026-09-30","severity":["moderate","serious","critical"],"incident_description":"A patient involved in a collision involving a car, van, lorry, motorcycle, bicycle or pedestrian. The mechanism may cause multiple injuries even when external injuries appear minor.","mechanism_questions":["What happened and what was the patient's role?","Was a seatbelt or helmet worn?","Did an airbag deploy?","Was there vehicle intrusion, ejection, rollover, second impact or death at the scene?","Was the patient trapped or crushed?","Did the patient lose consciousness, vomit, seize or become confused?","When did the incident occur and what treatment has already been provided?"],"differential_diagnoses":["Minor soft-tissue injury","Closed fracture","Open fracture","Dislocation","Head injury or concussion","Intracranial bleeding","Cervical spine injury","Chest injury","Pneumothorax-type presentation","Haemothorax-type presentation","Cardiac or major-vessel injury","Abdominal organ injury","Pelvic fracture","Internal haemorrhage","Traumatic shock","Spinal cord injury","Crush injury","Drug or alcohol intoxication complicating trauma"],"likely_rp_diagnoses":{"minor":["Superficial cuts or grazes","Bruising","Minor soft-tissue injury","Low-grade sprain"],"moderate":["Closed limb fracture","Dislocation","Concussion with normal GCS","Moderate chest-wall injury","Deep laceration without shock"],"serious":["Open fracture","Multiple fractures","Significant head injury","Chest injury with respiratory compromise","Suspected internal bleeding","Pelvic injury","Spinal injury"],"critical":["Uncontrolled catastrophic haemorrhage","Severe traumatic shock","Airway obstruction","Severe respiratory failure","Cardiac arrest","GCS 8 or less","Suspected major internal haemorrhage","Tension-pneumothorax-type presentation"]},"escalation_criteria":["Catastrophic bleeding","Ongoing bleeding despite treatment","Suspected major haemorrhage","Abnormal or deteriorating observations","GCS below 15 or falling GCS","Seizure","New weakness, numbness or paralysis","Severe chest pain or respiratory distress","Falling oxygen saturation","Suspected pelvic fracture with shock","Open fracture","Absent distal pulse","Gross deformity","Suspected spinal injury","Suspected internal bleeding","Entrapment or crush injury","High-speed, rollover or ejection mechanism","Serious injury or death at the scene"],"full_markdown_guide":true,"simulation_markdown":"# Respiratory Emergencies & Trauma Pathway Guide\n\n\\> **FOR FIVE M ROLE-PLAY ONLY.**\\\n\\> This guide is fictionalised for FiveM gameplay and is not real-world medical advice. Use only the equipment, medications, doses and procedures authorised by your server.\n\n---\n\n# PATHWAY GUIDE LIBRARY\n\n## Categories\n\n- Trauma\n- Respiratory emergency\n- Neurological emergency\n- Moderate / serious / critical\n- Road traffic collision\n- Convulsive status epilepticus\n\n---\n\n# 1 · Scene and mechanism\n\n## Scene safety\n\n```\n/me parks the response vehicle in a safe position and activates the emergency lights.\n/me exits the vehicle wearing appropriate PPE and scans the area for hazards.\n/me looks for moving traffic, leaking fuel, smoke, fire, unstable vehicles, broken glass, electrical hazards and aggressive persons.\n/do Is the scene safe to approach?\n/me confirms the scene is safe before approaching the patient.\n/me checks the number of patients and requests police, fire, additional medical resources or specialist support if required.\n/me identifies whether the patient is trapped, crushed or inside an unstable vehicle.\n/me does not enter an unsafe vehicle unless there is an immediate life threat.\n\n```\n\n## Mechanism and context\n\n```\n/me approaches the patient and observes their position, movement, speech, breathing effort, skin colour and apparent distress.\n/me asks what happened and whether the patient was a driver, passenger, motorcyclist, cyclist or pedestrian.\n/me asks whether a seatbelt or helmet was being worn and whether an airbag deployed.\n/me checks for vehicle intrusion, ejection, rollover, second impact or death at the scene.\n/me asks whether the patient lost consciousness, vomited, seized or became confused.\n/me confirms the estimated time of the incident and any treatment already provided.\n\n```\n\n## Initial impression\n\n```\n/me performs a rapid visual assessment for catastrophic bleeding and immediately life-threatening problems.\n/me identifies whether the patient appears stable, concerning or critical.\n/me asks the patient not to move while the initial assessment is completed.\n/me considers possible spinal injury if there was a high-energy mechanism, neck pain, neurological symptoms, reduced consciousness or distracting injury.\n\n```\n\n---\n\n# 2 · Primary survey — \\<C>ABCDE\n\n## Catastrophic haemorrhage\n\n### Look for\n\n- Pulsatile or heavy external bleeding\n- Amputation or partial amputation\n- Large open wounds\n- Blood pooling in the vehicle\n- Blood-soaked clothing\n- Bleeding from the scalp, chest, abdomen, pelvis or limbs\n\n### Actions\n\n```\n/me rapidly scans the patient for severe external bleeding.\n/do Is there any catastrophic bleeding?\n/me applies firm direct pressure to the most significant bleeding point using a trauma dressing.\n/me maintains continuous pressure without repeatedly lifting the dressing.\n/me checks whether the bleeding is controlled.\n/do Is the bleeding controlled?\n\n```\n\nIf permitted by the server:\n\n```\n/me applies a tourniquet above the life-threatening limb wound according to the server equipment system.\n/me tightens the tourniquet until the bleeding is controlled.\n/me records the time of tourniquet application.\n/me reassesses the wound and distal circulation.\n/me informs the team leader that the bleeding requires urgent escalation.\n\n```\n\n```\n/me does not repeatedly remove dressings to inspect the wound.\n/me requests major haemorrhage support if bleeding remains uncontrolled or the patient shows signs of shock.\n\n```\n\n---\n\n## Airway\n\n### Look for\n\n- Ability to speak\n- Gurgling, snoring or stridor\n- Blood, vomit or foreign material\n- Facial trauma\n- Reduced consciousness\n- Burns or swelling around the mouth\n\n### Actions\n\n```\n/me stabilises the patient's head and neck if spinal injury is suspected.\n/me asks the patient to speak and listens for changes in their voice.\n/do Can the patient speak clearly and is the airway unobstructed?\n/me visually checks the mouth for blood, vomit, loose teeth or visible obstruction.\n/me uses basic airway manoeuvres and suction only according to the server's permitted procedures.\n/me reports any gurgling, snoring, stridor or inability to speak clearly.\n/me does not give oral medication, food or fluids to a patient with reduced consciousness or a threatened airway.\n/me immediately requests senior airway support if the airway appears obstructed or threatened.\n\n```\n\n---\n\n## Breathing\n\n### Look for\n\n- Respiratory rate and effort\n- Chest asymmetry\n- Reduced or absent air entry\n- Open chest wound\n- Cyanosis\n- Severe chest pain\n- Tracheal-deviation-type presentation\n- Distended neck veins\n- Worsening oxygen saturation\n- Paradoxical chest movement\n\n### Actions\n\n```\n/me exposes the chest sufficiently to assess movement while preserving the patient's dignity and warmth.\n/me observes the respiratory rate, depth, pattern and work of breathing.\n/me compares movement on both sides of the chest.\n/me looks for open wounds, bruising, paradoxical movement and signs of severe distress.\n/me listens for unequal or absent breath sounds if permitted by the server system.\n/me attaches the pulse oximeter and records the displayed oxygen saturation.\n/me administers oxygen only in accordance with the server's RP rules.\n/me applies an approved occlusive dressing to an open chest wound if required by the server protocol.\n/me reassesses breathing, chest movement and oxygen saturation.\n/me immediately requests senior support for severe respiratory distress or a suspected tension-pneumothorax-type presentation.\n/me does not delay transport for a prolonged examination.\n\n```\n\n---\n\n## Circulation\n\n### Look for\n\n- Heart rate\n- Blood pressure\n- Capillary refill\n- Skin colour and temperature\n- Weak or absent peripheral pulses\n- Pelvic pain or instability-type symptoms\n- Abdominal pain, distension or bruising\n- Thigh deformity or swelling\n- Ongoing blood loss\n- Confusion or agitation\n\n### Actions\n\n```\n/me checks the patient's pulse, skin colour, temperature and capillary refill.\n/me obtains blood pressure and heart rate using the available RP equipment.\n/me checks for concealed bleeding around the chest, abdomen, pelvis and limbs.\n/me checks for deformity, swelling or abnormal movement of the limbs.\n/me controls any external haemorrhage.\n/me requests IV access if authorised under the server protocol.\n/me keeps the patient warm using an approved blanket or warming device.\n/me avoids repeatedly rocking or testing the pelvis.\n/me applies a pelvic binder only if authorised by the server system and clinically indicated within the RP scenario.\n/me reports signs of shock, ongoing bleeding or deteriorating observations.\n\n```\n\n---\n\n## Disability\n\n### Look for\n\n- Glasgow Coma Scale\n- Pupil size and reactivity\n- Confusion or agitation\n- Loss of consciousness\n- Seizure\n- Weakness or numbness\n- Loss of movement\n- Severe headache\n- Vomiting\n- Abnormal blood glucose\n\n### Actions\n\n```\n/me asks the patient their name, location, date and what happened.\n/me assesses and records the patient's eye, verbal and motor responses.\n/me checks pupil size and reaction to light if appropriate.\n/me asks about loss of consciousness, headache, vomiting, weakness, numbness and seizure activity.\n/me checks blood glucose if clinically relevant and permitted by the server system.\n/me repeats neurological observations if the patient is confused, injured or deteriorating.\n/me treats falling consciousness, new neurological deficit or seizure activity as an emergency.\n/me does not assume that intoxication explains an abnormal mental state.\n\n```\n\n---\n\n## Exposure and environment\n\n### Look for\n\n- Hidden bleeding\n- Deformity\n- Bruising\n- Seatbelt marks\n- Penetrating injury\n- Burns\n- Cold exposure\n- Wet clothing\n\n### Actions\n\n```\n/me exposes only the areas required to assess the patient properly.\n/me preserves the patient's dignity throughout the examination.\n/me checks the front and back of the body where safe to do so.\n/me looks for hidden bleeding, deformity, bruising, burns and penetrating injury.\n/me records visible injuries before covering the patient.\n/me covers the patient with a blanket to reduce heat loss.\n\n```\n\n---\n\n# 3 · Observations\n\n## Stable pattern\n\n- Heart rate: 78–100 bpm\n- Respiratory rate: 12–20/min\n- Blood pressure: normal for the patient\n- Oxygen saturation: 96–100% on air\n- GCS: 15\n- Pain: 1–5/10\n- Skin: warm, normal colour, capillary refill under 2 seconds\n\n## Concerning pattern\n\n- Heart rate: 100–120 bpm\n- Respiratory rate: 20–28/min\n- Blood pressure: normal or borderline low\n- Oxygen saturation: 92–95% on air or falling\n- GCS: 13–15 or confused\n- Pain: 6–9/10\n- Skin: pale, cool or sweaty\n\n## Critical pattern\n\n- Heart rate: 120 bpm or higher, or abnormally slow in a deteriorating patient\n- Respiratory rate: below 8, above 30 or visibly inadequate\n- Blood pressure: falling or markedly low\n- Oxygen saturation: below 92% or rapidly falling\n- GCS: 8 or less, or a clear downward trend\n- Pain: severe or rapidly worsening\n- Skin: mottled, grey, blue, cold or clammy\n\n## Observation actions\n\n```\n/me attaches the available monitoring equipment.\n/me records the initial heart rate, respiratory rate, blood pressure, oxygen saturation, GCS, pupils, pain score and skin findings.\n/me compares the observations with the patient's general appearance and mechanism of injury.\n/me repeats observations after every major intervention and whenever the patient's condition changes.\n/me records the trend rather than only the latest readings.\n/me informs the senior clinician of any abnormal or deteriorating observation.\n\n```\n\n\\> A single normal observation set does not exclude serious injury.\n\n---\n\n# 4 · Focused examination\n\n## Head and face\n\n```\n/me checks the scalp and face for wounds, swelling, deformity and bruising.\n/me looks for bleeding from the nose or ears and loose or missing teeth.\n/me checks pupil size and reaction if appropriate.\n/me asks about loss of consciousness, vomiting, headache or seizure activity.\n\n```\n\n## Neck and spine\n\n```\n/me asks about neck pain, midline tenderness, tingling, weakness or altered sensation.\n/me checks for spinal deformity without repeatedly moving the patient.\n/me maintains spinal protection if clinically indicated within the RP scenario.\n/me asks about loss of movement or new bladder or bowel symptoms where relevant.\n\n```\n\n## Chest\n\n```\n/me checks for chest pain, tenderness, bruising and open wounds.\n/me observes whether both sides of the chest are moving equally.\n/me listens for reduced or absent air entry if permitted by the server system.\n/me checks for increasing respiratory effort, cyanosis and paradoxical movement.\n\n```\n\n## Abdomen and pelvis\n\n```\n/me inspects the abdomen for bruising, distension and seatbelt marks.\n/me asks about abdominal pain and checks for guarding-type discomfort within the server's RP system.\n/me asks about pelvic pain without repeatedly rocking or testing the pelvis.\n/me looks for genital injury or blood at the urethral opening where relevant.\n\n```\n\n## Limbs\n\n```\n/me checks each limb for deformity, shortening, abnormal rotation, swelling and open wounds.\n/me checks for bleeding and reduced movement.\n/me assesses distal pulse, sensation and movement below each suspected injury.\n/me compares the injured limb with the unaffected side.\n/me covers the limb after examination and avoids unnecessary manipulation.\n\n```\n\n---\n\n# 5 · Respiratory emergencies\n\n## Initial approach\n\n```\n/me approaches the patient and observes their position, colour, breathing effort and ability to speak.\n/me introduces themselves and asks the patient to describe what is wrong.\n/do Can the patient speak in full sentences?\n/me asks when the breathing difficulty started and whether it is getting worse.\n/me asks about chest pain, wheeze, cough, fever, choking, allergies and previous respiratory problems.\n\n```\n\n## Respiratory assessment\n\n```\n/me counts the patient's respiratory rate and observes the depth and pattern of breathing.\n/me checks for use of accessory muscles, cyanosis, exhaustion and altered consciousness.\n/me attaches the pulse oximeter and records the oxygen saturation.\n/me checks the patient's pulse and blood pressure.\n/me listens for wheeze, stridor, reduced air entry or absent breath sounds if permitted.\n/me checks the chest for equal movement, injury and visible abnormalities.\n/do Is the patient stable, deteriorating or in immediate respiratory failure?\n\n```\n\n## Initial RP management\n\n```\n/me positions the patient upright or in the position of greatest comfort unless contraindicated.\n/me reassures the patient and encourages them to remain calm and avoid unnecessary exertion.\n/me administers oxygen only in accordance with the server's RP treatment rules.\n/me prepares the appropriate respiratory equipment available in the server system.\n/me assists with the patient's prescribed inhaler or nebulised treatment only if authorised by the RP protocol.\n/me records the treatment, time and observed response.\n/me continues monitoring respiratory effort, oxygen saturation and consciousness.\n\n```\n\n## Deterioration\n\n```\n/me notices that the patient's breathing has become more laboured.\n/me immediately informs the senior clinician and requests additional support.\n/me reassesses the airway and confirms whether the patient can still speak.\n/me checks for worsening cyanosis, exhaustion, reduced consciousness and falling oxygen saturation.\n/me requests advanced airway support and immediate transport.\n/me prepares the patient for rapid movement while continuing authorised RP treatment.\n/me gives an urgent pre-alert to the receiving hospital.\n/me reassesses the patient after movement and throughout transport.\n\n```\n\n## Respiratory arrest or cardiac arrest\n\n```\n/me checks the patient for responsiveness and normal breathing.\n/me calls for immediate assistance and requests the resuscitation equipment.\n/me begins the server-approved resuscitation sequence.\n/me attaches the monitor or defibrillator if available in the RP system.\n/me follows the server's cardiac-arrest protocol and records each intervention.\n/me gives the receiving team an arrest pre-alert.\n/me documents the time of deterioration, interventions performed and the patient's response.\n\n```\n\n---\n\n# 6 · Diagnostic reasoning\n\n## Possible trauma diagnoses\n\n- Minor soft-tissue injury\n- Closed fracture\n- Open fracture\n- Dislocation\n- Head injury or concussion\n- Intracranial bleeding\n- Cervical spine injury\n- Chest injury\n- Pneumothorax-type presentation\n- Haemothorax-type presentation\n- Cardiac or major-vessel injury\n- Abdominal organ injury\n- Pelvic fracture\n- Internal haemorrhage\n- Traumatic shock\n- Spinal cord injury\n- Crush injury\n- Drug or alcohol intoxication complicating trauma\n\n## Likely RP classification\n\n### Minor\n\n- Superficial cuts or grazes\n- Bruising\n- Minor soft-tissue injury\n- Low-grade sprain\n\n### Moderate\n\n- Closed limb fracture\n- Dislocation\n- Concussion with normal GCS\n- Moderate chest-wall injury\n- Deep laceration without shock\n\n### Serious\n\n- Open fracture\n- Multiple fractures\n- Significant head injury\n- Chest injury with respiratory compromise\n- Suspected internal bleeding\n- Pelvic injury\n- Spinal injury\n\n### Critical\n\n- Uncontrolled catastrophic haemorrhage\n- Severe traumatic shock\n- Airway obstruction\n- Severe respiratory failure\n- Cardiac arrest\n- GCS 8 or less\n- Suspected major internal haemorrhage\n- Tension-pneumothorax-type presentation\n\n---\n\n# 7 · Management and escalation\n\n## Immediate management\n\n```\n/me repeats the &lt;C&gt;ABCDE assessment after completing the initial examination.\n/me treats the most immediately life-threatening problem first.\n/me maintains spinal protection where clinically indicated.\n/me administers oxygen only according to the server's RP rules.\n/me establishes monitoring and records repeat observations.\n/me immobilises suspected fractures in the position found unless the server protocol permits otherwise.\n/me avoids repeatedly manipulating spinal, pelvic or limb injuries.\n/me keeps the patient warm.\n/me requests senior or specialist support for serious and critical findings.\n/me prepares the patient for transport once immediate life-saving RP actions are complete.\n/me provides a pre-alert to the designated receiving hospital.\n\n```\n\n## Escalate immediately for\n\n- Catastrophic bleeding\n- Ongoing bleeding despite treatment\n- Suspected major haemorrhage\n- Abnormal or deteriorating observations\n- GCS below 15 or falling GCS\n- Seizure\n- New weakness, numbness or paralysis\n- Severe chest pain or respiratory distress\n- Falling oxygen saturation\n- Suspected pelvic fracture with shock\n- Open fracture\n- Absent distal pulse\n- Gross deformity\n- Suspected spinal injury\n- Suspected internal bleeding\n- Entrapment or crush injury\n- High-speed, rollover or ejection mechanism\n- Serious injury or death at the scene\n\n---\n\n# 8 · Convulsive status epilepticus\n\n## Recognition and safety\n\n```\n/me observes the patient having ongoing generalised convulsive activity.\n/me checks the time and asks witnesses when the seizure started.\n/me clears nearby objects and protects the patient's head from impact.\n/me asks bystanders to move away and requests additional medical support.\n/me does not restrain the patient's limbs or place anything in their mouth.\n/me looks for medical-alert jewellery, medication information or evidence of injury.\n/do Has the seizure continued beyond the server's status-epilepticus threshold, or have seizures recurred without recovery?\n\n```\n\n## ABCDE assessment\n\n```\n/me checks whether the patient responds while maintaining a safe position.\n/me assesses the airway for visible obstruction, blood or vomit.\n/me observes breathing, chest movement, colour and oxygen saturation.\n/me checks the pulse and attaches monitoring equipment if available.\n/me checks blood glucose if authorised by the server protocol.\n/me checks for trauma, fever, pregnancy indicators, drug exposure or other relevant causes.\n/me records the seizure duration and initial observations.\n\n```\n\n## Buccal midazolam — RP action\n\n\\> Use the medication, dose and timing configured by your server. Do not add real-world dosing to the RP guide.\n\n```\n/me confirms the patient's identity and checks the RP medication record.\n/me checks for recorded allergies, contraindications and previous rescue medication.\n/me retrieves the approved buccal midazolam item from the emergency kit.\n/me confirms the medication, route and server-authorised dose with the team leader.\n/me positions the patient safely and exposes the side of the mouth without forcing the jaw open.\n/me administers the RP buccal medication according to the server protocol.\n/me records the medication name, dose, route and time of administration.\n/me maintains airway observation and prepares suction and oxygen equipment if permitted.\n/me does not place fingers or objects inside the patient's mouth.\n\n```\n\n## Reassessment\n\n```\n/me reassesses the patient after the server-configured medication interval.\n/me checks whether the convulsions have stopped or reduced.\n/me reassesses airway patency, breathing, oxygen saturation, pulse, blood pressure and consciousness.\n/me checks for continued seizure activity or a second seizure.\n/do Has the seizure stopped and is the patient breathing adequately?\n\n```\n\n### If the seizure stops\n\n```\n/me places the patient in the server-approved recovery position if safe to do so.\n/me maintains airway observation and continues monitoring breathing and oxygen saturation.\n/me checks for injuries, tongue trauma, incontinence and signs of aspiration.\n/me reassesses blood glucose if indicated and permitted.\n/me repeats neurological observations and records the patient's recovery.\n/me arranges urgent transport and gives a structured handover.\n\n```\n\n### If the seizure continues or recurs\n\n```\n/me announces that the seizure is ongoing despite the initial RP treatment.\n/me requests senior clinical support and immediate advanced airway assistance.\n/me rechecks the airway, breathing, oxygen saturation and blood glucose where authorised.\n/me prepares further treatment only under the server's approved escalation protocol.\n/me informs the receiving hospital that this is ongoing or recurrent convulsive status.\n/me prepares the patient for immediate transport while continuing airway and seizure monitoring.\n/me documents the seizure duration, treatment times, response and escalation.\n\n```\n\n---\n\n# 9 · Reassessment\n\n## After the initial assessment\n\n```\n/me repeats the complete primary survey.\n/me repeats the full set of observations.\n/me repeats the pain score.\n/me repeats GCS and pupil assessment if head injury is possible.\n/me repeats distal circulation, sensation and movement for limb injuries.\n/me compares the findings with the initial assessment.\n\n```\n\n## After medication\n\n```\n/me reassesses the patient within the server-configured medication interval.\n/me checks for clinical response and adverse effects.\n/me records the medication, dose, route, time and response.\n/me does not administer further opioid treatment if the server protocol identifies respiratory depression, falling consciousness or worsening oxygen saturation.\n\n```\n\n## During transport\n\n```\n/me repeats observations at regular intervals during transport.\n/me reassesses immediately after any deterioration or new symptom.\n/me monitors airway, breathing, circulation and consciousness continuously where possible.\n/me records the trend in the patient record.\n/me updates the receiving hospital if the patient's condition changes.\n\n```\n\n---\n\n# 10 · Disposition\n\n## Minor\n\n```\n/me confirms that the patient has a reassuring examination, stable observations, no red flags and no significant mechanism.\n/me provides the server-approved RP safety-netting advice.\n/me documents the assessment, advice and final disposition.\n\n```\n\n## Moderate\n\n```\n/me prepares the patient for transport to the designated emergency department.\n/me repeats observations during transport.\n/me provides the receiving team with the mechanism, injuries, observations and treatment given.\n\n```\n\n## Serious or critical\n\n```\n/me declares the patient serious or critical and requests senior or specialist support.\n/me gives a pre-alert to the designated major trauma or receiving centre.\n/me uses the shortest safe route to hospital.\n/me continues immediate life-saving RP interventions during transport.\n/me repeats the primary survey and observations before handover.\n\n```\n\n---\n\n# 11 · Handover — ATMIST\n\n## Template\n\n```\n/me gives an ATMIST handover to the receiving team.\n\n```\n\n```\nThis is a [age]-year-old [sex] involved in a [type of collision or emergency] at [time]. The mechanism or presenting complaint was [details]. Suspected injuries or diagnosis are [injuries/diagnosis]. Initial observations were HR [value], RR [value], BP [value], SpO2 [value], GCS [value] and pain [value]/10. Findings include [key positives] and [key negatives]. Treatment given was [treatment, medication, dose, route and time]. The response was [response]. Current observations are [values]. ETA is [time]. Additional requirements are [requirements].\n\n```\n\n## Trauma example\n\n```\nThis is a 32-year-old following a high-speed car collision at 14:20. The patient was the restrained driver and required extrication. Suspected injuries are chest trauma and a left femur fracture. Initial observations were pulse 118, respiratory rate 26, blood pressure 102/68, oxygen saturation 95% on air, GCS 15 and pain 9/10. There is left thigh deformity and controlled bleeding, with no obvious airway obstruction. RP-approved analgesia was administered according to the server protocol and the patient remains responsive. ETA is 10 minutes. Major-trauma reception is requested.\n\n```\n\n## Seizure example\n\n```\nThis is a [age]-year-old patient with ongoing generalised convulsive activity beginning at [time]. The patient has [known/unknown] epilepsy and did/did not regain consciousness between seizures. Initial airway was [finding], breathing was [finding], oxygen saturation was [value], pulse was [value], blood pressure was [value], GCS was [value] and glucose was [value] if obtained. Buccal midazolam was administered under the server RP protocol at [time], with [no/partial/full] response. The seizure is currently [ongoing/stopped/recurrent]. There is [presence/absence] of trauma or aspiration. ETA is [time].\n\n```\n\n---\n\n# 12 · Documentation\n\n```\n/me documents the time of the incident and first patient contact.\n/me records the mechanism, scene hazards and patient position.\n/me records all primary survey findings.\n/me documents the initial and repeat observations.\n/me records GCS, pupil findings and neurological changes.\n/me documents every identified injury or suspected diagnosis.\n/me records bleeding-control methods and tourniquet times if used.\n/me documents spinal, pelvic or limb precautions.\n/me records every medication, dose, route, time and response according to the server system.\n/me records allergies and relevant medical history if available.\n/me documents the pre-alert recipient and time.\n/me records the destination and estimated arrival time.\n/me completes the final handover and closes the patient record.\n\n```\n\n---\n\n# 13 · Medication and equipment reference\n\n\\> All medication names, doses, routes and treatment intervals must follow the server’s approved RP medication system.\n\n## Morphine or other RP analgesia\n\n```\n/me confirms the patient's identity and checks the RP medication record.\n/me checks for recorded allergies, contraindications and relevant cautions.\n/me confirms the medication, dose and route with the authorised clinician.\n/me administers the approved RP analgesia according to the server protocol.\n/me records the medication name, dose, route and time.\n/me reassesses pain, respiratory rate, consciousness and oxygen saturation.\n/me documents the patient's response and any adverse effects.\n\n```\n\n## Equipment actions\n\n```\n/me prepares the monitor and pulse oximeter.\n/me applies the blood-pressure cuff and records the reading.\n/me prepares oxygen equipment if authorised by the server protocol.\n/me prepares suction and airway equipment for a patient with reduced consciousness.\n/me prepares trauma dressings and haemorrhage-control equipment.\n/me checks that the equipment is secured before transport.\n/me confirms that all used equipment is documented and returned after handover.\n\n```\n\n---\n\n## RP safety notice\n\n```\n/me confirms that all actions, medications, doses and procedures are being performed under the server's fictional role-play protocol and are not real-world medical treatment.\n\n```"},"motorcycle-collision":{"id":"motorcycle-collision","title":"Motorcycle Collision","category":"Trauma","severity":"Serious","scene_safety":["Traffic","fuel","road hazards"],"mechanism":["Speed, impact direction, helmet, separation from bike, distance travelled"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Repeat neurovascular checks","Serial observations","Full trauma survey"],"positive_findings":[],"negative_findings":[],"differentials":["Head injury","Chest injury","Pelvic injury","Limb injury","Road rash"],"rp_diagnosis":["High-energy mechanism may cause multiple injuries even when external injury appears limited."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Head injury","Chest injury","Pelvic injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"pedestrian-collision":{"id":"pedestrian-collision","title":"Pedestrian Struck by Vehicle","category":"Trauma","severity":"Critical","scene_safety":["Traffic","moving vehicles","secondary collision"],"mechanism":["Vehicle speed, impact direction, throw distance, entrapment"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Serial ABCDE","Neurovascular assessment","Trauma imaging at hospital"],"positive_findings":[],"negative_findings":[],"differentials":["Head injury","Chest/abdominal injury","Pelvic injury","Limb injury"],"rp_diagnosis":["Mechanism can produce multiple occult injuries; assess the whole patient."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Head injury","Chest/abdominal injury","Pelvic injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"fall":{"id":"fall","title":"Fall from Standing Height","category":"Trauma","severity":"Moderate","scene_safety":["Scene hazards","trip hazards"],"mechanism":["Height, landing position, head strike, anticoagulants, loss of consciousness"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Neuro assessment","Focused injury examination","Repeat observations"],"positive_findings":[],"negative_findings":[],"differentials":["Head injury","Fracture","Soft-tissue injury","Syncope-related cause"],"rp_diagnosis":["A low-height fall can still cause significant injury, particularly with anticoagulation or frailty."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Head injury","Fracture","Soft-tissue injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"fall-height":{"id":"fall-height","title":"Fall from Height","category":"Trauma","severity":"Serious","scene_safety":["Structural hazards","unstable surfaces","secondary falls"],"mechanism":["Height, landing surface, body position, head strike, entrapment"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Full trauma survey","Serial observations","Neurovascular checks"],"positive_findings":[],"negative_findings":[],"differentials":["Spinal injury","Head injury","Chest/abdominal injury","Pelvic/limb injury"],"rp_diagnosis":["Energy transfer and landing position guide focused assessment."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Spinal injury","Head injury","Chest/abdominal injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"gunshot-injury":{"id":"gunshot-injury","title":"Gunshot Injury","category":"Trauma","severity":"Critical","scene_safety":["Weapon safety","ongoing threat","bleeding"],"mechanism":["Number/location of wounds, entry/exit, mechanism, time, bleeding"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Haemorrhage control","Serial ABCDE","Full wound survey"],"positive_findings":[],"negative_findings":[],"differentials":["Penetrating trauma","Haemorrhage","Chest injury","Abdominal injury","Neurovascular injury"],"rp_diagnosis":["Penetrating trauma requires urgent escalation; do not infer internal structures from wound appearance alone."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Penetrating trauma","Haemorrhage","Chest injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"stab-wound":{"id":"stab-wound","title":"Stab Wound","category":"Trauma","severity":"Critical","scene_safety":["Weapon/scene safety","ongoing bleeding"],"mechanism":["Object retained, wound location, number of wounds, time, bleeding"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Do not assume depth from skin wound","Serial observations","Focused trauma examination"],"positive_findings":[],"negative_findings":[],"differentials":["Penetrating chest/abdomen","Haemorrhage","Neurovascular injury"],"rp_diagnosis":["A small external wound can conceal significant internal injury."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Penetrating chest/abdomen","Haemorrhage","Neurovascular injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"animal-attack":{"id":"animal-attack","title":"Animal Attack","category":"Trauma","severity":"Serious","scene_safety":["Animal control","environmental hazards"],"mechanism":["Animal, bite/scratch, location, depth, contamination, time"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Wound assessment","Neurovascular assessment","Tetanus/immunisation history where relevant"],"positive_findings":[],"negative_findings":[],"differentials":["Soft-tissue injury","Neurovascular injury","Infection risk","Allergic reaction"],"rp_diagnosis":["Exposure history and wound characteristics guide escalation."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Soft-tissue injury","Neurovascular injury","Infection risk"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"dog-bite":{"id":"dog-bite","title":"Dog Bite","category":"Trauma","severity":"Moderate","scene_safety":["Animal control","contamination"],"mechanism":["Bite location, depth, contamination, time, animal/exposure history"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Wound and neurovascular assessment","Repeat observations if systemic symptoms"],"positive_findings":[],"negative_findings":[],"differentials":["Laceration","Puncture wound","Neurovascular injury","Infection risk"],"rp_diagnosis":["Face, hand, deep or contaminated wounds warrant careful assessment."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Laceration","Puncture wound","Neurovascular injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"assault-blunt":{"id":"assault-blunt","title":"Punch or Blunt Assault","category":"Trauma","severity":"Moderate","scene_safety":["Scene safety","ongoing violence"],"mechanism":["Mechanism, blows, head strike, loss of consciousness, anticoagulants"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Neuro assessment","Focused injury examination","Serial observations"],"positive_findings":[],"negative_findings":[],"differentials":["Head injury","Fracture","Chest/abdominal injury","Soft-tissue injury"],"rp_diagnosis":["History may be incomplete; assess for occult injury and safeguarding concerns."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Head injury","Fracture","Chest/abdominal injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"grazes-wounds":{"id":"grazes-wounds","title":"Grazes and Superficial Wounds","category":"Trauma","severity":"Minor","scene_safety":["Contamination","sharp objects"],"mechanism":["Mechanism, wound location, contamination, bleeding"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Wound inspection","Neurovascular check where relevant"],"positive_findings":[],"negative_findings":[],"differentials":["Superficial wound","Foreign body","Infection risk"],"rp_diagnosis":["Severity depends on depth, location, contamination and patient factors."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Superficial wound","Foreign body","Infection risk"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"bruising-soft-tissue":{"id":"bruising-soft-tissue","title":"Bruising and Soft-Tissue Injury","category":"Trauma","severity":"Minor","scene_safety":["Scene safety"],"mechanism":["Mechanism, pain, swelling, anticoagulants"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Focused examination","Neurovascular assessment","Repeat observations if worsening"],"positive_findings":[],"negative_findings":[],"differentials":["Contusion","Haematoma","Occult fracture"],"rp_diagnosis":["Bruising does not by itself exclude deeper injury."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Contusion","Haematoma","Occult fracture"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"suspected-fracture":{"id":"suspected-fracture","title":"Suspected Fracture","category":"Trauma","severity":"Moderate","scene_safety":["Scene safety"],"mechanism":["Mechanism, deformity, pain, movement, neurovascular symptoms"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Distal colour, temperature, capillary refill, sensation, movement, pulse"],"positive_findings":[],"negative_findings":[],"differentials":["Fracture","Dislocation","Soft-tissue injury"],"rp_diagnosis":["Document neurovascular status before and after any intervention."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Fracture","Dislocation","Soft-tissue injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"open-fracture":{"id":"open-fracture","title":"Open Fracture","category":"Trauma","severity":"Serious","scene_safety":["Contamination","scene hazards"],"mechanism":["Wound, exposed bone, mechanism, bleeding, neurovascular status"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Haemorrhage control","Neurovascular checks","Serial observations"],"positive_findings":[],"negative_findings":[],"differentials":["Open fracture","Neurovascular injury","Contamination/infection risk"],"rp_diagnosis":["Open injury requires urgent specialist assessment."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Open fracture","Neurovascular injury","Contamination/infection risk"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"dislocation":{"id":"dislocation","title":"Dislocation","category":"Trauma","severity":"Moderate","scene_safety":["Scene safety"],"mechanism":["Mechanism, deformity, pain, movement, neurovascular symptoms"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Distal neurovascular assessment","Pain and function assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Dislocation","Fracture","Neurovascular injury"],"rp_diagnosis":["Neurovascular status is essential; do not infer absence of fracture without appropriate assessment."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Dislocation","Fracture","Neurovascular injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"head-injury":{"id":"head-injury","title":"Head Injury","category":"Trauma","severity":"Serious","scene_safety":["Scene safety","ongoing hazard"],"mechanism":["Mechanism, head strike, loss of consciousness, amnesia, anticoagulants, seizure"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["GCS","Pupils","Neurological examination","Serial observations"],"positive_findings":[],"negative_findings":[],"differentials":["Concussion","Intracranial injury","Skull injury"],"rp_diagnosis":["A normal initial assessment does not exclude evolving intracranial injury."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Concussion","Intracranial injury","Skull injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"neck-spine":{"id":"neck-spine","title":"Neck and Spinal Injury","category":"Trauma","severity":"Serious","scene_safety":["Scene safety","movement hazards"],"mechanism":["Mechanism, neck/back pain, weakness, numbness, altered sensation"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Focused neurological and spinal assessment","Serial observations"],"positive_findings":[],"negative_findings":[],"differentials":["Spinal injury","Fracture","Neurological deficit"],"rp_diagnosis":["Use local RP protocol for movement and immobilisation; avoid unsupported assumptions."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Spinal injury","Fracture","Neurological deficit"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"chest-injury":{"id":"chest-injury","title":"Chest Injury","category":"Trauma","severity":"Serious","scene_safety":["Scene safety"],"mechanism":["Blunt/penetrating mechanism, chest pain, breathlessness"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Respiratory effort","Chest movement","Auscultation","SpO2","ECG where indicated"],"positive_findings":[],"negative_findings":[],"differentials":["Chest-wall injury","Pneumothorax","Haemothorax","Cardiac injury"],"rp_diagnosis":["Breathing deterioration or shock is an urgent concern."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Chest-wall injury","Pneumothorax","Haemothorax"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"abdominal-injury":{"id":"abdominal-injury","title":"Abdominal Injury","category":"Trauma","severity":"Serious","scene_safety":["Scene safety"],"mechanism":["Blunt/penetrating mechanism, pain, tenderness, vomiting, bleeding"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Serial observations","Abdominal examination","Pain trend"],"positive_findings":[],"negative_findings":[],"differentials":["Internal bleeding","Organ injury","Abdominal wall injury"],"rp_diagnosis":["Internal injury may be present despite limited external signs."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Internal bleeding","Organ injury","Abdominal wall injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"pelvic-injury":{"id":"pelvic-injury","title":"Pelvic Injury","category":"Trauma","severity":"Critical","scene_safety":["Scene safety"],"mechanism":["Mechanism, pelvic pain, haemorrhage, lower-limb symptoms"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Shock assessment","Neurovascular examination","Serial observations"],"positive_findings":[],"negative_findings":[],"differentials":["Pelvic fracture","Haemorrhage","Associated abdominal/urogenital injury"],"rp_diagnosis":["Pelvic trauma can be associated with significant internal bleeding."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Pelvic fracture","Haemorrhage","Associated abdominal/urogenital injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"burns":{"id":"burns","title":"Burns","category":"Trauma","severity":"Serious","scene_safety":["Fire/heat","smoke","chemicals","electricity"],"mechanism":["Mechanism, time, body areas, depth/appearance, inhalation exposure"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Burn extent/location","Airway assessment","Pain","Temperature"],"positive_findings":[],"negative_findings":[],"differentials":["Burn injury","Inhalation injury","Associated trauma"],"rp_diagnosis":["Extent, depth, location and associated inhalation injury affect severity."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Burn injury","Inhalation injury","Associated trauma"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"smoke-inhalation":{"id":"smoke-inhalation","title":"Smoke Inhalation","category":"Trauma","severity":"Critical","scene_safety":["Fire","toxic environment","re-entry hazards"],"mechanism":["Enclosed-space exposure, duration, soot, voice change, breathing difficulty"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Airway signs","Respiratory effort","SpO2 interpreted in context","Mental state"],"positive_findings":[],"negative_findings":[],"differentials":["Airway injury","Toxic exposure","Associated burns"],"rp_diagnosis":["Airway deterioration can evolve; urgent assessment is required."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Airway injury","Toxic exposure","Associated burns"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"electrical-injury":{"id":"electrical-injury","title":"Electrical Injury","category":"Trauma","severity":"Serious","scene_safety":["Power source","energised equipment"],"mechanism":["Voltage/source if known, contact time, entry/exit, loss of consciousness"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["ECG","Observations","Burn assessment","Neurological examination"],"positive_findings":[],"negative_findings":[],"differentials":["Arrhythmia","Burns","Neurological injury","Trauma"],"rp_diagnosis":["External burns may underestimate internal injury."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Arrhythmia","Burns","Neurological injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"allergic-reaction":{"id":"allergic-reaction","title":"Allergic Reaction","category":"Medical","severity":"Moderate","scene_safety":["Trigger exposure"],"mechanism":["Trigger, onset, rash, swelling, breathing symptoms, circulation symptoms"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Airway/respiratory assessment","Observations","Repeat assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Mild allergy","Evolving anaphylaxis","Other causes of rash"],"rp_diagnosis":["Progression from mild symptoms to anaphylaxis must be considered."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Mild allergy","Evolving anaphylaxis","Other causes of rash"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"anaphylaxis":{"id":"anaphylaxis","title":"Anaphylaxis","category":"Medical","severity":"Critical","scene_safety":["Trigger","scene safety"],"mechanism":["Onset, exposure, airway/breathing/circulation symptoms"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["ABCDE","Serial observations","Response to treatment"],"positive_findings":[],"negative_findings":[],"differentials":["Airway compromise","Bronchospasm","Shock"],"rp_diagnosis":["This is an emergency; use the fictional RP pathway separately from real-world dosing guidance."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Airway compromise","Bronchospasm","Shock"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"overdose":{"id":"overdose","title":"Suspected Overdose","category":"Medical","severity":"Critical","scene_safety":["Substances","needles","environmental hazards"],"mechanism":["Substance, amount if known, time, co-ingestion, containers, intent"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["GCS/AVPU","RR","SpO2","Glucose","Pupils","ECG where indicated"],"positive_findings":[],"negative_findings":[],"differentials":["Opioid toxicity","Sedative toxicity","Alcohol/drug effects","Metabolic causes"],"rp_diagnosis":["Do not assume the substance or cause from appearance alone."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Opioid toxicity","Sedative toxicity","Alcohol/drug effects"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"alcohol-intoxication":{"id":"alcohol-intoxication","title":"Alcohol Intoxication","category":"Medical","severity":"Moderate","scene_safety":["Scene safety","vomit/aspiration risk"],"mechanism":["Quantity, time, co-ingestion, injury, baseline state"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["GCS/AVPU","Glucose","RR","SpO2","Temperature","Trauma assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Intoxication","Head injury","Hypoglycaemia","Other poisoning"],"rp_diagnosis":["Intoxication should not be used to explain away trauma or reduced consciousness without assessment."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Intoxication","Head injury","Hypoglycaemia"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"medication-error":{"id":"medication-error","title":"Medication Error","category":"Medical","severity":"Serious","scene_safety":["Medication exposure"],"mechanism":["Drug, strength, amount, route, time, patient factors"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Observations","Glucose/ECG where relevant","Focused assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Medication toxicity","Adverse reaction","Wrong-route exposure"],"rp_diagnosis":["Record the exact medication information if available; do not guess exposure."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Medication toxicity","Adverse reaction","Wrong-route exposure"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"seizure":{"id":"seizure","title":"Seizure","category":"Medical","severity":"Serious","scene_safety":["Scene safety","injury hazards"],"mechanism":["Witness description, duration, recovery, prior seizures, triggers"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["GCS/AVPU","Glucose","Pupils","Neurological assessment","Temperature"],"positive_findings":[],"negative_findings":[],"differentials":["Epileptic seizure","Hypoglycaemia","Stroke","Syncope/other causes"],"rp_diagnosis":["Consider reversible causes and injury; document witnessed features."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Epileptic seizure","Hypoglycaemia","Stroke"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"collapse":{"id":"collapse","title":"Collapse","category":"Medical","severity":"Serious","scene_safety":["Scene safety"],"mechanism":["Prodrome, posture, exertion, witnesses, recovery, injury"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["ECG","Observations","Glucose","Neurological and trauma assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Syncope","Arrhythmia","Hypoglycaemia","Seizure","Bleeding"],"rp_diagnosis":["History and witness account can be crucial."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Syncope","Arrhythmia","Hypoglycaemia"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"cardiac-arrest":{"id":"cardiac-arrest","title":"Cardiac Arrest","category":"Medical","severity":"Critical","scene_safety":["Scene safety","resuscitation hazards"],"mechanism":["Collapse time, witnessed status, bystander CPR, AED/defibrillation"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["CPR/defibrillation workflow","ABCDE after ROSC","Serial observations"],"positive_findings":[],"negative_findings":[],"differentials":["Cardiac arrest","Reversible causes"],"rp_diagnosis":["Use the site's dedicated resuscitation learning content and current real-world guidance separately."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Cardiac arrest","Reversible causes"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"asthma":{"id":"asthma","title":"Asthma Attack","category":"Medical","severity":"Serious","scene_safety":["Trigger/environment"],"mechanism":["Wheeze, cough, chest tightness, previous attacks, inhaler use"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["RR","SpO2","Work of breathing","Ability to speak","Chest examination"],"positive_findings":[],"negative_findings":[],"differentials":["Asthma","Anaphylaxis","Pneumothorax","Other respiratory causes"],"rp_diagnosis":["Severity is based on the overall respiratory picture and response to treatment."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Asthma","Anaphylaxis","Pneumothorax"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"hypoglycaemia":{"id":"hypoglycaemia","title":"Hypoglycaemia","category":"Medical","severity":"Serious","scene_safety":["Scene safety"],"mechanism":["Diabetes, medication, food intake, symptoms, glucose"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Glucose","GCS/AVPU","Neurological assessment","Repeat glucose after intervention"],"positive_findings":[],"negative_findings":[],"differentials":["Hypoglycaemia","Stroke","Seizure","Intoxication"],"rp_diagnosis":["Low glucose can mimic neurological emergencies; reassessment matters."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Hypoglycaemia","Stroke","Seizure"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"chest-pain":{"id":"chest-pain","title":"Chest Pain","category":"Medical","severity":"Serious","scene_safety":["Scene safety"],"mechanism":["OPQRST, exertion, radiation, associated symptoms, cardiac history"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["ECG","HR/BP/SpO2","Focused cardiovascular/respiratory assessment"],"positive_findings":[],"negative_findings":[],"differentials":["ACS","Pulmonary embolism","Aortic syndrome","Pneumothorax","Pericarditis","Musculoskeletal pain"],"rp_diagnosis":["Chest pain requires a broad differential; do not equate it automatically with ACS."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["ACS","Pulmonary embolism","Aortic syndrome"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"abdominal-pain":{"id":"abdominal-pain","title":"Abdominal Pain","category":"Medical","severity":"Moderate","scene_safety":["Scene safety"],"mechanism":["Location, onset, character, radiation, vomiting, bowel/urinary symptoms, pregnancy"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Observations","Abdominal examination","Glucose","Pregnancy status where applicable"],"positive_findings":[],"negative_findings":[],"differentials":["GI causes","Renal causes","Gynaecological causes","Vascular causes","Sepsis"],"rp_diagnosis":["Severity depends on pain, observations, examination and trajectory."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["GI causes","Renal causes","Gynaecological causes"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"unconscious":{"id":"unconscious","title":"Unconscious Patient","category":"Medical","severity":"Critical","scene_safety":["Scene safety","unknown hazards"],"mechanism":["Found position, last known well, witnesses, medications, trauma, substances"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["ABCDE","GCS/AVPU","Glucose","Pupils","Temperature","ECG where indicated"],"positive_findings":[],"negative_findings":[],"differentials":["Hypoglycaemia","Stroke","Seizure","Overdose","Head injury","Metabolic causes"],"rp_diagnosis":["Reduced consciousness is a presentation, not a diagnosis."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Hypoglycaemia","Stroke","Seizure"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"reduced-consciousness":{"id":"reduced-consciousness","title":"Reduced Consciousness","category":"Medical","severity":"Critical","scene_safety":["Scene safety"],"mechanism":["Onset, baseline, witnesses, medications, substances, trauma"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["ABCDE","Glucose","GCS","Pupils","Temperature","ECG where indicated"],"positive_findings":[],"negative_findings":[],"differentials":["Metabolic","Neurological","Toxicological","Infective","Traumatic causes"],"rp_diagnosis":["Use serial neurological assessment and look for reversible causes."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Metabolic","Neurological","Toxicological"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"drowning":{"id":"drowning","title":"Drowning","category":"Environmental","severity":"Critical","scene_safety":["Water safety","hypothermia"],"mechanism":["Submersion time, rescue, breathing, CPR, water conditions"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Respiratory assessment","SpO2","Temperature","Neurological assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Respiratory injury","Hypothermia","Secondary trauma"],"rp_diagnosis":["Severity depends on respiratory and neurological status, not only submersion history."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Respiratory injury","Hypothermia","Secondary trauma"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"hypothermia":{"id":"hypothermia","title":"Hypothermia","category":"Environmental","severity":"Serious","scene_safety":["Cold environment","ongoing exposure"],"mechanism":["Exposure duration, wetness, environment, mental state"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Core/temperature assessment where available","Mental state","ECG","Observations"],"positive_findings":[],"negative_findings":[],"differentials":["Hypothermia","Arrhythmia","Other environmental injury"],"rp_diagnosis":["Handle according to the site's RP protocol; real-world management requires current guidance."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Hypothermia","Arrhythmia","Other environmental injury"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"heat-illness":{"id":"heat-illness","title":"Heat Illness","category":"Environmental","severity":"Serious","scene_safety":["Heat","ongoing exposure"],"mechanism":["Duration, exertion, fluid intake, mental state, medications"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Temperature","Mental state","Observations","Focused neurological assessment"],"positive_findings":[],"negative_findings":[],"differentials":["Heat exhaustion","Heat stroke","Dehydration","Other causes"],"rp_diagnosis":["Altered mental state with heat exposure is an urgent concern."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Heat exhaustion","Heat stroke","Dehydration"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"minor-illness-wound-review":{"id":"minor-illness-wound-review","title":"Minor Illness and Wound Review","category":"Other","severity":"Minor","scene_safety":["Standard scene safety"],"mechanism":["Symptoms, duration, wound history, treatments already given"],"primary_survey":{"catastrophic_haemorrhage":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"airway":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"breathing":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"circulation":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"disability":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"],"exposure":["Catastrophic haemorrhage","Airway","Breathing","Circulation","Disability","Exposure"]},"observations":["HR","RR","SpO2","BP","Temperature","GCS/AVPU","Pain","Glucose where relevant"],"focused_examination":["Focused examination","Observations if indicated"],"positive_findings":[],"negative_findings":[],"differentials":["Minor infection","Soft-tissue injury","Other uncomplicated illness"],"rp_diagnosis":["Use escalation criteria rather than assuming a minor presentation is benign."],"management":["Scene safety","Primary survey","Focused assessment","Serial observations","Reassessment","Escalate/transport according to red flags"],"medications":["Medication reference requires verification; no unverified dose is displayed."],"reassessment":["Repeat ABCDE after significant change/intervention","Compare observation trends","Document response"],"escalation_criteria":["Airway compromise","Severe respiratory distress","Shock or major haemorrhage","Reduced consciousness","New neurological deficit","Rapid deterioration"],"handover":"ATMIST / SBAR: incident, time, presentation, assessment, observations, treatment, response, relevant history, medications/allergies, concerns and ETA.","documentation":["Mechanism/presentation","Initial observations","ABCDE findings","Focused examination","Interventions","Response","Disposition/handover"],"complications":["Minor infection","Soft-tissue injury","Other uncomplicated illness"],"example_cases":[{"severity":"mild","observations":"Stable observations; symptoms localised."},{"severity":"moderate","observations":"Some abnormal findings requiring reassessment/escalation consideration."},{"severity":"severe","observations":"Multiple concerning findings or deterioration requiring urgent escalation."}]},"fall-from-height":{"id":"fall-from-height","title":"Fall from Height","short_title":"Fall from height","category":"Trauma","age_group":"16+","rp_only":true,"disclaimer":"REAL MEDICATION INFORMATION — FIVEM ROLE-PLAY ONLY. This content is fictionalised for FiveM gameplay and must not be used to diagnose or treat a real person. In a real emergency, call 999 or 112.","last_reviewed":"2025-02-01","severity":["moderate","serious","critical"],"incident_description":"A patient who has fallen from a height such as a roof, balcony, ladder, scaffolding, building, staircase, tree or cliff. Injury severity depends on height, landing surface, body position, body region impacted and whether the patient struck another object during the fall.","scene_safety":["Confirm the scene is safe before approaching.","Check for unstable structures, falling objects, electricity, fire, water, traffic, broken glass and unsafe ground.","Do not enter an unstable building or structure.","Request police, fire and additional medical resources where appropriate.","Identify the height of the fall and the landing surface.","Determine whether the patient landed on their head, neck, back, chest, abdomen, pelvis or limbs.","Establish whether the patient was trapped, impaled or crushed.","Identify the number of patients.","Consider whether the fall may have been related to assault, intoxication, medical collapse or self-harm.","Preserve evidence and follow safeguarding or police procedures where relevant."],"mechanism_questions":["Approximately how high was the fall?","What was the landing surface?","Did the patient land head-first, feet-first, on their side or on their back?","Did the patient strike another object before landing?","Was there a loss of consciousness?","Was the patient able to walk after the fall?","Was there a seizure or medical event before the fall?","Was alcohol or drug use suspected?","Was the fall witnessed?","Was the patient trapped or difficult to access?","Was there obvious bleeding?","Was the patient taking anticoagulants or antiplatelet medicines?","Could pregnancy be relevant?","What time did the fall occur?","What treatment has already been given?"],"initial_impression":["Treat a fall from significant height as potentially serious even if the patient is awake and talking.","Observe the patient's position, movement, speech, breathing effort, skin colour and distress.","Look for catastrophic haemorrhage before performing a detailed examination.","Assume spinal injury is possible when the mechanism is high energy, the patient has neck or back pain, neurological symptoms, reduced consciousness or distracting injuries.","Consider head, chest, abdominal, pelvic and limb injuries simultaneously.","Do not allow the patient to stand or walk if spinal, pelvic or lower-limb injury is suspected."],"primary_survey":{"catastrophic_haemorrhage":{"look_for":["Heavy external bleeding","Scalp wounds","Open fractures","Amputation or partial amputation","Penetrating injury","Blood pooling beneath the patient","Bleeding from the chest, abdomen, pelvis or limbs"],"actions":["Apply firm direct pressure to external bleeding.","Use a tourniquet in the RP system for life-threatening limb bleeding not controlled by direct pressure.","Record the time of tourniquet application.","Do not remove soaked dressings to inspect an actively bleeding wound.","Escalate immediately for uncontrolled bleeding or signs of shock."]},"airway":{"look_for":["Ability to speak","Gurgling, snoring or stridor","Blood or vomit in the mouth","Facial injury","Dental trauma","Reduced consciousness","Swelling around the mouth or neck"],"actions":["Ask an alert patient to speak.","Maintain manual in-line spinal protection if spinal injury is suspected.","Use basic airway manoeuvres and suction according to the server's authorised procedures.","Escalate immediately for a threatened or obstructed airway.","Do not give oral medication or fluids to a patient with reduced consciousness or a threatened airway."]},"breathing":{"look_for":["Respiratory rate and effort","Chest asymmetry","Chest pain","Reduced air entry","Open chest wound","Cyanosis","Paradoxical chest movement","Worsening oxygen saturation","Severe distress"],"actions":["Expose the chest enough to assess movement and wounds while preventing heat loss.","Apply an occlusive dressing to an open chest wound according to the server's equipment system.","Escalate urgently for severe respiratory distress, worsening oxygen saturation or suspected tension-pneumothorax-type presentation.","Do not delay transport for a prolonged examination."]},"circulation":{"look_for":["Heart rate","Blood pressure","Capillary refill","Skin colour and temperature","Weak or absent pulses","Abdominal pain or distension","Pelvic pain","Thigh deformity","Ongoing blood loss","Confusion, agitation or collapse"],"actions":["Control external haemorrhage.","Establish intravenous access in the RP system if authorised.","Keep the patient warm.","Do not repeatedly rock, compress or test the pelvis.","Apply a pelvic binder in the RP system only when high-energy trauma and suspected pelvic bleeding are present.","Escalate for shock, ongoing bleeding or deteriorating observations."]},"disability":{"look_for":["Glasgow Coma Scale","Pupil size and reactivity","Loss of consciousness","Confusion or agitation","Seizure","Severe headache","Vomiting","Weakness","Numbness","Loss of movement","Blood glucose where clinically relevant"],"actions":["Record GCS using eye, verbal and motor components.","Repeat neurological observations if there is head injury or abnormal consciousness.","Treat a falling GCS as a time-critical deterioration.","Do not assume intoxication explains abnormal consciousness until serious injury has been considered.","Escalate for GCS below 15, seizure, new neurological deficit or deterioration."]},"exposure_and_environment":{"look_for":["Scalp and facial wounds","Spinal tenderness","Chest injury","Abdominal bruising or distension","Pelvic pain","Open fractures","Limb deformity","Hidden bleeding","Cold or wet clothing"],"actions":["Expose only as much as required to assess injury.","Preserve dignity.","Prevent hypothermia.","Inspect the back only when safe and with sufficient assistance.","Record all visible injuries before covering the patient."]}},"observations":{"stable_pattern":{"heart_rate":"80-100 bpm","respiratory_rate":"12-20/min","blood_pressure":"Normal for the patient","oxygen_saturation":"96-100% on air","gcs":"15","pain_score":"2-6/10","skin":"Warm, normal colour, capillary refill less than 2 seconds"},"concerning_pattern":{"heart_rate":"100-120 bpm","respiratory_rate":"20-28/min","blood_pressure":"Normal or borderline low","oxygen_saturation":"92-95% on air or falling","gcs":"13-15 or confused","pain_score":"6-9/10","skin":"Pale, cool or sweaty; capillary refill may be delayed"},"critical_pattern":{"heart_rate":"120 bpm or higher, or abnormally slow in a deteriorating patient","respiratory_rate":"Below 8, above 30 or visibly inadequate","blood_pressure":"Falling or markedly low","oxygen_saturation":"Below 92% or rapidly falling","gcs":"8 or less, or a clear downward trend","pain_score":"Severe or rapidly worsening","skin":"Mottled, grey, blue, cold or clammy"},"observation_rules":["Normal initial observations do not exclude serious injury.","Repeat observations after every major intervention and whenever symptoms change.","Record the trend rather than only the latest values.","Interpret observations alongside the mechanism and examination findings."]},"focused_examination":{"head_and_face":["Scalp wound or swelling","Facial deformity","Blood from the nose or ears","Loose or missing teeth","Pupil abnormality","Loss of consciousness","Vomiting","Seizure","Severe or worsening headache"],"neck_and_spine":["Neck pain","Midline tenderness","Back pain","Spinal deformity","Weakness","Numbness","Tingling","Loss of movement","New bladder or bowel symptoms where relevant"],"chest":["Chest pain","Chest-wall tenderness","Unequal chest movement","Open wound","Reduced air entry","Crepitus-type finding","Increasing respiratory effort"],"abdomen_and_pelvis":["Abdominal pain","Abdominal distension","Bruising","Guarding or rigidity-type presentation","Pelvic pain","Pain on movement","Genital injury","Signs of shock"],"limbs":["Deformity","Shortening or abnormal rotation","Swelling","Open wound","Bleeding","Reduced movement","Altered sensation","Weak or absent distal pulse","Pale or cold limb"]},"differential_diagnoses":["Minor soft-tissue injury","Closed fracture","Open fracture","Dislocation","Head injury or concussion","Intracranial bleeding","Cervical spine injury","Thoracic spine injury","Lumbar spine injury","Pneumothorax-type presentation","Haemothorax-type presentation","Abdominal organ injury","Pelvic fracture","Internal haemorrhage","Traumatic shock","Spinal cord injury","Crush injury","Medical collapse preceding the fall","Drug or alcohol intoxication complicating trauma","Self-harm or safeguarding concern"],"likely_rp_diagnoses":{"minor":["Superficial soft-tissue injury","Bruising","Minor sprain","Small laceration"],"moderate":["Closed limb fracture","Dislocation","Concussion with GCS 15","Chest-wall injury","Back strain without neurological deficit"],"serious":["Open fracture","Multiple fractures","Significant head injury","Spinal injury","Chest injury with respiratory compromise","Suspected internal bleeding","Pelvic injury"],"critical":["Uncontrolled catastrophic haemorrhage","Severe traumatic shock","Airway obstruction","Severe respiratory failure","Cardiac arrest","GCS 8 or less","Suspected intracranial bleeding","Suspected major internal haemorrhage","Spinal cord injury with neurological deficit"]},"immediate_management":["Use the &lt;C&gt;ABCDE sequence.","Control catastrophic haemorrhage first.","Maintain spinal protection when clinically indicated.","Establish monitoring and repeat observations.","Treat life-threatening problems before minor injuries.","Immobilise suspected fractures in the position found unless an authorised server protocol permits otherwise.","Do not repeatedly manipulate suspected spinal, pelvic or limb injuries.","Keep the patient warm.","Minimise time at scene after immediate life-saving interventions.","Pre-alert the receiving hospital for serious or critical trauma.","Transport major trauma to the server's designated major trauma centre."],"medications":[{"medication_id":"morphine-sulfate-iv-adult","when_to_consider":"Severe traumatic pain after the primary survey, if there is no contraindication.","requires_senior_authorisation":true},{"medication_id":"tranexamic-acid-iv-trauma-adult","when_to_consider":"Major trauma with active or suspected significant haemorrhage within the appropriate time window.","requires_senior_authorisation":true}],"reassessment":{"after_initial_assessment":["Repeat the complete primary survey.","Repeat heart rate, respiratory rate, blood pressure, oxygen saturation and GCS.","Repeat pain score.","Repeat pupil assessment if head injury is suspected.","Repeat distal circulation, sensation and movement for limb injuries."],"after_medication":["Repeat observations within the server's configured interval.","Document response and adverse effects.","Do not administer further opioid if respiratory rate falls, consciousness deteriorates or oxygen saturation falls."],"during_transport":["Repeat observations at regular intervals.","Repeat immediately if the patient deteriorates.","Record all trends.","Update the receiving hospital if the condition changes."]},"escalation_criteria":["Fall from significant height with suspected major trauma","Head-first landing","Loss of consciousness","GCS below 15 or falling GCS","Seizure","Repeated vomiting","Severe or worsening headache","New weakness, numbness or paralysis","Neck or spinal midline tenderness","Severe chest pain or respiratory distress","Falling oxygen saturation","Abdominal pain, distension or guarding","Pelvic pain with shock features","Open fracture","Gross deformity","Absent distal pulse","Uncontrolled bleeding","Suspected internal haemorrhage","Abnormal or deteriorating observations","Anticoagulant or antiplatelet use with head injury","Suspected intoxication masking neurological deterioration","Possible self-harm or safeguarding concern"],"disposition":{"minor":["Only consider minor disposition if the mechanism is low risk, the patient has a reassuring examination, observations are normal and there are no red flags.","Provide RP safety-netting and document the decision."],"moderate":["Transport to the designated emergency department for clinical assessment and imaging.","Repeat observations during transport."],"serious_or_critical":["Pre-alert the designated major trauma centre.","Use the shortest safe route.","Provide immediate life-saving treatment at scene.","Request senior clinician or specialist backup.","Do not delay transport for a prolonged secondary survey."]},"handover":{"format":"ATMIST","template":"This is a [age]-year-old [sex] who fell approximately [height] from [object/location] onto [surface] at [time]. The patient landed [body position]. Suspected injuries are [injuries]. Initial observations were HR [value], RR [value], BP [value], SpO2 [value], GCS [value] and pain [value]/10. Key positive findings are [findings]. Key negative findings are [findings]. Treatment given was [treatment and medication]. The response was [response]. Estimated arrival is [time]. Additional requirements are [requirements].","example":"This is a 41-year-old following a fall of approximately 5 metres from scaffolding onto concrete at 15:10. The patient landed on their left side and did not lose consciousness. Suspected injuries are left chest trauma, pelvic injury and a left femur fracture. Initial observations are pulse 124, respiratory rate 28, blood pressure 94/60, oxygen saturation 94% on air, GCS 15 and pain 9/10. The patient is pale and clammy with left thigh deformity and abdominal tenderness. External bleeding is controlled. Morphine was administered under the RP medication protocol. The patient remains borderline and is being transferred to the major trauma centre."},"documentation":["Time of incident","Time of first patient contact","Height and type of fall","Landing surface","Landing position","Scene hazards","Whether the patient was trapped","Possible medical event before the fall","Primary survey findings","Initial and repeat observations","GCS and pupils","All injuries identified","Bleeding-control methods and times","Spinal or pelvic precautions","Medication name, dose, route, time and response","Allergies and relevant medical history","Anticoagulant or antiplatelet use","Pre-alert time and recipient","Destination","Final handover"],"complications":["Intracranial bleeding","Spinal cord injury","Traumatic shock","Internal abdominal or pelvic haemorrhage","Pneumothorax-type presentation","Open fracture","Compartment-syndrome-type deterioration","Hypothermia","Medication-induced respiratory depression","Missed injury caused by intoxication or altered mental state"],"example_cases":[{"id":"fall-low-height-minor","description":"A patient falls from the bottom two steps of a staircase and lands on their hand. They remain alert and have isolated wrist pain.","observations":{"heart_rate":88,"respiratory_rate":16,"blood_pressure":"132/80","oxygen_saturation":99,"gcs":15,"pain_score":5},"likely_diagnosis":"Suspected wrist injury","red_flags":["Head impact","Loss of consciousness","Neck pain","Neurological symptoms","Deformity or absent distal pulse"]},{"id":"fall-height-moderate","description":"A patient falls approximately 3 metres from a ladder onto their feet and develops severe ankle pain with deformity. They remain alert and haemodynamically stable.","observations":{"heart_rate":104,"respiratory_rate":20,"blood_pressure":"120/76","oxygen_saturation":98,"gcs":15,"pain_score":8},"likely_diagnosis":"Suspected ankle fracture or dislocation","red_flags":["Open wound","Absent distal pulse","Altered sensation","Severe back pain","Pelvic pain","Deteriorating observations"]},{"id":"fall-height-critical","description":"A patient falls approximately 6 metres from a roof onto concrete. They are confused, pale and tachycardic, with chest pain and abdominal tenderness.","observations":{"heart_rate":132,"respiratory_rate":30,"blood_pressure":"86/54","oxygen_saturation":91,"gcs":12,"pain_score":10},"likely_diagnosis":"Major trauma with suspected internal haemorrhage, chest injury and head injury","red_flags":["High-energy mechanism","Abnormal mental state","Hypotension","Tachycardia","Hypoxia","Abdominal tenderness","Chest pain"]}],"sources":[{"title":"NICE: Major trauma: assessment and initial management","url":"https://www.nice.org.uk/guidance/ng39/chapter/recommendations"},{"title":"NICE: Head injury: assessment and early management","url":"https://www.nice.org.uk/guidance/ng232/chapter/recommendations"},{"title":"NICE: Major trauma: service delivery","url":"https://www.nice.org.uk/guidance/ng40/chapter/recommendations"}]},"fractures-open-fractures":{"id":"fractures-open-fractures","title":"Fractures and Open Fractures","short_title":"Fractures / Open fractures","category":"Trauma","age_group":"16+","rp_only":true,"disclaimer":"FiveM role-play educational guide. This content is not a substitute for clinical training or local trauma protocols. In a real emergency, call 999 or 112.","last_reviewed":"2026-09-28","severity":["moderate","serious","critical"],"incident_description":"Educational overview of suspected fractures and open fractures, including assessment, neurovascular checks, immobilisation, escalation and documentation.","scene_safety":["Follow <C>ABCDE if there is significant trauma.","Control life-threatening bleeding before detailed limb assessment.","Avoid unnecessary manipulation of a suspected fracture.","Do not repeatedly probe or explore an open wound."],"mechanism_questions":["Mechanism and energy of injury","Time of injury","Direct blow, twisting, crush or axial loading","Fall height or road-traffic mechanism","Contamination with soil, water, sewage or animal material","Bleeding and treatment already given","Anticoagulant or antiplatelet use","Comorbidities, allergies and tetanus status","Ability to move or weight-bear before immobilisation","Numbness, weakness or altered sensation"],"initial_impression":["Consider a fracture with pain, point tenderness, swelling, bruising, loss of function, inability to weight-bear, reduced movement or deformity.","An open fracture should be presumed when there is a wound near a fracture until proven otherwise.","Do not repeatedly manipulate a suspected fracture to confirm it.","Imaging must not delay treatment of life-threatening haemorrhage, vascular compromise or a threatened limb."],"primary_survey":{"catastrophic_haemorrhage":["Control major bleeding.","Escalate uncontrolled bleeding or threatened limb.","Record bleeding-control intervention and time."],"airway":["Follow <C>ABCDE where significant trauma is present."],"breathing":["Assess for associated chest injury in major trauma."],"circulation":["Assess pulse, colour, temperature, capillary refill and bleeding.","Look for expanding haematoma or limb ischaemia.","Hard vascular signs include absent palpable pulse, continued significant blood loss and expanding haematoma."],"disability":["Assess sensation and motor function in relevant nerve territories.","Record altered sensation, weakness or paralysis."],"exposure_and_environment":["Inspect skin integrity and wounds while maintaining dignity and warmth.","Look for open fracture, deformity and contamination."]},"observations":{"required":["Heart rate","Respiratory rate","Blood pressure","Oxygen saturation","Temperature","Glasgow Coma Scale where relevant","Pain score","Skin colour","Skin temperature","Capillary refill","Distal pulse where a limb injury is present"],"trend_rules":["Document neurovascular assessment before and after realignment, reduction or splinting.","Record observations and pain score.","For RP use, require a second neurovascular assessment after any splint, reduction or movement."]},"focused_examination":{"fracture_findings":["Pain and point tenderness","Swelling or bruising","Loss of function","Inability to weight-bear","Reduced range of movement","Deformity, angulation, shortening or abnormal rotation","Bony tenderness","Abnormal movement at the injury site","Wound or exposed bone"],"circulation":["Skin colour","Skin temperature","Capillary refill","Distal pulses","Presence of bleeding","Expanding haematoma","Evidence of limb ischaemia"],"sensory":["Sensation in relevant nerve territories compared with the uninjured limb"],"motor":["Active movement and weakness where safe and appropriate"],"compartment_syndrome":["Pain out of proportion","Increasing pain despite analgesia","Pain on passive stretch","Tense or swollen compartment","Paresthesia or altered sensation","Progressive weakness","Increasing analgesic requirement","Deep, tight or bursting pain"]},"differential_diagnoses":["Closed fracture","Open fracture","Dislocation","Soft-tissue injury","Vascular injury","Compartment syndrome","Pelvic fracture with internal bleeding","Associated major trauma"],"likely_rp_diagnoses":{"moderate":["Suspected closed distal radius fracture","Suspected closed limb fracture"],"serious":["Suspected open tibial fracture","Fracture with distal neurovascular compromise"],"critical":["Suspected compartment syndrome","Suspected femoral shaft fracture with possible haemorrhagic shock","Suspected pelvic fracture with internal bleeding"]},"immediate_management":{"closed_fracture":["Follow <C>ABCDE if significant trauma.","Control major bleeding.","Remove rings, watches and restrictive clothing early if swelling is expected.","Support and immobilise the limb in the position found.","Avoid unnecessary movement.","Assess and document neurovascular status before and after splinting.","Provide appropriate analgesia according to the authorised protocol.","Keep the patient warm.","Arrange imaging and definitive orthopaedic assessment.","Escalate immediately for deformity, neurovascular compromise, severe pain or high-energy mechanism."],"open_fracture":["Control life-threatening bleeding.","Do not push exposed bone back into the wound.","Do not repeatedly inspect, probe or manipulate the wound.","Remove only obvious gross contamination if necessary.","Cover with sterile saline-soaked gauze and an occlusive dressing.","Do not perform a pre-hospital or emergency-department mini-washout of long-bone, hindfoot or midfoot open fractures before formal wound excision.","Give IV prophylactic antibiotics as soon as possible, preferably within 1 hour of injury, without delaying transport; exact regimen follows local trauma-network protocol.","Realign and splint if necessary, particularly with vascular compromise or gross deformity.","Repeat and record neurovascular findings after realignment or splinting.","Arrange urgent orthopaedic and plastic-surgery/orthoplastic review where appropriate."],"investigations":["Plain radiographs are usually the initial test for an isolated suspected fracture.","Image the joint above and below where clinically relevant.","CT is particularly important for complex, intra-articular, pelvic or multiple injuries.","In adults with blunt major trauma and suspected multiple injuries, whole-body CT may be appropriate according to the major-trauma pathway.","Do not delay life-saving treatment for imaging."]},"reassessment":{"required":["Repeat neurovascular assessment after splinting, reduction, realignment or movement.","Repeat pain and observations.","Monitor for worsening pain, sensory change, weakness or vascular compromise."],"compartment_syndrome":["Maintain particular awareness for at least 48 hours after tibial fracture or fixation, with regular documented assessments.","Pulselessness, paralysis and marked pallor are late findings; a palpable pulse does not exclude compartment syndrome."]},"escalation_criteria":["Absent or worsening distal pulse","Expanding haematoma","Uncontrolled bleeding","Pale, cold or mottled limb","New numbness, weakness or paralysis","Severe pain disproportionate to findings","Pain on passive stretch","Tense compartments","Open fracture","Exposed bone","Gross deformity or dislocation","Suspected pelvic fracture with shock","High-energy mechanism","Crush injury","Amputation or threatened amputation","Complicated fracture with chest, abdominal, head or spinal injury","Deteriorating observations or altered consciousness"],"disposition":{"open_fracture":["Suspected open fractures of long bones, hindfoot or midfoot require direct transfer to a major trauma or specialist centre able to provide orthoplastic care according to the supplied NICE reference.","Hand, wrist, forefoot and digit injuries may follow a different local pathway."],"closed_fracture":["Arrange imaging and definitive orthopaedic assessment.","Escalate immediately for deformity, neurovascular compromise, severe pain or high-energy mechanism."]},"handover":{"format":"ATMIST","template":"This is a [age]-year-old [sex] with a suspected [fracture type/site]. Mechanism was [mechanism] at [time]. Skin integrity is [finding]. Neurovascular assessment before splinting was [finding]. Treatment given was [treatment]. Post-splint neurovascular findings are [finding]. Destination is [destination]."},"documentation":["Mechanism and time of injury","Site and suspected fracture type","Skin integrity and wound description","Contamination","Bleeding and treatment","Pulse, colour, temperature and capillary refill","Sensory and motor findings","Observations and pain score","Pre- and post-splint neurovascular status","Analgesia and antibiotics administered","Senior clinician or trauma-centre contact","Destination and handover"],"complications":["Compartment syndrome","Vascular compromise","Infection","Tissue loss","Internal bleeding","Neurovascular injury","Missed associated trauma"],"example_cases":[{"id":"closed-distal-radius","description":"Suspected closed distal radius fracture with pain, swelling and reduced wrist function.","likely_diagnosis":"Suspected closed distal radius fracture","red_flags":["Neurovascular compromise","Open wound","Gross deformity","High-energy mechanism"]},{"id":"open-tibial","description":"Suspected open tibial fracture with an adjacent wound and contamination.","likely_diagnosis":"Suspected open tibial fracture","red_flags":["Exposed bone","Uncontrolled bleeding","Absent distal pulse","Compartment-syndrome features"]},{"id":"compartment-syndrome","description":"Suspected compartment syndrome with escalating pain and pain on passive stretch.","likely_diagnosis":"Suspected compartment syndrome","red_flags":["Progressive sensory change","Weakness","Tense compartment","Vascular deterioration"]}],"sources":[{"title":"NICE: Major trauma: assessment and initial management","url":"https://www.nice.org.uk/guidance/ng39/chapter/recommendations"},{"title":"NICE: Fractures (complex): assessment and management","url":"https://www.nice.org.uk/guidance/ng37/chapter/recommendations"}]},"adult-convulsive-status-epilepticus":{"id":"adult-convulsive-status-epilepticus","title":"Adult Convulsive Status Epilepticus — Complete Simulation","short_title":"Convulsive Status Epilepticus","category":"Neurology","age_group":"Adult 16+","severity":["Critical"],"rp_only":true,"last_reviewed":"2026-09-29","disclaimer":"SIMULATION / ROLE-PLAY ONLY. This pathway is educational and is not a substitute for supervised clinical practice, an individual emergency care plan, prescribing instructions, or local clinical protocol. The observations are fictional and the medication quantities are the supplied simulation scenario; do not generalise them to real patients.","incident_description":"Adult with known epilepsy and a generalised tonic–clonic seizure. Simulation assumption: no immediately available individualised emergency plan. Buccal midazolam preparation is 5 mg/mL, supplied as 10 mg in 2 mL. Observations are fictional but realistic for an OSCE/simulation.","scene_safety":["Check the environment for hazards and activate the emergency response.","Move nearby hazards away, protect the patient's head with a folded blanket if safe and remove glasses if safe.","Do not restrain the patient.","Do not put anything in the patient's mouth."],"initial_impression":["A seizure lasting 5 minutes or more is treated in this simulation as convulsive status epilepticus and requires immediate treatment.","Start timing the seizure and continuously reassess airway, breathing and circulation."],"primary_survey":{"airway":["During active convulsions, assess airway as safely as possible without putting fingers into the mouth.","Prepare suction and airway equipment."],"breathing":["Assess chest movement, respiratory effort, skin colour and oxygen saturation.","Apply high-concentration oxygen in the supplied scenario and continue respiratory monitoring."],"circulation":["Apply ECG and blood-pressure monitoring.","Establish IV access when safe without delaying seizure treatment."],"disability":["Check capillary blood glucose.","Assess seizure activity, consciousness and postictal state."],"exposure":["After convulsions stop, assess for head injury, tongue trauma, aspiration, shoulder injury, urinary incontinence and other trauma."]},"observations":{"initial_simulation":["Airway: not fully assessable during convulsions; no obvious visible obstruction.","Breathing: irregular, approximately 8–30 breaths/min.","SpO₂: 86% on air, intermittently recorded because of movement.","Pulse: 132 bpm.","Blood pressure: 168/96 mmHg.","Respiratory rate: irregular, approximately 24/min.","Temperature: 36.8°C.","Capillary glucose: 6.4 mmol/L.","GCS: 3/15 during active convulsions.","Pupils: equal and reactive when assessable.","Skin: pale, mildly cyanosed around the lips."],"after_first_dose":["Airway: patent but secretions present.","Breathing: irregular, 10–18/min.","SpO₂: 94% on high-concentration oxygen.","Pulse: 124 bpm.","Blood pressure: 158/90 mmHg.","Respiratory rate: 16/min, intermittently irregular.","Capillary glucose: 6.4 mmol/L.","GCS: 3/15 during ongoing convulsions.","ECG: sinus tachycardia.","Seizure activity: ongoing bilateral tonic–clonic movements."],"at_14_11":["Airway: patent; suction available.","SpO₂: 96% on oxygen.","Pulse: 118 bpm.","Blood pressure: 150/86 mmHg.","Respiratory rate: 12/min, irregular.","Capillary glucose: 6.2 mmol/L.","GCS: 3/15.","ECG: sinus tachycardia.","Seizure activity: ongoing."],"postictal":["Airway: patent; gurgling secretions cleared with suction.","Breathing: spontaneous, 18/min.","SpO₂: 98% on oxygen.","Pulse: 104 bpm.","Blood pressure: 138/82 mmHg.","Respiratory rate: 18/min.","Temperature: 36.9°C.","Capillary glucose: 6.1 mmol/L.","GCS: 8/15 — E2 V2 M4.","Pupils: equal and reactive.","ECG: sinus tachycardia.","Seizure activity: stopped."]},"focused_examination":["Confirm seizure onset time and duration.","Check for head injury, tongue trauma, aspiration, shoulder injury and other trauma.","Assess airway protection, respiratory status and postictal neurological state after the convulsion stops."],"management":["At 5 minutes in this simulation, retrieve buccal midazolam and perform patient, allergy, medication, expiry, packaging and solution checks.","Perform an independent second medication check.","Administer the supplied simulation dose by the buccal route when safe.","Immediately reassess airway, breathing, circulation and seizure activity after each dose.","If seizure continues after the first dose, reassess and escalate.","If seizure continues after two benzodiazepine doses, obtain urgent senior, anaesthetic and neurology support and prepare second-line treatment according to local status epilepticus protocol.","If the patient becomes apnoeic, provide airway and ventilation support and continue resuscitation according to the local ALS/status epilepticus protocol.","After seizure cessation, maintain airway positioning, use the recovery position when safe, continue monitoring and withhold oral intake until safe swallowing is established."],"reassessment":["Repeat airway, breathing, oxygen saturation, pulse, blood pressure, respiratory rate, consciousness/GCS and capillary glucose.","Continue ECG, pulse oximetry and respiratory monitoring.","Monitor closely for delayed respiratory depression after midazolam.","Document seizure cessation time and treatment response."],"escalation_criteria":["Ongoing convulsive seizure after the first benzodiazepine dose.","Ongoing convulsive seizure after two benzodiazepine doses.","Apnoea or inadequate breathing.","Airway compromise or aspiration.","Need for second-line antiseizure medication, anaesthetic support, intubation, ventilation or critical-care transfer."],"handover":"This is an adult with known epilepsy who developed a generalised tonic–clonic seizure at 14:00. The seizure lasted 18 minutes in total. Initial observations were pulse 132, blood pressure 168/96, respiratory rate irregular at approximately 24, SpO₂ 86% on air and capillary glucose 6.4 mmol/L. Buccal midazolam 10 mg, 2 mL of the 5 mg/mL preparation, was administered at 14:06. The seizure continued, so a second 10 mg buccal dose was administered at 14:16. The seizure stopped at 14:18. Current observations are pulse 104, blood pressure 138/82, respiratory rate 18, SpO₂ 98% on oxygen, glucose 6.1 mmol/L and GCS 8/15. The patient is postictal but breathing spontaneously.","documentation":["Seizure onset and end time.","Observations and oxygen therapy.","Capillary glucose.","Medication name, concentration, dose, route and exact administration times.","Response to treatment and escalation.","Senior clinician, anaesthetic/neurology involvement and disposition.","Individualised emergency seizure plan and specialist follow-up arrangements where applicable."],"example_cases":[{"id":"adult-convulsive-status-simulation","severity":"Critical","description":"Adult with known epilepsy, generalised tonic–clonic seizure beginning at 14:00, continuing for 18 minutes in the supplied simulation. Buccal midazolam is available as 10 mg in 2 mL at 5 mg/mL.","observations":{"initial seizure duration":"5 minutes at first treatment point","initial SpO₂":"86% on air","initial pulse":"132 bpm","initial BP":"168/96 mmHg","initial glucose":"6.4 mmol/L"},"likely_diagnosis":"Convulsive status epilepticus / time-critical ongoing convulsive seizure","red_flags":["Airway compromise","Apnoea or respiratory depression","Persistent seizure after benzodiazepines","Hypoglycaemia","Aspiration","Trauma"]}],"medication_reference":{"scenario":"Buccal midazolam 10 mg in 2 mL, concentration 5 mg/mL.","simulation_instruction":"For this supplied simulation only, the adult dose is midazolam 10 mg buccally, equivalent to 2 mL of the 5 mg/mL preparation. Confirm authorisation and local protocol in any real clinical setting.","checks":["Patient identity","Allergy status","Medication plan/authorisation","Medication name and concentration","Expiry date and packaging","Dose and route","Independent second check where required"]},"simulation_markdown":"# Adult convulsive status epilepticus — complete simulation\n\n**Simulation assumption:** adult with known epilepsy, generalised tonic–clonic seizure, no immediately available individualised emergency plan. Buccal midazolam preparation: **5 mg/mL**, supplied as **10 mg in 2 mL**. The observations below are fictional but realistic for an OSCE/simulation. A seizure lasting **5 minutes or more** is convulsive status epilepticus and requires immediate treatment. [1]          &#x20;\n\n---\n\n## 14:00 — seizure begins\n\n`/me checks the environment for hazards, approaches the patient and activates the emergency buzzer`\n\n\\> “I’m staying with the patient. Please call the emergency team, bring the resuscitation trolley, oxygen, suction and buccal midazolam. Start timing the seizure.”\n\n`/me removes nearby hazards, protects the patient’s head with a folded blanket and removes their glasses if safe`\n\n`/me does not restrain the patient and does not put anything in the patient’s mouth`\n\n### Initial observations during the seizure\n\n- **Airway:** not assessable fully during convulsions; no obvious visible obstruction\n- **Breathing:** irregular, approximately **8–30 breaths/min**\n- **SpO₂:** **86% on air**, reading intermittently because of movement\n- **Pulse:** **132 bpm**, palpable\n- **Blood pressure:** **168/96 mmHg**\n- **Respiratory rate:** irregular, approximately **24/min**\n- **Temperature:** **36.8°C**\n- **Capillary glucose:** **6.4 mmol/L**\n- **GCS:** **3/15 during active convulsions**\n- **Pupils:** equal and reactive when assessable\n- **Skin:** pale, mildly cyanosed around the lips\n\n`/me applies pulse oximetry, ECG monitoring and a blood-pressure cuff`\n\n`/me applies high-concentration oxygen via a non-rebreather mask and prepares suction`\n\n\\> “The patient is hypoxic during the seizure. Oxygen is being administered, and I’m preparing suction and airway equipment.”\n\n`/me asks a colleague to obtain capillary glucose and prepare IV access`\n\n\\> “Please obtain capillary glucose, establish IV access when safe and bring the patient’s medication list and emergency plan.”\n\n---\n\n## 14:05 — seizure reaches 5 minutes\n\n`/me checks the clock and confirms the seizure has lasted 5 minutes`\n\n\\> “This is convulsive status epilepticus. I’m going to administer first-line benzodiazepine treatment.”\n\n### Medication preparation\n\n`/me retrieves the buccal midazolam from the emergency medication pack`\n\n`/me checks the patient’s identity, allergies, medication history, expiry date, packaging and solution`\n\n`/me reads the label aloud`\n\n\\> “Buccal midazolam 10 mg in 2 mL. Concentration 5 mg/mL. Oral pre-filled syringe.”\n\n`/me asks a second clinician to perform an independent medication check`\n\n\\> “Please independently check midazolam 10 mg, equivalent to 2 mL of the 5 mg/mL preparation, by the buccal route.”\n\n`/me opens the outer packaging and removes the pre-filled oral syringe`\n\n`/me checks the label again and removes the cap`\n\n`/me does not attach a needle, IV tubing or any other device`\n\nThe adult dose in this simulation is **midazolam 10 mg buccally**, equivalent to **2 mL of a 5 mg/mL preparation**. [2]          &#x20;\n\n---\n\n## 14:06 — first dose administered\n\n`/me positions at the side of the patient and waits for a safe opportunity to access the cheek`\n\n`/me places the syringe tip into the buccal space between the gum and cheek`\n\n\\> “Administering midazolam 10 mg, 2 mL, by the buccal route now.”\n\n`/me slowly administers the full 2 mL into the buccal space`\n\n`/me removes the syringe and disposes of it safely`\n\n\\> “Midazolam 10 mg buccally administered at 14:06.”\n\n`/me immediately reassesses airway, breathing, circulation and seizure activity`\n\n### Observations after first dose\n\n- **Airway:** patent but secretions present\n- **Breathing:** irregular, **10–18/min**\n- **SpO₂:** **94% on high-concentration oxygen**\n- **Pulse:** **124 bpm**\n- **Blood pressure:** **158/90 mmHg**\n- **Respiratory rate:** **16/min**, intermittently irregular\n- **Capillary glucose:** **6.4 mmol/L**\n- **GCS:** **3/15 during ongoing convulsions**\n- **ECG:** sinus tachycardia\n- **Seizure activity:** ongoing bilateral tonic–clonic movements\n\n`/me suctions visible oral secretions without placing fingers into the mouth`\n\n`/me continues oxygen, ECG, pulse oximetry and blood-pressure monitoring`\n\n---\n\n## 14:11 — seizure continues\n\n`/me checks the exact time of the first dose and confirms that no other benzodiazepine has been administered`\n\n\\> “The seizure is ongoing five minutes after the first dose. I’m reassessing ABCDE and escalating to the senior clinician.”\n\n`/me reassesses the airway, breathing, pulse, blood pressure and oxygen saturation`\n\n### Observations\n\n- **Airway:** patent; suction available\n- **SpO₂:** **96% on oxygen**\n- **Pulse:** **118 bpm**\n- **Blood pressure:** **150/86 mmHg**\n- **Respiratory rate:** **12/min**, irregular\n- **Capillary glucose:** **6.2 mmol/L**\n- **GCS:** **3/15**\n- **ECG:** sinus tachycardia\n- **Seizure activity:** ongoing\n\n`/me confirms that emergency support has been called and IV access is being attempted`\n\n---\n\n## 14:16 — second dose\n\nThe patient remains convulsing 10 minutes after the first dose.\n\n`/me checks the local protocol and confirms that a second benzodiazepine dose is authorised`\n\n`/me retrieves a second buccal midazolam syringe`\n\n`/me checks the patient, drug, concentration, dose, route, expiry and administration history`\n\n\\> “Second check: midazolam 10 mg, 2 mL of the 5 mg/mL preparation, buccal route.”\n\n`/me opens the syringe, removes the cap and positions at the side of the patient`\n\n`/me administers the solution slowly into the buccal space`\n\n\\> “Second dose of midazolam 10 mg administered buccally at 14:16.”\n\n`/me documents a cumulative midazolam dose of 20 mg`\n\n`/me continues airway and respiratory monitoring and prepares for possible assisted ventilation`\n\n---\n\n## 14:18 — seizure stops\n\n`/me observes cessation of tonic–clonic movements and records the end time`\n\n\\> “The seizure has stopped at 14:18.”\n\n`/me maintains airway positioning and places the patient into the recovery position`\n\n`/me continues oxygen, ECG, pulse oximetry and blood-pressure monitoring`\n\n### Postictal observations\n\n- **Airway:** patent; gurgling secretions cleared with suction\n- **Breathing:** spontaneous, **18/min**\n- **SpO₂:** **98% on oxygen**\n- **Pulse:** **104 bpm**\n- **Blood pressure:** **138/82 mmHg**\n- **Respiratory rate:** **18/min**\n- **Temperature:** **36.9°C**\n- **Capillary glucose:** **6.1 mmol/L**\n- **GCS:** **8/15 — E2 V2 M4**\n- **Pupils:** equal and reactive\n- **ECG:** sinus tachycardia\n- **Seizure activity:** stopped\n\n\\> “The seizure has stopped. The patient remains postictal and sedated but is breathing spontaneously. I will continue close respiratory monitoring because of the risk of delayed respiratory depression after midazolam.”\n\n`/me withholds food, drink and oral medication until the patient is awake and can swallow safely`\n\n`/me checks for head injury, tongue trauma, aspiration, shoulder injury and urinary incontinence`\n\n---\n\n# Alternative branch: if the seizure does not stop\n\nIf the patient remains convulsing after two benzodiazepine doses:\n\n`/me calls the senior doctor, anaesthetic team and neurology team`\n\n\\> “This is ongoing convulsive status epilepticus despite two benzodiazepine doses. I need urgent anaesthetic and neurology support.”\n\n`/me ensures oxygen, suction, bag-valve-mask equipment and airway adjuncts are immediately available`\n\n`/me assists with IV or intraosseous access`\n\n`/me repeats capillary glucose and obtains blood samples`\n\n`/me prepares second-line antiseizure medication according to the local status epilepticus protocol`\n\nA commonly used hospital regimen is **levetiracetam 60 mg/kg IV, maximum 4.5 g**. For a 70 kg adult, this would calculate to **4.2 g IV**; the prescribing clinician must confirm the dose, preparation, dilution and infusion rate according to local policy.\n\n`/me continues ECG, blood-pressure, oxygen-saturation and respiratory monitoring`\n\n`/me prepares for possible rapid sequence induction, intubation, ventilation and transfer to critical care`\n\nNICE recommends IV levetiracetam, phenytoin or sodium valproate after failure of two benzodiazepine doses, with expert guidance for further treatment. [1]          &#x20;\n\n---\n\n# If the patient becomes apnoeic\n\n`/me recognises absent or inadequate breathing and calls for immediate airway assistance`\n\n\\> “The patient is apnoeic. I’m commencing airway and ventilation support.”\n\n`/me opens the airway, suctions visible secretions and begins bag-valve-mask ventilation with high-flow oxygen`\n\n`/me asks a colleague to confirm a pulse and prepare the defibrillator`\n\n`/me continues resuscitation according to the ALS algorithm and local status epilepticus protocol`\n\n---\n\n# Final handover\n\n`/me gives a structured handover to the senior clinician`\n\n\\> “This is an adult with known epilepsy who developed a generalised tonic–clonic seizure at 14:00. The seizure lasted 18 minutes in total. Initial observations were pulse 132, blood pressure 168/96, respiratory rate irregular at approximately 24, SpO₂ 86% on air and capillary glucose 6.4 mmol/L.\\\n\\> > Buccal midazolam 10 mg, 2 mL of the 5 mg/mL preparation, was administered at 14:06. The seizure continued, so a second 10 mg buccal dose was administered at 14:16. The seizure stopped at 14:18. Current observations are pulse 104, blood pressure 138/82, respiratory rate 18, SpO₂ 98% on oxygen, glucose 6.1 mmol/L and GCS 8/15. The patient is postictal but breathing spontaneously.”\n\n`/me documents the seizure onset and end time, observations, oxygen therapy, glucose, medication name, concentration, dose, route, exact administration times, response and escalation`\n\n`/me ensures an individualised emergency seizure plan and specialist follow-up are arranged before discharge`\n\n### References\n\n1. [7 Treating status epilepticus, repeated or cluster seizures ...](https://www.nice.org.uk/guidance/ng217/chapter/treating-status-epilepticus-repeated-or-cluster-seizures-and-prolonged-seizures)                                                                                                                         &#x20;\n\n   www\\.nice.org.uk › ...\n2. [\\[DOC\\] Buccal midazolam National PGD template V2 FINAL Feb 23](https://www.sps.nhs.uk/wp-content/uploads/2021/10/Buccal-midazolam-National-PGD-template-V2-FINAL-Feb-23.doc)                                                                                                                         &#x20;\n\n   www\\.sps.nhs.uk › ...","simulation_source":"User-supplied 'Pasted markdown.md' — used as the replacement simulation content without silently changing its clinical scenario or observations.","source":{"title":"Supplied simulation source plus cited references","references":[{"title":"NICE — Treating status epilepticus, repeated or cluster seizures and prolonged seizures","url":"https://www.nice.org.uk/guidance/ng217/chapter/treating-status-epilepticus-repeated-or-cluster-seizures-and-prolonged-seizures"},{"title":"Buccal midazolam National PGD template V2 FINAL Feb 23","url":"https://www.sps.nhs.uk/wp-content/uploads/2021/10/Buccal-midazolam-National-PGD-template-V2-FINAL-Feb-23.doc"}]}}};
// Road Traffic Collision tab-content payload: keep the dedicated hospital guides attached to the embedded pathway registry.
diagnosisPathways["rtc"].tab_content={"overview":"# 1 · Command structure\n\n## Executive command\n\n### Chief Medical Officer — CMO\n\n- Highest clinical authority.\n- Sets medical policy and standards.\n- Reviews serious incidents.\n- Directs the medical service during major incidents.\n- Normally does not perform routine roadside treatment unless requested.\n\n### Deputy Chief Medical Officer — DCMO\n\n- Acts on behalf of the CMO.\n- Reviews serious and critical incidents.\n- Supervises Heads of Department.\n- Provides senior clinical escalation.\n\n### Service Director\n\n- Oversees the medical service.\n- Coordinates departments and staffing.\n- Resolves interdepartmental conflicts.\n- Reviews operational performance and conduct.\n\n### Director of Operations\n\n- Controls operational deployment.\n- Allocates ambulances, HART, HEMS and hospital resources.\n- Coordinates police, fire and medical services.\n- Establishes incident command during major incidents.\n\n---\n\n# 2 · Department structure\n\n## Ambulance Team\n\n**Head of Ambulance**\nResponsible for ambulance operations, standards, training and staffing.\n\n**Ambulance Team Leader**\nLeads ambulance crews and coordinates ambulance activity at incidents.\n\n**Consultant Paramedic**\nHighest routine ambulance clinical rank.\n\n**Advanced Paramedic**\nManages serious and critical patients within server permissions.\n\n**Paramedic**\nPerforms assessment, treatment and transport within scope.\n\n**Student Paramedic**\nAssists and observes under direct supervision.\n\n## HART Team\n\n**Head of HART**\nResponsible for high-risk, technical rescue and hazardous-scene operations.\n\n**HART Team Leader**\nLeads HART deployments and coordinates specialist scene safety.\n\n**Advanced Paramedic**\nProvides advanced care and complex rescue support.\n\n**Paramedic**\nProvides clinical care within HART scope.\n\n## HEMS Team\n\n**Head of HEMS**\nResponsible for aviation medical operations and standards.\n\n**HEMS Team Leader**\nCoordinates HEMS deployment, landing-site safety and clinical activity.\n\n**Doctor**\nSenior HEMS clinician.\n\n**Paramedic**\nProvides HEMS paramedic support.\n\n**Pilot**\nResponsible for aircraft and flight safety. The pilot does not make clinical decisions.\n\n## Hospital Team\n\n**Head of Hospital**\nResponsible for hospital operations and clinical standards.\n\n**Hospital Team Leader**\nCoordinates hospital staff and major trauma reception.\n\n**Consultant Doctor**\nSenior clinician who leads complex assessment and treatment.\n\n**Senior Doctor**\nManages serious or critical cases under consultant oversight.\n\n**Junior Doctor**\nPerforms assessment and treatment within training and server permissions.\n\n**Medical Student**\nObserves and assists under supervision.\n\n**Hospital Staff — Dispatch**\nCoordinates hospital communications, records, bed status and patient reception.\n\n---\n\n# 3 · General RP rules\n\n1. Remain within your role and server permissions.\n2. Use `/me` for your character’s actions.\n3. Use `/do` for visible findings or questions requiring another player to respond.\n4. Do not force another player’s injury, diagnosis or response.\n5. Do not invent observations, test results, medication responses or surgical findings.\n6. Serious and critical cases require escalation.\n7. Students and junior staff require appropriate supervision.\n8. Do not allow multiple clinicians to issue conflicting instructions.\n9. Maintain patient dignity and privacy.\n10. Use only server-approved equipment, medication and doses.\n11. Do not delay transport or treatment with unnecessary role-play.\n12. Record what actually happened during the scene.\n13. A senior rank should coordinate rather than crowd the patient.\n14. The patient or receiving clinician should confirm outcomes where appropriate.\n\n---\n\n# 20 · Final RP safety notice\n\n```\n/me confirms that all actions, medications, doses and procedures are being performed under the server's fictional role-play protocol and are not real-world medical treatment.\n\n```","about":"# 4 · Rank POV actions\n\n## Student Paramedic\n\n```\n/me approaches the supervising clinician and confirms their role as a student paramedic.\n/me asks where they are permitted to assist.\n/me prepares the monitoring equipment and trauma bag under supervision.\n/me observes the scene for hazards without entering unnecessarily.\n/me reports visible bleeding, breathing difficulty or reduced consciousness to the supervisor.\n/me records observations only when directed to do so.\n/me prepares approved dressings, blankets and monitoring equipment.\n/me remains with the patient and reports any change in condition.\n/me does not administer medication or perform advanced procedures without direct authorisation.\n\n```\n\n## Paramedic\n\n```\n/me identifies themselves as a paramedic and confirms that the scene is safe.\n/me begins the server-approved &lt;C&gt;ABCDE assessment.\n/me requests an Advanced Paramedic or Team Leader for serious or critical findings.\n/me performs treatment within the approved paramedic scope.\n/me records observations, treatment and patient response.\n/me prepares the patient for transport once immediate priorities are addressed.\n/me gives a structured handover to the receiving team.\n\n```\n\n## Advanced Paramedic\n\n```\n/me identifies themselves as the Advanced Paramedic taking clinical lead.\n/me confirms the immediate life threats and assigns tasks to the crew.\n/me directs the primary survey and requests specialist support where required.\n/me authorises only treatments permitted by the server protocol.\n/me reassesses the patient after each major intervention.\n/me confirms whether the patient requires routine, urgent or critical transport.\n/me gives or receives the clinical handover.\n/me documents the clinical decision-making and escalation.\n\n```\n\n## Ambulance Team Leader\n\n```\n/me identifies themselves as Ambulance Team Leader and establishes ambulance command.\n/me confirms scene safety, patient numbers and available resources.\n/me assigns one clinician to airway and breathing assessment.\n/me assigns another clinician to circulation, monitoring and documentation.\n/me requests HART, HEMS, police, fire or additional ambulances where required.\n/me confirms the treatment plan with the clinical lead.\n/me prevents unnecessary duplication of treatment and instructions.\n/me confirms the destination and transport priority.\n/me ensures the receiving hospital has received a pre-alert.\n/me reviews the final handover and documentation before clearing the scene.\n\n```\n\n## HART Team\n\n```\n/me confirms that the technical rescue area has been declared safe enough to enter.\n/me checks PPE and specialist equipment before approaching the patient.\n/me coordinates with fire or rescue personnel before patient movement.\n/me performs a focused assessment within the restricted environment.\n/me reports entrapment, crush injury, hazards and access limitations.\n/me avoids moving the patient until the rescue plan is agreed.\n/me transfers clinical responsibility to the ambulance or HEMS clinician when appropriate.\n\n```\n\n## HART Team Leader\n\n```\n/me establishes HART scene command and identifies hazards affecting patient access.\n/me confirms communication with police, fire and ambulance command.\n/me controls HART personnel around the vehicle or technical rescue area.\n/me confirms when the patient can be safely accessed or extricated.\n/me assigns a HART clinician to remain with the patient during rescue.\n/me updates the Ambulance Team Leader on rescue progress and expected extrication time.\n/me requests further specialist resources if the scene becomes unsafe.\n\n```\n\n## HEMS Doctor or Paramedic\n\n```\n/me confirms the landing site and aircraft safety arrangements with the pilot.\n/me approaches the patient with HEMS equipment once authorised.\n/me performs a rapid assessment and identifies immediate clinical priorities.\n/me coordinates with the ground ambulance clinical lead.\n/me prepares the patient for transfer once the transport plan is confirmed.\n/me gives the receiving team a concise critical-care handover.\n\n```\n\n## HEMS Pilot\n\n```\n/me confirms the aircraft location, landing-site hazards and weather conditions.\n/me establishes communication with the HEMS Team Leader.\n/me confirms when it is safe for clinical staff to approach the aircraft.\n/me does not make clinical decisions or direct patient treatment.\n/me confirms aircraft readiness before patient loading.\n/me reports any aviation safety concern immediately.\n\n```\n\n## Hospital Doctor\n\n```\n/me receives the pre-alert and prepares the appropriate treatment area.\n/me reviews the patient's mechanism, suspected injuries, observations and treatment already given.\n/me assigns staff to airway, monitoring, circulation and documentation.\n/me receives the ambulance or HEMS handover without interrupting unless clarification is required.\n/me directs the hospital assessment and reassesses the patient after arrival.\n/me escalates to the Consultant Doctor, Hospital Team Leader or Head of Hospital when required.\n\n```\n\n## Medical Student\n\n```\n/me identifies themselves as a medical student and confirms who is supervising them.\n/me observes the assessment from a safe position.\n/me prepares approved equipment when asked by the supervising clinician.\n/me records information only under supervision.\n/me asks permission before performing any examination or action.\n/me reports any concern directly to the supervising clinician.\n/me does not independently diagnose, prescribe or discharge the patient.\n\n```\n\n## Hospital Dispatch\n\n```\n/me receives the incoming pre-alert and records the estimated arrival time.\n/me confirms the proposed destination and clinical priority.\n/me alerts the Hospital Team Leader and appropriate clinical department.\n/me prepares the receiving area and checks bed or trauma-bay availability.\n/me updates the hospital team if the ambulance reports deterioration or a change in ETA.\n/me records the time of arrival and receiving clinician.\n/me directs incoming crews to the correct area.\n/me documents the final handover time.\n\n```\n\n---\n\n# 5 · Scene and mechanism\n\n## Scene safety\n\n```\n/me parks the response vehicle in a safe position and activates the emergency lights.\n/me exits the vehicle wearing appropriate PPE and scans the area for hazards.\n/me looks for moving traffic, leaking fuel, smoke, fire, unstable vehicles, broken glass, electrical hazards and aggressive persons.\n/do Is the scene safe to approach?\n/me confirms the scene is safe before approaching the patient.\n/me checks the number of patients and requests police, fire, additional medical resources or specialist support if required.\n/me identifies whether the patient is trapped, crushed or inside an unstable vehicle.\n/me does not enter an unsafe vehicle unless there is an immediate life threat.\n\n```\n\n## Mechanism and context\n\n```\n/me approaches the patient and observes their position, movement, speech, breathing effort, skin colour and apparent distress.\n/me asks what happened and whether the patient was a driver, passenger, motorcyclist, cyclist or pedestrian.\n/me asks whether a seatbelt or helmet was being worn and whether an airbag deployed.\n/me checks for vehicle intrusion, ejection, rollover, second impact or death at the scene.\n/me asks whether the patient lost consciousness, vomited, seized or became confused.\n/me confirms the estimated time of the incident and any treatment already provided.\n\n```\n\n## Initial impression\n\n```\n/me performs a rapid visual assessment for catastrophic bleeding and immediately life-threatening problems.\n/me identifies whether the patient appears stable, concerning or critical.\n/me asks the patient not to move while the initial assessment is completed.\n/me considers possible spinal injury if there was a high-energy mechanism, neck pain, neurological symptoms, reduced consciousness or distracting injury.\n/me informs the Team Leader of the initial mechanism and apparent severity.\n\n```\n\n---\n\n# 10 · Diagnostic reasoning\n\n## Possible diagnoses\n\n- Minor soft-tissue injury\n- Closed fracture\n- Open fracture\n- Dislocation\n- Head injury or concussion\n- Intracranial bleeding\n- Cervical spine injury\n- Chest injury\n- Pneumothorax-type presentation\n- Haemothorax-type presentation\n- Cardiac or major-vessel injury\n- Abdominal organ injury\n- Pelvic fracture\n- Internal haemorrhage\n- Traumatic shock\n- Spinal cord injury\n- Crush injury\n- Respiratory failure\n- Drug or alcohol intoxication complicating trauma\n\n## RP classification\n\n### Minor\n\n- Superficial cuts or grazes\n- Bruising\n- Minor soft-tissue injury\n- Low-grade sprain\n\n### Moderate\n\n- Closed limb fracture\n- Dislocation\n- Concussion with normal GCS\n- Moderate chest-wall injury\n- Deep laceration without shock\n\n### Serious\n\n- Open fracture\n- Multiple fractures\n- Significant head injury\n- Chest injury with respiratory compromise\n- Suspected internal bleeding\n- Pelvic injury\n- Spinal injury\n\n### Critical\n\n- Uncontrolled catastrophic haemorrhage\n- Severe traumatic shock\n- Airway obstruction\n- Severe respiratory failure\n- Cardiac arrest\n- GCS 8 or less\n- Suspected major internal haemorrhage\n- Tension-pneumothorax-type presentation\n\n---\n\n# 19 · Final clearance\n\n## Ambulance crew\n\n```\n/me confirms that the patient has been handed over to the receiving team.\n/me confirms that all treatment and documentation have been completed.\n/me checks that the ambulance equipment is accounted for.\n/me informs Ambulance Control that the crew is clear or returning to service.\n/me leaves the hospital or scene once released by the Team Leader.\n\n```\n\n## Hospital team\n\n```\n/me confirms that the patient has been accepted by the appropriate hospital clinician.\n/me records the final handover and destination within the hospital.\n/me confirms that the receiving area is ready for the next patient.\n/me updates Hospital Dispatch and closes the case record.\n\n```\n\n## Team Leader\n\n```\n/me confirms that all staff are accounted for and the patient handover is complete.\n/me checks that no equipment or documentation remains outstanding.\n/me reports the final outcome to the relevant Head of Department.\n/me releases the team from the incident.\n\n```\n\n---","paramedic":"# 6 · Primary survey — \\<C>ABCDE\n\n## Catastrophic haemorrhage\n\n### Look for\n\n- Pulsatile or heavy external bleeding\n- Amputation or partial amputation\n- Large open wounds\n- Blood pooling in the vehicle\n- Blood-soaked clothing\n- Bleeding from the scalp, chest, abdomen, pelvis or limbs\n\n### Actions\n\n```\n/me rapidly scans the patient for severe external bleeding.\n/do Is there any catastrophic bleeding?\n/me applies firm direct pressure to the most significant bleeding point using a trauma dressing.\n/me maintains continuous pressure without repeatedly lifting the dressing.\n/me checks whether the bleeding is controlled.\n/do Is the bleeding controlled?\n/me reports uncontrolled bleeding to the Team Leader.\n\n```\n\nIf authorised by the server:\n\n```\n/me applies a tourniquet above the life-threatening limb wound according to the server equipment system.\n/me tightens the tourniquet until the bleeding is controlled.\n/me records the time of tourniquet application.\n/me reassesses the wound and distal circulation.\n/me informs the Team Leader that major haemorrhage escalation is required.\n\n```\n\n```\n/me does not repeatedly remove dressings to inspect the wound.\n/me requests major haemorrhage support if bleeding remains uncontrolled or the patient shows signs of shock.\n\n```\n\n## Airway\n\n```\n/me stabilises the patient's head and neck if spinal injury is suspected.\n/me asks the patient to speak and listens for changes in their voice.\n/do Can the patient speak clearly and is the airway unobstructed?\n/me visually checks the mouth for blood, vomit, loose teeth or visible obstruction.\n/me uses basic airway manoeuvres and suction only according to the server's permitted procedures.\n/me reports any gurgling, snoring, stridor or inability to speak clearly.\n/me does not give oral medication, food or fluids to a patient with reduced consciousness or a threatened airway.\n/me requests senior airway support if the airway appears obstructed or threatened.\n\n```\n\n## Breathing\n\n```\n/me exposes the chest sufficiently to assess movement while preserving the patient's dignity and warmth.\n/me observes the respiratory rate, depth, pattern and work of breathing.\n/me compares movement on both sides of the chest.\n/me looks for open wounds, bruising, paradoxical movement and signs of severe distress.\n/me listens for unequal or absent breath sounds if permitted by the server system.\n/me attaches the pulse oximeter and records the displayed oxygen saturation.\n/me administers oxygen only in accordance with the server's RP rules.\n/me applies an approved occlusive dressing to an open chest wound if required by the server protocol.\n/me reassesses breathing, chest movement and oxygen saturation.\n/me requests senior support for severe respiratory distress or a suspected tension-pneumothorax-type presentation.\n/me does not delay transport for a prolonged examination.\n\n```\n\n## Circulation\n\n```\n/me checks the patient's pulse, skin colour, temperature and capillary refill.\n/me obtains blood pressure and heart rate using the available RP equipment.\n/me checks for concealed bleeding around the chest, abdomen, pelvis and limbs.\n/me checks for deformity, swelling or abnormal movement of the limbs.\n/me controls any external haemorrhage.\n/me requests IV access if authorised under the server protocol.\n/me keeps the patient warm using an approved blanket or warming device.\n/me avoids repeatedly rocking or testing the pelvis.\n/me applies a pelvic binder only if authorised by the server system.\n/me reports signs of shock, ongoing bleeding or deteriorating observations.\n\n```\n\n## Disability\n\n```\n/me asks the patient their name, location, date and what happened.\n/me assesses and records the patient's eye, verbal and motor responses.\n/me checks pupil size and reaction to light if appropriate.\n/me asks about loss of consciousness, headache, vomiting, weakness, numbness and seizure activity.\n/me checks blood glucose if clinically relevant and permitted by the server system.\n/me repeats neurological observations if the patient is confused, injured or deteriorating.\n/me treats falling consciousness, new neurological deficit or seizure activity as an emergency.\n/me does not assume that intoxication explains an abnormal mental state.\n\n```\n\n## Exposure and environment\n\n```\n/me exposes only the areas required to assess the patient properly.\n/me preserves the patient's dignity throughout the examination.\n/me checks the front and back of the body where safe to do so.\n/me looks for hidden bleeding, deformity, bruising, burns and penetrating injury.\n/me records visible injuries before covering the patient.\n/me covers the patient with a blanket to reduce heat loss.\n\n```\n\n---\n\n# 7 · Observations\n\n## Stable pattern\n\n- Heart rate: 78–100 bpm\n- Respiratory rate: 12–20/min\n- Blood pressure: normal for the patient\n- Oxygen saturation: 96–100% on air\n- GCS: 15\n- Pain: 1–5/10\n- Skin: warm, normal colour, capillary refill under 2 seconds\n\n## Concerning pattern\n\n- Heart rate: 100–120 bpm\n- Respiratory rate: 20–28/min\n- Blood pressure: normal or borderline low\n- Oxygen saturation: 92–95% on air or falling\n- GCS: 13–15 or confused\n- Pain: 6–9/10\n- Skin: pale, cool or sweaty\n\n## Critical pattern\n\n- Heart rate: 120 bpm or higher, or abnormally slow in a deteriorating patient\n- Respiratory rate: below 8, above 30 or visibly inadequate\n- Blood pressure: falling or markedly low\n- Oxygen saturation: below 92% or rapidly falling\n- GCS: 8 or less, or a clear downward trend\n- Pain: severe or rapidly worsening\n- Skin: mottled, grey, blue, cold or clammy\n\n## Observation actions\n\n```\n/me attaches the available monitoring equipment.\n/me records the initial heart rate, respiratory rate, blood pressure, oxygen saturation, GCS, pupils, pain score and skin findings.\n/me compares the observations with the patient's general appearance and mechanism of injury.\n/me repeats observations after every major intervention and whenever the patient's condition changes.\n/me records the trend rather than only the latest readings.\n/me informs the senior clinician of any abnormal or deteriorating observation.\n\n```\n\n\\> A single normal observation set does not exclude serious injury.\n\n---\n\n# 8 · Focused examination\n\n## Head and face\n\n```\n/me checks the scalp and face for wounds, swelling, deformity and bruising.\n/me looks for bleeding from the nose or ears and loose or missing teeth.\n/me checks pupil size and reaction if appropriate.\n/me asks about loss of consciousness, vomiting, headache or seizure activity.\n\n```\n\n## Neck and spine\n\n```\n/me asks about neck pain, midline tenderness, tingling, weakness or altered sensation.\n/me checks for spinal deformity without repeatedly moving the patient.\n/me maintains spinal protection if clinically indicated within the RP scenario.\n/me asks about loss of movement or new bladder or bowel symptoms where relevant.\n\n```\n\n## Chest\n\n```\n/me checks for chest pain, tenderness, bruising and open wounds.\n/me observes whether both sides of the chest are moving equally.\n/me listens for reduced or absent air entry if permitted by the server system.\n/me checks for increasing respiratory effort, cyanosis and paradoxical movement.\n\n```\n\n## Abdomen and pelvis\n\n```\n/me inspects the abdomen for bruising, distension and seatbelt marks.\n/me asks about abdominal pain and checks for guarding-type discomfort within the server's RP system.\n/me asks about pelvic pain without repeatedly rocking or testing the pelvis.\n/me looks for genital injury or blood at the urethral opening where relevant.\n\n```\n\n## Limbs\n\n```\n/me checks each limb for deformity, shortening, abnormal rotation, swelling and open wounds.\n/me checks for bleeding and reduced movement.\n/me assesses distal pulse, sensation and movement below each suspected injury.\n/me compares the injured limb with the unaffected side.\n/me covers the limb after examination and avoids unnecessary manipulation.\n\n```\n\n---\n\n# 9 · Respiratory emergency branch\n\n## Initial approach\n\n```\n/me approaches the patient and observes their position, colour, breathing effort and ability to speak.\n/me introduces themselves and asks the patient to describe what is wrong.\n/do Can the patient speak in full sentences?\n/me asks when the breathing difficulty started and whether it is getting worse.\n/me asks about chest pain, wheeze, cough, fever, choking, allergies and previous respiratory problems.\n\n```\n\n## Assessment\n\n```\n/me counts the patient's respiratory rate and observes the depth and pattern of breathing.\n/me checks for use of accessory muscles, cyanosis, exhaustion and altered consciousness.\n/me attaches the pulse oximeter and records the oxygen saturation.\n/me checks the patient's pulse and blood pressure.\n/me listens for wheeze, stridor, reduced air entry or absent breath sounds if permitted.\n/me checks the chest for equal movement, injury and visible abnormalities.\n/do Is the patient stable, deteriorating or in immediate respiratory failure?\n\n```\n\n## RP management\n\n```\n/me positions the patient upright or in the position of greatest comfort unless contraindicated.\n/me reassures the patient and encourages them to remain calm and avoid unnecessary exertion.\n/me administers oxygen only in accordance with the server's RP treatment rules.\n/me prepares the approved respiratory equipment available in the server system.\n/me assists with the patient's prescribed inhaler or nebulised treatment only if authorised.\n/me records the treatment, time and observed response.\n/me continues monitoring respiratory effort, oxygen saturation and consciousness.\n\n```\n\n## Deterioration\n\n```\n/me notices that the patient's breathing has become more laboured.\n/me immediately informs the senior clinician and requests additional support.\n/me reassesses the airway and confirms whether the patient can still speak.\n/me checks for worsening cyanosis, exhaustion, reduced consciousness and falling oxygen saturation.\n/me requests advanced airway support and immediate transport.\n/me prepares the patient for rapid movement while continuing authorised RP treatment.\n/me gives an urgent pre-alert to the receiving hospital.\n/me reassesses the patient after movement and throughout transport.\n\n```\n\n---\n\n# 11 · Ambulance transport and pre-alert\n\n```\n/me confirms that immediate life threats have been addressed before transport.\n/me secures the patient using the server-approved transport equipment.\n/me rechecks the airway, breathing, circulation and consciousness before movement.\n/me informs the Ambulance Team Leader of the patient's current condition.\n/me gives the receiving hospital an ATMIST pre-alert.\n/me loads the patient while maintaining monitoring and dignity.\n/me repeats observations during transport.\n/me reassesses immediately if the patient deteriorates.\n/me informs the hospital of any change in condition or ETA.\n\n```\n\n---\n\n# 14 · Management and escalation\n\n## Immediate management\n\n```\n/me repeats the &lt;C&gt;ABCDE assessment after completing the initial examination.\n/me treats the most immediately life-threatening problem first.\n/me maintains spinal protection where clinically indicated.\n/me administers oxygen only according to the server's RP rules.\n/me establishes monitoring and records repeat observations.\n/me immobilises suspected fractures in the position found unless the server protocol permits otherwise.\n/me avoids repeatedly manipulating spinal, pelvic or limb injuries.\n/me keeps the patient warm.\n/me requests senior or specialist support for serious and critical findings.\n/me prepares the patient for transport once immediate life-saving RP actions are complete.\n/me provides a pre-alert to the designated receiving hospital.\n\n```\n\n## Escalate immediately for\n\n- Catastrophic bleeding\n- Ongoing bleeding despite treatment\n- Suspected major haemorrhage\n- Abnormal or deteriorating observations\n- GCS below 15 or falling GCS\n- Seizure\n- New weakness, numbness or paralysis\n- Severe chest pain or respiratory distress\n- Falling oxygen saturation\n- Suspected pelvic fracture with shock\n- Open fracture\n- Absent distal pulse\n- Gross deformity\n- Suspected spinal injury\n- Suspected internal bleeding\n- Entrapment or crush injury\n- High-speed, rollover or ejection mechanism\n- Serious injury or death at the scene\n- Multiple patients\n- Unsafe scene\n- Cardiac or respiratory arrest\n\n---\n\n# 15 · Handover — ATMIST\n\n```\n/me gives an ATMIST handover to the receiving team.\n\n```\n\n```\nThis is a [age]-year-old [sex] involved in a [type of collision] at [time]. The mechanism was [mechanism]. Suspected injuries are [injuries]. Initial observations were HR [value], RR [value], BP [value], SpO2 [value], GCS [value] and pain [value]/10. Findings include [key positives] and [key negatives]. Treatment given was [treatment and medication]. The response was [response]. Current observations are [values]. ETA is [time]. Additional requirements are [requirements].\n\n```\n\n---\n\n# 16 · Reassessment\n\n```\n/me repeats the complete primary survey.\n/me repeats the full set of observations.\n/me repeats the pain score.\n/me repeats GCS and pupil assessment if head injury is possible.\n/me repeats distal circulation, sensation and movement for limb injuries.\n/me compares the findings with the initial assessment.\n/me records the patient's response to every major intervention.\n/me informs the Team Leader or senior clinician of any deterioration.\n\n```\n\n---\n\n# 17 · Documentation\n\n```\n/me documents the time of the incident and first patient contact.\n/me records the mechanism, scene hazards and patient position.\n/me records all primary survey findings.\n/me documents the initial and repeat observations.\n/me records GCS, pupil findings and neurological changes.\n/me documents every identified injury or suspected diagnosis.\n/me records bleeding-control methods and tourniquet times if used.\n/me documents spinal, pelvic or limb precautions.\n/me records each medication, dose, route, time and response according to the server system.\n/me records allergies and relevant medical history if available.\n/me documents the pre-alert recipient and time.\n/me records the destination and estimated arrival time.\n/me completes the final handover and closes the patient record.\n\n```\n\n---\n\n# 18 · Equipment and medication rules\n\n## Equipment actions\n\n```\n/me prepares the monitor and pulse oximeter.\n/me applies the blood-pressure cuff and records the reading.\n/me prepares oxygen equipment if authorised by the server protocol.\n/me prepares suction and airway equipment for a patient with reduced consciousness.\n/me prepares trauma dressings and haemorrhage-control equipment.\n/me prepares approved immobilisation or transport equipment.\n/me checks that all equipment is secured before transport.\n/me confirms that used equipment is documented and returned after handover.\n\n```\n\n## Medication actions\n\n```\n/me confirms the patient's identity and checks the RP medication record.\n/me checks for recorded allergies and relevant cautions.\n/me confirms the medication, dose and route with the authorised clinician.\n/me administers the approved RP medication according to the server protocol.\n/me records the medication name, dose, route and time.\n/me reassesses the patient after the server-configured interval.\n/me documents the patient's response and any adverse effects.\n\n```\n\n\\> Do not add or invent real-world medication doses. Use only the doses configured and authorised by your server.\n\n---","hospital_ward":"# DOCUMENT 01A — HOSPITAL STAFF GUIDE\n\n## Road Traffic Collision — On Ward\n\n\\> **FOR FIVE M ROLE-PLAY ONLY**\n\\> This guide is fictionalised for FiveM gameplay and is not real-world medical advice. Use only the equipment, medications, procedures and permissions authorised by your server.\n\n---\n\n## 1 · Purpose\n\nThis guide covers the management of a Road Traffic Collision patient after arrival on a hospital ward, observation area or inpatient unit.\n\nIt applies to:\n\n- Consultant Doctors\n- Senior Doctors\n- Junior Doctors\n- Medical Students\n- Hospital Team Leaders\n- Hospital Dispatch\n\nThe ward team must reassess the patient, monitor for deterioration, manage injuries within server permissions and escalate appropriately.\n\n---\n\n## 2 · Ward rank responsibilities\n\n### Consultant Doctor\n\n- Leads complex or deteriorating cases.\n- Reviews serious trauma and respiratory complications.\n- Authorises major escalation within server rules.\n- Coordinates with the Hospital Team Leader.\n\n### Senior Doctor\n\n- Leads routine ward reviews.\n- Supervises Junior Doctors and Medical Students.\n- Escalates unexpected or serious findings to the Consultant Doctor.\n\n### Junior Doctor\n\n- Performs ward assessments within server permissions.\n- Records observations and examination findings.\n- Requests senior review when required.\n\n### Medical Student\n\n- Observes and assists under direct supervision.\n- May prepare equipment and record information when instructed.\n- Does not independently diagnose, prescribe, discharge or alter treatment.\n\n### Hospital Team Leader\n\n- Coordinates the ward team.\n- Allocates staff and resources.\n- Escalates operational problems to the Head of Hospital.\n\n### Hospital Dispatch\n\n- Coordinates bed spaces, ward movement and communications.\n- Records arrivals, transfers and handovers.\n- Alerts the ward team to incoming patients or changes in ETA.\n\n---\n\n## 3 · Ward admission\n\n```\n/me receives the patient from the emergency, trauma or pre-hospital team.\n/me confirms the patient's identity and checks the accompanying handover.\n/me confirms the mechanism of injury, suspected injuries and treatment already provided.\n/me confirms whether the patient is stable, serious or critical.\n/me records the arrival time on the ward.\n/me checks the patient's current observations and level of consciousness.\n/me confirms that the patient is in the correct bed or treatment area.\n/me ensures that the patient's privacy and dignity are maintained.\n/me confirms that the patient has access to the call system if available.\n/me informs the senior clinician that the patient has arrived.\n\n```\n\n---\n\n## 4 · Initial ward assessment\n\n```\n/me introduces themselves and explains that a ward assessment will be completed.\n/me confirms the patient's name, location and current complaint.\n/me asks whether the patient's pain, breathing or other symptoms have changed.\n/me reassesses the airway and asks whether the patient can speak clearly.\n/me observes respiratory effort, chest movement, colour and oxygen saturation.\n/me checks the patient's pulse, blood pressure, temperature and capillary refill where available.\n/me reassesses the patient's pain score.\n/me checks consciousness, orientation and neurological symptoms.\n/me checks injured limbs for distal pulse, sensation and movement.\n/me inspects dressings for visible bleeding without unnecessarily removing them.\n/me records the findings in the patient record.\n/me reports abnormal findings to the Senior Doctor or Consultant Doctor.\n\n```\n\n---\n\n## 5 · Ward respiratory review\n\n```\n/me observes the patient's breathing while they remain at rest.\n/me checks respiratory rate, work of breathing and oxygen saturation.\n/me asks about increasing breathlessness, chest pain, wheeze or coughing.\n/me checks for cyanosis, exhaustion or altered consciousness.\n/me listens for abnormal breath sounds if permitted by the server system.\n/me checks whether oxygen or other respiratory equipment is correctly positioned.\n/me confirms that the patient can speak appropriately.\n/me reports worsening respiratory effort or falling oxygen saturation.\n/me requests urgent senior review if the patient appears to be deteriorating.\n\n```\n\n### Respiratory deterioration\n\n```\n/me notices that the patient's breathing has become more laboured.\n/me immediately informs the Senior Doctor and Hospital Team Leader.\n/me reassesses the patient's airway, breathing, circulation and consciousness.\n/me checks the available monitoring equipment and records the new observations.\n/me requests the Consultant Doctor to attend.\n/me prepares the server-approved airway and respiratory equipment.\n/me informs Hospital Dispatch that urgent clinical support is required.\n/me prepares the patient for transfer to the emergency or critical-care area if directed.\n/me documents the time of deterioration and the actions taken.\n\n```\n\n---\n\n## 6 · Ward trauma review\n\n```\n/me reviews the patient's known injuries and current treatment plan.\n/me checks dressings, splints, immobilisation equipment and pressure areas.\n/me checks for new bleeding, swelling or increasing pain.\n/me checks for altered sensation, weakness or loss of movement.\n/me reassesses distal circulation, sensation and movement below limb injuries.\n/me checks whether spinal or pelvic precautions remain in place.\n/me avoids unnecessary movement or manipulation of suspected injuries.\n/me records any change from the previous assessment.\n/me informs the senior clinician of new or worsening findings.\n\n```\n\n---\n\n## 7 · Pain and medication actions\n\n\\> Medication names, doses and routes must follow the server-approved medication system.\n\n```\n/me confirms the patient's identity before preparing any RP medication.\n/me checks the medication record and server-authorised treatment plan.\n/me checks recorded allergies and relevant cautions.\n/me confirms the medication, dose and route with the authorised clinician.\n/me administers the approved RP medication according to the server protocol.\n/me records the medication name, dose, route and time.\n/me reassesses pain, respiratory rate, consciousness and oxygen saturation.\n/me records the patient's response and any adverse effects.\n\n```\n\n---\n\n## 8 · Ward observations\n\n### Stable\n\n- Heart rate: 78–100 bpm\n- Respiratory rate: 12–20/min\n- Oxygen saturation: 96–100% on air\n- GCS: 15\n- Pain: 1–5/10\n- Warm skin and normal colour\n\n### Concerning\n\n- Heart rate: 100–120 bpm\n- Respiratory rate: 20–28/min\n- Oxygen saturation: 92–95% or falling\n- GCS: 13–15 or confused\n- Pain: 6–9/10\n- Pale, cool or sweaty skin\n\n### Critical\n\n- Heart rate: 120 bpm or higher, or abnormally slow with deterioration\n- Respiratory rate: below 8, above 30 or inadequate\n- Falling blood pressure\n- Oxygen saturation below 92% or rapidly falling\n- GCS 8 or less or falling\n- Severe or worsening pain\n- Grey, blue, mottled, cold or clammy skin\n\n### Observation actions\n\n```\n/me attaches or checks the available monitoring equipment.\n/me records the patient's heart rate, respiratory rate, blood pressure, oxygen saturation, temperature, GCS and pain score.\n/me compares the readings with previous observations.\n/me repeats observations after every major intervention or change in symptoms.\n/me records the trend rather than only the latest readings.\n/me informs the senior clinician of any abnormal or deteriorating observation.\n\n```\n\n---\n\n## 9 · Ward deterioration and escalation\n\n### Escalate for\n\n- Increasing respiratory effort\n- Falling oxygen saturation\n- New confusion or reduced consciousness\n- New bleeding\n- Severe or rapidly worsening pain\n- Falling blood pressure or signs of shock\n- New weakness, numbness or loss of movement\n- Absent or reduced distal pulse\n- Seizure activity\n- Sudden chest or abdominal deterioration\n- Suspected internal bleeding\n- Uncontrolled pain or respiratory distress\n\n### Actions\n\n```\n/me identifies a change in the patient's condition and immediately informs the senior clinician.\n/me remains with the patient and reassesses the airway, breathing, circulation and consciousness.\n/me attaches or checks the available monitoring equipment.\n/me records the new observations and compares them with previous readings.\n/me requests the Consultant Doctor or Hospital Team Leader to attend.\n/me prepares emergency equipment according to the server protocol.\n/me informs Hospital Dispatch that urgent clinical support is required.\n/me prepares the patient for transfer to the emergency, trauma, theatre or critical-care area if directed.\n/me documents the time of deterioration, assessment findings and escalation.\n\n```\n\n---\n\n## 10 · Ward handover\n\n```\n/me gives a structured handover to the incoming clinician.\n/me states the patient's identity, mechanism, confirmed or suspected injuries and current condition.\n/me reports the latest observations and any changes from baseline.\n/me reports treatment already provided and the patient's response.\n/me identifies outstanding investigations, reviews or procedures.\n/me confirms the required level of observation and escalation plan.\n/me records the time and recipient of the handover.\n\n```\n\n### Handover format\n\n```\nThis is a [age]-year-old patient admitted after [mechanism]. The suspected or confirmed injuries are [injuries]. Current observations are HR [value], RR [value], BP [value], SpO2 [value], temperature [value] and GCS [value]. Treatment given was [treatment]. The patient is currently [stable/improving/deteriorating]. Outstanding concerns are [concerns]. The escalation plan is [plan].\n\n```\n\n---\n\n## 11 · Ward transfer\n\n```\n/me confirms that the senior clinician has authorised the transfer.\n/me confirms the destination and receiving clinician.\n/me reassesses the patient's airway, breathing, circulation and consciousness before movement.\n/me checks that all monitoring and approved equipment can travel with the patient.\n/me gives the receiving team a structured handover.\n/me records the transfer time and destination.\n/me informs Hospital Dispatch that the patient has left the ward.\n\n```\n\n---\n\n## 12 · Ward discharge\n\n```\n/me confirms that the senior clinician has authorised discharge.\n/me checks the patient's final observations and assessment.\n/me confirms that the patient's condition is stable within the RP scenario.\n/me provides server-approved instructions to the patient.\n/me records the final diagnosis or working RP diagnosis.\n/me completes the ward documentation.\n/me informs Hospital Dispatch that the bed or treatment space is available.\n\n```\n\n---\n\n## 13 · Ward rules\n\n1. The Consultant Doctor leads complex or deteriorating cases.\n2. The Senior Doctor supervises Junior Doctors and Students.\n3. Medical Students do not independently diagnose, prescribe or discharge.\n4. Reassess patients after treatment and whenever their condition changes.\n5. Do not ignore deterioration because the patient initially appeared stable.\n6. Do not remove dressings or equipment unnecessarily.\n7. Do not force a patient to accept treatment or movement.\n8. Use `/do` when a patient response or finding requires confirmation.\n9. Record all significant changes, treatment and handovers.\n10. Escalate serious and critical patients immediately.\n\n---","hospital_surgery":"# DOCUMENT 01B — HOSPITAL STAFF GUIDE\n\n## Road Traffic Collision — In Surgery\n\n\\> **FOR FIVE M ROLE-PLAY ONLY**\n\\> This guide is fictionalised for FiveM operating-theatre role-play and is not real-world medical advice. Use only the equipment, procedures, medications and permissions authorised by your server.\n\n---\n\n## 1 · Surgical roles\n\n### Consultant Doctor / Lead Surgeon\n\n- Leads the operation.\n- Confirms the surgical plan.\n- Directs the surgical team.\n- Announces significant findings and procedural completion.\n\n### Senior Doctor\n\n- Assists the Consultant Doctor.\n- May lead parts of the procedure when authorised.\n- Supervises Junior Doctors and Medical Students.\n\n### Junior Doctor\n\n- Assists with preparation, assessment and documentation.\n- Performs only authorised actions under supervision.\n\n### Medical Student\n\n- Observes and assists with non-invasive preparation.\n- Remains under direct supervision.\n- Does not independently perform invasive procedures.\n\n### Hospital Team Leader\n\n- Coordinates theatre resources and staff.\n- Resolves operational issues.\n- Ensures the correct team and equipment are available.\n\n### Hospital Dispatch\n\n- Coordinates theatre scheduling, patient movement and records.\n- Confirms theatre status and transfer times.\n- Does not perform surgery or clinical treatment.\n\n---\n\n## 2 · Theatre activation\n\n```\n/me receives notification that the patient requires emergency theatre assessment.\n/me informs the Hospital Team Leader and Consultant Doctor.\n/me confirms the patient's identity, mechanism and suspected injuries.\n/me confirms the reason for theatre activation.\n/me requests the appropriate theatre team and supporting staff.\n/me checks that the theatre area is available and prepared.\n/me confirms that the patient has been handed over to the theatre team.\n\n```\n\n---\n\n## 3 · Pre-operative handover\n\n```\n/me receives the patient from the emergency department, ward or pre-hospital team.\n/me confirms the patient's identity and planned procedure.\n/me listens to the handover and confirms the mechanism, injuries, observations and treatment given.\n/me asks about recorded allergies, relevant history and previous medication.\n/me confirms the patient's current airway, breathing, circulation and consciousness status.\n/me checks that consent or server-approved emergency authorisation has been addressed.\n/me records the time of arrival in theatre.\n\n```\n\n### Theatre handover format\n\n```\nThis is a [age]-year-old patient following [mechanism]. The suspected or confirmed injuries are [injuries]. Current observations are HR [value], RR [value], BP [value], SpO2 [value] and GCS [value]. Treatment already provided was [treatment]. The reason for theatre is [reason]. Relevant concerns are [concerns]. The patient is [stable/unstable/critical].\n\n```\n\n---\n\n## 4 · Theatre safety check\n\n```\n/me confirms the patient's identity with the theatre team.\n/me confirms the planned procedure and intended injury or body area.\n/me confirms that the required equipment is available.\n/me checks that monitoring equipment is connected and functioning.\n/me confirms that the surgical team is present or that escalation has been made.\n/me confirms the patient's current observations before the procedure starts.\n/me documents the theatre safety check.\n\n```\n\n---\n\n## 5 · Theatre preparation\n\n```\n/me assists the team in positioning the patient according to the approved RP procedure.\n/me protects the patient's dignity while preparing the operative area.\n/me checks that monitoring remains connected.\n/me confirms that airway and emergency equipment are available.\n/me prepares the approved sterile equipment.\n/me confirms that all staff understand their assigned roles.\n/me reports any change in the patient's condition before the procedure starts.\n\n```\n\n---\n\n## 6 · Lead surgeon actions\n\n```\n/me confirms the indication and planned procedure with the theatre team.\n/me confirms that the required staff and equipment are present.\n/me announces that the procedure is beginning.\n/me directs the assisting clinicians and theatre staff.\n/me requests any additional equipment required.\n/me reassesses the patient's condition during the procedure.\n/me announces significant findings to the team.\n/me confirms when the operative treatment is complete.\n/me gives the post-operative plan to the receiving team.\n\n```\n\n---\n\n## 7 · Assisting doctor actions\n\n```\n/me confirms their assigned role with the lead surgeon.\n/me prepares the requested equipment.\n/me assists with the procedure according to the server protocol.\n/me reports any visible concern to the lead surgeon.\n/me confirms when the requested task has been completed.\n/me helps prepare the patient for transfer after the procedure.\n\n```\n\n---\n\n## 8 · Medical student actions\n\n```\n/me confirms permission to observe or assist.\n/me remains outside the sterile working area unless directed otherwise.\n/me prepares non-sterile equipment under supervision.\n/me observes the procedure and records notes when permitted.\n/me reports any concern to the supervising doctor.\n/me does not independently touch sterile equipment or perform an invasive action.\n\n```\n\n---\n\n## 9 · Surgical procedure RP actions\n\n```\n/me confirms with the Consultant Doctor that the procedure is ready to begin.\n/me prepares the approved surgical instruments and equipment.\n/me maintains the sterile field according to the server's theatre rules.\n/me assists the lead clinician as directed.\n/me monitors the patient's visible condition and reports any deterioration.\n/me records significant procedural events as directed.\n/me avoids claiming an outcome or patient response without confirmation.\n/me confirms when the procedure has been completed.\n\n```\n\n\\> Players must not force an operative result on another player. Use `/do` to request a response where necessary.\n\n---\n\n## 10 · Intra-operative deterioration\n\n```\n/me notices a change in the patient's condition and immediately informs the lead surgeon.\n/me announces the change to the theatre team.\n/me checks the displayed monitoring equipment.\n/me requests the appropriate senior clinician or emergency support.\n/me pauses the procedure if directed by the lead surgeon.\n/me prepares the server-approved emergency equipment.\n/me records the time of deterioration and actions taken.\n/me confirms the patient's condition before continuing or ending the procedure.\n\n```\n\n---\n\n## 11 · Surgical completion\n\n```\n/me confirms with the lead surgeon that the procedure is complete.\n/me assists with securing dressings and approved post-operative equipment.\n/me checks the patient's current observations.\n/me confirms that all instruments and equipment are accounted for according to server rules.\n/me prepares the patient for transfer to recovery, ward or critical care.\n/me gives the receiving team a post-operative handover.\n/me documents the procedure, findings, treatment and patient response.\n\n```\n\n---\n\n## 12 · Post-operative handover\n\n```\n/me gives a structured handover to the receiving clinician.\n/me states the patient's identity and procedure performed.\n/me reports the reason for surgery and key findings.\n/me reports treatment given during the procedure according to the server system.\n/me reports current observations and level of consciousness.\n/me identifies dressings, immobilisation or other RP equipment in use.\n/me states the required monitoring and escalation plan.\n/me confirms that the receiving clinician has accepted responsibility.\n/me records the time of handover.\n\n```\n\n### Post-operative handover format\n\n```\nThis is a [age]-year-old patient following [mechanism] who has undergone [procedure]. The indication was [reason]. Key findings were [findings]. Treatment provided was [treatment]. Current observations are HR [value], RR [value], BP [value], SpO2 [value] and GCS [value]. Dressings or devices in place are [details]. The patient is currently [stable/improving/deteriorating]. The post-operative plan is [plan].\n\n```\n\n---\n\n## 13 · Post-operative deterioration\n\n```\n/me receives a report of post-operative deterioration.\n/me immediately informs the Consultant Doctor or Senior Doctor.\n/me reassesses the patient's airway, breathing, circulation and consciousness.\n/me checks dressings and visible bleeding without unnecessary disturbance.\n/me checks observations and compares them with the post-operative baseline.\n/me requests the Hospital Team Leader if the patient is serious or critical.\n/me prepares emergency equipment and arranges transfer to the appropriate area.\n/me informs Hospital Dispatch of the urgent transfer.\n/me documents the deterioration and escalation.\n\n```\n\n---\n\n## 14 · Theatre transfer to ward or recovery\n\n```\n/me confirms that the patient is ready for transfer from theatre.\n/me confirms the destination and receiving clinician.\n/me reassesses the airway, breathing, circulation and consciousness before movement.\n/me checks that monitoring and approved equipment can be transferred with the patient.\n/me gives the receiving team the post-operative handover.\n/me records the transfer time and destination.\n/me informs Hospital Dispatch that the theatre is available or remains occupied.\n\n```\n\n---\n\n## 15 · Theatre rules\n\n1. The Consultant Doctor or Lead Surgeon controls the clinical procedure.\n2. The Hospital Team Leader controls operational coordination.\n3. The pilot does not provide surgical or clinical instructions.\n4. Students may observe and assist only under supervision.\n5. Do not claim that a patient is stable, anaesthetised, unconscious or recovering without confirmation.\n6. Do not force another player to accept surgery or a procedural outcome.\n7. Use `/do` to ask whether the patient responds or whether a finding is present.\n8. Do not invent blood loss, imaging, test results or surgical findings.\n9. Escalate unexpected deterioration immediately.\n10. Use only server-approved medication, equipment and procedural outcomes.\n11. Keep the theatre organised and avoid unnecessary crowding.\n12. Record the procedure and handover accurately.\n\n---\n\n## 16 · Theatre clearance\n\n```\n/me confirms that the patient has been transferred to the receiving team.\n/me confirms that the procedure and handover documentation are complete.\n/me checks that the theatre is safe to reset according to server rules.\n/me confirms that all staff are accounted for.\n/me informs Hospital Dispatch that the theatre is available or remains occupied.\n/me reports any serious incident to the Hospital Team Leader.\n\n```\n\n---\n\n# Final RP safety notice\n\n```\n/me confirms that all actions, medications, doses and procedures are being performed under the server's fictional role-play protocol and are not real-world medical treatment.\n\n```","hospital_staff":"# Hospital Staff Guide\n\n> **FOR FIVE M ROLE-PLAY ONLY**\n> Use the nested **On Ward** and **In Surgery** tabs for the Road Traffic Collision hospital guidance.\n\nSelect **On Ward** for ward/inpatient management and **In Surgery** for operating-theatre role-play."};

/* Motorcycle Collision guide replacement — source: uploaded DOCUMENT 02 */
Object.assign(diagnosisPathways['motorcycle-collision'], {
  tab_content: {
    overview: "# OVERVIEW\n\nA motorcycle collision is a high-energy trauma mechanism. Serious internal, spinal, chest, head and limb injuries may exist even when external wounds appear limited.\n\n## Common RP concerns\n\n- Head injury\n- Neck or spinal injury\n- Chest trauma\n- Abdominal or pelvic injury\n- Fractures and dislocations\n- Open fractures\n- Road rash and soft-tissue injury\n- Major external or internal bleeding\n- Respiratory compromise\n- Entrapment or crush injury\n- Loss of consciousness\n- Ejection from the motorcycle\n- Collision with another vehicle or fixed object\n\n## Severity classification\n\n### Minor\n\n- Superficial road rash\n- Minor bruising\n- Small uncomplicated cuts\n- Mild soft-tissue injury\n- Normal observations and no red flags\n\n### Moderate\n\n- Suspected closed fracture\n- Dislocation\n- Moderate road rash\n- Concussion with normal GCS\n- Stable chest-wall injury\n- Deep wound without shock\n\n### Serious\n\n- Open fracture\n- Suspected spinal injury\n- Significant head injury\n- Chest injury with respiratory compromise\n- Multiple fractures\n- Suspected internal bleeding\n- Pelvic injury\n- Patient requiring extrication or specialist support\n\n### Critical\n\n- Catastrophic bleeding\n- Airway obstruction\n- Severe respiratory failure\n- GCS 8 or less\n- Suspected major internal haemorrhage\n- Cardiac or respiratory arrest\n- Severe traumatic shock\n- Suspected tension-pneumothorax-type presentation\n- Unstable vehicle, fire or hazardous scene\n\n---\n\n# 1 · COMMAND AND ROLE RULES\n\n## Ambulance Team\n\n### Head of Ambulance\n\n- Oversees ambulance deployment and standards.\n- Supports serious and critical motorcycle collisions.\n- Coordinates with HART, HEMS and hospital command.\n\n### Ambulance Team Leader\n\n- Leads ambulance operations at the incident.\n- Assigns clinical and operational tasks.\n- Requests additional resources.\n- Ensures a complete pre-alert and handover.\n\n### Consultant Paramedic\n\n- Leads complex ambulance clinical care.\n- Supports serious or critical patients.\n- Reviews escalation and transport decisions.\n\n### Advanced Paramedic\n\n- Manages advanced clinical assessment within server permissions.\n- Leads treatment of serious and critical patients.\n- Supervises Paramedics and Student Paramedics.\n\n### Paramedic\n\n- Performs assessment, treatment and transport within scope.\n\n### Student Paramedic\n\n- Assists and observes under direct supervision.\n\n## HART Team\n\n- Manages technical rescue, dangerous scenes and vehicle or roadside hazards.\n- Coordinates with fire, police and ambulance command.\n- Does not move the patient without an agreed rescue plan.\n\n## HEMS Team\n\n- Provides specialist response where authorised.\n- Coordinates with the ground clinical lead.\n- The pilot controls flight and landing safety but does not make clinical decisions.\n\n## Hospital Team\n\n- Receives the patient, reassesses injuries and provides ward, theatre or critical-care role-play.\n- Consultant Doctors lead complex cases.\n- Junior Doctors and Medical Students work under supervision.\n- Hospital Dispatch coordinates reception, records and patient movement.\n\n---\n\n# 2 · GENERAL ROLE-PLAY RULES\n\n1. Use `/me` for your character’s actions.\n2. Use `/do` for visible findings or questions requiring another player to respond.\n3. Do not force a diagnosis, injury, treatment response or surgical result on another player.\n4. Stay within your rank and server permissions.\n5. Use only server-approved medication, equipment and doses.\n6. Do not invent observations, imaging or test results.\n7. Escalate serious and critical findings immediately.\n8. Avoid unnecessary movement of a patient with suspected spinal or major limb injury.\n9. Keep the patient warm and preserve dignity.\n10. Students and junior ranks require supervision.\n11. Do not crowd the patient or issue conflicting instructions.\n12. Document treatment, observations, escalation and handover accurately.\n\n---\n\n# 1 · COMMAND AND ROLE RULES\n\n## Ambulance Team\n\n### Head of Ambulance\n\n- Oversees ambulance deployment and standards.\n- Supports serious and critical motorcycle collisions.\n- Coordinates with HART, HEMS and hospital command.\n\n### Ambulance Team Leader\n\n- Leads ambulance operations at the incident.\n- Assigns clinical and operational tasks.\n- Requests additional resources.\n- Ensures a complete pre-alert and handover.\n\n### Consultant Paramedic\n\n- Leads complex ambulance clinical care.\n- Supports serious or critical patients.\n- Reviews escalation and transport decisions.\n\n### Advanced Paramedic\n\n- Manages advanced clinical assessment within server permissions.\n- Leads treatment of serious and critical patients.\n- Supervises Paramedics and Student Paramedics.\n\n### Paramedic\n\n- Performs assessment, treatment and transport within scope.\n\n### Student Paramedic\n\n- Assists and observes under direct supervision.\n\n## HART Team\n\n- Manages technical rescue, dangerous scenes and vehicle or roadside hazards.\n- Coordinates with fire, police and ambulance command.\n- Does not move the patient without an agreed rescue plan.\n\n## HEMS Team\n\n- Provides specialist response where authorised.\n- Coordinates with the ground clinical lead.\n- The pilot controls flight and landing safety but does not make clinical decisions.\n\n## Hospital Team\n\n- Receives the patient, reassesses injuries and provides ward, theatre or critical-care role-play.\n- Consultant Doctors lead complex cases.\n- Junior Doctors and Medical Students work under supervision.\n- Hospital Dispatch coordinates reception, records and patient movement.\n\n---\n\n# 2 · GENERAL ROLE-PLAY RULES\n\n1. Use `/me` for your character’s actions.\n2. Use `/do` for visible findings or questions requiring another player to respond.\n3. Do not force a diagnosis, injury, treatment response or surgical result on another player.\n4. Stay within your rank and server permissions.\n5. Use only server-approved medication, equipment and doses.\n6. Do not invent observations, imaging or test results.\n7. Escalate serious and critical findings immediately.\n8. Avoid unnecessary movement of a patient with suspected spinal or major limb injury.\n9. Keep the patient warm and preserve dignity.\n10. Students and junior ranks require supervision.\n11. Do not crowd the patient or issue conflicting instructions.\n12. Document treatment, observations, escalation and handover accurately.\n\n---",
    about: "# 3 · SCENE AND MECHANISM\n\n## Scene safety\n\n```\n/me parks the response vehicle in a safe position and activates the emergency lights.\n/me exits the vehicle wearing appropriate PPE and scans the road for hazards.\n/me looks for moving traffic, leaking fuel, smoke, fire, broken glass, damaged vehicles, unstable objects and aggressive persons.\n/do Is the scene safe to approach?\n/me confirms the scene is safe before approaching the rider.\n/me checks whether police or fire have secured the road.\n/me identifies the number of patients and requests additional resources if required.\n/me checks whether the motorcycle is leaking fuel or obstructing traffic.\n/me does not enter an unsafe area until it has been secured.\n\n```\n\n## Motorcycle mechanism\n\n```\n/me observes the motorcycle's position and visible damage.\n/me checks whether the rider was thrown from the motorcycle.\n/me checks whether the rider struck another vehicle, barrier, road surface or fixed object.\n/me asks whether the rider was wearing a helmet and protective clothing.\n/me checks for evidence of a second impact or prolonged slide.\n/me asks witnesses whether the rider lost consciousness, moved after the collision or was trapped.\n/me confirms the estimated time of the collision.\n/me asks what treatment has already been provided.\n\n```\n\n## Initial impression\n\n```\n/me performs a rapid visual assessment for catastrophic bleeding and immediately life-threatening problems.\n/me observes the rider's position, movement, speech, breathing effort, skin colour and apparent distress.\n/me asks the rider not to move while the initial assessment is completed.\n/me considers spinal injury because of the high-energy motorcycle mechanism.\n/me informs the Ambulance Team Leader of the mechanism and initial severity.\n\n```\n\n---",
    paramedic: "# 4 · PRIMARY SURVEY — \\<C>ABCDE\n\n## Catastrophic haemorrhage\n\n### Look for\n\n- Severe bleeding from limbs\n- Open fractures\n- Amputation or partial amputation\n- Large lacerations\n- Bleeding hidden beneath clothing\n- Blood pooling on the road\n- Bleeding from the scalp, chest, abdomen or pelvis\n\n### Actions\n\n```\n/me rapidly scans the rider for catastrophic bleeding.\n/do Is there any life-threatening bleeding?\n/me applies firm direct pressure to the most significant wound using a trauma dressing.\n/me maintains pressure without repeatedly removing the dressing.\n/me checks whether the bleeding has been controlled.\n/do Is the bleeding controlled?\n/me reports uncontrolled bleeding to the Team Leader.\n\n```\n\nIf permitted:\n\n```\n/me applies a tourniquet above the life-threatening limb wound according to the server equipment system.\n/me tightens the tourniquet until the bleeding is controlled.\n/me records the time of tourniquet application.\n/me reassesses the wound and distal circulation.\n/me informs the Team Leader that major haemorrhage escalation is required.\n\n```\n\n```\n/me does not repeatedly remove dressings to inspect the wound.\n/me requests additional haemorrhage support if bleeding remains uncontrolled or the rider shows signs of shock.\n\n```\n\n---\n\n## Airway and spinal protection\n\n```\n/me stabilises the rider's head and neck while asking them to speak.\n/me asks whether they can state their name and what happened.\n/do Can the rider speak clearly and is the airway unobstructed?\n/me checks the mouth for blood, vomit, loose teeth or visible obstruction.\n/me looks for facial trauma, swelling or helmet-related injury.\n/me uses basic airway manoeuvres and suction only according to the server protocol.\n/me reports gurgling, snoring, stridor or inability to speak clearly.\n/me requests senior airway support if the airway appears threatened.\n/me maintains spinal protection while the airway is assessed.\n\n```\n\n### Helmet rule\n\n```\n/me does not remove the rider's helmet unless directed by the authorised clinical team or required by an immediate airway emergency.\n/me requests additional staff before helmet removal if the server protocol requires it.\n/me maintains manual spinal protection during any approved helmet removal.\n\n```\n\n---\n\n## Breathing\n\n```\n/me exposes the chest sufficiently to assess movement while preserving dignity and warmth.\n/me observes respiratory rate, depth, pattern and work of breathing.\n/me compares movement on both sides of the chest.\n/me checks for chest wounds, bruising, deformity and paradoxical movement.\n/me listens for unequal or absent breath sounds if permitted by the server system.\n/me checks for cyanosis and severe respiratory distress.\n/me attaches the pulse oximeter and records the oxygen saturation.\n/me administers oxygen only in accordance with the server's RP rules.\n/me applies an approved occlusive dressing to an open chest wound if required.\n/me reassesses chest movement, respiratory effort and oxygen saturation.\n/me requests urgent senior support for worsening respiratory distress.\n\n```\n\n---\n\n## Circulation\n\n```\n/me checks the rider's pulse, skin colour, temperature and capillary refill.\n/me obtains blood pressure and heart rate using the available RP equipment.\n/me checks for concealed bleeding around the abdomen, pelvis, groin and limbs.\n/me checks both lower and upper limbs for deformity, swelling and open wounds.\n/me checks distal pulse, sensation and movement below suspected injuries.\n/me keeps the rider warm using an approved blanket or warming device.\n/me requests IV access if authorised under the server protocol.\n/me avoids repeatedly rocking or testing the pelvis.\n/me reports signs of shock, ongoing bleeding or deteriorating observations.\n\n```\n\n---\n\n## Disability\n\n```\n/me asks the rider their name, location, date and what happened.\n/me records the rider's eye, verbal and motor responses.\n/me checks pupil size and reaction to light if appropriate.\n/me asks about loss of consciousness, headache, vomiting, seizure, weakness and numbness.\n/me checks blood glucose if clinically relevant and permitted by the server system.\n/me repeats neurological observations if the rider is confused or deteriorating.\n/me treats falling consciousness, new neurological deficit or seizure activity as an emergency.\n/me does not assume that intoxication explains an abnormal mental state.\n\n```\n\n---\n\n## Exposure and environment\n\n```\n/me exposes only the areas required to identify major injuries.\n/me preserves the rider's dignity while checking for hidden wounds.\n/me inspects the front and back of the body where safe to do so.\n/me checks for road rash, bruising, penetrating injury, deformity and burns.\n/me checks whether protective clothing is hiding bleeding or injury.\n/me records visible injuries before covering the rider.\n/me covers the rider with a blanket to reduce heat loss.\n\n```\n\n---\n\n# 5 · OBSERVATIONS\n\n## Stable pattern\n\n- Heart rate: 78–100 bpm\n- Respiratory rate: 12–20/min\n- Oxygen saturation: 96–100% on air\n- GCS: 15\n- Pain: 1–5/10\n- Warm skin and normal colour\n- No significant mechanism-related red flags\n\n## Concerning pattern\n\n- Heart rate: 100–120 bpm\n- Respiratory rate: 20–28/min\n- Oxygen saturation: 92–95% or falling\n- GCS: 13–15 or confused\n- Pain: 6–9/10\n- Pale, cool or sweaty skin\n- Significant mechanism or multiple injuries\n\n## Critical pattern\n\n- Heart rate: 120 bpm or higher, or abnormally slow with deterioration\n- Respiratory rate: below 8, above 30 or visibly inadequate\n- Falling blood pressure\n- Oxygen saturation below 92% or rapidly falling\n- GCS 8 or less or declining\n- Severe or rapidly worsening pain\n- Grey, blue, mottled, cold or clammy skin\n- Uncontrolled bleeding or respiratory failure\n\n## Observation actions\n\n```\n/me attaches the available monitoring equipment.\n/me records heart rate, respiratory rate, blood pressure, oxygen saturation, GCS, pupils, pain score and skin findings.\n/me compares the observations with the mechanism and general appearance.\n/me repeats observations after every major intervention or change in condition.\n/me records the trend rather than only the latest values.\n/me informs the senior clinician of any abnormal or deteriorating observation.\n\n```\n\n---\n\n# 6 · FOCUSED MOTORCYCLE EXAMINATION\n\n## Head and face\n\n```\n/me checks the helmet for visible damage and notes whether it has been displaced or cracked.\n/me checks the scalp and face for wounds, swelling, bruising and deformity.\n/me looks for bleeding from the nose or ears and loose or missing teeth.\n/me checks pupil size and reaction if appropriate.\n/me asks about loss of consciousness, headache, vomiting or seizure activity.\n\n```\n\n## Neck and spine\n\n```\n/me asks about neck pain, midline tenderness, tingling, weakness or altered sensation.\n/me checks for spinal deformity without unnecessarily moving the rider.\n/me maintains spinal protection where clinically indicated.\n/me asks about loss of movement or new neurological symptoms.\n/me informs the senior clinician of any spinal concern.\n\n```\n\n## Chest\n\n```\n/me checks for chest pain, tenderness, bruising and open wounds.\n/me observes whether both sides of the chest move equally.\n/me listens for reduced or absent air entry if permitted.\n/me checks for increasing respiratory effort, cyanosis or paradoxical movement.\n/me reports any suspected chest injury immediately.\n\n```\n\n## Abdomen and pelvis\n\n```\n/me checks for abdominal pain, bruising, distension and signs of internal injury.\n/me looks for handlebar-type impact marks or significant road contact.\n/me asks about pelvic pain without repeatedly rocking or testing the pelvis.\n/me checks for groin injury or concealed bleeding where appropriate.\n/me reports suspected pelvic or abdominal injury to the Team Leader.\n\n```\n\n## Limbs\n\n```\n/me checks each limb for deformity, shortening, abnormal rotation, swelling and open wounds.\n/me checks for road rash, deep lacerations and active bleeding.\n/me assesses distal pulse, sensation and movement below each suspected injury.\n/me compares the injured limb with the unaffected side.\n/me avoids unnecessary manipulation of suspected fractures or dislocations.\n/me covers the limb after examination.\n\n```\n\n---\n\n# 7 · ROAD RASH AND SOFT-TISSUE INJURY\n\n```\n/me inspects the affected area for the extent of road rash and visible contamination.\n/me checks for deeper wounds, active bleeding, foreign material and exposed structures.\n/me applies an approved dressing according to the server equipment system.\n/me records the location and severity of the injury.\n/me checks for associated fractures, loss of movement or altered sensation.\n/me reports extensive road rash or deep wounds for hospital assessment.\n\n```\n\nEscalate for:\n\n- Extensive or circumferential road rash\n- Deep wounds\n- Heavy contamination\n- Uncontrolled bleeding\n- Suspected fracture beneath the wound\n- Altered distal circulation\n- Severe pain or shock\n- Burns or chemical contamination\n\n---\n\n# 8 · RESPIRATORY EMERGENCY BRANCH\n\n## Initial approach\n\n```\n/me approaches the rider and observes position, colour, breathing effort and ability to speak.\n/me introduces themselves and asks the rider to describe the breathing problem.\n/do Can the rider speak in full sentences?\n/me asks when the breathing difficulty started and whether it is worsening.\n/me asks about chest pain, wheeze, cough, choking and previous respiratory problems.\n\n```\n\n## Assessment\n\n```\n/me counts the respiratory rate and observes the depth and pattern of breathing.\n/me checks for accessory muscle use, cyanosis, exhaustion and altered consciousness.\n/me attaches the pulse oximeter and records the oxygen saturation.\n/me checks pulse and blood pressure.\n/me listens for wheeze, stridor, reduced air entry or absent breath sounds if permitted.\n/me checks the chest for equal movement, injury and visible abnormalities.\n/do Is the rider stable, deteriorating or in immediate respiratory failure?\n\n```\n\n## RP management\n\n```\n/me positions the rider upright or in the position of greatest comfort unless contraindicated.\n/me reassures the rider and encourages them to avoid unnecessary exertion.\n/me administers oxygen only according to the server's RP treatment rules.\n/me prepares the approved respiratory equipment available in the server system.\n/me assists with prescribed inhaler or nebulised treatment only if authorised.\n/me records the treatment, time and observed response.\n/me continues monitoring respiratory effort, oxygen saturation and consciousness.\n\n```\n\n## Deterioration\n\n```\n/me notices that the rider's breathing has become more laboured.\n/me immediately informs the senior clinician and requests additional support.\n/me reassesses the airway and confirms whether the rider can still speak.\n/me checks for worsening cyanosis, exhaustion, reduced consciousness and falling oxygen saturation.\n/me requests advanced airway support and immediate transport.\n/me prepares the rider for rapid movement while continuing authorised RP treatment.\n/me gives an urgent pre-alert to the receiving hospital.\n/me reassesses the rider after movement and throughout transport.\n\n```\n\n---\n\n# 9 · PARAMEDIC TRANSPORT GUIDE\n\n```\n/me confirms that immediate life threats have been addressed before transport.\n/me confirms that the motorcycle and road scene remain safe for departure.\n/me secures the rider using server-approved transport equipment.\n/me rechecks the airway, breathing, circulation and consciousness before movement.\n/me informs the Ambulance Team Leader of the current condition and transport priority.\n/me gives the receiving hospital an ATMIST pre-alert.\n/me loads the rider while maintaining monitoring and dignity.\n/me repeats observations during transport.\n/me reassesses immediately if the rider deteriorates.\n/me informs the hospital of any change in condition or ETA.\n\n```\n\n## Paramedic ATMIST handover\n\n```\nThis is a [age]-year-old motorcycle rider involved in a [high-speed/low-speed] collision at [time]. The rider was [wearing/not wearing] a helmet and was [ejected/not ejected]. Suspected injuries are [injuries]. Initial observations were HR [value], RR [value], BP [value], SpO2 [value], GCS [value] and pain [value]/10. Findings include [key positives] and [key negatives]. Treatment given was [treatment]. The response was [response]. Current observations are [values]. ETA is [time]. Additional requirements are [requirements].\n\n```\n\n---\n\n# 13 · REASSESSMENT\n\n```\n/me repeats the complete primary survey.\n/me repeats the full set of observations.\n/me repeats the pain score.\n/me repeats GCS and pupil assessment if head injury is possible.\n/me repeats distal circulation, sensation and movement for limb injuries.\n/me reassesses road rash, dressings and visible bleeding.\n/me compares the findings with the initial assessment.\n/me records the rider's response to every major intervention.\n/me informs the Team Leader or senior clinician of any deterioration.\n\n```\n\n---\n\n# 14 · ESCALATION RULES\n\nEscalate immediately for:\n\n- Catastrophic bleeding\n- Open fracture\n- Severe road rash with deep wounds\n- Suspected spinal injury\n- Helmet damage with loss of consciousness\n- GCS below 15 or falling GCS\n- New weakness, numbness or paralysis\n- Severe chest pain or respiratory distress\n- Falling oxygen saturation\n- Suspected pelvic or abdominal injury\n- Absent distal pulse\n- Gross limb deformity\n- Entrapment or crush injury\n- High-speed collision\n- Ejection from the motorcycle\n- Collision with a vehicle or fixed object\n- Multiple patients\n- Unsafe scene\n- Cardiac or respiratory arrest\n\n```\n/me identifies the rider as serious or critical.\n/me informs the Team Leader and requests the appropriate senior clinician.\n/me requests HART, HEMS, police, fire or additional ambulance support as required.\n/me gives the receiving hospital an urgent pre-alert.\n/me continues monitoring and authorised treatment.\n/me documents the time and reason for escalation.\n\n```\n\n---\n\n# 15 · DOCUMENTATION\n\n```\n/me documents the time of the collision and first patient contact.\n/me records the motorcycle mechanism, speed estimate and direction of impact if known.\n/me records helmet use, protective clothing, ejection and second impact.\n/me records scene hazards and patient position.\n/me records all primary survey findings.\n/me documents initial and repeat observations.\n/me records GCS, pupil findings and neurological changes.\n/me documents road rash, wounds, fractures and suspected internal injuries.\n/me records bleeding-control methods and tourniquet times if used.\n/me documents spinal, pelvic or limb precautions.\n/me records each medication, dose, route, time and response according to the server system.\n/me records allergies and relevant history if available.\n/me documents the pre-alert recipient and time.\n/me records the destination and estimated arrival time.\n/me completes the final handover and closes the patient record.\n\n```\n\n---\n\n# 16 · FINAL CLEARANCE\n\n## Ambulance crew\n\n```\n/me confirms that the rider has been handed over to the receiving team.\n/me confirms that all treatment and documentation have been completed.\n/me checks that the ambulance equipment is accounted for.\n/me informs Ambulance Control that the crew is clear or returning to service.\n/me leaves the hospital or scene once released by the Team Leader.\n\n```\n\n## Hospital team\n\n```\n/me confirms that the rider has been accepted by the appropriate hospital clinician.\n/me records the final handover and destination within the hospital.\n/me confirms that the receiving area is ready for the next patient.\n/me updates Hospital Dispatch and closes the case record.\n\n```\n\n## Team Leader\n\n```\n/me confirms that all staff are accounted for and the patient handover is complete.\n/me checks that no equipment or documentation remains outstanding.\n/me reports the final outcome to the relevant Head of Department.\n/me releases the team from the incident.\n\n```\n\n---",
    hospital_ward: "# 10 · HOSPITAL RECEIVING GUIDE\n\n## Before arrival\n\n```\n/me receives the motorcycle collision pre-alert.\n/me records the patient's estimated arrival time, mechanism, helmet status, suspected injuries and current observations.\n/me informs the Hospital Team Leader and Consultant Doctor.\n/me prepares the trauma bay or appropriate receiving area.\n/me assigns staff to airway, breathing, circulation, monitoring and documentation.\n/me confirms that the required equipment is available.\n/me clears the route for the incoming patient.\n\n```\n\n## Arrival\n\n```\n/me directs the ambulance or HEMS crew to the assigned receiving area.\n/me receives the rider from the transport team.\n/me confirms the patient's identity and motorcycle collision mechanism.\n/me listens to the ATMIST handover without interrupting unless clarification is required.\n/me repeats the important airway, breathing, circulation and neurological findings.\n/me connects the hospital monitoring equipment.\n/me records the arrival time and initial hospital observations.\n/me confirms the treatment already given and the rider's response.\n\n```\n\n## Hospital primary assessment\n\n```\n/me begins the hospital &lt;C&gt;ABCDE assessment.\n/me reassesses the airway and confirms whether it remains patent.\n/me assesses respiratory effort, chest movement and oxygen saturation.\n/me reassesses pulse, blood pressure, skin findings and visible bleeding.\n/me repeats the neurological assessment and GCS.\n/me checks for injuries not identified during the pre-hospital assessment.\n/me reassesses limb circulation, sensation and movement.\n/me informs the Consultant Doctor or Hospital Team Leader of any deterioration.\n\n```\n\n---\n\n# 11 · HOSPITAL STAFF GUIDE — ON WARD\n\n## Ward admission\n\n```\n/me receives the rider from the emergency or trauma team.\n/me confirms the patient's identity and checks the accompanying handover.\n/me confirms the motorcycle mechanism, helmet status, suspected injuries and treatment provided.\n/me records the arrival time on the ward.\n/me checks current observations and level of consciousness.\n/me confirms that the rider is in the correct bed or treatment area.\n/me preserves the rider's privacy and dignity.\n/me informs the senior clinician that the rider has arrived.\n\n```\n\n## Initial ward assessment\n\n```\n/me introduces themselves and explains that a ward assessment will be completed.\n/me asks whether the rider's pain, breathing or other symptoms have changed.\n/me reassesses the airway and asks whether the rider can speak clearly.\n/me observes respiratory effort, chest movement, colour and oxygen saturation.\n/me checks pulse, blood pressure, temperature and capillary refill where available.\n/me reassesses the pain score.\n/me checks consciousness, orientation and neurological symptoms.\n/me checks injured limbs for distal pulse, sensation and movement.\n/me inspects dressings for visible bleeding without unnecessarily removing them.\n/me records the findings and reports abnormal results to the senior clinician.\n\n```\n\n## Ward trauma review\n\n```\n/me reviews the rider's known injuries and treatment plan.\n/me checks dressings, splints, immobilisation equipment and pressure areas.\n/me checks for new bleeding, swelling, increasing pain or altered sensation.\n/me reassesses distal circulation, sensation and movement below limb injuries.\n/me checks whether spinal or pelvic precautions remain in place.\n/me avoids unnecessary movement or manipulation of suspected injuries.\n/me assesses the extent of road rash and wound contamination.\n/me records any change from the previous assessment.\n/me informs the senior clinician of new or worsening findings.\n\n```\n\n## Ward respiratory review\n\n```\n/me observes the rider's breathing while they remain at rest.\n/me checks respiratory rate, work of breathing and oxygen saturation.\n/me asks about increasing breathlessness, chest pain, wheeze or coughing.\n/me checks for cyanosis, exhaustion or altered consciousness.\n/me listens for abnormal breath sounds if permitted.\n/me checks whether respiratory equipment is correctly positioned.\n/me reports worsening respiratory effort or falling oxygen saturation.\n/me requests urgent senior review if the rider deteriorates.\n\n```\n\n## Ward deterioration\n\n```\n/me notices a change in the rider's condition and immediately informs the senior clinician.\n/me remains with the rider and reassesses the airway, breathing, circulation and consciousness.\n/me checks the monitoring equipment and records the new observations.\n/me requests the Consultant Doctor or Hospital Team Leader to attend.\n/me prepares emergency equipment according to the server protocol.\n/me informs Hospital Dispatch that urgent clinical support is required.\n/me prepares the rider for transfer to the emergency, trauma, theatre or critical-care area if directed.\n/me documents the time of deterioration, findings and escalation.\n\n```\n\n## Ward handover\n\n```\n/me gives a structured handover to the incoming clinician.\n/me states the rider's identity, collision mechanism, helmet status, injuries and current condition.\n/me reports the latest observations and any changes from baseline.\n/me reports treatment already provided and the rider's response.\n/me identifies outstanding investigations, reviews or procedures.\n/me confirms the required level of observation and escalation plan.\n/me records the time and recipient of the handover.\n\n```\n\n### Ward handover format\n\n```\nThis is a [age]-year-old motorcycle rider admitted after a [high-speed/low-speed] collision. The rider was [wearing/not wearing] a helmet and was [ejected/not ejected]. The suspected or confirmed injuries are [injuries]. Current observations are HR [value], RR [value], BP [value], SpO2 [value], temperature [value] and GCS [value]. Treatment given was [treatment]. The rider is currently [stable/improving/deteriorating]. Outstanding concerns are [concerns]. The escalation plan is [plan].\n\n```\n\n---",
    hospital_surgery: "# 12 · HOSPITAL STAFF GUIDE — IN SURGERY\n\n## Theatre activation\n\n```\n/me receives notification that the motorcycle collision patient requires emergency theatre assessment.\n/me informs the Hospital Team Leader and Consultant Doctor.\n/me confirms the patient's identity, mechanism and suspected injuries.\n/me confirms the reason for theatre activation.\n/me requests the appropriate theatre team and supporting staff.\n/me checks that the theatre area is available and prepared.\n/me confirms that the patient has been handed over to the theatre team.\n\n```\n\n## Pre-operative handover\n\n```\n/me receives the rider from the emergency department or ward.\n/me confirms the patient's identity and planned procedure.\n/me confirms the collision mechanism, helmet status and suspected injuries.\n/me listens to the handover and confirms observations and treatment already given.\n/me asks about recorded allergies and relevant history.\n/me confirms the patient's airway, breathing, circulation and consciousness status.\n/me checks that consent or server-approved emergency authorisation has been addressed.\n/me records the time of arrival in theatre.\n\n```\n\n## Theatre safety check\n\n```\n/me confirms the patient's identity with the theatre team.\n/me confirms the planned procedure and intended injury or body area.\n/me confirms that the required equipment is available.\n/me checks that monitoring equipment is connected and functioning.\n/me confirms that the surgical team is present or that escalation has been made.\n/me confirms the patient's current observations before the procedure starts.\n/me documents the theatre safety check.\n\n```\n\n## Preparation\n\n```\n/me assists the team in positioning the rider according to the approved RP procedure.\n/me protects the rider's dignity while preparing the operative area.\n/me checks that monitoring remains connected.\n/me confirms that airway and emergency equipment are available.\n/me prepares the approved sterile equipment.\n/me confirms that all staff understand their assigned roles.\n/me reports any change in the rider's condition before the procedure starts.\n\n```\n\n## Lead surgeon\n\n```\n/me confirms the indication and planned procedure with the theatre team.\n/me confirms that the required staff and equipment are present.\n/me announces that the procedure is beginning.\n/me directs the assisting clinicians and theatre staff.\n/me requests any additional equipment required.\n/me reassesses the rider's condition during the procedure.\n/me announces significant findings to the team.\n/me confirms when the operative treatment is complete.\n/me gives the post-operative plan to the receiving team.\n\n```\n\n## Assisting doctor\n\n```\n/me confirms their assigned role with the lead surgeon.\n/me prepares the requested equipment.\n/me assists with the procedure according to the server protocol.\n/me reports any concern to the lead surgeon.\n/me confirms when the requested task has been completed.\n/me helps prepare the rider for transfer after the procedure.\n\n```\n\n## Medical student\n\n```\n/me confirms permission to observe or assist.\n/me remains outside the sterile working area unless directed otherwise.\n/me prepares non-sterile equipment under supervision.\n/me observes the procedure and records notes when permitted.\n/me reports any concern to the supervising doctor.\n/me does not independently touch sterile equipment or perform an invasive action.\n\n```\n\n## Surgical procedure\n\n```\n/me confirms with the Consultant Doctor that the procedure is ready to begin.\n/me prepares the approved surgical instruments and equipment.\n/me maintains the sterile field according to the server's theatre rules.\n/me assists the lead clinician as directed.\n/me monitors the rider's visible condition and reports any deterioration.\n/me records significant procedural events as directed.\n/me avoids claiming an outcome or patient response without confirmation.\n/me confirms when the procedure has been completed.\n\n```\n\n## Intra-operative deterioration\n\n```\n/me notices a change in the rider's condition and immediately informs the lead surgeon.\n/me announces the change to the theatre team.\n/me checks the displayed monitoring equipment.\n/me requests the appropriate senior clinician or emergency support.\n/me pauses the procedure if directed by the lead surgeon.\n/me prepares the server-approved emergency equipment.\n/me records the time of deterioration and actions taken.\n/me confirms the rider's condition before continuing or ending the procedure.\n\n```\n\n## Completion and post-operative handover\n\n```\n/me confirms with the lead surgeon that the procedure is complete.\n/me assists with securing dressings and approved post-operative equipment.\n/me checks the rider's current observations.\n/me confirms that all instruments and equipment are accounted for according to server rules.\n/me prepares the rider for transfer to recovery, ward or critical care.\n/me gives the receiving team a post-operative handover.\n/me documents the procedure, findings, treatment and patient response.\n\n```\n\n### Post-operative handover format\n\n```\nThis is a [age]-year-old motorcycle rider following a [high-speed/low-speed] collision who has undergone [procedure]. The rider was [wearing/not wearing] a helmet and was [ejected/not ejected]. The indication was [reason]. Key findings were [findings]. Treatment provided was [treatment]. Current observations are HR [value], RR [value], BP [value], SpO2 [value] and GCS [value]. Dressings or devices in place are [details]. The rider is currently [stable/improving/deteriorating]. The post-operative plan is [plan].\n\n```\n\n## Post-operative deterioration\n\n```\n/me receives a report of post-operative deterioration.\n/me immediately informs the Consultant Doctor or Senior Doctor.\n/me reassesses the rider's airway, breathing, circulation and consciousness.\n/me checks dressings and visible bleeding without unnecessary disturbance.\n/me checks observations and compares them with the post-operative baseline.\n/me requests the Hospital Team Leader if the rider is serious or critical.\n/me prepares emergency equipment and arranges transfer to the appropriate area.\n/me informs Hospital Dispatch of the urgent transfer.\n/me documents the deterioration and escalation.\n\n```\n\n---\n\n# 16 · FINAL CLEARANCE\n\n## Ambulance crew\n\n```\n/me confirms that the rider has been handed over to the receiving team.\n/me confirms that all treatment and documentation have been completed.\n/me checks that the ambulance equipment is accounted for.\n/me informs Ambulance Control that the crew is clear or returning to service.\n/me leaves the hospital or scene once released by the Team Leader.\n\n```\n\n## Hospital team\n\n```\n/me confirms that the rider has been accepted by the appropriate hospital clinician.\n/me records the final handover and destination within the hospital.\n/me confirms that the receiving area is ready for the next patient.\n/me updates Hospital Dispatch and closes the case record.\n\n```\n\n## Team Leader\n\n```\n/me confirms that all staff are accounted for and the patient handover is complete.\n/me checks that no equipment or documentation remains outstanding.\n/me reports the final outcome to the relevant Head of Department.\n/me releases the team from the incident.\n\n```\n\n---\n\n# FINAL RP SAFETY NOTICE\n\n```\n/me confirms that all actions, medications, doses and procedures are being performed under the server's fictional role-play protocol and are not real-world medical treatment.\n\n```\n\n---"
  }
});
function diagnosisRender(){const root=document.getElementById('diagnosis-main');const stepper=document.getElementById('diagnosis-stepper');if(!root||!stepper)return;
 stepper.innerHTML=diagnosisSteps.map((s,i)=>`<button class="${i===diagnosisState.step?'active':''} ${i>diagnosisState.step?'locked':''}" onclick="${i<=diagnosisState.step?`diagnosisStep(${i})`:'void(0)'}"><b>${i+1}</b><span>${s.replace('-',' ')}</span></button>`).join('');
 document.getElementById('diagnosis-progress').innerHTML=diagnosisSteps.map((s,i)=>`<span class="${i<=diagnosisState.step?'done':''}">${i+1} ${s}</span>`).join('');
 let body='';
 switch(diagnosisSteps[diagnosisState.step]){
 case 'incident': body=`<div class="diagnosis-section-title"><span>1</span><div><h2>What has happened?</h2><p>Select the presentation that best matches the incident, or choose unknown if you are unsure.</p></div></div><div class="diagnosis-incident-groups">${['Trauma','Medical','Other'].map(g=>`<section><h3>${g}</h3><div class="diagnosis-incident-grid">${diagnosisIncidentOrder.filter(k=>diagnosisIncidentData[k].group===g).map(diagnosisIncidentCard).join('')}</div></section>`).join('')}</div>`;break;
 case 'patient': {const d=diagnosisIncidentData[diagnosisState.incident]||{};body=`<div class="diagnosis-section-title"><span>2</span><div><h2>Patient information</h2><p>Record only what is known. Unknown fields can remain blank.</p></div></div><div class="diagnosis-form-grid">${diagnosisField('Age','age','number')}${diagnosisField('Sex','sex')}${diagnosisField('Approximate weight','weight','number')}${diagnosisField('Known conditions','conditions')}${diagnosisField('Current medications','medications')}${diagnosisField('Allergies','allergies')}${diagnosisField('Anticoagulants','anticoagulants')}${diagnosisField('Previous relevant history','history')}${diagnosisField('Pregnancy where applicable','pregnancy')}${diagnosisField('Time of onset','onset')}${diagnosisField('Last known well','lastKnownWell')}${diagnosisField('Location','location')}</div><div class="diagnosis-context"><h3>Incident-specific information</h3><div class="diagnosis-form-grid">${(d.questions||[]).map((q,i)=>diagnosisField(q,'incident_'+i)).join('')}</div></div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(0)">Back</button><button class="primary" onclick="diagnosisStep(2)">Continue to Symptoms</button></div>`;break;}
 case 'symptoms': {const d=diagnosisIncidentData[diagnosisState.incident]||{};body=`<div class="diagnosis-section-title"><span>3</span><div><h2>Symptoms</h2><p>Record the patient's reported symptoms and important negatives where known.</p></div></div>${diagnosisCheckGroup('Relevant symptoms','symptoms',d.symptoms||[])}<div class="diagnosis-form-grid">${diagnosisField('Other symptoms','otherSymptoms')}${diagnosisField('Important negatives','negatives')}</div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(1)">Back</button><button class="primary" onclick="diagnosisStep(3)">Continue</button></div>`;break;}
 case 'body': body=`<div class="diagnosis-section-title"><span>4</span><div><h2>Painful body parts &amp; focused findings</h2><p>Select affected areas. The selected areas become part of the assessment summary.</p></div></div><div class="diagnosis-bodymap">${['Head','Face','Neck','Chest','Back','Abdomen','Pelvis','Right arm','Left arm','Right hand','Left hand','Right leg','Left leg','Right foot','Left foot'].map(x=>`<button class="${(diagnosisState.data.body||[]).includes(x)?'selected':''}" onclick="diagnosisToggle('body','${x}')">${x}</button>`).join('')}</div><div class="diagnosis-form-grid">${diagnosisField('Pain score (0–10)','pain','number')}${diagnosisField('Focused findings','focusedFindings')}${diagnosisField('Neurovascular findings','neurovascular')}</div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(2)">Back</button><button class="primary" onclick="diagnosisStep(4)">Continue</button></div>`;break;
 case 'observations': body=`<div class="diagnosis-section-title"><span>5</span><div><h2>Observations</h2><p>Enter numerical observations where available. Unknown is acceptable; a single vital sign does not determine a diagnosis.</p></div></div><div class="diagnosis-form-grid">${[['Heart rate','HR'],['Blood pressure','BP'],['Respiratory rate','RR'],['SpO2','SpO2'],['Temperature','temperature'],['Blood glucose','glucose'],['GCS','GCS'],['AVPU','AVPU'],['Pain score','pain'],['ECG','ECG'],['Pupils','pupils'],['Capillary refill','CRT'],['Respiratory effort','respEffort'],['Skin','skin'],['Mental state','mentalState']].map(x=>diagnosisField(x[0],x[1])).join('')}</div><div class="diagnosis-warning">${diagnosisConcernSummary()}</div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(3)">Back</button><button class="primary" onclick="diagnosisStep(5)">Continue to ABCDE</button></div>`;break;
 case 'abcde': body=diagnosisABCDE();break;
 case 'assessment': body=diagnosisAssessment();break;
 case 'reasoning': body=diagnosisReasoning();break;
 case 'treatment': body=diagnosisTreatment();break;
 case 'reassessment': body=diagnosisReassessment();break;
 case 'handover': body=diagnosisHandover();break;
 }
 root.innerHTML=body;
 diagnosisSave();
}
function diagnosisConcernSummary(){const d=diagnosisState.data;const flags=[];const spo=Number(d.SpO2);const rr=Number(d.RR);const gcs=Number(d.GCS);if(Number.isFinite(spo)&&spo<92)flags.push('Low oxygen saturation entered');if(Number.isFinite(rr)&&(rr<8||rr>30))flags.push('Abnormal respiratory rate entered');if(Number.isFinite(gcs)&&gcs<13)flags.push('Reduced GCS entered');if((d.symptoms||[]).some(x=>/weakness|collapse|airway|breathlessness|bleeding|seizure/i.test(x)))flags.push('Potentially concerning symptom recorded');return flags.length?`<strong>⚠️ Urgent clinical concern:</strong> ${flags.map(diagnosisEscape).join(' · ')}<small>Review ABCDE and escalate according to the appropriate real-world/local pathway.</small>`:'No automatic red flag triggered by the limited observations entered. Continue assessment.';}
function diagnosisABCDE(){const keys=[['A','Airway',['Is the airway patent?','Can the patient speak?','Obstruction / blood / vomit / secretions?','Swelling or facial trauma?','Reduced consciousness?']],['B','Breathing',['Respiratory rate','SpO2','Respiratory effort','Chest movement','Auscultation / breath sounds','Wheeze / crackles / absent breath sounds','Cyanosis / chest pain']],['C','Circulation',['Heart rate','Blood pressure','Pulse quality','Capillary refill','Skin / perfusion','Major bleeding','ECG','IV access']],['D','Disability',['GCS / AVPU','Pupils','Glucose','Speech','Movement','Sensation','Seizure','Confusion','Neurological deficit']],['E','Exposure',['Temperature','Full injury survey','Rash','Bleeding','Burns','Medical alert information','Medication patches','Signs of infection','Additional injuries']]];return `<div class="diagnosis-section-title"><span>6</span><div><h2>ABCDE assessment</h2><p>Complete the primary assessment and record what you actually found.</p></div></div>${keys.map(([letter,title,items])=>`<article class="diagnosis-abcde-card"><div class="diagnosis-abcde-letter">${letter}</div><div><h3>${title}</h3>${diagnosisCheckGroup('Assessment findings',`abcde_${letter}`,items)}${diagnosisField(`${title} summary`,`abcdeSummary_${letter}`)}<div class="diagnosis-rp"><strong>RP examples</strong><button onclick="diagnosisAction('${letter}')">Generate /me</button></div></div></article>`).join('')}<div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(4)">Back</button><button class="primary" onclick="diagnosisStep(6)">Continue to Focused Assessment</button></div>`;}
function diagnosisAction(letter){const acts={A:'/me approaches the patient and assesses the airway for patency and visible obstruction.',B:'/me observes respiratory effort, counts the respiratory rate, applies the pulse oximeter and prepares to auscultate the chest.',C:'/me checks the pulse, applies the blood pressure cuff and assesses peripheral perfusion.',D:'/me assesses level of consciousness, pupils, glucose and focused neurological function.',E:'/me exposes the relevant areas while maintaining dignity and performs a systematic check for additional findings.'};navigator.clipboard?.writeText(acts[letter]||'').catch(()=>{});alert(acts[letter]||'');}
function diagnosisAssessment(){const d=diagnosisIncidentData[diagnosisState.incident]||{};const focused=(d.questions||[]).slice(0,8);return `<div class="diagnosis-section-title"><span>7</span><div><h2>Focused assessment</h2><p>Incident-specific assessment prompts. In Learning Mode, each prompt explains why it matters.</p></div></div><div class="diagnosis-assessment-grid">${focused.map((q,i)=>`<article><h3>${diagnosisEscape(q)}</h3><p>${diagnosisState.mode==='learning'?'This finding helps define the mechanism, severity, differential diagnosis or next assessment step for this presentation.':'Record the finding before proceeding.'}</p>${diagnosisField('Finding','assessment_'+i)}</article>`).join('')}</div>${diagnosisRoleTabs()}<div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(5)">Back</button><button class="primary" onclick="diagnosisStep(7)">Generate Clinical Reasoning</button></div>`;}
function diagnosisReasoning(){const d=diagnosisIncidentData[diagnosisState.incident]||{};const selected=diagnosisState.data.symptoms||[];let primary='Insufficient information — requires further assessment';let why=[];if(diagnosisState.incident==='stroke'&&selected.some(x=>/weakness|speech|facial/i.test(x))){primary='Findings are concerning for an acute neurological event such as stroke and require urgent specialist assessment.';why=selected.filter(x=>/weakness|speech|facial|visual|gaze|neglect/i.test(x));}else if(diagnosisState.incident==='chest-pain'&&selected.some(x=>/chest|radiat|sweat|nausea/i.test(x))){primary='Findings are concerning for acute coronary syndrome and require appropriate urgent assessment.';why=selected;}else if(selected.length){primary=`Findings are consistent with a ${diagnosisEscape(d.label||'clinical')} presentation; further focused assessment is required.`;why=selected.slice(0,6);}const diffs=(d.diff||[]).slice(0,6);return `<div class="diagnosis-section-title"><span>8</span><div><h2>Clinical Reasoning Guide</h2><p>Possible clinical considerations only — not a definitive diagnosis.</p></div></div><article class="diagnosis-result-primary"><span>PRIMARY CLINICAL CONSIDERATION</span><h2>${diagnosisEscape(primary)}</h2><h3>Why?</h3><ul>${(why.length?why:['No sufficiently specific supporting findings entered.']).map(x=>`<li>${diagnosisEscape(x)}</li>`).join('')}</ul></article><div class="diagnosis-differentials"><h2>Alternative possibilities</h2>${diffs.map((x,i)=>`<article><span>DIFFERENTIAL ${i+1}</span><h3>${diagnosisEscape(x)}</h3><p><strong>Support:</strong> assess whether the entered findings fit this possibility.</p><p><strong>Next:</strong> identify findings that would support or make it less likely.</p></article>`).join('')}</div><div class="diagnosis-redflags">${diagnosisConcernSummary()}</div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(6)">Back</button><button class="primary" onclick="diagnosisStep(8)">View Management Guide</button></div>`;}
function diagnosisMedicationRefHtml(pathway){
 const refs=Array.isArray(pathway?.medications)?pathway.medications:[];
 if(!refs.length && pathway?.medication_reference){
   const ref=pathway.medication_reference;
   const checks=Array.isArray(ref.checks)?ref.checks.map(x=>`<li>${diagnosisEscape(x)}</li>`).join(''):'';
   return `<article class="diagnosis-med-card"><div class="diagnosis-med-warning">RP-ONLY SIMULATION REFERENCE</div><h3>Simulation medication reference</h3><p><strong>Scenario:</strong> ${diagnosisEscape(ref.scenario||'')}</p><p><strong>Instruction:</strong> ${diagnosisEscape(ref.simulation_instruction||'')}</p>${checks?`<p><strong>Checks:</strong></p><ul>${checks}</ul>`:''}</article>`;
 }
 if(!refs.length)return '<p>No medication is specified for this pathway.</p>';
 const records=refs.map(r=>diagnosisMedicationData.medications.find(m=>m.id===r.medication_id)).filter(Boolean);
 if(!records.length)return '<p>Medication reference requires source verification.</p>';
 return records.map(m=>{
   const prereq=(m.required_pre_administration_checks||[]).map(x=>`<li>${diagnosisEscape(x)}</li>`).join('');
   const dose=diagnosisEscape(m.rp_display_dose||'Dose requires clinical source verification.');
   return `<article class="diagnosis-med-card"><div class="diagnosis-med-warning">RP-ONLY DOSE — NOT FOR REAL-WORLD USE</div><h3>${diagnosisEscape(m.display_name||m.generic_name)}</h3><p><strong>Why it may be used:</strong> ${diagnosisEscape((m.indications||[]).join('; '))}</p><p><strong>Route:</strong> ${diagnosisEscape((m.routes||[]).join(', '))}</p><p><strong>RP reference:</strong> ${dose}</p><details><summary>Pre-administration checks</summary><ul>${prereq}</ul></details><details><summary>Contraindications & cautions</summary><ul>${(m.do_not_give_if||[]).map(x=>`<li>${diagnosisEscape(x)}</li>`).join('')}</ul><ul>${(m.cautions||[]).map(x=>`<li>${diagnosisEscape('Caution: '+x)}</li>`).join('')}</ul></details><details><summary>Monitoring & reassessment</summary><ul>${(m.monitoring_after_administration||[]).map(x=>`<li>${diagnosisEscape(x)}</li>`).join('')}</ul></details><p><small>Source: ${diagnosisEscape(m.source?.title||'Source not supplied')} · Last reviewed: ${diagnosisEscape(m.last_reviewed||'Not supplied')}</small></p><label class="diagnosis-med-confirm"><input id="diagnosis-med-consent-${diagnosisEscape(m.id)}" name="diagnosis-med-consent-${diagnosisEscape(m.id)}" type="checkbox" onchange="diagnosisMedicationConsent('${diagnosisEscape(m.id)}',this.checked)"> I understand this medication information is for FiveM role-play only and must not be used in real life.</label><button class="primary diagnosis-med-admin" data-med="${diagnosisEscape(m.id)}" disabled onclick="diagnosisPerformMedication('${diagnosisEscape(m.id)}')">Prepare / administer in RP</button></article>`;
 }).join('');
}
function diagnosisMedicationConsent(id,checked){
 diagnosisState.data.medicationConsent=diagnosisState.data.medicationConsent||{};
 diagnosisState.data.medicationConsent[id]=!!checked;
 diagnosisSave();
 document.querySelectorAll(`.diagnosis-med-admin[data-med="${CSS.escape(id)}"]`).forEach(b=>b.disabled=!checked);
}
function diagnosisPerformMedication(id){
 const m=diagnosisMedicationData.medications.find(x=>x.id===id); if(!m)return;
 const d=diagnosisState.data;
 const required=['allergies','age','RR','SpO2','BP'];
 const missing=required.filter(k=>!d[k]&&d[k]!==0);
 if(missing.length){alert('Complete the required patient information/observations before medication administration: '+missing.join(', '));return;}
 diagnosisState.performed=diagnosisState.performed||{};
 diagnosisState.performed['medication:'+id]={time:new Date().toISOString(),dose:m.rp_display_dose,route:(m.routes||[])[0],user:'RP user'};
 diagnosisState.data.audit=diagnosisState.data.audit||[];
 diagnosisState.data.audit.push({type:'medication',id,time:new Date().toISOString()});
 diagnosisState.data.reassessmentRequired=true;
 diagnosisSave();
 alert('RP medication action logged. Reassess the patient before considering any further dose.');
}
function diagnosisTreatment(){
 const key=diagnosisState.incident;
 const equip={stroke:['Monitor','Glucose equipment','BP cuff','SpO2','ECG','Neurological assessment tools','IV equipment where appropriate'], 'chest-pain':['Monitor','12-lead ECG','BP cuff','SpO2 probe','Glucose equipment','IV equipment where appropriate'],rtc:['PPE','Monitor','Suction','Oxygen equipment','Airway equipment','Bleeding control equipment','IV equipment where appropriate','Trauma shears','Pelvic equipment where indicated'],burns:['PPE','Burn assessment materials','Monitor','Airway equipment where indicated'],anaphylaxis:['PPE','Monitor','Airway equipment','Oxygen equipment','IV equipment where appropriate']};
 const items=equip[key]||['PPE','Monitor','Observation equipment','Assessment equipment','Appropriate treatment equipment'];
 const refs=['NICE','JRCALC','Resuscitation Council UK','BNF / official medicines information','Relevant specialist UK guidance'];
 const p=diagnosisPathways[key];
 return `<div class="diagnosis-section-title"><span>9</span><div><h2>Management Guide</h2><p>Separate the FiveM simulation pathway from real-world clinical guidance.</p></div></div><div class="diagnosis-global-warning">REAL MEDICATION INFORMATION — FIVEM ROLE-PLAY ONLY. This content is fictionalised for FiveM gameplay and must not be used to diagnose or treat a real person. In a real emergency, call 999 or 112.</div>${diagnosisRoleTabs()}<div class="diagnosis-pathway">${['Incident / initial impression','ABCDE','Observations','Focused assessment','Investigations','Treatment','Reassessment','Transport / hospital','MDT'].map((x,i)=>`<div><b>${i+1}</b><span>${x}</span></div>`).join('')}</div><div class="diagnosis-management-grid"><article><h3>🚑 Pre-hospital / Paramedic</h3><ul><li>Scene safety and PPE</li><li>Primary survey and &lt;C&gt;ABCDE</li><li>Focused assessment and repeat observations</li><li>Appropriate equipment and treatment according to the RP pathway</li><li>Pre-alert and structured handover where indicated</li></ul></article><article><h3>🏥 Hospital / ED</h3><ul><li>Arrival and repeat ABCDE</li><li>Repeat observations and focused examination</li><li>ECG, blood tests or imaging where indicated</li><li>Specialist review and ongoing monitoring</li></ul></article><article><h3>👥 MDT</h3><p>${diagnosisMdtFor(key)}</p></article></div><article class="diagnosis-equipment"><h2>Equipment</h2><div class="diagnosis-tag-list">${items.map(x=>`<span>${diagnosisEscape(x)}</span>`).join('')}</div></article><article class="diagnosis-med-reference"><h2>Medication Reference</h2>${diagnosisMedicationRefHtml(p)}<div class="diagnosis-tag-list">${refs.map(x=>`<span>${x}</span>`).join('')}</div><small>UHS RP permissions are separate from real-world scope of practice.</small></article><div class="diagnosis-rp-generator"><button class="primary" onclick="diagnosisGenerateActions()">Generate RP Actions</button><div id="diagnosis-actions-output"></div></div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(7)">Back</button><button class="primary" onclick="diagnosisStep(9)">Reassess</button></div>`;
}
function diagnosisMdtFor(k){if(k==='stroke')return 'ED, Stroke Physician/Team, Radiology/Radiographer, Stroke Nursing and relevant Therapy Team.';if(k==='rtc'||k==='gunshot-injury'||k==='stab-wound'||k==='major-haemorrhage')return 'ED, Trauma Team, Anaesthetics, Radiology and relevant surgical/specialist teams.';if(k==='chest-pain')return 'ED, Cardiology and relevant diagnostic/imaging services.';if(k==='burns')return 'ED, Burns/Plastic Surgery or relevant specialist service and Anaesthetics where indicated.';return 'Emergency/ED team with relevant specialty involvement based on the clinical presentation.';}
function diagnosisGenerateActions(){const k=diagnosisState.incident;const label=(diagnosisIncidentData[k]||{}).label||'patient';const acts=[`/me confirms the scene is safe, applies appropriate PPE and approaches the patient.`,`/me begins a structured ABCDE assessment of the ${label.toLowerCase()} presentation.`,`/me obtains and records a full set of observations appropriate to the presentation.`,`/me performs the focused assessment and checks the relevant history.`,`/me prepares the indicated equipment and checks it is ready before use.`,`/me explains the next assessment or treatment step to the patient.`,`/me reassesses the patient after any intervention and compares the new findings with the previous observations.`,`/me prepares a structured handover for the receiving clinical team.`];document.getElementById('diagnosis-actions-output').innerHTML='<div class="diagnosis-action-list">'+acts.map((a,i)=>`<div><code>${diagnosisEscape(a)}</code><button onclick="navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(a)})">Copy</button></div>`).join('')+'</div><p class="diagnosis-action-note">Actions describe preparation or assessment. An action is not treated as completed until the RP player performs it.</p>';diagnosisState.performed.actions=true;diagnosisSave();}
function diagnosisReassessment(){const d=diagnosisState.data;return `<div class="diagnosis-section-title"><span>10</span><div><h2>Reassessment</h2><p>Repeat A–E after major interventions and compare before/after observations.</p></div></div><div class="diagnosis-form-grid">${[['HR','HR_after'],['BP','BP_after'],['RR','RR_after'],['SpO2','SpO2_after'],['GCS','GCS_after'],['Pain','pain_after']].map(x=>diagnosisField(`${x[0]} after intervention`,x[1])).join('')}</div><div class="diagnosis-compare"><h3>Before → After</h3>${[['HR','HR'],['BP','BP'],['RR','RR'],['SpO2','SpO2'],['GCS','GCS'],['Pain','pain']].map(x=>`<div><span>${x[0]}</span><b>${diagnosisEscape(d[x[1]]||'Unknown')}</b><i>→</i><b>${diagnosisEscape(d[x[1]+'_after']||'Unknown')}</b></div>`).join('')}</div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(8)">Back</button><button class="primary" onclick="diagnosisStep(10)">Generate Handover</button></div>`;}
function diagnosisHandover(){const d=diagnosisState.data;const inc=(diagnosisIncidentData[diagnosisState.incident]||{}).label||'Unknown';const summary=`ATMIST / SBAR\\nINCIDENT: ${inc}\\nAGE: ${d.age||'Unknown'}\\nPRESENTATION: ${(d.symptoms||[]).join(', ')||'Not recorded'}\\nOBSERVATIONS: HR ${d.HR||'Unknown'} | BP ${d.BP||'Unknown'} | RR ${d.RR||'Unknown'} | SpO2 ${d.SpO2||'Unknown'} | GCS ${d.GCS||'Unknown'} | Glucose ${d.glucose||'Unknown'}\\nASSESSMENT: ${Object.entries(d).filter(x=>x[0].startsWith('abcdeSummary_')).map(x=>x[1]).filter(Boolean).join(' | ')||'ABCDE findings not fully recorded'}\\nTREATMENT: Record only interventions actually performed.\\nRESPONSE: ${d.SpO2_after||d.HR_after||d.GCS_after?'Post-intervention observations entered.':'Not recorded'}\\nHISTORY: ${d.history||'Unknown'}\\nMEDICATIONS: ${d.medications||'Unknown'}\\nALLERGIES: ${d.allergies||'Unknown'}\\nLAST KNOWN WELL: ${d.lastKnownWell||'N/A'}\\nCONCERNS: ${diagnosisConcernSummary().replace(/<[^>]*>/g,'')}\\nETA: ${d.eta||'Not recorded'}`;return `<div class="diagnosis-section-title"><span>11</span><div><h2>Handover</h2><p>Generated from information actually entered into this assessment.</p></div></div><pre class="diagnosis-handover">${diagnosisEscape(summary)}</pre><button class="primary" onclick="navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(summary)})">📋 Copy Handover</button><div class="diagnosis-final-note"><strong>Case complete.</strong> Save is local to this browser only. Start a new case to clear the assessment.</div><div class="diagnosis-actions"><button class="secondary" onclick="diagnosisStep(9)">Back</button><button class="primary" onclick="diagnosisNewCase()">New Case</button></div>`;}
document.addEventListener('DOMContentLoaded',()=>{if(diagnosisLoad())diagnosisRender();else diagnosisRender();});

window.addEventListener('popstate',function(e){
 const state=e.state;
 if(state?.pathwayId){ openPathwayPage(state.pathwayId,state.tab||'Overview',state.hospitalTab||'On Ward',false); }
});


/* Pathway library boot: always render the complete embedded registry on page load. */
document.addEventListener('DOMContentLoaded',function(){
  try {
    if(typeof renderPathwaysLibrary==='function') renderPathwaysLibrary();
  } catch(e) {
    console.error('Pathway library render failed',e);
    const root=document.getElementById('pathways-library');
    if(root) root.innerHTML='<div class="diagnosis-empty">Unable to render the pathway library. Check the browser console for details.</div>';
  }
});
