#!/bin/bash
# ติดตั้งแผง "นัดพอน Nesting Cut" ลง Illustrator บน macOS
# ดับเบิลคลิกไฟล์นี้ (ครั้งแรกอาจต้องคลิกขวา > Open) แล้วปิด-เปิด Illustrator ใหม่
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.nongploy.nestingcut"

# ปลั๊กอินยังไม่ได้เซ็นชื่อ → เปิดโหมดโหลดแผงที่ไม่ได้เซ็น (CEP 9–12 = Illustrator 2019 ขึ้นไป)
for v in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

rm -rf "$DEST"
mkdir -p "$DEST"
( cd "$SRC" && tar --exclude ./install -cf - . ) | ( cd "$DEST" && tar -xf - )

echo ""
echo "ติดตั้งแล้วที่: $DEST"
echo "ปิดแล้วเปิด Illustrator ใหม่ → เมนู Window > Extensions > นัดพอน Nesting Cut"
