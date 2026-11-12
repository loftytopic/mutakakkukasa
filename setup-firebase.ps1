# Mutakakkukasa — Firebase (kerran / kun tarvitaan)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Realtime Database (kerran käsin, europe-west1):"
Write-Host "  https://console.firebase.google.com/project/mutakakkukasa/database"
Write-Host ""
Write-Host "Kun tietokanta on luotu, aja projektikansiossa:"
Write-Host "  npm run firebase:finish"
Write-Host ""
Write-Host "Julkaise app (hosting):"
Write-Host "  npm run firebase:hosting"
Write-Host ""
Write-Host "WhatsApp-ryhma (vaatii Blaze + Green API tai Make-webhook):"
Write-Host "  cd functions && npm install && cd .."
Write-Host "  firebase functions:config:set whatsapp.chat_id=RYHMA_ID whatsapp.green_instance=... whatsapp.green_token=..."
Write-Host "  npm run firebase:functions"
Write-Host ""
Write-Host "Sovellus: https://mutakakkukasa.web.app"
