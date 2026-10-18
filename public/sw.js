/* Service worker: giúp app mở nhanh và chơi offline (chế độ với máy / 2 người 1 máy).
   Chiến lược "mạng trước, cache sau": online luôn nhận bản mới nhất, mất mạng thì dùng bản đã lưu. */
const CACHE = "caro-v3";
const SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // font Google... để trình duyệt tự xử lý
  if (url.pathname === "/ws" || url.pathname === "/healthz") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          // lưu theo đường dẫn (bỏ ?room=...) để không phình cache
          const key = req.mode === "navigate" ? new Request(url.origin + "/") : req;
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("/index.html"))
      )
  );
});
