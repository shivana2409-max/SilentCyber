const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { initDb, createUser, loginUser, getHistory } = require("./db");

const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;

function getServerMode() {
  return process.env.RENDER ? "online" : "local";
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

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
      if (body.length > 1024 * 1024) {
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

function formatBytesToGb(bytes) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function getGenericServerDeviceInfo() {
  const cpus = os.cpus();
  const primaryCpu = cpus[0]?.model || "No disponible";

  return {
    device_type: "Servidor",
    hostname: os.hostname(),
    manufacturer: "Render / Linux host",
    model: "No disponible",
    os: `${os.type()} ${os.release()}`,
    os_version: os.version ? os.version() : "No disponible",
    architecture: os.arch(),
    ram: formatBytesToGb(os.totalmem()),
    processor: primaryCpu,
    gpu: "No disponible en entorno cloud",
    baseboard: "No disponible en entorno cloud",
    bios: "No disponible en entorno cloud",
    disks: "No disponible en entorno cloud"
  };
}

async function getDeviceInfo() {
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

    if (requestUrl.pathname === "/api/auth/history" && req.method === "GET") {
      const result = await getHistory();
      sendJson(res, 200, result);
      return;
    }

    if (requestUrl.pathname === "/api/device") {
      const data = await getDeviceInfo();
      sendJson(res, 200, data);
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
    server.listen(port, host, () => {
      console.log(`Servidor listo en http://${host}:${port}`);
    });
  });
