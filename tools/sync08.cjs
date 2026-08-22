// 8월 하순 묶음 동기화 — slug를 주면 원고.txt + PNG를 다운로드 폴더로 복사한다.
// 매니페스트가 필요 없다. 원고 파일 안의 tc-슬러그로 짝을 찾고 폴더명은 파일명에서 뽑는다.
// 실행: node tools/sync08.cjs tc-envoucher tc-residenttax
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const POSTS = path.join(ROOT, 'posts');
const PNG = path.join(ROOT, '2026', String(new Date().getMonth() + 1).padStart(2, '0'));
const DL = 'C:/Users/park-/Downloads/블로그원고_202608';

const files = fs.readdirSync(POSTS).filter((f) => f.startsWith('[202608') && f.endsWith('_원고.txt'));
const index = {};
for (const f of files) {
  const s = (fs.readFileSync(path.join(POSTS, f), 'utf8').match(/tc-[a-z0-9]+/) || [])[0];
  if (s) index[s] = f;
}

let n = 0;
for (const slug of process.argv.slice(2)) {
  const txt = index[slug];
  if (!txt) { console.log('원고 없음:', slug); continue; }
  const png = path.join(PNG, slug + '.png');
  if (!fs.existsSync(png)) { console.log('PNG 없음:', slug); continue; }
  const dir = path.join(DL, txt.replace(/_원고\.txt$/, ''));
  fs.mkdirSync(dir, { recursive: true });
  // 묶음은 원고 .txt 와 PNG 딱 2개다. 예전에 들어간 다른 파일이 있으면 지운다 (HTML 금지)
  for (const old of fs.readdirSync(dir)) {
    if (old !== txt && old !== slug + '.png') fs.unlinkSync(path.join(dir, old));
  }
  fs.copyFileSync(path.join(POSTS, txt), path.join(dir, txt));
  fs.copyFileSync(png, path.join(dir, slug + '.png'));
  n++;
  console.log('  ' + slug + '  →  ' + path.basename(dir));
}
console.log('동기화 ' + n + '건');
