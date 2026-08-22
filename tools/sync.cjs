// 다운로드 묶음 동기화 — 원고 .txt 와 썸네일 PNG 를 업로드 폴더로 복사한다.
// 묶음은 항상 두 개다. 다른 파일이 섞여 있으면 지운다 (HTML 금지).
//
//   node tools/sync.cjs 202609 tc-slugA tc-slugB   지정한 것만
//   node tools/sync.cjs 202609 --all               그 달 전량
//   node tools/sync.cjs 202609 --check             복사하지 않고 불일치만 본다
//
// ★ art/*.html 을 고쳐 make-art.cjs 로 다시 구웠으면 반드시 이걸 다시 돌린다.
//   레포 PNG 만 새것이 되고 다운로드 사본은 낡은 채로 남는다.
//   업로드하는 건 다운로드 사본이라 그대로 두면 수정 전 이미지가 발행된다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const POSTS = path.join(ROOT, 'posts');

const args = process.argv.slice(2);
const ym = args.find((a) => /^\d{6}$/.test(a));
if (!ym) { console.error('사용법: node tools/sync.cjs 202609 [tc-slug…|--all|--check]'); process.exit(1); }
const ALL = args.includes('--all');
const CHECK = args.includes('--check');

// PNG 는 굽던 시점의 연·월 폴더에 있다. 대상 월이 아니라 실제로 있는 곳을 찾는다.
const { findPng: _findPng, downloadDir } = require('./paths.cjs');
const findPng = (slug) => _findPng(ROOT, slug);

const DL = downloadDir(ym);   // 사용자 홈에서 조립한다. 경로를 박지 않는다
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

const index = {};
for (const f of fs.readdirSync(POSTS).filter((n) => n.startsWith('[' + ym) && n.endsWith('_원고.txt'))) {
  const s = (fs.readFileSync(path.join(POSTS, f), 'utf8').match(/tc-[a-z0-9]+/) || [])[0];
  if (s) index[s] = f;
}
if (!Object.keys(index).length) { console.error(`posts/ 에 [${ym} 원고가 없습니다.`); process.exit(1); }

const targets = ALL || CHECK ? Object.keys(index) : args.filter((a) => a.startsWith('tc-'));
if (!targets.length) { console.error('슬러그를 주거나 --all / --check 를 쓰세요.'); process.exit(1); }

let n = 0, stale = [], missing = [];
for (const slug of targets) {
  const txt = index[slug];
  if (!txt) { console.log('  원고 없음:', slug); missing.push(slug); continue; }
  const png = findPng(slug);
  if (!png) { console.log('  PNG 없음:', slug); missing.push(slug); continue; }
  const dir = path.join(DL, txt.replace(/_원고\.txt$/, ''));
  const dstPng = path.join(dir, slug + '.png');
  const dstTxt = path.join(dir, txt);

  if (CHECK) {
    if (!fs.existsSync(dstPng)) { stale.push(slug + ' (다운로드에 PNG 없음)'); continue; }
    if (md5(png) !== md5(dstPng)) { stale.push(slug + ' (PNG 불일치)'); continue; }
    if (!fs.existsSync(dstTxt) || md5(path.join(POSTS, txt)) !== md5(dstTxt)) stale.push(slug + ' (원고 불일치)');
    continue;
  }

  fs.mkdirSync(dir, { recursive: true });
  // 묶음은 원고 .txt 와 PNG 딱 2개다. 다른 게 있으면 지운다
  for (const old of fs.readdirSync(dir)) {
    if (old !== txt && old !== slug + '.png') fs.unlinkSync(path.join(dir, old));
  }
  fs.copyFileSync(path.join(POSTS, txt), dstTxt);
  fs.copyFileSync(png, dstPng);
  n++;
  console.log('  ' + slug + '  →  ' + path.basename(dir));
}

if (CHECK) {
  console.log(`\n${targets.length}건 검사 · 불일치 ${stale.length}건`);
  if (stale.length) {
    stale.forEach((s) => console.log('  ✗ ' + s));
    console.log(`\n  node tools/sync.cjs ${ym} ${stale.map((s) => s.split(' ')[0]).join(' ')}`);
  }
  process.exit(stale.length ? 1 : 0);
}
console.log(`동기화 ${n}건` + (missing.length ? ` · 누락 ${missing.length}건` : ''));
