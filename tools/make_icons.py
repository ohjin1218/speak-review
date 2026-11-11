# 앱 아이콘 PNG 만들기 (외부 라이브러리 없이): 주황 바탕 + 흰 말풍선
import zlib, struct, math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
ORANGE = (0xE8, 0x59, 0x0C)
WHITE = (255, 255, 255)

def png(path, size, maskable):
    S = size
    ss = 3  # 가장자리 부드럽게 (3x3 샘플)
    rows = []
    for y in range(S):
        row = bytearray([0])
        for x in range(S):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    px = (x + (sx + .5) / ss) / S
                    py = (y + (sy + .5) / ss) / S
                    c, a = pixel(px, py, maskable)
                    acc[0] += c[0] * a; acc[1] += c[1] * a; acc[2] += c[2] * a; acc[3] += a
            n = ss * ss
            a = acc[3] / n
            if a > 0:
                row += bytes([round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a * 255)])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)

def in_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def pixel(x, y, maskable):
    # 바탕
    if maskable:
        bg = True
        k = 0.78  # 안전 영역 안으로 줄이기
    else:
        bg = in_round_rect(x, y, 0, 0, 1, 1, 0.22)
        k = 1.0
    if not bg:
        return (0, 0, 0), 0
    # 말풍선 좌표 (가운데 기준으로 k 배)
    u = (x - .5) / k + .5
    v = (y - .5) / k + .5
    bubble = in_round_rect(u, v, 0.2, 0.24, 0.8, 0.66, 0.12)
    # 꼬리
    if not bubble and 0.30 <= u <= 0.46 and 0.62 <= v <= 0.80:
        t = (v - 0.62) / 0.18
        bubble = 0.30 + t * 0.02 <= u <= 0.46 - t * 0.14
    if bubble:
        # 말풍선 안 점 세 개
        for cx in (0.36, 0.5, 0.64):
            if (u - cx) ** 2 + (v - 0.45) ** 2 <= 0.045 ** 2:
                return ORANGE, 1
        return WHITE, 1
    return ORANGE, 1

png(OUT / "icon-192.png", 192, False)
png(OUT / "icon-512.png", 512, False)
png(OUT / "icon-maskable-512.png", 512, True)
print("icons ok")
