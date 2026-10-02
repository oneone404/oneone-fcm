import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import './verify-framework.mjs';
import './verify-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shellPath = p => process.platform === 'win32' ? p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : p;
const quote = p => "'" + shellPath(p).replaceAll("'", "'\\''") + "'";
function sh(script, expectedStatus = 0) {
    const r = spawnSync(bash, ['-s'], { input: script, encoding: 'utf8', cwd: root });
    assert.equal(r.status, expectedStatus, r.stderr + '\n' + r.stdout);
    return r.stdout;
}
for (const name of ['common.sh', 'customize.sh', 'service.sh', 'post-fs-data.sh', 'framework-job.sh', 'lib/framework.sh', 'uninstall.sh', 'restore-on-boot.sh', 'webroot/cgi-bin/exec']) {
    const raw = fs.readFileSync(path.join(root, 'module', name));
    assert.ok(!raw.includes(13), name + ': Android shell scripts must use LF, not CRLF');
    assert.ok(!raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), name + ': no UTF-8 BOM');
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
assert.ok(!/repatch_|save_config|fcm_wake|currentMode/.test(js));
const runtime = (read('module/common.sh') + read('module/customize.sh') + read('module/service.sh'))
    .split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
assert.ok(!/mount -|dex2oat|execute_patcher/.test(runtime));
assert.ok(!/stage_legacy_cache|cleanup_legacy_cache|\/data\/dalvik-cache/.test(runtime));
assert.ok(fs.existsSync(path.join(root, 'module/post-fs-data.sh')));
for (const native of ['patcher.jar', 'catalog.jar']) assert.ok(fs.statSync(path.join(root, 'module/tools', native)).size > 0, 'Build native tools first');
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
    // No model/OS lock: vary HyperOS generation/region, reject AOSP/no GMS.
    const common = read('module/common.sh');
    for (const [label, hyperVersion, incremental, hasGms, expected] of [
        ['hyper1-cn', 'OS1.0', 'OS1.0.8.0.TKFCNXM', true, 0],
        ['hyper2-global', 'OS2.0', 'OS2.0.1.0.VNCMIXM', true, 0],
        ['hyper-future', 'OS9.0', 'OS9.0.1.0.XABMIXM', true, 0],
        ['incremental-fallback', '', 'OS3.0.1.0.WABCNXM', true, 0],
        ['aosp', '', 'AP3A.240905.001', true, 1],
        ['missing-gms', 'OS3.0', 'OS3.0.1.0.WABCNXM', false, 1]
    ]) {
        const staged = path.join(fixture, label, 'stage');
        fs.mkdirSync(staged, { recursive: true });
        fs.cpSync(path.join(root, 'module'), staged, { recursive: true });
        const props = 'getprop() { case "$1" in ro.product.device) echo different-model;; ro.mi.os.version.name) echo ' + quote(hyperVersion) +
            ';; ro.build.version.incremental) echo ' + quote(incremental) + ';; esac; }\n';
        const custom = read('module/customize.sh').replaceAll('/data/adb/modules', shellPath(path.join(fixture, label, 'modules')))
            .replaceAll('/data/adb/oneone_fcm/', shellPath(path.join(fixture, label, 'state')) + '/')
            .replaceAll('/data/adb/oneone_fcm_restore.conf', shellPath(path.join(fixture, 'absent-restore')));
        sh('MODPATH=' + quote(staged) + '\n' + props +
            'cmd() { :; }; pm() { ' + (hasGms ? 'echo "package:/system/gms.apk";' : 'return 1;') + ' };\n' +
            'ui_print() { :; }; abort() { exit 1; }; set_perm_recursive() { :; }; set_perm() { :; };\n' + custom, expected);
        if (expected === 0) {
            const expectedBoot = incremental.includes('CNXM') ? 'true' : 'false';
            assert.equal(sh(props + common + '\ndefault_pk_boot\n').trim(), expectedBoot);
        }
    }

    // Missing provider cannot fabricate a stock backup or perform mutations.
    const missingPkConf = path.join(fixture, 'missing-pk.conf');
    sh(common + '\ncontent() { echo "No result found."; }; ensure_powerkeeper_backup ' + quote(missingPkConf), 1);
    assert.ok(!fs.existsSync(missingPkConf));

    // Runtime with no PowerKeeper/Greezer and an unsupported OEM AppOp.
    const runtimeModule = path.join(fixture, 'runtime');
    fs.mkdirSync(runtimeModule, { recursive: true });
    fs.cpSync(path.join(root, 'module'), runtimeModule, { recursive: true });
    const runtimeLog = path.join(fixture, 'runtime.log');
    const service = read('module/service.sh').replace('MODDIR=${0%/*}', 'MODDIR=' + quote(runtimeModule))
        .replaceAll('/data/system/fcm_pk_boot.conf', shellPath(path.join(fixture, 'absent-pk-setting')));
    sh('getprop() { case "$1" in sys.boot_completed) echo 1;; ro.build.version.incremental) echo OS3.0.1.0.WABCNXM;; esac; }\n' +
        'sleep() { :; }; pm() { case "$1" in path) echo "package:/system/gms.apk";; *) echo "package:com.google.android.gms uid:999001";; esac; }\n' +
        'cmd() { echo "$*" >> ' + quote(runtimeLog) + '; case "$1:$2" in ' +
        'deviceidle:whitelist) echo "system,other.pkg,10002";; appops:get) [ "$4" != 10008 ] || return 1; echo "$4: default";; greezer:*) return 1;; esac; return 0; }\n' +
        'content() { echo "content $*" >> ' + quote(runtimeLog) + '; echo "No result found."; };\n' +
        'am() { echo "am $*" >> ' + quote(runtimeLog) + '; }; iptables() { exit 80; }; ip6tables() { exit 81; };\n' + service);
    const runtimeCalls = fs.readFileSync(runtimeLog, 'utf8');
    assert.ok(runtimeCalls.includes('appops set com.google.android.gms WAKE_LOCK allow'));
    assert.ok(!runtimeCalls.includes('appops set com.google.android.gms 10008 allow'));
    assert.ok(!runtimeCalls.includes('content call'));
    assert.ok(runtimeCalls.includes('GCM_RECONNECT'));
    assert.ok(!fs.readFileSync(path.join(runtimeModule, 'stock_settings.conf'), 'utf8').includes('gms_appop:10008'));

    // Fresh installs and completed v1.5 upgrades only; no migration engine.
    for (const kind of ['fresh', 'upgrade', 'patched', 'pending']) {
        const installed = path.join(fixture, kind, 'modules');
        const staged = path.join(fixture, kind, 'stage');
        fs.mkdirSync(staged, { recursive: true });
        fs.cpSync(path.join(root, 'module'), staged, { recursive: true });
        const backup = 'gms_user_whitelisted=0\ngms_appop:WAKE_LOCK=ignore\npowerkeeper_gms_control=true\n';
        if (kind !== 'fresh') {
            fs.mkdirSync(path.join(installed, 'oneone_fcm'), { recursive: true });
            fs.writeFileSync(path.join(installed, 'oneone_fcm/module.prop'), 'versionCode=' + (kind === 'patched' ? 140 : 150) + '\n');
            fs.writeFileSync(path.join(installed, 'oneone_fcm/stock_settings.conf'), backup + 'fsi_appop:old.app:10020=allow\nsecure:obsolete_key=1\n');
        }
        if (kind === 'pending') fs.writeFileSync(path.join(installed, 'oneone_fcm/legacy-cache.tsv'), '');
        const custom = read('module/customize.sh').replaceAll('/data/adb/modules', shellPath(installed))
            .replaceAll('/data/adb/oneone_fcm/', shellPath(path.join(fixture, kind, 'state')) + '/')
            .replaceAll('/data/adb/oneone_fcm_restore.conf', shellPath(path.join(fixture, 'absent-restore')));
        sh('MODPATH=' + quote(staged) + '\n' +
            'getprop() { case "$1" in ro.mi.os.version.name) echo OS3.0;; ro.build.version.incremental) echo OS3.0.319.0.WBLCNXM;; esac; }\n' +
            'cmd() { :; }; pm() { echo "package:/system/gms.apk"; }\n' +
            'ui_print() { :; }; abort() { echo "$*" >&2; exit 1; }; set_perm_recursive() { :; }; set_perm() { :; }\n' +
            custom, ['patched', 'pending'].includes(kind) ? 1 : 0);
        if (['patched', 'pending'].includes(kind)) {
            assert.ok(!fs.existsSync(path.join(staged, 'stock_settings.conf')));
            continue;
        }
        assert.ok(fs.existsSync(path.join(staged, 'skip_mount')));
        for (const dead of ['framework', 'system', 'stock', 'cache', 'repatch.sh', 'legacy-cache.tsv', 'legacy_wake.conf']) assert.ok(!fs.existsSync(path.join(staged, dead)), dead);
        if (kind === 'upgrade') assert.equal(fs.readFileSync(path.join(staged, 'stock_settings.conf'), 'utf8'), backup);
    }

    // Uninstall restores only GMS/PowerKeeper and retains its record on failure.
    for (const failure of [false, true]) {
        const restoreConf = path.join(fixture, 'restore.conf');
        const restoreJob = path.join(fixture, 'restore-job.sh');
        const restoreLog = path.join(fixture, 'restore.log');
        fs.writeFileSync(restoreConf, 'gms_user_whitelisted=1\ngms_appop:WAKE_LOCK=ignore\npowerkeeper_gms_control=true\npowerkeeper_user:com.google.android.gms:exists=0\npowerkeeper_user:com.android.vending:exists=0\n');
        fs.writeFileSync(restoreJob, 'fixture');
        fs.writeFileSync(restoreLog, '');
        const restoration = read('module/restore-on-boot.sh')
            .replace('/data/adb/oneone_fcm_restore.conf', shellPath(restoreConf))
            .replace('/data/adb/service.d/oneone_fcm_restore.sh', shellPath(restoreJob))
            .replace('/data/adb/modules/oneone_fcm', shellPath(path.join(fixture, 'absent-module')));
        const restorationScoped = restoration.replaceAll('/data/adb/oneone_fcm', shellPath(path.join(fixture, 'removed-state')));
        sh('getprop() { echo 1; }; pm() { echo "package:com.google.android.gms uid:10001"; }\n' +
            'cmd() { echo "$*" >> ' + quote(restoreLog) + '; ' +
            'if [ "$1" = appops ] && [ "$2" = get ]; then echo "WAKE_LOCK: default"; return 0; fi; ' +
            (failure ? '[ "$1" != appops ];' : 'return 0;') + ' }\n' +
            'content() { echo "content $*" >> ' + quote(restoreLog) + '; return 0; }\n' +
            restorationScoped, failure ? 1 : 0);
        const log = fs.readFileSync(restoreLog, 'utf8');
        assert.ok(log.includes('deviceidle whitelist +com.google.android.gms'));
        assert.ok(log.includes('appops set com.google.android.gms WAKE_LOCK ignore'));
        assert.ok(log.includes('PUT_misc --arg gms_control --extra value:s:true'));
        assert.ok(!/USE_FULL_SCREEN_INTENT|10020|notification cancel/.test(log));
        assert.equal(fs.existsSync(restoreConf), failure);
        assert.equal(fs.existsSync(restoreJob), failure);
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
    const noProvider = JSON.parse(sh('content() { return 1; }; cmd() { echo "system,com.google.android.gms,10001"; }; getprop() { echo OS3.0.1.0.WABMIXM; };\n' + backend));
    assert.equal(noProvider.gms_parity.powerkeeper_gms_control, 'unsupported');
    assert.equal(noProvider.gms_parity.boot_apply, false);

    // Local export captures full module preparation/policy, never sends a report.
    const downloads = path.join(fixture, 'Download');
    fs.mkdirSync(downloads);
    const logState = path.join(fixture, 'log-state');
    fs.mkdirSync(logState);
    put('log-state/prepare.log', 'complete preparation output\nART error: fixture detail\n');
    put('log-policy.conf', 'enabled=0\n0:com.mbbank\n');
    const exportBackend = backend.replace('_downloads=/storage/emulated/0/Download', '_downloads=' + quote(downloads))
        .replace('case "${1:-status}" in', 'case save_log in');
    const exportMocks = 'FW_STATE=' + quote(logState) + '\nFW_POLICY=' + quote(path.join(fixture, 'log-policy.conf')) + '\n'
        + 'getprop() { echo fixture; }; content() { echo "Row: 0 name=gms_control, value=false"; };\n'
        + 'cmd() { echo "diagnostic $*"; };\n';
    const exportOnce = () => JSON.parse(sh(exportMocks + 'set -- unused ' + quote("WebUI: exact raw error 'quotes'\nTiếng Việt") + '\n' + exportBackend));
    const exportA = exportOnce(), exportB = exportOnce();
    assert.equal(exportA.status, 'ok');
    assert.notEqual(exportA.path, exportB.path, 'Exports must never overwrite');
    const posixPrefix = shellPath(downloads) + '/';
    assert.ok(exportA.path.startsWith(posixPrefix));
    const savedLog = fs.readFileSync(path.join(downloads, path.posix.basename(exportA.path)), 'utf8');
    assert.ok(savedLog.includes('complete preparation output\nART error: fixture detail'));
    assert.ok(savedLog.includes('0:com.mbbank'));
    assert.ok(savedLog.includes("WebUI: exact raw error 'quotes'\nTiếng Việt"));
    assert.equal(JSON.parse(sh(exportMocks + exportBackend.replace('_downloads=' + quote(downloads), '_downloads=' + quote(path.join(fixture, 'missing-download'))), 1)).status, 'error');
    const exportCode = exportBackend.split('    save_log)')[1].split('    app_catalog)')[0];
    assert.ok(!/^\s*(?:curl|wget|logcat)\b|tricky_store|github\.com/m.test(exportCode));

    // Mock the KernelSU callback bridge and exercise the single-page UI.
    const element = tag => ({
        tagName: tag.toUpperCase(), textContent: '', className: '', style: {}, disabled: false, value: '', checked: false,
        children: [], handlers: {}, open: false,
        append(...children) { this.children.push(...children); },
        replaceChild(next, previous) { this.children[this.children.indexOf(previous)] = next; },
        replaceChildren(...children) { this.children = children; this.textContent = ''; },
        addEventListener(name, fn) { this.handlers[name] = fn; },
        setAttribute(name, value) { this[name] = value; },
        showModal() { this.open = true; }, close() { this.open = false; },
        classList: { add() {}, remove() {} }
    });
    const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element('div')]));
    const attrs = new Map();
    const ctx = {
        console, URLSearchParams, navigator: { language: 'vi' },
        localStorage: { getItem() { return null; }, setItem() {} },
        setTimeout, clearTimeout, fetch: async url => ({ ok: true, json: async () => url.includes('/vi.') ? vi : en }),
        document: { getElementById: id => nodes.get(id), querySelectorAll: () => [], createElement: element, createDocumentFragment: () => element('fragment'),
            documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), classList: { remove() {} } } },
        window: { location: { search: '' }, scrollTo() {} }
    };
    let savedSelection = '0:com.mbbank';
    ctx.window.ksu = { exec(command, options, callback) {
        let response = status;
        if (command.includes("'framework_status'")) response = { status: 'ok', framework: 'unsupported', enabled: false };
        if (command.includes("'whitelist_get'")) response = { status: 'ok', packages: savedSelection };
        if (command.includes("'app_catalog'")) response = { status: 'ok', apps: [
            { name: 'MB Bank', package: 'com.mbbank', user: 0, icon: 'data:image/png;base64,AAAA', system: false },
            { name: '<script>not HTML</script> — full long label', package: 'com.example.long', user: 0, icon: 'https://untrusted.invalid/icon', system: false },
            { name: 'System app', package: 'com.example.system', user: 0, system: true }
        ] };
        if (command.includes("'whitelist_save'")) {
            savedSelection = command.match(/'whitelist_save' '([^']*)'/)[1]; response = { status: 'ok' };
        }
        if (command.includes("'save_log'")) response = { status: 'ok', path: '/storage/emulated/0/Download/OneOne-FCM-fixture.log' };
        queueMicrotask(() => ctx.window[callback](0, JSON.stringify(response), ''));
    } };
    vm.createContext(ctx);
    vm.runInContext(js, ctx);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(nodes.get('gmsDoze').textContent, vi['gms.on']);
    assert.ok(!/switchTab|initTab|currentTab/.test(js));
    assert.ok(!/<nav|tab-pane|navBtn/.test(html));
    vm.runInContext("setTheme('dark');", ctx);
    assert.equal(attrs.get('data-theme'), 'dark');
    vm.runInContext("setTheme('system');", ctx);
    assert.ok(!attrs.has('data-theme'));
    await vm.runInContext('openAppPicker()', ctx);
    assert.equal(nodes.get('appPicker').open, true);
    assert.equal(nodes.get('saveApps').disabled, false);
    const rows = nodes.get('appPickerList').children[0].children;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].children[0].tagName, 'IMG');
    assert.equal(rows[0].children[1].children[0].textContent, 'MB Bank');
    assert.equal(rows[0].children[1].children[1].textContent, 'com.mbbank');
    assert.equal(rows[1].children[0].tagName, 'SPAN');
    assert.equal(rows[1].children[1].children[0].textContent, '<script>not HTML</script> — full long label');
    rows[1].children[2].checked = true;
    rows[1].children[2].handlers.change();
    await vm.runInContext('saveAppPicker()', ctx);
    assert.equal(savedSelection, '0:com.example.long,0:com.mbbank');
    assert.equal(nodes.get('appPicker').open, false);
    nodes.get('appSearch').value = 'mbbank';
    vm.runInContext('renderAppPicker()', ctx);
    assert.equal(nodes.get('appPickerList').children[0].children.length, 1);
    // Real manager bridge shape: JSON strings, primary-user UIDs and ksu:// icons.
    const fallbackExec = ctx.window.ksu.exec;
    ctx.window.ksu.exec = (command, options, callback) => {
        assert.ok(!command.includes("'app_catalog'"), 'Native API must not run the shell catalog');
        fallbackExec(command, options, callback);
    };
    ctx.window.ksu.listPackages = type => {
        assert.equal(type, 'all');
        return JSON.stringify(['com.mbbank', 'com.example.work', 'com.example.missing', 'bad;id', 'com.mbbank']);
    };
    ctx.window.ksu.getPackagesInfo = request => {
        assert.deepEqual(JSON.parse(request), ['com.mbbank', 'com.example.work', 'com.example.missing']);
        return JSON.stringify([
            {packageName:'com.mbbank',appLabel:'MB Bank — native API',uid:10123,isSystem:false},
            {packageName:'com.example.work',appLabel:'Work profile',uid:110123,isSystem:false},
            {packageName:'com.example.missing',error:'Package not found or inaccessible'}
        ]);
    };
    await vm.runInContext('openAppPicker()', ctx);
    const nativeRows = nodes.get('appPickerList').children[0].children;
    assert.equal(nativeRows.length, 2);
    assert.equal(nativeRows[0].children[1].children[0].textContent, 'MB Bank — native API');
    assert.equal(nativeRows[0].children[0].src, 'ksu://icon/com.mbbank');
    assert.equal(nativeRows[1].children[1].children[0].textContent, 'com.example.missing');
    nativeRows[0].children[0].handlers.error();
    assert.equal(nativeRows[0].children[0].tagName, 'SPAN', 'Icon failure preserves its selectable row');
    vm.runInContext('closeAppPicker()', ctx);
    ctx.window.ksu.exec = fallbackExec;
    for (const unavailable of [() => '[]', () => '{broken', () => { throw Error('API failure'); }]) {
        ctx.window.ksu.listPackages = unavailable;
        await vm.runInContext('openAppPicker()', ctx);
        assert.equal(nodes.get('appPickerList').children[0].children.length, 2, 'Fallback keeps package rows');
        assert.equal(nodes.get('saveApps').disabled, false);
        vm.runInContext('closeAppPicker()', ctx);
    }
    const shellCatalog = JSON.parse(sh('pm() { case "$*" in "list packages --user 0") printf "package:com.mbbank\\npackage:com.android.settings\\npackage:bad;id\\n";; "list packages --user 0 -s") echo "package:com.android.settings";; *) exit 97;; esac; };\n'
        + backend.replace('case "${1:-status}" in', 'case app_catalog in')));
    assert.equal(shellCatalog.apps.length, 2);
    assert.equal(shellCatalog.apps[0].package, 'com.mbbank');
    assert.equal(shellCatalog.apps[0].system, false);
    assert.equal(shellCatalog.apps[1].system, true);
    assert.ok(!read('module/webroot/cgi-bin/exec').includes('/system/bin/app_process'));
    await vm.runInContext('saveLog()', ctx);
    assert.ok(nodes.get('logResult').textContent.includes('/storage/emulated/0/Download/OneOne-FCM-fixture.log'));
    assert.equal(nodes.get('saveLog').disabled, false);
    assert.ok(vm.runInContext('sessionLog.join("\\n")', ctx).includes('manager.error'));
    vm.runInContext('logDiagnostic("large", "x".repeat(40000))', ctx);
    assert.ok(vm.runInContext('sessionLogChars <= 24000 && sessionLogDropped > 0', ctx));
    ctx.window.ksu.exec = (command, options, callback) => queueMicrotask(() => ctx.window[callback](1, '{"status":"error"}', 'storage full'));
    await vm.runInContext('saveLog()', ctx);
    assert.equal(nodes.get('logResult').textContent, vi['log.error']);
    assert.equal(nodes.get('saveLog').disabled, false);
    console.log('PASS: Core lifecycle, backend, optional framework UI, bilingual picker name/icon/package, safe text, search/save, bridge/theme');
} finally {
    // Only this mkdtemp-owned fixture is removed.
    fs.rmSync(fixture, { recursive: true, force: true });
}
