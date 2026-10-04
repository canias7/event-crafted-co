import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Router links keep the browser's scroll position, so a footer link
// clicked at the bottom of one page opened the next page part-way down.
// On every new page: go to the #section if the URL names one (it can
// render a moment later, once a lazy page has loaded, so keep looking
// briefly), otherwise to the top. Back/forward is left to the browser,
// except on the first load, where a #section still needs finding.
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navType = useNavigationType();
  const firstLoad = useRef(true);

  useEffect(() => {
    const isFirstLoad = firstLoad.current;
    firstLoad.current = false;
    if (navType === "POP" && !(isFirstLoad && hash)) return;

    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer: number | undefined;
    const find = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        return;
      }
      if (tries++ < 30) timer = window.setTimeout(find, 100);
    };
    if (!isFirstLoad) window.scrollTo(0, 0);
    find();
    return () => window.clearTimeout(timer);
  }, [pathname, hash, navType]);

  return null;
}
