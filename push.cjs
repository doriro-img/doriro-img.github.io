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

// 이 레포는 공개다. 한 번 푸시된 키는 지워도 히스토리에 남는다 — 올라가기 전에 막는다.
//
// 키의 "형식"을 추측하지 않는다. 형식을 맞히려다 실제로 한 번 뚫렸다
// (AQAAAAA 를 찾는데 진짜 키는 AQAAAAB 였다).
// .env 에 적힌 값 자체를 읽어서 그 문자열이 커밋될 파일에 들어있는지 대조한다.
// 이러면 키가 무슨 모양이든 잡힌다.
const secrets = [];
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Z0-9_]+\s*=\s*(.+?)\s*$/);
    // 16자 미만은 키가 아니라 설정값이다 (CUSTOMER_ID 같은 것). 오탐을 만든다.
    if (m && m[1].length >= 16) secrets.push(m[1]);
  }
}
// .env 를 지웠거나 못 읽어도 최소한의 그물은 남긴다.
const PATTERNS = [
  [/(?:secret|api|access|private)[_-]?(?:key|token|license)\s*[:=]\s*['"\`]?[A-Za-z0-9+/=_-]{24,}/i, '키처럼 보이는 대입문'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '개인키 블록'],
];
const TEXTY = /\.(cjs|js|mjs|json|md|txt|html|css|ya?ml|env|sh|py|bat|ps1)$/i;

const leaked = [];
for (const line of out('git status --porcelain').split(/\r?\n/)) {
  if (!line.trim() || line[0] === 'D' || line[1] === 'D') continue;
  let rel = line.slice(3).trim().replace(/^"|"$/g, '');
  if (rel.includes(' -> ')) rel = rel.split(' -> ').pop();   // 이름 바뀐 파일
  const abs = path.join(ROOT, rel);
  if (!TEXTY.test(rel) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  if (fs.statSync(abs).size > 4 * 1024 * 1024) continue;
  const body = fs.readFileSync(abs, 'utf8');
  const hitVal = secrets.find((v) => body.includes(v));
  if (hitVal) { leaked.push([rel, '.env 의 키 값이 그대로 들어있음']); continue; }
  const hitPat = PATTERNS.find(([re]) => re.test(body));
  if (hitPat) leaked.push([rel, hitPat[1]]);
}
if (leaked.length) {
  console.error('✗ 커밋될 파일에 비밀키가 있습니다. 이 레포는 공개입니다 — 푸시를 막았습니다.');
  leaked.forEach(([f, w]) => console.error(`  - ${f}   (${w})`));
  console.error('  키는 .env 에만 두세요. 시험용이면 진짜 키 말고 가짜 문자열을 쓰세요.');
  process.exit(1);
}

if (!out('git status --porcelain')) { console.log('바뀐 게 없습니다.'); process.exit(0); }

const msg = process.argv.slice(2).join(' ') || '이미지 추가';
run('git add -A');
run(`git -c core.quotepath=false commit -q -m "${msg.replace(/"/g, "'")}"`);
run('git push -q');
console.log('올렸습니다. 1~2분 뒤 주소가 살아납니다.');
