# Videos

[![Node.js CI](https://github.com/wajeht/videos/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/videos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A private, opinionated, self-hosted video library.

> [!WARNING]
> This project is unfinished and under active development.

## Library layout

The filesystem is the source of truth:

```text
/videos/
├── Standalone video.mp4
├── Standalone video.mp4.json
└── Saved playlist/
    ├── playlist.json
    ├── cover.jpg
    ├── 01 - First video.mp4
    └── Section name/
        └── 01 - Next video.mkv
```

- A video directly under `/videos` is standalone.
- A top-level folder is a playlist.
- One nested folder inside a playlist is a playlist section.
- Deeper folders are ignored and reported during scans.
- Number prefixes set natural order and are removed from display titles.
- Playlist cards use `cover.jpg` or `playlist.jpg` in the playlist folder, or a `cover` path in `playlist.json`. The app serves an optimized 640×360 JPEG copy from the data directory; otherwise it uses the first video’s generated thumbnail.
- Individual videos use generated posters and chapter thumbnails.
- Generated images are stored in the data directory. Source files in the video folder are never changed.

Supported video files include MP4, M4V, MKV, WebM, MOV, AVI, MPEG, and MPG. The app watches the folder and also supports manual and scheduled scans.

`playlist.json` is optional:

```json
{
  "version": 1,
  "title": "Saved playlist",
  "description": "Archived talks",
  "cover": "cover.jpg",
  "authors": ["Jane Smith"],
  "tags": ["Talks", "Technology"],
  "source": {
    "provider": "Example",
    "url": "https://example.com/playlist"
  }
}
```

A video sidecar uses the complete filename plus `.json`, such as `First video.mp4.json`:

```json
{
  "version": 1,
  "title": "First video",
  "authors": ["Jane Smith"],
  "tags": ["Archive"],
  "chapters": [
    { "title": "Introduction", "startSeconds": 0 },
    { "title": "Main topic", "startSeconds": 416 }
  ]
}
```

Playlist authors and tags are inherited by its videos for display, search, and filtering. There are no categories.

## Run with Docker

```bash
docker run --rm \
  --publish 80:80 \
  --env SESSION_SECRET="$(openssl rand -hex 32)" \
  --env AUTH_SETUP_TOKEN="choose-a-one-time-setup-token" \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --cap-add DAC_OVERRIDE \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges \
  --device /dev/dri:/dev/dri \
  --volume videos-data:/data \
  --volume /path/to/videos:/videos:ro \
  ghcr.io/wajeht/videos:latest
```

Open [localhost](http://localhost), enter `AUTH_SETUP_TOKEN`, and create the shared library password. This saves step 1 immediately; refreshing resumes at step 2, where you create your password-protected admin profile. `/dev/dri` enables Intel Quick Sync when a video stream requires re-encoding; CPU video re-encoding is intentionally disabled.

## Docs

- [Development guide](./docs/development.md)
- [Contribution guide](./docs/contribution.md)

## License

Distributed under the MIT License © [wajeht](https://github.com/wajeht).

## Profiles

Enter the shared library password, then choose a profile. Member profiles can be open or password-protected. The admin profile always requires its own password (at least 8 characters).

Each profile has separate watch progress, Continue Watching, playlist completion, next-video selection, and library page size. Autoplay is stored per profile on each browser. The media library and conversions are shared.

Use the profile button in the header to switch. Settings → Profiles lets members edit their own name and lock. Setup creates the only admin profile. The admin can create/delete member profiles, reset their locks, and change the shared library password. Every later profile is a member; roles cannot be changed and the admin cannot be deleted. The shared password alone cannot reset a profile lock.

Changing a profile password requires that profile to be unlocked again on its devices. Changing the shared library password signs out existing sessions. There is no email/password recovery; retain your admin profile password.

This schema uses a fresh database. Recreate an existing SQLite database before running this version; no upgrade migration or compatibility behavior is provided.
