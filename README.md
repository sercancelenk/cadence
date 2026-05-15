# Leeadman

Mac ve Windows için **lokal** liderlik çalışma alanı: çoklu ekip, her ekipte **Kendim** ve **Liderim** (üst liderinle ilişki), ekip üyeleri, isteğe bağlı **kategori** (ör. Serüven), görev / hedef / not / doküman, hatırlatıcılar, **açık/koyu tema**, isteğe bağlı **PIN** kilidi.

---

## Hızlı başlangıç (geliştirme)

1. **Node.js 20+** kurulu olsun.
2. Repoyu klonla:
   ```bash
   git clone https://github.com/<KULLANICI_ADIN>/leeadman.git
   cd leeadman
   ```
3. Bağımlılıkları yükle:
   ```bash
   npm install
   ```
4. Uygulamayı Electron ile çalıştır:
   ```bash
   npm run dev
   ```
   Tarayıcıda tek başına Vite kullanmak istersen: `npm run build:web` sonrası `npm run preview` (veri bu modda `localStorage`’a gider; tam deneyim için Electron kullan).

### Geliştirici mi, son kullanıcı mı?

| Kim | Ne yapar? |
|-----|-----------|
| **Geliştirici** (kaynak koddan çalıştıran) | Repoyu klonlar, `npm install` / `npm ci`, `npm run dev` veya `npm run build` çalıştırır. |
| **Son kullanıcı** (masaüstünde tıklayıp kullanan) | **`npm install` gerekmez.** GitHub **Releases**’tan indirilen **`.dmg`** (macOS) veya Windows kurulum dosyasını çalıştırır; uygulama Electron ile paketlendiği için Node ayrıca kurulmaz. |

DMG / kurulum sihirbazı hissi, `electron-builder` çıktısıdır; `npm install` sadece projeyi derleyen ortam içindir.

---

## GitHub’a yükleme (ilk kurulum)

1. GitHub’da boş bir repo oluştur (ör. `leeadman`).
2. Yerelde remote ekle ve ilk push:
   ```bash
   git remote add origin https://github.com/<KULLANICI_ADIN>/leeadman.git
   git push -u origin main
   ```
3. **`package.json`** içinde şu alanları kendi kullanıcı veya **organizasyon** adınla değiştir:
   - `repository.url` içindeki `YOUR_GITHUB_USERNAME`
   - `build.publish[0].owner` içindeki `YOUR_GITHUB_USERNAME`  
   (İstersen CI’da `scripts/patch-publish.mjs` bunu otomatik yazar; aşağıdaki GitHub Actions buna güvenir.)

---

## Kurulumlu uygulama üretme (yerelde)

```bash
npm run build
```

Çıktı `release/` klasöründe (`.dmg`, `.zip` vb.). GitHub’a yüklemek için Actions kullanırken `GH_TOKEN` workflow içinde verilir; yerelde publish denemek istersen [electron-builder publish](https://www.electron.build/configuration/publish) dokümantasyonuna bak.

---

## Commit → Actions → Bilgisayara kurma (adım adım)

Aşağıdaki sıra, kodu GitHub’a alıp **Release** workflow’u ile paket üretip **Mac’e kurmayı** anlatır (Windows paketi bu workflow’da `macos-latest` ile üretilmez; Windows için ayrı bir iş veya yerel `npm run build` gerekir).

### Önkoşullar

1. GitHub’da repo oluşturulmuş ve `git remote` bu repoya işaret ediyor olsun.
2. Repo **Settings → Actions → General → Workflow permissions** bölümünde **Read and write** seçili olsun (Release workflow’unun GitHub’a yüklemesi için).

### Adımlar

1. **Yerelde `package.json` düzelt (bir kez)**  
   `repository.url` ve `build.publish[0].owner` içindeki `YOUR_GITHUB_USERNAME` değerini kendi GitHub kullanıcı veya organizasyon adınla değiştir. *(CI zaten `patch-publish.mjs` ile owner’ı eşler; yine de `repository.url` doğru olsun.)*

2. **Değişiklikleri commit et**
   ```bash
   git status
   git add -A
   git commit -m "Açıklayıcı commit mesajın"
   ```

3. **`main` dalına push et**
   ```bash
   git push -u origin main
   ```
   Push sonrası **Release** workflow’u otomatik başlar (`.github/workflows/release.yml`).

4. **İstersen push etmeden manuel çalıştır**  
   GitHub’da repo → **Actions** → sol menüden **Release** → sağ üst **Run workflow** → dal olarak **`main`** seç → **Run workflow**.  
   *(Mevcut `main` kodundan bir paket üretir; yeni commit push etmediysen bile çalışır.)*  
   **Not:** **Run workflow** düğmesi, `workflow_dispatch` içeren `release.yml` sürümü `main`’e push edildikten sonra görünür; ilk kez ekliyorsan önce bu dosyayı push et.

5. **Koşunun bitmesini bekle**  
   Aynı **Actions** ekranında iş akışına tıkla; yeşil tik olunca bitti.

6. **İndirilebilir dosyayı al**  
   Repo → **Releases** (veya sağ sütunda **Releases** linki) → en üstteki sürüme gir → **Assets** altından **`.dmg`** (veya listelenen zip/app) dosyasını indir.

7. **Mac’e kur**  
   DMG’yi aç → **Leeadman** uygulamasını **Uygulamalar** klasörüne sürükle. İlk açılışta Gatekeeper uyarısı çıkarsa Sistem Ayarları → Gizlilik ve Güvenlik’ten “Yine de Aç” veya imzalama/Apple ID akışına göre ilerle.

8. **Kullan**  
   Launchpad, Spotlight veya Dock’tan **Leeadman**’ı aç. Masaüstüne kısayol istersen Finder’dan **Uygulamalar** içindeki simgeye sağ tıklayıp **Takma ad oluştur** ile masaüstüne kopyalayabilirsin.

**Not:** Her başarılı Release koşusu yeni bir GitHub Release ve sürüm numarası (`0.2.<run_number>`) üretebilir; sık push manuel denemelerde çok sayıda release oluşturur. Sadece gerektiğinde **Run workflow** kullanmak da mümkündür.

---

## Otomatik sürüm (`main` push ve manuel tetikleme)

Bu repoda `.github/workflows/release.yml` tanımlıdır:

- **`main`** dalına her **push**’ta macOS üzerinde derleme çalışır.
- **`workflow_dispatch`** ile **Actions** ekranından **elle çalıştırma** da mümkündür (push gerekmez).
- Sürüm numarası **`0.2.<GitHub run number>`** olarak ayarlanır (her koşu benzersiz).
- `scripts/patch-publish.mjs` ile `build.publish.owner` = `github.repository_owner` yapılır.
- CI’da **`npm run build:release`** (`electron-builder --publish always`) çalışır; böylece etiket olmadan da **GitHub Release** ve `.dmg` yüklenir. Yerelde sadece paket üretmek için `npm run build` yeterlidir (GitHub’a yüklemez).
- `electron-builder` + `GH_TOKEN` ile GitHub’a yüklenir (repo **public** ise `GITHUB_TOKEN` yeterli; private için ayrı PAT gerekebilir).

Kontrol için `.github/workflows/ci.yml` ile PR/push’ta `tsc` + `vite build` koşar.

---

## Sorun giderme: Actions yeşil ama Releases boş

**Sık neden:** `electron-builder` varsayılan olarak GitHub’a yüklemeyi çoğunlukla yalnızca **git etiketi** varken yapar; CI’da etiket olmayınca derleme **başarılı** görünür fakat **Release oluşmaz**.

**Çözüm:** Bu repoda CI artık `npm run build:release` kullanır; bu komut `electron-builder --publish always` ile her koşuda GitHub Release + varlıkları yükler. Güncel `main`’i push edip Release workflow’unu yeniden çalıştır.

Ayrıca kontrol et: **Settings → Actions → General → Workflow permissions** = **Read and write**.

---

## Uygulama içi güncelleme

Paketlenmiş (.app) sürüm açıldığında `electron-updater` GitHub Releases üzerinden güncelleme kontrol eder. `repository` / `publish` doğru olmalıdır. Geliştirme modunda (`npm run dev`) güncelleme yoktur.

---

## Veri ve güvenlik

- Veri dosyası (Electron): `~/Library/Application Support/Leeadman/` (macOS) altında `leeadman-data.json` benzeri yol — **Ayarlar** ekranında tam yol gösterilir.
- **PIN:** Uygulama açılışında ek koruma; veri dosyası şifrelenmez. Hassas notlar için disk şifreleme ve güçlü cihaz kilidi önerilir.
- **Yedek:** Ayarlar → JSON dışa / içe aktar.

---

## Özellik özeti

| Özellik | Açıklama |
|--------|----------|
| Çoklu ekip | Ekipler listesi; her ekip ayrı kişi ve kayıt kümesi |
| Kendim / Liderim | Her ekipte sabit iki profil; üst liderinle hedef ve notları ayır |
| Kategori | Kayıtlarda isteğe bağlı etiket; öneriler: Serüven, Operasyon, … |
| Tema | Açık / koyu; tercih tarayıcıda saklanır |
| PIN | İsteğe bağlı açılış kilidi (Electron) |

Sorular ve katkılar için GitHub **Issues** kullanabilirsin.
