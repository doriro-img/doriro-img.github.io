# 남은 작업 — 2026-08-23 기준

**9월 90편 완료. 아래 1~6 은 전부 끝났습니다.**



서빙 용량 36.2MB · GitHub Pages 1GB 한도의 3.5%.

---

## 다음



---

## 도구 사용법 요약

```bash
node tools/advol.cjs <키워드…>                      검색량·CTR·광고수 조회
node tools/advol.cjs --file tools/kw_YYYYMM.json    kw 파일 전체
node tools/kw.cjs --lineup <파일> --out tools/kw_YYYYMM.json
node audit.cjs YYYYMM --full
node tools/artcheck.cjs --posts YYYYMM
node tools/sync.cjs YYYYMM [--all|--check]
node tools/revisit.cjs  --out tools/revisit_YYYYMM.md 재방문 판정 (연 1회 갱신 주제)
node tools/discover.cjs --out tools/cand_YYYYMM.md    주제 후보 발굴 (라인업 전)
node tools/deck.cjs YYYYMM
```

### 검색량 데이터를 다룰 때 반드시 기억할 것

```
compIdx 는 광고주 경쟁률이지 SEO 경쟁률이 아니다
   태풍 767만 검색 · compIdx 중간 · 광고 1개. 그래도 블로그는 1등 못 한다

"< 10" 은 API 가 가린 값일 수 있다
   기초연금 15회 · 자녀장려금 10회로 나온다. 근로장려금은 342,100 으로 정상
   이 한 지표로 주제를 버리지 말 것

검색량 1위가 정답이 아니다
   장애인 활동지원사 39,950 = 구직자
   장애인 활동지원   19,680 = 서비스 수급자

CTR 은 총클릭 / 총검색이다
   PC CTR + 모바일 CTR 을 더하면 이중계산 (자동차보험이 13% 로 나왔다. 실제 5.77%)

연도 접두 수요는 주제마다 갈린다
   자녀장려금 → 2026 자녀장려금 100,190  (연 1회 신청 제도)
   국민연금   → 2026 국민연금       100  (상시 제도)
   전자는 매년 새 글, 후자는 기존 글 수정이 맞다
```
