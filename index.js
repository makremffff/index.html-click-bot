// index.js
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// قاعدة بيانات مؤقتة (Map) : key = telegram user id
const users = new Map();

// إنشاء سجل افتراضي إذا لم يكن موجوداً
function ensureUser(id) {
  if (!users.has(id)) {
    users.set(id, {
      clicks: 0,
      usdt: 0,
      counter: 30,
      autoClickEnabled: false,
      timeLeft: 3 * 3600,
      mysteryLastClaim: 0,
      quickLastClaim: 0,
      joined: false
    });
  }
}

// GET /api/user/:id
app.get('/api/user/:id', (req, res) => {
  const id = Number(req.params.id);
  ensureUser(id);
  res.json(users.get(id));
});

// POST /api/user/:id
app.post('/api/user/:id', (req, res) => {
  const id = Number(req.params.id);
  ensureUser(id);
  const user = users.get(id);
  Object.assign(user, req.body); // merge update
  res.json({ success: true, user });
});

// POST /api/withdraw
app.post('/api/withdraw', (req, res) => {
  const { userId, amount, address } = req.body;
  ensureUser(userId);
  const user = users.get(userId);
  if (user.usdt < amount) return res.status(400).json({ error: 'Insufficient USDT' });

  user.usdt -= amount;
  // يمكنك هنا إرسال تليغرام أو حفظ الطلب في مصفوفة
  res.json({ success: true, user });
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
