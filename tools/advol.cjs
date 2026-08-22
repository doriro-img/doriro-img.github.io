// 네이버 검색광고 keywordstool — 키워드 월간 검색량 조회.
//
//   node tools/advol.cjs 청년내일저축계좌 재산세          직접 조회
//   node tools/advol.cjs --file tools/kw_202610.json      kw 파일의 상위 키워드 전부
//
// 자동완성은 "그 문자열이 존재한다"만 알려준다. 여기서 "몇 명이 찾는다"가 나온다.
// 키는 .env 에 있고 .gitignore 로 막혀 있다. 이 레포는 공개다 — 절대 하드코딩하지 않는다.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function env() {
  const out = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  }
  const need = ['NAVER_AD_CUSTOMER_ID', 'NAVER_AD_API_KEY', 'NAVER_AD_SECRET_KEY'];
  const miss = need.filter((k) => !out[k]);
  if (miss.length) {
    console.error('키가 없습니다: ' + miss.join(', '));
    console.error('.env 파일에 넣으세요 (커밋되지 않습니다).');
    process.exit(1);
  }
  return out;
}

const E = env();
const BASE = 'https://api.searchad.naver.com';

// 서명 대상은 쿼리스트링을 뺀 경로다. timestamp.METHOD.path 를 HMAC-SHA256 후 base64.
function headers(method, uri) {
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', E.NAVER_AD_SECRET_KEY)
    .update(`${ts}.${method}.${uri}`).digest('base64');
  return {
    'X-Timestamp': ts,
    'X-API-KEY': E.NAVER_AD_API_KEY,
    'X-Customer': String(E.NAVER_AD_CUSTOMER_ID),
    'X-Signature': sig,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "< 10" 같은 문자열이 온다. 숫자로 못 바꾸면 5 로 친다(10 미만이라는 뜻).
const cnt = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (/^<\s*10$/.test(s)) return 5;
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

// 검색광고는 공백을 무시하고 키워드를 정규화한다. 대조하려면 우리도 똑같이 눌러야 한다.
const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();

const stat = { call: 0, ok: 0, fail: 0, retry: 0 };

async function chunk(keys) {
  // hintKeywords 는 한 번에 5개까지. 공백은 넣어봐야 무시되므로 미리 뺀다.
  const q = keys.map((k) => norm(k)).join(',');
  const uri = '/keywordstool';
  const url = `${BASE}${uri}?hintKeywords=${encodeURIComponent(q)}&showDetail=1`;

  for (let i = 0; i < 3; i++) {
    stat.call++;
    try {
      const r = await fetch(url, { headers: headers('GET', uri) });
      if (r.status === 429 || r.status >= 500) { stat.retry++; await sleep(1200 * (i + 1)); continue; }
      if (!r.ok) {
        const t = await r.text();
        stat.fail++;
        return { err: `HTTP ${r.status} ${t.slice(0, 200)}` };
      }
      const j = await r.json();
      stat.ok++;
      return { list: j.keywordList || [] };
    } catch (e) {
      stat.retry++;
      await sleep(800 * (i + 1));
    }
  }
  stat.fail++;
  return { err: '재시도 실패' };
}

// 요청한 키워드만 골라 돌려준다. 연관 키워드는 버린다(원하면 raw 를 쓴다).
async function volume(keywords, { onProgress } = {}) {
  const uniq = [...new Set(keywords.map((k) => String(k).trim()).filter(Boolean))];
  const want = new Map(uniq.map((k) => [norm(k), k]));
  const out = new Map();
  const raw = new Map();
  const errs = [];

  for (let i = 0; i < uniq.length; i += 5) {
    const part = uniq.slice(i, i + 5);
    const r = await chunk(part);
    if (r.err) errs.push({ keys: part, err: r.err });
    else {
      for (const row of r.list) {
        const n = norm(row.relKeyword);
        const rec = {
          keyword: want.get(n) || row.relKeyword,
          pc: cnt(row.monthlyPcQcCnt),
          mo: cnt(row.monthlyMobileQcCnt),
          comp: row.compIdx || '',
          // 광고 클릭수. 애드센스 수익은 노출이 아니라 클릭에서 나온다.
          clk: (parseFloat(row.monthlyAveMobileClkCnt) || 0) + (parseFloat(row.monthlyAvePcClkCnt) || 0),
          depth: row.plAvgDepth ?? null,
        };
        rec.total = rec.pc + rec.mo;
        // CTR 은 총클릭 / 총검색이다. PC CTR 과 모바일 CTR 을 더하면 이중계산이 된다.
        // 검색량이 "< 10"으로 가려진 키워드는 분모가 가짜라 CTR 이 100%% 를 넘어버린다.
        // 표본이 작으면 아예 판정하지 않는다.
        rec.ctr = rec.total >= 100 ? (rec.clk / rec.total) * 100 : null;
        raw.set(n, rec);
        if (want.has(n)) out.set(want.get(n), rec);
      }
    }
    if (onProgress) onProgress(Math.min(i + 5, uniq.length), uniq.length);
    await sleep(350); // 호출 제한이 있다. 여유를 둔다.
  }
  return { out, raw, errs };
}

module.exports = { volume, norm, cnt, stat };

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const fi = args.indexOf('--file');
    let keys = [];

    if (fi >= 0) {
      const p = args[fi + 1];
      const rawj = JSON.parse(fs.readFileSync(p, 'utf8'));
      const items = Array.isArray(rawj) ? rawj : rawj.items || [];
      const n = parseInt(args[args.indexOf('--top') + 1], 10) || 8;
      for (const it of items) for (const t of (it.top || []).slice(0, n)) keys.push(t.k);
      console.log(`${path.basename(p)} · ${items.length}편 · 상위 ${n}개씩 → 중복 제거 전 ${keys.length}개`);
    } else {
      keys = args.filter((a) => !a.startsWith('--'));
    }

    if (!keys.length) {
      console.error('사용법: node tools/advol.cjs <키워드…> | --file kw_YYYYMM.json [--top 8]');
      process.exit(1);
    }

    const t0 = Date.now();
    const { out, errs } = await volume(keys, {
      onProgress: (a, b) => process.stdout.write(`\r조회 ${a}/${b}`),
    });
    process.stdout.write('\r' + ' '.repeat(30) + '\r');

    const rows = [...out.values()].sort((a, b) => b.total - a.total);
    const w = Math.max(...rows.map((r) => [...r.keyword].reduce((a, c) => a + (/[가-힣]/.test(c) ? 2 : 1), 0)), 10);
    const pad = (s) => s + ' '.repeat(Math.max(0, w - [...s].reduce((a, c) => a + (/[가-힣]/.test(c) ? 2 : 1), 0)));

    console.log('');
    console.log(pad('키워드') + '     PC    모바일     합계   경쟁');
    console.log('─'.repeat(w + 34));
    for (const r of rows) {
      console.log(pad(r.keyword) +
        String(r.pc).padStart(7) + String(r.mo).padStart(9) + String(r.total).padStart(9) + '   ' + r.comp);
    }
    console.log('─'.repeat(w + 34));
    const miss = keys.filter((k) => !out.has(k));
    console.log(`요청 ${new Set(keys).size} · 응답 ${out.size} · 무응답 ${miss.length} · 호출 ${stat.call} · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
    if (miss.length) console.log('무응답: ' + miss.slice(0, 10).join(', ') + (miss.length > 10 ? ` 외 ${miss.length - 10}` : ''));
    if (errs.length) { console.log(''); errs.slice(0, 3).forEach((e) => console.log('■ ' + e.keys.join(',') + '\n    ' + e.err)); }
  })();
}
