const process = require('node:process');

const majorVersion = Number(process.versions.node.split('.', 1)[0]);

if (majorVersion >= 26) {
  console.error('Electron Forge packaging currently requires Node.js 22 or 24 LTS.');
  process.exit(1);
}
