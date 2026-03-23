const deviceBtn = document.getElementById("deviceBtn");
const deviceInfo = document.getElementById("deviceInfo");
const serverHint = document.getElementById("serverHint");
const serverBadge = document.getElementById("serverBadge");
const serverBadgeValue = document.getElementById("serverBadgeValue");
const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");
const quickSpecs = document.getElementById("quickSpecs");
const appLock = document.getElementById("appLock");
const deviceSection = document.getElementById("deviceSection");

function isServerMode() {
  return window.location.protocol.startsWith("http");
}

function isMobileDevice() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function showServerHint() {
  if (serverHint) {
    serverHint.hidden = false;
  }
}

function setServerBadge(mode) {
  if (!serverBadge || !serverBadgeValue) {
    return;
  }

  const normalizedMode = mode === "online" ? "Online" : "Local";
  serverBadgeValue.textContent = normalizedMode;
  serverBadge.classList.toggle("online", normalizedMode === "Online");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInfo(container, items, note = "") {
  container.classList.remove("empty");
  const cards = items
    .map(
      (item) => `
        <div class="info-item">
          <span class="label">${escapeHtml(item.label)}</span>
          <span class="value">${escapeHtml(item.value)}</span>
        </div>
      `
    )
    .join("");

  container.innerHTML = cards + (note ? `<p class="note">${escapeHtml(note)}</p>` : "");
}

function setStatus(container, text) {
  container.classList.remove("empty");
  container.innerHTML = `<p class="status">${escapeHtml(text)}</p>`;
}

function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? "#ffb4b4" : "";
}

function setLoggedInState(userEmail) {
  const isLoggedIn = Boolean(userEmail);
  appLock.hidden = isLoggedIn;
  deviceSection.hidden = !isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;
  localStorage.setItem("silentCyberLoggedInEmail", userEmail || "");

  if (isLoggedIn) {
    emailInput.value = userEmail;
    setAuthStatus(`Sesion iniciada como ${userEmail}.`);
  } else {
    setAuthStatus("Debes iniciar sesion antes de ver la informacion del dispositivo.");
    deviceInfo.classList.add("empty");
    deviceInfo.textContent = "Inicia sesion y luego presiona el boton para analizar tu dispositivo.";
    quickSpecs.classList.add("empty");
    quickSpecs.textContent = "Inicia sesion para ver procesador, RAM y tarjeta madre.";
  }
}

async function parseJsonResponse(response, defaultMessage) {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(defaultMessage);
  }

  if (!response.ok) {
    throw new Error(data.error || defaultMessage);
  }

  return data;
}

async function sendJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJsonResponse(response, "No se pudo procesar la solicitud.");
}

function getGpuRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

  if (!gl) {
    return "No disponible";
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (!debugInfo) {
    return "No disponible";
  }

  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return renderer || "No disponible";
}

function getDeviceKindLabel() {
  return isMobileDevice() ? "Celular / tablet" : "PC / laptop";
}

function getConnectionLabel() {
  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  if (!connection) {
    return "No disponible";
  }

  const parts = [connection.effectiveType, connection.type].filter(Boolean);
  return parts.length ? parts.join(" / ") : "No disponible";
}

async function getBatteryLabel() {
  if (!navigator.getBattery) {
    return "No disponible";
  }

  try {
    const battery = await navigator.getBattery();
    return `${Math.round(battery.level * 100)}%`;
  } catch (error) {
    return "No disponible";
  }
}

async function getStorageEstimateLabel() {
  if (!navigator.storage?.estimate) {
    return "No disponible";
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota ? `${(estimate.quota / 1024 / 1024 / 1024).toFixed(2)} GB` : "No disponible";
    const usage = estimate.usage ? `${(estimate.usage / 1024 / 1024).toFixed(2)} MB` : "No disponible";
    return `Uso: ${usage} / Cuota: ${quota}`;
  } catch (error) {
    return "No disponible";
  }
}

function getApproxModel() {
  const ua = navigator.userAgent;

  if (/iphone/i.test(ua)) {
    return "iPhone";
  }

  if (/ipad/i.test(ua)) {
    return "iPad";
  }

  const androidMatch = ua.match(/Android[\s\/-]*[\d.]*;?\s*([^;)\n]+)/i);
  if (androidMatch?.[1]) {
    return androidMatch[1].trim();
  }

  if (/windows/i.test(ua)) {
    return "Windows";
  }

  if (/macintosh|mac os/i.test(ua)) {
    return "Mac";
  }

  return "No disponible";
}

async function getBrowserDeviceData() {
  const battery = await getBatteryLabel();
  const storage = await getStorageEstimateLabel();
  const ram = navigator.deviceMemory ? `${navigator.deviceMemory} GB aprox.` : "No disponible";
  const processor = navigator.hardwareConcurrency
    ? `${navigator.hardwareConcurrency} nucleos / hilos logicos`
    : "No disponible";
  const platform = navigator.userAgentData?.platform || navigator.platform || "No disponible";
  const resolution = `${window.screen.width} x ${window.screen.height}`;
  const viewport = `${window.innerWidth} x ${window.innerHeight}`;
  const deviceType = getDeviceKindLabel();
  const items = [
    { label: "Tipo de dispositivo", value: deviceType },
    { label: "Modelo aproximado", value: getApproxModel() },
    { label: "Sistema / plataforma", value: platform },
    { label: "RAM", value: ram },
    { label: "Procesador", value: processor },
    { label: "GPU", value: getGpuRenderer() },
    { label: "Resolucion de pantalla", value: resolution },
    { label: "Tamano de ventana", value: viewport },
    { label: "Pixel ratio", value: String(window.devicePixelRatio || 1) },
    { label: "Puntos tactiles", value: String(navigator.maxTouchPoints || 0) },
    { label: "Conexion", value: getConnectionLabel() },
    { label: "Bateria", value: battery },
    { label: "Almacenamiento estimado", value: storage },
    { label: "Idioma", value: navigator.language || "No disponible" },
    { label: "Navegador", value: navigator.userAgent || "No disponible" }
  ];

  return {
    items,
    note: isMobileDevice()
      ? "En celulares el navegador solo expone datos parciales del hardware real."
      : "Mostrando datos detectados desde el navegador."
  };
}

async function getLocalDeviceData() {
  const response = await fetch("/api/device");
  const data = await parseJsonResponse(
    response,
    "No se pudo leer la informacion del equipo."
  );

  const items = [
    { label: "Tipo de dispositivo", value: data.device_type || "PC / laptop" },
    { label: "Nombre del equipo", value: data.hostname || "No disponible" },
    { label: "Fabricante", value: data.manufacturer || "No disponible" },
    { label: "Modelo", value: data.model || "No disponible" },
    { label: "Sistema operativo", value: data.os || "No disponible" },
    { label: "Version", value: data.os_version || "No disponible" },
    { label: "Arquitectura", value: data.architecture || "No disponible" },
    { label: "RAM", value: data.ram || "No disponible" },
    { label: "Procesador", value: data.processor || "No disponible" },
    { label: "Tarjeta grafica", value: data.gpu || "No disponible" },
    { label: "Placa madre", value: data.baseboard || "No disponible" },
    { label: "BIOS", value: data.bios || "No disponible" },
    { label: "Discos", value: data.disks || "No disponible" }
  ];

  return {
    items,
    note: "Estos datos se leen localmente desde el sistema."
  };
}

async function syncServerBadge() {
  if (!isServerMode()) {
    setServerBadge("local");
    return;
  }

  try {
    const response = await fetch("/api/server-mode");
    const data = await parseJsonResponse(response, "No se pudo leer el modo del servidor.");
    setServerBadge(data.mode || "local");
  } catch (error) {
    setServerBadge("local");
  }
}

async function loadHistory() {
  if (!isServerMode()) {
    return;
  }

  try {
    await fetch("/api/auth/history");
  } catch (error) {
    return;
  }
}

async function getBestDeviceData() {
  if (isServerMode() && !isMobileDevice()) {
    try {
      return await getLocalDeviceData();
    } catch (error) {
      return getBrowserDeviceData();
    }
  }

  return getBrowserDeviceData();
}

async function loadQuickSpecs() {
  const activeUser = localStorage.getItem("silentCyberLoggedInEmail");
  if (!activeUser) {
    quickSpecs.classList.add("empty");
    quickSpecs.textContent = "Inicia sesion para ver procesador, RAM y tarjeta madre.";
    return;
  }

  setStatus(quickSpecs, "Cargando resumen...");

  try {
    const data = await getBestDeviceData();
    const findValue = (label) =>
      data.items.find((item) => item.label === label)?.value || "No disponible";

    renderInfo(
      quickSpecs,
      [
        { label: "Procesador", value: findValue("Procesador") },
        { label: "RAM", value: findValue("RAM") },
        { label: "Tarjeta madre", value: findValue("Placa madre") }
      ],
      isMobileDevice()
        ? "En celular algunos componentes reales pueden no estar disponibles."
        : "Resumen rapido del equipo actual."
    );
  } catch (error) {
    setStatus(
      quickSpecs,
      error instanceof Error ? error.message : "No se pudo cargar el resumen."
    );
  }
}

async function submitAuth(action) {
  if (!isServerMode()) {
    setAuthStatus(
      "Para usar login y base de datos abre SilentCyber con el servidor local.",
      true
    );
    showServerHint();
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setAuthStatus("Debes completar correo y contrasena.", true);
    return;
  }

  loginBtn.disabled = true;
  registerBtn.disabled = true;
  setAuthStatus(action === "register" ? "Registrando usuario..." : "Iniciando sesion...");

  try {
    const url = action === "register" ? "/api/auth/register" : "/api/auth/login";
    const data = await sendJson(url, { email, password });
    localStorage.setItem("silentCyberLastEmail", data.email || email);
    passwordInput.value = "";
    setLoggedInState(data.email || email);
    await loadQuickSpecs();
    await loadHistory();
  } catch (error) {
    setAuthStatus(
      error instanceof Error ? error.message : "No se pudo completar la operacion.",
      true
    );
  } finally {
    loginBtn.disabled = false;
    registerBtn.disabled = false;
  }
}

deviceBtn.addEventListener("click", async () => {
  const activeUser = localStorage.getItem("silentCyberLoggedInEmail");
  if (!activeUser) {
    setAuthStatus("Debes iniciar sesion antes de analizar el dispositivo.", true);
    return;
  }

  deviceBtn.disabled = true;
  setStatus(deviceInfo, "Analizando dispositivo...");

  try {
    const data = await getBestDeviceData();
    renderInfo(deviceInfo, data.items, data.note);
  } catch (error) {
    setStatus(
      deviceInfo,
      error instanceof Error ? error.message : "Ocurrio un error inesperado."
    );
  } finally {
    deviceBtn.disabled = false;
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitAuth("login");
});

registerBtn.addEventListener("click", async () => {
  await submitAuth("register");
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("silentCyberLoggedInEmail");
  passwordInput.value = "";
  setLoggedInState("");
});

if (!isServerMode()) {
  showServerHint();
}

const lastEmail = localStorage.getItem("silentCyberLastEmail");
if (lastEmail) {
  emailInput.value = lastEmail;
}

const activeUser = localStorage.getItem("silentCyberLoggedInEmail");
setLoggedInState(activeUser || "");
loadQuickSpecs();
syncServerBadge();
loadHistory();
