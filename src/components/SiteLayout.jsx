import { trackingProps } from "../analytics/tracking.js";
import logoUrl from "../assets/icons/logo-mark.svg";

function linkTo(pathPrefix, href) {
  return `${pathPrefix}${href}`;
}

function isCurrentPage(href, currentPage) {
  if (href === "labs.html") {
    return currentPage === "labs.html" || currentPage === "dictionary.html" || currentPage === "concurrent-dictionary.html";
  }

  return href === currentPage;
}

function NavLink({ href, currentPage, children, label, pathPrefix = "", placement }) {
  const isCurrent = isCurrentPage(href, currentPage);

  return (
    <a
      href={linkTo(pathPrefix, href)}
      aria-current={isCurrent ? "page" : undefined}
      {...trackingProps({ category: "navigation", label, placement })}
    >
      {children}
    </a>
  );
}

export function SiteHeader({ currentPage, pathPrefix = "" }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a
          className="brand"
          href={linkTo(pathPrefix, "index.html")}
          aria-label="DotNet Visual Lab home"
          {...trackingProps({ category: "navigation", label: "home_brand", placement: "site_header" })}
        >
          <img className="brand-icon" src={logoUrl} alt="" />
          <span className="brand-text">DotNet Visual Lab</span>
          <span className="version-badge">v0.1</span>
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink href="labs.html" currentPage={currentPage} label="header_labs" pathPrefix={pathPrefix} placement="site_header">
            Labs
          </NavLink>
          <NavLink href="methodology.html" currentPage={currentPage} label="header_methodology" pathPrefix={pathPrefix} placement="site_header">
            Methodology
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ currentPage, pathPrefix = "" }) {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <span>Copyright 2026 DotNet Visual Lab.</span>
        <nav className="footer-links" aria-label="Footer navigation">
          <NavLink href="about-author.html" currentPage={currentPage} label="footer_about_author" pathPrefix={pathPrefix} placement="site_footer">
            About the author
          </NavLink>
          <NavLink href="privacy.html" currentPage={currentPage} label="footer_privacy" pathPrefix={pathPrefix} placement="site_footer">
            Privacy
          </NavLink>
        </nav>
      </div>
    </footer>
  );
}

export function SiteLayout({ children, currentPage, pathPrefix = "", mainClassName = "main-content" }) {
  return (
    <div className="site-shell">
      <SiteHeader currentPage={currentPage} pathPrefix={pathPrefix} />
      <main className={mainClassName}>{children}</main>
      <SiteFooter currentPage={currentPage} pathPrefix={pathPrefix} />
    </div>
  );
}
