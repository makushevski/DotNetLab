import { useEffect } from "react";
import { trackingProps } from "../analytics/tracking.js";

export const MAX_LOG_ITEMS = 10;

export function stableHash32(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableHashInt(input) {
  return stableHash32(input) | 0;
}

export function focusClass(baseClass, id, focusSet, extra = "") {
  return [baseClass, extra, focusSet.has(id) ? "focus" : ""].filter(Boolean).join(" ");
}

export function HintLabel({ children, tooltip, className = "" }) {
  if (!tooltip) return children;

  return (
    <span className={["hint-label", className].filter(Boolean).join(" ")} data-tooltip={tooltip} tabIndex={0}>
      {children}
    </span>
  );
}

export function LabHeader({ title, children }) {
  return (
    <section className="topbar">
      <h1>{title}</h1>
      <p className="hero-copy">{children}</p>
    </section>
  );
}

export function Narrator({ model, timeline, timelineIndex, onPrevious, onNext }) {
  const canGoPrevious = timeline.length > 0 && timelineIndex > 0;
  const canGoNext = timeline.length > 0 && timelineIndex < timeline.length - 1;
  const timelineStatus = timeline.length ? `${timelineIndex + 1} / ${timeline.length}` : "0 / 0";

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") return;

      if (event.key === "ArrowLeft" && canGoPrevious) {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === "ArrowRight" && canGoNext) {
        event.preventDefault();
        onNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoNext, canGoPrevious, onNext, onPrevious]);

  return (
    <aside className="narrator" aria-live="polite">
      <div className="step-controls" aria-label="Timeline navigation">
        <button
          type="button"
          disabled={!canGoPrevious}
          onClick={onPrevious}
          aria-keyshortcuts="ArrowLeft"
          {...trackingProps({ category: "timeline", label: "timeline_previous", placement: "narrator" })}
        >
          Previous
        </button>
        <span className="timeline-status">{timelineStatus}</span>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={onNext}
          aria-keyshortcuts="ArrowRight"
          {...trackingProps({ category: "timeline", label: "timeline_next", placement: "narrator" })}
        >
          Next
        </button>
      </div>
      <div className="step-head">
        <div className="step-index">{model.step}</div>
        <div>
          <h2 className="step-title">{model.title}</h2>
          <p className="step-detail">{model.detail}</p>
        </div>
      </div>
      <pre className="code-box">{model.code}</pre>
      <EventLog events={model.log} activeStep={model.step} />
    </aside>
  );
}

export function EventLog({ events, activeStep }) {
  return (
    <div className="event-log">
      {events.map((event) => (
        <div key={`${event.index}-${event.title}`} className={event.index === activeStep ? "event active" : "event"}>
          <div className="event-index">{event.index}</div>
          <div>
            <div className="event-title">{event.title}</div>
            <div className="event-text">{event.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Metrics({ items, focusSet }) {
  return (
    <div className="metrics">
      {items.map((item) => {
        const { label, value, id, hint, valueHint } = Array.isArray(item)
          ? { label: item[0], value: item[1], id: item[2], hint: item[3], valueHint: item[4] }
          : item;

        return (
          <div key={id} id={id} className={focusClass("metric", id, focusSet)}>
            <span>
              <HintLabel tooltip={hint}>{label}</HintLabel>
            </span>
            <strong>
              <HintLabel tooltip={valueHint} className="value-hint">
                {value}
              </HintLabel>
            </strong>
          </div>
        );
      })}
    </div>
  );
}

export function FieldGrid({ fields, focusSet }) {
  return (
    <div className="field-grid">
      {fields.map((field) => {
        const { label, name, value, id, hint, valueHint } = Array.isArray(field)
          ? { label: field[0], value: field[1], id: field[2], hint: field[3], valueHint: field[4] }
          : field;
        const fieldLabel = label ?? name;

        return (
          <div key={id} id={id} className={focusClass("field", id, focusSet)}>
            <div className="field-name">
              <HintLabel tooltip={hint}>{fieldLabel}</HintLabel>
            </div>
            <div className="field-value">
              <HintLabel tooltip={valueHint} className="value-hint">
                {value}
              </HintLabel>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SectionTitle({ title, titleHint, children, detailHint }) {
  return (
    <div className="section-title">
      <HintLabel tooltip={titleHint}>{title}</HintLabel>
      <span>
        <HintLabel tooltip={detailHint}>{children}</HintLabel>
      </span>
    </div>
  );
}

export function MiniArray({ values, movingItem, columns = 7, formatValue }) {
  const format = formatValue ?? ((value) => (value ? String(value) : "0"));
  const hasMovingItem = movingItem !== null && movingItem !== undefined;

  return (
    <div className="mini-array" style={{ "--mini-cols": Math.min(values.length, columns) }}>
      {values.map((value, index) => (
        <div
          key={`${index}-${value ?? "null"}`}
          className={hasMovingItem && value === movingItem ? "mini-cell active" : "mini-cell"}
          title={`[${index}]`}
        >
          {format(value)}
        </div>
      ))}
    </div>
  );
}

export function Toast({ message }) {
  return (
    <div className={message ? "toast visible" : "toast"} role="status">
      {message}
    </div>
  );
}
