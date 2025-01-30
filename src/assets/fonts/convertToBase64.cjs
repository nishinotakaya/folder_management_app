const fs = require('fs');
const path = '/Users/nishinotakaya/1.フロントコース_カリキュラムチェック/ゆうと向けのシステム/folder_Management/src/assets/fonts/NotoSansJP-Regular.ttf';

fs.readFile(path, (err, data) => {
  if (err) throw err;
  const base64 = data.toString('base64');
  console.log(base64);
});