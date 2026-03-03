# CID two-bash workflow (HomeBase + segment backend)

When you do work in **CID_HomeBase** (assets, mapping, templates, VS), deployment requires **two commits**: one in HomeBase, one in the segment backend so it points at the new HomeBase SHA.

---

## Bash 1 — CID_HomeBase (standalone)

- **Where:** `~/GitHub/CID_HomeBase` (standalone repo; **not** the `CID_HomeBase` folder inside a backend).
- **What:** Commit and push your template/mapping/asset changes.
- **Commands (example):**
  ```bash
  cd ~/GitHub/CID_HomeBase
  git status
  git add templates/SUPP_HVAC   # or whatever you changed
  git commit -m "Add SUPP_HVAC mapping page-3"
  git push origin main
  ```
- **Result:** New commit (and SHA) on `CID_HomeBase` on GitHub.

---

## Bash 2 — Segment backend (update submodule pointer)

The backend repo has `CID_HomeBase` as a **submodule**. It only “sees” a specific **commit SHA** of HomeBase. If you don’t update that pointer, the backend still points at an **older** SHA.

- **Where:** `~/GitHub/<segment>-pdf-backend` (e.g. `hvac-pdf-backend`, `plumber-pdf-backend`, `pdf-backend` for Bar).
- **What:** Update the submodule to the latest HomeBase commit, then commit that new pointer in the backend.

### Step A — Point the submodule at the latest HomeBase

```bash
cd ~/GitHub/hvac-pdf-backend   # or plumber-pdf-backend, pdf-backend, etc.

cd CID_HomeBase
git fetch origin
git checkout main
git pull origin main
cd ..
```

### Step B — Commit the new SHA in the backend

```bash
git status
```

You should see something like:

- `modified:   CID_HomeBase (new commits)`  
  That means the submodule pointer changed. **If you see “nothing to commit, working tree clean”**, the submodule wasn’t updated — go back to Step A and make sure you `git pull` inside `CID_HomeBase` and that you’re in the right backend repo.

Then:

```bash
git add CID_HomeBase
git commit -m "Bump CID_HomeBase for latest SUPP_HVAC"
git push origin main
```

- **Result:** Backend repo on GitHub now points at the latest CID_HomeBase SHA. Render (or any deploy) will use that when it builds.

---

## “SHA don’t make” / “nothing to commit”

- **Symptom:** You pushed to CID_HomeBase (Bash 1), then in the backend you run `git status` and it says **clean, nothing to commit**.
- **Cause:** The backend’s submodule is still at the **old** SHA. You didn’t run Bash 2 (or didn’t run Step A inside `CID_HomeBase` before committing in the backend).
- **Fix:** Do Bash 2 properly: `cd <backend>/CID_HomeBase`, `git pull origin main`, `cd ..`, then `git add CID_HomeBase`, `git commit`, `git push`.

---

## Quick checklist

1. Edit in **standalone** `~/GitHub/CID_HomeBase` (not inside a backend’s submodule).
2. **Bash 1:** In `CID_HomeBase` → commit + push.
3. **Bash 2:** In `xxxxx-pdf-backend` → `cd CID_HomeBase && git pull && cd ..` → `git add CID_HomeBase` → commit + push.
4. If backend says “nothing to commit”, the submodule SHA wasn’t updated; redo Step A of Bash 2.
