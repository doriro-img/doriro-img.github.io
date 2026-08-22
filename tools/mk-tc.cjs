// 썸네일 카드 생성기 — art/tc-<슬러그>.html 을 규격대로 찍어낸다.
// 8월 하순 27편이 같은 뼈대를 쓰므로 매번 손으로 쓰지 않고 데이터만 넣는다.
// 실행: node tools/mk-tc.cjs tools/tc_202608.json  (배열 전체)
//       node tools/mk-tc.cjs tools/tc_202608.json tc-rentaid tc-default  (일부만)
//
// 항목 스키마
//   slug   tc-영문숫자        badgeTop 배지 윗줄(작은 글씨)   badge 배지 아랫줄(큰 글씨)
//   theme  policy|money|life  tag  분류 칩                     h1 큰 제목(위)
//   hl     강조 줄(아래·흰색)  sub  두 줄 설명(<br /> 허용)     chips 칩 3~4개
//   icon   아이콘 이름 (아래 목록) 또는 svg 내부 path 문자열
//
// 아이콘 이름 목록은  node tools/mk-tc.cjs --icons  로 볼 수 있다.
// 목록에 없는 그림이 필요하면 예전처럼 "<path d=... />" 를 그대로 넣어도 된다.
const fs = require('fs'), path = require('path');

// ─ 아이콘 라이브러리 ────────────────────────────────────────
// 24x24 viewBox · stroke 방식 (fill 은 none, 색은 카드 쪽에서 흰색으로 준다).
// 매번 좌표를 새로 그리면 편차가 생기고 데이터도 커진다. 반복되는 것은 여기서 부른다.
const ICONS = {
  // 정책·공공
  document: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />',
  stamp: '<path d="M9 3h6v5l2 3v3H7v-3l2-3z" /><path d="M5 17h14v4H5z" />',
  building: '<path d="M3 21h18" /><path d="M5 21V6l7-3 7 3v15" /><path d="M9 21v-5h6v5" /><path d="M9 10h2M13 10h2" />',
  people: '<circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M17 15c2.2 0 4 1.3 4 3.5" />',
  baby: '<circle cx="12" cy="9" r="4.5" /><path d="M10 8.5h.01M14 8.5h.01" /><path d="M10.5 11.2c1 .8 2 .8 3 0" /><path d="M5 21c0-3.3 3-5 7-5s7 1.7 7 5" />',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" />',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M8 14h3v3H8z" />',
  hand: '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.6 7-7 7-3 0-5-1.6-6.2-4L5 13" />',
  graduate: '<path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M7 10v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5" /><path d="M21 8v6" />',
  heart: '<path d="M12 21s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 3.5C19 16.6 12 21 12 21z" />',
  health: '<rect x="2" y="4" width="20" height="16" rx="2" /><path d="M4 12h4l2 5 3-10 2 5h5" />',
  family: '<circle cx="8" cy="7" r="3" /><circle cx="17" cy="8" r="2.4" /><path d="M2 21v-3a6 6 0 0 1 12 0v3" /><path d="M17 13c2.5 0 5 1.6 5 4.5V21" />',
  ticket: '<path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z" /><path d="M15 5v14" />',

  // 금융·경제
  coin: '<ellipse cx="12" cy="6.5" rx="8" ry="3.5" /><path d="M4 6.5v11c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-11" /><path d="M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5" />',
  chart: '<path d="M4 20h16" /><path d="M7 20V11M12 20V6M17 20v-6" />',
  bank: '<path d="M3 21h18" /><path d="M5 21V10M19 21V10M9 21v-7h6v7" /><path d="M2 9l10-6 10 6z" />',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" />',
  percent: '<circle cx="12" cy="12" r="9" /><circle cx="9.5" cy="9.5" r="1.6" /><circle cx="14.5" cy="14.5" r="1.6" /><path d="M16 8l-8 8" />',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.4" />',
  piggy: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z" /><path d="M3 12v4a2 2 0 0 0 2 2h1v3h3v-3h6v3h3v-3h1a2 2 0 0 0 2-2v-4" /><circle cx="16" cy="14" r=".8" />',
  clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" />',
  swap: '<path d="M3 8h14l-3-3M21 16H7l3 3" />',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />',
  won: '<circle cx="12" cy="12" r="9" /><path d="M7 9l2 6 3-6 3 6 2-6" /><path d="M6 12h12" />',
  trend: '<path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" />',

  // 생활·규정
  home: '<path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-7h6v7" />',
  apartment: '<rect x="3" y="3" width="8" height="18" rx="1" /><rect x="13" y="8" width="8" height="13" rx="1" /><path d="M6 7h2M6 11h2M6 15h2M16 12h2M16 16h2" />',
  car: '<path d="M5 17h14M6 17l1.5-5h9L18 17" /><circle cx="8" cy="18.5" r="1.6" /><circle cx="16" cy="18.5" r="1.6" /><path d="M4 12h16" />',
  wind: '<path d="M3 8h13a3 3 0 1 0-3-3" /><path d="M3 13h16a3 3 0 1 1-3 3" /><path d="M3 18h9" />',
  thermo: '<path d="M12 14V4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z" /><path d="M14 17v.01" />',
  warning: '<path d="M12 3l9 17H3z" /><path d="M12 10v4M12 17v.01" />',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />',
  box: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z" /><path d="M3 8l9 4 9-4M12 12v9" />',
  tool: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21H3l6.3-6.3a4 4 0 0 0 5-5z" /><path d="M14.7 6.3 18 3" />',
  plug: '<path d="M9 3v6M15 3v6" /><path d="M6 9h12v3a6 6 0 0 1-12 0z" /><path d="M12 18v3" />',
  water: '<path d="M12 3s6 6.6 6 10.5A6 6 0 0 1 6 13.5C6 9.6 12 3 12 3z" />',
  fire: '<path d="M12 3c1 3 4 4.4 4 8a4 4 0 0 1-8 0c0-1.4.6-2.4 1.4-3.2C10 10 12 9 12 3z" /><path d="M6.5 14a5.5 5.5 0 0 0 11 0" />',
  key: '<circle cx="8" cy="14" r="4" /><path d="M11 11l9-9M17 5l2 2M14 8l2 2" />',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="11.5" r="2.4" /><path d="M13 10h6M13 14h4" />',
  paw: '<path d="M6.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M11 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M15.5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M12 11c3 0 5 2.4 5 4.6 0 2-1.6 3.4-3.4 3.4-1 0-1.2-.5-2.6-.5s-1.6.5-2.6.5C6.6 19 5 17.6 5 15.6 5 13.4 9 11 12 11z" />',
  elevator: '<rect x="5" y="3" width="14" height="18" rx="2" /><path d="M12 3v18" /><path d="M8.5 9l1.5-2 1.5 2M12.5 15l1.5 2 1.5-2" />',
  road: '<path d="M3 18V9l9-5 9 5v9" /><path d="M3 18h18" /><path d="M12 9v3M12 15v3" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />',
  snow: '<path d="M12 2v20M2 12h20" /><path d="M5 5l14 14M19 5L5 19" /><path d="M9 4l3 2 3-2M9 20l3-2 3 2M4 9l2 3-2 3M20 9l-2 3 2 3" />',
  bell: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16z" /><path d="M10 22h4" />',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />',
};

function resolveIcon(v, slug) {
  if (!v) throw new Error('icon 없음: ' + slug);
  if (v.trim().startsWith('<')) return v;          // 예전 방식: path 직접
  const hit = ICONS[v.trim()];
  if (!hit) throw new Error(`아이콘 이름 없음: "${v}" (${slug})\n  쓸 수 있는 이름: ${Object.keys(ICONS).join(' ')}`);
  return hit;
}

const THEME = {
  policy: { from: '#dbeafe', to: '#1e3a8a', ink: '#1e3a8a', h1: '#0f172a', sub: '#1e293b', chip: 'rgba(15,23,42,.3)' },
  money: { from: '#ccfbf1', to: '#047857', ink: '#047857', h1: '#0f172a', sub: '#134e4a', chip: 'rgba(6,78,59,.3)' },
  life: { from: '#e2e8f0', to: '#374151', ink: '#374151', h1: '#111827', sub: '#1f2937', chip: 'rgba(17,24,39,.35)' },
};

const card = (it) => {
  const t = THEME[it.theme];
  if (!t) throw new Error('theme 없음: ' + it.slug);
  // 제목 폭을 추정해 안 넘치는 가장 큰 크기를 고른다.
  // 글자수로만 재면 "6+6 부모육아휴직제" 처럼 숫자·기호가 섞인 제목에서 과하게 줄어들고,
  // 한글만 10자인 제목은 반대로 아슬아슬해진다. 실측해보니 10자에서 여유가 2px 뿐이었다.
  // 카드 폭 800 - 좌우 padding 64x2 = 672px 이 한 줄 한계다.
  // 추정식이 글자 조합에 따라 1~2% 어긋나므로 630px 을 목표로 잡아 42px 을 남긴다.
  const em = (s) => [...String(s)].reduce((a, c) =>
    a + (/[가-힣ㄱ-ㅎ]/.test(c) ? 0.98 : /\s/.test(c) ? 0.3 : /[A-Z]/.test(c) ? 0.68 : 0.58), 0);
  const w = Math.max(em(it.h1), em(it.hl));
  const size = [74, 70, 66, 62, 58].find((px) => w * px * 0.97 <= 630) || 54;
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
    ${resolveIcon(it.icon, it.slug)}
  </svg>
  <div class="foot">heelovee.tistory.com</div>
</div>
`;
};

// 아이콘 이름 목록 보기
if (process.argv.includes('--icons')) {
  const G = { '정책·공공': 'document stamp building people baby shield calendar hand graduate heart health family ticket',
    '금융·경제': 'coin chart bank receipt percent wallet piggy clock lock swap bolt won trend',
    '생활·규정': 'home apartment car wind thermo warning phone box tool plug water fire key idcard paw elevator road sun snow bell mail' };
  console.log(`아이콘 ${Object.keys(ICONS).length}종\n`);
  for (const [g, list] of Object.entries(G)) console.log('  ' + g + '\n    ' + list.split(' ').join('  ') + '\n');
  console.log('  목록에 없으면 "<path d=... />" 를 그대로 넣어도 됩니다.');
  process.exit(0);
}

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
