import { createRomRelativeFormat } from './rom-relative.js';

// MinUI keys artwork by the complete ROM filename, including its extension.
const minui = createRomRelativeFormat({ name: 'minui', mediaFolder: '.res', keepRomExtension: true });

export default minui;
