import { scribbleToken } from '../topology.js';

export function breadcrumbResponse(url, state, config) {
  const path = (url || '/').split('?')[0];
  const token = scribbleToken(state.buildId, config.siteSeed || 'ghost-lan');

  if (path === '/robots.txt') {
    return {
      status: 200,
      contentType: 'text/plain',
      body: `User-agent: *\nDisallow: /admin/\nDisallow: /backup/\nDisallow: /.ghost-\n# ${token.slice(0, 8)}\n`,
    };
  }

  if (path === '/.git/HEAD') {
    return {
      status: 200,
      contentType: 'text/plain',
      body: `ref: refs/heads/main\n# gitdir: /var/services/homes/admin/repo/.git\n`,
    };
  }

  if (path === '/security.txt') {
    return {
      status: 200,
      contentType: 'text/plain',
      body: `Contact: mailto:security@localhost\nPreferred-Languages: en\n`,
    };
  }

  if (path === '/sitemap.xml') {
    return {
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>/admin/</loc></url><url><loc>/login</loc></url></urlset>`,
    };
  }

  if (/^\/api\/v\d+\/status$/i.test(path)) {
    return {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, firmware: '1.0.4.88', uptime: 864000, _token: token.slice(0, 6) }),
    };
  }

  return null;
}