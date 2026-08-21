const elements = {
  choose: document.querySelector('#choose'),
  path: document.querySelector('#path'),
  library: document.querySelector('#library'),
  settings: document.querySelector('#settings'),
  advanced: document.querySelector('#advanced'),
  actions: document.querySelector('#actions'),
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

function show(element, visible = true) {
  element.classList.toggle('hidden', !visible);
}

let networkStatusTimer;

function setBusy(busy) {
  elements.choose.disabled = busy;
  elements.start.disabled = busy;
  elements.format.disabled = busy;
  elements.type.disabled = busy;
  elements.mediaPath.disabled = busy;
  elements.chooseMedia.disabled = busy;
  elements.batchSize.disabled = busy;
  elements.batchDelay.disabled = busy;
  elements.batchRetries.disabled = busy;
  elements.width.disabled = busy;
  elements.force.disabled = busy;
  elements.cancel.disabled = !busy;
  show(elements.cancel, busy);
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
  ]
};

function updateArtworkPreview() {
  const [primary, secondary] = artworkPreviews[elements.type.value] ?? artworkPreviews.boxart;
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
    updateFormatSettings();
    show(elements.library);
    show(elements.settings);
    show(elements.advanced);
    show(elements.actions);
    show(elements.progressCard, false);
    elements.message.textContent = library.totalGames
      ? 'Ready to scrape.'
      : 'No supported games were found in this folder.';
    elements.start.disabled = library.totalGames === 0 || !detection.format;
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error);
  }
});

elements.format.addEventListener('change', () => {
  elements.start.disabled = !elements.format.value;
  updateFormatSettings();
});

elements.type.addEventListener('change', updateArtworkPreview);

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
