import ConcurrentDictionaryLab from "./ConcurrentDictionaryLab.jsx";
import DictionaryLab from "./DictionaryLab.jsx";

export default function LabApp() {
  const page = window.location.pathname.split("/").at(-1);

  if (page === "concurrent-dictionary.html") {
    return <ConcurrentDictionaryLab />;
  }

  return <DictionaryLab />;
}
