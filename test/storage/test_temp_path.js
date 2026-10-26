const {match} = require('node:assert').strict;
const {notEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/temp_path');

const path = '/data/prices.json';

test('A temporary path is next to the file and of its own', () => {
  const first = method({path}).path;
  const second = method({path}).path;

  const format = new RegExp(`^${path}\\.${process.pid}\\.[0-9a-f]{8}$`);

  match(first, format, 'The path is next to the file');
  notEqual(first, second, 'Each temporary path is its own');

  return;
});
