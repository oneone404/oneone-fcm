import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8').replace(/^\uFEFF/, '');
const html = read('module/webroot/index.html');
const source = read('module/webroot/app.js');
const dictionary = code => JSON.parse(read('module/webroot/lang/' + code + '.json'));
assert.deepEqual(Object.keys(dictionary('en')).sort(), Object.keys(dictionary('vi')).sort());
assert.deepEqual(JSON.parse(read('module/webroot/lang/index.json')).map(lang => lang.code).sort(), ['en', 'vi']);
for (const match of html.matchAll(/data-i18n(?:-ph|-html)?="([^"]+)"/g)) assert.ok(match[1] in dictionary('en'), match[1]);
assert.ok(!html.includes('bottom-nav') && !source.includes('switchTab('));
assert.ok(!source.includes('whitelist_save') && !source.includes('framework_enable'));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Unique HTML IDs');
for (const match of source.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), 'Missing DOM: ' + match[1]);

// Core and WebUI backend must stay exactly at the restored baseline.
for (const file of ['common.sh','customize.sh','service.sh','post-fs-data.sh','repatch.sh','restore-on-boot.sh','uninstall.sh','tools/patcher','tools/patcher.jar','webroot/cgi-bin/exec']) {
    const name = 'module/' + file;
    const baseline = execFileSync('git', ['show', 'v1.4.0:' + name], {cwd: root, maxBuffer: 4000000});
    const current = fs.readFileSync(new URL(name, root));
    if (file.endsWith('.jar')) assert.deepEqual(current, baseline, name);
    else assert.equal(current.toString().replace(/\r\n/g,'\n'), baseline.toString().replace(/\r\n/g,'\n'), name);
}

class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.events = {}; this.value = ''; this.checked = false; this.open = false; this.textContent = ''; this.style = {}; this.classList = {toggle(){}, add(){}, remove(){}}; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    replaceChild(next, old) { this.children[this.children.indexOf(old)] = next; }
    setAttribute() {}
    removeAttribute() {}
    addEventListener(type, listener) { this.events[type] = listener; }
    showModal() { this.open = true; }
    close() { this.open = false; }
}
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
const document = {getElementById: id => { assert.ok(elements[id], id); return elements[id]; },
    createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'),
    querySelectorAll: () => [], querySelector: () => saveButton, documentElement: new Element('html')};
const saveButton = new Element('button');
const storage = new Map();
let savedPayload;
let failSave = false;
let failStatus = false;
const config = {status:'ok', mode:'WHITELIST', packages:['com.zing.zalo'], installed:['com.zing.zalo','com.facebook.orca']};
const managerApps = [
    {packageName:'com.zing.zalo', appLabel:'Zalo', uid:10200},
    {packageName:'com.facebook.orca', appLabel:'Messenger', uid:10201},
    {packageName:'com.android.settings', appLabel:'Settings', uid:1000, isSystem:true},
    {packageName:'com.secondary.user', appLabel:'Other user', uid:110201},
    {packageName:'com.example.literal', appLabel:'<img src=x onerror=alert(1)>', uid:10202}
];
const ksu = {
    listPackages: () => JSON.stringify(managerApps.map(app => app.packageName)),
    getPackagesInfo: names => JSON.stringify(managerApps.filter(app => JSON.parse(names).includes(app.packageName))),
    exec: (command, options, callback) => {
        const action = command.match(/exec '([^']+)'/)[1];
        let data = {status:'ok'};
        if (action === 'load_status') data = failStatus ? {status:'error'} : config;
        if (action === 'save_config') {
            savedPayload = JSON.parse(command.match(/'({.*})'/)[1]);
            if (failSave) data = {status:'error', message:'test save failure'};
        }
        queueMicrotask(() => context[callback]?.(0, JSON.stringify(data), ''));
    }
};
const context = vm.createContext({document, console, setTimeout, clearTimeout, queueMicrotask, URLSearchParams,
    navigator:{language:'en'}, localStorage:{getItem:key=>storage.get(key)??null, setItem:(key,value)=>storage.set(key,value)},
    location:{search:''}, ksu, confirm:()=>true, fetch:async()=>({ok:true,json:async()=>dictionary('en')})});
context.window = context;
// Avoid automatic bootstrap; exercise the same functions deterministically.
vm.runInContext(source.slice(0, source.indexOf('    // 1. Instant hydration')), context);
const run = expression => vm.runInContext(expression, context);
await run('loadStatus()');
assert.equal(run('policyReady'), true);
await run('openAppPicker()');
assert.equal(elements.appPicker.open, true);
assert.equal(run('appCatalog.some(app => app.package === "com.secondary.user")'), false);
assert.equal(run('appCatalog.find(app => app.package === "com.zing.zalo").name'), 'Zalo');
assert.equal(run('appCatalog.find(app => app.package === "com.example.literal").name'), '<img src=x onerror=alert(1)>');
const rendered = () => elements.appPickerList.children[0].children;
assert.equal(rendered().length, 3, 'Hide unselected system apps');
assert.equal(rendered().find(row => row.children[1].children[1].textContent === 'com.example.literal').children[1].children[0].children.length, 0, 'App labels are plain text');
elements.appSearch.value = 'mess'; run('renderAppPicker()');
assert.equal(rendered().length, 1); assert.equal(rendered()[0].children[1].children[0].textContent, 'Messenger');
elements.appSearch.value = ''; elements.showSystemApps.checked = true; run('renderAppPicker()');
assert.equal(rendered().length, 4);
run('appDraft.add("com.facebook.orca"); closeAppPicker()');
assert.equal(run('selectedApps.has("com.facebook.orca")'), false, 'Cancel is not a save');
await run('openAppPicker()');
run('appDraft.add("com.facebook.orca"); setMode("BLACKLIST")');
await run('saveAppPicker()');
assert.deepEqual(savedPayload, {mode:'BLACKLIST', packages:['com.facebook.orca','com.zing.zalo']});
assert.ok(savedPayload.packages.every(pkg => !pkg.includes(':')), 'v1.4 bare package format');
assert.equal(elements.appPicker.open, false);
assert.equal(run('savedMode'), 'BLACKLIST');
await run('openAppPicker()'); run('appDraft.delete("com.facebook.orca")'); failSave = true;
await run('saveAppPicker()');
assert.equal(elements.appPicker.open, true, 'Save failure retains draft and dialog');
assert.equal(run('selectedApps.has("com.facebook.orca")'), true);
assert.equal(run('appDraft.has("com.facebook.orca")'), false);
failSave = false; run('closeAppPicker()');
ksu.listPackages = () => 'malformed';
await run('openAppPicker()');
assert.equal(run('appCatalog.some(app => app.package === "com.zing.zalo")'), true, 'Manager failure falls back to original package list');
run('closeAppPicker()');
failStatus = true; await run('loadStatus()');
assert.equal(elements.chooseApps.disabled, true);
savedPayload = undefined; await run('saveConfiguration()');
assert.equal(savedPayload, undefined, 'Failed status cannot overwrite configuration');
context.ksu = null; assert.equal((await run('execAction("load_status")')).success, false);
console.log('PASS: v1.4 backend unchanged; one-page UI; languages; manager labels/icons; search/system filter; cancel/save/failure/fallback; bare package policy.');
