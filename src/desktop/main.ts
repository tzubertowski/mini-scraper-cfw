import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { type Options } from '../options.js';
import { type LibraryScan } from '../core/index.js';

const channels = {
  chooseFolder: 'library:choose-folder',
  scrape: 'scrape:start',
  cancel: 'scrape:cancel',
  progress: 'scrape:progress'
} as const;

let selectedLibrary: LibraryScan | undefined;
let scrapeController: AbortController | undefined;
let mainWindow: BrowserWindow | undefined;

function applicationPath(...parts: string[]) {
  return path.join(app.getAppPath(), ...parts);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 920,
    height: 720,
    minWidth: 720,
    minHeight: 600,
    backgroundColor: '#111318',
    show: true,
    webPreferences: {
      preload: applicationPath('desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;
  window.setMenuBarVisibility(false);
  window.on('closed', () => {
    mainWindow = undefined;
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Desktop interface failed to load (${code}): ${description}`);
  });
  void window.loadFile(applicationPath('desktop', 'index.html')).then(
    () => {
      console.info('Mini Scraper window opened. Close the window or press Ctrl+C to stop.');
    },
    (error: unknown) => {
      console.error(`Desktop interface failed to open: ${error instanceof Error ? error.message : String(error)}`);
    }
  );
}

async function createOptions(input: unknown): Promise<Options> {
  if (!input || typeof input !== 'object') throw new TypeError('Invalid scrape settings');
  const value = input as Record<string, unknown>;
  const output = typeof value.output === 'string' ? value.output.toLowerCase() : '';
  const { supportedFormats } = await import('../format/format.js');
  if (!supportedFormats.includes(output)) throw new Error(`Unsupported output format: ${output}`);
  const artworkTypes = new Set(['boxart', 'snap', 'title', 'box+snap', 'box+title']);
  if (typeof value.type !== 'string' || !artworkTypes.has(value.type)) throw new Error('Unsupported artwork type');
  const width = Number(value.width);
  if (!Number.isFinite(width) || width < 50 || width > 2000) throw new Error('Artwork width must be 50–2000');

  return {
    width,
    type: value.type as Options['type'],
    force: value.force === true,
    ai: false,
    aiModel: 'gemma2:2b',
    aiUrl: 'http://localhost:11434/v1',
    regions: 'World,Europe,USA,Japan',
    output
  };
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const expectedUrl = pathToFileURL(applicationPath('desktop', 'index.html')).toString();
  if (event.senderFrame?.url !== expectedUrl) throw new Error('Rejected request from an untrusted window');
}

function registerHandlers() {
  ipcMain.handle(channels.chooseFolder, async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog({
      title: 'Choose an SD card or ROM folder',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const { detectFormat, scanLibrary } = await import('../core/index.js');
    const library = await scanLibrary(result.filePaths[0]);
    const detection = await detectFormat(library);
    selectedLibrary = library;
    return { library, detection };
  });

  ipcMain.handle(channels.scrape, async (event, input: unknown) => {
    assertTrustedSender(event);
    if (!selectedLibrary) throw new Error('Choose an SD card or ROM folder first');
    if (scrapeController) throw new Error('A scrape is already running');
    const options = await createOptions(input);
    const { scrapeLibrary } = await import('../core/index.js');
    scrapeController = new AbortController();
    try {
      return await scrapeLibrary(selectedLibrary, options, {
        signal: scrapeController.signal,
        onProgress(progress) {
          if (!event.sender.isDestroyed()) event.sender.send(channels.progress, progress);
        }
      });
    } finally {
      scrapeController = undefined;
    }
  });

  ipcMain.handle(channels.cancel, (event) => {
    assertTrustedSender(event);
    scrapeController?.abort();
  });
}

app.once('ready', () => {
  registerHandlers();
  createWindow();
});
app.on('activate', () => {
  if (app.isReady() && !mainWindow) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
