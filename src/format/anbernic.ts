import { createRomRelativeFormat } from './rom-relative.js';

// Shared by Anbernic stock-style frontends, OnionOS, and GarlicOS.
const anbernic = createRomRelativeFormat({ name: 'imgs', mediaFolder: 'Imgs' });

export default anbernic;
