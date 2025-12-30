// /public/scripts/thor-report.js
(function () {
  // -------- Preflight helpers --------
  function detectIframe() {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  }

  function geolocationPolicyAllowed() {
    try {
      if (document.permissionsPolicy?.allowsFeature) {
        return document.permissionsPolicy.allowsFeature("geolocation");
      }
      if (document.featurePolicy?.allowsFeature) {
        return document.featurePolicy.allowsFeature("geolocation");
      }
    } catch {}
    // If unknown, assume allowed so we can try and surface an error if not.
    return true;
  }

  async function getGeoPermissionState() {
    if (
      !("permissions" in navigator) ||
      typeof navigator.permissions.query !== "function"
    ) {
      return "unknown"; // Safari and older browsers
    }
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state; // "granted" | "denied" | "prompt"
    } catch {
      return "unknown";
    }
  }

  async function preflightGeolocation(COPY) {
    if (!("geolocation" in navigator)) {
      return {
        ok: false,
        reason:
          COPY?.errors?.unsupported ||
          "Geolocation not supported by this browser.",
      };
    }
    if (!window.isSecureContext) {
      return {
        ok: false,
        reason: "Geolocation requires HTTPS (or localhost during development).",
      };
    }
    if (detectIframe() && !geolocationPolicyAllowed()) {
      return {
        ok: false,
        reason:
          "This page is embedded without geolocation permission (iframe/Permissions-Policy). The parent page must allow it.",
      };
    }
    const state = await getGeoPermissionState();
    if (state === "denied") {
      return {
        ok: false,
        reason:
          COPY?.errors?.permissionDenied ||
          "Location permission is blocked for this site. Enable it in your browser/site settings.",
      };
    }
    return { ok: true };
  }

  // -------- Component wiring --------
  function initThorReport() {
    const root = document.querySelector('[data-js="thor-report"]');
    if (!root) return;
    // Avoid double-binding if Astro reuses DOM
    if (root.__thorBound) return;
    root.__thorBound = true;

    let COPY = {};
    try {
      const raw = root.getAttribute("data-copy");
      if (raw) COPY = JSON.parse(raw);
    } catch (e) {
      console.warn("ThorReport: failed to parse data-copy JSON", e);
    }

    const select = (name, fallback) =>
      root.querySelector(`[data-js="${name}"]`) ||
      (fallback ? root.querySelector(fallback) : null);

    const locInput = select("location", "#location");
    const phoneInput = select("phone", "#phone");
    const msgInput = select("message", "#message");
    const hpInput = select("honeypot", "#website");
    const statusEl = select("status", "#status");
    const btnUseLoc = select("use-location", "#use-location");
    const btnClear = select("clear-location", "#clear-location");
    const btnSubmit = select("submit", "#submit");
    const locStatus = select("loc-status", "#loc-status");

    let coords = null;

    const format = (str, params = {}) =>
      String(str).replace(
        /\{(\w+)\}/g,
        (_, key) => params[key] ?? (params[key] === 0 ? 0 : ""),
      );

    function setStatus(text, kind = "info") {
      if (!(statusEl instanceof HTMLElement)) return;
      const color =
        kind === "ok"
          ? "text-green-700"
          : kind === "err"
            ? "text-red-700"
            : "text-slate-700";
      statusEl.className = `mt-2 text-center text-sm sm:text-base ${color}`;
      statusEl.textContent = text;
    }

    function setButtonsDisabled(disabled) {
      if (btnUseLoc instanceof HTMLButtonElement) {
        btnUseLoc.disabled = disabled;
        btnUseLoc.toggleAttribute("aria-busy", disabled);
      }
      if (btnSubmit instanceof HTMLButtonElement) {
        btnSubmit.disabled = disabled;
        btnSubmit.toggleAttribute("aria-busy", disabled);
      }
    }

    function parseLatLon(str) {
      if (!str) return null;
      const match = String(str)
        .trim()
        .replace(/\s+/g, "")
        .match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (!match) return null;
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return { lat, lon };
    }

    function sanitizePhone(raw) {
      if (!raw) return "";
      const cleaned = raw.replace(/[^+\d]/g, "");
      if (!/^\+?\d{7,16}$/.test(cleaned)) return "";
      return cleaned;
    }

    function updateLocStatus() {
      if (!(locStatus instanceof HTMLElement)) return;
      if (!coords) {
        locStatus.textContent = COPY.status?.notSet ?? "";
        return;
      }
      const accuracy = coords.accuracy
        ? format(COPY.status?.accuracy ?? "", {
            meters: Math.round(coords.accuracy),
          })
        : "";
      const lat = coords.lat.toFixed(5);
      const lon = coords.lon.toFixed(5);
      const mapAria = COPY.mapAria ?? "Open in map";
      const openMap = COPY.status?.openMap ?? "Open map";
      const prefix = COPY.status?.usingPrefix ?? "";
      locStatus.innerHTML = `${prefix} <b>${lat}, ${lon}</b>${accuracy} — <a class="underline text-amber-600" target="_blank" rel="noreferrer" href="https://maps.google.com/?q=${coords.lat},${coords.lon}" aria-label="${mapAria}">${openMap}</a>`;
      if (locInput instanceof HTMLInputElement) {
        locInput.value = `${coords.lat},${coords.lon}`;
      }
    }

    async function requestLocationWithTimeout(timeout = 20000) {
      if (!("geolocation" in navigator)) {
        const error = new Error(
          COPY.errors?.unsupported ?? "Geolocation not supported",
        );
        error.code = "UNSUPPORTED";
        throw error;
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const error = new Error(COPY.errors?.timeout ?? "Request timed out");
          error.code = "TIMEOUT";
          reject(error);
        }, timeout);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            resolve(pos);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
          { enableHighAccuracy: false, maximumAge: 0, timeout },
        );
      });
    }

    // --- Use Location ---
    if (btnUseLoc instanceof HTMLButtonElement) {
      btnUseLoc.onclick = async () => {
        setStatus("");
        setButtonsDisabled(true);
        if (locStatus instanceof HTMLElement) {
          locStatus.textContent =
            COPY.status?.requesting ?? "Requesting location…";
        }

        try {
          // Preflight checks for HTTPS, iframe, policy and prior denial
          const pre = await preflightGeolocation(COPY);
          if (!pre.ok) {
            setStatus(pre.reason, "err");
            return;
          }

          // Best-effort: check Permissions API again right before requesting
          try {
            if (
              navigator.permissions &&
              typeof navigator.permissions.query === "function"
            ) {
              const perm = await navigator.permissions.query({
                name: "geolocation",
              });
              if (perm.state === "denied") {
                const e = new Error(
                  COPY?.errors?.permissionDenied ?? "Permission denied",
                );
                e.code = "PERMISSION_DENIED";
                throw e;
              }
            }
          } catch {
            /* ignore */
          }

          const pos = await requestLocationWithTimeout(20000);
          coords = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          updateLocStatus();
          setStatus("");
        } catch (err) {
          coords = null;
          updateLocStatus();
          console.warn("Geolocation error:", err);

          const code = err?.code;
          let message = "";
          switch (code) {
            case err?.PERMISSION_DENIED:
            case "PERMISSION_DENIED":
              message = COPY.errors?.permissionDenied ?? "Permission denied";
              break;
            case err?.POSITION_UNAVAILABLE:
              message =
                COPY.errors?.positionUnavailable ?? "Position unavailable";
              break;
            case err?.TIMEOUT:
            case "TIMEOUT":
              message = COPY.errors?.timeout ?? "Request timed out";
              break;
            case "UNSUPPORTED":
              message = COPY.errors?.unsupported ?? "Geolocation unsupported";
              break;
            default:
              message =
                typeof err?.message === "string" && err.message
                  ? (COPY.errors?.generic || "Error: {message}").replace(
                      "{message}",
                      err.message,
                    )
                  : COPY.errors?.generic?.replace(
                      "{message}",
                      "unknown error",
                    ) || "Something went wrong";
          }

          // Add hint if likely blocked by iframe policy
          if (
            message &&
            window.isSecureContext &&
            detectIframe() &&
            !geolocationPolicyAllowed()
          ) {
            message += " (Blocked by iframe/Permissions-Policy.)";
          }
          setStatus(message, "err");
        } finally {
          setButtonsDisabled(false);
        }
      };
    }

    // --- Clear ---
    if (btnClear instanceof HTMLButtonElement) {
      btnClear.onclick = () => {
        coords = null;
        if (locInput instanceof HTMLInputElement) locInput.value = "";
        updateLocStatus();
        setStatus("");
        if (btnUseLoc instanceof HTMLButtonElement) btnUseLoc.focus();
      };
    }

    // --- Submit ---
    if (btnSubmit instanceof HTMLButtonElement) {
      btnSubmit.onclick = async () => {
        setStatus("");
        if (hpInput instanceof HTMLInputElement && hpInput.value) {
          setStatus(COPY.status?.thanks ?? "Thanks!", "ok");
          return;
        }

        const manual =
          locInput instanceof HTMLInputElement
            ? parseLatLon(locInput.value)
            : null;
        const payload = {
          location: coords
            ? `${coords.lat},${coords.lon}`
            : manual
              ? `${manual.lat},${manual.lon}`
              : null,
          accuracy: coords?.accuracy ?? null,
          phone:
            phoneInput instanceof HTMLInputElement
              ? sanitizePhone(phoneInput.value) || null
              : null,
          message:
            msgInput instanceof HTMLTextAreaElement
              ? (msgInput.value || "").trim() || null
              : null,
          userAgent: navigator.userAgent,
        };

        setButtonsDisabled(true);

        try {
          const res = await fetch("/api/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.success !== true) {
            const reason =
              typeof data?.error === "string" && data.error.trim()
                ? data.error
                : (COPY.errors?.submissionFailed ?? "Submission failed");
            throw new Error(reason);
          }
          setStatus(COPY.status?.success ?? "Success!", "ok");
          coords = null;
          if (locInput instanceof HTMLInputElement) locInput.value = "";
          if (phoneInput instanceof HTMLInputElement) phoneInput.value = "";
          if (msgInput instanceof HTMLTextAreaElement) msgInput.value = "";
          updateLocStatus();
        } catch (err) {
          const fallback =
            typeof err?.message === "string" && err.message.trim()
              ? err.message
              : (COPY.errors?.submissionFailed ?? "Submission failed");
          setStatus(fallback, "err");
        } finally {
          setButtonsDisabled(false);
        }
      };
    }

    // --- Manual input updates coords ---
    if (locInput instanceof HTMLInputElement) {
      locInput.addEventListener("input", () => {
        const parsed = parseLatLon(locInput.value);
        if (parsed) {
          coords = { lat: parsed.lat, lon: parsed.lon, accuracy: null };
        } else if (!locInput.value) {
          coords = null;
        }
        updateLocStatus();
      });
    }

    updateLocStatus();
  }

  function safeInit() {
    try {
      initThorReport();
    } catch (err) {
      console.error("ThorReport: init failed", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit, { once: true });
  } else {
    safeInit();
  }

  // Re-run when Astro swaps pages
  document.addEventListener("astro:page-load", safeInit);
  document.addEventListener("astro:after-swap", safeInit);
})();
