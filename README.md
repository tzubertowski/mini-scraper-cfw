# 🎨 mini-scraper

[![NPM version](https://img.shields.io/npm/v/@sinedied/mini-scraper.svg)](https://www.npmjs.com/package/@sinedied/mini-scraper)
[![Build Status](https://github.com/tzubertowski/mini-scraper-cfw/actions/workflows/ci.yml/badge.svg)](https://github.com/tzubertowski/mini-scraper-cfw/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/tzubertowski/mini-scraper-cfw)](https://github.com/tzubertowski/mini-scraper-cfw/releases/latest)
![Node version](https://img.shields.io/node/v/@sinedied/mini-scraper.svg)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="https://raw.githubusercontent.com/sinedied/mini-scraper/refs/heads/main/pic.jpg" alt="picture of a scraped boxart" width="180" align="right">

Artwork scraper for MinUI, NextUI, muOS, Knulli, ES-DE, TreeFrogUI, OnionOS, GarlicOS, SpruceOS, AlliumOS, and other handheld frontends.

> [!NOTE]
> MinUI does't officially support boxarts, but still has [some support for it as stated by its author](https://www.reddit.com/r/SBCGaming/comments/1hycyqx/minui_box_art/).

**Features:**
- Scrapes boxart for your ROMs, in a compatible format with multiple frontends/OSes
- Includes an Electron desktop app with folder selection, automatic frontend detection, progress, and cancellation
- Uses [Libretro Thumbnails](https://github.com/libretro-thumbnails/libretro-thumbnails) automatically with no account, or an authenticated [RetroAchievements](https://retroachievements.org/) account
- Keeps a persistent local source-image cache and spaces network traffic into retryable batches
- Optionally uses local AI (via [Ollama](https://ollama.com/) or any OpenAI-compatible API) for better boxart matching
- No configuration needed

## What this fork adds

- New output adapters for **Knulli**, **ES-DE**, **TreeFrogUI**, **GarlicOS**, **SpruceOS**, and **AlliumOS**, plus an explicit **OnionOS** format.
- Knulli scraped-media support, including boxart, screenshot and titleshot filenames and updates to EmulationStation's `gamelist.xml`.
- A guided desktop interface built with **Electron** and Bootstrap. Choose a card or ROM folder, confirm the detected frontend, preview the artwork style and start scraping.
- Automatic detection for supported SD-card layouts and a reusable scraper core shared by the CLI and desktop app.
- Ready-to-run desktop ZIP builds for Linux, Windows and macOS attached to GitHub releases.

Existing MinUI, NextUI, muOS, Anbernic and FunKey output formats remain supported.

<img src="./screenshot.png" alt="Mini Scraper Electron desktop app showing a detected muOS library and artwork preview" width="720">

## Download the desktop app

Download the archive for your system from the [latest GitHub release](https://github.com/tzubertowski/mini-scraper-cfw/releases/latest), extract it and run Mini Scraper. The packaged desktop app includes Electron, so Node.js is not required.

Current builds are provided for Linux x64, Windows x64 and macOS ARM64.

## Installation and development

The CLI and development setup require [Node.js >22.14](https://nodejs.org/), and optionally [Ollama](https://ollama.com/) (or any other OpenAI-compatible AI provider) for AI matching. If you don't want to install these locally, you can use the packaged desktop app or [Docker](#running-with-docker).

### Desktop app

The desktop app is built with Electron and is the easiest way to use Mini Scraper:

1. Choose the artwork source. **Automatic** uses Libretro immediately; **RetroAchievements** requires a verified login.
2. Once the source is ready, choose the SD card or ROM folder.
3. Confirm the detected frontend and preview the artwork style, then select **Add artwork**.

The default **Automatic** artwork source uses Libretro Thumbnails and never asks for an account, so step 2 is visible immediately. Selecting **RetroAchievements** opens a connection window and hides step 2 and everything after it until the API verifies the username and personal Web API key. The desktop app saves them with Electron's encrypted `safeStorage`; **Forget account** removes the saved credentials and locks the later steps again.

For ES-DE, Mini Scraper detects or suggests the sibling `ES-DE/downloaded_media` directory. You can choose a custom Game media directory before scraping. ES-DE media is matched by ROM filename, so Mini Scraper does not create or update `gamelist.xml` for this format.

The detector uses scored filesystem evidence and asks for manual confirmation when it cannot distinguish similar layouts. All filesystem and network work stays in the Electron main process; the local web interface receives only folder-selection, scrape, cancel, and progress operations through an isolated bridge.

For development:

```bash
npm install
npm run desktop
```

Create an unpacked application or distributable archive with:

```bash
npm run desktop:package
npm run desktop:make
```

Electron Forge writes packaged output to `out/`. Use Node.js 22 or 24 LTS for packaging; the currently pinned Forge toolchain does not complete archive extraction under Node.js 26.

The GitHub-only release workflow builds ZIP archives for Linux, Windows, and macOS on GitHub's current hosted-runner architecture and attaches them to each new GitHub release. It does not publish this fork under the upstream npm package name. Run the workflow manually with an existing tag to rebuild or replace that release's desktop archives.

#### Rebuilding releases with GitHub Actions

Open **Actions → release → Run workflow** in this repository:

- Leave **tag** empty to let semantic-release create the next version from conventional commits. If there are no releasable commits, packaging is skipped.
- Enter an existing tag such as `v2.2.0` to rebuild its Linux, Windows and macOS archives. Existing assets with the same names are replaced.

The same operations can be started and monitored with GitHub CLI:

```bash
# Create the next semantic release and build its desktop archives
gh workflow run release.yml --ref main

# Rebuild all desktop archives for an existing release
gh workflow run release.yml --ref main -f tag=v2.2.0

# Find and monitor the run
gh run list --workflow release.yml --limit 1
gh run watch <run-id> --exit-status
```

The workflow runs the test suite first, then packages the tagged source with Electron Forge on each hosted operating system and uploads the resulting ZIP files to the GitHub release.

### Command-line app

Install the CLI globally by opening a terminal and running the following command:

```bash
npm install -g @sinedied/mini-scraper
```

To run the scraper, open a terminal and use the following command:

```bash
mscraper <rompath> [options]
```

Explanation:
- `<rompath>`: This is the path to the directory containing your ROMs.
- `[options]`: Replace this with the command-line arguments to be passed to the scraper.

## Options

When running the scraper, you can pass the following options:

- `-w, --width <size>`: Max width of the image (default: 300)
- `-h, --height <size>`: Max height of the image
- `-t, --type <type>`: Type of image to scrape (can be `boxart`, `snap`, `title`, `box+snap`, `box+title`) (default: `boxart`)
- `-o, --output <format>`: Artwork format (default: `minui`; see the table below)
- `-a, --ai`: Use AI for advanced matching (default: false)
- `-m, --ai-model <name>`: AI model to use for matching (default: `gemma2:2b`)
- `--ai-url <url>`: Base URL of the OpenAI-compatible AI provider (default: `http://localhost:11434/v1`)
- `--ai-key <key>`: API key for the AI provider, or set the `OPENAI_API_KEY` environment variable
- `-r, --regions <regions>`: Preferred regions to use for AI matching (default: `World,Europe,USA,Japan`)
- `-f, --force`: Force scraping over existing images
- `--cache-path <path>`: Persistent source-image cache directory
- `--batch-size <count>`: Network requests per batch (default: `100`)
- `--batch-delay-ms <ms>`: Pause between batches and failed-request retries (default: `1000`)
- `--batch-retries <count>`: Retry count for failed downloads (default: `2`)
- `--media-path <path>`: ES-DE `downloaded_media` directory; otherwise inferred beside the ROM root
- `--source <source>`: Artwork source (`automatic` or `retroachievements`; default: `automatic`)
- `--retroachievements-user <name>`: RetroAchievements username, or set `RETROACHIEVEMENTS_USER`
- `--retroachievements-key <key>`: Personal RetroAchievements Web API key, or set `RETROACHIEVEMENTS_API_KEY`
- `--cleanup`: Removes all scraped images in target folder
- `--verbose`: Show detailed logs
- `-v, --version`: Show current version

> [!TIP]
> Max width must be adjusted depending of the device and output format, the default works well for Trimui Brick. For 640x480 devices, try with `--width 200`.

## Output formats

| Value | Artwork layout | Notes |
| --- | --- | --- |
| `minui` | `.res/<ROM filename>.png` | Retains the ROM extension |
| `nextui` | `.media/<ROM stem>.png` | NextUI layout |
| `muos` | `/MUOS/info/catalogue/<system>/...` | Also prepares theme width overrides |
| `knulli` | `images/<ROM stem>-<media>.png` | Preserves and updates EmulationStation `gamelist.xml` metadata |
| `treefrogui` | `.res/<ROM stem>.png` | TreeFrogUI layout; `treefrog` is an alias |
| `onionos` | `Imgs/<ROM stem>.png` | `onion` is a backwards-compatible alias |
| `garlicos` | `Imgs/<ROM stem>.png` | `garlic` is an alias |
| `spruceos` | `Imgs/<ROM stem>.png` | `spruce` is an alias |
| `alliumos` | `Imgs/<ROM stem>.png` | `allium` is an alias |
| `esde` | `downloaded_media/<system>/<media type>/<ROM stem>.png` | Uses `covers`, `screenshots`, and `titlescreens`; `es-de` is an alias |
| `anbernic` | `Imgs/<ROM stem>.png` | Existing stock-style layout |
| `funkey` | `<ROM stem>.png` | Artwork beside the ROM |

## Artwork sources

### Automatic (Libretro)

Automatic is the zero-configuration default. It matches cleaned ROM filenames against Libretro Thumbnails and does not require an account.

### RetroAchievements

RetroAchievements uses the official `rcheevos` hashing implementation to match supported ROMs against its per-system hash lists. Exact matches can provide box art, gameplay screenshots and title screens. Mini Scraper caches the large hash lists and game metadata locally, reuses one lookup for multiple requested artwork types, and automatically falls back to Libretro when RetroAchievements does not recognize a ROM or lacks the selected image.

There are no application credentials or developer approval. Sign in at RetroAchievements, open **Profile → Settings → Applications**, and copy your Web API key. Treat the key like a password.

For the CLI, supply the username and personal key through environment variables or the matching command-line options. Environment variables keep the key out of shell history:

```bash
RETROACHIEVEMENTS_USER='username' \
RETROACHIEVEMENTS_API_KEY='personal-web-api-key' \
mscraper myroms --source retroachievements
```

RetroAchievements metadata and image downloads honor Mini Scraper's batching, automatic retries and HTTP 429 feedback. Both metadata and image files use the persistent local cache. See the [official API quick start](https://api-docs.retroachievements.org/getting-started.html) for account-key details.

## Download cache and batching

Mini Scraper stores downloaded source artwork in a persistent content cache before resizing or composing it. Re-running a scrape, changing the output frontend, or replacing generated artwork reuses the cached source rather than downloading it again.

The default cache locations are:

- Linux: `$XDG_CACHE_HOME/mini-scraper` or `~/.cache/mini-scraper`
- macOS: `~/Library/Caches/mini-scraper`
- Windows: `%LOCALAPPDATA%\Mini Scraper\Cache`

Set `MSCRAPER_CACHE_DIR` or use `--cache-path` to override it. Cache entries are keyed by their complete source URL. Downloads remain sequential, pause for one second after every 100 network requests by default, and retry a failed request twice before continuing to the next game. Cache hits do not count against the batch size.

The desktop app reports batch pauses, automatic retries and server throttling (HTTP 429) in the progress panel. A server-provided `Retry-After` delay is respected. If all attempts fail, the scrape continues and the completion message reports how many downloads remain; running the scraper again retries those missing files while reusing everything already cached.

## AI matching

When `--ai` is enabled, the scraper talks to any **OpenAI-compatible** chat completions API, so you can use whatever runner you like.

- By default it targets a local [Ollama](https://ollama.com/) instance at `http://localhost:11434/v1`. If the requested model isn't pulled yet, the scraper offers to download it for you.
- Point `--ai-url` at any other OpenAI-compatible endpoint to use a different runner, for example [LM Studio](https://lmstudio.ai/) (`http://localhost:1234/v1`), a remote server, or the OpenAI API (`https://api.openai.com/v1`). With non-Ollama providers the model must already be available server-side.
- For providers that require authentication (such as the OpenAI API), pass `--ai-key` or set the `OPENAI_API_KEY` environment variable. Local providers usually ignore the key.

```bash
# Default: local Ollama
mscraper myroms --ai

# LM Studio (load the model in the app first)
mscraper myroms --ai --ai-url http://localhost:1234/v1

# OpenAI API
mscraper myroms --ai --ai-url https://api.openai.com/v1 --ai-model gpt-4o-mini --ai-key sk-...
```


## Example

```bash
mscraper myroms --width 300 --ai
```

This will scrape the ROMs in the `myroms` folder with a max image width of 300 and using AI for advanced matching.

## Running with Docker

Alternatively, you can run the scraper using Docker. This is useful if you don't want to install Node.js or Ollama on your system.

First, you need to have Docker installed on your system. You can download and install Docker from the [official website](https://www.docker.com).

Then, you need to clone the repository and navigate to the project directory to build the Docker image by running the following command:

```bash
docker build -t mini-scraper .
```

Then, you can run the scraper with the following command:

```bash
docker run --rm -v <rompath>:/roms mini-scraper /roms [options]
```

Explanation:
- `--rm`: This removes the container after it has finished running.
- `-v <rompath>:/roms`: This mounts your ROMs directory to the /roms directory inside the container.  Replace <rompath> with the actual path to your ROMs.
- `mini-scraper`: This is the name of the Docker image.
- `/roms`: This is the directory inside the container where the ROMs are mounted.
- `[options]`: Replace this with the command-line arguments to be passed to the scraper.

## Supported Systems

The following systems are supported for scraping:

<details>
<summary>Click to expand</summary>

- Nintendo - Game Boy Color
- Nintendo - Game Boy Advance
- Nintendo - Game Boy
- Nintendo - Super Nintendo Entertainment System
- Nintendo - Nintendo 64DD
- Nintendo - Nintendo 64
- Nintendo - Family Computer Disk System
- Nintendo - Nintendo Entertainment System
- Nintendo - Nintendo DSi
- Nintendo - Nintendo DS
- Nintendo - Pokemon Mini
- Nintendo - Virtual Boy
- Handheld Electronic Game
- Sega - 32X
- Sega - Dreamcast
- Sega - Mega Drive - Genesis
- Sega - Mega-CD - Sega CD
- Sega - Game Gear
- Sega - Master System - Mark III
- Sega - Saturn
- Sega - Naomi 2
- Sega - Naomi
- Sony - PlayStation
- Sony - PlayStation Portable
- Amstrad - CPC
- Atari - 2600
- Atari - 5200
- Atari - 7800
- Atari - Jaguar
- Atari - Lynx
- Atari - ST
- Bandai - WonderSwan Color
- Bandai - WonderSwan
- Coleco - ColecoVision
- Commodore - Amiga
- Commodore - VIC-20
- Commodore - 64
- FBNeo - Arcade Games
- GCE - Vectrex
- GamePark - GP32
- MAME
- Microsoft - MSX
- Mattel - Intellivision
- NEC - PC Engine CD - TurboGrafx-CD
- NEC - PC Engine SuperGrafx
- NEC - PC Engine - TurboGrafx 16
- SNK - Neo Geo CD
- SNK - Neo Geo Pocket Color
- SNK - Neo Geo Pocket
- SNK - Neo Geo
- Magnavox - Odyssey2
- TIC-80
- Sharp - X68000
- Watara - Supervision
- DOS
- DOOM
- ScummVM
- Atomiswave

</details>
