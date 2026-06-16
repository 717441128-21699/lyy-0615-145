module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage'
};
