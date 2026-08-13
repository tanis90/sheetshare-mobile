(function installSheetShareViewerPaths(root) {
  function routePrefix(pathname) {
    const marker = "/modules/";
    const index = String(pathname || "").indexOf(marker);
    return index > 0 ? String(pathname).slice(0, index).replace(/\/+$/, "") : "";
  }

  function assetUrl(path, pathname = root.location?.pathname || "") {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;

    const prefix = routePrefix(pathname);
    const absolute = `/${value.replace(/^\/+/, "")}`;
    if (prefix && (absolute === prefix || absolute.startsWith(`${prefix}/`))) return absolute;
    return `${prefix}${absolute}`;
  }

  root.SheetShareViewerPaths = Object.freeze({ assetUrl, routePrefix });
})(typeof window === "object" ? window : globalThis);
