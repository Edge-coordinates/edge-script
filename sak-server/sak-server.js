const express = require('express');
const {spawn} = require('child_process');

const app = express();
const PORT = 3764;

app.use(express.json());

function runScript(scriptPath, res) {
  const child = spawn('bash', [scriptPath]);

  // 设置响应头，让浏览器逐步接收数据
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // 脚本的标准输出实时写入响应
  child.stdout.on('data', data => {
    res.write(data.toString());
  });

  // 脚本的错误输出也写到响应里
  child.stderr.on('data', data => {
    res.write(`ERR: ${data.toString()}`);
  });

  // 脚本结束时关闭响应
  child.on('close', code => {
    res.end(`\nScript finished with code ${code}\n`);
  });
}

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/updateblog', (req, res) => {
  const scriptPath = './updateBlog.sh';
  runScript(scriptPath, res);
});

app.get('/updatePortfolio', (req, res) => {
  const scriptPath = './updatePortfolio.sh';
  runScript(scriptPath, res);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
