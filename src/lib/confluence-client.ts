/**
 * Confluence Cloud REST API client.
 *
 * Uses Basic auth (email:apiToken) against the Atlassian instance configured
 * via CONFLUENCE_* env vars. Falls back to JIRA_EMAIL/JIRA_API_TOKEN when the
 * Confluence-specific token is absent (same Atlassian account, shared token).
 *
 * Search uses the v1 REST API (CQL is not available in v2).
 * Page content fetch uses v2 API (body-format=view for pre-rendered HTML).
 */
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfluenceSearchResult {
  pageId: string;
  title: string;
  url: string;
  spaceKey: string;
  spaceTitle: string;
  lastModified: string | null;
  excerpt: string;
}

export interface ConfluencePageMetadata {
  pageId: string;
  title: string;
  url: string;
  lastModifiedAt: string | null;
  lastModifiedBy: string | null;
}

export interface ConfluencePage extends ConfluencePageMetadata {
  bodyHtml: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

class ConfluenceClient {
  private baseUrl: string;
  private email: string;
  private token: string;
  readonly spaceKey: string;

  constructor() {
    this.baseUrl = (env.CONFLUENCE_BASE_URL || env.JIRA_BASE_URL).replace(/\/$/, "");
    this.email = env.CONFLUENCE_EMAIL || env.JIRA_EMAIL;
    this.token = env.CONFLUENCE_API_TOKEN || env.JIRA_API_TOKEN;
    this.spaceKey = env.CONFLUENCE_SPACE_KEY;
  }

  get isLive(): boolean {
    return Boolean(this.baseUrl && this.email && this.token);
  }

  private authHeader(): string {
    const credentials = Buffer.from(`${this.email}:${this.token}`).toString("base64");
    return `Basic ${credentials}`;
  }

  private async fetch<T>(path: string): Promise<T> {
    trackOutboundCall("confluence");
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader(),
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Confluence API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  async checkHealth(): Promise<{ displayName: string; accountId: string }> {
    // Use the spaces endpoint to verify auth — cheap and reliable
    const data = await this.fetch<{ results: Array<{ key: string; name: string }> }>(
      "/wiki/api/v2/spaces?limit=1",
    );
    // Return a minimal user-like object for consistency with Jira health
    return {
      displayName: this.email,
      accountId: `confluence:${data.results[0]?.key ?? "ok"}`,
    };
  }

  async searchPages(query: string, spaceKey?: string): Promise<ConfluenceSearchResult[]> {
    const space = spaceKey ?? this.spaceKey;
    const cql = space
      ? `title~"${query}" AND space="${space}" AND type=page`
      : `title~"${query}" AND type=page`;
    const params = new URLSearchParams({
      cql,
      limit: "10",
      expand: "space,version,history.lastUpdated",
    });
    const data = await this.fetch<{
      results: Array<{
        id: string;
        title: string;
        _links: { webui: string };
        space: { key: string; name: string };
        history?: { lastUpdated?: { when: string } };
        excerpt?: string;
      }>;
    }>(`/wiki/rest/api/content/search?${params}`);

    return data.results.map((r) => ({
      pageId: r.id,
      title: r.title,
      url: `${this.baseUrl}/wiki${r._links.webui}`,
      spaceKey: r.space.key,
      spaceTitle: r.space.name,
      lastModified: r.history?.lastUpdated?.when ?? null,
      excerpt: r.excerpt ?? "",
    }));
  }

  async getPageMetadata(pageId: string): Promise<ConfluencePageMetadata> {
    const data = await this.fetch<{
      id: string;
      title: string;
      _links: { webui: string };
      version: { when: string; by: { displayName: string } };
    }>(`/wiki/api/v2/pages/${pageId}?version-metadata=true`);

    return {
      pageId: data.id,
      title: data.title,
      url: `${this.baseUrl}/wiki${data._links.webui}`,
      lastModifiedAt: data.version?.when ?? null,
      lastModifiedBy: data.version?.by?.displayName ?? null,
    };
  }

  async getPage(pageId: string): Promise<ConfluencePage> {
    const data = await this.fetch<{
      id: string;
      title: string;
      _links: { webui: string };
      version: { when: string; by: { displayName: string } };
      body: { view: { value: string } };
    }>(`/wiki/api/v2/pages/${pageId}?body-format=view&version-metadata=true`);

    return {
      pageId: data.id,
      title: data.title,
      url: `${this.baseUrl}/wiki${data._links.webui}`,
      lastModifiedAt: data.version?.when ?? null,
      lastModifiedBy: data.version?.by?.displayName ?? null,
      bodyHtml: data.body?.view?.value ?? "",
    };
  }
}

export const confluenceClient = new ConfluenceClient();
