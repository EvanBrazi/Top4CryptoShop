/**
 * Service Worker - Icon Processor via Message
 * يستقبل اسم الحزمة من الصفحة ويعيد مسار الأيقونة المناسب
 */

self.addEventListener('message', async (e) => {
  const { type, data } = e.data;

  if (type === 'process-icon' && data?.packageName && data?.appId) {
    const iconPath = getLocalIconPath(data.packageName);

    try {
      const exists = await checkIconExists(iconPath);

      // إرسال النتيجة إلى الصفحة التي أرسلت الرسالة
      e.source?.postMessage({
        type: 'icon-loaded',
        data: {
          appId: data.appId,
          iconPath: exists ? iconPath : '/icons/apps/default.png'
        }
      });
    } catch (error) {
      console.warn(`❌ فشل التحقق من الأيقونة: ${iconPath}`, error);

      e.source?.postMessage({
        type: 'icon-loaded',
        data: {
          appId: data.appId,
          iconPath: '/icons/apps/default.png'
        }
      });
    }
  }
});

/**
 * تحويل اسم الحزمة إلى اسم ملف أيقونة صالح
 * @param {string} packageName
 * @returns {string} icon path
 */
function getLocalIconPath(packageName) {
  let iconName = packageName
    .toLowerCase()
    .replace(/\./g, '_')              // استبدال النقاط بشرطة سفلية
    .replace(/[^a-z0-9_]/g, '')       // إزالة الرموز غير المسموح بها
    .replace(/_+/g, '_')              // دمج الشرطات المتكررة
    .replace(/(\d)\.(\w)/g, '$1_$2'); // استبدال الأرقام التي تسبق نقطة

  return `/icons/apps/${iconName}.png`;
}

/**
 * التحقق من وجود الأيقونة باستخدام طلب HEAD لتقليل حجم البيانات
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function checkIconExists(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store' // تجنب الكاش لتحديث الأيقونات فوراً
    });

    return response.ok;
  } catch (err) {
    console.error(`❌ فشل تحميل الأيقونة: ${url}`, err);
    return false;
  }
}