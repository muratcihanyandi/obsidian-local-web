# Obsidian Local Web

Obsidian vault'unu aynı ağdaki herhangi bir tarayıcıdan oku ve düzenle —
telefonun, o eski 32-bit laptopun, tabletin. Tek bir küçük Python dosyası,
sıfır bağımlılık, bulut yok, hesap yok.

Sunucu vault'un bulunduğu bilgisayarda çalışır, `.md` dosyalarını olduğu
yerde okur/yazar ve masaüstündeki Obsidian değişikliği anında görür.

## Özellikler

- **Obsidian görünümü** — Obsidian uygulamasından esinlenen koyu tema,
  dosya gezgini, sekme çubuğu ve callout renkleri.
- **Sıfır bağımlılık** — sadece Python 3.7+ standart kütüphanesi, pip yok.
- **Otomatik vault tespiti** — ilk çalıştırmada vault'u Obsidian'ın kendi
  kayıt dosyasından (bulunamazsa yaygın klasörlerden) bulur; sadece
  bulamazsa sana sorar.
- **Tam düzenleme** — not oluştur, düzenle, kaydet, sil (silinen notlar
  vault içindeki `.trash` klasörüne taşınır, kalıcı silme yapılmaz).
- **Obsidian markdown desteği** — `[[vikilink]]`, `![[gömme]]`, `#etiket`
  (tıklanabilir), callout'lar (`> [!warning]`), **tıklanabilir görev
  kutucuklu** listeler, tablolar, frontmatter, resim gömme.
- **Arama** — tüm notlarda, eşleşen satır önizlemeleriyle.
- **Canlı senkron** — masaüstündeki Obsidian'da yaptığın değişiklik
  tarayıcıda otomatik görünür, tersi de geçerli.
- **Çift dillilik** — Türkçe / İngilizce, tarayıcı diline göre otomatik.
- **Eski donanımda hafif** — framework yok, sade JS.

## Hızlı başlangıç

1. [Python 3](https://www.python.org/downloads/) kur (Windows'ta kurulumda
   *"Add python.exe to PATH"* işaretli olsun).
2. Bu depoyu indir veya klonla.
3. Sunucuyu başlat:
   - **Windows:** `baslat.bat`'a çift tıkla
   - **macOS / Linux:** `./start.sh`
   - **Ya da doğrudan:** `python server.py`
4. Sadece ilk çalıştırmada: vault klasörü otomatik bulunur ve `config.json`'a
   kaydedilir. Bulunamazsa yolu sana sorar.
5. Tarayıcı `http://localhost:8124/` adresinde açılır.

### Başka cihazdan kullanım (LAN)

Sunucu açılışta bir ağ adresi yazar, örnek: `http://192.168.1.20:8124/`.
Bu adresi telefonundan veya laptopundan (aynı Wi-Fi'da) aç.

**Windows'ta** ilk seferde güvenlik duvarı izni ver; ya da `firewall-izni.bat`
dosyasını bir kez yönetici olarak çalıştır (sağ tık → *Yönetici olarak
çalıştır*), kuralı kendisi ekler. macOS/Linux'ta genelde bir şey yapman
gerekmez.

## Komut satırı

```
python server.py                 başlat, tarayıcıyı aç
python server.py --no-browser    tarayıcıyı açmadan başlat
python server.py --vault PATH    belirli bir vault klasörü kullan
python server.py --port 8124     belirli bir port kullan (doluysa sıradakine geçer)
```

## Yapılandırma

`config.json` ilk çalıştırmada `server.py`'nin yanında oluşturulur:

```json
{
  "vault": "C:\\Users\\sen\\Belgeler\\Vault",
  "port": 8124,
  "lang": "auto"
}
```

| Anahtar | Anlamı                                                     |
|---------|------------------------------------------------------------|
| `vault` | Obsidian vault klasörünün tam yolu                         |
| `port`  | Dinlenecek port (doluysa sıradaki boş port denenir)        |
| `lang`  | `auto` (tarayıcı dili), `tr` veya `en`                     |

Yanlış bir vault yolu ile bir kez çalıştırırsan, sunucu vault'u yeniden
aramayı önerir.

## Nasıl çalışır

- Sunucu LAN üzerinde `0.0.0.0` adresine bağlanır ve küçük bir web arayüzü
  sunar.
- Notlar vault'tan UTF-8 `.md` olarak okunur/yazılır (atomik yazma: geçici
  dosya hedefin üzerine taşınır, yarım dosya oluşmaz).
- Silinen notlar yok edilmez, vault içindeki `.trash/` klasörüne taşınır.
- Tarayıcı 8 saniyede bir dosya değişikliği kontrol eder; okuduğun not
  masaüstünde değiştiyse otomatik yenilenir, sen düzenliyorsan üzerine
  yazmak yerine "masaüstünde değişti" uyarısı gösterir.

## Güvenlik notları

- **Bu araçta şifre koruması yoktur.** Güvenilir ev ağı için tasarlandı.
  İnternete açma (port yönlendirme yapma!).
- Aynı notu aynı anda Obsidian'da ve tarayıcıda düzenlemekten kaçın — son
  kaydeden kazanır. Farklı notlar her zaman güvenlidir.
- Notların, vault klasörün kendisi senkronize edilmedikçe (Google Drive,
  OneDrive vb.) makinelerinden dışarı çıkmaz — bu araçtan bağımsız bir konu.

## Dosyalar

| Dosya             | Görevi                                          |
|-------------------|-------------------------------------------------|
| `server.py`       | Sunucunun tamamı (sadece Python standart kütüphanesi) |
| `static/`         | Web arayüzü (HTML/CSS/JS + gömülü marked.js)    |
| `baslat.bat`      | Windows başlatıcı                               |
| `start.sh`        | macOS / Linux başlatıcı                         |
| `firewall-izni.bat` | Windows yardımcı: güvenlik duvarı kuralını ekler (yönetici) |
| `config.json`     | Yerel ayarların (git'e girmez)                  |

Gömülü markdown motoru (`static/marked.min.js`, [marked](https://github.com/markedjs/marked) v12, MIT)
depoya dahildir. Güncellemek için Actions sekmesinden *Vendor marked.js*
workflow'unu çalıştır — ya da dosyayı sil, sunucu bir sonraki açılışta
(checksum doğrulamalı olarak) yeniden indirir.

## Sorun giderme

- **"Python was not found"** — Python 3 kur ve PATH'e eklendiğinden emin ol.
- **Telefon/laptop bağlanamıyor** — aynı Wi-Fi'da mısınız? Windows güvenlik
  duvarında TCP 8124 kuralı var mı? Bazı modemler kablosuz istemcileri
  birbirinden yalıtır ("AP isolation") — bunu kapat.
- **Port dolu** — sunucu otomatik olarak sıradaki boş portu seçer; ekrana
  yazılan adrese bak.
- **Notlar tuhaf görünüyor** — arayüz Obsidian markdown'ını render eder;
  çok özel yapılar (Dataview, Excalidraw blokları, LaTeX) düz metin görünür.

## Lisans

MIT — bkz. [LICENSE](LICENSE). Gömülü [marked](https://github.com/markedjs/marked)
MIT lisanslıdır.

---

English documentation: [README.md](README.md)
