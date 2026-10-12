const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rememberGuildName,
  resolveGuildLogName,
  forgetGuildName,
  shouldLogGuildMembership,
} = require('../src/utils/guild/guildLogUtils');

test('startup and reconnect membership events do not produce global logs', () => {
  assert.equal(shouldLogGuildMembership({ client: { isReady: () => false } }), false);
  assert.equal(shouldLogGuildMembership({ client: { isReady: () => true } }), true);
});

test('guild name survives a partial leave event and updates after rename', () => {
  const client = {};
  rememberGuildName({ client, id: 'guild', name: 'Lunaby Community' });
  assert.equal(resolveGuildLogName({ client, id: 'guild' }), 'Lunaby Community');
  rememberGuildName({ client, id: 'guild', name: 'New Name' });
  assert.equal(resolveGuildLogName({ client, id: 'guild' }), 'New Name');
  forgetGuildName({ client, id: 'guild' });
  assert.equal(resolveGuildLogName({ client, id: 'guild' }), 'Không rõ tên guild');
});

test('unknown guild name has a readable fallback and clients have separate caches', () => {
  const first = {};
  const second = {};
  rememberGuildName({ client: first, id: 'guild', name: 'Known' });
  assert.equal(resolveGuildLogName({ client: second, id: 'guild' }), 'Không rõ tên guild');
  assert.equal(resolveGuildLogName({ client: second, id: 'guild', name: '  ' }), 'Không rõ tên guild');
});

test('leave handler suppresses startup logs, logs known names, and cleans data if logging fails', async () => {
  const Module = require('node:module');
  const handlerPath = require.resolve('../src/handlers/guildHandler');
  const originalLoad = Module._load;
  const sent = [];
  const deleted = [];
  let failLog = false;
  const stubs = {
    'discord.js': {},
    './commandHandler': {},
    '../services/user/BlacklistService': {},
    '../utils/discord/blacklistUtils': {},
    '../utils/core/logger.js': { info() {}, error() {} },
    '../services/database/MariaModDB.js': {
      async getBotSetting() { return 'log-channel'; },
      async deleteGuildData(id) { deleted.push(id); },
    },
    '../utils/guild/guildLocale.js': {},
    '../utils/discord/permissionUtils.js': {},
  };
  Module._load = function(request, parent, ...args) {
    if (parent?.filename === handlerPath && Object.hasOwn(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, ...args);
  };
  let handler;
  try { handler = require(handlerPath); }
  finally { Module._load = originalLoad; delete require.cache[handlerPath]; }

  let ready = false;
  const client = {
    isReady: () => ready,
    channels: { async fetch() { return {
      isTextBased: () => true,
      async send(message) { if (failLog) throw new Error('cannot send'); sent.push(message); },
    }; } },
  };
  await handler.handleGuildLeave({ client, id: 'startup-guild' });
  assert.deepEqual(sent, []);
  assert.deepEqual(deleted, ['startup-guild']);

  ready = true;
  rememberGuildName({ client, id: 'known-guild', name: 'Lunaby' });
  await handler.handleGuildLeave({ client, id: 'known-guild' });
  assert.deepEqual(sent, ['Bot rời khỏi guild: Lunaby (known-guild)']);

  failLog = true;
  await handler.handleGuildLeave({ client, id: 'failed-log', name: 'Test' });
  assert.deepEqual(deleted, ['startup-guild', 'known-guild', 'failed-log']);
});
