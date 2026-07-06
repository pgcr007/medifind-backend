module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000, // mongodb-memory-server downloads a Mongo binary on first run
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true
};