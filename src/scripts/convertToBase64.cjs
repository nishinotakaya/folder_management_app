const fs = require('fs');
const path = require('path');

// 絶対パスを構築
const fontPath = path.resolve(__dirname, 'NotoSansJP-Regular.ttf');

fs.readFile(fontPath, (err, data) => {
  if (err) {
    console.error(`フォントファイルが見つかりません: ${fontPath}`);
    throw err;
  }
  const base64 = data.toString('base64');
  console.log(base64);
});