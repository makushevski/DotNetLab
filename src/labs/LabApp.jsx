import { SiteLayout } from "../components/SiteLayout.jsx";
import ConcurrentDictionaryLab from "./ConcurrentDictionaryLab.jsx";
import DictionaryLab from "./DictionaryLab.jsx";

export default function LabApp() {
  const page = window.location.pathname.split("/").at(-1);
  const lab = page === "concurrent-dictionary.html" ? <ConcurrentDictionaryLab /> : <DictionaryLab />;

  return (
    <SiteLayout currentPage={page} pathPrefix="../" mainClassName="main-content lab-main-content">
      {lab}
    </SiteLayout>
  );
}
