import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const username = process.env.PROFILE_USERNAME || "BohdanRykush";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const outputPath = resolve(process.env.STATS_OUTPUT || "assets/stats.svg");

if (!token) {
  throw new Error("GH_TOKEN or GITHUB_TOKEN is required to query GitHub.");
}

const to = new Date();
const from = new Date(to.getTime() - 364 * 24 * 60 * 60 * 1000);
const query = `
  query ContributionStats($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        hasAnyRestrictedContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "BohdanRykush-profile-stats",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed with HTTP ${response.status}.`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(`GitHub GraphQL error: ${payload.errors[0].message}`);
}

const collection = payload.data?.user?.contributionsCollection;
if (!collection) {
  throw new Error(`GitHub user ${username} was not found.`);
}

const calendar = collection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);
const total = calendar.totalContributions;
const privateContributions = collection.restrictedContributionsCount;

// This profile is expected to contain mostly private work. Failing here prevents
// a seemingly valid, but incomplete, public-only card from being published.
if (!collection.hasAnyRestrictedContributions || privateContributions === 0) {
  throw new Error(
    "Private contributions are not visible. Enable Profile > Contribution settings > Private contributions.",
  );
}

const publicContributions = Math.max(0, total - privateContributions);
const activeDays = days.filter((day) => day.contributionCount > 0).length;
const bestDay = Math.max(0, ...days.map((day) => day.contributionCount));
const privateShare = total === 0 ? 0 : (privateContributions / total) * 100;
const privateShareLabel = `${Math.round(privateShare)}%`;
const circumference = 2 * Math.PI * 40;
const privateArc = (privateShare / 100) * circumference;
const number = new Intl.NumberFormat("en-US");

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="467" height="195" viewBox="0 0 467 195" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} contribution statistics</title>
  <desc id="desc">${number.format(total)} contributions in the last year, including ${number.format(privateContributions)} anonymized private contributions.</desc>
  <style>
    .title { fill: #c9d1d9; font: 600 18px "Segoe UI", Ubuntu, sans-serif; }
    .label { fill: #8b949e; font: 600 14px "Segoe UI", Ubuntu, sans-serif; }
    .value { fill: #c9d1d9; font: 700 14px "Segoe UI", Ubuntu, sans-serif; }
    .percent { fill: #c9d1d9; font: 700 23px "Segoe UI", Ubuntu, sans-serif; }
    .caption { fill: #8b949e; font: 400 12px "Segoe UI", Ubuntu, sans-serif; }
  </style>
  <rect x="0.5" y="0.5" width="466" height="194" rx="8" fill="#0d1117" stroke="#0d1117"/>
  <text class="title" x="25" y="35">Contribution Activity</text>

  <g transform="translate(25 62)">
    <circle cx="5" cy="-4" r="4" fill="#38bdf8"/>
    <text class="label" x="18" y="0">Total contributions (last year):</text>
    <text class="value" x="248" y="0" text-anchor="end">${number.format(total)}</text>
  </g>
  <g transform="translate(25 91)">
    <circle cx="5" cy="-4" r="4" fill="#0ea5e9"/>
    <text class="label" x="18" y="0">Private contributions:</text>
    <text class="value" x="248" y="0" text-anchor="end">${number.format(privateContributions)}</text>
  </g>
  <g transform="translate(25 120)">
    <circle cx="5" cy="-4" r="4" fill="#155e8a"/>
    <text class="label" x="18" y="0">Public contributions:</text>
    <text class="value" x="248" y="0" text-anchor="end">${number.format(publicContributions)}</text>
  </g>
  <g transform="translate(25 149)">
    <circle cx="5" cy="-4" r="4" fill="#0e2438"/>
    <text class="label" x="18" y="0">Active days:</text>
    <text class="value" x="248" y="0" text-anchor="end">${number.format(activeDays)}</text>
  </g>

  <g transform="translate(371 94) rotate(-90)">
    <circle cx="0" cy="0" r="40" fill="none" stroke="#161b22" stroke-width="7"/>
    <circle cx="0" cy="0" r="40" fill="none" stroke="#38bdf8" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${privateArc.toFixed(2)} ${circumference.toFixed(2)}"/>
  </g>
  <text class="percent" x="371" y="101" text-anchor="middle">${privateShareLabel}</text>
  <text class="caption" x="371" y="151" text-anchor="middle">private activity</text>
  <text class="caption" x="371" y="170" text-anchor="middle">best day: ${number.format(bestDay)}</text>
</svg>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");

console.log(
  `Generated ${outputPath}: ${total} total, ${privateContributions} private, ${activeDays} active days.`,
);
