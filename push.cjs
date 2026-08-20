// 블로그 이미지 올리기 — 커밋하고 푸시하면 그게 곧 배포다.
// 실행: node push.cjs "설명"
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { cwd: ROOT }).toString().trim();

// 한글 파일명은 주소에서 깨진다 — 올리기 전에 잡는다
const bad = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === '.git' || f.name === 'node_modules') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    // 주소로 서빙되는 건 이미지뿐이다. 원고 .txt 파일명은 한글이어도 깨질 일이 없다.
    else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name) && !/^[\x20-\x7E]+$/.test(f.name)) {
      bad.push(path.relative(ROOT, p));
    }
  }
};
walk(ROOT);
if (bad.length) {
  console.error('파일명에 ASCII가 아닌 문자가 있습니다 — 주소에서 깨집니다:');
  bad.forEach((f) => console.error('  -', f));
  process.exit(1);
}

// 폰으로 찍은 사진은 한 장에 3~8MB다. 그대로 쌓으면 1GB 한도가 금방 찬다.
const big = [];
const scan = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === '.git' || f.name === 'node_modules') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) scan(p);
    else if (/\.(png|jpe?g|gif|webp)$/i.test(f.name) && fs.statSync(p).size > 1024 * 1024) {
      big.push([path.relative(ROOT, p), (fs.statSync(p).size / 1024 / 1024).toFixed(1)]);
    }
  }
};
scan(ROOT);
if (big.length) {
  console.warn('⚠ 1MB가 넘는 이미지가 있습니다 — 블로그 본문 폭(약 700px)에는 과합니다:');
  big.forEach(([f, mb]) => console.warn(`  - ${f}  ${mb}MB`));
  console.warn('  폭 1200px 정도로 줄여서 올리는 걸 권합니다. 그대로 올리려면 이어서 진행됩니다.\n');
}

if (!out('git status --porcelain')) { console.log('바뀐 게 없습니다.'); process.exit(0); }

const msg = process.argv.slice(2).join(' ') || '이미지 추가';
run('git add -A');
run(`git -c core.quotepath=false commit -q -m "${msg.replace(/"/g, "'")}"`);
run('git push -q');
console.log('올렸습니다. 1~2분 뒤 주소가 살아납니다.');
