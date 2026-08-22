// 썸네일 카드 생성기 — art/tc-<슬러그>.html 을 규격대로 찍어낸다.
// 8월 하순 27편이 같은 뼈대를 쓰므로 매번 손으로 쓰지 않고 데이터만 넣는다.
// 실행: node tools/mk-tc.cjs tools/tc_202608.json  (배열 전체)
//       node tools/mk-tc.cjs tools/tc_202608.json tc-rentaid tc-default  (일부만)
//
// 항목 스키마
//   slug   tc-영문숫자        badgeTop 배지 윗줄(작은 글씨)   badge 배지 아랫줄(큰 글씨)
//   theme  policy|money|life  tag  분류 칩                     h1 큰 제목(위)
//   hl     강조 줄(아래·흰색)  sub  두 줄 설명(<br /> 허용)     chips 칩 3~4개
//   icon   인라인 svg 내부 path 문자열 (24x24 viewBox, stroke 방식)
const fs = require('fs'), path = require('path');

const THEME = {
  policy: { from: '#dbeafe', to: '#1e3a8a', ink: '#1e3a8a', h1: '#0f172a', sub: '#1e293b', chip: 'rgba(15,23,42,.3)' },
  money: { from: '#ccfbf1', to: '#047857', ink: '#047857', h1: '#0f172a', sub: '#134e4a', chip: 'rgba(6,78,59,.3)' },
  life: { from: '#e2e8f0', to: '#374151', ink: '#374151', h1: '#111827', sub: '#1f2937', chip: 'rgba(17,24,39,.35)' },
};

const card = (it) => {
  const t = THEME[it.theme];
  if (!t) throw new Error('theme 없음: ' + it.slug);
  // 제목이 길면 자동으로 줄인다. 800px 폭에서 한 줄 12자가 한계다.
  const longest = Math.max(...[it.h1, it.hl].map((s) => s.length));
  const size = longest >= 13 ? 62 : longest >= 11 ? 68 : 74;
  return `<!doctype html>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  #art {
    width: 800px; height: 800px; padding: 74px 64px;
    background: linear-gradient(160deg, ${t.from}, ${t.to});
    font-family: 'Pretendard', 'Malgun Gothic', sans-serif;
    display: flex; flex-direction: column; justify-content: center; position: relative;
  }
  .badge {
    position: absolute; top: 62px; right: 64px;
    background: rgba(255,255,255,.92); border-radius: 20px;
    padding: 16px 24px; text-align: center; color: ${t.ink};
    font-size: 38px; font-weight: 800; line-height: 1.1;
  }
  .badge small { display: block; font-size: 15px; font-weight: 700; letter-spacing: .06em; opacity: .7; }
  .tag {
    display: inline-block; align-self: flex-start;
    background: rgba(255,255,255,.85); color: ${t.ink};
    font-size: 20px; font-weight: 800; letter-spacing: .02em;
    padding: 10px 20px; border-radius: 999px; margin-bottom: 26px;
  }
  h1 { font-size: ${size}px; font-weight: 900; line-height: 1.22; color: ${t.h1}; letter-spacing: -.03em; }
  h1 .hl { color: #fff; }
  .sub { margin-top: 24px; font-size: 27px; font-weight: 600; color: ${t.sub}; line-height: 1.5; }
  /* 칩 줄과 겹치지 않게 오른쪽 아래 구석에 둔다 (푸터는 왼쪽이라 안 부딪힌다) */
  .ico { position: absolute; right: 58px; bottom: 52px; opacity: .42; }
  .chips { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 38px; }
  .chips div {
    background: ${t.chip}; color: #fff;
    font-size: 21px; font-weight: 700; padding: 11px 20px; border-radius: 10px;
  }
  .foot {
    position: absolute; left: 64px; bottom: 54px;
    font-size: 20px; font-weight: 700; color: rgba(255,255,255,.85); letter-spacing: .04em;
  }
</style>
<div id="art">
  <div class="badge"><small>${it.badgeTop}</small>${it.badge}</div>
  <div class="tag">${it.tag}</div>
  <h1>${it.h1}<br /><span class="hl">${it.hl}</span></h1>
  <p class="sub">${it.sub}</p>
  <div class="chips">${it.chips.map((c) => '<div>' + c + '</div>').join('')}</div>
  <svg class="ico" width="122" height="122" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    ${it.icon}
  </svg>
  <div class="foot">heelovee.tistory.com</div>
</div>
`;
};

const file = process.argv[2];
const want = process.argv.slice(3);
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const ART = path.join(__dirname, '..', 'art');
let n = 0;
for (const it of items) {
  if (want.length && !want.includes(it.slug)) continue;
  if (!/^tc-[a-z0-9]+$/.test(it.slug)) throw new Error('슬러그 형식 오류: ' + it.slug);
  fs.writeFileSync(path.join(ART, it.slug + '.html'), card(it), 'utf8');
  console.log('  art/' + it.slug + '.html');
  n++;
}
console.log(n + '장 생성');
