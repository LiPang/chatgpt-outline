(() => {
  "use strict";
  const core = globalThis.ChatGPTOutlineCore;
  const form = document.getElementById("settings");
  const status = document.getElementById("status");
  const keys = Object.keys(core.defaults);
  let saveTimer = 0;

  function refreshLabels() {
    document.getElementById("previewLengthValue").textContent = document.getElementById("previewLength").value;
    document.getElementById("rightOffsetValue").textContent = document.getElementById("rightOffset").value + " px";
  }

  chrome.storage.local.get(core.defaults).then((stored) => {
    const settings = core.sanitizeSettings(stored);
    for (const key of keys) {
      const input = document.getElementById(key);
      if (input.type === "checkbox") input.checked = settings[key];
      else input.value = String(settings[key]);
    }
    refreshLabels();
  });

  function saveSettings() {
    clearTimeout(saveTimer);
    const value = {};
    for (const key of keys) {
      const input = document.getElementById(key);
      value[key] = input.type === "checkbox" ? input.checked : Number(input.value);
    }
    chrome.storage.local.set(core.sanitizeSettings(value)).then(() => { status.textContent = "Saved"; });
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", () => {
    refreshLabels();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 100);
  });
  form.addEventListener("change", saveSettings);
})();
