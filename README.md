# Sleeper Power Rankings

Weekly power rankings for [Sleeper](https://sleeper.com) fantasy football leagues. Enter a Sleeper username (or a league ID),
pick a league, and get a ranked table for any week of the season, with a shareable link and a PNG download.

The app runs entirely in the browser. It calls the public Sleeper and FantasyCalc APIs directly, so there is no backend,
no database, and no login. Hosting is static files on S3 + CloudFront, which stays within the AWS always-free tier.

## What the table shows

| Column | Meaning |
|---|---|
| Power Rank / Score | Final ranking and the weighted score behind it (lower is better) |
| Δ | Change in power rank since the previous week |
| PO Odds | Simulated chance of making the playoffs |
| Record | Win-loss record |
| Overall | All-play record: wins and losses against every team each week |
| Cons | Consistency rank |
| PPG | Points-per-game rank and average |
| ROS Roster | Rest-of-season roster strength rank |

## How the rankings work

Each team is ranked 1 to N (1 is best) in six categories. Each rank is multiplied by that category's weight, the results are
added up and divided by 7, and the team with the lowest total is #1.

| Category | Ranked by | Default weight |
|---|---|---|
| Record | Wins (ties count as half) | 1.2 per game played until week 3, then 3 |
| Overall wins | All-play wins: teams outscored each week, summed | 1 |
| Last 5 | Wins over the last five games | 0 until week 8, then 1.2 |
| Consistency | Average points − 3 × standard deviation − 75% of the league average | 0 until 3 games played, then 1 |
| Points | Points per game | 1 |
| Roster | Rest-of-season roster strength | 1.5 |

The defaults ramp up with the season: early on, only record and roster strength matter much; consistency joins at week 3
and recent form at week 8. The **Weights** section shows the value in use for the selected week (gray means automatic).
Type a number to override any weight, or press **Reset to automatic**.

Ties in the final score are broken by total points scored, then roster rank.

### Roster strength and FantasyPros

Roster strength is the one category that depends on player outlook rather than results, and FantasyPros' rest-of-season
roster rankings are a common source for it. FantasyPros has no open API, so the app works in two ways:

- **Default (FantasyCalc):** each roster is valued with [FantasyCalc](https://fantasycalc.com) trade values, adjusted for your
  league's size, QB count (superflex), and PPR scoring. A roster's value is its best starting lineup plus 20% of its bench.
  Rosters are valued as they stood at the end of the selected week, using today's player values.
- **FantasyPros order:** open **Roster ranks** and drag teams into the order FantasyPros shows for your league (or use the
  arrows). That order is used in place of FantasyCalc for every week, is saved in your browser for that league, and is
  included in the page URL so shared links show the same table. **Reset to FantasyCalc** clears it.

In testing on one 12-team league, the FantasyCalc order matched FantasyPros exactly for 9 of 12 teams and was off by at most
two spots for the rest.

### Playoff odds

Playoff odds come from a Monte Carlo simulation (5,000 runs). Each remaining game is played by drawing each team's score from
a normal distribution built from its scoring average and variance, shrunk toward the league average while the sample is small.
Playoff seeding is by wins, then total points.

## Shareable links

- `?league=<league id>` opens a league directly.
- `&week=<n>` shows the rankings through week *n* (0 is preseason).
- `&order=<team ids, best first, joined by ->` is a manual roster order (set by dragging in **Roster ranks**).
- `&w_wins=`, `&w_overallWins=`, `&w_recent=`, `&w_consistency=`, `&w_points=`, `&w_roster=` override a weight.
- `?user=<username>` shows that user's current-season leagues.

The address bar updates as you change the week, roster order or weights, so **Copy link** always reproduces what you see.

## Project layout

- `web/` — the site, plain HTML and ES modules with no build step.
  - `js/engine.js` — the ranking formula and weights
  - `js/playoffOdds.js` — playoff simulation
  - `js/rosterStrength.js` — FantasyCalc valuation and roster ranks
  - `js/sleeper.js` — Sleeper API client
  - `js/app.js` — UI
  - `test.html` — engine tests (open it in a browser)
- `infra/template.yaml` — CloudFormation: private S3 bucket behind CloudFront
- `deploy.sh` — creates or updates the stack, syncs `web/` to S3, and invalidates the CloudFront cache
- `serve.py` — local dev server with caching disabled

## Run locally

```bash
./serve.py
```

Then open http://localhost:8123.

## Deploy to AWS

Requires the AWS CLI with credentials for an account you control.

```bash
./deploy.sh [stack-name]
```

It prints the CloudFront URL when it finishes.
