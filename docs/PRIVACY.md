# Privacy

ChatGPT Outline processes the conversation content already rendered in the active ChatGPT page to create a navigation outline.

- Conversation text stays in that page's memory. The extension does not transmit it or save it to extension storage.
- Only display preferences are stored using `chrome.storage.local`.
- The extension contains no analytics, background service, remote code, external API calls, or third-party runtime dependencies.
- Content scripts run only on `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- The only explicit extension permission is `storage`.
- Uninstalling the extension removes its local preferences through the browser's normal extension lifecycle.

All screenshots in this repository show fictional demonstration content. They contain no real conversation, account data, credentials, private email address, local machine path, or browser history.

This document describes the extension. ChatGPT and the browser have their own privacy policies.
