// 썸네일 겹침 검사 — art/tc-*.html 을 실제로 렌더해 요소 바운딩박스를 재고 충돌을 찾는다.
// 눈으로 27장을 보는 대신 좌표로 판정한다.
//
//   node tools/artcheck.cjs            art/tc-*.html 전부
//   node tools/artcheck.cjs tc-typhoon 특정 파일만
//   node tools/artcheck.cjs --posts 202608   해당 월 원고가 쓰는 썸네일만
//
// 겹침 판정: 두 요소의 사각형이 교차하고, 교차 면적이 작은 쪽의 8% 를 넘으면 충돌로 본다.
// 아이콘(.ico)은 배경 장식이라 투명도가 낮지만 글자 위에 겹치면 읽기가 나빠진다.

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const url = require('url');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art');
const CHROME = process.env.CHROME_PATH || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  linux: '/usr/bin/google-chrome',
}[process.platform];

const args = process.argv.slice(2);
const pi = args.indexOf('--posts');
let want = args.filter((a) => !a.startsWith('--') && a !== args[pi + 1]);

if (pi >= 0) {
  const ym = args[pi + 1];
  const used = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'posts')).filter((n) => n.startsWith('[' + ym))) {
    const m = fs.readFileSync(path.join(ROOT, 'posts', f), 'utf8').match(/tc-[a-z0-9]+/);
    if (m) used.add(m[0]);
  }
  want = [...used];
}

const files = fs.readdirSync(SRC)
  .filter((f) => f.startsWith('tc-') && f.endsWith('.html'))
  .filter((f) => !want.length || want.some((w) => f.replace('.html', '') === w || f.includes(w)));

if (!files.length) { console.log('대상 없음'); process.exit(0); }

const SEL = ['.badge', '.tag', 'h1', '.sub', '.chips', '.ico', '.foot', 'svg.ico', '.deco'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--disable-extensions'],
    defaultViewport: { width: 900, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();

  const bad = [];
  for (const f of files) {
    await page.goto(url.pathToFileURL(path.join(SRC, f)).href, { waitUntil: 'networkidle0' });
    const r = await page.evaluate((SEL) => {
      const art = document.querySelector('#art');
      if (!art) return { err: '#art 없음' };
      const A = art.getBoundingClientRect();
      // 같은 DOM 노드가 여러 셀렉터에 걸리므로(.ico 와 svg.ico) 노드 기준으로 한 번만 담는다
      const seen = new Map();
      for (const s of SEL) {
        for (const el of document.querySelectorAll(s)) {
          if (!art.contains(el)) continue;
          const b = el.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          if (seen.has(el)) continue;
          seen.set(el, { sel: s, x: b.left - A.left, y: b.top - A.top, w: b.width, h: b.height });
        }
      }
      // 부모·자식 관계인 것도 뺀다 (당연히 포함되므로 겹침이 아니다)
      const nodes = [...seen.keys()];
      const box = [];
      for (const el of nodes) {
        if (nodes.some((o) => o !== el && o.contains(el))) continue;
        box.push(seen.get(el));
      }
      return { W: A.width, H: A.height, box };
    }, SEL);

    if (r.err) { bad.push({ f, issues: [r.err] }); continue; }

    const issues = [];
    // 캔버스 밖으로 나갔나
    for (const b of r.box) {
      if (b.x < -1 || b.y < -1 || b.x + b.w > r.W + 1 || b.y + b.h > r.H + 1) {
        issues.push(`${b.sel} 캔버스 이탈 (x${Math.round(b.x)} y${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`);
      }
    }
    // 요소끼리 겹쳤나
    for (let i = 0; i < r.box.length; i++) {
      for (let j = i + 1; j < r.box.length; j++) {
        const a = r.box[i], b = r.box[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        const area = ox * oy;
        const small = Math.min(a.w * a.h, b.w * b.h);
        const pct = area / small;
        if (pct > 0.08) issues.push(`${a.sel} ↔ ${b.sel} 겹침 ${Math.round(pct * 100)}% (${Math.round(ox)}x${Math.round(oy)}px)`);
      }
    }
    if (issues.length) bad.push({ f, issues });
    process.stdout.write(issues.length ? 'x' : '.');
  }
  await browser.close();

  console.log('\n');
  console.log(`검사 ${files.length}장 · 문제 ${bad.length}장`);
  if (bad.length) {
    console.log('');
    for (const b of bad) {
      console.log('■ ' + b.f);
      b.issues.forEach((i) => console.log('    ' + i));
    }
  }
  process.exit(bad.length ? 1 : 0);
})();
