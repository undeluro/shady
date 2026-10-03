<p align="center">
  <img src="media/mascot.svg" width="120" alt="Shady's smiling sun mascot" />
</p>
<h1 align="center">shady.</h1>
<p align="center"><strong>A little shade goes a long way.</strong><br/>A cooler way to explore Kraków, one walk at a time.</p>

<p align="center">
  <a href="#the-idea">The idea</a> · <a href="#try-shady">Try Shady</a> · <a href="#take-it-for-a-walk">Take it for a walk</a> · <a href="docs/TECHNICAL.md">Under the hood</a>
</p>

<table>
  <tr><th align="center">Shortest</th><th align="center">More shade</th></tr>
  <tr>
    <td align="center"><img src="media/shortest.png" width="320" alt="Shady on iPhone: the shortest path, with sunny sections in yellow and shade in teal" /></td>
    <td align="center"><img src="media/more_shade.png" width="320" alt="Shady on iPhone: an alternative path that follows more shaded streets between the same endpoints" /></td>
  </tr>
</table>
<p align="center"><strong>Same destination. A cooler journey.</strong></p>

## The idea

A city walk should be about the places you discover. On a sunny day, the most direct route can leave you walking in the sun for much of the journey.

**Shady helps you choose a walk with less sun.** Pick a destination and departure time, then compare **Shortest** with **More shade**. See building shadows and likely tree shade, how much sunny walking you could save, and how many extra minutes it takes. The shaded option stays within **25% extra distance**.

Built for the hackathon, Shady plans walks across Kraków's connected public walking network. Shade combines building shadows at departure with likely tree cover in summer. Trees are an approximation—wooded paths can still have sunny gaps.

## Try Shady

You'll need **Node.js 22.13+**, **uv with Python 3.12**, and **Expo Go** on your phone. Connect the phone and laptop to the same Wi-Fi or hotspot.

**1. Start the city engine** in a terminal:

```sh
cd ~/Developer/shady/backend
uv sync --locked
uv run uvicorn shady.api:app --host 0.0.0.0 --port 8000 --no-access-log
```

The hackathon laptop already has the prepared city data. Give it about 20 seconds to load. On a fresh checkout, follow [city data setup](docs/TECHNICAL.md#rebuild-the-real-data) first—or try a saved walk without the backend.

**2. Start the app** in another terminal:

```sh
cd ~/Developer/shady/mobile
npm ci
EXPO_PUBLIC_API_URL=http://YOUR_MAC_WIFI_IP:8000 npx expo start --go --lan
```

On Mac, `ipconfig getifaddr en0` usually shows your Wi-Fi IP. Replace `YOUR_MAC_WIFI_IP` with it, scan the QR code with your iPhone Camera, and open Shady in Expo Go. Allow Local Network access if asked. If your Mac is also connected by Ethernet, see [phone setup](docs/TECHNICAL.md#run-on-a-phone) to advertise the Wi-Fi address explicitly.

Prefer the iOS simulator or a browser? See the [technical guide](docs/TECHNICAL.md#run-on-a-phone).

## Take it for a walk

1. **Choose your destination.** Search for a place in Kraków, or long press the map to drop a pin. Change **From** to choose your start; the arrow uses your location.
2. **Choose your moment.** Tap **Now** to explore a different departure time. Watch the shade change with the sun.
3. **Compare your paths.** Tap **Shortest** or **More shade**. Teal marks building shade, muted green marks likely tree shade, and yellow marks sun. The cards show the trade-off in distance, time and shade.
4. **Start walk.** Follow the highlighted path with live progress and remaining distance. Keep Shady open; tap the arrow to resume camera following after panning.

**Want the quick demo?** Open the results sheet and choose a saved summer walk at **10:00**, **13:00** or **16:00**. Saved walks work without the backend once Expo has loaded the app, and their previews keep GPS off. **Saved demo** is always clearly labeled.

[How shade works, logs, tests and measured performance →](docs/TECHNICAL.md)

## Sources

Shady connects open city data with the position of the sun:

- **Walking paths, wooded areas and city boundary:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; regional data from [Geofabrik](https://download.geofabrik.de/europe/poland/malopolskie.html).
- **Building footprints and heights:** [GUGiK 3D buildings, LoD1 2024](https://www.geoportal.gov.pl/en/data/other-data/3d-models-of-building/), CC BY 4.0, covering Kraków and neighboring counties.
- **Solar position:** [pvlib](https://pvlib-python.readthedocs.io/en/stable/).
- **Address search:** [Nominatim](https://operations.osmfoundation.org/policies/nominatim/).

[Full attribution and data notes](docs/TECHNICAL.md#sources-and-attribution) · [Demo walkthrough](docs/WALKTHROUGH.md)
