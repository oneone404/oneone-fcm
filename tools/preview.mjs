import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../module/webroot');
const apps = [
    {packageName: 'com.zing.zalo', appLabel: 'Zalo', uid: 10201, isSystem: false},
    {packageName: 'com.facebook.orca', appLabel: 'Messenger', uid: 10202, isSystem: false},
    {packageName: 'com.google.android.gm', appLabel: 'Gmail', uid: 10203, isSystem: false},
    {packageName: 'com.mbmobile', appLabel: 'MB Bank', uid: 10204, isSystem: false},
    {packageName: 'com.android.settings', appLabel: 'Settings', uid: 1000, isSystem: true}
];
let config = {mode: 'WHITELIST', packages: ['com.zing.zalo', 'com.facebook.orca']};
let parity = {powerkeeper_gms_control: 'false', boot_apply: true};
const bridge = `window.ksu = {
    listPackages: () => JSON.stringify(${JSON.stringify(apps.map(app => app.packageName))}),
    getPackagesInfo: names => JSON.stringify(${JSON.stringify(apps)}.filter(app => JSON.parse(names).includes(app.packageName))),
    exec: (command, options, callback) => {
        fetch('/demo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command})})
            .then(r => r.json()).then(data => window[callback]?.(0, JSON.stringify(data), ''))
            .catch(error => window[callback]?.(1, '', error.message));
    }
};`;

http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/demo' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 65536) { response.writeHead(413).end(); return; } }
        try {
            const {command} = JSON.parse(body);
            const action = command.match(/exec '([^']+)'/)?.[1];
            let data = {status: 'ok'};
            if (action === 'load_status') data = {...data, ...config, installed: apps.filter(app => !app.isSystem).map(app => app.packageName), gms_parity: parity};
            else if (action === 'save_config') config = JSON.parse(command.match(/'({.*})'/)[1]);
            else if (action === 'repatch_status') data = {...data, state: 'ok', active: 'yes', current: 'OS3.0.319.0.WBLCNXM', stored: 'OS3.0.319.0.WBLCNXM'};
            else if (action === 'set_pk_gms') { parity.powerkeeper_gms_control = command.includes("'false'") ? 'false' : 'true'; data = {...data, ...parity}; }
            else if (action === 'set_pk_gms_boot') { parity.boot_apply = command.includes("'true'"); data = {...data, ...parity}; }
            else if (action === 'apply_lite_defaults') { config = {mode:'WHITELIST', packages:['com.google.android.gm', 'com.zing.zalo', 'com.facebook.orca']}; }
            else data = {status:'error', message:'Not implemented in desktop demo'};
            response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(data));
        } catch { response.writeHead(400).end(); }
        return;
    }
    if (url.pathname === '/preview-bridge.js') { response.writeHead(200, {'Content-Type':'text/javascript'}).end(bridge); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
        let bytes = fs.readFileSync(file);
        if (file.endsWith('index.html')) bytes = bytes.toString().replace('<script src="app.js">', '<script src="preview-bridge.js"></script><script src="app.js">')
            .replace('<body>', '<body><p style="text-align:center;font-size:11px;opacity:.65">Desktop demo — not phone data</p>');
        const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json'}[path.extname(file)] || 'application/octet-stream';
        response.writeHead(200, {'Content-Type':mime + '; charset=utf-8', 'Cache-Control':'no-store'}).end(bytes);
    } catch { response.writeHead(404).end(); }
}).listen(8766, '127.0.0.1', () => console.log('Desktop fixture: http://127.0.0.1:8766/ (no phone access)'));
