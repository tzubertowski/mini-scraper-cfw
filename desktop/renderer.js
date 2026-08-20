const elements = {
  choose: document.querySelector('#choose'),
  path: document.querySelector('#path'),
  library: document.querySelector('#library'),
  settings: document.querySelector('#settings'),
  actions: document.querySelector('#actions'),
  detected: document.querySelector('#detected'),
  systemsCount: document.querySelector('#systems-count'),
  gamesCount: document.querySelector('#games-count'),
  systems: document.querySelector('#systems'),
  format: document.querySelector('#format'),
  type: document.querySelector('#type'),
  width: document.querySelector('#width'),
  force: document.querySelector('#force'),
  start: document.querySelector('#start'),
  cancel: document.querySelector('#cancel'),
  progressCard: document.querySelector('#progress-card'),
  progress: document.querySelector('#progress'),
  progressLabel: document.querySelector('#progress-label'),
  progressValue: document.querySelector('#progress-value'),
  currentGame: document.querySelector('#current-game'),
  message: document.querySelector('#message')
};

function show(element, visible = true) {
  element.classList.toggle('hidden', !visible);
}

function setBusy(busy) {
  elements.choose.disabled = busy;
  elements.start.disabled = busy;
  elements.format.disabled = busy;
  elements.type.disabled = busy;
  elements.width.disabled = busy;
  elements.force.disabled = busy;
  elements.cancel.disabled = !busy;
  show(elements.cancel, busy);
}

elements.choose.addEventListener('click', async () => {
  elements.message.textContent = '';
  try {
    const selection = await window.miniScraper.chooseFolder();
    if (!selection) return;
    const { library, detection } = selection;
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
    show(elements.library);
    show(elements.settings);
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
});

window.miniScraper.onProgress((progress) => {
  const percentage = progress.total ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;
  elements.progress.value = percentage;
  elements.progressValue.textContent = `${percentage}%`;
  elements.progressLabel.textContent = `${progress.completed} of ${progress.total}`;
  elements.currentGame.textContent = `${progress.system} · ${progress.game}`;
});

elements.start.addEventListener('click', async () => {
  setBusy(true);
  elements.message.textContent = '';
  elements.progress.value = 0;
  elements.progressValue.textContent = '0%';
  elements.progressLabel.textContent = 'Preparing…';
  elements.currentGame.textContent = '';
  show(elements.progressCard);
  try {
    const result = await window.miniScraper.start({
      output: elements.format.value,
      type: elements.type.value,
      width: Number(elements.width.value),
      force: elements.force.checked
    });
    elements.message.textContent = result.cancelled
      ? `Cancelled after ${result.games} games.`
      : `Done — processed ${result.games} games; ${result.skipped} already had artwork.`;
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
