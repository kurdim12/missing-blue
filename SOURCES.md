# Missing Blue: sources (verified 10 Oct 2026)

| Dataset / claim | Source | Licence / status |
|---|---|---|
| NISAR L2 GCOV radar, track 151 frame 73, 4/16/28 Sep 2026 | https://asf.alaska.edu/notices/nisar-l-band-data-now-publicly-available/ ; https://search.asf.alaska.edu | NASA open data, PROVISIONAL |
| Karak water network (layer 6, 8,779 records) | https://www.arcgis.com/home/item.html?id=7f8adf3ae966453f8cec976d9c35ef48 | Public, NO licence stated; publisher "AJI Group" unconfirmed |
| Copernicus DEM GLO-30 | https://registry.opendata.aws/copernicus-dem/ | Copernicus DEM licence, credit © DLR/Airbus provided under COPERNICUS |
| Rain 15 Aug–30 Sep 2026 (0.0 mm between passes) | https://open-meteo.com/en/docs/historical-weather-api | ERA5 via Open-Meteo, CC BY 4.0 |
| Land cover at spots 2023–2025 | https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer | Impact Observatory / Microsoft / Esri, Living Atlas terms |
| NRW 41% (Aug 2026), target 25% by 2040 | https://www.petra.gov.jo/en/news/water-loss-cut-to-41-exceeding-target | Verified |
| NRW ~50% (2020) | https://agwkp.unescwa.org/sites/default/files/2023-10/National_Water_Strategy_2023-2040_Summary-English_-ver2-%20Jordan.pdf | Verified |
| L-band 24 cm | https://science.nasa.gov/mission/nisar/ | Verified |
| 12-day repeat | https://www.jpl.nasa.gov/press-kits/nisar/mission-overview | Verified |
| GCOV 10/20 m posting | https://nisar-docs.asf.alaska.edu/gcov/ | Verified (ours 20 m) |
| EPANET public domain; WNTR (EPA/Sandia) | https://www.epa.gov/water-research/epanet ; https://github.com/USEPA/WNTR | Verified |
| Government AI leak project (Smart Transformation) | https://menastartupdigest.com/?p=47589 | Context |
| ASTERRA commercial L-band leak detection | https://asterra.io/ | Context |
| Satellite basemap: Esri World Imagery (default basemap) | https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x} ; item https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 | REAL imagery. Esri Master License Agreement, attribution required: "Esri, Vantor, Earthstar Geographics, and the GIS User Community". Non-commercial hackathon demo. Online only, never cached |
| Basemap labels: Esri World Transportation (roads) + World Boundaries and Places (place names) | https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x} ; https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x} | REAL. Esri Master License Agreement, attribution required: "Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community". Non-commercial hackathon demo. Online only |
| Optional 3D terrain: AWS Terrain Tiles, Terrarium encoding | https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png ; https://registry.opendata.aws/terrain-tiles/ | REAL. Open data on AWS (managed by Mapzen, a Linux Foundation project); attribution required for its listed sources: https://github.com/tilezen/joerd/blob/master/docs/attribution.md . Online only |
| "Map" basemap (the other choice on the switch) | https://tile.openstreetmap.org/{z}/{x}/{y}.png ; https://www.openstreetmap.org/copyright | © OpenStreetMap contributors, ODbL. Online only |

Not proven: no wet spot is a confirmed leak. Position ±50 m. Twin demand/tank levels assumed. W3 is open rangeland, not built-up.

## Basemap and 3D terrain (checked 10 Oct 2026)

The map's background is for orientation only. It shows the ground; it does not show leaks, and nothing in the app is computed from it.

- **Default basemap: Esri World Imagery**, natural colour, with the Esri roads and place-name overlays on top of the photo and below every data layer. Tile URLs use the order `{z}/{y}/{x}`. All three returned HTTP 200 over Karak (31.18 N, 35.70 E).
- **Credits, as the services state them.** World Imagery: "Esri, Vantor, Earthstar Geographics, and the GIS User Community" (the service's `copyrightText` and the item's credits; older versions of this credit named Maxar instead of Vantor). Roads and places: "Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community" (the items' credits). The map shows the imagery credit whenever the satellite basemap is on.
- **Terms.** All three Esri items say: "This work is licensed under the Esri Master License Agreement", attribution required. We use them for a non-commercial hackathon demo. The items also say the layers are not intended for exporting tiles for offline use, so we do not cache them. Any production use needs its own check of Esri's terms.
- **Capture date is not the radar date.** Imagery dates vary by place and zoom. For Karak, Esri's imagery metadata gives the same image at W7 (31.05727 N, 35.68692 E), W3 (31.21237 N, 35.75522 E) and Karak Castle (31.1806 N, 35.7014 E): **WorldView-2, captured 27 May 2020**, 0.5 m source resolution, credited to Vantor, used at zoom 12–19. The radar passes are 4, 16 and 28 Sep 2026. Esri can replace the image at any time. To re-check at W7: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/13/query?geometry=35.68692,31.05727&geometryType=esriGeometryPoint&inSR=4326&outFields=SRC_DATE,SRC_DESC,SRC_RES,NICE_DESC&returnGeometry=false&f=pjson
- **Optional 3D: AWS Terrain Tiles** (Terrarium PNG, `{z}/{x}/{y}` order, maxzoom 15), off by default, desktop maps only. Visual relief only: the hydraulic twin's elevations come from Copernicus DEM GLO-30, not from these tiles. Attribution is required for the sources listed in the tilezen/joerd attribution page; its global sources include SRTM and GMTED2010 (courtesy of the U.S. Geological Survey) and ETOPO1 (NOAA). Short credit: "Terrain: Mapzen / AWS Terrain Tiles (SRTM, GMTED2010, ETOPO1 and others)".
- **Offline.** None of these is needed. Offline, or after repeated tile errors, the map falls back to a plain dark ground and every data layer (pipes, wet spots, radar overlays) still works. The OpenStreetMap "Map" style stays available on the switch.
