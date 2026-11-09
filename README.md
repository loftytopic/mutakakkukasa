# Mutakakkukasa

Kolmen kaverin yhteinen velka (cm / mutakakut). GitHub Pages + Firebase Realtime Database.

## Firebase (yhteinen data)

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. **Build → Realtime Database → Create Database** (sijainti esim. `europe-west1`)
3. Aluksi testisäännöt ok; myöhemmin julkaise `database.rules.json` (Firebase CLI) tai kopioi säännöt konsolissa
4. **Project settings → Your apps → Web** → kopioi config
5. Täytä `firebase-config.js` (malli: `firebase-config.example.js`)
6. Vaihda `FIREBASE_ROOM_ID` pitkään satunnaiseen merkkijonoon (sama kaikilla kavereilla)

**Huom:** `Kuka olet?` pysyy laitteessa — vain velka, osoite, nimet ja wolttaloki synkkaantuvat.

## GitHub Pages

```powershell
cd "C:\Users\jaakk\StudioProjects\Kasanlaskenta ja velanmaksu"
git add -A && git commit -m "Mutakakkukasa"
git push
```

Repo → **Settings → Pages** → Branch **main**, folder **/ (root)**.

Sivu: `https://<github-käyttäjä>.github.io/mutakakkukasa/`

## Linkit kavereille

- Joni (iOS): tavallinen osoite
- Aapo: `?kuka=aapo`
- Jaakko: `?kuka=jaakko`
