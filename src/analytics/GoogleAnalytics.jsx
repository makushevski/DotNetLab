import { useEffect } from "react";

const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
const APP_ENVIRONMENT = (import.meta.env.VITE_APP_ENV ?? "local").trim().toLowerCase();
const GA_PLACEHOLDER = "G-XXXXXXXXXX";
const GA_SCRIPT_ID = "google-analytics-script";
const GA_INSTANCE_KEY = `${APP_ENVIRONMENT}:${GA_MEASUREMENT_ID}`;
const INTERACTIVE_SELECTOR = "a, button";

function isValidMeasurementId(value) {
  return /^G-[A-Z0-9]+$/.test(value) && value !== GA_PLACEHOLDER;
}

function shouldEnableAnalytics() {
  return import.meta.env.PROD && APP_ENVIRONMENT === "production" && isValidMeasurementId(GA_MEASUREMENT_ID);
}

function readableText(element) {
  return (
    element.getAttribute("aria-label") ||
    element.textContent?.trim().replace(/\s+/g, " ") ||
    element.getAttribute("href") ||
    "unlabeled"
  );
}

function linkDetails(element) {
  if (element.tagName.toLowerCase() !== "a") return {};

  const href = element.getAttribute("href") || "";
  const url = element.href ? new URL(element.href) : null;

  return {
    link_url: href,
    link_domain: url?.hostname || "",
    outbound: url ? url.origin !== window.location.origin : false,
  };
}

function analyticsPayload(element) {
  const elementType = element.tagName.toLowerCase();
  const text = readableText(element);

  return {
    event_category: element.dataset.analyticsCategory || "interaction",
    event_label: element.dataset.analyticsLabel || text,
    app_environment: APP_ENVIRONMENT,
    analytics_placement: element.dataset.analyticsPlacement || "",
    element_type: elementType,
    element_text: text,
    page_path: window.location.pathname,
    utc_timestamp: new Date().toISOString(),
    utm_source: element.dataset.utmSource || "",
    utm_medium: element.dataset.utmMedium || "",
    utm_campaign: element.dataset.utmCampaign || "",
    utm_content: element.dataset.utmContent || "",
    ...linkDetails(element),
  };
}

export function GoogleAnalytics() {
  useEffect(() => {
    if (!shouldEnableAnalytics()) return;

    if (!document.getElementById(GA_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = GA_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
      document.head.appendChild(script);
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    if (window.__dotNetVisualLabGaInitialized !== GA_INSTANCE_KEY) {
      window.__dotNetVisualLabGaInitialized = GA_INSTANCE_KEY;
      window.gtag("js", new Date());
      window.gtag("config", GA_MEASUREMENT_ID, {
        app_environment: APP_ENVIRONMENT,
      });
    }

    function trackInteractiveClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest(INTERACTIVE_SELECTOR);
      if (!element) return;
      if (element.disabled || element.getAttribute("aria-disabled") === "true") return;

      const elementType = element.tagName.toLowerCase();
      const defaultAction = elementType === "a" ? "link_click" : "button_click";
      const action = element.dataset.analyticsAction || defaultAction;

      window.gtag("event", action, analyticsPayload(element));
    }

    document.addEventListener("click", trackInteractiveClick, true);
    return () => document.removeEventListener("click", trackInteractiveClick, true);
  }, []);

  return null;
}
