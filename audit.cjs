// 원고 발행 전 자동 점검 — STYLE.md / VOICE.md 체크리스트 전량 기계 검사
// 실행: node audit.cjs 202611              해당 연월 원고
//       node audit.cjs 202611 --full       썸네일 짝·다운로드 묶음까지
//       node audit.cjs 202609 202610 --sum 여러 달 요약만
const fs = require('fs');
const path = require('path');

// 존댓말 종결인가: 습니다 / X+ㅂ니다(합니다·됩니다·입니다) / 요 / 죠
function isPolite(s){
  if (/(요|죠|시오)$/.test(s)) return true;
  if (/습니다$/.test(s)) return true;
  const m = s.match(/(.)니다$/);
  if (m) { const c = m[1].charCodeAt(0); if (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 === 17) return true; }
  return false;
}


const ROOT = __dirname;
const POSTS = path.join(ROOT, 'posts');
const args = process.argv.slice(2);
const FULL = args.includes('--full');
const SUM = args.includes('--sum');
const yms = args.filter((a) => /^\d{6}$/.test(a));
if (!yms.length) { console.error('사용법: node audit.cjs 202611 [--full] [--sum]'); process.exit(1); }

const ART = path.join(ROOT, 'art');
const { findPng, downloadDir } = require('./tools/paths.cjs');

// 자동완성 수집 결과 — tools/kw_<연월>.json 이 있으면 키워드 반영까지 검사한다.
// 없으면 그 검사만 조용히 건너뛴다 (없다고 실패로 치지 않는다).
const flat = (s) => s.toLowerCase().replace(/\s+/g, '');
const KW = {};
for (const ym of yms) {
  const p = path.join(ROOT, 'tools', `kw_${ym}.json`);
  if (!fs.existsSync(p)) continue;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of (Array.isArray(raw) ? raw : raw.items || [])) if (r.slug) KW[r.slug] = r;
}

const BANNED = ['뿐만 아니라', '더 나아가', '요약하자면', '결론적으로', '라는 점을 기억하세요',
  '신중하게 판단하셔야 합니다', '지금까지', '또한 ', '따라서 ', '종합하면', '핵심은', '여러분'];
const BROKEN = String.fromCharCode(92) + '<p' + String.fromCharCode(92) + '>';
const HEAVY = /세금|절세|양도세|상속세|증여|종부세|연말정산|부가가치세|소득세|취득세|중도인출|금리|대출|주담대|배당|ETF|채권투자|연부연납/;
const VOICE_WORDS = /아내|연근이|김포|쿠팡|로켓프레시/;
const FIRST_PERSON = /저는|저도|제가|제 [가-힣]|저희|우리 집|작년에|얼마 전|지난번|해봤|겪었|받아봤|가봤|써봤|물어봤|알아봤|찾아봤|들어봤/;

// ── 화자 설정 ─────────────────────────────────────────────────────────────
//
// 이 블로그는 실제 한 사람이 쓴다. 원고가 그 사람과 어긋나면 안 된다.
//
//   기혼 남성(남편) · 아내 있음 · 자녀 없음 · 김포 거주 · 서울 출근
//
// 설정이 반복되는 건 오염이 아니라 일관성이다.
// 실측: 김포 6편이 전부 다른 사건이었다 (더위·태풍·층간소음·대출·처가·출근).
// 잡아야 하는 건 "설정과 모순되는 서술" 이다.
// 실측 2026-08-23: 107편 중 1건 — 비대면진료 글의 "저희도 연휴에 아이가 아파서".
// 화자에게 자녀가 없는데 있는 것처럼 읽혔다. 발행 뒤에 발견하면 못 고친다.
//
// ★ 화자 설정이 바뀌면(이사·출산 등) 아래를 고치세요. 안 고치면 멀쩡한 문장이 반려됩니다.
const SPEAKER_CONTRA = [
  // 여성 화자 어휘 — 화자는 남편이다
  [/제 남편|우리 남편|저희 남편|남편이 |남편은 |남편도 |신랑/, '화자는 남편이다'],
  [/시어머니|시아버지|시댁|시부모/, '남성 화자는 장인·장모·처가로 쓴다'],
  [/제가 임신|제가 출산/, '여성 화자 표현'],
  // 자녀 — 화자에게 자녀가 없다.
  // "저희 이웃집 아이" · "조카" · "저희는 아직 아이가 없어서" 는 걸리면 안 되므로
  // 1인칭과 아이 사이에 제3자·부정어가 끼면 통과시킨다.
  [/(저희|우리|제)\s*(아이|딸|아들|애기|막내|첫째|둘째)(가|는|를|도|와|랑|한테|에게|\s)/, '화자에게 자녀가 없다'],
  [/(저희|우리|저)(는|도|가)?(?![^.?!]{0,30}(이웃|옆집|조카|친구|동료|형|누나|언니|처제|처남|없|아직|기다리|생기면|낳으면|태어나면))[^.?!]{0,25}(아이|애)가\s*(아파|다쳐|생겨|커서|학교|어린이집|유치원)/, '화자에게 자녀가 없다'],
];

const tally = {};
// 문체 분포 — 한 달치를 모아서 본다. 개별 글이 아니라 묶음이 검사 대상이다.
const voice = [];
// 1인칭 경험 문장 — 같은 사건을 우려먹는지 보려고 모은다.
const episodes = [];
const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };

let files = [], bad = 0, total = 0;
for (const ym of yms) files.push(...fs.readdirSync(POSTS).filter((n) => n.startsWith('[' + ym)));

for (const f of files) {
  total++;
  const t = fs.readFileSync(path.join(POSTS, f), 'utf8');
  const m = t.match(/여기서부터 복사 ▼▼▼([\s\S]*?)▲▲▲ 여기까지/);
  const body = m ? m[1] : '';
  const issues = [];
  if (!m) issues.push('본문 구분자 없음');

  const plain = body.replace(/<[^>]+>/g, ' ');
  const h2 = [...body.matchAll(/<h2>(.*?)<\/h2>/g)].map((x) => x[1].replace(/<[^>]+>/g, ''));
  const h3 = [...body.matchAll(/<h3>(.*?)<\/h3>/g)].map((x) => x[1].replace(/<[^>]+>/g, ''));
  // 문단: 도식(div)과 인용(blockquote) 밖의 최상위 <p>
  const prose = body.replace(/<div[\s\S]*?<\/div>/g, '').replace(/<blockquote>[\s\S]*?<\/blockquote>/g, '');
  const ps = [...prose.matchAll(/^<p>([\s\S]*?)<\/p>/gm)].map((x) => x[1].replace(/<[^>]+>/g, '').trim());

  // ── VOICE.md
  // ★ 문체 지표는 편당 하한을 걸지 않는다.
  //
  // 예전엔 "더라고요 2회 미만" 을 반려했다. 그래서 103편 전부가 2회 이상이 됐고
  // 0인 편이 하나도 없었다 (평균 4.6 · 변동계수 0.33).
  // 사람이 103편을 쓰면 어떤 글엔 아예 안 나온다. 그 균일성 자체가 기계 생산의 지문이다.
  // AI 탐지가 찾는 건 어휘가 아니라 부자연스러운 균일성이다.
  //
  // 하한 대신 과용만 잡고, 분포는 --full 의 묶음 검사에서 본다.
  const n = (t.match(/더라고요|더라구요/g) || []).length;
  if (n > 8) issues.push(`더라고요 ${n}회 (과용)`);
  if (t.includes(BROKEN)) issues.push('인코딩 깨짐');
  if (body.includes('—')) issues.push('본문 줄표');
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body)) issues.push('유니코드 이모지');
  for (const w of BANNED) if (body.includes(w)) issues.push(`금지어:${w.trim()}`);
  const hasMe = FIRST_PERSON.test(plain);
  for (const [re, why] of SPEAKER_CONTRA) {
    const cm = plain.match(re);
    if (cm) issues.push(`화자 모순:${cm[0].trim()} (${why})`);
  }
  const hasCasual = /\.\.\.|ㅎㅎ|ㅋㅋ|ㅠㅠ/.test(plain);
  // 혼잣말 반말: 문단의 마지막 문장이 평서형 반말로 끝난다 (존댓말 종결 아님)
  const banmal = ps.slice(1).some((p) => {
    const sents = p.split(/(?<![0-9])[.?!…]+s*/).filter((x) => x.trim());
    const last = (sents[sents.length - 1] || '').trim();
    if (!last || last.length > 45) return false;
    if (isPolite(last)) return false;
    return /(다|지|야|네|군|더라|걸|해|봐)$/.test(last) && !/(까지|부터|마다|에서|으로|까요)$/.test(last);
  });
  // 하한 없음 — 묶음 분산으로 본다
  // 쉼표로 절 잇기 (연결어미 + 쉼표)
  for (const p of ps) {
    const q = p.replace(/(냉장고|선고|사고|신고|광고|창고|참고|최고|중고|원고|재고|경고|예고|금고|상고|항고), /g, " ");
    if (/[^.?!]{10,}(고|며|는데|지만|아서|어서|면서|니까|라서),\s/.test(q)) { issues.push('쉼표로 절 잇기'); break; }
  }
  // 볼드 과다 — 본문 문단 기준 섹션당 2개 이하
  const boldPs = [...prose.matchAll(/^<p>([\s\S]*?)<\/p>/gm)].map((x) => x[1]).join(" ");
  const bold = (boldPs.match(/<b>/g) || []).length;
  if (h2.length && bold / h2.length > 2) issues.push(`볼드 섹션당 ${(bold / h2.length).toFixed(1)}개`);

  // ── STYLE.md
  if (!body.includes('오늘도 긴 글 읽어주셔서 감사합니다. ^^')) issues.push('시그니처 없음');
  if (/<h4/.test(body)) issues.push('h4 사용');
  const dup = h2.filter((x, i) => h2.indexOf(x) !== i);
  if (dup.length) issues.push(`h2 중복:${dup[0]}`);
  if (![...h2, ...h3].some((x) => x.includes('?'))) issues.push('소제목 질문형 0개');
  // 시각블록 = 도식 래퍼(margin:24px 0) + 인용. 공백 유무에 걸리지 않게 느슨히 잡는다.
  // 그리드 한 덩어리는 카드가 몇 장이든 도식 1개로 센다 (한눈에 한 장의 인포그래픽이므로).
  const cards = (body.match(/margin\s*:\s*24px\s+0/g) || []).length;
  const bq = (body.match(/<blockquote>/g) || []).length;
  if (cards + bq < 5) issues.push(`시각블록 ${cards + bq}개`);
  // STYLE.md: 도식에 글씨만 늘어놓지 않는다. 한눈에 '그림'으로 읽혀야 한다.
  // 인라인 svg 아이콘이 한 개도 없으면 텍스트 박스만 늘어놓은 것이다.
  if (cards >= 4 && !/<svg[\s>]/.test(body)) issues.push('도식에 시각요소 없음');
  const uls = (body.match(/<ul>/g) || []).length;
  if (uls < 3) issues.push(`ul요약 ${uls}개`);
  for (const p of ps) {
    const s = p.split(/(?<![0-9])[.?!]\s+|(?<![0-9])[.?!]$/).filter((x) => x.trim());
    if (s.length >= 4) { issues.push('문단 4문장 이상'); break; }
  }
  if (/<p[^>]*text-align:\s*(center|justify)/.test(body)) issues.push('본문 정렬 지정');
  for (const im of body.match(/<img[^>]*>/g) || []) {
    if (!/max-width:\s*100%/.test(im)) issues.push('img max-width 없음');
    if (!/alt=/.test(im)) issues.push('img alt 없음');
  }
  const tags = ((t.match(/■ 태그:\s*(.+)/) || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (tags.length < 7 || tags.length > 10) issues.push(`태그 ${tags.length}개`);

  // 분량
  const chars = body.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s/g, '').length;
  const min = HEAVY.test(f) ? 1800 : 1500;
  if (chars < min) issues.push(`${chars}자 (기준 ${min})`);
  for (const sec of ['■ 숫자·사실 출처', '■ 확인 필요']) if (!t.includes(sec)) issues.push(`푸터없음:${sec}`);

  // 키워드 반영 — tools/kw_<연월>.json 이 있을 때만 검사한다.
  // 자동완성을 뽑아놓고 제목·소제목에 안 쓰면 수집한 의미가 없다.
  const slug = (t.match(/tc-[a-z0-9]+/) || [])[0];
  const kw = slug && KW[slug];
  if (kw) {
    const title = (t.match(/■ 제목:\s*(.+)/) || [])[1] || '';
    const nt = flat(title);
    const head = kw.head || [], tail = kw.longtail || [];
    if (head.length + tail.length) {
      if (![...head, ...tail].some((k) => nt.includes(flat(k)))) issues.push('제목에 수집 키워드 없음');
      // 소제목에는 롱테일을 원형 그대로 심는다.
      //
      // 예전에는 씨앗을 빼고 꼬리말만 비교했다. 그래서 검색어가 "하이패스 미납요금 조회"인데
      // 소제목이 "미납요금 조회는 어디서 하나요?"여도 통과했다. 주어가 빠지면 검색어와
      // 문자열이 안 맞아서 스니펫 후보가 못 된다.
      // 실측: 8월 27편에서 상위 롱테일 81개 중 원형으로 담긴 건 4개(5%)뿐이었다.
      //
      // 다만 전부 넣으면 스터핑이다. 소제목 10개가 전부 "하이패스 ~"로 시작하면 읽기 나쁘다.
      // 편당 2개를 하한으로 잡고, 지나치게 많으면 그것도 잡는다.
      // 검색엔진은 구두점을 무시하고 구절을 맞춘다. 검사도 그렇게 해야 한다.
      // 이게 없으면 "태풍 대비 행동 요령, 지하주차장" 같은 자연스러운 소제목이 반려된다.
      const flatp = (x) => flat(x).replace(/[^\uAC00-\uD7A3\u3131-\u314Ea-z0-9]/g, '');
      const subsArr = [...h2, ...h3].map(flatp);
      const full = tail.filter((k) => flatp(k).length >= 4 && subsArr.some((x) => x.includes(flatp(k))));
      if (tail.length >= 3 && full.length < 2) issues.push(`소제목 롱테일 원형 ${full.length}개 (2개 이상 필요)`);
      const sd = flat(kw.seeds ? kw.seeds[kw.seeds.length - 1] : '');
      const withHead = sd.length >= 2 ? subsArr.filter((x) => x.includes(flatp(sd))).length : 0;
      if (subsArr.length >= 6 && withHead > subsArr.length * 0.5) issues.push(`소제목 대표층 반복 ${withHead}/${subsArr.length} (스터핑)`);
    }
  }

  // 썸네일 짝 · 다운로드 묶음
  if (FULL) {
    const ym = f.slice(1, 7);
    if (!slug) issues.push('썸네일 slug 없음');
    else {
      if (!fs.existsSync(path.join(ART, slug + '.html'))) issues.push(`art/${slug}.html 없음`);
      // PNG 는 굽던 시점의 연·월 폴더에 있다. 대상 월과 다를 수 있으니 훑어서 찾는다.
      if (!findPng(ROOT, slug)) issues.push(`PNG 없음:${slug}`);
      const dir = path.join(downloadDir(ym), f.replace(/_원고\.txt$/, ''));
      if (!fs.existsSync(dir)) issues.push('다운로드 폴더 없음');
      else {
        const got = fs.readdirSync(dir);
        if (got.length !== 2) issues.push(`묶음 ${got.length}개`);
        if (got.some((x) => x.endsWith('.html'))) issues.push('다운로드에 HTML');
      }
    }
  }

  voice.push({ f, dr: n, me: hasMe, banmal: !!banmal, casual: hasCasual });
  for (const sent of plain.split(/(?<=[.?!])\s+/)) {
    const x = sent.trim();
    if (x.length >= 14 && x.length <= 110 && /(저는|제가|저도|저희)/.test(x)) episodes.push({ f, s: x });
  }

  if (issues.length) {
    bad++;
    issues.forEach((i) => bump(i.replace(/[:：].*|\s\d.*|\d+.*/, '').trim() || i));
    if (!SUM) console.log(`${f}\n    → ${issues.join(' / ')}`);
  }
}

// 같은 에피소드를 우려먹으면 읽는 사람이 먼저 알아챈다.
// 1인칭 문장끼리 내용어가 많이 겹치면 같은 사건을 다시 쓴 것으로 본다.
if (episodes.length >= 20) {
  const key = (t) => new Set((t.match(/[가-힣]{2,}/g) || []).filter((w) => w.length >= 2));
  const jac = (A, B) => {
    const inter = [...A].filter((x) => B.has(x)).length;
    const uni = new Set([...A, ...B]).size;
    return uni ? inter / uni : 0;
  };
  const ks = episodes.map((e) => ({ ...e, k: key(e.s) }));
  const pairs = [];
  for (let x = 0; x < ks.length; x++) {
    for (let y = x + 1; y < ks.length; y++) {
      if (ks[x].f === ks[y].f) continue;
      const v = jac(ks[x].k, ks[y].k);
      if (v >= 0.5) pairs.push({ v, a: ks[x], b: ks[y] });
    }
  }
  pairs.sort((p, q) => q.v - p.v);
  if (pairs.length) {
    console.log('');
    console.log(`  ★ 에피소드 중복 ${pairs.length}쌍 — 같은 경험을 두 번 쓰지 마세요`);
    pairs.slice(0, 6).forEach((p) => {
      console.log(`      겹침 ${(p.v * 100).toFixed(0)}%`);
      console.log(`        "${p.a.s.slice(0, 58)}"`);
      console.log(`        "${p.b.s.slice(0, 58)}"`);
    });
  }
}

if (voice.length >= 20) {
  const a = voice.map((v) => v.dr);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
  const cv = mean ? sd / mean : 0;
  const pct = (k) => (voice.filter((v) => v[k]).length / voice.length * 100);
  const warn = [];
  if (cv < 0.5) warn.push(`더라고요 변동계수 ${cv.toFixed(2)} (0.5 이상이어야 자연스럽다)`);
  for (const [k, name] of [['me', '1인칭'], ['banmal', '혼잣말 반말'], ['casual', '말줄임표·ㅎㅎ']]) {
    const p = pct(k);
    if (p > 92) warn.push(`${name} ${p.toFixed(0)}% (전편에 다 넣지 마세요. 60~85% 가 자연스럽다)`);
  }
  if (a.filter((x) => x === 0).length === 0 && voice.length >= 40) {
    warn.push('더라고요 0회인 편이 하나도 없음 (몇 편은 아예 안 써야 한다)');
  }
  console.log('');
  console.log(`[문체 분포] ${voice.length}편  더라고요 평균 ${mean.toFixed(1)} · 변동계수 ${cv.toFixed(2)} · 0회 ${a.filter((x) => x === 0).length}편`);
  console.log(`           1인칭 ${pct('me').toFixed(0)}% · 혼잣말 ${pct('banmal').toFixed(0)}% · 말줄임표 ${pct('casual').toFixed(0)}%`);
  if (warn.length) {
    console.log('');
    console.log('  ★ 균일성 경고 — 규칙대로 찍어내면 그 균일함이 지문이 됩니다');
    warn.forEach((w) => console.log('      ' + w));
  }
}

if (Object.keys(tally).length) {
  console.log('\n[항목별 위반 편수]');
  Object.entries(tally).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}편  ${k}`));
}
console.log(`\n${total}편 점검 · 문제 ${bad}편`);
process.exit(bad ? 1 : 0);
