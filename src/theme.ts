const preference = window.matchMedia("(prefers-color-scheme: dark)");
let chosen: string | null = null;
try {
  chosen = localStorage.getItem("portfolio-theme");
} catch {
  /* Private browsing can disable storage. */
}
const apply = (dark: boolean) => {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const button = document.querySelector<HTMLButtonElement>(".theme-toggle");
  if (button) {
    button.hidden = false;
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute(
      "aria-label",
      `Switch to ${dark ? "light" : "dark"} theme`,
    );
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#151d22" : "#f6f5f0");
};
apply(chosen ? chosen === "dark" : preference.matches);
document.addEventListener("DOMContentLoaded", () => {
  apply(chosen ? chosen === "dark" : preference.matches);
  document.querySelector(".theme-toggle")?.addEventListener("click", () => {
    chosen =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("portfolio-theme", chosen);
    } catch {
      /* Theme still works in memory. */
    }
    apply(chosen === "dark");
  });
});
preference.addEventListener("change", (event) => {
  if (!chosen) apply(event.matches);
});
