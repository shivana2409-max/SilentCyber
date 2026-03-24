const deviceBtn = document.getElementById("deviceBtn");
const deviceInfo = document.getElementById("deviceInfo");
const serverHint = document.getElementById("serverHint");
const serverBadge = document.getElementById("serverBadge");
const serverBadgeValue = document.getElementById("serverBadgeValue");
const profileDock = document.getElementById("profileDock");
const profileDockAvatar = document.getElementById("profileDockAvatar");
const profileDockName = document.getElementById("profileDockName");
const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");
const accountReminder = document.getElementById("accountReminder");
const quickSpecs = document.getElementById("quickSpecs");
const appLock = document.getElementById("appLock");
const deviceSection = document.getElementById("deviceSection");
const communitySection = document.getElementById("communitySection");
const profileInfo = document.getElementById("profileInfo");
const profileForm = document.getElementById("profileForm");
const displayNameInput = document.getElementById("displayNameInput");
const avatarInput = document.getElementById("avatarInput");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileStatus = document.getElementById("profileStatus");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatStatus = document.getElementById("chatStatus");

let currentServerMode = "local";
let currentUser = null;
let pendingAvatarData = null;
let chatPollId = null;
let chatErrorTimerId = null;

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

function saveAccountReminder(user) {
  if (!user) {
    return;
  }

  localStorage.setItem(
    "silentCyberRememberedAccount",
    JSON.stringify({
      email: user.email,
      userNumber: user.userNumber,
      displayName: user.displayName
    })
  );
}

function renderAccountReminder() {
  if (!accountReminder) {
    return;
  }

  const raw = localStorage.getItem("silentCyberRememberedAccount");
  if (!raw) {
    accountReminder.textContent = "No hay cuenta recordada todavia.";
    return;
  }

  try {
    const remembered = JSON.parse(raw);
    accountReminder.textContent =
      `Cuenta recordada: ${remembered.displayName} (Usuario #${remembered.userNumber}) - ${remembered.email}`;
  } catch (error) {
    accountReminder.textContent = "No hay cuenta recordada todavia.";
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

function getAvatarText(name) {
  const cleaned = (name || "SC").replace(/[^a-z0-9]/gi, "");
  return cleaned.slice(0, 2).toUpperCase() || "SC";
}

function renderAvatarMarkup(user, extraClass = "") {
  const classes = ["avatar", extraClass].filter(Boolean).join(" ");

  if (user?.avatarData) {
    return `<span class="${classes}"><img src="${escapeHtml(user.avatarData)}" alt="Avatar"></span>`;
  }

  return `<span class="${classes}">${escapeHtml(getAvatarText(user?.displayName))}</span>`;
}

function chunkLongWord(word, maxChars) {
  if (word.length <= maxChars) {
    return [word];
  }

  const parts = [];

  for (let index = 0; index < word.length; index += maxChars) {
    parts.push(word.slice(index, index + maxChars));
  }

  return parts;
}

function wrapMessageText(message, maxCharsPerLine = 32) {
  const text = String(message || "").replace(/\r\n/g, "\n");
  const paragraphs = text.split("\n");

  return paragraphs
    .map((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);

      if (!words.length) {
        return "";
      }

      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const safeWordParts = chunkLongWord(word, maxCharsPerLine);

        for (const part of safeWordParts) {
          if (!currentLine) {
            currentLine = part;
            continue;
          }

          if ((currentLine + " " + part).length <= maxCharsPerLine) {
            currentLine += " " + part;
            continue;
          }

          lines.push(currentLine);
          currentLine = part;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines.join("\n");
    })
    .join("\n");
}

function hasWordOverLimit(message, maxLength = 15) {
  return String(message || "")
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").length > maxLength);
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

function clearChatErrorState() {
  if (chatErrorTimerId) {
    window.clearTimeout(chatErrorTimerId);
    chatErrorTimerId = null;
  }

  chatInput.classList.remove("field-error");
}

function flashChatError(message, clearMessage = false) {
  clearChatErrorState();
  setChatStatus(message, true);
  chatInput.classList.add("field-error");

  if (clearMessage) {
    chatInput.value = "";
  }

  chatErrorTimerId = window.setTimeout(() => {
    chatInput.classList.remove("field-error");
    setChatStatus("");
    chatErrorTimerId = null;
  }, 3000);
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

function syncProfileDock(user) {
  if (!user) {
    profileDock.hidden = true;
    profileDockName.textContent = "";
    profileDockAvatar.innerHTML = "SC";
    return;
  }

  profileDock.hidden = false;
  profileDockName.textContent = user.displayName || "anonimo";
  profileDockAvatar.innerHTML = user.avatarData
    ? `<img src="${escapeHtml(user.avatarData)}" alt="Avatar">`
    : escapeHtml(getAvatarText(user.displayName));
}

function renderProfile(user) {
  if (!user) {
    profileInfo.classList.add("empty");
    profileInfo.textContent = "Inicia sesion para cargar tu perfil.";
    displayNameInput.value = "";
    return;
  }

  profileInfo.classList.remove("empty");
  profileInfo.innerHTML = `
    <div class="profile-summary">
      ${renderAvatarMarkup(user, "avatar-large")}
      <div class="profile-meta">
        <strong>${escapeHtml(user.displayName)}</strong>
        <span class="note">Usuario #${escapeHtml(user.userNumber)}</span>
        <span class="note">${escapeHtml(user.email)}</span>
      </div>
    </div>
  `;
  displayNameInput.value = user.displayName || "";
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
          ${renderAvatarMarkup(
            { displayName: message.display_name, avatarData: message.avatar_data || "" },
            ""
          )}
          <div class="chat-body">
            <div class="chat-header">
              <strong class="chat-name">${escapeHtml(message.display_name)}</strong>
              <span class="chat-meta">${escapeHtml(formatDate(message.created_at))}</span>
            </div>
            <div class="chat-text">${escapeHtml(wrapMessageText(message.message, 32))}</div>
          </div>
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
  syncProfileDock(currentUser);

  if (isLoggedIn) {
    emailInput.value = currentUser.email;
    localStorage.setItem("silentCyberLastEmail", currentUser.email);
    saveAccountReminder(currentUser);
    renderAccountReminder();
    setAuthStatus(`Sesion iniciada como ${currentUser.displayName}.`);
    renderProfile(currentUser);
    setProfileStatus("Puedes cambiar tu nombre visible y tu foto.");
    setChatStatus("Los mensajes se actualizan automaticamente.");
    startChatPolling();
  } else {
    renderAccountReminder();
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
      userNumber: data.userNumber,
      displayName: data.displayName,
      avatarData: data.avatarData || ""
    });
    await loadQuickSpecs();
    await loadChatMessages(true);
  } catch (error) {
    setAuthToken("");
    setLoggedInState(null);
    setAuthStatus(
      error instanceof Error ? error.message : "No se pudo restaurar la sesion.",
      true
    );
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
    pendingAvatarData = null;
    if (avatarInput) {
      avatarInput.value = "";
    }
    setLoggedInState({
      email: data.email,
      userNumber: data.userNumber,
      displayName: data.displayName,
      avatarData: data.avatarData || ""
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

async function handleAvatarSelection() {
  const file = avatarInput.files?.[0];
  if (!file) {
    pendingAvatarData = null;
    return;
  }

  if (file.size > 700 * 1024) {
    avatarInput.value = "";
    pendingAvatarData = null;
    setProfileStatus("La foto debe pesar menos de 700 KB.", true);
    return;
  }

  try {
    pendingAvatarData = await readFileAsDataUrl(file);
    setProfileStatus("Foto lista para guardar.");
  } catch (error) {
    pendingAvatarData = null;
    setProfileStatus(
      error instanceof Error ? error.message : "No se pudo cargar la foto.",
      true
    );
  }
}

async function saveProfile(event) {
  event.preventDefault();

  if (!currentUser) {
    setProfileStatus("Debes iniciar sesion primero.", true);
    return;
  }

  const displayName = displayNameInput.value.trim();
  saveProfileBtn.disabled = true;
  setProfileStatus("Guardando perfil...");

  try {
    const payload = { displayName };
    if (pendingAvatarData !== null) {
      payload.avatarData = pendingAvatarData;
    }

    const data = await sendJson(
      "/api/profile",
      payload,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`
        }
      }
    );

    currentUser = {
      email: data.email,
      userNumber: data.userNumber,
      displayName: data.displayName,
      avatarData: data.avatarData || ""
    };
    pendingAvatarData = null;
    avatarInput.value = "";
    syncProfileDock(currentUser);
    renderProfile(currentUser);
    setAuthStatus(`Sesion iniciada como ${currentUser.displayName}.`);
    setProfileStatus("Perfil actualizado correctamente.");
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

  if (hasWordOverLimit(message, 15)) {
    flashChatError("No puedes enviar palabras de mas de 15 letras.", true);
    return;
  }

  sendChatBtn.disabled = true;
  clearChatErrorState();
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
    const messageText = error instanceof Error ? error.message : "No se pudo enviar el mensaje.";
    const shouldFlash =
      /palabras? de mas de 15 letras/i.test(messageText) ||
      /mensaje no esta permitido/i.test(messageText);

    if (shouldFlash) {
      flashChatError(messageText, true);
    } else {
      setChatStatus(messageText, true);
    }
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
  pendingAvatarData = null;
  passwordInput.value = "";
  avatarInput.value = "";
  setLoggedInState(null);
});

profileForm.addEventListener("submit", saveProfile);
avatarInput.addEventListener("change", handleAvatarSelection);
chatForm.addEventListener("submit", sendChatMessage);

profileDock.addEventListener("click", () => {
  communitySection.scrollIntoView({ behavior: "smooth", block: "start" });
  displayNameInput.focus();
});

if (!isServerMode()) {
  showServerHint();
}

const lastEmail = localStorage.getItem("silentCyberLastEmail");
if (lastEmail) {
  emailInput.value = lastEmail;
}

renderAccountReminder();

async function initializeApp() {
  await syncServerBadge();
  await loadCurrentUser();
}

initializeApp();
