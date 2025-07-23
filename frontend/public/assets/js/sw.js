self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open('v1').then((cache) => 
            cache.addAll([
                '/dashboard.html',
                '/assets/css/main.css',
                '/assets/js/main.js'
            ])
        )
    );
});
