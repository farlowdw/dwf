/**
 * scripts/lib/newSiteHosting.mjs: the one fish block `shared:new` prints at its end, filled in for the new site.
 * Nothing here runs it: the GitHub repository, the Netlify project, the password wall, the domain and every
 * deploy stay a person's steps.
 *
 * The block pastes whole, and stops at the first line that fails, because each line starts with `and`. fish
 * reads a pasted block before it runs any of it, so `read` waits at the terminal. It waits there because a
 * private site's wall must be on before the first deploy, and a wall set through a command would put the
 * password in a command. A public site with a Netlify address has nothing to wait for.
 *
 * The project is asked for by the name the request holds: a netlify.app address's own, or the folder's.
 * Netlify may give it another when that one is taken, so the block reads the name it really got, and the DNS
 * line and the last check use that one. A netlify.app site whose project got another name stops there: its
 * address would name another project. The DNS line covers a subdomain, which takes a CNAME record, and a bare
 * domain, which cannot hold one.
 *
 * HOW TO CHANGE IT
 *   The steps and their order: hostingBlock. The wall's place in Netlify's pages: WALL_LINES. What the site
 *   answers after the deploy: ANSWER_LINE. The last line comes from lib/deployLine.mjs, so it stays the
 *   line `shared:bump` prints.
 */

import { deployLine } from './deployLine.mjs';
import { NETLIFY_HOST_END } from './newSiteSettings.mjs';
import { PLAIN_WORD } from './phrases.mjs';

const STATUS_ONLY = '-s -o /dev/null -w \'%{http_code}\\n\'';
const STATE_FILE = './.netlify/state.json';

/** The fish variable that holds the name Netlify gave the project. */
const PROJECT_VARIABLE = '$project';

const WALL_LINES = Object.freeze([
  '# The wall goes on before the first deploy. In Netlify, open the project, then Project configuration,',
  '# General, Visitor access, Project visibility, Edit visibility, Password, scope Production and previews.',
]);

/** A word as fish reads it, quoted when it needs to be. */
function fishWord(word) {
  if (PLAIN_WORD.test(word)) return word;
  return `'${word.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/** The custom domain of a site, or null when Netlify's own address serves it. */
function customDomain(url) {
  const { hostname } = new URL(url);
  return hostname.endsWith(NETLIFY_HOST_END) ? null : hostname;
}

/** The lines that make the repository and the Netlify project, then read the name Netlify gave it. */
function createLines({ folder, repo, project, publicSite }) {
  const visibility = publicSite ? '--public' : '--private';
  const getSite = 'netlify api getSite --data "{\\"site_id\\":\\"$site_id\\"}"';
  const nameOf = 'node -p "JSON.parse(require(\'fs\').readFileSync(0, \'utf8\')).name"';
  return [
    '# Needs gh and netlify on the PATH, both signed in.',
    `cd ${fishWord(folder)}`,
    `and gh repo create ${repo} ${visibility} --source . --remote origin --push`,
    `and netlify sites:create --name ${project}`,
    `and set site_id (node -p "require('${STATE_FILE}').siteId")`,
    `and set project (${getSite} | ${nameOf})`,
  ];
}

/** A netlify.app site stops when Netlify named its project otherwise: the address in its config would be another's. */
function sameNameLines({ project }, domain) {
  if (domain !== null) return [];
  const message = `Netlify named the project ${PROJECT_VARIABLE}, not ${project}, so the site's address names another project. `
    + `Delete this project, or set url in docusaurus.config.js to https://${PROJECT_VARIABLE}${NETLIFY_HOST_END}.`;
  return [`and if test "${PROJECT_VARIABLE}" != ${project}; echo "${message}"; false; end`];
}

/** What a person does in other pages, before the deploy. The DNS line is printed, so it names the real project. */
function handLines({ publicSite }, domain) {
  const wall = publicSite ? [] : WALL_LINES;
  const target = `${PROJECT_VARIABLE}${NETLIFY_HOST_END}`;
  const dns = domain === null ? [] : [
    `and echo "At your DNS host, point ${domain} at ${target}: a CNAME record for a subdomain such as www, or for a bare domain an ALIAS or ANAME record, a flattened CNAME, or Netlify's load-balancer A record."`,
  ];
  return [...wall, ...dns];
}

/** The line that holds the block until those steps are done, when there are any. */
function waitLine(steps) {
  return steps.length === 0 ? [] : [...steps, 'and read -P \'Done with the steps above? Press Enter: \' -l ready'];
}

/** The line that gives the project its domain. */
function domainLines(domain) {
  if (domain === null) return [];
  const data = `{\\"site_id\\":\\"$site_id\\",\\"body\\":{\\"custom_domain\\":\\"${domain}\\"}}`;
  return [`and netlify api updateSite --data "${data}"`];
}

/** The one chained line: a build, the deploy, and what the address answers: the domain, or the real project's. */
function deployLines({ root, url, publicSite }, domain) {
  const answer = publicSite ? '200' : '401, the wall';
  const address = domain === null ? `https://${PROJECT_VARIABLE}${NETLIFY_HOST_END}` : url;
  return [
    `# It ends by printing what the site answers: ${answer}. A new domain can take a while to answer.`,
    `and npm run build && ${deployLine(root)} && curl ${STATUS_ONLY} ${address}`,
  ];
}

/** The block's lines, each filled in. */
export function hostingBlock(site) {
  const domain = customDomain(site.url);
  return [
    ...createLines(site),
    ...sameNameLines(site, domain),
    ...waitLine(handLines(site, domain)),
    ...domainLines(domain),
    ...deployLines(site, domain),
  ];
}
