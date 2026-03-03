 # Where to edit (one lane)

## Templates, assets, mapping (SUPP_*, ACORD*, SVG, *.map.json)

**Edit in STANDALONE CID_HomeBase only:**

- **Path:** `~/GitHub/CID_HomeBase/templates/` (and mapping under each template)
- **In Finder:** newmacminim4 > GitHub > **CID_HomeBase** > templates
- **Not:** pdf-backend > CID_HomeBase > templates (that’s the submodule; bashing from here won’t push it)

Then the two-bash process works: Bash 1 from CID_HomeBase, Bash 2 from the segment backend (update submodule SHA). **Full steps and “SHA don’t make” fix:** see `scripts/CID_TWO_BASH_WORKFLOW.md`.

## Segment code (server.js, config, Netlify form)

**Edit in the segment repo:**

- **Bar:** `~/GitHub/pdf-backend/` (src/server.js, netlify/index.html, config)
- **Plumber:** plumber-pdf-backend  
- **Roofer:** roofing-pdf-backend  

Cursor/agent: when changing **templates or mapping**, use path  
`/Users/newmacminim4/GitHub/CID_HomeBase/...`  
so the file is in the standalone repo.
