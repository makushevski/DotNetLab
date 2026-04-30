const UTM_SOURCE = "dotnet_visual_lab";
const UTM_MEDIUM = "site";
const UTM_CAMPAIGN = "navigation";

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function trackingProps({ category, label, placement, action }) {
  const metricLabel = slug(label);

  return {
    "data-analytics-category": category,
    "data-analytics-label": metricLabel,
    ...(action ? { "data-analytics-action": action } : {}),
    ...(placement ? { "data-analytics-placement": placement } : {}),
    "data-utm-source": UTM_SOURCE,
    "data-utm-medium": UTM_MEDIUM,
    "data-utm-campaign": UTM_CAMPAIGN,
    "data-utm-content": metricLabel,
  };
}

export function withUtm(href, content, campaign = UTM_CAMPAIGN) {
  const url = new URL(href);
  url.searchParams.set("utm_source", UTM_SOURCE);
  url.searchParams.set("utm_medium", UTM_MEDIUM);
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", slug(content));

  return url.toString();
}
