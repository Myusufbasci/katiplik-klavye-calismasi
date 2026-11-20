import argparse
import hashlib
import io
import json
import re
import unicodedata
from pathlib import Path
from urllib.request import urlopen
from zipfile import BadZipFile, ZipFile

import pypdfium2


ARSIV_ADRESI = "https://pgm.adalet.gov.tr/Resimler/dokuman/UygulamaliSinavMetinleri.zip"
ARSIV_OZETI = "71ba44eb622424cd9817ea933fbb5b080c4f81eab89a42f53ba1967dd59baa1f"
VARSAYILAN_CIKTI = Path(__file__).resolve().parents[1] / "official-texts.js"
DOSYA_ADI = re.compile(r"MET[İI]N (\d+)\.pdf", re.IGNORECASE)
PDF_BASLIGI = "2025 YILI ZABIT KATİBİ UYGULAMALI SINAV METİNLERİ "


def arsivi_oku(konum):
    if konum is not None:
        return konum.read_bytes()

    with urlopen(ARSIV_ADRESI, timeout=45) as yanit:
        return yanit.read()


def metni_cikar(pdf_verisi, sira):
    with pypdfium2.PdfDocument(pdf_verisi) as belge:
        if len(belge) != 1:
            raise ValueError(f"Metin {sira} için tek sayfalık bir PDF bekleniyor")

        sayfa = belge[0]
        try:
            metin_sayfasi = sayfa.get_textpage()
            try:
                cikti = metin_sayfasi.get_text_range()
            finally:
                metin_sayfasi.close()
        finally:
            sayfa.close()

    cikti = unicodedata.normalize("NFC", " ".join(cikti.split()))
    altbilgi = f" metin {sira}"
    if not cikti.startswith(PDF_BASLIGI) or not cikti.endswith(altbilgi):
        raise ValueError(f"Metin {sira} başlığı veya altbilgisi beklenen biçimde değil")

    metin = cikti[len(PDF_BASLIGI):-len(altbilgi)]
    if not 299 <= len(metin.split()) <= 317 or "\ufffd" in metin:
        raise ValueError(f"Metin {sira} eksik veya hatalı çözümlendi")
    return metin


def metinleri_hazirla(veri):
    if hashlib.sha256(veri).hexdigest() != ARSIV_OZETI:
        raise ValueError("Arşiv Temmuz 2026 sürümüyle eşleşmedi")

    metinler = {}
    sirali_kimlikler = []
    with ZipFile(io.BytesIO(veri)) as arsiv:
        dosyalar = {}
        for dosya in arsiv.namelist():
            eslesme = DOSYA_ADI.fullmatch(dosya.rsplit("/", 1)[-1])
            if eslesme:
                dosyalar[int(eslesme[1])] = dosya

        if sorted(dosyalar) != list(range(1, 31)):
            raise ValueError("Arşivde Metin 1 ile Metin 30 arasındaki PDF'ler bekleniyor")

        for sira in sorted(dosyalar):
            metin = metni_cikar(arsiv.read(dosyalar[sira]), sira)
            kimlik = hashlib.sha256(metin.encode("utf-8")).hexdigest()[:16]
            metinler[kimlik] = metin
            sirali_kimlikler.append(kimlik)

    if len(metinler) != 30:
        raise ValueError("Otuz farklı metin bekleniyor")

    # 2026 zabıt ve icra duyurularında aynı numaralı metinlerin içeriği ortaktır.
    gruplar = {"zabit": sirali_kimlikler, "icra": sirali_kimlikler}
    return (
        "// Adalet Bakanlığının Temmuz 2026 uygulama sınavı metinleri.\n"
        f"const OFFICIAL_JULY_2026_PASSAGES = {json.dumps(metinler, ensure_ascii=False, indent=2)};\n\n"
        f"const OFFICIAL_JULY_2026_ORDER = {json.dumps(gruplar, ensure_ascii=False, indent=2)};\n"
    )


def main():
    parser = argparse.ArgumentParser(description="Temmuz 2026 kâtiplik metinlerini hazırla.")
    parser.add_argument("--arsiv", type=Path, help="Önceden indirilmiş Bakanlık ZIP dosyası")
    parser.add_argument("--cikti", type=Path, default=VARSAYILAN_CIKTI, help="Oluşturulacak dosya")
    args = parser.parse_args()

    try:
        if args.cikti.exists():
            print(f"Metin dosyası zaten hazır. {args.cikti}")
            return

        sonuc = metinleri_hazirla(arsivi_oku(args.arsiv))
        with args.cikti.open("x", encoding="utf-8", newline="\n") as dosya:
            dosya.write(sonuc)
    except (OSError, BadZipFile, ValueError, pypdfium2.PdfiumError) as hata:
        parser.exit(1, f"Metinler hazırlanamadı. {hata}\n")

    print(f"30 metin hazır. {args.cikti}")


if __name__ == "__main__":
    main()
