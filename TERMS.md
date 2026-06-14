# Cadence — Terms of Use

**Effective date:** 2026-05-20
**Last updated:** 2026-05-20

Cadence is an open-source application distributed under the project's `LICENSE` file at the root of the repository. These Terms describe the conditions under which you may use the **distributed binaries and the GitHub Pages PWA** of Cadence. The full source license still governs the source code.

## 1. The "service"

Cadence is software you install and run on your own devices. There is no Cadence-operated server, no Cadence-operated account system, and no Cadence-stored data. "Service" in these Terms refers only to:

- the desktop app (DMG / future Windows / Linux builds),
- the Progressive Web App hosted at `https://<owner>.github.io/cadence/app/`, and
- the optional integrations Cadence ships (Google Drive sync, AI assistant via your own API key).

## 2. No warranty

The software is provided **"as-is"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

This includes — but is not limited to — data loss. Cadence ships with backup mechanisms (rolling 50-snapshot history, JSON export, optional Drive sync) but you remain responsible for keeping copies of your data.

## 3. Your data

You retain ownership of every byte of data you create in Cadence. Cadence never claims a license to your content. See `PRIVACY.md` for where that data is stored.

## 4. Third-party services

When you enable the optional integrations, you also accept the terms of the third-party services involved:

- **Google Drive (cloud sync)** — Google's Terms of Service and Google Drive API Terms of Service apply to the OAuth interaction and the storage of your encrypted snapshot. See <https://developers.google.com/terms> and <https://policies.google.com/terms>.
- **Anthropic / OpenAI / Google Gemini (AI assistant)** — the terms of whichever provider you configured apply to the text you send. You are responsible for the contents of the prompts you submit.

Cadence is not affiliated with or endorsed by Google, Anthropic, OpenAI, or Microsoft.

## 5. Acceptable use

You may not use Cadence to:

- store, process, or transmit content that you do not have the right to store, process, or transmit;
- interfere with another user's ability to use Cadence;
- attempt to break the security of the cloud-sync integration or another user's installation;
- impersonate someone else when prompting the AI assistant or capturing 1:1 notes about that person.

## 6. Open source

Cadence's source code is open. You are welcome — and encouraged — to fork it, audit it, ship modified builds, and use it in your own organisation under the terms of the `LICENSE` file. These Terms apply to the **official build** distributed by the project maintainers; a fork is governed by the fork maintainer's terms.

## 7. Changes

Material changes to these Terms will be reflected in the **Last updated** date above and noted in the release notes. Continued use of the official builds after a change indicates acceptance.

## 8. Contact

Open an issue at <https://github.com/sercancelenk/cadence/issues>.
