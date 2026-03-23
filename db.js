const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "silentcyber.db");
const db = new sqlite3.Database(dbPath);
const nameWarningLimit = 3;
const suspensionMinutes = 15;
const chatLimit = 5;

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

function getAnonymousName(id) {
  return `anonimo${id}`;
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isSuspendedUntil(suspendedUntil) {
  if (!suspendedUntil) {
    return false;
  }

  return new Date(suspendedUntil).getTime() > Date.now();
}

function getSuspensionMessage(suspendedUntil) {
  const remainingMs = new Date(suspendedUntil).getTime() - Date.now();
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Cuenta inhabilitada por ${remainingMinutes} minuto(s).`;
}

async function ensureColumn(tableName, columnName, sqlDefinition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
  }
}

async function normalizeExistingDisplayNames() {
  const users = await all(`
    SELECT id, email, display_name
    FROM users
    ORDER BY id ASC
  `);

  const seen = new Set();

  for (const user of users) {
    const emailPrefix = user.email.split("@")[0] || "";
    let nextDisplayName = (user.display_name || "").trim();
    const shouldReplace =
      !nextDisplayName ||
      nextDisplayName.toLowerCase() === emailPrefix.toLowerCase();

    if (shouldReplace || seen.has(nextDisplayName.toLowerCase())) {
      nextDisplayName = getAnonymousName(user.id);
    }

    seen.add(nextDisplayName.toLowerCase());

    if (nextDisplayName !== user.display_name) {
      await run(
        "UPDATE users SET display_name = ? WHERE id = ?",
        [nextDisplayName, user.id]
      );
    }
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
  await ensureColumn("users", "avatar_data", "TEXT");
  await ensureColumn("users", "name_warning_count", "INTEGER DEFAULT 0");
  await ensureColumn("users", "suspended_until", "TEXT");
  await normalizeExistingDisplayNames();
  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_nocase ON users(display_name COLLATE NOCASE)"
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
      avatar_data TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await ensureColumn("chat_messages", "avatar_data", "TEXT");
}

async function createSession(email) {
  const token = createToken();
  await run(
    "INSERT INTO sessions (email, token, created_at) VALUES (?, ?, ?)",
    [email, token, nowIso()]
  );
  return token;
}

async function getUserByEmail(email) {
  return get(
    "SELECT id, email, display_name, avatar_data, name_warning_count, suspended_until FROM users WHERE email = ?",
    [email]
  );
}

function buildUserPayload(user) {
  return {
    email: user.email,
    userNumber: user.id,
    displayName: user.display_name,
    avatarData: user.avatar_data || "",
    nameWarningCount: user.name_warning_count || 0,
    suspendedUntil: user.suspended_until || ""
  };
}

async function buildAuthPayload(email) {
  const user = await getUserByEmail(email);
  const token = await createSession(email);

  return {
    ...buildUserPayload(user),
    token
  };
}

async function createUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const createdAt = nowIso();

  const result = await run(
    "INSERT INTO users (email, password_hash, created_at, display_name, avatar_data, name_warning_count, suspended_until) VALUES (?, ?, ?, NULL, NULL, 0, NULL)",
    [normalizedEmail, hashPassword(password), createdAt]
  );

  await run(
    "UPDATE users SET display_name = ? WHERE id = ?",
    [getAnonymousName(result.lastID), result.lastID]
  );

  await run(
    "INSERT INTO login_history (email, logged_in_at) VALUES (?, ?)",
    [normalizedEmail, createdAt]
  );

  return buildAuthPayload(normalizedEmail);
}

async function ensureUserNotSuspended(user) {
  if (isSuspendedUntil(user?.suspended_until)) {
    throw new Error(getSuspensionMessage(user.suspended_until));
  }
}

async function loginUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await get(
    `
      SELECT email, suspended_until
      FROM users
      WHERE email = ? AND password_hash = ?
    `,
    [normalizedEmail, hashPassword(password)]
  );

  if (!user) {
    throw new Error("Correo o contrasena incorrectos.");
  }

  await ensureUserNotSuspended(user);

  await run(
    "INSERT INTO login_history (email, logged_in_at) VALUES (?, ?)",
    [normalizedEmail, nowIso()]
  );

  return buildAuthPayload(normalizedEmail);
}

async function getHistory() {
  const users = await all(`
    SELECT
      users.id,
      users.email,
      users.display_name,
      users.created_at,
      MAX(login_history.logged_in_at) AS last_login_at
    FROM users
    LEFT JOIN login_history ON login_history.email = users.email
    GROUP BY users.id
    ORDER BY users.id ASC
  `);

  return { users };
}

async function getUserByToken(token) {
  if (!token) {
    return null;
  }

  const user = await get(
    `
      SELECT users.id, users.email, users.display_name, users.avatar_data, users.name_warning_count, users.suspended_until
      FROM sessions
      INNER JOIN users ON users.email = sessions.email
      WHERE sessions.token = ?
      ORDER BY sessions.id DESC
      LIMIT 1
    `,
    [token]
  );

  if (!user) {
    return null;
  }

  await ensureUserNotSuspended(user);
  return user;
}

async function isDisplayNameTaken(displayName, excludedEmail = "") {
  const user = await get(
    "SELECT email FROM users WHERE display_name = ? COLLATE NOCASE",
    [displayName]
  );

  if (!user) {
    return false;
  }

  return user.email !== excludedEmail;
}

async function registerNameWarning(email) {
  const user = await getUserByEmail(email);
  const nextWarningCount = (user?.name_warning_count || 0) + 1;

  if (nextWarningCount >= nameWarningLimit) {
    const suspendedUntil = minutesFromNow(suspensionMinutes);
    await run(
      "UPDATE users SET name_warning_count = 0, suspended_until = ? WHERE email = ?",
      [suspendedUntil, email]
    );

    return {
      warningCount: nameWarningLimit,
      suspendedUntil,
      suspended: true
    };
  }

  await run(
    "UPDATE users SET name_warning_count = ? WHERE email = ?",
    [nextWarningCount, email]
  );

  return {
    warningCount: nextWarningCount,
    suspendedUntil: "",
    suspended: false
  };
}

async function clearNameWarnings(email) {
  await run(
    "UPDATE users SET name_warning_count = 0 WHERE email = ?",
    [email]
  );
}

async function updateProfile(email, profile) {
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(profile, "displayName")) {
    updates.push("display_name = ?");
    params.push(profile.displayName);
  }

  if (Object.prototype.hasOwnProperty.call(profile, "avatarData")) {
    updates.push("avatar_data = ?");
    params.push(profile.avatarData);
  }

  if (!updates.length) {
    return getUserByEmail(email);
  }

  params.push(email);
  await run(`UPDATE users SET ${updates.join(", ")} WHERE email = ?`, params);
  await clearNameWarnings(email);

  return getUserByEmail(email);
}

async function trimChatMessages() {
  await run(
    `
      DELETE FROM chat_messages
      WHERE id NOT IN (
        SELECT id
        FROM chat_messages
        ORDER BY id DESC
        LIMIT ?
      )
    `,
    [chatLimit]
  );
}

async function createChatMessage(email, message) {
  const user = await getUserByEmail(email);

  await run(
    "INSERT INTO chat_messages (email, display_name, avatar_data, message, created_at) VALUES (?, ?, ?, ?, ?)",
    [email, user.display_name, user.avatar_data || "", message, nowIso()]
  );

  await trimChatMessages();
}

async function getChatMessages(limit = chatLimit) {
  const rows = await all(
    `
      SELECT id, email, display_name, avatar_data, message, created_at
      FROM chat_messages
      ORDER BY id DESC
      LIMIT ?
    `,
    [Math.min(limit, chatLimit)]
  );

  return rows.reverse();
}

module.exports = {
  initDb,
  createUser,
  loginUser,
  getHistory,
  getUserByToken,
  getUserByEmail,
  isDisplayNameTaken,
  registerNameWarning,
  updateProfile,
  createChatMessage,
  getChatMessages,
  getAnonymousName,
  buildUserPayload,
  getSuspensionMessage,
  nameWarningLimit,
  suspensionMinutes
};
