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
const PNG = path.join(ROOT, '2026', String(new Date().getMonth() + 1).padStart(2, '0'));

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

const tally = {};
// 문체 분포 — 한 달치를 모아서 본다. 개별 글이 아니라 묶음이 검사 대상이다.
const voice = [];
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
      if (!fs.existsSync(path.join(PNG, slug + '.png'))) issues.push(`PNG 없음:${slug}`);
      const dir = path.join(`C:/Users/park-/Downloads/블로그원고_${ym}`, f.replace(/_원고\.txt$/, ''));
      if (!fs.existsSync(dir)) issues.push('다운로드 폴더 없음');
      else {
        const got = fs.readdirSync(dir);
        if (got.length !== 2) issues.push(`묶음 ${got.length}개`);
        if (got.some((x) => x.endsWith('.html'))) issues.push('다운로드에 HTML');
      }
    }
  }

  voice.push({ f, dr: n, me: hasMe, banmal: !!banmal, casual: hasCasual });

  if (issues.length) {
    bad++;
    issues.forEach((i) => bump(i.replace(/[:：].*|\s\d.*|\d+.*/, '').trim() || i));
    if (!SUM) console.log(`${f}\n    → ${issues.join(' / ')}`);
  }
}

// ── 화자 배경 ─────────────────────────────────────────────────────────────
// 고정된 인물·지명을 매달 쓰면 수백 편에서 같은 설정이 반복된다.
// 실측 2026-08-23: 8월 ∩ 9월 인물 겹침 67% · 지명 겹침 50%.
//   아내 15편 · 김포 6편 · 이웃 10편.
// 이번 달과 지난달을 대조해서 겹치면 알린다. 반려하지는 않는다 — 세션이 이미 쓴
// 79편을 뜯어고치려 들면 그게 더 나쁘다. 다음 달 persona 파일을 다르게 잡으라는 신호다.
const REL = ['아내', '남편', '어머니', '아버지', '엄마', '아빠', '장인', '장모', '시어머니', '시아버지',
  '처남', '매형', '사촌', '조카', '삼촌', '이모', '고모', '아들', '딸', '동료', '선배', '후배', '이웃', '옆집'];
const PLACE = ['김포', '서울', '부산', '인천', '대구', '광주', '대전', '울산', '수원', '성남', '고양', '용인',
  '청주', '전주', '창원', '제주', '강남', '분당', '일산', '판교', '동탄'];

function personaOf(ym) {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return null;
  const fl = fs.readdirSync(dir).filter((x) => x.startsWith('[' + ym));
  if (!fl.length) return null;
  const t = { rel: {}, place: {}, n: fl.length };
  for (const x of fl) {
    const raw = fs.readFileSync(path.join(dir, x), 'utf8');
    const txt = raw.slice(raw.indexOf('<')).replace(/<[^>]+>/g, ' ');
    for (const w of REL) if (txt.includes(w)) t.rel[w] = (t.rel[w] || 0) + 1;
    for (const w of PLACE) if (txt.includes(w)) t.place[w] = (t.place[w] || 0) + 1;
  }
  return t;
}

if (voice.length >= 20 && yms.length === 1) {
  const ym = yms[0];
  const y = +ym.slice(0, 4), m = +ym.slice(4);
  const prevYm = String(m === 1 ? y - 1 : y) + String(m === 1 ? 12 : m - 1).padStart(2, '0');
  const cur = personaOf(ym), prev = personaOf(prevYm);
  if (cur) {
    const top = (o, k) => Object.entries(o[k]).sort((x, z) => z[1] - x[1]).slice(0, 4)
      .map(([w, c]) => `${w} ${c}편`).join(' · ') || '없음';
    console.log('');
    console.log(`[화자 배경] 인물 ${top(cur, 'rel')}`);
    console.log(`           지명 ${top(cur, 'place')}`);
    if (prev) {
      const ov = (k) => {
        const A = Object.keys(cur[k]), B = Object.keys(prev[k]);
        const inter = A.filter((x) => B.includes(x));
        const uni = new Set([...A, ...B]).size;
        return { inter, pct: uni ? inter.length / uni * 100 : 0 };
      };
      const r = ov('rel'), p = ov('place');
      console.log(`           지난달(${prevYm}) 대비 겹침 — 인물 ${r.pct.toFixed(0)}% · 지명 ${p.pct.toFixed(0)}%`);
      const bad = [];
      if (r.pct > 40) bad.push(`인물 ${r.pct.toFixed(0)}% [${r.inter.slice(0, 6).join(' · ')}]`);
      if (p.pct > 40) bad.push(`지명 ${p.pct.toFixed(0)}% [${p.inter.slice(0, 6).join(' · ')}]`);
      if (bad.length) {
        console.log('');
        console.log('  ★ 배경 반복 — 다음 달 tools/persona_YYYYMM.md 를 지난달과 다르게 잡으세요');
        bad.forEach((b) => console.log('      ' + b));
      }
    }
  }
}

// ── 문체 균일성 ───────────────────────────────────────────────────────────
// 규칙으로 하한을 걸면 모든 글이 하한 근처에 몰린다. 그 균일성이 기계 생산의 증거다.
// 그래서 개별 글이 아니라 한 달치의 "분포" 를 본다.
//
// 실측 2026-08-23 (하한을 걸어놨을 때):
//   더라고요 평균 4.6 · 변동계수 0.33 · 0인 편 0/103
//   사람이 쓰면 글마다 들쭉날쭉해서 변동계수 0.6 이상이 나온다.
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
