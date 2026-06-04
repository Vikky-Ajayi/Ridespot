export function withPreviewParam(href: string, preview: boolean) {
  if (!preview) {
    return href;
  }

  const [pathWithQuery, hash] = href.split("#");
  const separator = pathWithQuery.includes("?") ? "&" : "?";
  const nextHref = `${pathWithQuery}${separator}preview=app`;

  return hash ? `${nextHref}#${hash}` : nextHref;
}
