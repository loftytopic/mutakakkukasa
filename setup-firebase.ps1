# Mutakakkukasa — Firebase Realtime Database (kerran ajettava)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "1) Kirjaudu (selain aukeaa)…"
npx firebase-tools@13.29.0 login

Write-Host "2) Luo projekti (jos ei ole)…"
npx firebase-tools@13.29.0 projects:create mutakakkukasa --display-name "Mutakakkukasa"

Write-Host "3) Avaa Realtime Database konsolissa:"
Write-Host "   https://console.firebase.google.com/project/mutakakkukasa/database"
Write-Host "   Luo tietokanta (europe-west1). Testimoodi riittää alkuun."

Write-Host "4) Rekisteröi Web-sovellus (jos ei ole)…"
npx firebase-tools@13.29.0 apps:create WEB mutakakkukasa-web --project mutakakkukasa 2>$null

Write-Host "5) Kirjoita firebase-config.js …"
npx firebase-tools@13.29.0 apps:sdkconfig WEB --project mutakakkukasa --json |
  node scripts/write-firebase-config.mjs |
  Set-Content -Encoding utf8 firebase-config.js

Write-Host "6) Julkaise tietokantasäännöt…"
npx firebase-tools@13.29.0 deploy --only database --project mutakakkukasa

Write-Host ""
Write-Host "Valmis. Kopioi FIREBASE_ROOM_ID kavereille (sama kaikilla)."
Get-Content firebase-config.js | Select-String "FIREBASE_ROOM_ID"
