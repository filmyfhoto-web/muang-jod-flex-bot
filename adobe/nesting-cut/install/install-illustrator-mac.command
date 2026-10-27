#!/bin/bash
# ติดตั้งแผง "นัดพอน Nesting Cut" ลง Illustrator บน macOS
# ดับเบิลคลิกไฟล์นี้ (ครั้งแรกอาจต้องคลิกขวา > Open) แล้วปิด-เปิด Illustrator ใหม่
set -e
ID="com.nongploy.nestingcut"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$BASE/$ID"

# ปลั๊กอินยังไม่ได้เซ็นชื่อ → เปิดโหมดโหลดแผงที่ไม่ได้เซ็น (CEP 9–14 = Illustrator 2019 ขึ้นไป)
for v in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

# ลบรุ่นเก่าที่ลงไว้ชื่อโฟลเดอร์อื่น — ไม่งั้น Illustrator อาจเปิดรุ่นเก่าแทน
for d in "$BASE"/*/ "/Library/Application Support/Adobe/CEP/extensions"/*/; do
  [ -f "$d/CSXS/manifest.xml" ] || continue
  if grep -q "$ID" "$d/CSXS/manifest.xml" 2>/dev/null; then
    rm -rf "$d" 2>/dev/null || echo "⚠ พบรุ่นเก่าที่ $d — ลบเองด้วยสิทธิ์ผู้ดูแล แล้วติดตั้งใหม่"
  fi
done
# ล้างแคชของแผง ให้เห็นหน้าใหม่ทันที
rm -rf "$HOME/Library/Caches/CSXS/cep_cache/"*nestingcut* 2>/dev/null || true

mkdir -p "$DEST"
( cd "$SRC" && tar --exclude ./install -cf - . ) | ( cd "$DEST" && tar -xf - )

echo ""
echo "ติดตั้งแล้วที่: $DEST"
grep -o 'ExtensionBundleVersion="[^"]*"' "$DEST/CSXS/manifest.xml" | sed 's/ExtensionBundleVersion=/รุ่น /'
echo "ปิด Illustrator ให้สนิทแล้วเปิดใหม่ → เมนู Window > Extensions > นัดพอน Nesting Cut"
echo "เลขรุ่นอยู่มุมล่างขวาของแผง — ตรงกับข้างบนแปลว่าได้รุ่นใหม่แล้ว"
