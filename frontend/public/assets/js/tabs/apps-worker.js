self.addEventListener('message', async (e) => {
  const { type, data } = e.data;
  
  if (type === 'process-icon') {
    try {
      const iconPath = getLocalIconPath(data.packageName);
      const exists = await checkIconExists(iconPath);
      
      self.postMessage({
        type: 'icon-loaded',
        data: {
          appId: data.appId,
          iconPath: exists ? iconPath : '/icons/apps/default.png'
        }
      });
    } catch (error) {
      self.postMessage({
        type: 'icon-loaded',
        data: {
          appId: data.appId,
          iconPath: '/icons/apps/default.png'
        }
      });
    }
  }
});

function getLocalIconPath(packageName) {
  if (!packageName) return '/icons/apps/default.png';

  let iconName = packageName
    .toLowerCase()
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');

  iconName = iconName.replace(/(\d)\.(\w)/g, '$1_$2');
  return `/icons/apps/${iconName}.png`;
}

async function checkIconExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}