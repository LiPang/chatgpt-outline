"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require(process.env.OUTLINE_PLAYWRIGHT_MODULE || "playwright-core");

function fixture(layout) {
  const message = (role, body) => layout === "current"
    ? `<article><h4 class="sr-only" data-conversation-role="${role}">${role} said:</h4><div>${body}</div></article>`
    : `<article><div data-message-author-role="${role}">${body}</div></article>`;
  const conversation = (name) => message("user", `${name} question`)
    + message("assistant", `<h1>${name} overview</h1><p class="gap">Fictional demonstration.</p>
      <h2>${name} section</h2><p class="gap">Section explanation.</p>
      <h3 id="${name.toLowerCase()}-detail">${name} detail</h3><p class="gap">Detail explanation.</p>`);
  const conversations = { a: conversation("Alpha"), b: conversation("Beta"), c: conversation("Gamma"), new: conversation("New"), replacement: conversation("Replacement") };
  return `<!doctype html><html class="light"><head><meta charset="utf-8"><title>Fictional navigation test</title>
    <style>body{margin:0;font:17px/1.7 sans-serif}header{height:64px;padding:10px;box-sizing:border-box}
    header a,header button{margin:0 10px}#thread-scroll{position:fixed;inset:64px 0 0;overflow:auto}
    main{max-width:780px;margin:auto;padding:20px 100px 850px}.inactive{display:none}
    .gap{min-height:180px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>
    </head><body><header><a href="/c/alpha" data-chat="a">Alpha chat</a><a href="/c/beta" data-chat="b">Beta chat</a>
    <a href="/c/gamma" data-chat="c">Gamma chat</a><a href="/" data-chat="new">New chat</a>
    <button id="submit-example">Add example message</button><button id="replace-body">Replace page body</button></header>
    <div id="thread-scroll"><main id="chat-a">${conversations.a}</main>
    <main id="chat-b" class="inactive">${conversations.b}</main><main id="chat-c" class="inactive"></main>
    <main id="chat-new" class="inactive"></main></div><script>
    sessionStorage.setItem("fixtureLoads", String(Number(sessionStorage.getItem("fixtureLoads") || 0) + 1));
    const conversations = ${JSON.stringify(conversations)};
    function activate(id) {
      for (const main of document.querySelectorAll("main")) main.classList.toggle("inactive", main.id !== "chat-" + id);
      if (id === "c" && !document.getElementById("chat-c").childElementCount) {
        setTimeout(() => { document.getElementById("chat-c").innerHTML = conversations.c; }, 1400);
      }
    }
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-chat]");
      if (link) { event.preventDefault(); history.pushState({ chat: link.dataset.chat }, "", link.href); activate(link.dataset.chat); }
      if (event.target.id === "submit-example") {
        history.replaceState({ chat: "new" }, "", "/c/new-example");
        document.getElementById("chat-new").innerHTML = conversations.new;
      }
      if (event.target.id === "replace-body") {
        const body = document.createElement("body");
        body.innerHTML = '<header>Replaced application shell</header><div id="thread-scroll"><main></main></div>';
        document.body.replaceWith(body);
        setTimeout(() => { document.querySelector("main").innerHTML = conversations.replacement; }, 1400);
      }
    });
    addEventListener("popstate", (event) => activate(event.state?.chat || "a"));
    history.replaceState({ chat: "a" }, "", location.href);
    </script></body></html>`;
}

const layouts = process.env.OUTLINE_LAYOUT ? [process.env.OUTLINE_LAYOUT] : ["legacy", "current"];
for (const layout of layouts) {
  test(`Conversation navigation updates without reloading (${layout})`, { timeout: 60000 }, async (t) => {
    const extensionPath = process.env.OUTLINE_EXTENSION_PATH || path.resolve(__dirname, "../chatgpt-outline");
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), "outline-navigation-"));
    const context = await chromium.launchPersistentContext(profile, {
      channel: "msedge", headless: true, viewport: { width: 1440, height: 960 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run"]
    });
    t.after(async () => {
      await context.close();
      assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
      await fs.rm(profile, { recursive: true, force: true });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://chatgpt.com/**", (route) => route.fulfill({ contentType: "text/html", body: fixture(layout) }));
    await page.goto("https://chatgpt.com/c/alpha");
    const host = page.locator("#chatgpt-outline-extension");
    const nav = host.locator("nav");
    const primary = host.locator(".list");
    const button = (name) => host.getByRole("button", { name: "Heading: " + name, exact: true });
    const expectChat = async (name) => {
      await page.waitForFunction((name) => {
        const nav = document.getElementById("chatgpt-outline-extension")?.shadowRoot?.querySelector("nav");
        const buttons = nav?.querySelectorAll(".list button");
        return nav && !nav.hidden && buttons.length === 2
          && buttons[0].getAttribute("aria-label") === "Prompt 1: " + name + " question"
          && buttons[1].getAttribute("aria-label") === "Heading: " + name + " overview";
      }, name, { timeout: 5000 });
      assert.deepEqual(await primary.locator(".heading .label-text").allTextContents(), [name + " overview"]);
    };
    await expectChat("Alpha");
    await nav.hover();
    await page.waitForFunction(() => document.getElementById("chatgpt-outline-extension").shadowRoot.querySelector("nav").getBoundingClientRect().width >= 329);
    await button("Alpha overview").hover();
    await button("Alpha section").hover();
    assert.equal(await host.locator("#outline-level-3").isVisible(), true);

    await page.getByRole("link", { name: "Beta chat", exact: true }).click();
    await expectChat("Beta");
    assert.equal(await page.locator("main").count(), 4);
    assert.equal(await host.locator("#outline-level-2").isVisible(), false);
    assert.equal(await host.locator("#outline-level-3").isVisible(), false);
    assert.equal(await host.getByRole("button", { name: /Alpha/ }).count(), 0);

    await page.getByRole("link", { name: "Gamma chat", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("chatgpt-outline-extension").shadowRoot.querySelector("nav").hidden);
    await expectChat("Gamma");
    await page.goBack();
    await expectChat("Beta");
    await page.goBack();
    await expectChat("Alpha");
    await page.goForward();
    await expectChat("Beta");

    for (const name of ["Alpha", "Beta", "Alpha"]) {
      await page.getByRole("link", { name: name + " chat", exact: true }).click();
      await expectChat(name);
    }
    await page.getByRole("link", { name: "New chat", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("chatgpt-outline-extension").shadowRoot.querySelector("nav").hidden);
    assert.equal(await primary.locator("button").count(), 0);
    await page.getByRole("button", { name: "Add example message", exact: true }).click();
    await expectChat("New");

    await nav.hover();
    await page.waitForFunction(() => document.getElementById("chatgpt-outline-extension").shadowRoot.querySelector("nav").getBoundingClientRect().width >= 329);
    await button("New overview").hover();
    await button("New section").hover();
    await button("New detail").click();
    await page.waitForFunction(() => Math.abs(document.getElementById("new-detail").getBoundingClientRect().top - 160) < 6);

    await page.getByRole("button", { name: "Replace page body", exact: true }).click();
    await expectChat("Replacement");
    await page.evaluate(() => document.getElementById("chatgpt-outline-extension").remove());
    await expectChat("Replacement");
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem("fixtureLoads"))), 1);
    assert.equal(await page.locator("#chatgpt-outline-extension").count(), 1);
    assert.deepEqual(errors, []);
  });
}
