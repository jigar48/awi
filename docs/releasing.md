# V1.0.0 release procedure

This is an approval-gated plan, not an automated publisher. All public actions below are pending explicit maintainer approval. No publish workflow or write credential has been added. Run commands from the repository root in PowerShell, check each exit code, and stop on any failure or unexpected remote state. GitHub CLI (`gh`) and a supported npm CLI must be installed/authenticated before publication; neither is currently available/authenticated in the Windows release shell. Never print credentials or copy them into the repository.

## Candidate and repository state

- Package: `agent-workflow-inspector@1.0.0`, MIT. Source bin `dist/cli/index.js`, ESM export and declarations `dist/index.js` / `dist/index.d.ts`; Node 22.18+ (22.x), 24.11+ (24.x), 26.x.
- Local `main` preserves audited history through d2514af. The feature branch is retained. No force push, history rewrite, branch deletion or tag creation is required during preparation.
- At inspection, public origin was `https://github.com/jigar48/awi.git`, default branch `codex/awi-v1`, sole remote commit d2514af, with no tags/releases. Description/homepage were empty and topics were empty.
- Public branch metadata reported `protected:false`; repository rulesets returned an empty list. The detailed protection endpoint returned 403 to the connected integration, so a maintainer must confirm settings before changing defaults. Do not bypass any rules; use the required review path if protection changes.
- The npm registry returned 404 on October 19, 2026. The name is not reserved and no ownership is established by that result. Linux npm 11.17.0 `whoami` returned ENEEDAUTH; Windows npm is absent from PATH. Authenticate the intended maintainer account, with 2FA, and recheck availability immediately before publishing. Never overwrite an existing version; if 1.0.0 appears, stop and compare ownership/source before choosing a new version.
- Historical [CI run](https://github.com/jigar48/awi/actions/runs/39208844432) passed all nine jobs for d2514af only. It does not validate this later candidate.

## Ordered public actions — approval required

### 1. Push only the final main candidate

```powershell
git status --porcelain=v1
git switch main
$releaseSha = (git rev-parse HEAD).Trim()
git merge-base --is-ancestor d2514af main
git ls-remote --symref origin
git push --set-upstream origin main
git ls-remote origin refs/heads/main
```

Require a clean tree, the approved SHA and preserved audited ancestry. If remote main appears or changes, fetch and inspect ancestry before pushing; never force. This push triggers `.github/workflows/ci.yml` on main without changing the default branch.

### 2. Verify fresh main CI

```powershell
gh run list --repo jigar48/awi --workflow ci.yml --branch main --commit $releaseSha --event push --json databaseId,headSha,status,conclusion,url
```

Select the matching run ID, then run `gh run watch RUN_ID --repo jigar48/awi --exit-status` and `gh run view RUN_ID --repo jigar48/awi --json headSha,conclusion,jobs`. Require exactly nine successful verify jobs: Windows, macOS and Ubuntu × Node 22.18.0, 24.11.0 and 26. Every install/test/type/lint/build/format/schema/audit/pack/consumer step must pass. Stop publication on a failure or SHA mismatch. Any correction requires a new commit, push, matrix and package validation.

### 3. Set default branch and prepared metadata

Only after successful main CI, inspect branch settings with an admin identity. Apply the prepared description/homepage/topics and default branch:

```powershell
gh api --method PATCH repos/jigar48/awi --input .github/repository-metadata.json
gh api --method PUT repos/jigar48/awi/topics --input .github/repository-topics.json
gh repo edit jigar48/awi --default-branch main
```

Topics satisfy GitHub's current rules: eight lowercase names using letters/hyphens, each at most 50 characters; maximum allowed is 20. See [GitHub topic requirements](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics). Funding appears from `.github/FUNDING.yml`; no external account settings are changed by the local file.

### 4. Freeze artifact and create annotated tag

Recheck HEAD equals the successful CI SHA and clean status. Preserve the exact locally validated tarball and its external SHA-512 integrity manifest. Do not rebuild or substitute it after approval; if regenerated, repeat the clean consumer check and recompute the manifest. Inspect `git ls-remote --tags origin` and ensure no v1.0.0 exists.

```powershell
git tag -a v1.0.0 $releaseSha -m 'Agent Workflow Inspector v1.0.0'
git push origin refs/tags/v1.0.0
git rev-parse 'v1.0.0^{}'
git ls-remote origin 'refs/tags/v1.0.0*'
```

Require the peeled remote tag to equal `$releaseSha`. A tag push also triggers CI; do not confuse it with the already required main run. Do not move an existing tag.

### 5. Publish GitHub release

The prepared notes use absolute version-tagged documentation URLs. Remove the candidate status line only in the temporary publication body after approval; preserve the source notes as a preparation record.

```powershell
$notes = Get-Content docs/releases/v1.0.0.md -Raw
$notes = $notes.Replace('Release notes prepared for approval. This version has not been published.', 'Initial public release.')
[IO.File]::WriteAllText((Join-Path $PWD '.awi-audit/release-body.md'), $notes)
gh release create v1.0.0 agent-workflow-inspector-1.0.0.tgz .awi-audit/release-candidate.json --repo jigar48/awi --verify-tag --title 'Agent Workflow Inspector v1.0.0 — Deterministic AI Agent Trace Diagnostics' --notes-file .awi-audit/release-body.md
```

The release body labels npm installation as conditional until registry publication succeeds, so an npm authentication failure does not falsely advertise availability. No GitHub release has been created during preparation.

### 6. Publish npm securely

For the first version, prefer interactive npm web login/2FA on the maintainer's trusted machine. The current npm [trust CLI prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/) require the package to exist before a trusted publisher can be configured. Therefore this unpublished name cannot yet use that setup path. Do not create a bootstrap/dummy version, or a long-lived npm automation token.

Install a current supported npm CLI and use the intended maintainer account. Commands below are pending approval and human authentication:

```powershell
npm login --auth-type=web --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm view agent-workflow-inspector versions maintainers --json --registry=https://registry.npmjs.org
npm publish ./agent-workflow-inspector-1.0.0.tgz --access public --registry=https://registry.npmjs.org --ignore-scripts
```

Expected pre-publication registry response is E404. Any other response needs review; if version 1.0.0 exists, stop. Human authentication is intentionally outside agent logs. Publish the already validated tarball with lifecycle scripts disabled. Local interactive publication does not create GitHub OIDC provenance; do not claim it does.

GitHub-hosted OIDC trusted publishing is suitable for subsequent versions: public repository/package, pinned actions, protected manual publish workflow, explicit immutable source SHA/tag, passing CI gate, protected environment, `contents: read` and job-scoped `id-token: write`, no write token or release-build cache. npm documents Node >=22.14 and npm >=11.5.1 for OIDC; the trust CLI needs npm >=11.15. A future reviewed `publish.yml` must exist before npm configuration names it. Configure `jigar48/awi`, that exact workflow filename and environment in package settings; stage-only permission with maintainer 2FA approval is preferred. Current npm documentation also requires a new trusted configuration's first successful publish within two days. See [trusted publishing](https://docs.npmjs.com/trusted-publishers/). Do not enable any publisher or add a live workflow during this preparation.

### 7. Verify registry and clean registry consumer

```powershell
npm view agent-workflow-inspector@1.0.0 name version license engines bin exports types repository homepage bugs dist --json --registry=https://registry.npmjs.org
npm owner ls agent-workflow-inspector --registry=https://registry.npmjs.org
```

Require registry `dist.integrity` to equal `.awi-audit/release-candidate.json` tarballIntegrity. Download the registry tarball, verify its SHA-512 and compare bytes with the approved artifact. Never accept matching version strings alone. The tarball manifest records the source SHA; the annotated tag and successful CI must identify that same SHA. Reject any payload difference.

Create a new temporary directory outside the checkout, `npm init -y`, then `npm install --ignore-scripts --save-exact agent-workflow-inspector@1.0.0 --registry=https://registry.npmjs.org`. Execute its installed `node_modules/.bin/awi` (`awi.cmd` on Windows) with --help, --version and all four shipped examples using resolved package paths; expected results match `scripts/package-smoke.mjs`. Check JSON output, exit codes, ESM public imports and strict TypeScript imports, using only declared consumer tooling. Clean up the temporary directory after inspection. This registry-based check cannot run before publication; the local tarball equivalent has already run.

### 8. Verify release links and record outcome

Use `gh release view v1.0.0 --repo jigar48/awi --json url,tagName,targetCommitish,assets,body` and repository metadata to confirm the default main branch, tag, notes and downloadable artifact. Open version-tagged documentation URLs and npm package page. Match the release tarball to the same SHA-512 manifest and record the successful main run URL and release commit. A registry/release mismatch is a release incident, not grounds to force-move a tag or overwrite a version.

After successful publication, a separate documentation-only follow-up may replace the README's candidate notice, add the actual publication date to the changelog, and record registry/release URLs and integrity. Such a follow-up is not part of the v1.0.0 source tag and must not be represented as its published contents.

## Approval gate

Local preparation is complete only after full validation and tarball consumer smoke pass. Publication remains blocked on approval, fresh main CI and authenticated npm ownership/name checks. Approval must explicitly cover main push, remote metadata/default-branch changes, annotated tag push, GitHub release and npm publication. The previous feature-branch push authorization does not authorize these actions.
