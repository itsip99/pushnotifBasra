const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Dependency dipasok eksplisit agar pengujian tidak membaca credential atau membuka jaringan.
function loadModule(file, dependencies = {}, clock = Date) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date: clock,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Dependency tidak diizinkan: ${name}`);
      return dependencies[name];
    },
  }, { filename: file });
  return module.exports;
}

const { createTokenCache } = loadModule('src/services/tokenCache.ts');

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('100 pemanggil paralel berbagi satu refresh, lalu memakai cache', async () => {
  let calls = 0;
  const cache = createTokenCache(async () => { calls++; return 'token-uji'; });
  const values = await Promise.all(Array.from({ length: 100 }, () => cache.getToken()));
  assert.equal(calls, 1);
  assert.ok(values.every(value => value === 'token-uji'));
  assert.equal(await cache.getToken(), 'token-uji');
  assert.equal(calls, 1);
});

test('refresh gagal dilepas sehingga percobaan berikutnya dapat pulih', async () => {
  let calls = 0;
  const cache = createTokenCache(async () => {
    if (++calls === 1) throw new Error('gagal-uji');
    return 'pulih';
  });
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => cache.getToken()));
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  assert.equal(await cache.getToken(), 'pulih');
  assert.equal(calls, 2);
});

test('supplier yang melempar sinkron atau memberi token kosong tidak mengunci cache', async () => {
  let calls = 0;
  const cache = createTokenCache(() => {
    calls++;
    if (calls === 1) throw new Error('sinkron');
    return Promise.resolve(calls === 2 ? '' : 'pulih');
  });
  await assert.rejects(cache.getToken(), /sinkron/);
  await assert.rejects(cache.getToken(), /access token/);
  assert.equal(await cache.getToken(), 'pulih');
});

test('masa cache 55 menit dihitung setelah refresh selesai', async () => {
  let now = 0;
  let calls = 0;
  const { createTokenCache: create } = loadModule('src/services/tokenCache.ts', {}, { now: () => now });
  const wait = deferred();
  const cache = create(async () => { calls++; return calls === 1 ? wait.promise : 'baru'; });
  const pending = cache.getToken();
  now = 60_000;
  wait.resolve('awal');
  await pending;
  now += 55 * 60_000 - 1;
  assert.equal(await cache.getToken(), 'awal');
  now++;
  assert.equal(await cache.getToken(), 'baru');
  assert.equal(calls, 2);
});

for (const oldFails of [false, true]) {
  test(`refresh lama ${oldFails ? 'gagal' : 'selesai'} sesudah clear tidak mengganggu refresh baru`, async () => {
    const old = deferred();
    const fresh = deferred();
    let calls = 0;
    const cache = createTokenCache(() => ++calls === 1 ? old.promise : fresh.promise);
    const first = cache.getToken();
    const firstResult = first.catch(() => 'ditolak');
    await Promise.resolve();
    cache.clearToken();
    const second = cache.getToken();
    await Promise.resolve();
    if (oldFails) old.reject(new Error('refresh-lama'));
    else old.resolve('lama');
    await firstResult;
    const third = cache.getToken();
    assert.equal(third, second);
    fresh.resolve('baru');
    assert.equal(await second, 'baru');
    assert.equal(await cache.getToken(), 'baru');
    assert.equal(calls, 2);
  });
}

test('cache tiap app terpisah', async () => {
  const first = createTokenCache(async () => 'app-a');
  const second = createTokenCache(async () => 'app-b');
  assert.equal(await first.getToken(), 'app-a');
  assert.equal(await second.getToken(), 'app-b');
  first.clearToken();
  assert.equal(await second.getToken(), 'app-b');
});

const adapters = [
  ['javaYoga/javaToken', './token_firebase_service_javaYoga', 'getAccessTokenJavaYoga', 'getCachedjavaYogaToken'],
  ['lsa/lsaToken', './token_firebase_service_lsa', 'getAccessTokenLSA', 'getCachedLsaToken'],
  ['fixupMoto/fixupMotoToken', './token_firebase_service_fixupMoto', 'getAccessTokenFixUpMoto', 'getCachedFixUpMotoToken'],
  ['hirs/hirsToken', './token_firebase_service_hirs', 'getAccessTokenHIRS', 'getCachedHIRSToken'],
  ['javaWellness/javaWellnessToken', './token_firebase_service_javaWellness', 'getAccessTokenJavaWellness', 'getCachedJavaWellnessToken', 'clearCachedWellnessToken'],
];

for (const [file, dependency, loader, getter, clear = 'clearCachedToken'] of adapters) {
  test(`${file}: 100 pemanggil hanya satu autentikasi; clear memicu refresh baru`, async () => {
    let calls = 0;
    const adapter = loadModule(`src/services/${file}.ts`, {
      '../tokenCache': { createTokenCache },
      '../../logger/logger': { logger: { info() {} }, logErrorBlock() {} },
      [dependency]: { [loader]: async () => { calls++; return 'token-uji'; } },
    });
    await Promise.all(Array.from({ length: 100 }, () => adapter[getter]()));
    assert.equal(calls, 1);
    adapter[clear]();
    await adapter[getter]();
    assert.equal(calls, 2);
  });
}

for (const [folder, service, getter, credential] of [
  ['BasraMobile', 'token_firebase_service_basraMobile', 'getAccessTokenBasraMobile', './basra-mobile-86f72-firebase-adminsdk-3nbag-ca009489f4.json'],
  ['SPKBasra', 'token_firebase_service_spkBasra', 'getAccessTokenSPKbasra', './spk-basra-7062ea7fea04.json'],
]) {
  test(`${folder}: cache 55 menit, refresh paralel, dan pulih setelah autentikasi gagal`, async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const clock = { now: () => now };
    const { createTokenCache: create } = loadModule('src/services/tokenCache.ts', {}, clock);
    const adapter = loadModule(`src/services/${folder}/${service}.ts`, {
      '../tokenCache': { createTokenCache: create },
      [credential]: { client_email: 'akun-uji', private_key: 'kunci-palsu' },
      'google-auth-library': { JWT: class {
        authorize(callback) {
          calls++;
          if (fail) callback(new Error('gagal-uji'));
          else callback(null, { access_token: 'token-uji' });
        }
      } },
    }, clock);
    await Promise.all(Array.from({ length: 100 }, () => adapter[getter]()));
    assert.equal(calls, 1);
    assert.equal(await adapter[getter](), 'token-uji');
    now = 55 * 60_000;
    fail = true;
    await assert.rejects(adapter[getter](), /gagal-uji/);
    fail = false;
    assert.equal(await adapter[getter](), 'token-uji');
    assert.equal(calls, 3);
  });

  test(`${folder}: credential hilang menghasilkan rejection, bukan promise menggantung`, async () => {
    const adapter = loadModule(`src/services/${folder}/${service}.ts`, {
      '../tokenCache': { createTokenCache },
      'google-auth-library': { JWT: class {} },
    });
    await assert.rejects(adapter[getter](), /Dependency tidak diizinkan/);
  });
}
