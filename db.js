const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "silentcyber.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      logged_in_at TEXT NOT NULL
    )
  `);
}

async function createUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const createdAt = nowIso();

  await run(
    "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
    [normalizedEmail, hashPassword(password), createdAt]
  );

  await run(
    "INSERT INTO login_history (email, logged_in_at) VALUES (?, ?)",
    [normalizedEmail, createdAt]
  );

  return { email: normalizedEmail };
}

async function loginUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await get(
    "SELECT email FROM users WHERE email = ? AND password_hash = ?",
    [normalizedEmail, hashPassword(password)]
  );

  if (!user) {
    throw new Error("Correo o contrasena incorrectos.");
  }

  await run(
    "INSERT INTO login_history (email, logged_in_at) VALUES (?, ?)",
    [normalizedEmail, nowIso()]
  );

  return { email: normalizedEmail };
}

async function getHistory() {
  const users = await all(`
    SELECT
      users.email,
      users.created_at,
      MAX(login_history.logged_in_at) AS last_login_at
    FROM users
    LEFT JOIN login_history ON login_history.email = users.email
    GROUP BY users.id
    ORDER BY COALESCE(MAX(login_history.logged_in_at), users.created_at) DESC
  `);

  return { users };
}

module.exports = {
  initDb,
  createUser,
  loginUser,
  getHistory
};
