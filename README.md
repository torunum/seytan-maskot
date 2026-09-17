# Şeytan maskot

**Proje sahibi: [torunum](https://github.com/torunum).** Bu dal takılma sezme geliştirmesini içerir; ana sürümden ayrıdır.

Claude Code çalışırken ekranın sol alt köşesinde duran, ne yaptığını söyleyen komik bir şeytan.
Düşünürken çenesini kaşır, komut çalıştırırken terminale dirgen batırır, izin beklerken ayağını vurur,
iş bitince alevler içinde zıplar.

## Gereksinim

Node.js 22.12 veya üstü ve Claude Code.

## Kurulum

```bash
cd seytan-maskot
npm install        # Electron'u indirir
npm run kur        # hook'ları ~/.claude/settings.json dosyasına ekler (önce yedek alır)
npm start          # maskotu açar
```

Sonra Claude Code'da herhangi bir projede çalışmaya başla. Maskot kendiliğinden tepki verir.
Claude Code içinde `/hooks` yazarak hook'ların eklendiğini görebilirsin.

## Kullanım

Maskotun üstüne tıklarsan dürtersin. Üst üste dürtersen sinirlenir.
Sürükleyerek yerini değiştirebilirsin, konumu hatırlanır.
Sağ tıkla açılan menüden test gösterisini oynatabilir, sol alt köşeye geri koyabilir ya da kapatabilirsin.
Boş kalınca bir süre sonra uyur, dürtünce uyanır.

## Electron kurmadan hızlıca denemek

```bash
node server.js
```

Tarayıcıda `http://127.0.0.1:47620/?demo` adresini aç. Sağ üstteki panelden durumları tek tek deneyebilirsin.
Hook'lar kuruluysa Claude Code olayları tarayıcıdaki maskota da gelir. Bu modda maskot sadece sayfanın
sol alt köşesinde durur, diğer pencerelerin üstünde durması için `npm start` gerekir.

## Kaldırma

```bash
npm run kaldir
```

Sadece maskota ait hook'lar silinir, diğer ayarlarına dokunulmaz.

## Nasıl çalışıyor

```
Claude Code ──hook──> hook.js ──HTTP──> server.js ──SSE──> mascot.html (Electron penceresi)
```

`hook.js` her olayda Claude Code'dan gelen JSON'dan sadece gereken alanları (olay adı, araç adı, komut, dosya adı)
seçip yerel sunucuya gönderir. Prompt metni ve komut çıktıları maskota hiç gitmez.
Hook'lar `async` çalışır, yani Claude Code'u yavaşlatmaz. Maskot kapalıysa sessizce hiçbir şey yapmaz.
Sunucu sadece `127.0.0.1` üzerinde dinler.

`notice.js` olay akışını izleyip takılma desenlerini yakalar: aynı komutun tekrarı, üst üste hata,
aynı dosyaya dönüp durma. Yakaladığında olaya bir not iliştirilir ve maskot kaçıncı kez olduğuna göre
tonu değişen bir şey söyler — önce dalga geçer, sonra yumuşar, uzarsa yanında durur. Zaman ölçmez, sayar;
pencere de susma payı da olay sayısıyla tanımlı.

Eşikleri değiştirmek için `notice.js` başındaki sabitlere, replikleri değiştirmek için `mascot.html`
içindeki `LINES.notice` tablosuna bak.

## Dosyalar

`mascot.html` çizim, animasyonlar, konuşma satırları ve durum mantığı (tek dosya).
`server.js` hook olaylarını maskot durumlarına çevirir.
`notice.js` takılma desenlerini yakalar, `notice.test.js` onun testleri (`npm test`).
`hook.js` Claude Code ile sunucu arasındaki köprü.
`install.js` hook'ları ekler veya kaldırır.
`main.js` ve `preload.js` şeffaf, her zaman üstte duran Electron penceresi.

Konuşma satırlarını değiştirmek için `mascot.html` içindeki `LINES` nesnesini, durum başına poz ve aksesuarları
değiştirmek için `POSES` nesnesini düzenle.

## Notlar

Portu değiştirmek istersen hem maskotu hem Claude Code'u `MASKOT_PORT` ortam değişkeniyle başlat.
`npm run kur`, çalıştırdığın Node'un tam yolunu kaydeder. Node'u başka bir yere taşırsan (ör. nvm ile sürüm değiştirip eskisini silersen) kurulumu tekrar çalıştır.
Claude Code'u WSL içinde, maskotu Windows'ta çalıştırıyorsan WSL'den `127.0.0.1` Windows'a ulaşmayabilir. İkisini aynı tarafta çalıştır.
Linux'ta pencerenin boş alanları tıklamaları alttaki uygulamaya geçirmez (Electron kısıtı). Pencere küçük olduğu için genelde sorun olmaz.

Font: Grandstander (SIL Open Font License), `fonts/` klasöründe.
