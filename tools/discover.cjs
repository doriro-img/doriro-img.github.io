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
// 검색 의도가 이 블로그에 맞는지는 기계가 못 판단하므로 그 판단은 표를 읽는 쪽이 한다.
// 단 그건 "사용자에게 물어보라" 는 뜻이 아니다. 돌리는 세션이 스스로 결론 내고 넘어간다.

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
// 이 개월 수 안에 쓴 주제만 막는다. 그보다 오래됐으면 다시 쓸 수 있는 후보다.
const FRESH = parseInt(val('--fresh', '12'), 10);
const nowN = (() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth() + 1; })();

// ★ 씨앗은 사람이 정하지 않는다. 이미 쓴 원고가 이 블로그가 무엇인지를 정의한다.
//
//   실측(2026-08-23): 씨앗이 영토를 완전히 결정한다. 수렴하지 않는다.
//     지원금 ∩ 과태료  자카드 12.9%
//     지원금 ∩ 연금    자카드  1.8%
//     과태료 ∩ 연금    자카드  5.8%
//     각 크롤의 71~87% 가 자기만의 영역이었다.
//
//   그래서 씨앗 목록을 손으로 8개 적어두면 그 8개가 닿는 데까지만 보게 된다.
//   원고 주제에서 뽑으면 블로그가 실제로 덮는 영역 전체가 출발점이 되고,
//   글이 쌓일수록 씨앗도 저절로 넓어진다.
//
//   ("표류" 는 막지 않는다. 크롤이 주가·환율 같은 데로 새지만 그건 최종 필터의
//    볼륨 상한에서 걸린다. 힌트에 볼륨 상한을 걸어봤자 표류는 반환값에서 오므로
//    안 막힌다 — 실측으로 확인했다. 크롤 예산만 좀 낭비될 뿐 출력은 안 더러워진다.)
function seedsFromPosts() {
  const P = path.join(ROOT, 'posts');
  if (!fs.existsSync(P)) return [];
  const s = new Set();
  for (const f of fs.readdirSync(P)) {
    const m = f.match(/\]_(.+?)_원고\.txt$/);
    if (!m) continue;                                  // 옛 형식은 슬러그가 영문이라 검색어가 아니다
    const w = m[1].split('_').filter((x) => x.length >= 2 && /[가-힣]/.test(x));
    if (w.length) s.add(w[0]);                         // 주제명의 첫 실질어 = 대표층
  }
  return [...s];
}

// posts/ 가 비어 있을 때만 쓰는 최소 출발점
const FALLBACK = ['지원금', '과태료', '세금', '연금', '수당', '신고', '발급', '요금'];

// 이 블로그가 안 다루는 것. 정보성 여부는 여기서 판단하지 않는다.
// (좁은 화이트리스트로 걸렀더니 5,175개 중 3,138개가 죽었고 그중 129개는 진짜 정보성이었다.
//  좁은 블랙리스트만 쓰고 의도 판정은 사람에게 남긴다.)
const OFF = /가격|최저가|구매|판매|파는곳|직구|할인|세일|사이즈|중고|렌탈|렌털|매장|쇼핑|배송|브랜드|디시|더쿠|인스타|유튜브|토렌트|다시보기|무료보기|영화|드라마|웹툰|게임|주가|시세|채용|구인|알바|자격증|학원|과외|번역|토익|텝스|기출|족보|성인|19금|파칭|토토|베팅|성형|다이어트약|탈모약/i;

// YMYL 레드오션. 지우지 않고 표시만 한다 — 판단은 사람이 한다.
const RED = /대출|대부|저신용|신용불량|연체자|무직자|비상금|사채|카드론|현금서비스|보험비교|보험료|생명보험|손해보험|종합보험|주식|증권|etf|계좌개설|저축은행|코인|가상자산|정책자금/i;

// 행정·제도 신호. ★ 이건 거르는 게 아니라 "줄 세우는" 데 쓴다.
//
// 예전에 이 정규식을 하드 필터로 썼다가 5,175개 중 3,138개를 죽였고
// 그중 129개는 실제로 정보성이었다 (소액대출·무직자대출 같은 것들).
// 그래서 이제는 표를 셋으로 나누는 데만 쓴다. 아무것도 버리지 않는다.
//
// 크롤이 넓어지면 크루즈여행·오션월드입장권 같은 상업 키워드가 CTR 상위를 채운다.
// 그건 이 블로그 주제가 아니지만, 기계가 "주제가 아니다" 를 판정할 수는 없다.
// 신호가 있는 것을 위 표에 놓고 나머지는 아래 표로 내려서 사람이 보게 한다.
const ADMIN = /신청|자격|기준|대상|조건|방법|절차|서류|기간|한도|금액|계산|조회|발급|등록|갱신|해지|취소|변경|재발급|납부|체납|환급|공제|감면|면제|지원|지급|수령|가입|혜택|바우처|수당|급여|연금|보조금|장려금|과태료|벌금|위반|신고|처벌|규정|의무|기한|연장|증명|제도|개편|폐지|안하면|못받|미납|누락|불이익|거부|반려|탈락|재심|이의|구제/;

const flat = (s) => String(s).toLowerCase().replace(/\s+/g, '');
const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();

// ★ 중복 차단은 "영구 금지" 가 아니다. 제도는 해마다 바뀐다.
//   기준액·요율·신청 기간이 달라지면 작년 글은 틀린 글이 되고, 다시 쓰는 게 맞다.
//   그래서 "언제 썼는지" 를 같이 들고 와서 최근 것만 막는다.
//
//   해가 지난 주제를 다시 쓸지 말지는 tools/revisit.cjs 가 판정한다.
//   ("그 해 연도를 붙인 검색어" 에 수요가 있으면 새 글, 없으면 기존 글 수정)
//
// 반환: Map(정규화된 말 → 마지막으로 쓴 YYYYMM)
function usedTopics() {
  const u = new Map();
  const put = (w, ym) => {
    const k = flat(w);
    if (!k) return;
    if (!u.has(k) || u.get(k) < ym) u.set(k, ym);
  };
  const T = path.join(ROOT, 'tools');
  if (fs.existsSync(T)) {
    for (const f of fs.readdirSync(T).filter((n) => /^kw_\d{6}\.json$/.test(n))) {
      const ym = f.slice(3, 9);
      const raw = JSON.parse(fs.readFileSync(path.join(T, f), 'utf8'));
      for (const r of (raw.items || raw)) {
        if (r.topic) put(r.topic, ym);
        for (const sd of (r.seeds || [])) put(sd, ym);
        for (const k of (r.top || []).slice(0, 6)) put(k.k, ym);
      }
    }
  }
  const D = path.join(ROOT, 'posts');
  if (fs.existsSync(D)) {
    for (const f of fs.readdirSync(D)) {
      // [20260823_0714]_주제_원고.txt = YYYYMM(6) + DD(2) + _ + HHMM(4)
      let m = f.match(/^\[(\d{6})\d{2}_\d{4}\]_(.+?)_원고\.txt$/);
      if (m) { put(m[2].replace(/_/g, ' '), m[1]); continue; }
      m = f.match(/^(\d{4})-(\d{2})-\d{2}-(.+)\.txt$/);
      if (m) put(m[3], m[1] + m[2]);
    }
  }
  return u;
}

const ymNum = (ym) => +ym.slice(0, 4) * 12 + +ym.slice(4);

(async () => {
  const auto = seedsFromPosts();
  const seeds = val('--seeds', null)
    ? val('--seeds').split(',').map((x) => x.trim()).filter(Boolean)
    : (auto.length ? auto : FALLBACK);
  const used = usedTopics();

  console.log(
    `출발 씨앗 ${seeds.length}개 ` +
    (val('--seeds', null) ? '(직접 지정)' : auto.length ? '(원고 주제에서 자동 추출)' : '(기본값)') +
    ` · ${ROUNDS}라운드 × 힌트 ${WIDTH}개 · 이미 쓴 주제 ${used.size}개 제외`
  );
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
  //
  // ★ 하드 필터는 "유입 가능성"만 본다. 검색량이 0 이면 무슨 짓을 해도 유입이 0 이지만,
  //   광고가 안 붙는다고 발행 가치가 없는 건 아니다.
  //
  //   실측: 국가장학금 138,800 검색에 광고 CTR 0.00% · 광고 0개.
  //         태풍 767만 검색에 CTR 0.01%.
  //   행정·제도 키워드는 본질적으로 광고가 안 붙는다. 이 블로그의 주력 영역이 그렇다.
  //   CTR·광고수를 하드 게이트로 걸면 주력이 통째로 걸러진다 (본표가 66개로 줄었었다).
  //
  //   미끼 트래픽 전략을 쓰기로 했으므로 CTR 0 인 글도 발행 가치가 있다.
  //   도메인 지수를 올리고 내부 링크로 수익 글에 트래픽을 흘려보낸다.
  //   그래서 CTR·광고수는 거르는 데 안 쓰고 열로만 보여준다.
  const drop = { 짧음: 0, 제외업종: 0, 볼륨없음: 0, 볼륨밖: 0, 최근에씀: 0 };
  const rows = [];
  for (const r of all.values()) {
    const k = r.keyword;
    if (k.length < 4) { drop.짧음++; continue; }
    if (OFF.test(k)) { drop.제외업종++; continue; }
    if (!r.total) { drop.볼륨없음++; continue; }
    if (r.total < MIN || r.total > MAX) { drop.볼륨밖++; continue; }
    const f = flat(k);
    // 최근에 쓴 것만 막는다. 오래된 건 다시 쓸 수 있으므로 후보로 남긴다.
    let hitYm = null;
    for (const [u, ym] of used) {
      if (u.length < 3) continue;
      if (!(f.includes(u) || u.includes(f))) continue;
      if (!hitYm || ym > hitYm) hitYm = ym;
    }
    if (hitYm && nowN - ymNum(hitYm) < FRESH) { drop.최근에씀++; continue; }
    const wasWritten = hitYm || null;
    rows.push({
      ...r,
      red: RED.test(k),
      admin: ADMIN.test(k),
      // 유입 = 검색량. 아무리 커도 개인 블로그가 다 먹지는 못하므로 3만에서 자른다
      wasWritten,
      inflow: Math.min(r.total, 30000),
      // 수익 = 검색량 x 광고 클릭 성향. 0 이어도 미끼로 쓴다
      money: Math.round(r.total * (r.ctr || 0)),
    });
  }
  rows.sort((a, b) => b.inflow - a.inflow || b.money - a.money);
  const blue = rows.filter((r) => !r.red && r.admin);
  const red = rows.filter((r) => r.red);
  const etc = rows.filter((r) => !r.red && !r.admin);

  console.log('');
  console.log('걸러낸 내역');
  for (const [k, v] of Object.entries(drop)) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}`);
  console.log(`\n수집 ${all.size}개 → 후보 ${rows.length}개`);
  console.log(`  본표 (행정·제도 신호 있음)  ${blue.length}`);
  console.log(`  레드오션 (대출·보험·증권)   ${red.length}`);
  console.log(`  판단 필요 (신호 없음)       ${etc.length}`);

  const B = '`';
  const tbl = (a) => a.map((r) =>
    `| ${r.keyword} | ${r.total.toLocaleString()} | ${r.ctr == null ? '-' : r.ctr.toFixed(1) + '%'} | ${r.depth ?? '-'} | ${r.money.toLocaleString()} | ${r.round} | ${r.wasWritten ? r.wasWritten + ' 재방문' : '신규'} |`).join('\n');

  const md = `# 주제 후보 — 검색 수요 그래프에서 캐낸 것

\`node tools/discover.cjs\` 산출물. 씨앗 ${seeds.length}개에서 출발해 ${ROUNDS}라운드 확장,
수집 ${all.size}개 → 후보 ${rows.length}개.

**씨앗 목록은 출발점일 뿐입니다.** 반환된 키워드를 다시 힌트로 넣어 그래프를 넓히므로
사람이 정한 목록 밖의 주제도 나옵니다. \`round\` 열이 몇 번째 확장에서 나왔는지입니다.

\`\`\`
[거른 것]
검색량 ${MIN.toLocaleString()}~${MAX.toLocaleString()}   이 밖은 유입이 안 나거나 대형 사이트 영역이다
이미 쓴 주제           posts/ 와 tools/kw_*.json 대조
쇼핑·엔터·자격증 업종

[안 거른 것 — 열로만 보여준다]
광고 CTR · 광고 수      행정·제도 키워드는 본질적으로 광고가 안 붙는다
                       국가장학금 138,800 검색에 CTR 0.00% · 광고 0개
                       이걸 게이트로 걸면 이 블로그 주력이 통째로 걸러진다
                       CTR 0 이어도 미끼 트래픽으로 발행 가치가 있다

정렬 = 검색량(3만에서 절단) 우선, 동률이면 수익점수
수익점수 = 검색량 x 광고 CTR
\`\`\`

## 읽는 법

**이 표는 키워드지 주제가 아닙니다.** ${B}연차계산기${B} 를 그대로 제목에 쓰지 말고
"연차 계산기 없이 내 연차 일수 세는 법"처럼 글이 될 각도로 바꿔서 라인업에 올리세요.

**검색 의도는 기계가 못 봅니다.** 단어가 겹쳐도 목적이 다르면 버리세요.
실측: ${B}장애인 활동지원사${B} 39,950 은 활동지원사가 되려는 구직자,
${B}장애인 활동지원${B} 19,680 이 서비스를 받으려는 사람입니다.

**경쟁률(문서수)은 재지 않았습니다.** 검색량이 있다는 것과 순위를 잡는다는 건 다릅니다.
이건 이 표로 알 수 없는 부분입니다. **확인하려고 웹검색을 하지 마세요** — 작업 중 웹검색은
금지돼 있고, 여기서 멈춰서 물어볼 일도 아닙니다. 표에 있는 값으로 판단하고 계속 진행하세요.

**후보가 모자라면 라운드를 늘리세요** — ${B}--rounds 8 --width 25${B}.
그래프가 고갈되면 "더 뻗을 힌트가 없습니다"가 뜹니다. 그전까지는 계속 새 게 나옵니다.

**이 표를 보고 멈추지 마세요.** 고르는 것도, 애매한 걸 버리는 것도 스스로 결정합니다.
판단이 갈리면 주제를 통째로 바꾸는 쪽을 택하고 그 사실만 라인업에 적으세요.

## 본표 — 행정·제도 신호가 있는 것 ${blue.length}개

여기서 먼저 고르세요. 신청·자격·과태료·환급처럼 절차를 묻는 말이 들어간 것들입니다.

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 수익점수 | round | 이력 |
|---|---|---|---|---|---|---|
${tbl(blue)}

## 레드오션 ${red.length}개 — 권하지 않음

대출·보험·증권은 CTR 이 높지만 그건 광고주가 최대치로 붙었다는 뜻입니다.
구글이 YMYL 로 분류해 개인 블로그에 상위를 거의 안 줍니다. 애드센스 정책 제한도 있습니다.

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 수익점수 | round | 이력 |
|---|---|---|---|---|---|---|
${tbl(red)}

## 판단 필요 ${etc.length}개 — 신호가 없어서 못 가른 것

크롤이 넓어지면 여행·분양·입장권 같은 상업 키워드가 CTR 상위를 채웁니다.
이 블로그 주제가 아니지만 **기계가 "주제가 아니다" 를 판정할 수는 없습니다.**
버리지 않고 여기 내려둡니다. 쓸 만한 게 섞여 있으면 직접 건져 쓰세요.

예전에 이 구분을 하드 필터로 썼다가 5,175개 중 3,138개를 죽였고
그중 129개가 실제로 정보성이었습니다. 그래서 거르지 않고 나누기만 합니다.

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 수익점수 | round | 이력 |
|---|---|---|---|---|---|---|
${tbl(etc)}
`;

  fs.writeFileSync(OUT, md, 'utf8');
  console.log(`저장: ${OUT}`);
  console.log('');
  console.log('상위 12');
  blue.slice(0, 12).forEach((r) =>
    console.log(`  ${String(r.total).padStart(6)} ${(r.ctr == null ? '-' : r.ctr.toFixed(1) + '%').padStart(6)} 광고${String(r.depth ?? 0).padStart(3)} r${r.round}  ${r.keyword}`));
})();
