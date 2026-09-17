declare namespace Cloudflare {
  interface Env {
    DATABASE_URL: string;
  }
}

interface CloudflareBindings extends Cloudflare.Env {}
