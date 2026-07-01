/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.killersudoku.cagemaster',
  appName: '笼中密码',
  webDir: 'game-src',
  server: {
    androidScheme: 'https',
    startPath: '/menu.html'
  },
  android: {
    allowMixedContent: true
  }
};

module.exports = config;
