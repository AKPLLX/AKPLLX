const express = require('express');
const cloudbase = require('@cloudbase/node-sdk');

const app = express();
app.use(express.json());

const tcb = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});
const db = tcb.database();
const collection = db.collection('user_heartbeats');

async function getIpInfo(ip) {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
    const data = await res.json();
    if (data.status === 'success') {
      return {
        country: data.country || '',
        region: data.regionName || '',
        city: data.city || '',
        isp: data.isp || ''
      };
    }
  } catch (e) {}
  return { country: '', region: '', city: '', isp: '' };
}

// 心跳上报
app.post('/heartbeat', async (req, res) => {
  try {
    const { machineCode, userName, authMode } = req.body;
    if (!machineCode) return res.status(400).send('Missing machineCode');

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip;
    const ipInfo = await getIpInfo(ip);
    const now = Date.now();

    await collection.doc(machineCode).set({
      userName: userName || '未填写',
      authMode: authMode || '未知',
      ip: ip,
      country: ipInfo.country,
      region: ipInfo.region,
      city: ipInfo.city,
      isp: ipInfo.isp,
      lastSeen: now
    });

    res.send('OK');
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// 统计查询
app.get('/stats', async (req, res) => {
  try {
    const now = Date.now();
    const onlineThreshold = 60 * 60 * 1000; // 1小时内算在线

    const countResult = await collection.count();
    const total = countResult.total;

    const onlineResult = await collection.where({
      lastSeen: db.command.gt(now - onlineThreshold)
    }).count();
    const online = onlineResult.total;

    const onlineUsersResult = await collection.where({
      lastSeen: db.command.gt(now - onlineThreshold)
    }).get();

    const onlineList = onlineUsersResult.data.map(u => {
      const loc = [u.region, u.city].filter(Boolean).join(' ');
      return `${u.userName}(${loc} ${u.authMode})`;
    }).join(', ');

    res.json({ total, online, onlineList });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 80;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});