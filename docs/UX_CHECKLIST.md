# UI/UX checklist (researched 10 Oct 2026)

Applied to every screen of Missing Blue. Sources at the end.

## Hierarchy and glance-ability (operations dashboards)
- The one or two numbers that answer the screen's question are the largest on screen, at the reading start (top-right in Arabic, top-left in English); secondary figures smaller; details behind progressive disclosure (expandable sections, tabs, the site card).
- Order: headline KPIs → map/trend → breakdown → tables.
- Labels say exactly what a number measures, with its unit and source badge; pair headline numbers with context (a delta or a small trend).
- Round in summary tiles; keep precision only in tables.
- Alerts/highlights only for what needs action (dispatch candidates), not decoration.
- Filters and toggles (radar on/off, date, scenario) always visible with their current state and an easy way back.

## Colour and accessibility (WCAG 2.1)
- Colour carries meaning (status, provenance, pipe class), never decoration; the screen still reads in grayscale (status also has a word or icon).
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text ≥ 24 px); chart marks, map symbols and control borders ≥ 3:1 against their background.
- Visible focus ring on every interactive element; keyboard reachable; touch targets ≥ 44 px on phones.
- Respect `prefers-reduced-motion`.

## Arabic RTL
- Navigation, sidebar, breadcrumbs, sliders and progress run right-to-left; direction-bearing icons (arrows, chevrons, "next") are mirrored; logos, media controls and non-directional icons are not.
- Numbers, ids, units and charts stay left-to-right (isolated with `<bdi>` / `unicode-bidi: isolate`); Latin digits for this audience.
- Arabic text needs more room: ~10–15% larger base size or line-height ≥ 1.6, no letter-spacing, no truncation of Arabic words; Arabic-designed face (IBM Plex Sans Arabic).
- No raw English strings inside the Arabic UI (recorded-run tags, data labels, rule sentences are localized).

## Consistency and layout
- One visual vocabulary on every panel: the same card, badge, button, chip, tab and empty/loading/error states.
- Exactly one primary action per panel.
- Phone layout is restructured (sidebar → drawer, side panel → bottom sheet), not shrunk.
- Map: legend lists only what is drawn; dense layers hidden at low zoom; markers never hide each other; attribution readable.
- Projector: body text ≥ 16 px, key numbers ≥ 32 px, high contrast, nothing important below the fold at 1280×720.

## Sources
- Esri, ArcGIS Dashboards: what is a dashboard; create web maps for dashboards; designing effective dashboards (FedGIS 2021): https://enterprise.arcgis.com/en/dashboards/11.1/get-started/what-is-a-dashboard.htm · https://geopub.epa.gov/ArcGIS/help/en/dashboards/11.3/reference/create-web-maps-for-dashboards.htm · https://www.esri.com/content/dam/esrisites/en-us/events/conferences/2021/fedgis-conference/12308-arcgis-dashboards-designing-effective-dashboards.pdf
- Material Design, bidirectionality: https://m2.material.io/go/design-bidirectionality
- RTL checklists: https://localization.saudisoft.com/?p=38918 · https://globaldev.tech/blog/right-to-left-rtl-website-development-design
- Dashboard principles: https://www.designrush.com/agency/ui-ux-design/trends/dashboard-design-principles · https://www.setproduct.com/blog/effective-dashboard-design-principles · https://www.aufaitux.com/blog/good-dashboard-design/
- WCAG 2.1 SC 1.4.1, 1.4.3, 1.4.11: https://www.w3.org/TR/WCAG21/
