// 원고 본문 글자 수 세기 — 공백 제외 1,500자가 최소선이다 (STYLE.md 참고)
// 본문(▼▼▼ ~ ▲▲▲)에서 HTML 태그와 URL을 뺀 뒤 공백을 제외하고 센다.
// 실행: node wc.cjs [파일명 일부…]   (인자 없으면 전부)
const fs = require('fs');
const path = require('path');

const MIN = 1500;
const DIR = path.join(__dirname, 'posts');
const want = process.argv.slice(2);

const rows = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.txt'))
  .filter((f) => !want.length || want.some((w) => f.includes(w)))
  .map((f) => {
    const t = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = t.match(/여기서부터 복사 ▼▼▼([\s\S]*?)▲▲▲ 여기까지/);
    if (!m) return { f, n: null };
    const body = m[1].replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '');
    return { f, n: body.replace(/\s/g, '').length };
  })
  .sort((a, b) => (a.n ?? -1) - (b.n ?? -1));

let short = 0;
for (const { f, n } of rows) {
  if (n === null) { console.log(`   ---  ${f}  (본문 구분자 없음)`); continue; }
  const ok = n >= MIN;
  if (!ok) short++;
  console.log(`${ok ? '  OK ' : ' 부족'}  ${String(n).padStart(5)}자  ${f}`);
}

const nums = rows.map((r) => r.n).filter((n) => n !== null).sort((a, b) => a - b);
const mid = nums.length ? nums[Math.floor(nums.length / 2)] : 0;
console.log(`\n${nums.length}편 · 중앙값 ${mid}자 · ${MIN}자 미만 ${short}편`);
if (short) console.log('부족한 글은 신청자격·필요서류·비용·예외조건 중 빠진 게 있는지 보세요.');
