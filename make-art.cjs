// 블로그용 설명 그림 생성기 — art/*.html 을 그려서 올해/이번달 폴더에 PNG로 저장한다.
// 앱 화면 캡처가 아니라 표·도식·비교표처럼 글에 필요한 그림을 직접 만들 때 쓴다.
// 주제는 무엇이든 상관없다 (여행·생활정보 등).
// 실행: node make-art.cjs [파일명…]   (인자 없으면 전부)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const url = require('url');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'art');

// OS별 Chrome 위치. CHROME_PATH로 덮어쓸 수 있다
const CHROME = process.env.CHROME_PATH || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  linux: '/usr/bin/google-chrome',
}[process.platform];

// 연·월 폴더로 나눈다 — 파일명이 겹치지 않고 나중에 찾기 쉽다
const now = new Date();
const OUT = path.join(ROOT, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));

(async () => {
  if (!fs.existsSync(SRC)) { console.log('그릴 파일이 없습니다:', SRC); return; }
  fs.mkdirSync(OUT, { recursive: true });

  const want = process.argv.slice(2);
  const files = fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !want.length || want.some((w) => f.includes(w)));
  if (!files.length) { console.log('대상 없음'); return; }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--disable-extensions'],
    defaultViewport: { width: 900, height: 600, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();

  for (const f of files) {
    await page.goto(url.pathToFileURL(path.join(SRC, f)).href, { waitUntil: 'networkidle0' });
    const out = path.join(OUT, f.replace(/\.html$/, '.png'));
    const el = (await page.$('#art')) ?? (await page.$('body'));
    await el.screenshot({ path: out });
    const box = await el.boundingBox();
    console.log(`${path.relative(ROOT, out)}  ${Math.round(box.width)}x${Math.round(box.height)}`);
  }

  await browser.close();
  console.log('DONE — 이어서 `node push.cjs "설명"` 으로 올리세요');
})();
