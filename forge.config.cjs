module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'mini-scraper',
    ignore: [
      /^\/(?:\.git|\.github|out|scripts|src|test|tests)(?:\/|$)/v,
      /^\/(?:CHANGELOG\.md|Dockerfile|pic\.jpg|tsconfig(?:\.test)?\.json|vitest\.config\.ts)$/v
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32']
    }
  ]
};
