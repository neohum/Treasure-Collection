import { expect, test, type Page, type Route } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * cloud-school(https://class.cloud-school.kr/…)은 index.html 하나에 JS·CSS를 인라인해 올리고 나머지 dist 파일은
 * 전부 404였다(2026-09-17 관찰): 아이콘 폰트 woff2·logo.svg·config.json. 여기서는 그 배포를 그대로 흉내 낸다.
 *  - 로컬 woff2는 404, jsDelivr CDN만 열린다(로컬 dist의 바이트로 채워 네트워크 없이 결정론적으로 돈다)
 *  - index.html은 JS·CSS를 인라인한 단일 파일로 `/single/`에 서빙하고 그 아래 다른 요청은 전부 404
 */
const DIST = join(process.cwd(), "dist");
const ASSETS = join(DIST, "assets");
const EVIDENCE = process.env["EVIDENCE_DIR"];

function asset(pattern: RegExp): { name: string; bytes: Buffer } {
  const name = readdirSync(ASSETS).find((f) => pattern.test(f));
  if (!name) throw new Error(`dist/assets에 ${pattern} 파일이 없습니다 — pnpm build 먼저`);
  return { name, bytes: readFileSync(join(ASSETS, name)) };
}

const WOFF2 = asset(/^uicons-regular-rounded-.*\.woff2$/);
const CDN_GLOB = "https://cdn.jsdelivr.net/**/uicons-regular-rounded*.woff2";

/** CDN 폰트를 로컬 dist의 바이트로 채운다. 폰트는 교차 출처라 CORS 헤더가 있어야 브라우저가 쓴다(실제 jsDelivr도 `*`를 보낸다). */
function fulfillCdnFont(counter: { hits: number }) {
  return (route: Route) => {
    counter.hits += 1;
    return route.fulfill({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: WOFF2.bytes });
  };
}

/** 폰트 로드 상태를 페이지 안에서 관찰한다 — document.fonts.check는 매칭 face가 없어도 true라서 face status도 함께 본다. */
function fontState(page: Page, iconSelector: string) {
  return page.evaluate(async (sel) => {
    await document.fonts.ready;
    const faces = Array.from(document.fonts).filter((f) => f.family.replace(/["']/g, "") === "uicons-regular-rounded").map((f) => f.status);
    const el = document.querySelector(sel);
    return {
      check: document.fonts.check("1em uicons-regular-rounded"),
      faces,
      iconFamily: el ? getComputedStyle(el, "::before").fontFamily.toLowerCase() : "",
    };
  }, iconSelector);
}

/** dist/index.html에 JS·CSS를 인라인한 단일 파일 페이지 (cloud-school이 올리는 형태) */
function singleFileHtml(): string {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const js = asset(/^index-.*\.js$/).bytes.toString("utf8");
  const css = asset(/^index-.*\.css$/).bytes.toString("utf8");
  if (js.includes("</script>") || css.includes("</style>")) throw new Error("번들에 닫는 태그 문자열이 있어 인라인할 수 없습니다");
  const out = html
    .replace(/<script type="module" crossorigin src="\.\/assets\/index-[^"]+\.js"><\/script>/, () => `<script type="module">${js}</script>`)
    .replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/index-[^"]+\.css">/, () => `<style>${css}</style>`);
  if (out.includes("./assets/index-")) throw new Error("dist/index.html의 JS·CSS 참조를 인라인으로 바꾸지 못했습니다");
  return out;
}

test.describe("단일 HTML 배포 내성 (cloud-school 404 회귀)", () => {
  test("AC-1: 로컬 woff2가 전부 404여도 CDN 폴백으로 아이콘 폰트가 로드된다 (CDN 요청 정확히 1회)", async ({ page }) => {
    const cdn = { hits: 0 };
    const local404: string[] = [];
    const notFound = (route: Route) => {
      local404.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 404, body: "not found" });
    };
    await page.route("**/assets/uicons-*.woff2", notFound);
    await page.route("**/uicons-*.woff2", notFound);
    await page.route(CDN_GLOB, fulfillCdnFont(cdn)); // 마지막에 등록 → 위 글롭보다 우선

    await page.goto("./");
    await expect(page.locator(".era")).toHaveCount(5);
    const state = await fontState(page, "header i.fi-rr-id-badge");
    expect(state.check).toBe(true);
    expect(state.faces).toEqual(["loaded"]);
    expect(state.iconFamily).toContain("uicons-regular-rounded");
    expect(cdn.hits).toBe(1);
    // 폴백 사슬을 앞에서부터 밟았다: ./<hash>.woff2 (assets/ 기준) → ./assets/<hash>.woff2 → CDN
    expect(local404).toEqual([`/assets/${WOFF2.name}`, `/assets/assets/${WOFF2.name}`]);
  });

  test("AC-2: index.html만 살아남은 배포(JS·CSS 인라인, 나머지 404)에서도 도감·로고·아이콘이 모두 뜬다", async ({ page }) => {
    const cdn = { hits: 0 };
    const html = singleFileHtml();
    const under404: string[] = [];
    await page.route((url) => url.pathname.startsWith("/single/") || url.pathname === "/config.json", (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/single/") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      under404.push(pathname);
      return route.fulfill({ status: 404, body: "not found" });
    });
    await page.route(CDN_GLOB, fulfillCdnFont(cdn));

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto("/single/");
    await expect(page.locator(".era")).toHaveCount(5);
    await expect(page.locator("#app")).toHaveAttribute("data-config-source", "embedded");
    await expect(page.locator(".boot-error")).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // 로고: 파일이 아니라 인라인 SVG라 404가 없다
    const logo = page.locator('header svg.app-logo[role="img"]');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("aria-label", "역사 보물도감 로고");
    const brokenImages = await page.evaluate(() => Array.from(document.images).filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.src));
    expect(brokenImages).toEqual([]);

    // 아이콘 폰트: 인라인 CSS 기준 ./uicons·./assets/uicons가 404 → CDN
    const state = await fontState(page, "header i.fi-rr-id-badge");
    expect(state.check).toBe(true);
    expect(state.faces).toEqual(["loaded"]);
    expect(state.iconFamily).toContain("uicons-regular-rounded");
    expect(cdn.hits).toBe(1);
    expect(under404).toContain(`/single/${WOFF2.name}`);
    expect(under404).toContain(`/single/assets/${WOFF2.name}`);

    if (EVIDENCE) {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.screenshot({ path: `${EVIDENCE}/single-file-1366x768.png`, fullPage: true });
    }
  });
});
