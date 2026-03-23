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
const communitySection = document.getElementById("communitySection");
const profileInfo = document.getElementById("profileInfo");
const profileForm = document.getElementById("profileForm");
const displayNameInput = document.getElementById("displayNameInput");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileStatus = document.getElementById("profileStatus");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatStatus = document.getElementById("chatStatus");

let currentServerMode = "local";
let currentUser = null;
let chatPollId = null;

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
  currentServerMode = mode === "online" ? "online" : "local";

  if (!serverBadge || !serverBadgeValue) {
    return;
  }

  const normalizedMode = currentServerMode === "online" ? "Online" : "Local";
  serverBadgeValue.textContent = normalizedMode;
  serverBadge.classList.toggle("online", normalizedMode === "Online");
}

function getAuthToken() {
  return localStorage.getItem("silentCyberToken") || "";
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem("silentCyberToken", token);
  } else {
    localStorage.removeItem("silentCyberToken");
  }
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

function setProfileStatus(message, isError = false) {
  profileStatus.textContent = message;
  profileStatus.style.color = isError ? "#ffb4b4" : "";
}

function setChatStatus(message, isError = false) {
  chatStatus.textContent = message;
  chatStatus.style.color = isError ? "#ffb4b4" : "";
}

function formatDate(value) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("es-CL");
}

function startChatPolling() {
  stopChatPolling();
  chatPollId = window.setInterval(() => {
    loadChatMessages(false);
  }, 5000);
}

function stopChatPolling() {
  if (chatPollId) {
    window.clearInterval(chatPollId);
    chatPollId = null;
  }
}

function renderProfile(user) {
  if (!user) {
    profileInfo.classList.add("empty");
    profileInfo.textContent = "Inicia sesion para cargar tu perfil.";
    displayNameInput.value = "";
    return;
  }

  displayNameInput.value = user.displayName || "";
  renderInfo(profileInfo, [
    { label: "Correo", value: user.email || "No disponible" },
    { label: "Nombre visible", value: user.displayName || "No disponible" }
  ]);
}

function renderChatMessages(messages) {
  if (!messages.length) {
    chatMessages.classList.add("empty");
    chatMessages.textContent = "Todavia no hay mensajes en el chat global.";
    return;
  }

  chatMessages.classList.remove("empty");
  chatMessages.innerHTML = messages
    .map(
      (message) => `
        <article class="chat-item">
          <div class="chat-header">
            <strong class="chat-name">${escapeHtml(message.display_name)}</strong>
            <span class="chat-meta">${escapeHtml(formatDate(message.created_at))}</span>
          </div>
          <div class="chat-text">${escapeHtml(message.message)}</div>
        </article>
      `
    )
    .join("");
}

function setLoggedInState(user) {
  currentUser = user || null;
  const isLoggedIn = Boolean(currentUser);

  appLock.hidden = isLoggedIn;
  deviceSection.hidden = !isLoggedIn;
  communitySection.hidden = !isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;

  if (isLoggedIn) {
    emailInput.value = currentUser.email;
    localStorage.setItem("silentCyberLastEmail", currentUser.email);
    setAuthStatus(`Sesion iniciada como ${currentUser.email}.`);
    renderProfile(currentUser);
    setProfileStatus("Puedes cambiar tu nombre visible cuando quieras.");
    setChatStatus("Los mensajes se actualizan automaticamente.");
    startChatPolling();
  } else {
    setAuthStatus("Debes iniciar sesion antes de ver la informacion del dispositivo.");
    deviceInfo.classList.add("empty");
    deviceInfo.textContent = "Inicia sesion y luego presiona el boton para analizar tu dispositivo.";
    quickSpecs.classList.add("empty");
    quickSpecs.textContent = "Inicia sesion para ver procesador, RAM y tarjeta madre.";
    renderProfile(null);
    chatMessages.classList.add("empty");
    chatMessages.textContent = "Inicia sesion para entrar al chat global.";
    stopChatPolling();
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

async function sendJson(url, payload, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };

  const response = await fetch(url, {
    method: options.method || "POST",
    headers,
    body: JSON.stringify(payload)
  });

  return parseJsonResponse(response, "No se pudo procesar la solicitud.");
}

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  return parseJsonResponse(response, "No se pudo completar la solicitud.");
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
    const quota = estimate.quota
      ? `${(estimate.quota / 1024 / 1024 / 1024).toFixed(2)} GB`
      : "No disponible";
    const usage = estimate.usage
      ? `${(estimate.usage / 1024 / 1024).toFixed(2)} MB`
      : "No disponible";
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

  const androidMatch = ua.match(/Android[\s/-]*[\d.]*;?\s*([^;)\n]+)/i);
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
  const deviceType = isMobileDevice() ? "Celular / tablet" : "PC / laptop";

  const items = [
    { label: "Tipo de dispositivo", value: deviceType },
    { label: "Modelo aproximado", value: getApproxModel() },
    { label: "Sistema / plataforma", value: platform },
    { label: "RAM", value: ram },
    { label: "Procesador", value: processor },
    { label: "Tarjeta grafica", value: getGpuRenderer() },
    { label: "Tarjeta madre", value: "No disponible desde navegador" },
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
      : "En modo online se muestran datos del navegador del usuario."
  };
}

async function getLocalDeviceData() {
  const response = await authFetch("/api/device");

  return {
    items: [
      { label: "Tipo de dispositivo", value: response.device_type || "PC / laptop" },
      { label: "Nombre del equipo", value: response.hostname || "No disponible" },
      { label: "Fabricante", value: response.manufacturer || "No disponible" },
      { label: "Modelo", value: response.model || "No disponible" },
      { label: "Sistema operativo", value: response.os || "No disponible" },
      { label: "Version", value: response.os_version || "No disponible" },
      { label: "Arquitectura", value: response.architecture || "No disponible" },
      { label: "RAM", value: response.ram || "No disponible" },
      { label: "Procesador", value: response.processor || "No disponible" },
      { label: "Tarjeta grafica", value: response.gpu || "No disponible" },
      { label: "Tarjeta madre", value: response.baseboard || "No disponible" },
      { label: "BIOS", value: response.bios || "No disponible" },
      { label: "Discos", value: response.disks || "No disponible" }
    ],
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

async function getBestDeviceData() {
  if (currentServerMode === "local" && !isMobileDevice()) {
    try {
      return await getLocalDeviceData();
    } catch (error) {
      return getBrowserDeviceData();
    }
  }

  return getBrowserDeviceData();
}

async function loadQuickSpecs() {
  if (!currentUser) {
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
        { label: "Tarjeta madre", value: findValue("Tarjeta madre") }
      ],
      currentServerMode === "online"
        ? "Resumen del dispositivo del usuario conectado."
        : "Resumen rapido del equipo actual."
    );
  } catch (error) {
    setStatus(
      quickSpecs,
      error instanceof Error ? error.message : "No se pudo cargar el resumen."
    );
  }
}

async function loadCurrentUser() {
  const token = getAuthToken();
  if (!token) {
    setLoggedInState(null);
    return;
  }

  try {
    const data = await authFetch("/api/me");
    setLoggedInState({
      email: data.email,
      displayName: data.displayName
    });
    await loadQuickSpecs();
    await loadChatMessages(true);
  } catch (error) {
    setAuthToken("");
    setLoggedInState(null);
  }
}

async function submitAuth(action) {
  if (!isServerMode()) {
    setAuthStatus(
      "Para usar login y base de datos abre SilentCyber con el servidor activo.",
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
    setAuthToken(data.token || "");
    passwordInput.value = "";
    setLoggedInState({
      email: data.email,
      displayName: data.displayName
    });
    await loadQuickSpecs();
    await loadChatMessages(true);
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

async function saveProfile(event) {
  event.preventDefault();

  if (!currentUser) {
    setProfileStatus("Debes iniciar sesion primero.", true);
    return;
  }

  const displayName = displayNameInput.value.trim();
  if (!displayName) {
    setProfileStatus("Debes escribir un nombre visible.", true);
    return;
  }

  saveProfileBtn.disabled = true;
  setProfileStatus("Guardando perfil...");

  try {
    const data = await sendJson(
      "/api/profile",
      { displayName },
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`
        }
      }
    );

    currentUser = {
      email: data.email,
      displayName: data.displayName
    };
    renderProfile(currentUser);
    setProfileStatus("Nombre actualizado correctamente.");
    await loadChatMessages(true);
  } catch (error) {
    setProfileStatus(
      error instanceof Error ? error.message : "No se pudo guardar el perfil.",
      true
    );
  } finally {
    saveProfileBtn.disabled = false;
  }
}

async function loadChatMessages(showStatus = false) {
  if (!currentUser) {
    chatMessages.classList.add("empty");
    chatMessages.textContent = "Inicia sesion para entrar al chat global.";
    return;
  }

  if (showStatus) {
    setChatStatus("Cargando chat global...");
  }

  try {
    const data = await authFetch("/api/chat/messages");
    renderChatMessages(data.messages || []);
    if (showStatus) {
      setChatStatus("Los mensajes se actualizan automaticamente.");
    }
  } catch (error) {
    setChatStatus(
      error instanceof Error ? error.message : "No se pudo cargar el chat.",
      true
    );
  }
}

async function sendChatMessage(event) {
  event.preventDefault();

  if (!currentUser) {
    setChatStatus("Debes iniciar sesion para usar el chat.", true);
    return;
  }

  const message = chatInput.value.trim();
  if (!message) {
    setChatStatus("Escribe un mensaje antes de enviarlo.", true);
    return;
  }

  sendChatBtn.disabled = true;
  setChatStatus("Enviando mensaje...");

  try {
    const data = await sendJson(
      "/api/chat/messages",
      { message },
      {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`
        }
      }
    );
    chatInput.value = "";
    renderChatMessages(data.messages || []);
    setChatStatus("Mensaje enviado.");
  } catch (error) {
    setChatStatus(
      error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
      true
    );
  } finally {
    sendChatBtn.disabled = false;
  }
}

deviceBtn.addEventListener("click", async () => {
  if (!currentUser) {
    setAuthStatus("Debes iniciar sesion antes de analizar el dispositivo.", true);
    return;
  }

  deviceBtn.disabled = true;
  setStatus(deviceInfo, "Analizando dispositivo...");

  try {
    const data = await getBestDeviceData();
    renderInfo(deviceInfo, data.items, data.note);
    await loadQuickSpecs();
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
  setAuthToken("");
  passwordInput.value = "";
  setLoggedInState(null);
});

profileForm.addEventListener("submit", saveProfile);
chatForm.addEventListener("submit", sendChatMessage);

if (!isServerMode()) {
  showServerHint();
}

const lastEmail = localStorage.getItem("silentCyberLastEmail");
if (lastEmail) {
  emailInput.value = lastEmail;
}

async function initializeApp() {
  await syncServerBadge();
  await loadCurrentUser();
}

initializeApp();
