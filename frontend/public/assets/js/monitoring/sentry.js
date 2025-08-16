import * as Sentry from 'https://browser.sentry-cdn.com/7.100.1/bundle.min.js';

Sentry.init({
  dsn: 'https://top4cryptoshop@sentry.io/', // استبدل بـ DSN الخاص بك
  tracesSampleRate: 1.0, // لتتبع الأداء أيضًا
});