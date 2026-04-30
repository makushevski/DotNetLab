import { useEffect } from "react";
import { trackingProps } from "./analytics/tracking.js";
import codeIconUrl from "./assets/icons/code.svg";
import collectionsIconUrl from "./assets/icons/collections.svg";
import concurrencyIconUrl from "./assets/icons/concurrency.svg";
import mainImageUrl from "./assets/images/main_image.jpg";
import { SiteLayout } from "./components/SiteLayout.jsx";

const labs = [
  {
    title: "Dictionary<TKey, TValue>",
    titleTail: "Internals",
    description: "Explore buckets, entries, hash codes, collisions, resizing, and lookup behavior.",
    href: "labs/dictionary.html",
    difficulty: "Intermediate",
    iconUrl: collectionsIconUrl
  },
  {
    title: "ConcurrentDictionary",
    titleTail: "Internals",
    description: "Explore thread-safe reads, striped locking, tables, buckets, locks, and grow behavior.",
    href: "labs/concurrent-dictionary.html",
    difficulty: "Advanced",
    iconUrl: concurrencyIconUrl,
    badgeClass: "badge-blue"
  }
];

const pageMeta = {
  "index.html": "DotNet Visual Lab",
  "labs.html": "Labs | DotNet Visual Lab",
  "methodology.html": "Methodology | DotNet Visual Lab",
  "about-author.html": "About the author | DotNet Visual Lab",
  "privacy.html": "Privacy | DotNet Visual Lab"
};

function getCurrentPage() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const lastPart = parts.at(-1);
  return lastPart && lastPart.includes(".") ? lastPart : "index.html";
}

export default function App() {
  const currentPage = getCurrentPage();

  useEffect(() => {
    document.title = pageMeta[currentPage] ?? pageMeta["index.html"];
  }, [currentPage]);

  return (
    <SiteLayout currentPage={currentPage}>
      {renderPage(currentPage)}
    </SiteLayout>
  );
}

function renderPage(currentPage) {
  switch (currentPage) {
    case "labs.html":
      return <LabsPage />;
    case "methodology.html":
      return <MethodologyPage />;
    case "about-author.html":
      return <AboutAuthorPage />;
    case "privacy.html":
      return <PrivacyPage />;
    default:
      return <HomePage />;
  }
}

function HomePage() {
  return (
    <>
      <section className="hero container">
        <div>
          <p className="eyebrow">Interactive / Accurate / Source-aligned</p>
          <h1 aria-label="Understand .NET internals visually">
            <span className="title-line">Understand .NET</span>
            <span className="title-line">internals <span className="accent-text">visually</span></span>
          </h1>
          <p className="hero-copy">Interactive visual labs for collections, concurrency, async/await, runtime behavior, memory, and performance.</p>
          <div className="hero-actions">
            <a
              className="button button-primary"
              href="labs.html"
              {...trackingProps({ category: "cta", label: "hero_explore_labs", placement: "home_hero" })}
            >
              <span className="button-mark button-mark-logo" aria-hidden="true"></span>
              Explore Labs
            </a>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <img src={mainImageUrl} alt="" />
        </div>
      </section>

      <section className="section container" id="featured-labs">
        <div className="section-header">
          <h2 className="section-title">Available Labs</h2>
          <p className="section-copy">Start with the first interactive visualizations.</p>
        </div>
        <LabGrid />
      </section>

      <section className="section container">
        <div className="methodology-banner">
          <img className="topic-icon methodology-icon" src={codeIconUrl} alt="" />
          <div>
            <h2>Built for accuracy</h2>
            <p>Every lab is an educational model checked against .NET source code, Microsoft documentation, and local experiments. Simplifications are documented where needed.</p>
          </div>
          <a
            className="button"
            href="methodology.html"
            {...trackingProps({ category: "cta", label: "methodology_banner", placement: "home_methodology_banner" })}
          >
            Learn our methodology
          </a>
        </div>
      </section>
    </>
  );
}

function LabsPage() {
  return (
    <>
      <section className="page-hero container">
        <p className="eyebrow">Interactive .NET Internals</p>
        <h1>Labs</h1>
        <p className="page-copy">Small focused visualizations that make runtime data structures and behavior easier to inspect, reason about, and discuss.</p>
      </section>

      <section className="section container">
        <LabGrid />
      </section>
    </>
  );
}

function LabGrid() {
  return (
    <div className="lab-grid">
      {labs.map((lab) => (
        <LabCard key={lab.href} lab={lab} />
      ))}
    </div>
  );
}

function LabCard({ lab }) {
  return (
    <a
      className="lab-card"
      href={lab.href}
      {...trackingProps({ category: "lab_card", label: `open_${lab.title}`, placement: "lab_grid" })}
    >
      <img className="topic-icon" src={lab.iconUrl} alt="" />
      <div className="lab-card-body">
        <span className={`badge ${lab.badgeClass ?? ""}`}>{lab.difficulty}</span>
        <h3>{lab.title}<span className="lab-title-tail"> {lab.titleTail}</span></h3>
        <p>{lab.description}</p>
        <span className="text-link">Open Lab</span>
      </div>
    </a>
  );
}

function MethodologyPage() {
  return (
    <>
      <section className="page-hero container">
        <p className="eyebrow">Accuracy Notes</p>
        <h1>Methodology</h1>
        <p className="page-copy">The labs are designed as simplified educational models, with explicit checks against source material and experiments where behavior matters.</p>
      </section>

      <section className="container">
        <div className="content-panel">
          <p>Labs are simplified educational models. They focus on the concepts and transitions that help developers understand .NET internals without reproducing every production implementation detail.</p>
          <p>Visualizations are checked against:</p>
          <ul className="content-list">
            <li>.NET source code</li>
            <li>Microsoft documentation</li>
            <li>local experiments</li>
          </ul>
          <p>Runtime implementation details may differ between .NET versions. Each lab should document important simplifications when the visualization intentionally omits or compresses details.</p>
          <p>This project is independent and not affiliated with Microsoft.</p>
        </div>
      </section>
    </>
  );
}

function AboutAuthorPage() {
  return (
    <>
      <section className="page-hero container">
        <p className="eyebrow">Project Author</p>
        <h1>About the author</h1>
      </section>

      <section className="container">
        <div className="content-panel">
          <p>DotNet Visual Lab is created by Denis Makushevski, a .NET software engineer focused on backend development, .NET internals, observability, performance, and educational visualizations.</p>
        </div>
      </section>
    </>
  );
}

function PrivacyPage() {
  return (
    <>
      <section className="page-hero container">
        <p className="eyebrow">Privacy Notes</p>
        <h1>Privacy</h1>
      </section>

      <section className="container">
        <div className="content-panel">
          <p>This site uses Google Analytics to understand aggregate usage and improve the educational labs over time.</p>
          <p>No login, user accounts, comments, or account profiles are used by DotNet Visual Lab.</p>
          <p>External links may lead to Microsoft documentation, source references, or other documentation sites. Those sites have their own privacy practices.</p>
        </div>
      </section>
    </>
  );
}
