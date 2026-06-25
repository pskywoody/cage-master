// node-script/dev-server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, '../game-src')));

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../game-src/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Killer Sudoku 本地调试服务已启动！`);
  console.log(`👉 请在浏览器打开：http://localhost:3000`);
});