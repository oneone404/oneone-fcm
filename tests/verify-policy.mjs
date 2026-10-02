import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const jdk = process.env.JAVA_HOME;
if (!jdk) throw Error('JAVA_HOME is required to test the real policy source.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'oneone-policy-'));
const files = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.java')?[path.join(dir,e.name)]:[]);
const bin = name => path.join(jdk,'bin',name+(process.platform==='win32'?'.exe':''));
try {
    const compile=spawnSync(bin('javac'),['--release','8','-encoding','UTF-8','-d',temp,...files(path.join(root,'tests/policy/java')),path.join(root,'patcher/src/com/android/server/am/OneOnePushPolicy.java')],{encoding:'utf8'});
    assert.equal(compile.status,0,compile.stdout+compile.stderr);
    const test=spawnSync(bin('java'),['-cp',temp,'com.android.server.am.PolicyTest',temp],{encoding:'utf8'});
    assert.equal(test.status,0,test.stdout+test.stderr); console.log(test.stdout.trim());
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
