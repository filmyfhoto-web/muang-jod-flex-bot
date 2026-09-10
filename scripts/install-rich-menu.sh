#!/usr/bin/env bash
#
# ติดตั้ง Rich Menu ขึ้น LINE ด้วย curl อย่างเดียว ไม่ต้องลง node_modules
#
#   export LINE_CHANNEL_ACCESS_TOKEN=...
#   ./scripts/install-rich-menu.sh
#
# ใช้ assets/richmenu.json (สร้างจาก scripts/export-rich-menu-json.mjs) กับรูป
# assets/rich-menu.jpg ถ้าอยากใช้รูปของตัวเอง ส่งพาธมาเป็นอาร์กิวเมนต์แรกได้
# ขนาดรูปต้องเป็น 2500x1686 และไม่เกิน 1 MB ตามที่ LINE กำหนด
#
#   ./scripts/install-rich-menu.sh path/to/menu.png
#
# ถ้าใช้ node ได้ scripts/create-rich-menu.js ทำงานเดียวกันและบอกผลละเอียดกว่า
set -euo pipefail

: "${LINE_CHANNEL_ACCESS_TOKEN:?กรุณาตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ก่อนใช้งาน}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MENU_JSON="${ROOT}/assets/richmenu.json"
MENU_IMAGE="${1:-${ROOT}/assets/rich-menu.jpg}"

[[ -f "${MENU_JSON}" ]] || { echo "ไม่พบ ${MENU_JSON} — รัน: node scripts/export-rich-menu-json.mjs" >&2; exit 1; }
[[ -f "${MENU_IMAGE}" ]] || { echo "ไม่พบรูป ${MENU_IMAGE}" >&2; exit 1; }

# Content-Type ต้องตรงกับไฟล์จริง ส่ง image/png ให้ไฟล์ jpg แล้ว LINE ปฏิเสธ
case "${MENU_IMAGE,,}" in
  *.png) CONTENT_TYPE='image/png' ;;
  *.jpg|*.jpeg) CONTENT_TYPE='image/jpeg' ;;
  *) echo "รูปต้องเป็น .png หรือ .jpg เท่านั้น: ${MENU_IMAGE}" >&2; exit 1 ;;
esac

# LINE ไม่รับรูปเกิน 1 MB และจะตอบ error ตอนอัปโหลด ซึ่งอ่านยากกว่าบอกตรงนี้
BYTES="$(wc -c <"${MENU_IMAGE}")"
if (( BYTES > 1048576 )); then
  echo "รูปใหญ่เกินไป: $(( BYTES / 1024 )) KB (LINE รับไม่เกิน 1024 KB)" >&2
  exit 1
fi

# แยก body กับ HTTP status ออกจากกัน เพื่อให้ทุกขั้นตอนรู้ว่าสำเร็จจริงไหม
# ไม่ใช่แค่ curl ทำงานจบ
api() {
  local method="$1" url="$2"; shift 2
  local out status
  out="$(curl -sS -w $'\n%{http_code}' -X "${method}" "${url}" \
    -H "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}" "$@")"
  status="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
  if [[ "${status}" != 2* ]]; then
    echo "ล้มเหลว (HTTP ${status}) ที่ ${method} ${url}" >&2
    echo "${BODY}" >&2
    return 1
  fi
}

echo "1/4 สร้าง Rich Menu…"
api POST 'https://api.line.me/v2/bot/richmenu' \
  -H 'Content-Type: application/json' --data-binary "@${MENU_JSON}"

RICH_MENU_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("richMenuId",""))' <<<"${BODY}")"
[[ -n "${RICH_MENU_ID}" ]] || { echo "ไม่ได้ richMenuId กลับมา: ${BODY}" >&2; exit 1; }
echo "    ${RICH_MENU_ID}"

echo "2/4 อัปโหลดรูป ($(( BYTES / 1024 )) KB, ${CONTENT_TYPE})…"
api POST "https://api-data.line.me/v2/bot/richmenu/${RICH_MENU_ID}/content" \
  -H "Content-Type: ${CONTENT_TYPE}" --data-binary "@${MENU_IMAGE}"

echo "3/4 ตั้งเป็นเมนูเริ่มต้น…"
api POST "https://api.line.me/v2/bot/user/all/richmenu/${RICH_MENU_ID}"

# เมนูเก่าไม่ได้หายไปเองตอนตั้งตัวใหม่เป็นค่าเริ่มต้น มันค้างอยู่ในช่องและกิน
# โควตา ลบทิ้งหลังตัวใหม่ใช้งานได้แล้ว เพื่อไม่ให้เหลือเมนูร้างสะสม
echo "4/4 ลบ Rich Menu เก่า…"
api GET 'https://api.line.me/v2/bot/richmenu/list'
OLD_IDS="$(python3 -c '
import json,sys
keep = sys.argv[1]
data = json.load(sys.stdin).get("richmenus", [])
print("\n".join(m["richMenuId"] for m in data if m.get("richMenuId") != keep))
' "${RICH_MENU_ID}" <<<"${BODY}")"

if [[ -n "${OLD_IDS}" ]]; then
  while read -r id; do
    [[ -n "${id}" ]] || continue
    api DELETE "https://api.line.me/v2/bot/richmenu/${id}" && echo "    ลบแล้ว ${id}"
  done <<<"${OLD_IDS}"
else
  echo "    ไม่มีเมนูเก่าให้ลบ"
fi

echo
echo "เสร็จเรียบร้อยค่ะ 💜  richMenuId: ${RICH_MENU_ID}"
echo "เปิดแชต LINE OA แล้วดูเมนูด้านล่างได้เลย (อาจต้องปิด-เปิดห้องแชตใหม่)"
