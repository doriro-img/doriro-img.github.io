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

async function naver(q) {
  const u = 'https://ac.search.naver.com/nx/ac?q=' + encodeURIComponent(q) +
    '&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&ans=2&run=2&rev=4&q_enc=UTF-8';
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    return ((j.items || [])[0] || []).map((x) => x[0]).filter(Boolean);
  } catch (e) { return []; }
}

async function google(q) {
  const u = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&ie=utf-8&oe=utf-8&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = JSON.parse(await r.text());
    return (j[1] || []).filter(Boolean);
  } catch (e) { return []; }
}

// 씨앗은 딱 2층이다. 3층 이상은 만들지 않는다.
//   1층 [대표] 제도·상품·사물의 고유명 그 자체. 그 말만으로 뜻이 통해야 한다
//   2층 [주제] 대표 + 그 글이 다루는 행위·속성 하나
//
//   "연말정산 미리보기"      → ["연말정산", "연말정산 미리보기"]
//   "국민연금 추후납부 방법"  → ["국민연금", "국민연금 추후납부"]      ← 3층은 안 만든다
//   "종합부동산세 고지 분납"  → ["종합부동산세", "종합부동산세 고지"]
//   "금 달러 투자 세금"      → ["금 달러", "금 달러 투자"]           ← 1글자 머리는 붙여 쓴다
function ladder(topic) {
  const w = topic.trim().split(/\s+/);
  if (w.length === 1) return [topic.trim()];
  const head = w[0].length >= 2 ? w[0] : w.slice(0, 2).join(' ');
  const hw = head.split(/\s+/).length;
  return [...new Set([head, w.slice(0, hw + 1).join(' ')])];
}

// 자동완성은 오타 교정 후보를 같이 던진다.
//   한파 → 한판·한판승부·고기한판 / 배우자 → 배우 장미희 / 창호 → 창환·창홍
// 씨앗 글자를 아예 안 품은 결과는 버린다.
// "월세 연말정산" "공동명의 종부세"처럼 앞에 붙는 진짜 롱테일은 그대로 살아남는다.
const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
const onTopic = (k, seed) => norm(k).includes(norm(seed));

// 씨앗이 통째로 안 물리면 뒤 어절을 떼며 좁혀 재시도한다.
async function probe(seed) {
  const w = seed.trim().split(/\s+/);
  for (let n = w.length; n >= 1; n--) {
    const q = w.slice(0, n).join(' ');
    const [nv, gg] = await Promise.all([naver(q), google(q)]);
    if (nv.length || gg.length) return { q, nv, gg };
    if (n > 1) await sleep(100);
  }
  for (let n = 1; n < w.length; n++) {
    const q = w.slice(n).join(' ');
    const [nv, gg] = await Promise.all([naver(q), google(q)]);
    if (nv.length || gg.length) return { q, nv, gg };
    await sleep(100);
  }
  return { q: seed, nv: [], gg: [] };
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
    const seeds = it.seeds || (FLAT ? [it.topic] : ladder(it.topic));

    const score = {};      // 키워드 → 점수
    const origin = {};     // 키워드 → 어느 씨앗에서 나왔나
    const byseed = {};
    const hits = [];

    let dropped = 0;
    for (const sd of seeds) {
      const h = await probe(sd);
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
    });
    console.log(`${String(i + 1).padStart(3)}/${items.length}  ${it.topic}  [씨앗 ${hits.length}]  ${ranked.length}개  →  ${ranked.slice(0, 4).map((x) => x[0]).join(' | ') || '(응답 없음)'}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

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
  console.log(`\n${result.length}개 수집 · 무응답 ${dead}개 · 주제당 평균 ${avg}개 · 오타추천 ${drop}개 걸러냄`);
  if (unfit.length) {
    console.log(`  ⚠ 씨앗 재선정 필요 ${unfit.length}개 (주제층 3개 미만 = 1층이 일반명사)`);
    unfit.forEach((r) => console.log(`      ${r.topic}   [씨앗 ${r.seeds.join(' → ')}]  주제층 ${r.longtail.length}개`));
  }
  console.log(`저장: ${OUT}`);
  console.log(`      ${OUT.replace(/\.json$/, '') + '.txt'}`);
})();
