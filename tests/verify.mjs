import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shellPath = p => process.platform === 'win32' ? p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : p;
const quote = p => "'" + shellPath(p).replaceAll("'", "'\\''") + "'";
function sh(script) {
    const r = spawnSync(bash, ['-s'], { input: script, encoding: 'utf8', cwd: root });
    assert.equal(r.status, 0, r.stderr + '\n' + r.stdout);
    return r.stdout;
}
for (const name of ['common.sh', 'customize.sh', 'post-fs-data.sh', 'service.sh', 'uninstall.sh', 'restore-on-boot.sh', 'webroot/cgi-bin/exec']) {
    const result = spawnSync(bash, ['-n'], { input: read('module/' + name), encoding: 'utf8' });
    assert.equal(result.status, 0, name + ': ' + result.stderr);
}
const js = read('module/webroot/app.js');
new vm.Script(js);
const html = read('module/webroot/index.html');
const en = JSON.parse(read('module/webroot/lang/en.json'));
const vi = JSON.parse(read('module/webroot/lang/vi.json'));
assert.deepEqual(Object.keys(en).sort(), Object.keys(vi).sort());
for (const key of [...html.matchAll(/data-i18n(?:-html|-ph)?="([^"]+)"/g)].map(m => m[1])) assert.ok(key in en, key);
for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(html.includes('id="' + m[1] + '"'), m[1]);
for (const m of html.matchAll(/(?:onclick|onchange)="([a-zA-Z]+)\(/g)) assert.ok(js.includes('function ' + m[1] + '('), m[1]);
assert.ok(!/repatch_|save_config|fcm_wake|selectedApps|currentMode/.test(js));
const runtime = (read('module/post-fs-data.sh') + read('module/customize.sh') + read('module/service.sh'))
    .split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
assert.ok(!/mount -|dex2oat|execute_patcher/.test(runtime));
assert.ok(!fs.existsSync(path.join(root, 'module/tools/patcher.jar')));
const props = Object.fromEntries(read('module/module.prop').trim().split('\n').map(l => l.split('=')));
assert.ok(html.includes(props.version));
JSON.parse(read('update.json'));

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'oneone-fcm-test-'));
const put = (name, data) => {
    const dest = path.join(fixture, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
};
try {
    const a = 'system@framework@services.jar@classes.dex';
    const b = 'system_ext@framework@miui-services.jar@classes.vdex';
    const c = 'apex@com.android.wifi@javalib@service-wifi.jar@classes.dex';
    put('old/cache/arm64/.manifest', [a, b, '../escape', '.secret', 'bad/name'].join('\n') + '\n');
    put('old/cache/arm64/' + a, 'patched');
    put('old/cache/arm64/' + b, 'old');
    put('old/cache/arm64.old/.manifest', c + '\n');
    put('old/cache/arm64.old/' + c, 'downstream');
    put('dalvik/arm64/' + a, 'patched');
    put('dalvik/arm64/' + b, 'stock regenerated');
    put('dalvik/arm64/' + c, 'downstream');
    put('dalvik/arm64/unrelated.dex', 'untouched');
    put('art/arm64/' + a, 'ART stock');
    const common = read('module/common.sh');
    sh(common + '\nset -e\nstage_legacy_cache_cleanup ' + quote(path.join(fixture, 'old')) + ' ' + quote(path.join(fixture, 'records')) +
       '\ncleanup_legacy_cache ' + quote(path.join(fixture, 'records')) + ' ' + quote(path.join(fixture, 'dalvik')) +
       '\ncleanup_legacy_cache ' + quote(path.join(fixture, 'records')) + ' ' + quote(path.join(fixture, 'dalvik')));
    assert.ok(!fs.existsSync(path.join(fixture, 'dalvik/arm64', a)));
    assert.ok(!fs.existsSync(path.join(fixture, 'dalvik/arm64', c)));
    assert.equal(fs.readFileSync(path.join(fixture, 'dalvik/arm64', b), 'utf8'), 'stock regenerated');
    assert.equal(fs.readFileSync(path.join(fixture, 'dalvik/arm64/unrelated.dex'), 'utf8'), 'untouched');
    assert.equal(fs.readFileSync(path.join(fixture, 'art/arm64', a), 'utf8'), 'ART stock');
    assert.ok(!fs.existsSync(path.join(fixture, 'records')));

    // Fresh install and upgrade use the real installer with sandboxed paths.
    for (const kind of ['fresh', 'upgrade']) {
        const installed = path.join(fixture, kind, 'modules');
        const staged = path.join(fixture, kind, 'stage');
        fs.mkdirSync(staged, { recursive: true });
        fs.cpSync(path.join(root, 'module'), staged, { recursive: true });
        fs.mkdirSync(path.join(installed, 'oneone_fcm'), { recursive: true });
        const backup = 'gms_user_whitelisted=0\ngms_appop:WAKE_LOCK=ignore\npowerkeeper_gms_control=true\n';
        if (kind === 'upgrade') {
            fs.writeFileSync(path.join(installed, 'oneone_fcm/stock_settings.conf'), backup);
            fs.cpSync(path.join(fixture, 'old/cache'), path.join(installed, 'oneone_fcm/cache'), { recursive: true });
        }
        const custom = read('module/customize.sh').replaceAll('/data/adb/modules', shellPath(installed))
            .replaceAll('/data/adb/oneone_fcm_restore.conf', shellPath(path.join(fixture, 'absent-restore')));
        sh('MODPATH=' + quote(staged) + '\n' +
            'getprop() { case "$1" in ro.product.device) echo pandora;; ro.build.version.incremental) echo OS3.0.319.0.WBLCNXM;; ro.build.version.sdk) echo 36;; esac; }\n' +
            'ui_print() { :; }; abort() { echo "$*" >&2; exit 1; }; set_perm_recursive() { :; }; set_perm() { :; }\n' +
            custom);
        assert.ok(fs.existsSync(path.join(staged, 'skip_mount')));
        for (const dead of ['framework', 'system', 'stock', 'cache', 'tools', 'repatch.sh']) assert.ok(!fs.existsSync(path.join(staged, dead)), dead);
        if (kind === 'upgrade') {
            assert.equal(fs.readFileSync(path.join(staged, 'stock_settings.conf'), 'utf8'), backup);
            assert.ok(fs.statSync(path.join(staged, 'legacy-cache.tsv')).size < 1024);
        }
    }

    // Status is JSON and read-only; even old UI actions must not patch anything.
    const backend = read('module/webroot/cgi-bin/exec')
        .replace('DATA_DIR=/data/system', 'DATA_DIR=' + quote(fixture))
        .replace('MODDIR="${0%/*}/../.."', 'MODDIR=' + quote(path.join(root, 'module')));
    const mocks = 'content() { [ "$1" = query ] || exit 80; echo "Row: 0 name=gms_control, value=false"; }\n' +
        'cmd() { [ "$*" = "deviceidle whitelist" ] || exit 81; echo "system,com.google.android.gms,10001"; }\n' +
        'getprop() { echo "OS3.0.319.0.WBLCNXM"; }\n';
    const status = JSON.parse(sh(mocks + backend));
    assert.equal(status.doze, 'true');
    assert.equal(status.gms_parity.powerkeeper_gms_control, 'false');
    assert.ok(!fs.existsSync(path.join(fixture, 'fcm_wake.conf')));
    assert.ok(!fs.existsSync(path.join(fixture, 'stock_settings.conf')));

    // Mock the KernelSU callback bridge and exercise all remaining tabs.
    const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], {
        textContent: '', className: '', style: {}, disabled: false,
        classList: { add() {}, remove() {} }
    }]));
    const attrs = new Map();
    const ctx = {
        console, URLSearchParams, navigator: { language: 'vi' },
        localStorage: { getItem() { return null; }, setItem() {} },
        setTimeout, clearTimeout, fetch: async url => ({ ok: true, json: async () => url.includes('/vi.') ? vi : en }),
        document: { getElementById: id => nodes.get(id), querySelectorAll: () => [],
            documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), classList: { remove() {} } } },
        window: { location: { search: '' }, scrollTo() {} }
    };
    ctx.window.ksu = { exec(command, options, callback) {
        queueMicrotask(() => ctx.window[callback](0, JSON.stringify(status), ''));
    } };
    vm.createContext(ctx);
    vm.runInContext(js, ctx);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(nodes.get('gmsDoze').textContent, vi['gms.on']);
    vm.runInContext("switchTab('apps'); setTheme('dark');", ctx);
    assert.equal(vm.runInContext('currentTab', ctx), 'home');
    assert.equal(attrs.get('data-theme'), 'dark');
    vm.runInContext("setTheme('system');", ctx);
    assert.ok(!attrs.has('data-theme'));
    console.log('PASS: shell/JS syntax, UI/i18n, scoped migration, fresh/upgrade backups, read-only backend, bridge/theme/navigation');
} finally {
    // Only this mkdtemp-owned fixture is removed.
    fs.rmSync(fixture, { recursive: true, force: true });
}
