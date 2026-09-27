# CI/CD and merge protection

## Automated checks

The `CI` GitHub Actions workflow runs four independent jobs in parallel:

- `Static analysis (lint)`
- `Compilation (type-check)`
- `Unit tests`
- `Build (Expo export)`

The workflow runs when a pull request targets `main`, after an approving pull
request review is submitted, and after changes land on `main`. Running the
checks before review gives reviewers early feedback. Running them again after
approval verifies the exact pull request revision that was approved.

## Protecting `main`

Workflow files cannot enforce reviewer counts by themselves. Configure a
GitHub branch ruleset for `main` under **Settings > Rules > Rulesets**:

1. Create an active branch ruleset targeting the default branch.
2. Enable **Require a pull request before merging**.
3. Set **Required approvals** to `1`.
4. Enable **Dismiss stale pull request approvals when new commits are pushed**.
5. Enable **Require status checks to pass** and require all four CI checks
   listed above.
6. Enable **Require branches to be up to date before merging**.
7. Keep force pushes and branch deletion blocked.

The status checks appear in the ruleset selector after this workflow has run at
least once on GitHub.

## Emergency approval override

Add only the repository owner or designated maintainers to the ruleset bypass
list. When possible, choose **For pull requests only** so an authorized person
can use GitHub's bypass option in the pull request merge UI while changes still
go through a pull request. Do not grant general bypass access to the whole team.

Every override should include a written explanation in the pull request. The
CI checks should remain required even when review approval is overridden unless
the incident itself prevents GitHub Actions from running.
