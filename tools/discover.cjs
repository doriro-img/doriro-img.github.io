// 주제 발굴 — 머리로 짜내지 말고 실제 검색 수요에서 캐낸다.
//
//   node tools/discover.cjs --out tools/cand_202610.md
//   node tools/discover.cjs --seeds "폐업,창업,상속" --out tools/cand_extra.md
//   node tools/discover.cjs --min 3000 --max 40000 --out ...
//
// keywordstool 은 힌트 하나당 연관 키워드를 수백 개씩 돌려준다. 그게 후보 풀이다.
// 씨앗을 넓게 던져 훑고, 볼륨·광고·CTR 로 거른 뒤, 이미 쓴 주제를 뺀다.
//
// ★ 이 도구는 주제를 "고르지" 않는다. 후보를 늘어놓을 뿐이다.
//   검색 의도가 이 블로그에 맞는지는 기계가 못 판단한다. 표를 읽고 사람이 고른다.

const fs = require('fs');
const path = require('path');
const { volume } = require('./advol.cjs');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const OUT = val('--out', path.join(ROOT, 'tools', 'candidates.md'));
const MIN = parseInt(val('--min', '2000'), 10);
const MAX = parseInt(val('--max', '60000'), 10);
const DEPTH = parseInt(val('--depth', '3'), 10);
const CTR = parseFloat(val('--ctr', '1.0'));

// 씨앗은 넓을수록 좋다. 좁게 던지면 그 가지만 돌아온다.
// 세 카테고리(정부 정책·지원금 / 금융·생활 경제 / 생활 규정·IT)를 두루 덮는다.
const DEFAULT_SEEDS = [
  // 정부 정책·지원금
  '지원금', '보조금', '바우처', '수당', '급여', '복지', '감면', '장려금', '연금',
  '기초생활', '차상위', '한부모', '장애인', '노인', '청년', '신혼부부', '출산', '육아',
  '주거지원', '의료지원', '교육지원', '일자리', '창업지원', '폐업', '소상공인',
  // 금융·생활 경제
  '대출', '적금', '예금', '통장', '카드', '보험', '연금저축', '퇴직연금', '세금',
  '연말정산', '상속', '증여', '부동산', '전세', '월세', '청약', '이자', '수수료',
  '환급', '공제', '납부', '체납', '신용', '채무',
  // 생활 규정·IT
  '과태료', '벌금', '신고', '발급', '조회', '등록', '갱신', '해지', '변경', '재발급',
  '운전면허', '자동차', '주차', '쓰레기', '분리배출', '층간소음', '반려동물',
  '건강검진', '예방접종', '병원비', '실손', '통신비', '요금제', '명의도용', '스팸',
  // 절차·판단 축
  '자격', '기준', '조건', '신청방법', '기간', '서류', '한도', '계산',
];

// 이 블로그가 안 다루는 것. 정보성 여부는 여기서 판단하지 않는다.
// (INFO 정규식으로 걸렀더니 5,175개 중 3,138개가 죽었고 그중 129개는 진짜 정보성이었다.
//  좁은 화이트리스트보다 좁은 블랙리스트가 낫다. 나머지는 사람이 본다.)
const OFF = /가격|최저가|구매|판매|파는곳|직구|할인|세일|사이즈|중고|렌탈|렌털|매장|쇼핑|배송|브랜드|디시|더쿠|인스타|유튜브|토렌트|다시보기|무료보기|영화|드라마|웹툰|게임|주가|시세|채용|구인|알바|자격증|학원|과외|번역|토익|텝스|공무원시험|기출|족보|성인|19금|파칭|토토|베팅/i;

// YMYL 레드오션. 지우지 않고 표시만 한다 — 판단은 사람이 한다.
// CTR 이 높은 건 광고주가 최대치로 붙었다는 뜻이고, 그건 다들 달려들었다는 뜻이다.
const RED = /대출|대부|저신용|신용불량|연체자|무직자|비상금|사채|카드론|현금서비스|보험비교|보험료|생명보험|손해보험|종합보험|주식|증권|etf|계좌개설|저축은행|코인|가상자산/i;

const flat = (s) => String(s).toLowerCase().replace(/\s+/g, '');

// 이미 다룬 주제 — posts/ 와 kw_*.json 양쪽에서 긁는다
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
  const seeds = val('--seeds', null) ? val('--seeds').split(',').map((x) => x.trim()).filter(Boolean) : DEFAULT_SEEDS;
  const used = usedTopics();

  console.log(`씨앗 ${seeds.length}개 · 이미 쓴 주제 ${used.size}개 제외`);
  const { raw, errs } = await volume(seeds, {
    onProgress: (a, b) => process.stdout.write(`\r  수집 ${a}/${b}`),
  });
  process.stdout.write('\r' + ' '.repeat(30) + '\r');
  console.log(`연관 키워드 ${raw.size}개 회수 (오류 ${errs.length})`);

  const drop = { 짧음: 0, 제외업종: 0, CTR없음: 0, 볼륨밖: 0, 광고적음: 0, CTR낮음: 0, 이미씀: 0 };
  const rows = [];
  for (const r of raw.values()) {
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

  console.log('');
  console.log('걸러낸 내역');
  for (const [k, v] of Object.entries(drop)) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}`);
  const blue = rows.filter((r) => !r.red);
  console.log(`\n남은 후보 ${rows.length}개  (레드오션 ${rows.length - blue.length} · 나머지 ${blue.length})`);

  const B = '`';
  const tbl = (a) => a.map((r) =>
    `| ${r.keyword} | ${r.total.toLocaleString()} | ${r.ctr.toFixed(1)}% | ${r.depth} | ${Math.round(r.score).toLocaleString()} |`).join('\n');

  const md = `# 주제 후보 — 검색 수요에서 캐낸 것

\`node tools/discover.cjs\` 산출물. 씨앗 ${seeds.length}개 → 연관 ${raw.size}개 → 후보 ${rows.length}개.

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

## 후보 ${blue.length}개

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 점수 |
|---|---|---|---|---|
${tbl(blue)}

## 레드오션 ${rows.length - blue.length}개 — 권하지 않음

대출·보험·증권은 CTR 이 높지만 그건 광고주가 최대치로 붙었다는 뜻입니다.
구글이 YMYL 로 분류해 개인 블로그에 상위를 거의 안 줍니다. 애드센스 정책 제한도 있습니다.

| 키워드 | 월 검색량 | 광고 CTR | 광고 수 | 점수 |
|---|---|---|---|---|
${tbl(rows.filter((r) => r.red))}
`;

  fs.writeFileSync(OUT, md, 'utf8');
  console.log(`저장: ${OUT}`);
  console.log('');
  console.log('상위 10');
  blue.slice(0, 10).forEach((r) =>
    console.log(`  ${String(r.total).padStart(6)} ${(r.ctr.toFixed(1) + '%').padStart(6)} 광고${String(r.depth).padStart(3)}  ${r.keyword}`));
})();
