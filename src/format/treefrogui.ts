import { createRomRelativeFormat } from './rom-relative.js';

// TreeFrogUI uses .res/<ROM stem>.png (unlike MinUI, which retains the extension).
const treefrogui = createRomRelativeFormat({ name: 'treefrogui', mediaFolder: '.res' });

export default treefrogui;
