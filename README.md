# 🌐 Subdomain Finder Extension 🔍

**A powerful Chrome extension to find and analyze subdomains using public threat intelligence sources like `crt.sh` and `HackerTarget`.**

This tool helps penetration testers, bug bounty hunters, and developers identify subdomains for any domain quickly — along with optional availability checks, categorization, passive DNS data, and WHOIS info.


---

## 🚀 Features

- ✅ Fetches subdomains from:
  - [crt.sh](https://crt.sh/)
  - [HackerTarget](https://hackertarget.com/)
- ⚡ Optionally checks **subdomain availability** with multiple HTTP/HTTPS fallbacks.
- 🧠 Categorizes subdomains into:
  - `www.`
  - Root-level (`api.example.com`)
  - Multi-level (`dev.api.example.com`)
- 📄 Provides:
  - WHOIS Information
  - Passive DNS Lookup
- 💾 Export full results as a `.txt` file.
- 🔁 Remembers last scan inputs and results via `chrome.storage`.

---

## 🧩 How to Install (Manual)

1. **Clone or download this repository**:
    ```bash
    git clone https://github.com/mohTalib/advanced-subdomain-finder.git
    ```

2. **Open Chrome** and go to:
    ```
    chrome://extensions
    ```

3. Enable **Developer mode** (top right).

4. Click **“Load unpacked”** and select the project folder.

5. You’ll now see the extension in your browser toolbar!

---

## 🛠️ Usage

1. Click on the extension icon.
2. Enter a domain (e.g., `example.com`).
3. (Optional) Keep the "Check Subdomain Availability" toggle on.
4. Click **"Find Subdomains"**.
5. View results inside the popup or click **Download** to save them.

---

## 📂 Project Structure

```
    subdomain-finder/
    ├── manifest.json # Chrome extension config
    ├── popup.html # UI layout with TailwindCSS
    ├── popup.js # Logic for fetching, scanning, displaying
    ├── icon.png # Toolbar icon (add this manually)

```
---

## 🔐 Permissions

The following URLs are used (declared in `manifest.json`):

- `https://crt.sh/*` – for certificate transparency data
- `https://api.hackertarget.com/*` – for subdomain, DNS, and WHOIS lookups

---

## 🧪 Tech Stack

- **Vanilla JS** (no frameworks)
- **TailwindCSS** for styling
- **Chrome Extension Manifest v3**
- Uses `fetch()` for all API calls
- Local state stored with `chrome.storage.local`

---

## 🛑 Limitations

- May hit rate limits on `crt.sh` or `hackertarget.com`
- Deeper security tests (e.g. S3 bucket exposure, CORS misconfig) not supported in-browser due to CORS/sandboxing
- No backend — all logic runs in the popup itself

---