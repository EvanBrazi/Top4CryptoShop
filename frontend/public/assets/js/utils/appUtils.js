/**
 * @file appUtils.js
 * @description أدوات مساعدة لمعالجة بيانات التطبيقات
 * @version 2.0.0
 * @license MIT
 */

/**
 * تحويل بيانات التطبيقات من API إلى التنسيق المطلوب
 * @param {Array|Object} data - بيانات التطبيقات من API
 * @returns {Array} بيانات التطبيقات المحولة
 */
export function _transformAppsData(data) {
  if (!data) return [];
  
  // إذا كانت البيانات مصفوفة
  if (Array.isArray(data)) {
    return data.map(app => ({
      id: app.id || Math.random().toString(36).substr(2, 9),
      name: app.name || 'تطبيق بدون اسم',
      icon: app.icon || 'default.png',
      description: app.description || '',
      price: app.price || 0,
      tags: app.tags || [],
      rating: app.rating || 0,
      downloads: app.downloads || 0,
      featured: app.featured || false
    }));
  }
  
  // إذا كانت البيانات كائنًا
  if (typeof data === 'object' && data !== null) {
    return Object.values(data).map(app => ({
      id: app.id || Math.random().toString(36).substr(2, 9),
      name: app.name || 'تطبيق بدون اسم',
      icon: app.icon || 'default.png',
      description: app.description || '',
      price: app.price || 0,
      tags: app.tags || [],
      rating: app.rating || 0,
      downloads: app.downloads || 0,
      featured: app.featured || false
    }));
  }
  
  return [];
}

/**
 * تصنيف التطبيقات حسب الفئة
 * @param {Array} apps - مصفوفة التطبيقات
 * @param {string} category - الفئة المطلوبة
 * @returns {Array} التطبيقات المصنفة
 */
export function _filterAppsByCategory(apps, category) {
  if (!Array.isArray(apps)) return [];
  if (!category) return apps;
  
  return apps.filter(app => 
    app.tags && app.tags.includes(category)
  );
}

/**
 * ترتيب التطبيقات حسب المعيار المطلوب
 * @param {Array} apps - مصفوفة التطبيقات
 * @param {string} criteria - معيار الترتيب (rating/downloads/price)
 * @param {string} order - اتجاه الترتيب (asc/desc)
 * @returns {Array} التطبيقات المرتبة
 */
export function _sortApps(apps, criteria = 'rating', order = 'desc') {
  if (!Array.isArray(apps)) return [];
  
  const sorted = [...apps];
  
  sorted.sort((a, b) => {
    const valA = a[criteria] || 0;
    const valB = b[criteria] || 0;
    
    if (order === 'asc') {
      return valA - valB;
    } else {
      return valB - valA;
    }
  });
  
  return sorted;
}
