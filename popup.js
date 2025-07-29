let abortRequested = false;

// Fetch subdomains from crt.sh
async function fetchFromCrtSh(domain) {
  const encoded = encodeURIComponent(`%.${domain}`);
  const url = `https://crt.sh/?q=${encoded}&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("crt.sh failed");
  const data = await res.json();
  return data
    .map((entry) => entry.name_value)
    .flatMap((name) => name.split("\n"))
    .filter((name) => name.endsWith(domain));
}

// Fetch subdomains from hackertarget
async function fetchFromHackertarget(domain) {
  const url = `https://api.hackertarget.com/hostsearch/?q=${domain}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Hackertarget failed");
  const text = await res.text();
  return text
    .split("\n")
    .map((line) => line.split(",")[0])
    .filter((name) => name.endsWith(domain));
}

// Availability check with multiple fallbacks and 10s timeout
async function checkAvailability(url) {
  const timeout = 10000; // 10 seconds

  async function fetchWithTimeout(resource, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  // Try in order: HTTPS HEAD, HTTP HEAD, HTTPS GET, HTTP GET
  try {
    let res = await fetchWithTimeout("https://" + url, { method: "HEAD" });
    if (res.ok) return true;
  } catch {}

  try {
    let res = await fetchWithTimeout("http://" + url, { method: "HEAD" });
    if (res.ok) return true;
  } catch {}

  try {
    let res = await fetchWithTimeout("https://" + url, { method: "GET" });
    if (res.ok) return true;
  } catch {}

  try {
    let res = await fetchWithTimeout("http://" + url, { method: "GET" });
    if (res.ok) return true;
  } catch {}

  return false;
}

// Fetch WHOIS info
async function fetchWhoisInfo(domain) {
  const res = await fetch(`https://api.hackertarget.com/whois/?q=${domain}`);
  if (!res.ok) return "WHOIS lookup failed.";
  return await res.text();
}

// Fetch Passive DNS info
async function fetchPassiveDNS(domain) {
  const url = `https://api.hackertarget.com/dnslookup/?q=${domain}`;
  const res = await fetch(url);
  if (!res.ok) return "Passive DNS lookup failed.";
  return await res.text();
}

// Categorize subdomains by pattern
function categorizeSubdomains(subdomains, rootDomain) {
  const categories = {
    www: [],
    rootLevel: [],
    multiLevel: [],
  };

  subdomains.forEach((sub) => {
    if (sub.startsWith("www.")) {
      categories.www.push(sub);
    } else {
      const parts = sub.split(".");
      const rootParts = rootDomain.split(".");
      if (parts.length === rootParts.length + 1) {
        categories.rootLevel.push(sub);
      } else {
        categories.multiLevel.push(sub);
      }
    }
  });

  return categories;
}

// Restore saved data from chrome.storage.local
function restoreState() {
  chrome.storage.local.get(
    ["domain", "results", "availabilityCheck", "outputText"],
    (data) => {
      if (data.domain) {
        document.getElementById("domainInput").value = data.domain;
      }
      if (data.availabilityCheck !== undefined) {
        document.getElementById("availabilityToggle").checked = data.availabilityCheck;
      }
      if (data.results && data.outputText) {
        document.getElementById("result").innerText = data.outputText;
        document.getElementById("downloadBtn").classList.remove("hidden");
        downloadBtnSetup(data.domain, data.outputText);
      }
    }
  );
}

// Save state to chrome.storage.local
function saveState(domain, availabilityCheck, outputText) {
  chrome.storage.local.set({
    domain,
    availabilityCheck,
    outputText,
  });
}

function downloadBtnSetup(domain, outputText) {
  const downloadBtn = document.getElementById("downloadBtn");
  downloadBtn.onclick = () => {
    const blob = new Blob([outputText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${domain}_subdomains.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

document.getElementById("fetchBtn").addEventListener("click", async () => {
  abortRequested = false;

  const domain = document.getElementById("domainInput").value.trim();
  const resultBox = document.getElementById("result");
  const downloadBtn = document.getElementById("downloadBtn");
  const status = document.getElementById("status");
  const availabilityToggle = document.getElementById("availabilityToggle");
  const fetchBtn = document.getElementById("fetchBtn");
  const stopBtn = document.getElementById("stopBtn");

  resultBox.textContent = "";
  downloadBtn.classList.add("hidden");
  stopBtn.classList.remove("hidden");
  fetchBtn.disabled = true;
  status.textContent = "Fetching subdomains...";

  if (!domain) {
    status.textContent = "❌ Please enter a valid domain.";
    stopBtn.classList.add("hidden");
    fetchBtn.disabled = false;
    return;
  }

  try {
    const [crtSubs, hackSubs] = await Promise.all([
      fetchFromCrtSh(domain),
      fetchFromHackertarget(domain),
    ]);

    const combinedSet = new Set([...crtSubs, ...hackSubs]);
    const combined = Array.from(combinedSet);

    if (combined.length === 0) {
      status.textContent = "⚠️ No subdomains found.";
      stopBtn.classList.add("hidden");
      fetchBtn.disabled = false;
      return;
    }

    status.textContent = `✅ Found ${combined.length} unique subdomains.`;

    let results = combined.map((sub) => ({ sub, isUp: null }));
    let liveCount = 0;
    let deadCount = 0;

    if (availabilityToggle.checked) {
      status.textContent += " Checking availability...";

      const concurrency = 10;

      async function checkBatch(arr) {
        const promises = arr.map(async (sub) => {
          if (abortRequested) return { sub, isUp: null };
          try {
            const isUp = await checkAvailability(sub);
            return { sub, isUp };
          } catch {
            return { sub, isUp: false };
          }
        });
        return Promise.all(promises);
      }

      results = [];
      for (let i = 0; i < combined.length; i += concurrency) {
        if (abortRequested) break;

        const batch = combined.slice(i, i + concurrency);
        status.textContent = `Checking availability... (${Math.min(i + concurrency, combined.length)}/${combined.length})`;
        const batchResults = await checkBatch(batch);
        results = results.concat(batchResults);
      }

      liveCount = results.filter((r) => r.isUp).length;
      deadCount = results.filter((r) => r.isUp === false).length;

      if (abortRequested) {
        status.textContent = "⏹️ Scan stopped by user.";
      } else {
        status.textContent = "✅ Scan complete!";
      }
    } else {
      results = combined.map((sub) => ({ sub, isUp: null }));
      status.textContent = "✅ Scan complete! (Availability check skipped)";
    }

    const categories = categorizeSubdomains(combined, domain);

    const [passiveDNSRaw, whois] = await Promise.all([
      fetchPassiveDNS(domain),
      fetchWhoisInfo(domain),
    ]);

    const percentLive = combined.length > 0 ? ((liveCount / combined.length) * 100).toFixed(1) : "N/A";

    // Build output text for display and download
    let output = `Subdomain Scan Results for ${domain}\n\n`;

    output += `--- Stats ---\n`;
    output += `Total Subdomains: ${combined.length}\n`;
    if (availabilityToggle.checked) {
      output += `Live (🟢): ${liveCount}\n`;
      output += `Dead (🔴): ${deadCount}\n`;
      output += `Live Percentage: ${percentLive}%\n\n`;
    } else {
      output += `Availability check skipped.\n\n`;
    }

    function outputCategory(name, subs) {
      output += `${name} (${subs.length}):\n`;
      if (subs.length) {
        output +=
          subs
            .map((sub) => {
              if (!availabilityToggle.checked) return `${sub} [?]`;
              const isUp = results.find((r) => r.sub === sub)?.isUp;
              return `${sub} ${isUp ? "[UP]" : "[DOWN]"}`;
            })
            .join("\n") + "\n\n";
      } else {
        output += "None\n\n";
      }
    }

    outputCategory("WWW Subdomains", categories.www);
    outputCategory("Root Level Subdomains", categories.rootLevel);
    outputCategory("Multi-Level Subdomains", categories.multiLevel);

    output += `--- WHOIS Info ---\n${whois}\n\n`;
    output += `--- Passive DNS Lookup ---\n${passiveDNSRaw}\n\n`;
    output +=
      "Note: Deeper misconfiguration checks (S3, CORS, CNAME takeover) require backend support.\n";

    // Update result box with the same content
    resultBox.textContent = output;

    // Show download button and set it up
    downloadBtn.classList.remove("hidden");
    downloadBtnSetup(domain, output);

    // Save state so popup can restore if closed/reopened
    saveState(domain, availabilityToggle.checked, output);
  } catch (e) {
    status.textContent = "🚫 Error: " + e.message;
  } finally {
    document.getElementById("stopBtn").classList.add("hidden");
    document.getElementById("fetchBtn").disabled = false;
  }
});

document.getElementById("stopBtn").addEventListener("click", () => {
  abortRequested = true;
});

// On popup load, restore previous state
window.addEventListener("load", () => {
  restoreState();
});
