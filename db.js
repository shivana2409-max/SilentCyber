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

      resolve(row || null);
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

      resolve(rows || []);
    });
  });
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function defaultDisplayName(email) {
  return email.split("@")[0] || "usuario";
}

async function ensureColumn(tableName, columnName, sqlDefinition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
  }
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

  await ensureColumn("users", "display_name", "TEXT");
  await run(
    "UPDATE users SET display_name = COALESCE(display_name, substr(email, 1, instr(email, '@') - 1))"
  );

  await run(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      logged_in_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

async function createSession(email) {
  const token = createToken();
  await run(
    "INSERT INTO sessions (email, token, created_at) VALUES (?, ?, ?)",
    [email, token, nowIso()]
  );
  return token;
}

async function buildAuthPayload(email) {
  const user = await get(
    "SELECT email, display_name FROM users WHERE email = ?",
    [email]
  );
  const token = await createSession(email);

  return {
    email: user.email,
    displayName: user.display_name || defaultDisplayName(email),
    token
  };
}

async function createUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const createdAt = nowIso();
  const displayName = defaultDisplayName(normalizedEmail);

  await run(
    "INSERT INTO users (email, password_hash, created_at, display_name) VALUES (?, ?, ?, ?)",
    [normalizedEmail, hashPassword(password), createdAt, displayName]
  );

  await run(
    "INSERT INTO login_history (email, logged_in_at) VALUES (?, ?)",
    [normalizedEmail, createdAt]
  );

  return buildAuthPayload(normalizedEmail);
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

  return buildAuthPayload(normalizedEmail);
}

async function getHistory() {
  const users = await all(`
    SELECT
      users.email,
      users.display_name,
      users.created_at,
      MAX(login_history.logged_in_at) AS last_login_at
    FROM users
    LEFT JOIN login_history ON login_history.email = users.email
    GROUP BY users.id
    ORDER BY COALESCE(MAX(login_history.logged_in_at), users.created_at) DESC
  `);

  return { users };
}

async function getUserByToken(token) {
  if (!token) {
    return null;
  }

  return get(
    `
      SELECT users.email, users.display_name
      FROM sessions
      INNER JOIN users ON users.email = sessions.email
      WHERE sessions.token = ?
      ORDER BY sessions.id DESC
      LIMIT 1
    `,
    [token]
  );
}

async function updateDisplayName(email, displayName) {
  await run(
    "UPDATE users SET display_name = ? WHERE email = ?",
    [displayName, email]
  );

  return get(
    "SELECT email, display_name FROM users WHERE email = ?",
    [email]
  );
}

async function createChatMessage(email, message) {
  const user = await get(
    "SELECT display_name FROM users WHERE email = ?",
    [email]
  );
  const createdAt = nowIso();
  const displayName = user?.display_name || defaultDisplayName(email);

  await run(
    "INSERT INTO chat_messages (email, display_name, message, created_at) VALUES (?, ?, ?, ?)",
    [email, displayName, message, createdAt]
  );
}

async function getChatMessages(limit = 50) {
  const rows = await all(
    `
      SELECT id, email, display_name, message, created_at
      FROM chat_messages
      ORDER BY id DESC
      LIMIT ?
    `,
    [limit]
  );

  return rows.reverse();
}

module.exports = {
  initDb,
  createUser,
  loginUser,
  getHistory,
  getUserByToken,
  updateDisplayName,
  createChatMessage,
  getChatMessages
};
