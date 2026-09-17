export function createMockEnv(): CloudflareBindings {
  return {
    SCRAPER_API_KEY: "test-key",
    SCRAPING_BASE_URL: "https://bulletins.nyu.edu/",
    ALBERT_SCRAPING_BASE_URL: "https://bulletins.nyu.edu/class-search/",
  } as CloudflareBindings;
}
