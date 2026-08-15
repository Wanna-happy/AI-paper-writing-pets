const petStage = document.getElementById('pet-stage');
const pet = document.getElementById('desktop-pet');
const sprite = document.getElementById('openpet-sprite');
const speech = document.getElementById('pet-speech');

const PETS = {
  'ember-pup': { label: 'Ember Pup', defaultName: '小焰', asset: '../assets/openpets/ember-pup/spritesheet-clean.png' },
  'shadow-kit': { label: 'Shadow Kit', defaultName: '小影', asset: '../assets/openpets/shadow-kit/spritesheet-clean.png' },
  nori: { label: 'Nori', defaultName: '糯梨', asset: '../assets/openpets/nori/spritesheet-clean.png' },
};
const LEGACY_PET_MAP = { shiba: 'ember-pup', cat: 'shadow-kit', panda: 'nori', bunny: 'nori', penguin: 'nori' };
const REACTION_STATES = {
  idle: { row: 0, frames: 6, duration: 5500, iterations: 'infinite' },
  waving: { row: 3, frames: 4, duration: 700, iterations: 2 },
  jumping: { row: 4, frames: 5, duration: 840, iterations: 2 },
  failed: { row: 5, frames: 8, duration: 1220, iterations: 2 },
  waiting: { row: 6, frames: 6, duration: 1010, iterations: 'infinite' },
  running: { row: 7, frames: 6, duration: 820, iterations: 'infinite' },
  review: { row: 8, frames: 6, duration: 1030, iterations: 'infinite' },
};
const INTERACTIONS = [
  { reaction: 'waving', lines: ['嗨！今天也一起加油吧！', '我会一直陪你把论文写完～'] },
  { reaction: 'jumping', lines: ['抓到我啦！奖励你一个灵感！', '活动一下，再继续冲呀！'] },
  { reaction: 'running', lines: ['嘿嘿，我先溜一圈！', '陪我玩一下再继续嘛～'] },
  { reaction: 'review', lines: ['收到一个摸摸！', '我正在帮你整理思路～'] },
];

let settings = { pet: 'ember-pup', petName: '小焰', doNotDisturb: false };
let speechTimer = null;
let reactionTimer = null;
let clickTimer = null;
let pointerState = null;
let suppressNextClick = false;
let praiseTimers = [];

function normalizePetId(petId) {
  const migrated = LEGACY_PET_MAP[petId] || petId;
  return PETS[migrated] ? migrated : 'ember-pup';
}

function applyPet(petId) {
  const selected = normalizePetId(petId);
  settings.pet = selected;
  document.body.dataset.pet = selected;
  sprite.style.backgroundImage = `url("${PETS[selected].asset}")`;
  petStage.setAttribute('aria-label', `桌面宠物 ${PETS[selected].label}`);
  sprite.setAttribute('aria-label', `${PETS[selected].label}，OpenPets 原创动画宠物`);
}

function setReaction(state = 'idle', duration) {
  const definition = REACTION_STATES[state] || REACTION_STATES.idle;
  pet.dataset.reaction = state;
  sprite.style.setProperty('--sprite-row-y', `${-definition.row * 208}px`);
  sprite.style.setProperty('--sprite-frames', definition.frames);
  sprite.style.setProperty('--sprite-duration', `${definition.duration}ms`);
  sprite.style.setProperty('--sprite-iterations', definition.iterations);
  clearTimeout(reactionTimer);
  if (state !== 'idle' && definition.iterations !== 'infinite') {
    reactionTimer = setTimeout(() => setReaction('idle'), duration || definition.duration * definition.iterations);
  }
}

function clearPraiseRoutine() {
  for (const timer of praiseTimers) clearTimeout(timer);
  praiseTimers = [];
}

function startPraiseRoutine() {
  clearPraiseRoutine();
  setReaction('jumping');
  praiseTimers.push(setTimeout(() => setReaction('waving'), 1750));
  praiseTimers.push(setTimeout(() => setReaction('jumping'), 3300));
  praiseTimers.push(setTimeout(() => setReaction('running'), 5000));
  praiseTimers.push(setTimeout(() => setReaction('idle'), 6600));
}

function say(message, duration = 3200) {
  speech.textContent = message;
  speech.classList.add('is-visible');
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => speech.classList.remove('is-visible'), duration);
}

function interact() {
  const interaction = INTERACTIONS[Math.floor(Math.random() * INTERACTIONS.length)];
  setReaction(interaction.reaction);
  say(interaction.lines[Math.floor(Math.random() * interaction.lines.length)]);
}

function openWorkspace() {
  window.petAPI?.openWorkspace();
}

pet.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  pet.setPointerCapture(event.pointerId);
  const state = { pointerId: event.pointerId, startScreenX: event.screenX, startScreenY: event.screenY, windowX: null, windowY: null, dragging: false, ready: false, pressedAt: Date.now() };
  pointerState = state;
  const windowPosition = await window.petAPI.getPetWindowPosition();
  if (pointerState !== state) return;
  state.windowX = windowPosition.x;
  state.windowY = windowPosition.y;
  state.holdTimer = setTimeout(() => {
    if (pointerState !== state) return;
    state.ready = true;
    petStage.classList.add('is-dragging');
    setReaction('waiting');
  }, Math.max(0, 180 - (Date.now() - state.pressedAt)));
});

pet.addEventListener('pointermove', (event) => {
  if (!pointerState || pointerState.pointerId !== event.pointerId || !pointerState.ready) return;
  const deltaX = event.screenX - pointerState.startScreenX;
  const deltaY = event.screenY - pointerState.startScreenY;
  if (Math.hypot(deltaX, deltaY) < 3 && !pointerState.dragging) return;
  pointerState.dragging = true;
  window.petAPI.movePetWindow({ x: pointerState.windowX + deltaX, y: pointerState.windowY + deltaY });
});

function finishPointer(event) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return;
  clearTimeout(pointerState.holdTimer);
  const wasDragging = pointerState.dragging;
  pointerState = null;
  petStage.classList.remove('is-dragging');
  setReaction('idle');
  if (wasDragging) {
    suppressNextClick = true;
    window.petAPI.endPetWindowDrag();
  }
}

pet.addEventListener('pointerup', finishPointer);
pet.addEventListener('pointercancel', finishPointer);
pet.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (suppressNextClick) { suppressNextClick = false; return; }
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
  clickTimer = setTimeout(() => { clickTimer = null; interact(); }, 240);
});
pet.addEventListener('dblclick', (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearTimeout(clickTimer);
  clickTimer = null;
  openWorkspace();
});
petStage.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petAPI?.showContextMenu();
});
pet.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); openWorkspace(); }
  else if (event.key === ' ') { event.preventDefault(); interact(); }
});

window.petAPI?.onPetChanged((petId) => {
  applyPet(petId);
  setReaction('jumping');
  say(`你好，我是 ${PETS[settings.pet].label}！`);
});
window.petAPI?.onPetReaction((payload) => {
  clearPraiseRoutine();
  if (payload?.celebrate) startPraiseRoutine();
  else if (payload?.state) setReaction(payload.state, payload.duration);
  if (payload?.message && !settings.doNotDisturb) say(payload.message, payload.messageDuration || 3800);
});

async function initialize() {
  settings = { ...settings, ...(await window.petAPI.getSettings()) };
  applyPet(settings.pet);
  setReaction('idle');
  if (!settings.doNotDisturb) {
    setTimeout(() => {
      setReaction('waving');
      say(`${settings.petName || PETS[settings.pet].defaultName}来报到，今天也一起加油吧！`, 4200);
    }, 900);
    setInterval(() => {
      if (document.hidden || settings.doNotDisturb) return;
      const greetings = ['论文写到哪儿啦？', '记得休息一下眼睛哦。', '有新资料就投喂给我吧！'];
      setReaction('waving');
      say(greetings[Math.floor(Math.random() * greetings.length)], 4200);
    }, 8 * 60 * 1000);
  }
}

initialize();
