// Public links shown on the landing page. Forks can point these at their own repo/site.
export const SITE = {
  url: (process.env.APP_URL || 'https://split.kartikgautam.com').replace(/\/$/, ''),
  repo: process.env.SITE_REPO_URL || 'https://github.com/atomsmasher81/fairshare',
  author: process.env.SITE_AUTHOR || 'Kartik Gautam',
  authorUrl: process.env.SITE_AUTHOR_URL || 'https://kartikgautam.com',
}
