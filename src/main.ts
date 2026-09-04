import "./styles.css";
// 별도 모듈로 import해야 vite.config.ts의 woff2-only 변환이 적용된다 (styles.css 주석 참고).
import "@flaticon/flaticon-uicons/css/regular/rounded.css";

// Step 3(codex-ui-codex)에서 실제 도감 화면으로 교체된다. 지금은 스캐폴드가
// 빌드·서빙·아이콘 폰트 로드까지 되는지 확인하는 최소 셸이다.
const root = document.getElementById("app");
if (!root) throw new Error("app root not found");

const header = document.createElement("header");
header.className = "flex items-center gap-3 p-4 bg-slate-900 text-amber-400";

const logo = document.createElement("img");
logo.src = "./logo.svg";
logo.alt = "";
logo.width = 36;
logo.height = 36;

const icon = document.createElement("i");
icon.className = "fi fi-rr-treasure-chest text-2xl";
icon.setAttribute("aria-hidden", "true");

const title = document.createElement("h1");
title.className = "text-lg font-bold";
title.textContent = "역사 보물도감";

header.append(logo, icon, title);
root.append(header);
