// 주식 가계부 앱 화면 컷 — 카드 단위로 잘라 올해/이번달 폴더에 저장한다.
// 전체 페이지 캡처는 세로가 너무 길어 본문 폭에 맞추면 글씨가 안 보인다.
// 실행 전 stock-ledger에서 `npm run dev`로 로컬 서버를 띄워둘 것.
// 실행: node make-shots.cjs
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const now = new Date();
const OUT = path.join(__dirname, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';

// 한 카드 안에 h3 섹션이 여러 개인 경우가 있어, 제목부터 다음 제목 직전까지만 잘라낸다
const BOX = `(name) => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const h = [...document.querySelectorAll('.card h3')].find((x) => norm(x.textContent).includes(name));
  if (!h) return null;
  const card = h.closest('.card');
  const heads = [...card.querySelectorAll('h3')];
  const next = heads[heads.indexOf(h) + 1];
  const cardR = card.getBoundingClientRect();
  const top = h.getBoundingClientRect().top;
  const bottom = next ? next.getBoundingClientRect().top - 8 : cardR.bottom;
  return { x: cardR.x, y: top + window.scrollY, w: cardR.width, h: bottom - top };
}`;

const SHOTS = [
  { tab: '대시보드', card: '연도별 요약', file: 'b04-yearly.png', maxH: 700 },
  { tab: '대시보드', card: '양도차익', file: 'b10-gauge.png', maxH: 520 },
  { tab: '연간 통계', card: '연간 입력', file: 'b11-rebal.png', maxH: 520 },
];

const clickTab = async (page, label) => {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('.tabs a, .tabs button')].find((x) => x.textContent === l);
    if (b) b.click();
  }, label);
  await new Promise((r) => setTimeout(r, 450));
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--disable-extensions'],
    // 블로그 본문 폭에 맞추면 되므로 가이드 컷보다 배율을 낮춘다 (파일이 가벼워진다)
    defaultViewport: { width: 1100, height: 900, deviceScaleFactor: 1.5 },
  });
  const page = await browser.newPage();

  for (const s of SHOTS) {
    await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 350));
    await clickTab(page, s.tab);
    const box = await page.evaluate(new Function('name', `return (${BOX})(name)`), s.card);
    if (!box) { console.log(`SKIP ${s.file} — 카드를 찾지 못함 (${s.card})`); continue; }
    const pad = 14;
    await page.screenshot({
      path: path.join(OUT, s.file),
      clip: {
        x: Math.max(box.x - pad, 0),
        y: Math.max(box.y - pad, 0),
        width: box.w + pad * 2,
        height: Math.min(box.h + pad * 2, s.maxH ?? 1e4),
      },
    });
    console.log(`${s.file}  ${Math.round(box.w)}x${Math.round(Math.min(box.h, s.maxH ?? 1e4))}`);
  }
  await browser.close();
  console.log('DONE →', OUT);
  console.log('이어서 blog-cdn에서 `node push.cjs "설명"` 으로 올리세요');
})();
