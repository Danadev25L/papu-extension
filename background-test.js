// Minimal test background script

console.log('[Background] Script loading...');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Background] Message received:', msg);

  if (msg?.type === "PING") {
    console.log('[Background] PING -> PONG');
    sendResponse({ pong: true, timestamp: Date.now() });
    return;
  }

  if (msg?.type === "FILL_SPECIFIC_TAB") {
    console.log('[Background] FILL_SPECIFIC_TAB received');
    sendResponse({ ok: true, filled: "test" });
    return;
  }
});

console.log('[Background] Script loaded successfully!');
