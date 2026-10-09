const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json());

function getDb() {
  let url = (process.env.TURSO_DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  let authToken = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum terpasang di Vercel.');
  }

  // Gunakan protokol libsql:// untuk SDK Turso
  if (url.startsWith('https://')) {
    url = url.replace('https://', 'libsql://');
  } else if (!url.startsWith('libsql://')) {
    url = 'libsql://' + url;
  }

  return createClient({ url, authToken });
}

// GET ROUTES
app.get('/api/kpi', async (req, res) => {
  try {
    const db = getDb();
    const bookings = await db.execute("SELECT COUNT(*) as total FROM bookings");
    const lowStock = await db.execute("SELECT COUNT(*) as total FROM inventory WHERE stock <= min_stock");
    res.json({
      todayBookings: Number(bookings.rows[0]?.total || 0),
      lowStock: Number(lowStock.rows[0]?.total || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute("SELECT * FROM bookings ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute("SELECT * FROM inventory ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pets', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute("SELECT * FROM pets ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST ROUTES
app.post('/api/bookings', async (req, res) => {
  try {
    const db = getDb();
    const { customer_name, pet_name, pet_type, service_type, booking_date, booking_time } = req.body;
    await db.execute({
      sql: `INSERT INTO bookings (customer_name, pet_name, pet_type, service_type, booking_date, booking_time) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        customer_name || 'Pemilik',
        pet_name || 'Anabul',
        pet_type || 'Kucing',
        service_type || 'Full Grooming',
        booking_date || '-',
        booking_time || '-'
      ]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const db = getDb();
    const { name, category, price, stock, min_stock, image_url } = req.body;
    await db.execute({
      sql: `INSERT INTO inventory (name, category, price, stock, min_stock, image_url) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        name || 'Produk Baru',
        category || 'Umum',
        Number(price) || 0,
        Number(stock) || 0,
        Number(min_stock) || 5,
        image_url || 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=300'
      ]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pets', async (req, res) => {
  try {
    const db = getDb();
    const { name, type, breed, owner_name, owner_phone } = req.body;
    await db.execute({
      sql: `INSERT INTO pets (name, type, breed, owner_name, owner_phone, medical_history) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        name || 'Anabul',
        type || 'Kucing',
        breed || '-',
        owner_name || 'Pemilik',
        owner_phone || '-',
        '-'
      ]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
