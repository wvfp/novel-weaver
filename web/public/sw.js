const CACHE_NAME = "novel-weaver-v2"
const STATIC_ASSETS = ["/", "/chat", "/world", "/review"]

// Cache-first: static assets (JS, CSS, HTML, fonts)
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
      }
      return response
    })
  })
}

// Network-first: API requests
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
      }
      return response
    })
    .catch(() => caches.match(request))
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  const isStatic =
    event.request.method === "GET" &&
    /\.(js|css|html?|woff2?|ttf|svg|ico)(\?.*)?$/.test(url.pathname)

  if (isStatic) {
    event.respondWith(cacheFirst(event.request))
    return
  }

  const isApi = url.pathname.startsWith("/api/")
  if (isApi) {
    event.respondWith(networkFirst(event.request))
    return
  }

  // Navigation and other requests: network-first
  event.respondWith(networkFirst(event.request))
})
