// 자동완성 키워드 수집 — 라인업 확정 단계에서 딱 한 번만 돌린다.
// 네이버 자동완성 + 구글 서제스트를 긁어서 제목·소제목에 박을 "실제로 사람들이 치는 말"을 뽑는다.
//
//   node tools/kw.cjs "연말정산 미리보기"                       주제 하나 (씨앗은 자동 계층화)
//   node tools/kw.cjs --merge "연말정산" "연말정산 환급"          씨앗을 직접 여러 개 물려 한 덩어리로
//   node tools/kw.cjs --lineup "<..._00_90편_키워드_라인업.txt>"  라인업 주제명 전량
//   node tools/kw.cjs --lineup <파일> --deep                    상위 결과를 다시 씨앗으로 (느림)
//   node tools/kw.cjs ... --out tools/kw_202612.json            저장 경로 지정
//   node tools/kw.cjs ... --flat                                계층화 끄고 주제명 그대로만
//
// ▶ 자동완성은 가지치기 트리다. 좁은 씨앗을 넣으면 그 가지 아래만 보인다.
//   "연말정산 미리보기"로는 "연말정산 경정청구"가 절대 안 나온다. 두 결과의 교집합은 0이다.
//   그래서 주제 하나당 씨앗을 [대표 → 중간 → 주제 전체]로 계층화해 세 번 긁는다.
//   대표층은 소재 발굴과 제목 앞머리에, 주제층은 소제목 롱테일에 쓴다.
//
// ★ 못 하는 것: 정확한 월간 검색량. 네이버 검색광고 API 키(+시크릿+CUSTOMER_ID)가 있어야 나온다.
//   여기서 얻는 건 "같이 치는 말"과 그 겹침 빈도까지다. 경쟁도가 아니라 방향을 잡는 용도.

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─ 통신 계층 ────────────────────────────────────────────────
// ★ null 은 "요청 실패", [] 는 "진짜 결과 없음"이다. 이 둘을 절대 섞지 않는다.
//   섞으면 네트워크 장애가 "씨앗이 안 물렸다"는 오진으로 번져 엉뚱한 축약을 부른다.
const net = { ok: 0, fail: 0, retry: 0, bySource: { naver: { ok: 0, fail: 0 }, google: { ok: 0, fail: 0 } } };
const CACHE = new Map();   // 같은 씨앗을 두 번 때리지 않는다

async function get(url, src, tries = 3) {
  if (CACHE.has(url)) return CACHE.get(url);
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { net.retry++; await sleep(800 * (i + 1)); continue; }
      if (!r.ok) break;
      const t = await r.text();
      net.ok++; net.bySource[src].ok++;
      CACHE.set(url, t);
      return t;
    } catch (e) { net.retry++; await sleep(500 * (i + 1)); }
  }
  net.fail++; net.bySource[src].fail++;
  CACHE.set(url, null);
  return null;
}

async function naver(q) {
  const t = await get('https://ac.search.naver.com/nx/ac?q=' + encodeURIComponent(q) +
    '&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&ans=2&run=2&rev=4&q_enc=UTF-8', 'naver');
  if (t === null) return null;
  try { return ((JSON.parse(t).items || [])[0] || []).map((x) => x[0]).filter(Boolean); } catch (e) { return null; }
}

async function google(q) {
  const t = await get('https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&ie=utf-8&oe=utf-8&q=' + encodeURIComponent(q), 'google');
  if (t === null) return null;
  try { return (JSON.parse(t)[1] || []).filter(Boolean); } catch (e) { return null; }
}

// 서술어 단독은 1층 씨앗이 될 수 없다.
// "차이" → 차이797·차이홍·차이나타운, "해지" → 해지는시간·해지개 처럼
// 정보성 점수는 만점으로 뜨면서 완전히 딴 개체를 가리킨다. 2어절 이상이면 통과시킨다.
const TAIL = /^(차이|비교|방법|기준|조건|정리|총정리|안내|신청|해지|취소|변경|확인|조회|계산|준비|대응|관리|사용|점검|주의|유의사항|필요|가능|여부|시기|기간|금액|비용|요금|한도|자격|대상|절차|서류|후기|추천|순서|과정|이유|원인|효과|증상|종류|현황|제도|지원|혜택|정보|가이드|팁)$/;

// 대분류어 단독도 1층이 될 수 없다.
// "보험" "세금" "교통"은 정보성 접미가 많아 자격은 통과하지만 글 주제를 전혀 안 가리킨다.
// "대리운전 요금 보험"의 1층이 [보험]이면 대표층이 통째로 남의 글 키워드가 된다.
const BROAD = /^(보험|세금|대출|금융|교통|의료|건강|부동산|주택|아파트|자동차|차량|온라인|오프라인|투자|달러|주식|연금|급여|수당|카드|은행|병원|약국|학교|회사|정부|국가|지원금|보조금|가전|가구|의류|음식|여행|겨울|여름|봄|가을|어린이|청년|노인|부모|자녀|배우자|가족|남자|여자|기타)$/;

// 용언 활용형("달라지는" "바뀌는" "받는")은 명사가 아니라 씨앗이 못 된다.
const VERBY = /(는|한|된|될|할|하는|드는|지는|되는)$/;

// 자동완성은 오타 교정 후보를 같이 던진다.
//   한파 → 한판·한판승부·고기한판 / 배우자 → 배우 장미희 / 창호 → 창환·창홍
// 씨앗 글자를 아예 안 품은 결과는 버린다.
// "월세 연말정산" "공동명의 종부세"처럼 앞에 붙는 진짜 롱테일은 그대로 살아남는다.
const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
const onTopic = (k, seed) => norm(k).includes(norm(seed));

// ─ 씨앗 성격 판정 ───────────────────────────────────────────
// 1층 씨앗이 뱉은 접미어의 성격으로 씨앗을 3분류한다.
//   정상     : 정보성 접미가 4개 중 1개 이상 → 그대로 간다
//   구매의도 : 가격·추천·렌탈이 우세 → 정보글로 쇼핑 콘텐츠와 싸워야 한다. 소재 재검토
//   딴도메인 : 둘 다 낮음 → 씨앗이 엉뚱한 데를 가리킨다 (겨울→겨울왕국, 아파트→드라마)
//
// ★ 게이트가 아니라 "눈으로 볼 목록 좁히기"다. 오탐이 적지 않다.
//   정보성 사전에 없는 도메인 어휘를 쓰는 정상 씨앗도 딴도메인으로 걸린다.
//   걸린 건 사람이 보고, 진짜 불량이면 라인업에 "씨앗:"을 적어 갈아끼운다.
const INFO = /신청|조회|기준|대상|방법|자격|한도|계산|기간|서류|조건|지원|금액|세율|공제|해지|환급|납부|신고|절차|요건|제도|지급|수령|가입|변경|취소|확인|나이|시기|얼마|언제|어디|가능|불가|면제|감면|혜택|비용|요금|수수료|기한|연장|증명|발급|등록|폐지|개편|완화|사용|설치|점검|예방|보관|처리|센터|병원|기관|공단|청구|순위|규정|의무|위반|과태료|벌금|보험|급여|수당|바우처|계좌|세탁|관리|교체|수리|주의|위험|사고|화재|증상|효과|차이|비교|뜻/;
const BUY = /가격|추천|최저가|구매|판매|파는곳|직구|할인|세일|사이즈|용량|대용량|미니|중고|보상판매|렌탈|렌털|리스|매장|쇼핑|배송|후기|브랜드/i;

function verdictOf(list) {
  if (!list.length) return { v: '무응답', info: 0, buy: 0 };
  const info = list.filter((k) => INFO.test(k)).length / list.length;
  const buy = list.filter((k) => BUY.test(k)).length / list.length;
  return { v: info >= 0.25 ? '정상' : buy >= 0.25 ? '구매의도' : '딴도메인', info, buy };
}

// ─ 1층 씨앗 선택 ───────────────────────────────────────────
// 추측하지 않는다. 주제명에서 만들 수 있는 후보를 전부 자동완성에 넣어보고 이긴 걸 쓴다.
//
// 첫 어절을 자르면 구멍 키워드가 난다. 한국어 복합 주제명은
// [수식어 + 주어 + 서술] 어순이 흔해서 주어가 앞에 없는 경우가 많기 때문이다.
//   "아파트 승강기 갇힘"    첫 어절 [아파트] → 아파트 드라마·몇부작   ✗
//                          측정 채택 [아파트 승강기] → 사용료·교체·전기요금  ✓
//   "어린이 국가예방접종"   첫 어절 [어린이] → 어린이대공원·뮤지컬     ✗
//                          측정 채택 [국가예방접종] → 접종표·조회·도우미  ✓
//
// 자격: 필터 후 5개 이상 && 정보성 25% 이상. 아무도 자격이 없으면 씨앗이 없는 주제다.
// 그건 도구가 실패한 게 아니라 주제명을 다시 지으라는 신호다.
async function pickHead(topic) {
  const w = topic.trim().split(/\s+/);
  const ok1 = (x) => x.length >= 2 && !TAIL.test(x) && !BROAD.test(x) && !VERBY.test(x);
  const cands = [];
  for (let i = 0; i < w.length; i++) {
    if (ok1(w[i])) cands.push(w[i]);
    if (i + 1 < w.length) cands.push(w.slice(i, i + 2).join(' '));
  }
  const tried = [];
  for (const c of [...new Set(cands)]) {
    const [nv, gg] = await Promise.all([naver(c), google(c)]);
    if (nv === null && gg === null) continue;
    const L = [...(nv || []), ...(gg || [])].filter((k) => onTopic(k, c));
    tried.push({ q: c, n: L.length, ...verdictOf(L) });
    await sleep(120);
  }
  // 자격을 갖춘 것 중 가장 넓은(짧은) 것을 쓴다. 1층의 일은 형제 가지를 보여주는 것이라
  // 좁은 걸 고르면 대표층이 2층과 같아져 소재 발굴이 안 된다.
  const fit = tried.filter((x) => x.n >= 5 && x.info >= 0.25);
  fit.sort((a, b) => a.q.split(/\s+/).length - b.q.split(/\s+/).length || a.q.length - b.q.length || b.info - a.info);
  return { pick: fit[0] || null, tried };
}

// 씨앗이 통째로 안 물리면 뒤 어절을 떼며 좁혀 재시도한다.
// 단 두 소스가 모두 "요청 실패"면 축약하지 않고 실패로 반환한다.
// 장애를 "안 물림"으로 오진해 엉뚱한 머리 키워드로 내려가는 걸 막는다.
// anchor를 주면 그 말을 잃는 축약은 하지 않는다.
// "12월 달라지는 제도"를 앞에서부터 깎으면 "12월"까지 떨어져 구멍 키워드가 되살아난다.
// 1층으로 채택한 말은 어떤 경우에도 버리지 않는다.
async function probe(seed, anchor) {
  const w = seed.trim().split(/\s+/);
  const keeps = (q) => !anchor || norm(q).includes(norm(anchor));
  const try1 = async (q) => {
    if (!keeps(q)) return null;
    const [nv, gg] = await Promise.all([naver(q), google(q)]);
    if (nv === null && gg === null) return { q, nv: [], gg: [], failed: true };
    const a = nv || [], b = gg || [];
    return a.length || b.length ? { q, nv: a, gg: b } : null;
  };
  for (let n = w.length; n >= 1; n--) {
    const r = await try1(w.slice(0, n).join(' '));
    if (r) return r;
    if (n > 1) await sleep(100);
  }
  for (let n = 1; n < w.length; n++) {
    const r = await try1(w.slice(n).join(' '));
    if (r) return r;
    await sleep(100);
  }
  return { q: anchor || seed, nv: [], gg: [] };
}

// 라인업 파일에서 주제명을 긁는다.
//   07:12  [정부 정책·지원금]  종부세_고지_분납   →  tc-holdingtax.png
//   07:12  [정부 정책·지원금]  한파_취약계층_지원  →  tc-coldwave.png   씨앗: 에너지바우처
//
// 뒤에 "씨앗:"을 적어두면 그걸 1층으로 쓴다. 주제명이 일반명사로 시작할 때 쓴다.
// 여러 개면 쉼표로 구분한다. 안 적으면 주제명에서 자동으로 2층을 편다.
function fromLineup(file) {
  const t = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/\]\s+(.+?)\s+→\s+(tc-[a-z0-9]+)\.png(.*)$/);
    if (!m) continue;
    const topic = m[1].trim().replace(/_/g, ' ');
    const sd = (m[3].match(/씨앗\s*[:：]\s*(.+)$/) || [])[1];
    const item = { topic, slug: m[2] };
    if (sd) item.seeds = sd.split(',').map((x) => x.trim().replace(/_/g, ' ')).filter(Boolean);
    out.push(item);
  }
  return out;
}

(async () => {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const val = (f) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : null);
  const DEEP = has('--deep');
  const FLAT = has('--flat');
  const MERGE = has('--merge');
  const OUT = val('--out') || path.join(__dirname, 'kw.json');
  const LINEUP = val('--lineup');

  // 플래그와 그 값이 아닌 순수 인자만 남긴다.
  // 값을 받는 플래그만 뒤 인자를 건너뛴다 (--merge 같은 스위치 뒤 씨앗을 삼키면 안 된다)
  const VALUED = new Set(['--out', '--lineup']);
  const free = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));

  let items = [];
  if (LINEUP) items = fromLineup(LINEUP);
  else if (MERGE) items = free.length ? [{ topic: free[0], slug: '', seeds: free }] : [];
  else items = free.map((s) => ({ topic: s, slug: '' }));
  if (!items.length) { console.error('씨앗이 없습니다. 사용법은 파일 맨 위 주석을 보세요.'); process.exit(1); }

  const result = [];
  for (const [i, it] of items.entries()) {
    let seeds, noSeed = false, tried = null;
    if (it.seeds) seeds = it.seeds;                 // 라인업에 직접 적은 씨앗이 최우선
    else if (FLAT) seeds = [it.topic];
    else {
      const r = await pickHead(it.topic);
      tried = r.tried;
      if (r.pick) seeds = [...new Set([r.pick.q, it.topic])];
      else { seeds = [it.topic]; noSeed = true; }   // 자격 있는 후보가 없다 = 주제명을 다시 지어야 한다
    }

    const score = {};      // 키워드 → 점수
    const origin = {};     // 키워드 → 어느 씨앗에서 나왔나
    const byseed = {};
    const hits = [];

    let dropped = 0, failed = 0;
    // 1층은 자유롭게, 2층부터는 1층을 닻으로 걸어 축약이 구멍으로 새는 걸 막는다
    for (const [si, sd] of seeds.entries()) {
      const h = await probe(sd, si === 0 ? null : hits[0]);
      if (h.failed) failed++;
      hits.push(h.q);
      const nv = h.nv.filter((k) => onTopic(k, h.q));
      const gg = h.gg.filter((k) => onTopic(k, h.q));
      dropped += (h.nv.length - nv.length) + (h.gg.length - gg.length);
      byseed[h.q] = { naver: nv, google: gg };
      // 네이버 2점(국내 검색 비중), 구글 1점, 양쪽 다면 3점
      nv.forEach((k) => { score[k] = (score[k] || 0) + 2; (origin[k] = origin[k] || new Set()).add(h.q); });
      gg.forEach((k) => { score[k] = (score[k] || 0) + 1; (origin[k] = origin[k] || new Set()).add(h.q); });

      if (DEEP) {
        for (const k of nv.slice(0, 3)) {
          await sleep(120);
          (await naver(k)).filter((x) => onTopic(x, h.q))
            .forEach((x) => { score[x] = (score[x] || 0) + 1; (origin[x] = origin[x] || new Set()).add(h.q); });
        }
      }
      await sleep(150);
    }

    // 씨앗을 두 개 이상에서 동시에 뱉은 키워드는 가산 (층을 가로지르는 말 = 검색 의도가 굵다)
    for (const k of Object.keys(score)) if (origin[k].size >= 2) score[k] += 2;

    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    const headSeed = hits[0];
    const tailSeed = hits[hits.length - 1];

    // 대표층: 가장 넓은 씨앗이 뱉은 것 = 소재 발굴, 제목 앞머리
    const head = ranked.filter(([k]) => origin[k].has(headSeed)).map(([k]) => k);
    // 주제층: 가장 좁은 씨앗이 뱉은 것 중 씨앗보다 긴 것 = 소제목 롱테일
    const longtail = ranked
      .filter(([k]) => origin[k].has(tailSeed) && k.length > tailSeed.length && k.trim().split(/\s+/).length >= 2)
      .map(([k]) => k);

    result.push({
      slug: it.slug,
      topic: it.topic,
      seeds: hits,
      byseed,
      top: ranked.slice(0, 15).map(([k, v]) => ({ k, v, from: [...origin[k]] })),
      head: head.slice(0, 12),
      longtail: longtail.slice(0, 10),
      total: ranked.length,
      dropped,
      failed,
      // 1층 씨앗이 뱉은 원본으로 판정한다 (필터·점수 반영 전)
      fit: verdictOf(Object.values(byseed)[0] ? [...Object.values(byseed)[0].naver, ...Object.values(byseed)[0].google] : []),
      bySeedGiven: !!it.seeds,
      noSeed,
      // 왜 그 1층을 골랐는지 남긴다. 나중에 씨앗을 의심할 때 근거가 된다
      tried: tried ? tried.map((x) => ({ q: x.q, n: x.n, info: +(x.info).toFixed(2) })) : null,
    });
    console.log(`${String(i + 1).padStart(3)}/${items.length}  ${it.topic}  [씨앗 ${hits.length}]  ${ranked.length}개  →  ${ranked.slice(0, 4).map((x) => x[0]).join(' | ') || '(응답 없음)'}`);
  }

  // 자동완성은 시점마다 바뀐다. 언제 뽑은 건지 같이 박아둔다.
  const stamp = { collectedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), net, items: result.length };
  fs.writeFileSync(OUT, JSON.stringify({ meta: stamp, items: result }, null, 2), 'utf8');

  // 사람이 읽는 표 — 층을 나눠서 적는다
  const txt = result.map((r) =>
    `■ ${r.topic}${r.slug ? '  (' + r.slug + ')' : ''}\n` +
    `  씨앗     : ${r.seeds.join('  →  ')}   (수집 ${r.total}개)\n` +
    `  [대표층] ${r.head.join(' / ') || '(없음)'}\n` +
    `  [주제층] ${r.longtail.join(' / ') || '(없음)'}\n` +
    `  [제목후보] ${r.top.slice(0, 6).map((x) => x.k + '(' + x.v + ')').join(' / ') || '(없음)'}\n`
  ).join('\n');
  fs.writeFileSync(OUT.replace(/\.json$/, '') + '.txt', txt, 'utf8');

  const dead = result.filter((r) => !r.total).length;
  const avg = Math.round(result.reduce((s, r) => s + r.total, 0) / result.length);
  const drop = result.reduce((s, r) => s + r.dropped, 0);
  // 씨앗 자격 미달: 주제층이 3개 미만이면 1층이 일반명사라 검색 수요가 정보성이 아니다.
  //   예) "한파" → 한파나라(게임) / 한파는 주로 12월 2월에 발생한다(교과서 문장)
  //   이럴 땐 제도명·상품명 같은 고유명으로 씨앗을 다시 잡아야 한다.
  const unfit = result.filter((r) => r.longtail.length < 3);
  const broke = result.filter((r) => r.failed);
  console.log(`\n${result.length}개 수집 · 무응답 ${dead}개 · 주제당 평균 ${avg}개 · 오타추천 ${drop}개 걸러냄`);
  console.log(`통신: 성공 ${net.ok} · 실패 ${net.fail} · 재시도 ${net.retry}` +
    `  (네이버 ${net.bySource.naver.ok}/${net.bySource.naver.ok + net.bySource.naver.fail}` +
    ` · 구글 ${net.bySource.google.ok}/${net.bySource.google.ok + net.bySource.google.fail})`);
  // 씨앗 후보가 전부 자격 미달 = 주제명 자체에 검색되는 주어가 없다.
  const nos = result.filter((r) => r.noSeed);
  if (nos.length) {
    console.log(`\n  ✗ 씨앗 없음 ${nos.length}개 — 주제명을 다시 지으세요 (검색되는 주어가 없습니다)`);
    nos.forEach((r) => {
      const best = (r.tried || []).slice().sort((a, b) => b.n - a.n)[0];
      console.log(`      ${r.topic}   최선 후보 [${best ? best.q + ' n=' + best.n + ' 정보 ' + (best.info * 100).toFixed(0) + '%' : '없음'}]`);
    });
  }
  if (unfit.length) {
    console.log(`  ⚠ 씨앗 재선정 필요 ${unfit.length}개 (주제층 3개 미만)`);
    unfit.forEach((r) => console.log(`      ${r.topic}   [씨앗 ${r.seeds.join(' → ')}]  주제층 ${r.longtail.length}개`));
  }
  // 씨앗 성격 3분류 — 게이트가 아니라 눈으로 볼 목록이다. 씨앗을 직접 준 건 판정에서 뺀다.
  const susp = result.filter((r) => !r.bySeedGiven && (r.fit.v === '구매의도' || r.fit.v === '딴도메인'));
  if (susp.length) {
    console.log(`\n  ⚠ 씨앗 성격 점검 권장 ${susp.length}개 / ${result.length}개 (오탐 있음. 보고 판단하세요)`);
    for (const v of ['구매의도', '딴도메인']) {
      const g = susp.filter((r) => r.fit.v === v);
      if (!g.length) continue;
      const why = v === '구매의도' ? '쇼핑 콘텐츠와 경쟁. 소재 재검토' : '씨앗이 딴 데를 가리킴. 라인업에 "씨앗:" 명시';
      console.log(`      [${v}] ${g.length}개 — ${why}`);
      g.forEach((r) => console.log(`         ${r.topic}   [씨앗 ${r.seeds[0]}]  정보 ${(r.fit.info * 100).toFixed(0)}% / 구매 ${(r.fit.buy * 100).toFixed(0)}%`));
    }
  }
  console.log(`저장: ${OUT}`);
  console.log(`      ${OUT.replace(/\.json$/, '') + '.txt'}`);

  // 한쪽 소스가 통째로 죽으면 점수 체계(네이버 2점 / 구글 1점)가 무너진다. 조용히 넘기지 않는다.
  for (const [k, v] of Object.entries(net.bySource)) {
    if (v.fail && !v.ok) { console.error(`\n✗ ${k} 전량 실패. 점수 체계가 한쪽으로 기울었습니다. 이 결과를 쓰지 마세요.`); process.exit(1); }
  }
  if (broke.length) {
    console.error(`\n✗ 통신 실패로 씨앗을 못 물린 주제 ${broke.length}개: ${broke.map((r) => r.topic).join(', ')}`);
    console.error('  같은 명령을 다시 돌리세요. 성공분은 캐시가 아니라 파일에 남아 있으니 덮어써도 됩니다.');
    process.exit(1);
  }
})();
