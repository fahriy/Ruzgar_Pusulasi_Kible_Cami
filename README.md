# Rüzgâr Pusulası

Leaflet + OpenStreetMap tabanlı, hedef noktaları ve Open‑Meteo rüzgâr verilerini gösteren tarayıcı uygulaması.

## Bu sürümde
- Arayüz baştan tasarlandı; koyu, modern ve daha kullanışlı hale getirildi.
- Kullanıcının konumundaki rüzgâr oku kaldırıldı.
- Rüzgâr açıkken haritanın **tam merkez koordinatındaki** rüzgâr, küçük ve yarı saydam bir merkez göstergesinde görünür.
- Haritayı nereye sürüklersen merkez rüzgârı yeni merkeze göre güncellenir.
- Hedef noktalarının yerel rüzgâr okları ve ileri izdüşümleri korunur.
- Kesik izdüşüm çizgileri inceltildi.
- Rüzgâr API sorgusu 5 saniyede bir yapılır.
- Normal harita / uydu görünümü arasında geçiş yapılabilir.
- Hedef uçları sürüklenebilir.

## GitHub Pages'e yükleme

1. GitHub'da yeni bir repository oluştur. Örnek ad: `ruzgar-pusulasi`
2. Bu klasördeki `index.html`, `style.css`, `app.js` ve `README.md` dosyalarını repository'nin ana dizinine yükle.
3. Repository içinde **Settings → Pages** bölümünü aç.
4. **Build and deployment → Source** alanında `Deploy from a branch` seç.
5. Branch olarak `main`, klasör olarak `/ (root)` seç ve **Save** de.
6. GitHub kısa süre sonra sana `https://KULLANICI-ADIN.github.io/ruzgar-pusulasi/` biçiminde bir adres verir.

GitHub Pages HTTPS kullandığı için tarayıcı konum özelliği localhost dışındaki normal kullanımda da çalışabilir. Kullanıcının yine tarayıcıdan konum izni vermesi gerekir.

## Veri kaynakları
- Harita: OpenStreetMap
- Uydu: Esri World Imagery
- Rüzgâr: Open‑Meteo Forecast API, 10 m rüzgâr hızı/yönü


## Mobil v2
- Telefonda harita ana çalışma alanı olacak şekilde yeniden düzenlendi.
- Alt kısımda 5 büyük mobil kontrol bulunur: Rüzgâr, Uydu, Konum, Hedefler, Menü.
- Gelişmiş kontroller alttan açılan mobil çekmeceye taşındı.
- Hedefler telefon ekranında yatay kaydırılabilir kartlar olarak gösterilir.
- Merkez rüzgâr göstergesi mobilde küçültüldü.
- iPhone güvenli alanı (`safe-area-inset-bottom`) desteklenir.
- Dokunmatik butonlar daha büyük hale getirildi.
- Masaüstü arayüzü korunur; mobil tasarım yalnızca dar ekranlarda devreye girer.


## Kıble ve yön özellikleri
- Kıble modu Kâbe koordinatına büyük daire hattı çizer.
- Kıble açılınca telefon bakış oku otomatik açılır.
- Bakış yönü ile kıble yönü ±3° içinde eşleşirse yeşil hizalama işareti görünür.
- Bakış oku bağımsız olarak açılıp kapatılabilir.
- Merkez rüzgâr göstergesi bağımsızdır ve varsayılan kapalıdır.
- Genel rüzgâr katmanı uygulama açıldığında varsayılan açıktır.
- Hedef rüzgâr oklarında hız etiketi kaldırılmıştır.
- Hedefler silinip eklendikçe 1,2,3... şeklinde yeniden numaralanır.
- Geolocation uygulama içinde tek `watchPosition` ile başlatılır; gereksiz tekrar izin isteme çağrıları engellenmiştir.


## v3 güncellemeleri
- Merkez rüzgâr oku üzerinde hız yazısı kaldırıldı; hız yalnızca sol üst bilgi kartında kalır.
- Rüzgâr güncellemesi 5 dakikaya çıkarıldı.
- Haritaya tıklamak artık doğrudan hedef eklemez. Önce **Hedef Ekle** düğmesine basılır.
- Hedef adları listeden düzenlenebilir.
- Kıble hizalanmasında harita üstündeki yeşil onay işareti kaldırıldı; yalnızca "Kıble ile hizalandı" yazısı görünür.
- Hizalanınca telefon yön oku görünür kalır.
- Cihaz yönü sensörü sürekli dinlenir; telefon çevrildikçe yön oku anlık güncellenir.


## v4 arayüz güncellemeleri
- Harita merkezindeki rüzgâr göstergesinde artık yalnızca ok görünür; yön yazısı ve hız kaldırıldı.
- Açılıp kapanan ayarların tamamı GPS takibiyle aynı switch biçimine çevrildi.
- Mobil ayar çekmecesindeki aç/kapa seçenekleri de switch biçimindedir.
- Sol üstteki harita merkezi rüzgâr bilgi kartı, harita zoom düğmelerinin üstüne taşındı.
