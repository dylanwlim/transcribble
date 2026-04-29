export type LaunchAction = "add";

export function getLaunchAction(search: string) {
  const params = new URLSearchParams(search);
  return params.get("action") === "add" ? "add" : null;
}

export function removeLaunchActionFromUrl(href: string) {
  const url = new URL(href);
  url.searchParams.delete("action");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
