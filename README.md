# Skyline Map for Cities: Skylines II

An unofficial adaptation of [hjun1052/skyline-map](https://github.com/hjun1052/skyline-map), licensed under the [GNU Affero General Public License v3.0](LICENSE). The original map viewer and design are credited to hjun1052 and contributors.

## Open a city

1. Install and enable [gansaku's CS2MapView exporter](https://github.com/gansaku/CS2MapView/releases).
2. Load your city in Cities: Skylines II and export it from the mod's options.
3. Choose or drop the original `.cs2map` file. The app reads the map locally in your browser.

File import accepts only `.cs2map` exports in CS2MapView 0.1.1's format. The original project's built-in sample is available from its own button. The map includes search, directions, and a transit schematic with exported stop names. Driving routes estimate speeds and lane directions where the export lacks them. Maps exported with the SkylineMapBusinesses extension can also include company names, activities, addresses, and fares.

## Run locally

The optional **Use online city** entry downloads an encrypted map from this site's `online-city/map.cs2map.enc` and opens it in the browser using the configured access code. A guessable access code offers limited privacy. Maps with the newer export extension can also include population density, household and employment statistics.

Install dependencies with `npm ci` and run `npm run dev`. Use Node.js 20.19+ or 22.12+ (CI uses Node 24). Run `npm run build` for a production build in `dist/`, or `npm run preview` to serve that build locally.

## License and publishing

The upstream AGPL-3.0 license permits modifying and redistributing the project under its terms. GitHub's Fork button is optional. You can use a fork to keep the visible upstream connection or publish in a separate repository.

- Preserve the upstream copyright and license notices and include [LICENSE](LICENSE).
- Prominently mark the modified version and the date of modification. This edition was modified on 2026-11-21 for native CS2MapView imports, map labels and routing, stop names and fares, and a `.cs2map`-only import interface.
- When offering the modified app over a network, offer everyone using it access to the complete Corresponding Source for the deployed version under AGPL-3.0 at no charge. For GitHub Pages, the workflow links to the exact source commit. For other hosting, set `VITE_SOURCE_REPOSITORY` and `VITE_SOURCE_REVISION` before building.
- Check the applicable permissions for any separately licensed assets you add. Exclude private game exports, saves and local configuration.

## GitHub Pages

In the repository containing this website's source, choose **Settings → Pages → GitHub Actions**. Pushes to `main` deploy automatically. You can also run **Deploy to GitHub Pages** from **Actions**. The workflow builds the site for its Pages base path, publishes `dist/`, and links to the source commit. Visitors select their own map files in the browser.

## Credits

- SVGs in `src/lucide-icons/` are from [Lucide](https://github.com/lucide-icons/lucide/tree/c1a02a04d4f3f7049d44567d62b8b06cff0b9103/icons). See the [license notice](public/licenses/lucide.txt).
- The Starbucks, Apple and Aldi Süd SVGs in `src/brand-icons/` are from [Simple Icons](https://github.com/simple-icons/simple-icons/tree/32e030086fdc605196391aab28519b14dc4295b4/icons) ([CC0 project notice](public/licenses/simple-icons.txt)). The Aldi Süd artwork is cropped to its stylized A for the small map badge. The respective owners retain their trademarks. The map uses the marks to identify stores in the fictional city.

- Map exports come from the [CSLMapView](https://steamcommunity.com/sharedfiles/filedetails/?id=845665815) mod. Its original web viewer inspired the format knowledge; no code from it is used.
- Rendering by [MapLibre GL JS](https://maplibre.org/). Font: [Pretendard](https://github.com/orioncactus/pretendard) (SIL OFL 1.1).
- Lane-arrow rules follow [TM:PE](https://github.com/CitiesSkylinesMods/TMPE)'s behaviour.
- The sample city is the maintainer's own city, with labels translated to English.
- Russian translation by [craftersmine](https://github.com/craftersmine).

Cities: Skylines is a trademark of Paradox Interactive. This project is not affiliated with Paradox Interactive or Colossal Order.
