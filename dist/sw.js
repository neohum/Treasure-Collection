//#region src/sw.ts
var e = "treasure-codex-cache-v1", t = [
	"./",
	"./apple-touch-icon.png",
	"./assets/index-B0VriKsO.css",
	"./assets/index-CA5i2V7m.js",
	"./assets/uicons-regular-rounded-J3WOUERV-0sU45oCT.woff2",
	"./config.json",
	"./favicon.ico",
	"./favicon.svg",
	"./icons/app-icon-192.png",
	"./icons/app-icon-512.png",
	"./icons/apple-touch-icon.png",
	"./icons/icon-192.png",
	"./icons/icon-512.png",
	"./icons/icon-maskable.png",
	"./icons/og-image.png",
	"./index.html",
	"./logo.svg",
	"./og-image.png",
	"./pwa.json"
];
self.addEventListener("install", (n) => {
	n.waitUntil(caches.open(e).then(async (e) => {
		for (let n of t) try {
			await e.add(n);
		} catch (e) {
			console.warn(`[SW] Precache failed for ${n}:`, e);
		}
	}).then(() => self.skipWaiting()));
}), self.addEventListener("activate", (t) => {
	t.waitUntil(caches.keys().then((t) => Promise.all(t.map((t) => {
		if (t !== e) return caches.delete(t);
	}))).then(() => self.clients.claim()));
}), self.addEventListener("fetch", (t) => {
	let n = t.request, r = new URL(n.url);
	n.method === "GET" && (r.pathname.includes("/api/") || t.respondWith(caches.match(n, { ignoreSearch: !0 }).then((e) => e ?? caches.match(n.url)).then((t) => t ? (fetch(n).then((t) => {
		if (t && t.status === 200) {
			let r = t.clone();
			caches.open(e).then((e) => e.put(n, r));
		}
	}).catch(() => {}), t) : fetch(n).then((t) => {
		if (!t || t.status !== 200) return t;
		let r = t.clone();
		return caches.open(e).then((e) => e.put(n, r)), t;
	}).catch((e) => (console.warn("[SW] Cache miss & fetch failed for:", n.url, "mode:", n.mode, e), n.mode === "navigate" ? caches.match("./index.html").then((e) => e ?? caches.match("./")).then((e) => e ?? caches.match("index.html")) : new Response("Offline", {
		status: 503,
		statusText: "Offline"
	}))))));
});
//#endregion
