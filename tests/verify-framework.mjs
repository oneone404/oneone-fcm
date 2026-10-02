import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'oneone-framework-'));
const posix = value => process.platform === 'win32' ? value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : value;
const q = value => "'" + posix(value).replaceAll("'", "'\\''") + "'";
const read = value => fs.readFileSync(path.join(root, value), 'utf8').replaceAll('\r\n', '\n');
const put = (relative, content) => {
    const dest = path.join(fixture, relative); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content); return dest;
};
const run = (body, status = 0) => {
    const result = spawnSync(bash, ['-s'], { input: body, encoding: 'utf8' });
    assert.equal(result.status, status, result.stdout + result.stderr); return result.stdout.trim();
};
try {
    const staged = path.join(fixture, 'module'); fs.cpSync(path.join(root, 'module'), staged, { recursive: true });
    const state = path.join(fixture, 'state');
    const policy = path.join(fixture, 'policy.conf');
    const target = put('stock.jar', 'original jar fixture');
    const services = put('services.jar', 'original services fixture');
    const dex2oat = put('dex2oat', '#!/bin/sh\nexit 0\n');
    run('chmod 0755 ' + q(dex2oat));
    let library = read('module/lib/framework.sh')
        .replace('FW_TARGET=/system_ext/framework/miui-services.jar', 'FW_TARGET=' + q(target))
        .replaceAll('/system/framework/services.jar', posix(services))
        .replace('_fw_dex2oat=/apex/com.android.art/bin/dex2oat64', '_fw_dex2oat=' + q(dex2oat));
    const properties = 'getprop() { case "$1" in ro.product.device) echo pandora;; ro.build.version.incremental) echo OS3.0.319.0.WBLCNXM;; ro.build.version.sdk) echo 36;; ro.product.cpu.abi) echo arm64-v8a;; esac; };\n';
    const setup = 'MODDIR=' + q(staged) + '\nFW_STATE=' + q(state) + '\nFW_POLICY=' + q(policy) + '\n' + properties + library + '\n' +
        'fw_env_key() { echo fixture-environment; };\n' +
        'pm() { echo "package:com.google.android.gms uid:10001"; }; chown() { :; }; chcon() { :; };\n';
    run(setup + "fw_write_policy list '0:com.mbbank\n0:com.example.chat\n0:com.mbbank'\n");
    const initial = fs.readFileSync(policy, 'utf8');
    assert.equal(initial, 'enabled=0\ngms_uid=10001\n0:com.mbbank\n0:com.example.chat\n');
    for (const bad of ['1:com.mbbank', '0:com.bad;id', '0:com.bad\nenabled=1', '0:bad', '0:com.bad value']) {
        run(setup + 'fw_write_policy list ' + q(bad) + '\n', 1);
        assert.equal(fs.readFileSync(policy, 'utf8'), initial);
    }
    run(setup + 'fw_write_policy enabled 1\n', 1);
    assert.equal(fs.readFileSync(policy, 'utf8'), initial);
    const beforeUI = run(setup + 'fw_key\n');
    fs.writeFileSync(path.join(staged, 'tools/catalog.jar'), 'new catalog helper');
    fs.writeFileSync(path.join(staged, 'webroot/style.css'), 'new UI');
    assert.equal(run(setup + 'fw_key\n'), beforeUI, 'UI/catalog changes must not invalidate framework');

    const pipeline = setup +
        'fw_hash() { case "$1" in ' + q(target) + ') echo 0ca8bee568f2d4607aa6393764338d5b52fcd0101cdce49c39d8051a3fdc4c70;; ' +
        q(services) + ') echo 4f313e77755d6a5ce20b4ad79d132067aebda5eb940089180a0bfbf62dbbe7ba;; *) sha256sum "$1" | awk \'{print $1}\';; esac; };\n' +
        'fw_run_patcher() { printf patched > "$3"; };\n';
    run(pipeline + 'fw_prepare\n');
    assert.ok(fs.existsSync(path.join(state, 'artifacts/stock.jar')));
    assert.ok(!fs.existsSync(path.join(state, 'prepare.lock')));
    assert.ok(!fs.existsSync(path.join(state, 'job.pid')));
    run(setup + 'fw_ready\n');
    run(setup + 'fw_write_policy enabled 1\n');
    assert.ok(fs.readFileSync(policy, 'utf8').startsWith('enabled=1\n'));
    const manifest = fs.readFileSync(path.join(state, 'artifacts/manifest'), 'utf8');
    const bootId = put('boot-id', 'fixture-boot\n');
    const mounts = put('mounts.log', '');
    const bootHelpers = '\nfw_env_key() { echo fixture-environment; };\n' +
        'fw_hash() { case "$1" in ' + q(target) + ') echo 0ca8bee568f2d4607aa6393764338d5b52fcd0101cdce49c39d8051a3fdc4c70;; *) sha256sum "$1" | awk \'{print $1}\';; esac; };\n';
    fs.writeFileSync(path.join(staged, 'lib/framework.sh'), library + bootHelpers);
    const boot = read('module/post-fs-data.sh').replace('MODDIR=${0%/*}', 'MODDIR=' + q(staged))
        .replaceAll('/proc/sys/kernel/random/boot_id', posix(bootId));
    const bootSetup = 'FW_STATE=' + q(state) + '\nFW_POLICY=' + q(policy) + '\n' + properties +
        'chown() { :; }; chcon() { :; }; pm() { echo "package:com.google.android.gms uid:10001"; };\n' +
        'mount() { echo "$*" >> ' + q(mounts) + '; return 0; }; umount() { exit 90; };\n';
    run(bootSetup + boot);
    assert.equal(fs.readFileSync(mounts, 'utf8').trim().split('\n').length, 2);
    assert.ok(fs.existsSync(path.join(state, 'boot-pending')));
    // An unconfirmed activation cannot be mounted again on the next boot.
    run(bootSetup + boot);
    assert.equal(fs.readFileSync(mounts, 'utf8').trim().split('\n').length, 2);
    assert.ok(fs.readFileSync(policy, 'utf8').startsWith('enabled=0\n'));
    fs.rmSync(path.join(state, 'boot-pending'));
    run(setup + 'fw_write_policy enabled 1\n');
    fs.writeFileSync(mounts, '');
    run(bootSetup + 'getprop() { echo unknown-firmware; };\n' + boot);
    assert.equal(fs.readFileSync(mounts, 'utf8'), '');
    run(pipeline + 'fw_run_patcher() { return 1; }; fw_prepare\n', 1);
    assert.equal(fs.readFileSync(path.join(state, 'artifacts/manifest'), 'utf8'), manifest, 'Failed prepare preserves previous artifact');
    run(pipeline + 'fw_hash() { echo unknown-input; }; fw_prepare\n', 1);
    assert.equal(fs.readFileSync(path.join(state, 'artifacts/manifest'), 'utf8'), manifest);
    fs.writeFileSync(path.join(state, 'artifacts/miui-services.jar'), 'corrupt');
    run(setup + 'fw_ready\n', 1);
    run(setup + 'fw_write_policy enabled 0\n');
    assert.ok(fs.readFileSync(policy, 'utf8').startsWith('enabled=0\n'));
    fs.writeFileSync(path.join(state, 'artifacts/miui-services.jar'), 'patched');
    fs.writeFileSync(path.join(staged, 'tools/patcher.jar'), 'changed patcher');
    run(setup + 'fw_ready\n', 1);
    run(setup + 'getprop() { echo unknown-ROM; }; fw_ready\n', 1);

    // Missing ART verifier is not a pass and must not publish a new generation.
    fs.writeFileSync(dex2oat, '#!/bin/sh\nexit 1\n');
    run(pipeline + 'fw_prepare\n', 1);
    assert.equal(fs.readFileSync(path.join(state, 'artifacts/manifest'), 'utf8'), manifest);
    console.log('PASS: whitelist validation/atomic preservation, UI-only reuse, boot mount guard/unconfirmed-boot disable, corrupt/unknown/stale rejection, failed patch/ART keeps previous generation');
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
