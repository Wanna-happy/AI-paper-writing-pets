const assert = require('node:assert/strict');
const { findPackProblems } = require('../scripts/verify-pack.cjs');
const fixtures = {
  'src/feed.js': Buffer.from('const harmless = true;'),
  'electron/main.js': Buffer.from('const injected = "sk-' + 'a'.repeat(32) + '";'),
  'electron/pi/chat.test.mjs': Buffer.from('test only'),
  'api-key-deepseek.bin': Buffer.from('binary'),
};
const problems = findPackProblems(Object.keys(fixtures), name => fixtures[name]);
assert(problems.some(item => item.includes('Potential embedded secret')));
assert(problems.some(item => item.includes('Development file')));
assert(problems.some(item => item.includes('Sensitive file')));
assert(!findPackProblems(['src/feed.js'], name => fixtures[name]).length);
console.log('Release package credential and development-content rejection passed');
