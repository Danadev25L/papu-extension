# Papu autofill (Chrome / Edge MV3)

**Location:** `app/extension/`

Fetches questions from the Papu database and fills forms on admin.pepu.krd when you click a question.

## Install

1. Open `chrome://extensions` (or Edge `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select the `app/extension` folder.

## Setup

### 1. Extension options: API URL

1. Right-click the extension icon → **Options** (or open from the popup link).
2. Under **Papu API connection**, set **API base URL**: `http://localhost:3001/api` (dev) or `https://pepumangment-backend.danabestun.dev/api` (prod).
3. Click **Save**.

### 2. admin.pepu.krd selectors

1. Open `https://admin.pepu.krd/Courses/Questions/Edit?courseId=28` in a tab.
2. In extension options, enter hostname `admin.pepu.krd`, click **Load admin.pepu.krd preset**, then **Save for this host**.
3. If filling fails, click **Debug: list fields** to see the form structure, then adjust selectors as needed.

## Usage

1. Open the **admin.pepu.krd** form page (keep it the active tab).
2. Click the extension icon.
3. Choose **Subject**, **Year**, and **Period**.
4. Click a question → it fills the form automatically.
5. Use **Fill next** for the next question.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest |
| `background.js` | Fill injection, auto-detect, debug |
| `popup.html/js/css` | Subject/year/period filters, question list |
| `options.html/js/css` | API config, per-host selectors |
