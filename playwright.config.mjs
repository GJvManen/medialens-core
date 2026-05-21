export default { testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:4173' }, webServer: { command: 'python3 -m http.server 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true } };
