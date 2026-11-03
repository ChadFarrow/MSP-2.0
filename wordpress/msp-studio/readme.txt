=== MSP Studio ===
Contributors: chadfarrow
Tags: podcast, rss, music, value4value, podcasting 2.0
Requires at least: 6.2
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Build Podcasting 2.0 music, video and publisher feeds in your WordPress admin, and host them on your own site.

== Description ==

MSP Studio puts the Music Side Project editor (https://musicsideproject.com) in your WordPress admin. Build an album, video or publisher feed with Value 4 Value (Lightning) splits, and save it to your own site, which then serves the feed at a permanent address:

    https://your-site.example/msp-feeds/<podcast-guid>.xml

Each save can notify Podcast Index and send a podping, so podcast apps pick up your changes.

== External services ==

The editor runs in your browser and talks to these services:

* **Music Side Project API** (https://musicsideproject.com/api/…) — Podcast Index search and submission, podping, the feed reachability check, the OP3 check, and (only if you use them) "Host on MSP" and email sign-in. Each save that notifies Podcast Index sends the feed's public URL, GUID and medium. Terms and source: https://github.com/ChadFarrow/MSP-2.0
* **Podcast Index** (https://podcastindex.org), reached through the MSP API — receives your feed URL. https://podcastindex.org/terms
* **Podping on the Hive blockchain**, through MSP's podping service — receives your feed URL.
* **Nostr relays and Blossom servers** — only when you sign in with Nostr and use a Nostr save option.
* **Feed hosts you import from** — "Import from URL" fetches the feed through your own WordPress site.

Your feeds themselves are stored in your WordPress database.

== Installation ==

1. Upload the plugin zip under Plugins → Add New → Upload Plugin, and activate it.
2. Open **MSP Studio** in the admin menu.
3. Build or import a feed, then choose **Save → Host on this WordPress site**.

If your site uses a firewall or "bot protection" (for example Cloudflare Bot Fight Mode), allow podcast crawlers to fetch `/msp-feeds/`, or Podcast Index cannot read your feed. MSP Studio warns you when it sees this.

== Frequently Asked Questions ==

= Who can use it? =

Administrators. A site can change this with the `msp_studio_capability` filter.

= What happens to my feeds if I delete the plugin? =

They stay in the database, so nothing breaks if you reinstall. To remove them on delete, set the option `msp_studio_delete_data_on_uninstall` to 1 first.
