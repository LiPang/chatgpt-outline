(() => {
  "use strict";
  const hostId = "chatgpt-outline-extension";
  if (document.getElementById(hostId)) return;
  const core = globalThis.ChatGPTOutlineCore;
  let settings = { ...core.defaults };
  let entries = [];
  let buttons = [];
  let children = new Map();
  let activeIndex = -1;
  let rebuildTimer = 0;
  let activeFrame = 0;
  let closeTimer = 0;
  let expanded = false;
  let currentUrl = location.href;
  let observedMain = null;
  let forceRebuild = false;
  let restoringFocus = false;
  const branchParents = new Map([[2, -1], [3, -1]]);
  const panels = new Map();

  const host = document.createElement("div");
  host.id = hostId;
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483000;display:block;color-scheme:light dark;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    nav {
      --ink: #252525; --muted: #747474; --bar: #d3d3d3;
      --surface: #fff; --border: rgba(0,0,0,.07);
      position: fixed; right: 18px; top: 48%; transform: translateY(-50%);
      width: 36px; max-width: calc(100vw - 24px); padding: 12px 4px;
      pointer-events: auto; color: var(--ink); border: 1px solid transparent;
      border-radius: 20px; transition: width .16s ease, box-shadow .16s ease;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    nav[data-theme="dark"] { --ink: #f1f1f1; --muted: #aaa; --bar: #646464; --surface: #252525; --border: rgba(255,255,255,.12); }
    nav[data-expanded="true"] { width: 330px; padding: 12px 4px 12px 14px; background: var(--surface); border-color: var(--border); box-shadow: 0 10px 36px rgba(0,0,0,.09); }
    .list { max-height: min(68vh, 650px); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: none; }
    nav[data-expanded="true"] .list { scrollbar-width: thin; scrollbar-color: var(--bar) transparent; }
    .entry { all: unset; box-sizing: border-box; display: flex; width: 100%; min-height: var(--row-height,26px); align-items: center; gap: 10px; padding: 3px 4px; cursor: pointer; border-radius: 7px; }
    .entry.heading { min-height: var(--heading-height,20px); }
    .label { display: none; flex: 1; min-width: 0; overflow: hidden; overflow-wrap: anywhere; text-align: left; color: var(--muted); }
    .label-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .number { opacity: .65; font-size: 10px; margin-right: 7px; font-variant-numeric: tabular-nums; }
    .mark { display: block; width: 16px; height: 3px; margin-left: auto; flex-shrink: 0; border-radius: 4px; background: var(--bar); }
    .heading .mark { width: 10px; height: 2px; }
    .level-2 .mark { width: 8px; }
    .level-3 .mark { width: 6px; }
    .entry.current-group .mark { background: var(--muted); }
    .entry.active .mark, .entry:hover .mark, .entry.branch-open .mark, .entry:focus-visible .mark { background: var(--ink); }
    .entry.active .mark { width: 18px; }
    .heading.active .mark { width: 12px; }
    .entry.active .label, .entry:hover .label, .entry.branch-open .label { color: var(--ink); }
    .entry:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
    .disclosure { display: none; color: var(--muted); font-size: 12px; flex-shrink: 0; }
    nav[data-expanded="true"] .entry { min-height: 36px; padding: 7px 9px 7px 3px; }
    nav[data-expanded="true"] .label { display: block; }
    nav[data-expanded="true"] .heading { min-height: 30px; }
    nav[data-expanded="true"] .heading .label { padding-left: 17px; font-size: 12px; }
    nav[data-expanded="true"] .disclosure { display: block; }
    .entry:hover, .entry.branch-open { background: var(--border); }
    nav[data-expanded="false"] .entry { background: transparent; }
    .hint { display: none; padding: 2px 10px 9px 3px; color: var(--muted); font-size: 10px; letter-spacing: .02em; }
    nav[data-expanded="true"] .hint { display: block; }
    .branch-panel { position: absolute; z-index: 2; width: 260px; max-height: min(55vh,420px); padding: 7px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--bar) transparent; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: 0 10px 36px rgba(0,0,0,.12); }
    .branch-panel[data-level="3"] { z-index: 3; }
    .branch-panel .entry { min-height: 34px !important; padding: 8px !important; }
    .branch-panel .label { display: block; padding-left: 0 !important; font-size: 12px; }
    .branch-panel .disclosure { display: block; }
    @media (prefers-reduced-motion: reduce) { nav { transition: none; } }
    @media (max-width: 640px) { nav[data-expanded="true"] { width: min(310px, calc(100vw - 24px)); } }
  `;
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Conversation outline");
  nav.dataset.expanded = "false";
  nav.hidden = true;
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "CONVERSATION OUTLINE";
  const list = document.createElement("div");
  list.className = "list";
  nav.append(hint, list);
  for (const level of [2, 3]) {
    const panel = document.createElement("div");
    panel.className = "branch-panel";
    panel.id = "outline-level-" + level;
    panel.dataset.level = String(level);
    panel.setAttribute("role", "group");
    panel.hidden = true;
    panels.set(level, panel);
    nav.append(panel);
  }
  shadow.append(style, nav);
  document.documentElement.append(host);

  function paintActive() {
    const ancestors = new Set();
    let current = activeIndex;
    while (current >= 0 && entries[current]) {
      ancestors.add(current);
      current = entries[current].parentIndex;
    }
    let visibleCurrent = activeIndex;
    while (visibleCurrent >= 0 && !buttons[visibleCurrent]?.isConnected) visibleCurrent = entries[visibleCurrent].parentIndex;
    buttons.forEach((button, index) => {
      if (!entries[index]) return;
      button.classList.toggle("active", ancestors.has(index));
      button.classList.toggle("current-group", entries[index].kind === "prompt" && entries[index].group === entries[activeIndex]?.group);
      if (index === visibleCurrent) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    });
  }

  function closeBranches(fromLevel = 2) {
    for (let level = fromLevel; level <= 3; level += 1) {
      const parent = branchParents.get(level);
      if (parent >= 0 && buttons[parent]) {
        buttons[parent].setAttribute("aria-expanded", "false");
        buttons[parent].classList.remove("branch-open");
      }
      branchParents.set(level, -1);
      panels.get(level).hidden = true;
      panels.get(level).replaceChildren();
    }
    paintActive();
  }

  function positionBranches() {
    const navRect = nav.getBoundingClientRect();
    for (const level of [2, 3]) {
      const parent = branchParents.get(level);
      if (parent < 0) continue;
      const panel = panels.get(level);
      const anchor = buttons[parent].getBoundingClientRect();
      const reference = level === 2 ? navRect : panels.get(2).getBoundingClientRect();
      const width = Math.min(260, innerWidth - 24);
      panel.style.width = width + "px";
      panel.style.maxHeight = Math.min(innerHeight * .55, 420) + "px";
      let left = reference.left - width - 6;
      let top = Math.max(8, Math.min(anchor.top, innerHeight - panel.offsetHeight - 8));
      if (left < 8) {
        left = Math.max(8, Math.min(reference.left, innerWidth - width - 8));
        const below = innerHeight - anchor.bottom - 14;
        const above = anchor.top - 14;
        const openBelow = below >= panel.offsetHeight || below >= above;
        panel.style.maxHeight = Math.max(40, Math.min(openBelow ? below : above, innerHeight * .55, 420)) + "px";
        top = openBelow ? anchor.bottom + 6 : anchor.top - panel.offsetHeight - 6;
      }
      panel.style.left = left - navRect.left + "px";
      panel.style.top = top - navRect.top + "px";
    }
  }

  function openBranch(index) {
    const entry = entries[index];
    if (!entry || entry.kind === "prompt") { closeBranches(); return; }
    const nextLevel = entry.level + 1;
    if (nextLevel > 3) return;
    closeBranches(nextLevel + 1);
    const childIndices = children.get(index) || [];
    if (!childIndices.length) { closeBranches(nextLevel); return; }
    if (branchParents.get(nextLevel) !== index) {
      closeBranches(nextLevel);
      const panel = panels.get(nextLevel);
      panel.replaceChildren(...childIndices.map((child) => buttons[child]));
      panel.setAttribute("aria-label", core.truncate(entry.text, settings.previewLength));
      panel.hidden = false;
      panel.scrollTop = 0;
      branchParents.set(nextLevel, index);
      buttons[index].setAttribute("aria-expanded", "true");
      buttons[index].classList.add("branch-open");
    }
    positionBranches();
    paintActive();
  }

  function revealActive(index = activeIndex) {
    if (index < 0 || !entries[index]) return;
    while (entries[index].parentIndex >= 0) index = entries[index].parentIndex;
    const button = buttons[index];
    if (!button) return;
    const top = button.offsetTop - list.offsetTop;
    const bottom = top + button.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 30);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 30;
  }

  function setExpanded(value) {
    clearTimeout(closeTimer);
    if (!value) closeBranches();
    if (expanded === value) return;
    expanded = value;
    nav.dataset.expanded = String(value);
    const focusedIndex = buttons.indexOf(shadow.activeElement);
    revealActive(focusedIndex >= 0 ? focusedIndex : activeIndex);
    positionBranches();
  }

  function updateTheme() {
    const root = document.documentElement;
    const explicit = root.dataset.theme || root.getAttribute("data-color-mode");
    const dark = explicit === "dark" || root.classList.contains("dark") || (!explicit && !root.classList.contains("light") && matchMedia("(prefers-color-scheme: dark)").matches);
    nav.dataset.theme = dark ? "dark" : "light";
  }

  function updateActive() {
    activeFrame = 0;
    if (nav.hidden || !entries.length) return;
    const guide = Math.max(100, Math.min(180, innerHeight * .2));
    let next = 0;
    for (let index = 0; index < entries.length; index += 1) {
      if (entries[index].target.getBoundingClientRect().top <= guide) next = index;
      else break;
    }
    const lastTarget = entries[entries.length - 1].target;
    let scrollRoot = lastTarget.parentElement;
    while (scrollRoot && scrollRoot !== document.documentElement) {
      if (scrollRoot.scrollHeight > scrollRoot.clientHeight + 2 && /(auto|scroll|overlay)/u.test(getComputedStyle(scrollRoot).overflowY)) break;
      scrollRoot = scrollRoot.parentElement;
    }
    scrollRoot = scrollRoot && scrollRoot !== document.documentElement ? scrollRoot : document.scrollingElement;
    const bottom = scrollRoot === document.scrollingElement ? innerHeight : scrollRoot.getBoundingClientRect().bottom;
    if (scrollRoot.scrollHeight > scrollRoot.clientHeight + 2 && scrollRoot.scrollHeight - scrollRoot.clientHeight - scrollRoot.scrollTop <= 4 && lastTarget.getBoundingClientRect().top < bottom) next = entries.length - 1;
    if (next === activeIndex) return;
    activeIndex = next;
    paintActive();
    if (!expanded) revealActive();
  }

  function queueActive() { if (!activeFrame) activeFrame = requestAnimationFrame(updateActive); }

  function jump(index) {
    const entry = entries[index];
    if (!entry?.target.isConnected) { scheduleRebuild(); return; }
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = settings.smoothScroll && !reducedMotion ? "smooth" : "instant";
    const previousMargin = entry.target.style.scrollMarginTop;
    entry.target.style.scrollMarginTop = "96px";
    entry.target.scrollIntoView({ behavior, block: "start", inline: "nearest" });
    entry.target.style.scrollMarginTop = previousMargin;
    entry.target.animate([
      { outline: "2px solid transparent", outlineOffset: "8px" },
      { outline: "2px solid rgba(128,128,128,.5)", outlineOffset: "8px" },
      { outline: "2px solid transparent", outlineOffset: "8px" }
    ], { duration: reducedMotion ? 0 : 1000 }).finished.then(queueActive, queueActive);
    queueActive();
  }

  function rebuild() {
    rebuildTimer = 0;
    updateTheme();
    nav.hidden = !settings.enabled;
    if (!settings.enabled) { closeBranches(); return; }
    const main = document.querySelector("main") || document.body;
    if (main !== observedMain) {
      resizeObserver.disconnect(); resizeObserver.observe(main); observedMain = main;
    }
    const next = core.collectEntries(main, settings);
    nav.hidden = next.length === 0;
    const unchanged = !forceRebuild && next.length === entries.length && next.every((entry, index) => {
      const previous = entries[index];
      return entry.target === previous.target && entry.text === previous.text && entry.kind === previous.kind && entry.level === previous.level && entry.group === previous.group && entry.parentIndex === previous.parentIndex;
    });
    if (unchanged) { positionBranches(); queueActive(); return; }
    forceRebuild = false;
    const focusedTarget = entries[buttons.indexOf(shadow.activeElement)]?.target;
    const openTargets = [2, 3].map((level) => entries[branchParents.get(level)]?.target);
    closeBranches();
    entries = next; activeIndex = -1; buttons = []; children = new Map();
    entries.forEach((entry, index) => {
      if (entry.parentIndex < 0) return;
      if (!children.has(entry.parentIndex)) children.set(entry.parentIndex, []);
      children.get(entry.parentIndex).push(index);
    });
    const fragment = document.createDocumentFragment();
    entries.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "entry " + entry.kind + " level-" + entry.level;
      button.dataset.index = String(index);
      button.dataset.level = String(entry.level);
      const preview = core.truncate(entry.text, settings.previewLength);
      button.setAttribute("aria-label", (entry.kind === "prompt" ? "Prompt " + (entry.group + 1) : "Heading") + ": " + preview);
      const label = document.createElement("span");
      label.className = "label";
      const labelText = document.createElement("span");
      labelText.className = "label-text";
      if (entry.kind === "prompt") {
        const number = document.createElement("span");
        number.className = "number"; number.textContent = String(entry.group + 1).padStart(2, "0"); labelText.append(number);
      }
      labelText.append(document.createTextNode(preview)); label.append(labelText); button.append(label);
      if (children.has(index)) {
        const disclosure = document.createElement("span");
        disclosure.className = "disclosure"; disclosure.textContent = "‹"; disclosure.setAttribute("aria-hidden", "true");
        button.append(disclosure); button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "outline-level-" + (entry.level + 1));
      }
      const mark = document.createElement("span");
      mark.className = "mark"; mark.setAttribute("aria-hidden", "true"); button.append(mark);
      button.addEventListener("click", () => jump(index));
      button.addEventListener("pointerenter", () => { setExpanded(true); openBranch(index); });
      button.addEventListener("focus", () => { setExpanded(true); if (!restoringFocus) openBranch(index); });
      buttons.push(button);
      if (entry.parentIndex < 0) fragment.append(button);
    });
    list.replaceChildren(fragment);
    const available = Math.min(innerHeight * .68, 650);
    const unit = Math.max(9, Math.min(26, available / Math.max(1, list.children.length)));
    nav.style.setProperty("--row-height", unit + "px");
    nav.style.setProperty("--heading-height", Math.max(8, unit * .77) + "px");
    if (expanded) for (const target of openTargets) {
      const index = entries.findIndex((entry) => entry.target === target);
      if (index >= 0 && buttons[index].isConnected) openBranch(index);
    }
    const focusIndex = entries.findIndex((entry) => entry.target === focusedTarget);
    if (focusIndex >= 0 && buttons[focusIndex].isConnected) {
      restoringFocus = true;
      buttons[focusIndex].focus({ preventScroll: true });
      restoringFocus = false;
    }
    queueActive();
  }

  function scheduleRebuild() { if (!rebuildTimer) rebuildTimer = setTimeout(rebuild, 240); }

  function applySettings(value) {
    closeBranches(); settings = core.sanitizeSettings(value);
    nav.style.right = Math.min(settings.rightOffset, innerWidth < 640 ? 12 : 120) + "px";
    forceRebuild = true; rebuild();
  }

  nav.addEventListener("pointerenter", () => setExpanded(true));
  nav.addEventListener("pointerleave", () => {
    closeTimer = setTimeout(() => { if (!shadow.activeElement?.matches(":focus-visible")) setExpanded(false); }, 180);
  });
  nav.addEventListener("focusin", () => setExpanded(true));
  nav.addEventListener("focusout", () => {
    closeTimer = setTimeout(() => { if (!nav.contains(shadow.activeElement) && !nav.matches(":hover")) setExpanded(false); }, 100);
  });
  nav.addEventListener("transitionend", positionBranches);
  list.addEventListener("scroll", () => { if (expanded) closeBranches(); });
  panels.get(2).addEventListener("scroll", () => closeBranches(3));
  nav.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { shadow.activeElement?.blur(); setExpanded(false); return; }
    const index = buttons.indexOf(shadow.activeElement);
    if (index < 0) return;
    const childIndices = children.get(index) || [];
    if (event.key === "ArrowRight" && childIndices.length) { event.preventDefault(); openBranch(index); buttons[childIndices[0]].focus(); return; }
    if (event.key === "ArrowLeft" && entries[index].parentIndex >= 0) { event.preventDefault(); buttons[entries[index].parentIndex].focus(); return; }
    const siblings = entries[index].parentIndex < 0
      ? entries.map((entry, item) => entry.parentIndex < 0 ? item : -1).filter((item) => item >= 0)
      : children.get(entries[index].parentIndex);
    const position = siblings.indexOf(index);
    const destination = event.key === "ArrowDown" ? Math.min(siblings.length - 1, position + 1)
      : event.key === "ArrowUp" ? Math.max(0, position - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? siblings.length - 1 : -1;
    if (destination >= 0) { event.preventDefault(); buttons[siblings[destination]].focus(); }
  });

  const resizeObserver = new ResizeObserver(() => { queueActive(); scheduleRebuild(); });
  const observer = new MutationObserver((records) => { if (records.some((record) => !host.contains(record.target))) scheduleRebuild(); });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-message-author-role", "data-conversation-role", "data-testid", "hidden", "aria-hidden", "aria-level"] });
  new MutationObserver(updateTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-color-mode"] });
  document.addEventListener("scroll", queueActive, { passive: true, capture: true });
  window.addEventListener("resize", () => {
    nav.style.right = Math.min(settings.rightOffset, innerWidth < 640 ? 12 : 120) + "px";
    closeBranches(); scheduleRebuild(); queueActive();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateTheme);
  setInterval(() => {
    if (!host.isConnected) document.documentElement.append(host);
    if (location.href !== currentUrl) { currentUrl = location.href; list.scrollTop = 0; setExpanded(false); scheduleRebuild(); }
  }, 900);
  chrome.storage.local.get(core.defaults).then(applySettings);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = { ...settings };
    for (const key of Object.keys(core.defaults)) if (changes[key]) next[key] = changes[key].newValue ?? core.defaults[key];
    applySettings(next);
  });
})();
