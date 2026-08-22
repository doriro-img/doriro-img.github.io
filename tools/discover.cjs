// 주제 발굴 — 머리로 짜내지 말고 검색 수요 그래프를 기어서 캐낸다.
//
//   node tools/discover.cjs --out tools/cand_202610.md
//   node tools/discover.cjs --rounds 7 --width 20 --out ...
//   node tools/discover.cjs --seeds "폐업,상속,이사" --out ...
//
// ★ 씨앗 목록을 사람이 미리 정하면 그 목록 밖은 영영 못 본다.
//   그래서 씨앗은 출발점으로만 쓰고, 반환된 키워드를 다시 힌트로 넣어 그래프를 넓힌다.
//
//   실측 (2026-08-23): 씨앗 "지원금" 하나로 4라운드 만에 5,379개.
//     지원금 → 고용보험 → 대출계산기 → 퇴직금계산기 → 주민세
//     신규율이 65~91% 로 유지되고, "지원" 이 안 들어간 키워드가 94% 였다.
//     문자열이 아니라 의미로 뻗는다.
//
// 이 도구는 주제를 "고르지" 않는다. 후보를 늘어놓을 뿐이다.
// 검색 의도가 이 블로그에 맞는지는 기계가 못 판단한다. 표를 읽고 사람이 고른다.

const fs = require('fs');
const path = require('path');
const { volume } = require('./advol.cjs');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const OUT = val('--out', path.join(ROOT, 'tools', 'candidates.md'));
const ROUNDS = parseInt(val('--rounds', '5'), 10);
const WIDTH = parseInt(val('--width', '15'), 10);   // 라운드당 힌트 개수
const MIN = parseInt(val('--min', '2000'), 10);
const MAX = parseInt(val('--max', '60000'), 10);
const DEPTH = parseInt(val('--depth', '3'), 10);
const CTR = parseFloat(val('--ctr', '1.0'));

// 출발점일 뿐이다. 재귀가 여기서 한참 벗어난다.
// 세 카테고리에 발만 걸쳐두고 나머지는 그래프가 알아서 뻗는다.
const START = ['지원금', '과태료', '세금', '연금', '수당', '신고', '발급', '요금'];

// 이 블로그가 안 다루는 것. 정보성 여부는 여기서 판단하지 않는다.
// (좁은 화이트리스트로 걸렀더니 5,175개 중 3,138개가 죽었고 그중 129개는 진짜 정보성이었다.
//  좁은 블랙리스트만 쓰고 의도 판정은 사람에게 남긴다.)
const OFF = /가격|최저가|구매|판매|파는곳|직구|할인|세일|사이즈|중고|렌탈|렌털|매장|쇼핑|배송|브랜드|디시|더쿠|인스타|유튜브|토렌트|다시보기|무료보기|영화|드라마|웹툰|게임|주가|시세|채용|구인|알바|자격증|학원|과외|번역|토익|텝스|기출|족보|성인|19금|파칭|토토|베팅|성형|다이어트약|탈모약/i;

// YMYL 레드오션. 지우지 않고 표시만 한다 — 판단은 사람이 한다.
const RED = /대출|대부|저신용|신용불량|연체자|무직자|비상금|사채|카드론|현금서비스|보험비교|보험료|생명보험|손해보험|종합보험|주식|증권|etf|계좌개설|저축은행|코인|가상자산|정책자금/i;

const flat = (s) => String(s).toLowerCase().replace(/\s+/g, '');
const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();

function usedTopics() {
  const u = new Set();
  const T = path.join(ROOT, 'tools');
  if (fs.existsSync(T)) {
    for (const f of fs.readdirSync(T).filter((n) => /^kw_\d{6}\.json$/.test(n))) {
      const raw = JSON.parse(fs.readFileSync(path.join(T, f), 'utf8'));
      for (const r of (raw.items || raw)) {
        if (r.topic) u.add(flat(r.topic));
        for (const s of (r.seeds || [])) u.add(flat(s));
        for (const k of (r.top || []).slice(0, 6)) u.add(flat(k.k));
      }
    }
  }
  const P = path.join(ROOT, 'posts');
  if (fs.existsSync(P)) {
    for (const f of fs.readdirSync(P)) {
      const m = f.match(/\]_(.+?)_원고\.txt$/) || f.match(/^\d{4}-\d{2}-\d{2}-(.+)\.txt$/);
      if (m) u.add(flat(m[1].replace(/_/g, ' ')));
    }
  }
  return u;
}

(async () => {
  const seeds = val('--seeds', null)
    ? val('--seeds').split(',').map((x) => x.trim()).filter(Boolean)
    : START;
  const used = usedTopics();

  console.log(`출발 씨앗 ${seeds.length}개 · ${ROUNDS}라운드 × 힌트 ${WIDTH}개 · 이미 쓴 주제 ${used.size}개 제외`);
  console.log('');
  console.log('라운드  힌트   회수    신규    누적    신규율');

  const all = new Map();          // norm → rec
  const usedHints = new Set();    // 이미 힌트로 쓴 말
  let hints = seeds;

  for (let round = 0; round < ROUNDS; round++) {
    hints.forEach((h) => usedHints.add(norm(h)));
    const { raw, errs } = await volume(hints, { onProgress: () => {} });
    const fresh = [];
    for (const r of raw.values()) {
      const n = norm(r.keyword);
      if (all.has(n)) continue;
      all.set(n, { ...r, round });
      fresh.push(r);
    }
    console.log(
      `  ${String(round).padStart(2)}  ${String(hints.length).padStart(5)}  ${String(raw.size).padStart(6)}  ${String(fresh.length).padStart(6)}  ${String(all.size).padStart(6)}    ${(fresh.length / Math.max(raw.size, 1) * 100).toFixed(0)}%` +
      (errs.length ? `   (오류 ${errs.length})` : '')
    );
    if (round === ROUNDS - 1) break;

    // 다음 힌트 고르기 — 그래프를 넓히려면 이미 쓴 힌트와 어휘가 겹치지 않아야 한다.
    // 같은 가지를 다시 파면 같은 것만 돌아온다.
    fresh.sort((a, b) => b.total - a.total);
    const pick = [];
    for (const r of fresh) {
      const n = norm(r.keyword);
      if (r.total < 1000) continue;
      if (OFF.test(r.keyword)) continue;
      if ([...usedHints].some((h) => h.length >= 2 && (n.includes(h) || h.includes(n)))) continue;
      pick.push(r.keyword);
      usedHints.add(n);
      if (pick.length >= WIDTH) break;
    }
    if (!pick.length) { console.log('     더 뻗을 힌트가 없습니다 (그래프 고갈)'); break; }
    hints = pick;
  }

  // ── 거르기 ────────────────────────────────────────────────────────────────
  const drop = { 짧음: 0, 제외업종: 0, CTR없음: 0, 볼륨밖: 0, 광고적음: 0, CTR낮음: 0, 이미씀: 0 };
  const rows = [];
  for (const r of all.values()) {
    const k = r.keyword;
    if (k.length < 4) { drop.짧음++; continue; }
    if (OFF.test(k)) { drop.제외업종++; continue; }
    if (r.ctr == null) { drop.CTR없음++; continue; }
    if (r.total < MIN || r.total > MAX) { drop.볼륨밖++; continue; }
    if ((r.depth || 0) < DEPTH) { drop.광고적음++; continue; }
    if (r.ctr < CTR) { drop.CTR낮음++; continue; }
    const f = flat(k);
    if ([...used].some((u) => u.length >= 3 && (f.includes(u) || u.includes(f)))) { drop.이미씀++; continue; }
    rows.push({ ...r, red: RED.test(k), score: Math.min(r.total, 30000) * r.ctr });
  }
  rows.sort((a, b) => b.score - a.score);
  const blue = rows.filter((r) => !r.red);
  const red = rows.filter((r) => r.red);

  console.log('');
  console.log('걸러낸 내역');
  for (const [k, v] of Object.entries(drop)) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}`);
  console.log(`\n수집 ${all.size}개 → 후보 ${rows.length}개  (레드오션 ${red.length} · 나머지 ${blue.length})`);

  const B = '`';
  const tbl = (a) => a.map((r) =>
    `| ${r.keyword} | ${r.total.toLocaleString()} | ${r.ctr.toFixed(1)}% | ${r.depth} | ${Math.round(r.score).toLocaleString()} | ${r.round} |`).join('\n');

  const md = `# 주제 후보 — 검색 수요 그래프에서 캐낸 것

\`node tools/discover.cjs\` 산출물. 씨앗 ${seeds.length}개에서 출발해 ${ROUNDS}라운드 확장,
수집 ${all.size}개 → 후보 ${rows.length}개.

**씨앗 목록은 출발점일 뿐입니다.** 반환된 키워드를 다시 힌트로 넣어 그래프를 넓히므로
사람이 정한 목록 밖의 주제도 나옵니다. \`round\` 열이 몇 번째 확장에서 나왔는지입니다.

\`\`\`
검색량 ${MIN.toLocaleString()}~${MAX.toLocaleString()}   개인 블로그가 순위를 잡을 수 있는 구간
광고 ${DEPTH}개 이상          광고가 안 붙으면 애드센스도 안 붙는다
광고 CTR ${CTR}% 이상        그 키워드 검색자가 광고를 누르는가
이미 쓴 주제 제외        posts/ 와 tools/kw_*.json 대조
점수 = min(검색량, 30000) x CTR
\`\`\`

## 읽는 법

**이 표는 키워드지 주제가 아닙니다.** ${B}연차계산기${B} 를 그대로 제목에 쓰지 말고
"연차 계산기 없이 내 연차 일수 세는 법"처럼 글이 될 각도로 바꿔서 라인업에 올리세요.

**검색 의도는 기계가 못 봅니다.** 단어가 겹쳐도 목적이 다르면 버리세요.
실측: ${B}장애인 활동지원사${B} 39,950 은 활동지원사가 되려는 구직자,
${B}장애인 활동지원${B} 19,680 이 서비스를 받으려는 사람입니다.

**경쟁률(문서수)은 재지 않았습니다.** 검색량이 있다는 것과 순위를 잡는다는 건 다릅니다.
라인업에 올리기 전에 실제로 검색해서 1페이지에 개인 블로그가 있는지 보세요.

**후보가 모자라면 라운드를 늘리세요** — ${B}--rounds 8 --width 25${B}.
그래프가 고갈되면 "더 뻗을 힌트가 없습니다"가 뜹니다. 그전까지는 계속 새 게 나옵니다.

## 후보 ${blue.length}개

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 점수 | round |
|---|---|---|---|---|---|
${tbl(blue)}

## 레드오션 ${red.length}개 — 권하지 않음

대출·보험·증권은 CTR 이 높지만 그건 광고주가 최대치로 붙었다는 뜻입니다.
구글이 YMYL 로 분류해 개인 블로그에 상위를 거의 안 줍니다. 애드센스 정책 제한도 있습니다.

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 점수 | round |
|---|---|---|---|---|---|
${tbl(red)}
`;

  fs.writeFileSync(OUT, md, 'utf8');
  console.log(`저장: ${OUT}`);
  console.log('');
  console.log('상위 12');
  blue.slice(0, 12).forEach((r) =>
    console.log(`  ${String(r.total).padStart(6)} ${(r.ctr.toFixed(1) + '%').padStart(6)} 광고${String(r.depth).padStart(3)} r${r.round}  ${r.keyword}`));
})();
