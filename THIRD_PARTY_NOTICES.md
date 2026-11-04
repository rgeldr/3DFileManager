# Third-party notices

3D File Library is licensed under the [MIT License](LICENSE). This file lists **direct** runtime and build dependencies declared in `package.json` and `src-tauri/Cargo.toml`, with licenses taken from `package-lock.json`, each crate’s published `Cargo.toml` on crates.io (matching the version in `src-tauri/Cargo.lock`), or the installed npm package manifest where noted.

Permissive licenses below include MIT, Apache-2.0, BSD-style, CC0-1.0, Unlicense, and dual licenses where any listed option is permissive.

## npm (package.json)

| Package | Version (lock) | License |
|---------|----------------|---------|
| `@crabnebula/tauri-plugin-drag` | 2.1.0 | *(not declared)* — see note below |
| `@tauri-apps/api` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.8.2 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-opener` | 2.7.1 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-process` | 2.4.0 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-updater` | 2.14.0 | MIT OR Apache-2.0 |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |
| `three` | 0.180.0 | MIT |

### npm devDependencies (build/test only)

| Package | Version (lock) | License |
|---------|----------------|---------|
| `@tauri-apps/cli` | 2.12.2 | Apache-2.0 OR MIT |
| `@testing-library/react` | 16.3.3 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@types/three` | 0.180.0 | MIT |
| `@vitejs/plugin-react` | 5.2.0 | MIT |
| `@vitest/coverage-v8` | 5.0.4 | MIT |
| `jsdom` | 29.1.1 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vite` | 7.3.7 | MIT |
| `vitest` | 5.0.4 | MIT |

**`@crabnebula/tauri-plugin-drag`:** The published npm package `2.1.0` has no `license` field in `package.json` or on the npm registry. The matching Rust plugin crate `tauri-plugin-drag` **2.1.1** (CrabNebula; resolved in `Cargo.lock`) is **Apache-2.0 OR MIT** per its crates.io `Cargo.toml`.

## Rust (src-tauri/Cargo.toml)

Versions match `src-tauri/Cargo.lock` for the `file-library` package.

| Crate | Version | License |
|-------|---------|---------|
| `base64` | 0.22.1 | MIT OR Apache-2.0 |
| `dirs` | 6.0.0 | MIT OR Apache-2.0 |
| `drag` | 2.1.1 | Apache-2.0 OR MIT |
| `dunce` | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 |
| `flate2` | 1.1.10 | MIT OR Apache-2.0 |
| `image` | 0.25.10 | MIT OR Apache-2.0 |
| `rusqlite` | 0.37.0 | MIT |
| `semver` | 1.0.28 | MIT OR Apache-2.0 |
| `serde` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 |
| `sevenz-rust` | 0.6.1 | Apache-2.0 |
| `sha2` | 0.10.9 | MIT OR Apache-2.0 |
| `tauri` | 2.12.3 | Apache-2.0 OR MIT |
| `tauri-build` | 2.7.2 | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | 2.8.2 | Apache-2.0 OR MIT |
| `tauri-plugin-drag` | 2.1.1 | Apache-2.0 OR MIT |
| `tauri-plugin-opener` | 2.7.1 | Apache-2.0 OR MIT |
| `tauri-plugin-process` | 2.4.0 | Apache-2.0 OR MIT |
| `tauri-plugin-single-instance` | 2.5.5 | Apache-2.0 OR MIT |
| `tauri-plugin-updater` | 2.14.0 | Apache-2.0 OR MIT |
| `trash` | 5.2.9 | MIT |
| `unrar` | 0.5.8 | MIT OR Apache-2.0 *(Rust wrapper; see UnRAR below)* |
| `walkdir` | 2.5.0 | Unlicense/MIT |
| `windows` | 0.52.0 | MIT OR Apache-2.0 |
| `zip` | 2.4.2 | MIT |

## UnRAR (bundled native source)

RAR archive support uses the `unrar` crate, which depends on `unrar_sys`. The **Rust crates** `unrar` / `unrar_sys` **0.5.8** are licensed **MIT OR Apache-2.0** on crates.io, but `unrar_sys` **vendors RARLAB’s UnRAR C++ source**, which is under a **separate, non–OSI-approved license**.

The bundled text is shipped at `vendor/unrar/license.txt` inside the `unrar_sys` crate (same content as in the published crate). In summary:

- UnRAR source may be used in software to **handle RAR archives** without charge.
- You **must not** use it to develop a RAR (WinRAR)–compatible archiver or to **re-create the proprietary RAR compression algorithm**.
- Modified UnRAR source may be redistributed only if the full license paragraph starting at “UnRAR source code” is included in the license, documentation, or source comments.
- The software is provided **“AS IS”** with **no warranty**.

Full license text (excerpt from `unrar_sys` 0.5.8, `vendor/unrar/license.txt`):

> The source code of UnRAR utility is freeware. … UnRAR source code may be used in any software to handle RAR archives without limitations free of charge, but cannot be used to develop RAR (WinRAR) compatible archiver and to re-create RAR compression algorithm, which is proprietary. … THE RAR ARCHIVER AND THE UnRAR UTILITY ARE DISTRIBUTED "AS IS". NO WARRANTY OF ANY KIND IS EXPRESSED OR IMPLIED.

## Non-permissive / special-case summary

| Component | Issue |
|-----------|--------|
| **RARLAB UnRAR** (via `unrar` → `unrar_sys`) | Custom freeware license; **not OSI-approved**; restrictions on RAR compression tooling. |
| **`@crabnebula/tauri-plugin-drag` (npm)** | **No SPDX license** declared on the npm package; use the Rust plugin license above for the same functionality. |

No other **direct** dependency listed above uses GPL, LGPL, or MPL as its sole license identifier in the manifests checked for this file.

Transitive dependencies (for example SQLite inside `rusqlite` with the `bundled` feature) are not enumerated here; regenerate this list when direct dependencies change.
