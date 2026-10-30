# Vinyl Orbit: connect your NFC tags (Home Assistant)

Vinyl Orbit only **reads** two helpers that your existing automation already fills in
(`input_text.vinyl_album` and `input_text.vinyl_artist`). It changes nothing in Home Assistant.

You do this on two machines:

- **Any computer with a browser**: create the token in Home Assistant.
- **The Docker machine**: add the token to `.env`, then rebuild.

## Before you start

The new code has to be on the Docker machine. Once it has been merged into `main` and pushed, the `git pull`
in step 3 below fetches it.

## 1. Create the token in Home Assistant

1. Open Home Assistant in a browser and click your name at the bottom of the left sidebar (your profile).
2. Open the **Security** tab and scroll down to **Long-lived access tokens**.
3. Click **Create token**, name it `Vinyl Orbit`, and click OK.
4. Copy the long text it shows. Home Assistant shows it only once, so keep the window open until step 2 is done.

## 2. Add it to `.env` on the Docker machine

Open a terminal on the Docker machine and go into the Vinyl Orbit folder (the one that contains
`docker-compose.yml`; your `.env` file is in there too):

```bash
cd vinyl_orbit
```

Open the settings file:

```bash
nano .env
```

Add these two lines at the bottom, pasting your token after `HA_TOKEN=`:

```
HA_URL=http://192.168.1.214:8123
HA_TOKEN=paste-the-token-here
```

Save and leave nano: press `Ctrl+O`, then `Enter`, then `Ctrl+X`.

## 3. Get the new code, then rebuild and restart

```bash
git pull
```

```bash
docker compose up -d --build
```

## 4. Check that it connected

```bash
docker compose logs --tail 20
```

You should see this line:

```
Home Assistant now-spinning enabled
```

Now tap a record's tag. Within about 10 seconds a play is logged, and any browser that has Vinyl Orbit open
switches to the full-screen **Spinning now** view.

## If something goes wrong

| What you see | What it means |
|---|---|
| The log says it cannot read Home Assistant | The Docker machine cannot reach `192.168.1.214:8123`, or the token was pasted wrong. Create a new token and paste it again. |
| No "enabled" line in the log | One of the two lines in `.env` is missing or misspelled. |
| A tap does nothing | That record is not in your Discogs collection. The log says so once. |
| Nothing opens in a browser tab | The tab must be visible (not hidden behind other windows) and the tap less than 2 minutes old. |

## Good to know

- Tapping the tag of the record that is **already showing** is invisible to Vinyl Orbit, because Home Assistant
  writes the same value again.
- When Home Assistant clears its display (after an hour idle, or when Sonos starts), the Spinning now view closes too.
- If a tag picks the wrong record, add a fix in `data/ha-overrides.json` on the Docker machine. It is read on
  every check, so no restart is needed:

  ```json
  [{ "album": "Amadeus", "artist": "Soundtrack", "releaseId": 2170959 }]
  ```

  The `releaseId` is the number at the end of the record's Discogs URL.
