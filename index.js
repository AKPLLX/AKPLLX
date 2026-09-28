const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

const DATA_FILE = '/tmp/users.json';
const IP_CACHE_FILE = '/tmp/ip_cache.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
  return {};
}

function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data)); } catch (e) {}
}

function loadIpCache() {
  try {
    if (fs.existsSync(IP_CACHE_FILE)) return JSON.parse(fs.readFileSync(IP_CACHE_FILE, 'utf8'));
  } catch (e) {}
  return {};
}

function saveIpCache(cache) {
  try { fs.writeFileSync(IP_CACHE_FILE, JSON.stringify(cache)); } catch (e) {}
}

async function getIpInfo(ip) {
  if (!ip || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.') || ip.startsWith('172.')) return null;
  const cache = loadIpCache();
  if (cache[ip]) return cache[ip];
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,regionName,city,isp`);
    const data = await res.json();
    if (data.status === 'success') {
      const info = { country: data.country || '', region: data.regionName || '', city: data.city || '', isp: data.isp || '' };
      cache[ip] = info;
      saveIpCache(cache);
      return info;
    }
  } catch (e) {}
  return null;
}

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  if (Array.isArray(ip)) ip = ip[0];
  if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
  return ip;
}

app.get('/', (req, res) => res.send('alphacam-stats service is running'));

app.post('/heartbeat', async (req, res) => {
  try {
    const { machineCode, userName, authMode } = req.body;
    if (!machineCode) return res.status(400).send('Missing machineCode');

    const data = loadData();
    const now = Date.now();
    const ip = getClientIp(req);

    if (!data[machineCode]) {
      data[machineCode] = {
        machineCode, userName: userName || '未填写', authMode: authMode || '未知',
        firstSeen: now, lastSeen: now, heartbeatCount: 0,
        ip: '', country: '', region: '', city: '', isp: ''
      };
    }

    const user = data[machineCode];
    user.userName = userName || user.userName || '未填写';
    user.authMode = authMode || user.authMode || '未知';
    user.lastSeen = now;
    user.heartbeatCount = (user.heartbeatCount || 0) + 1;

    if (ip && ip !== user.ip) {
      user.ip = ip;
      const info = await getIpInfo(ip);
      if (info) {
        user.country = info.country;
        user.region = info.region;
        user.city = info.city;
        user.isp = info.isp;
      }
    }

    saveData(data);
    res.send('OK');
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

app.get('/stats', (req, res) => {
  const data = loadData();
  const now = Date.now();
  const onlineThreshold = 60 * 60 * 1000;
  let total = 0, online = 0;
  const users = [];

  for (const key in data) {
    total++;
    const u = data[key];
    const isOnline = (now - u.lastSeen < onlineThreshold);
    if (isOnline) online++;
    users.push({
      machineCode: u.machineCode || key,
      userName: u.userName || '未填写',
      authMode: u.authMode || '未知',
      ip: u.ip || '',
      location: [u.country, u.region, u.city, u.isp].filter(Boolean).join(' '),
      isOnline: isOnline,
      lastSeen: u.lastSeen ? new Date(u.lastSeen).toLocaleString('zh-CN') : '',
      firstSeen: u.firstSeen ? new Date(u.firstSeen).toLocaleString('zh-CN') : '',
      heartbeatCount: u.heartbeatCount || 0
    });
  }
  users.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  res.json({ total, online, users });
});

app.get('/view', (req, res) => {
  const data = loadData();
  const now = Date.now();
  const onlineThreshold = 60 * 60 * 1000;
  let total = 0, online = 0;
  const rows = [];

  for (const key in data) {
    total++;
    const u = data[key];
    const isOnline = (now - u.lastSeen < onlineThreshold);
    if (isOnline) online++;
    rows.push(`<tr>
      <td>${u.userName || '未填写'}</td>
      <td>${u.machineCode || key}</td>
      <td>${u.authMode || '未知'}</td>
      <td>${[u.country, u.region, u.city, u.isp].filter(Boolean).join(' ')}</td>
      <td>${u.ip || ''}</td>
      <td>${u.heartbeatCount || 0}</td>
      <td class="${isOnline ? 'online' : 'offline'}">${isOnline ? '在线' : '离线'}</td>
      <td>${u.lastSeen ? new Date(u.lastSeen).toLocaleString('zh-CN') : ''}</td>
    </tr>`);
  }

  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>陈工插件 - 用户统计</title>';
  html += '<style>body{font-family:"Microsoft YaHei",sans-serif;padding:20px;background:#f5f5f5;}';
  html += 'table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.1);}';
  html += 'th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px;}';
  html += 'th{background:#4a90d9;color:#fff;} tr:nth-child(even){background:#f9f9f9;}';
  html += '.online{color:#0a0;font-weight:bold;} .offline{color:#999;}';
  html += 'h1{color:#333;} .summary{background:#fff;padding:15px;margin-bottom:15px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,.1);}';
  html += '.summary span{margin-right:20px;font-size:16px;} .summary b{color:#4a90d9;font-size:22px;}</style></head><body>';
  html += '<h1>陈工插件 - 用户统计</h1>';
  html += `<div class="summary"><span>总用户：<b>${total}</b></span><span>在线用户：<b>${online}</b>（60分钟内）</span></div>`;
  html += '<table><tr><th>用户名</th><th>机器码</th><th>授权</th><th>位置</th><th>IP</th><th>心跳次数</th><th>状态</th><th>最后在线</th></tr>';
  html += rows.join('');
  html += '</table></body></html>';
  res.send(html);
});

const port = 80;
app.listen(port, '0.0.0.0', () => console.log('Server running on port ' + port));
