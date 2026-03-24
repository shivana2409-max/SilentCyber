const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const {
  initDb,
  createUser,
  loginUser,
  getHistory,
  getUserByToken,
  isDisplayNameTaken,
  registerNameWarning,
  updateProfile,
  createChatMessage,
  getChatMessages,
  buildUserPayload,
  getSuspensionMessage,
  nameWarningLimit,
  suspensionMinutes
} = require("./db");

const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const maxJsonBytes = 2 * 1024 * 1024;

function getServerMode() {
  return process.env.RENDER ? "online" : "local";
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

const bannedExactWords = new Set([
  "nig",
  "nigga",
  "nigger",
  "puta",
  "puto",
  "mierda",
  "porno",
  "porn",
  "sexo",
  "sex",
  "rape",
  "violar",
  "violacion",
  "bitch",
  "fuck",
  "asshole",
  "maricon",
  "faggot",
  "nazi",
  "hitler"
]);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function readStaticFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Archivo no encontrado" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxJsonBytes) {
        reject(new Error("Solicitud demasiado grande."));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("JSON invalido."));
      }
    });

    req.on("error", () => {
      reject(new Error("No se pudo leer la solicitud."));
    });
  });
}

function readAuthToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

async function requireAuth(req, res) {
  const token = readAuthToken(req);

  try {
    const user = await getUserByToken(token);

    if (!user) {
      sendJson(res, 401, { error: "Sesion invalida o expirada." });
      return null;
    }

    return user;
  } catch (error) {
    sendJson(res, 403, {
      error: error instanceof Error ? error.message : "Cuenta inhabilitada."
    });
    return null;
  }
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function containsBannedContent(value) {
  const normalized = normalizeText(value);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => bannedExactWords.has(token));
}

function validateDisplayName(displayName) {
  if (!displayName) {
    return "Debes escribir un nombre visible.";
  }

  if (displayName.length > 15) {
    return "El nombre no puede superar 15 caracteres.";
  }

  if (!/^[a-zA-Z0-9]+$/u.test(displayName)) {
    return "El nombre solo puede tener letras y numeros.";
  }

  if (containsBannedContent(displayName)) {
    return "Ese nombre no esta permitido.";
  }

  return "";
}

function validateMessage(message) {
  if (!message) {
    return "El mensaje no puede estar vacio.";
  }

  if (message.length > 300) {
    return "El mensaje no puede superar 300 caracteres.";
  }

  const hasTooLongWord = message
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => normalizeText(word).replace(/[^a-z0-9]/g, "").length > 15);

  if (hasTooLongWord) {
    return "No puedes enviar palabras de mas de 15 letras.";
  }

  if (containsBannedContent(message)) {
    return "Ese mensaje no esta permitido.";
  }

  return "";
}

function isValidAvatarDataUrl(value) {
  if (!value) {
    return true;
  }

  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value);
}

function buildWarningMessage(result) {
  if (result.suspended) {
    return `Cuenta inhabilitada por ${suspensionMinutes} minuto(s) tras ${nameWarningLimit} advertencias de nombre.`;
  }

  return `Advertencia ${result.warningCount}/${nameWarningLimit}. Sigue intentando y la cuenta se inhabilitara por ${suspensionMinutes} minutos.`;
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout.trim());
      }
    );
  });
}

async function getWindowsDeviceInfo() {
  const command = `
    $computer = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    $processor = (Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim()
    $gpu = (Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name).Trim()
    $baseboard = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
    $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
    $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
      "$($_.DeviceID) $([math]::Round($_.Size / 1GB, 2)) GB"
    }
    $ramBytes = [double]$computer.TotalPhysicalMemory
    $ramGb = [math]::Round($ramBytes / 1GB, 2)
    [pscustomobject]@{
      device_type = "PC / laptop"
      hostname = $env:COMPUTERNAME
      manufacturer = $computer.Manufacturer
      model = $computer.Model
      os = $os.Caption
      os_version = $os.Version
      architecture = $os.OSArchitecture
      ram = "$ramGb GB"
      processor = $processor
      gpu = $gpu
      baseboard = "$($baseboard.Manufacturer) $($baseboard.Product)"
      bios = "$($bios.Manufacturer) $($bios.SMBIOSBIOSVersion)"
      disks = ($disks -join ", ")
    } | ConvertTo-Json -Compress
  `;

  const raw = await runPowerShell(command);
  return JSON.parse(raw);
}

function getGenericServerDeviceInfo() {
  const cpus = os.cpus();

  return {
    device_type: "Servidor",
    hostname: os.hostname(),
    manufacturer: "Render / Linux host",
    model: "No disponible",
    os: `${os.type()} ${os.release()}`,
    os_version: os.version ? os.version() : "No disponible",
    architecture: os.arch(),
    ram: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
    processor: cpus[0]?.model || "No disponible",
    gpu: "No disponible en entorno cloud",
    baseboard: "No disponible en entorno cloud",
    bios: "No disponible en entorno cloud",
    disks: "No disponible en entorno cloud"
  };
}

async function getDeviceInfo() {
  if (getServerMode() === "online") {
    throw new Error("En modo online solo se permite deteccion del navegador del usuario.");
  }

  if (process.platform === "win32") {
    return getWindowsDeviceInfo();
  }

  return getGenericServerDeviceInfo();
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (requestUrl.pathname === "/api/auth/register" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "");

      if (!email || !password) {
        sendJson(res, 400, { error: "Correo y contrasena son obligatorios." });
        return;
      }

      if (password.length < 4) {
        sendJson(res, 400, { error: "La contrasena debe tener al menos 4 caracteres." });
        return;
      }

      try {
        const result = await createUser(email, password);
        sendJson(res, 200, result);
      } catch (error) {
        const message =
          error instanceof Error && error.message.includes("UNIQUE")
            ? "Ese correo ya existe."
            : error instanceof Error
              ? error.message
              : "No se pudo registrar el usuario.";
        sendJson(res, 400, { error: message });
      }
      return;
    }

    if (requestUrl.pathname === "/api/auth/login" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "");

      if (!email || !password) {
        sendJson(res, 400, { error: "Correo y contrasena son obligatorios." });
        return;
      }

      try {
        const result = await loginUser(email, password);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : "No se pudo iniciar sesion."
        });
      }
      return;
    }

    if (requestUrl.pathname === "/api/me" && req.method === "GET") {
      const user = await requireAuth(req, res);
      if (!user) {
        return;
      }

      sendJson(res, 200, buildUserPayload(user));
      return;
    }

    if (requestUrl.pathname === "/api/profile" && req.method === "PATCH") {
      const user = await requireAuth(req, res);
      if (!user) {
        return;
      }

      const payload = await readJsonBody(req);
      const hasDisplayName = Object.prototype.hasOwnProperty.call(payload, "displayName");
      const hasAvatarData = Object.prototype.hasOwnProperty.call(payload, "avatarData");
      const displayName = String(payload.displayName || "").trim();
      const avatarData = String(payload.avatarData || "");

      if (hasDisplayName) {
        const errorMessage = validateDisplayName(displayName);
        if (errorMessage) {
          const warning = await registerNameWarning(user.email);
          sendJson(res, warning.suspended ? 403 : 400, {
            error: `${errorMessage} ${buildWarningMessage(warning)}`
          });
          return;
        }

        const nameTaken = await isDisplayNameTaken(displayName, user.email);
        if (nameTaken) {
          const warning = await registerNameWarning(user.email);
          sendJson(res, warning.suspended ? 403 : 400, {
            error: `Ese nombre ya esta en uso. ${buildWarningMessage(warning)}`
          });
          return;
        }
      }

      if (hasAvatarData) {
        if (!isValidAvatarDataUrl(avatarData)) {
          sendJson(res, 400, { error: "La foto de perfil no es valida." });
          return;
        }

        if (avatarData.length > 900000) {
          sendJson(res, 400, { error: "La foto de perfil es demasiado grande." });
          return;
        }
      }

      const updatedUser = await updateProfile(user.email, {
        ...(hasDisplayName ? { displayName } : {}),
        ...(hasAvatarData ? { avatarData } : {})
      });

      sendJson(res, 200, buildUserPayload(updatedUser));
      return;
    }

    if (requestUrl.pathname === "/api/chat/messages" && req.method === "GET") {
      const user = await requireAuth(req, res);
      if (!user) {
        return;
      }

      const messages = await getChatMessages();
      sendJson(res, 200, { messages });
      return;
    }

    if (requestUrl.pathname === "/api/chat/messages" && req.method === "POST") {
      const user = await requireAuth(req, res);
      if (!user) {
        return;
      }

      const payload = await readJsonBody(req);
      const message = String(payload.message || "").trim();
      const errorMessage = validateMessage(message);

      if (errorMessage) {
        sendJson(res, 400, { error: errorMessage });
        return;
      }

      await createChatMessage(user.email, message);
      const messages = await getChatMessages();
      sendJson(res, 200, { messages });
      return;
    }

    if (requestUrl.pathname === "/api/auth/history" && req.method === "GET") {
      const result = await getHistory();
      sendJson(res, 200, result);
      return;
    }

    if (requestUrl.pathname === "/api/device") {
      const user = await requireAuth(req, res);
      if (!user) {
        return;
      }

      try {
        const data = await getDeviceInfo();
        sendJson(res, 200, data);
      } catch (error) {
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : "No se pudo leer el dispositivo."
        });
      }
      return;
    }

    if (requestUrl.pathname === "/api/server-mode") {
      sendJson(res, 200, { mode: getServerMode() });
      return;
    }

    const filePath = path.join(
      rootDir,
      requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname
    );

    if (!filePath.startsWith(rootDir)) {
      sendJson(res, 403, { error: "Ruta no permitida" });
      return;
    }

    readStaticFile(filePath, res);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Error inesperado"
    });
  }
});

initDb()
  .catch((error) => {
    console.error("No se pudo iniciar la base de datos:", error.message);
  })
  .finally(() => {
    server.on("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        console.error(`El puerto ${port} ya esta en uso.`);
        console.error("Cierra la instancia anterior de SilentCyber o cambia el puerto.");
        console.error("En PowerShell puedes ejecutar: Get-Process node | Stop-Process -Force");
        return;
      }

      console.error("No se pudo iniciar el servidor:", error.message);
    });

    server.listen(port, host, () => {
      console.log(`Servidor listo en http://${host}:${port}`);
    });
  });
