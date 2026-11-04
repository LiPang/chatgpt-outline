(() => {
  "use strict";

  const defaults = Object.freeze({
    enabled: true,
    showHeadings: true,
    previewLength: 80,
    rightOffset: 18,
    smoothScroll: true
  });

  const normalize = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const truncate = (value, limit) => {
    const characters = Array.from(normalize(value));
    return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : characters.join("");
  };

  function sanitizeSettings(value = {}) {
    const clamp = (input, fallback, minimum, maximum) => {
      const number = Number(input);
      return Number.isFinite(number) ? Math.round(Math.max(minimum, Math.min(maximum, number))) : fallback;
    };
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
      showHeadings: typeof value.showHeadings === "boolean" ? value.showHeadings : defaults.showHeadings,
      previewLength: clamp(value.previewLength ?? defaults.previewLength, defaults.previewLength, 30, 160),
      rightOffset: clamp(value.rightOffset ?? defaults.rightOffset, defaults.rightOffset, 8, 120),
      smoothScroll: typeof value.smoothScroll === "boolean" ? value.smoothScroll : defaults.smoothScroll
    };
  }

  function isNumberedHeading(value, emphasized = false) {
    const text = normalize(value);
    if (!text || Array.from(text).length > 90) return false;
    const chineseNumber = "[一二三四五六七八九十百千万零〇两]+";
    const chinesePrefix = new RegExp("^(?:" + chineseNumber + "[、．.：:]|[（(]" + chineseNumber + "[）)]|第[一二三四五六七八九十百千万零〇两0-9]+(?:部分|篇|章|节)[：:、.．]?)\\s*", "u");
    const numericPrefix = /^(?:\d{1,2}[.、．)](?!\d)|\d{1,2}(?:\.\d{1,2}){1,3}[.、．:]?\s)\s*/u;
    const prefix = text.match(chinesePrefix) || (emphasized ? text.match(numericPrefix) : null);
    // A paragraph needs a title beyond its numbering and punctuation.
    return prefix !== null && /[\p{L}\p{N}]/u.test(text.slice(prefix[0].length));
  }

  function isRendered(element) {
    return !element.closest('[hidden], [aria-hidden="true"], [inert]') && element.getClientRects().length > 0;
  }

  function readPrompt(message) {
    const content = message.querySelector('[data-testid="user-message"], .whitespace-pre-wrap');
    const text = normalize((content || message).innerText);
    if (text) return text;
    if (message.querySelector('img, video, canvas, [data-testid*="attachment"]')) return "Attachment message";
    return "Message";
  }

  function headingNumber(value) {
    const text = normalize(value);
    const chinese = "[一二三四五六七八九十百千万零〇两]+";
    if (new RegExp("^第(?:" + chinese + "|[0-9]+)(?:部分|篇|章)(?:[：:、.．\\s]|$)", "u").test(text)) return { kind: "part" };
    const section = text.match(new RegExp("^(" + chinese + ")[、．.：:]", "u"));
    if (section) return { kind: "section", value: section[1] };
    if (new RegExp("^[（(]" + chinese + "[）)]", "u").test(text)) return { kind: "subsection" };
    const numeric = text.match(/^(\d{1,2}(?:\.\d{1,2})*)(?:[.、．):：\s]|$)/u);
    if (numeric) return { kind: "numeric", parts: numeric[1].split(".") };
    return null;
  }

  function inferHeadingLevels(headings, partHeadersAsRoot = true) {
    const tagged = headings.map((heading) => ({ ...heading, numbering: headingNumber(heading.text) }));
    const semanticLevels = tagged.filter((heading) => heading.sourceLevel !== null).map((heading) => heading.sourceLevel);
    const baseLevel = semanticLevels.length ? Math.min(...semanticLevels) : 1;
    const hasParts = tagged.some((heading) => heading.numbering?.kind === "part");
    const hasSections = tagged.some((heading) => heading.numbering?.kind === "section");
    const sectionLevel = hasParts && partHeadersAsRoot ? 2 : 1;
    const firstNumeric = tagged.find((heading) => heading.numbering?.kind === "numeric");
    const numericBase = firstNumeric?.sourceLevel !== null && firstNumeric?.sourceLevel !== undefined
      ? Math.max(1, firstNumeric.sourceLevel - baseLevel + 2 - firstNumeric.numbering.parts.length) : 1;
    let previous = null;
    return tagged.map((heading) => {
      const numbering = heading.numbering;
      let level = heading.sourceLevel === null ? 1 : heading.sourceLevel - baseLevel + 1;
      if (numbering?.kind === "part") level = partHeadersAsRoot ? 1 : 0;
      else if (numbering?.kind === "section") level = sectionLevel;
      else if (numbering?.kind === "subsection") level = sectionLevel + 1;
      else if (numbering?.kind === "numeric") {
        const depth = numbering.parts.length;
        if (hasSections) level = depth === 1 ? sectionLevel + 1 : sectionLevel + depth - 1;
        else if (hasParts) level = (partHeadersAsRoot ? 1 : 0) + depth;
        else level = numericBase + depth - 1;
      } else if (heading.sourceLevel !== null && previous) {
        level = Math.max(1, previous.level + heading.sourceLevel - previous.sourceLevel);
      }
      previous = { level, sourceLevel: heading.sourceLevel ?? baseLevel + level - 1 };
      return { text: heading.text, level, target: heading.target };
    }).filter((heading) => heading.level >= 1 && heading.level <= 3);
  }

  function extractHeadings(message) {
    const result = [];
    const candidates = message.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], p');
    for (const element of candidates) {
      if (element.hasAttribute("data-conversation-role") || element.classList.contains("sr-only")) continue;
      if (!isRendered(element) || element.closest('pre, code, blockquote, table')) continue;
      const text = normalize(element.innerText);
      const semantic = /^H[1-6]$/u.test(element.tagName) || element.getAttribute("role") === "heading";
      if (!text || (!semantic && element.closest("li"))) continue;
      if (!semantic && Array.from(text).length > 90) continue;
      const emphasis = Array.from(element.querySelectorAll('strong, b')).some((child) => normalize(child.innerText) === text);
      if (!semantic && !isNumberedHeading(text, emphasis)) continue;
      if (result.some((item) => item.target.contains(element))) continue;
      const sourceLevel = semantic ? Math.max(1, Math.min(6, Number(element.getAttribute("aria-level") || element.tagName.slice(1)) || 2)) : null;
      result.push({ text, sourceLevel, target: element });
    }
    return inferHeadingLevels(result);
  }

  function collectEntries(root, settings) {
    const entries = [];
    let group = -1;
    const markerSelector = '[data-message-author-role="user"], [data-message-author-role="assistant"], [data-conversation-role="user"], [data-conversation-role="assistant"]';
    const markers = root.querySelectorAll(markerSelector);
    const seen = new Set();
    for (const marker of markers) {
      if (marker.parentElement?.closest(markerSelector)) continue;
      const role = marker.getAttribute("data-message-author-role") || marker.getAttribute("data-conversation-role");
      const isRoleHeading = /^H[1-6]$/u.test(marker.tagName) || marker.getAttribute("role") === "heading";
      const message = isRoleHeading ? marker.nextElementSibling : marker;
      if (!message || seen.has(message)) continue;
      seen.add(message);
      if (!isRendered(message)) continue;
      if (role === "user") {
        group += 1;
        const text = readPrompt(message);
        entries.push({ kind: "prompt", group, level: 0, parentIndex: -1, text, target: message });
      } else if (settings.showHeadings && group >= 0) {
        const parents = new Map();
        for (const heading of extractHeadings(message)) {
          const parentIndex = heading.level === 1 ? -1 : parents.get(heading.level - 1);
          if (parentIndex === undefined) continue;
          parents.set(heading.level, entries.length);
          for (let level = heading.level + 1; level <= 3; level += 1) parents.delete(level);
          entries.push({ kind: "heading", group, parentIndex, ...heading });
        }
      }
    }
    return entries;
  }

  globalThis.ChatGPTOutlineCore = Object.freeze({ defaults, normalize, truncate, sanitizeSettings, isNumberedHeading, inferHeadingLevels, collectEntries });
})();
