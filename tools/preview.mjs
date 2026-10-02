import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const webroot = path.resolve(import.meta.dirname, '../module/webroot');
const fixtureBridge = `
window.ksu = { exec(command, options, callback) {
    let data = {status:'ok', firmware:'UI preview only', doze:'true', gms_parity:{powerkeeper_gms_control:'false',boot_apply:true}};
    if(command.includes("'framework_status'")) data={status:'ok',framework:'ready',enabled:false};
    if(command.includes("'whitelist_get'")) data={status:'ok',packages:'0:com.example.bank'};
    if(command.includes("'app_catalog'")) {
        const canvas=document.createElement('canvas'); canvas.width=48;canvas.height=48;
        const c=canvas.getContext('2d');c.fillStyle='#4b6699';c.fillRect(0,0,48,48);c.fillStyle='white';c.font='bold 24px sans-serif';c.fillText('B',15,33);
        data={status:'ok',apps:[
            {user:0,name:'Ứng dụng ngân hàng — tên đầy đủ để kiểm tra xuống dòng',package:'com.example.bank',icon:canvas.toDataURL(),system:false},
            {user:0,name:'Ứng dụng trò chuyện',package:'com.example.chat',icon:canvas.toDataURL(),system:false},
            {user:0,name:'Dịch vụ hệ thống',package:'com.example.system',icon:null,system:true}
        ]};
    }
    if(command.includes("'whitelist_save'")) data={status:'ok'};
    if(command.includes("'save_log'")) data={status:'ok',path:'PREVIEW ONLY — no file created /Download/OneOne-FCM-demo.log'};
    queueMicrotask(()=>window[callback](0,JSON.stringify(data),''));
}};
document.addEventListener('DOMContentLoaded',()=>{
    const banner=document.createElement('p');banner.textContent='PREVIEW — dữ liệu mô phỏng, không phải trạng thái điện thoại';
    banner.style.cssText='font:12px system-ui;text-align:center;padding:8px';document.body.prepend(banner);
});`;
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fixtureBridge); return; }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filename = path.resolve(webroot, '.' + relative);
    if (!filename.startsWith(webroot + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(filename)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    let content = fs.readFileSync(filename);
    if (url.searchParams.get('fixture') === '1' && path.basename(filename) === 'index.html') content = content.toString().replace('<script src="app.js">', '<script src="/__fixture.js"></script><script src="app.js">');
    res.end(content);
}).listen(8766, '127.0.0.1', () => console.log('Preview http://127.0.0.1:8766/?fixture=1 (simulated bridge; no ADB commands)'));
