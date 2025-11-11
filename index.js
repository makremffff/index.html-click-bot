// api/index.js  (UPDATED)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON
);

const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT  = process.env.TG_CHAT;
const RATE     = 0.005; // 10k points = 0.005 USDT

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, uid, ...payload } = req.body;
  if (!uid) return res.status(400).json({ error: 'Missing uid' });

  try {
    switch (action) {
      case 'login':        return await login(uid, payload, res);
      case 'watch':        return await watchAd(uid, res);
      case 'swap':         return await swap(uid, payload, res);
      case 'withdraw':     return await withdraw(uid, payload, res);
      case 'referral':     return await recordReferral(uid, payload, res);
      case 'mystery':      return await mystery(uid, payload, res);
      case 'quick':        return await quickBonus(uid, payload, res);
      case 'task':         return await dailyTask(uid, payload, res);
      case 'autoclick':    return await autoClick(uid, res);
      default:             return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ------------------- helpers -------------------
async function getUserData(uid) {
  const { data, error } = await supabase
    .from('users')
    .select('id,username,points,usdt,watched,referral_count')
    .eq('id', uid)
    .single();
  if (error) throw error;
  return data;
}

async function login(uid, { user }, res) {
  const username = user?.username || `user_${uid}`;
  let { data, error } = await supabase.from('users').select('*').eq('id', uid).single();
  if (error && error.code === 'PGRST116') { // not found
    const { data: newU, error: e2 } = await supabase
      .from('users')
      .insert({ id: uid, username, points: 0, usdt: 0, watched: 30, referral_count: 0 })
      .select()
      .single();
    if (e2) throw e2;
    data = newU;
  } else if (error) throw error;
  return res.json({ user: data });
}

async function watchAd(uid, res) {
  const { data: user, error: e1 } = await supabase.from('users').select('watched').eq('id', uid).single();
  if (e1) throw e1;
  if (user.watched <= 0) return res.json({ error: 'No ads left' });

  await supabase.rpc('decrement_watched', { uid });
  // مكافأة مشاهدة الإعلان
  await supabase.rpc('increment_points', { uid, amt: 50 });

  const updated = await getUserData(uid);
  return res.json({ remaining: updated.watched, user: updated });
}

async function swap(uid, { points }, res) {
  if (!points || points < 10000) return res.status(400).json({ error: 'Min 10,000 points' });
  const { data: user, error: e1 } = await supabase.from('users').select('points').eq('id', uid).single();
  if (e1) throw e1;
  if (user.points < points) return res.status(400).json({ error: 'Low balance' });

  const usdtOut = Math.floor(points / 10000) * 10000 * RATE;
  await supabase.rpc('decrement_points', { uid, amt: points });
  await supabase.rpc('increment_usdt', { uid, amt: usdtOut });

  const updated = await getUserData(uid);
  return res.json({ status: 'swapped', usdt: usdtOut, user: updated });
}

async function withdraw(uid, { addr, amt }, res) {
  if (!addr || amt < 0.5) return res.status(400).json({ error: 'Bad input' });
  const { data: user, error: e1 } = await supabase.from('users').select('username,usdt').eq('id', uid).single();
  if (e1) throw e1;
  if (user.usdt < amt) return res.status(400).json({ error: 'Low USDT' });

  const msg = `🚨 New Withdrawal 🚨\n👤 User: @${user.username}\n💰 Amount: ${amt} USDT\n📍 Polygon Address: <code>${addr}</code>\n✅ Approve: <code>/approve ${addr} ${amt}</code>\n❌ Reject: <code>/reject ${addr} ${amt}</code>`;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' })
  }).then(d => d.json());
  if (!r.ok) return res.status(500).json({ error: 'TG failed' });

  await supabase.rpc('increment_usdt', { uid, amt: -amt });
  const updated = await getUserData(uid);
  return res.json({ status: 'requested', user: updated });
}

async function recordReferral(uid, { ref }, res) {
  const referrer = parseInt(ref);
  if (referrer === uid) return res.json({ status: 'self' });
  const { data: user, error: e1 } = await supabase.from('users').select('points').eq('id', uid).single();
  if (e1) throw e1;
  if (user.points > 0) return res.json({ status: 'old' });

  await supabase.from('referrals').insert({ referrer_id: referrer, referred_id: uid });
  await supabase.rpc('increment_points', { uid, amt: 10000 });

  const updated = await getUserData(uid);
  return res.json({ status: 'joined', bonus: 10000, user: updated });
}

async function mystery(uid, { reward }, res) {
  await supabase.rpc('increment_points', { uid, amt: reward });
  const updated = await getUserData(uid);
  return res.json({ status: 'ok', user: updated });
}

async function quickBonus(uid, { reward }, res) {
  await supabase.rpc('increment_points', { uid, amt: reward });
  const updated = await getUserData(uid);
  return res.json({ status: 'ok', user: updated });
}

async function dailyTask(uid, { type, points }, res) {
  await supabase.rpc('increment_points', { uid, amt: points });
  const updated = await getUserData(uid);
  return res.json({ status: 'claimed', user: updated });
}

async function autoClick(uid, res) {
  await supabase.rpc('increment_points', { uid, amt: 1 });
  const updated = await getUserData(uid);
  return res.json({ status: 'clicked', user: updated });
}
