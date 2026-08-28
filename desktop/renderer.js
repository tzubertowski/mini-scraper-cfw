const elements = {
  choose: document.querySelector('#choose'),
  sourceTitle: document.querySelector('#source-title'),
  sourceNote: document.querySelector('#source-note'),
  path: document.querySelector('#path'),
  picker: document.querySelector('#picker'),
  library: document.querySelector('#library'),
  settings: document.querySelector('#settings'),
  advanced: document.querySelector('#advanced'),
  actions: document.querySelector('#actions'),
  artworkSource: document.querySelector('#artwork-source'),
  retroAchievementsLogin: document.querySelector('#retroachievements-login'),
  retroAchievementsLoginPrompt: document.querySelector('#retroachievements-login-prompt'),
  retroAchievementsOpenLogin: document.querySelector('#retroachievements-open-login'),
  retroAchievementsDialog: document.querySelector('#retroachievements-dialog'),
  retroAchievementsForm: document.querySelector('#retroachievements-form'),
  retroAchievementsUsername: document.querySelector('#retroachievements-username'),
  retroAchievementsApiKey: document.querySelector('#retroachievements-api-key'),
  retroAchievementsConnect: document.querySelector('#retroachievements-connect'),
  retroAchievementsClose: document.querySelector('#retroachievements-close'),
  retroAchievementsCancelLogin: document.querySelector('#retroachievements-cancel-login'),
  retroAchievementsConnected: document.querySelector('#retroachievements-connected'),
  retroAchievementsConnectedUser: document.querySelector('#retroachievements-connected-user'),
  retroAchievementsForget: document.querySelector('#retroachievements-forget'),
  retroAchievementsMessage: document.querySelector('#retroachievements-message'),
  detected: document.querySelector('#detected'),
  systemsCount: document.querySelector('#systems-count'),
  gamesCount: document.querySelector('#games-count'),
  systems: document.querySelector('#systems'),
  format: document.querySelector('#format'),
  type: document.querySelector('#type'),
  esdeMediaSetting: document.querySelector('#esde-media-setting'),
  mediaPath: document.querySelector('#media-path'),
  chooseMedia: document.querySelector('#choose-media'),
  batchSize: document.querySelector('#batch-size'),
  batchDelay: document.querySelector('#batch-delay'),
  batchRetries: document.querySelector('#batch-retries'),
  artworkPreviewPrimary: document.querySelector('#artwork-preview-primary'),
  artworkPreviewPrimaryLabel: document.querySelector('#artwork-preview-primary-label'),
  artworkPreviewSecondaryWrap: document.querySelector('#artwork-preview-secondary-wrap'),
  artworkPreviewSecondary: document.querySelector('#artwork-preview-secondary'),
  artworkPreviewSecondaryLabel: document.querySelector('#artwork-preview-secondary-label'),
  width: document.querySelector('#width'),
  force: document.querySelector('#force'),
  start: document.querySelector('#start'),
  cancel: document.querySelector('#cancel'),
  progressCard: document.querySelector('#progress-card'),
  progress: document.querySelector('#progress'),
  progressLabel: document.querySelector('#progress-label'),
  progressValue: document.querySelector('#progress-value'),
  currentGame: document.querySelector('#current-game'),
  networkStatus: document.querySelector('#network-status'),
  message: document.querySelector('#message')
};

const ARTWORK_SOURCE_STORAGE_KEY = 'mini-scraper.artwork-source';

function show(element, visible = true) {
  element.classList.toggle('hidden', !visible);
}

let networkStatusTimer;
let busy = false;
let authenticationBusy = false;
let libraryHasGames = false;
let retroAchievementsSession = { authenticated: false };

function resetLibraryView() {
  libraryHasGames = false;
  elements.path.textContent = 'No folder selected';
  show(elements.library, false);
  show(elements.settings, false);
  show(elements.advanced, false);
  show(elements.actions, false);
  show(elements.progressCard, false);
}

function sourceReady() {
  return elements.artworkSource.value === 'automatic' || retroAchievementsSession.authenticated;
}

function readableError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
}

function refreshControls() {
  const locked = !sourceReady();
  elements.choose.disabled = busy;
  elements.artworkSource.disabled = busy;
  elements.retroAchievementsUsername.disabled = busy || authenticationBusy;
  elements.retroAchievementsApiKey.disabled = busy || authenticationBusy;
  elements.retroAchievementsConnect.disabled = busy || authenticationBusy;
  elements.retroAchievementsOpenLogin.disabled = busy || authenticationBusy;
  elements.retroAchievementsClose.disabled = authenticationBusy;
  elements.retroAchievementsCancelLogin.disabled = authenticationBusy;
  elements.retroAchievementsForget.disabled = busy || authenticationBusy;
  for (const element of [
    elements.format,
    elements.type,
    elements.mediaPath,
    elements.chooseMedia,
    elements.batchSize,
    elements.batchDelay,
    elements.batchRetries,
    elements.width,
    elements.force
  ]) {
    element.disabled = busy || locked;
  }

  elements.start.disabled = busy || locked || !libraryHasGames || !elements.format.value;
  elements.cancel.disabled = !busy;
  elements.advanced.classList.toggle('settings-locked', locked);
  show(elements.cancel, busy);
}

function setBusy(value) {
  busy = value;
  refreshControls();
}

const artworkPreviews = {
  boxart: [{ file: 'wario-land-3-boxart.png', label: 'Box art', alt: 'Wario Land 3 box art' }],
  snap: [{ file: 'wario-land-3-screenshot.png', label: 'Screenshot', alt: 'Wario Land 3 gameplay screenshot' }],
  title: [{ file: 'wario-land-3-title.png', label: 'Title screen', alt: 'Wario Land 3 title screen' }],
  'box+snap': [
    { file: 'wario-land-3-boxart.png', label: 'Box art', alt: 'Wario Land 3 box art' },
    { file: 'wario-land-3-screenshot.png', label: 'Screenshot', alt: 'Wario Land 3 gameplay screenshot' }
  ],
  'box+title': [
    { file: 'wario-land-3-boxart.png', label: 'Box art', alt: 'Wario Land 3 box art' },
    { file: 'wario-land-3-title.png', label: 'Title screen', alt: 'Wario Land 3 title screen' }
  ],
  'snap+box': [
    { file: 'wario-land-3-screenshot.png', label: 'Screenshot', alt: 'Wario Land 3 gameplay screenshot' },
    { file: 'wario-land-3-boxart.png', label: 'Box art', alt: 'Wario Land 3 box art' }
  ],
  'title+box': [
    { file: 'wario-land-3-title.png', label: 'Title screen', alt: 'Wario Land 3 title screen' },
    { file: 'wario-land-3-boxart.png', label: 'Box art', alt: 'Wario Land 3 box art' }
  ]
};

function updateArtworkPreview() {
  const [primary, secondary] = artworkPreviews[elements.type.value] ?? artworkPreviews.boxart;
  const composite = Boolean(secondary);
  elements.artworkPreviewPrimary.parentElement?.parentElement?.classList.toggle('is-composite', composite);
  elements.artworkPreviewPrimary.src = `./assets/artwork-preview/${primary.file}`;
  elements.artworkPreviewPrimary.alt = primary.alt;
  elements.artworkPreviewPrimaryLabel.textContent = primary.label;
  show(elements.artworkPreviewSecondaryWrap, Boolean(secondary));
  if (secondary) {
    elements.artworkPreviewSecondary.src = `./assets/artwork-preview/${secondary.file}`;
    elements.artworkPreviewSecondary.alt = secondary.alt;
    elements.artworkPreviewSecondaryLabel.textContent = secondary.label;
  }
}

function updateFormatSettings() {
  show(elements.esdeMediaSetting, elements.format.value === 'esde');
}

function updateArtworkSource() {
  const retroAchievements = elements.artworkSource.value === 'retroachievements';
  elements.retroAchievementsMessage.classList.remove('text-danger', 'text-success');
  show(elements.retroAchievementsLogin, retroAchievements);
  show(elements.retroAchievementsLoginPrompt, retroAchievements && !retroAchievementsSession.authenticated);
  show(elements.retroAchievementsConnected, retroAchievements && retroAchievementsSession.authenticated);
  if (retroAchievementsSession.authenticated) {
    elements.retroAchievementsConnectedUser.textContent = `Connected as ${retroAchievementsSession.username}`;
  }

  elements.sourceTitle.textContent = retroAchievements
    ? retroAchievementsSession.authenticated
      ? `Artwork from RetroAchievements · ${retroAchievementsSession.username}`
      : 'Artwork from RetroAchievements · login required'
    : 'Artwork from Libretro Thumbnails · no account needed';
  elements.sourceNote.textContent = retroAchievements
    ? 'RetroAchievements matches supported ROM hashes and uses Libretro automatically when artwork is unavailable.'
    : 'Automatic is ready immediately. Choose RetroAchievements in step 1 to use your account.';
  elements.retroAchievementsMessage.textContent = '';
  if (retroAchievements && !retroAchievementsSession.authenticated && !elements.retroAchievementsDialog.open) {
    elements.retroAchievementsDialog.showModal();
  }
  show(elements.picker, sourceReady());
  refreshControls();
}

async function loadRetroAchievementsSession() {
  try {
    retroAchievementsSession = await window.miniScraper.getRetroAchievementsSession();
    if (retroAchievementsSession.username) elements.retroAchievementsUsername.value = retroAchievementsSession.username;
  } catch (error) {
    elements.retroAchievementsMessage.textContent = readableError(error);
    elements.retroAchievementsMessage.classList.add('text-danger');
  }

  updateArtworkSource();
}

elements.artworkSource.addEventListener('change', () => {
  window.localStorage.setItem(ARTWORK_SOURCE_STORAGE_KEY, elements.artworkSource.value);
  resetLibraryView();
  updateArtworkSource();
});

elements.retroAchievementsOpenLogin.addEventListener('click', () => elements.retroAchievementsDialog.showModal());
elements.retroAchievementsClose.addEventListener('click', () => elements.retroAchievementsDialog.close());
elements.retroAchievementsCancelLogin.addEventListener('click', () => elements.retroAchievementsDialog.close());

elements.retroAchievementsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authenticationBusy = true;
  elements.retroAchievementsMessage.textContent = 'Checking your RetroAchievements username and Web API key…';
  elements.retroAchievementsMessage.classList.remove('text-danger', 'text-success');
  refreshControls();
  try {
    retroAchievementsSession = await window.miniScraper.loginRetroAchievements({
      username: elements.retroAchievementsUsername.value,
      webApiKey: elements.retroAchievementsApiKey.value
    });
    elements.retroAchievementsApiKey.value = '';
    elements.retroAchievementsDialog.close();
    updateArtworkSource();
    elements.retroAchievementsMessage.textContent = 'Connected. Web API key saved securely on this computer.';
    elements.retroAchievementsMessage.classList.add('text-success');
  } catch (error) {
    elements.retroAchievementsMessage.textContent = readableError(error);
    elements.retroAchievementsMessage.classList.add('text-danger');
  } finally {
    authenticationBusy = false;
    refreshControls();
  }
});

elements.retroAchievementsForget.addEventListener('click', async () => {
  authenticationBusy = true;
  refreshControls();
  try {
    retroAchievementsSession = await window.miniScraper.logoutRetroAchievements();
    elements.retroAchievementsApiKey.value = '';
    resetLibraryView();
    updateArtworkSource();
  } finally {
    authenticationBusy = false;
    refreshControls();
  }
});

elements.choose.addEventListener('click', async () => {
  elements.message.textContent = '';
  try {
    const selection = await window.miniScraper.chooseFolder();
    if (!selection) return;
    const { library, detection, suggestedMediaPath } = selection;
    elements.path.textContent = library.selectedPath;
    elements.systemsCount.textContent = String(library.systems.length);
    elements.gamesCount.textContent = String(library.totalGames);
    elements.systems.replaceChildren(
      ...library.systems.map((system) => {
        const item = document.createElement('li');
        item.textContent = `${system.name} — ${system.gameCount} games`;
        return item;
      })
    );

    const detected = detection.candidates[0];
    elements.detected.textContent = detection.format
      ? `${detected.label} (${Math.round(detection.confidence * 100)}%)`
      : 'Not certain — please choose';
    elements.format.value = detection.format ?? '';
    elements.mediaPath.value = suggestedMediaPath;
    libraryHasGames = library.totalGames > 0;
    updateFormatSettings();
    show(elements.library);
    show(elements.settings);
    show(elements.advanced);
    show(elements.actions);
    show(elements.progressCard, false);
    elements.message.textContent = library.totalGames
      ? 'Ready to scrape.'
      : 'No supported games were found in this folder.';
    refreshControls();
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error);
  }
});

elements.format.addEventListener('change', () => {
  updateFormatSettings();
  refreshControls();
});

elements.type.addEventListener('change', () => {
  updateArtworkPreview();
});

elements.chooseMedia.addEventListener('click', async () => {
  const mediaPath = await window.miniScraper.chooseMediaFolder();
  if (mediaPath) elements.mediaPath.value = mediaPath;
});

window.miniScraper.onProgress((progress) => {
  const percentage = progress.total ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;
  elements.progress.value = percentage;
  elements.progressValue.textContent = `${percentage}%`;
  elements.progressLabel.textContent = `${progress.completed} of ${progress.total}`;
  elements.currentGame.textContent = `${progress.system} · ${progress.game}`;
});

window.miniScraper.onNetworkStatus((status) => {
  clearTimeout(networkStatusTimer);
  elements.networkStatus.textContent = status.message;
  elements.networkStatus.classList.toggle('alert-danger', status.phase === 'failed');
  elements.networkStatus.classList.toggle('alert-warning', status.phase !== 'failed');
  show(elements.networkStatus);
  if (status.phase === 'recovered') {
    networkStatusTimer = setTimeout(() => show(elements.networkStatus, false), 2500);
  }
});

elements.start.addEventListener('click', async () => {
  setBusy(true);
  elements.message.textContent = '';
  elements.progress.value = 0;
  elements.progressValue.textContent = '0%';
  elements.progressLabel.textContent = 'Preparing…';
  elements.currentGame.textContent = '';
  clearTimeout(networkStatusTimer);
  show(elements.networkStatus, false);
  show(elements.progressCard);
  try {
    const result = await window.miniScraper.start({
      output: elements.format.value,
      artworkSource: elements.artworkSource.value,
      type: elements.type.value,
      width: Number(elements.width.value),
      force: elements.force.checked,
      mediaPath: elements.mediaPath.value,
      batchSize: Number(elements.batchSize.value),
      batchDelayMs: Number(elements.batchDelay.value),
      batchRetries: Number(elements.batchRetries.value)
    });
    const failures = result.downloadFailures ? ` ${result.downloadFailures} downloads failed after retries; run again to retry them.` : '';
    elements.message.textContent = result.cancelled
      ? `Cancelled after ${result.games} games.`
      : `Done — processed ${result.games} games; ${result.skipped} already had artwork.${failures}`;
    elements.message.classList.toggle('alert-warning', result.downloadFailures > 0);
    elements.message.classList.toggle('alert-info', result.downloadFailures === 0);
    if (!result.cancelled) {
      elements.progress.value = 100;
      elements.progressValue.textContent = '100%';
      elements.progressLabel.textContent = 'Complete';
    }
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
  }
});

elements.cancel.addEventListener('click', async () => {
  elements.cancel.disabled = true;
  elements.message.textContent = 'Cancelling after the current game…';
  await window.miniScraper.cancel();
});

const savedArtworkSource = window.localStorage.getItem(ARTWORK_SOURCE_STORAGE_KEY);
if (savedArtworkSource === 'automatic' || savedArtworkSource === 'retroachievements') {
  elements.artworkSource.value = savedArtworkSource;
}

void loadRetroAchievementsSession();
