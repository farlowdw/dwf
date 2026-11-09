<!--
SITE-RULES.md: the rules of this repository, for a person or a tool working in it.
How to change it: add a rule when something goes wrong twice, and keep the file short. Anything about the
shared folder belongs in shared/README.md, not here.
-->

# Rules for __SITE_TITLE__

1. Run `npm run shared:verify` before a commit that changes code, and compare test names and counts, not
   only the exit code.
2. Add files to git by name. Never commit `.env`, `build/` or `.docusaurus/`: a build holds what the
   environment gave it.
3. `shared/` is a git subtree. Its rules are in `shared/README.md`, under The five rules. Commit a change to
   it alone, with a subject that reads well in public.
4. This site differs from the others in five places only, and `shared/README.md` lists them under When one
   site needs something different. Change a copy of shared code there, not here.
5. Paths in `docusaurus.config.js` stay relative strings. `require.resolve` puts this machine's path in the
   public main bundle.
6. Keep every `@docusaurus/*` entry on the one exact version `shared:status` asks for. `npm run shared:bump`
   moves them.
7. Every file opens with a comment saying what it is for and how to change it. Constants get names, functions
   stay short, and the README changes in the same commit as what it describes.
8. No secret goes in a file. Anything private is a variable on the Netlify project.
