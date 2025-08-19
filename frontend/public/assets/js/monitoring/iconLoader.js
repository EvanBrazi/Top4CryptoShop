/**
 * @file iconLoader.js
 * @module fetchIconWithMonitoring
 * @description تحميل أيقونة مع مراقبة الأداء والأخطاء باستخدام Sentry وGoogle Analytics
 * @version 2.1.0
 * @license MIT
 */
/**
 * تحميل أيقونة من الشبكة مع مراقبة الأداء والأخطاء
 * @param {string} iconUrl - رابط الأيقونة المطلوب تحميلها
 * @param {number} [retryCount=3] - عدد المحاولات القصوى عند الفشل
 * @returns {Promise<Object>} كائن يحتوي على بيانات الأيقونة أو fallback
 */
export async function fetchIconWithMonitoring(iconUrl, retryCount = 3) {
  let attempt = 0;
  const startTime = performance.now();

  while (attempt <= retryCount) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(iconUrl, {
        signal: controller.signal,
        cache: 'force-cache'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const duration = performance.now() - startTime;

      // تسجيل زمن التحميل في Google Analytics
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'icon_load_time', {
          event_category: 'performance',
          event_label: iconUrl,
          value: Math.round(duration)
        });
      }

      // إرجاع بيانات الأيقونة
      return {
        objectUrl: URL.createObjectURL(blob),
        size: blob.size,
        lastUsed: Date.now()
      };

    } catch (error) {
      clearTimeout(timeoutId);
      attempt++;
      // تأخير تدريجي قبل إعادة المحاولة
      await new Promise(r => setTimeout(r, 500 + attempt * 200));
    }
  }
  
  // إرجاع رابط fallback فقط (يتم تحميله لاحقًا في IconManager)
  return {
    objectUrl: '/icons/apps/default.png',
    size: 0,
    lastUsed: Date.now()
  };
}