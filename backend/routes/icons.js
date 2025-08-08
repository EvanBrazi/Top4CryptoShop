const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// مسار تخزين الأيقونات
const ICONS_DIR = path.join(__dirname, '../public/icons');

// التأكد من وجود مجلد الأيقونات
async function ensureIconsDir() {
  try {
    await fs.mkdir(ICONS_DIR, { recursive: true });
  } catch (err) {
    console.error('خطأ في إنشاء مجلد الأيقونات:', err);
  }
}

// التحقق مما إذا كانت الأيقونات تم تحميلها بالكامل
async function areIconsDownloaded() {
  try {
    const files = await fs.readdir(ICONS_DIR);
    // إذا كان المجلد يحتوي على ملفات غير .gitkeep فقط
    return files.length > 1 || (files.length === 1 && files[0] !== '.gitkeep');
  } catch (err) {
    console.error('خطأ في التحقق من حالة تحميل الأيقونات:', err);
    return false;
  }
}

// جلب معلومات التطبيق من Google Play
async function getGooglePlayAppInfo(packageName) {
  try {
    const url = `https://play.google.com/store/apps/details?id=${packageName}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(response.data);
    
    // استخراج معلومات التطبيق
    const appName = $('h1[itemprop="name"]').text().trim();
    const appIcon = $('img[alt="Cover art"]').attr('src') || $('img[alt="icon"]').attr('src');
    const developer = $('a[href*="/developer"]').text().trim();
    const rating = $('div[data-g-id="ratingValue"]').attr('aria-label') || $('span[aria-label*="stars"]').text().trim();
    
    return {
      name: appName,
      icon: appIcon,
      developer: developer,
      rating: rating,
      source: 'Google Play'
    };
  } catch (error) {
    console.error('خطأ في جلب معلومات التطبيق من Google Play:', error.message);
    return null;
  }
}

// جلب معلومات التطبيق من Apple App Store
async function getAppleAppStoreInfo(appId) {
  try {
    const url = `https://itunes.apple.com/lookup?id=${appId}`;
    const response = await axios.get(url, {
      timeout: 5000
    });
    
    if (response.data.results && response.data.results.length > 0) {
      const app = response.data.results[0];
      return {
        name: app.trackName,
        icon: app.artworkUrl100 || app.artworkUrl512 || app.artworkUrl60,
        developer: app.artistName,
        rating: app.averageUserRating,
        source: 'Apple App Store'
      };
    }
    return null;
  } catch (error) {
    console.error('خطأ في جلب معلومات التطبيق من Apple App Store:', error.message);
    return null;
  }
}

// تحميل وحفظ الأيقونة
async function downloadIcon(iconUrl, appName) {
  try {
    // التأكد من وجود مجلد الأيقونات
    await ensureIconsDir();
    
    const response = await axios({
      url: iconUrl,
      responseType: 'arraybuffer',
      timeout: 5000
    });
    
    // تحويل الأيقونة إلى حجم مناسب
    const resizedImage = await sharp(response.data)
      .resize(120, 120)
      .png()
      .toBuffer();
    
    // حفظ الأيقونة
    const fileName = `${appName.replace(/\s+/g, '_')}.png`;
    const filePath = path.join(ICONS_DIR, fileName);
    await fs.writeFile(filePath, resizedImage);
    
    return `/icons/${fileName}`;
  } catch (error) {
    console.error('خطأ في تحميل الأيقونة:', error.message);
    return null;
  }
}

// تحميل جميع الأيقونات تلقائياً
async function downloadAllIcons(apps) {
  try {
    console.log('بدء تحميل جميع الأيقونات...');
    
    // التأكد من وجود مجلد الأيقونات
    await ensureIconsDir();
    
    let downloadedCount = 0;
    
    for (const app of apps) {
      try {
        let appInfo = null;
        
        // جلب معلومات التطبيق من Google Play أولاً
        if (app.packageName) {
          appInfo = await getGooglePlayAppInfo(app.packageName);
        }
        
        // إذا لم تنجح Google Play، نحاول Apple App Store
        if (!appInfo && app.appId) {
          appInfo = await getAppleAppStoreInfo(app.appId);
        }
        
        if (appInfo && appInfo.icon) {
          // تحميل الأيقونة وحفظها
          const iconPath = await downloadIcon(appInfo.icon, appInfo.name);
          if (iconPath) {
            downloadedCount++;
            console.log(`تم تحميل أيقونة التطبيق: ${appInfo.name}`);
          }
        }
      } catch (error) {
        console.error(`خطأ في تحميل أيقونة التطبيق ${app.name}:`, error.message);
      }
    }
    
    console.log(`اكتمل تحميل ${downloadedCount} من أصل ${apps.length} أيقونة`);
    return downloadedCount;
  } catch (error) {
    console.error('خطأ في تحميل جميع الأيقونات:', error.message);
    return 0;
  }
}

// نقطة النهاية للتحقق من حالة تحميل الأيقونات
router.get('/apps/icons/status', async (req, res) => {
  try {
    const downloaded = await areIconsDownloaded();
    res.json({ downloaded });
  } catch (error) {
    console.error('خطأ في التحقق من حالة الأيقونات:', error.message);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// نقطة النهاية لجلب أيقونة التطبيق
router.post('/apps/icons', async (req, res) => {
  try {
    const { apps } = req.body;
    
    if (!apps || !Array.isArray(apps)) {
      return res.status(400).json({ error: 'يرجى تقديم قائمة بالتطبيقات' });
    }
    
    // التحقق مما إذا كانت الأيقونات تم تحميلها بالكامل
    const iconsDownloaded = await areIconsDownloaded();
    
    if (!iconsDownloaded) {
      // إذا لم تتم تحميل الأيقونات، نبدأ بتحميلها تلقائياً
      console.log('لم يتم العثور على الأيقونات، جاري تحميلها الآن...');
      await downloadAllIcons(apps);
    }
    
    const results = [];
    
    for (const app of apps) {
      let appInfo = null;
      
      // جلب معلومات التطبيق من Google Play أولاً
      if (app.packageName) {
        appInfo = await getGooglePlayAppInfo(app.packageName);
      }
      
      // إذا لم تنجح Google Play، نحاول Apple App Store
      if (!appInfo && app.appId) {
        appInfo = await getAppleAppStoreInfo(app.appId);
      }
      
      if (appInfo) {
        // تحميل الأيقونة وحفظها
        let iconPath = null;
        if (appInfo.icon) {
          iconPath = await downloadIcon(appInfo.icon, appInfo.name);
        }
        
        results.push({
          appId: app.id,
          name: appInfo.name,
          icon: iconPath || appInfo.icon,
          developer: appInfo.developer,
          rating: appInfo.rating,
          source: appInfo.source
        });
      } else {
        // في حالة الفشل، نعيد أيقونة افتراضية
        results.push({
          appId: app.id,
          name: app.name,
          icon: null,
          error: 'لم يتمكن من جلب معلومات التطبيق'
        });
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('خطأ في نقطة النهاية:', error.message);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// نقطة النهاية لجلب أيقونة تطبيق واحد
router.get('/apps/icon/:packageName', async (req, res) => {
  try {
    const { packageName } = req.params;
    
    // جلب معلومات التطبيق من Google Play
    const appInfo = await getGooglePlayAppInfo(packageName);
    
    if (appInfo && appInfo.icon) {
      // تحميل الأيقونة
      const iconPath = await downloadIcon(appInfo.icon, appInfo.name);
      
      if (iconPath) {
        return res.json({
          name: appInfo.name,
          icon: iconPath,
          developer: appInfo.developer,
          rating: appInfo.rating,
          source: appInfo.source
        });
      }
    }
    
    res.status(404).json({ error: 'لم يتمكن من جلب أيقونة التطبيق' });
  } catch (error) {
    console.error('خطأ في جلب أيقونة التطبيق:', error.message);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// نقطة النهاية لتحميل جميع الأيقونات تلقائياً
router.post('/apps/icons/download-all', async (req, res) => {
  try {
    const { apps } = req.body;
    
    if (!apps || !Array.isArray(apps)) {
      return res.status(400).json({ error: 'يرجى تقديم قائمة بالتطبيقات' });
    }
    
    // التحقق مما إذا كانت الأيقونات تم تحميلها بالكامل
    const iconsDownloaded = await areIconsDownloaded();
    
    if (iconsDownloaded) {
      return res.json({ message: 'الأيقونات تم تحميلها مسبقاً' });
    }
    
    // تحميل جميع الأيقونات
    const downloadedCount = await downloadAllIcons(apps);
    
    res.json({ 
      message: `اكتمل تحميل ${downloadedCount} من أصل ${apps.length} أيقونة`,
      downloadedCount,
      totalApps: apps.length
    });
  } catch (error) {
    console.error('خطأ في تحميل جميع الأيقونات:', error.message);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

module.exports = router;