const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

const DATA_FILE = '/tmp/users.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch (e) {}
}

app.get('/', (req, res) => {
  res.send('alphacam-stats service is running');
});

app.post('/heartbeat', (req, res) => {
  const { machineCode, userName, authMode } = req.body;
  if (!machineCode) return res.status(400).send('Missing machineCode');

  const data = loadData();
  data[machineCode] = {
    userName: userName || '未填写',
    authMode: authMode || '未知',
    lastSeen: Date.now()
  };
  saveData(data);
  res.send('OK');
});

app.get('/stats', (req, res) => {
  const data = loadData();
  const now = Date.now();
  const onlineThreshold = 60 * 60 * 1000;

  let total = 0;
  let online = 0;
  const onlineList = [];

  for (const key in data) {
    total++;
    if (now - data[key].lastSeen < onlineThreshold) {
      online++;
      onlineList.push(data[key].userName + '(' + data[key].authMode + ')');
    }
  }

  res.json({ total, online, onlineList: onlineList.join(', ') });
});

const port = 80;
app.listen(port, '0.0.0.0', () => {
  console.log('Server running on port ' + port);
});
