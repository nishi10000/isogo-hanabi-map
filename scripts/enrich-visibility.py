#!/usr/bin/env python3
"""Enrich Isogo hanabi map JSON with lightweight view-estimation metadata.

This intentionally does NOT claim real visibility. It combines:
- distance and bearing to launch points
- approximate elevation fetched from GSI's public elevation endpoint when available
- simple local-context heuristics from the already-reviewed spot metadata

The output is deterministic enough for reviewable JSON diffs and safe for GitHub Pages.
"""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SPOTS_PATH = ROOT / "data" / "spots.json"
EVENTS_PATH = ROOT / "data" / "events.json"
METHOD = "rough_terrain_building_estimate_v0"
COMPUTED_AT = "2026-06-04"

# Conservative fallback elevations in meters. They are only used when the GSI API
# is unavailable and are labelled as fallback/estimated in the data.
FALLBACK_ELEVATIONS = {
    "brillia-isogo-hill-area": 55,
    "hilltop-mall-isogo-area": 58,
    "okamura-3-4-park": 63,
    "mori-miharashi-park": 52,
    "sugita-rinkai-ryokuchi": 4,
    "isogo-umi-no-mieru-park": 8,
    "takigashira-3-park": 54,
    "okamura-park": 68,
    "shin-isogo-negishi-bay-area": 6,
    "yokodai-kita-park": 74,
}
EVENT_FALLBACK_ELEVATIONS = {
    "yokohama-kaikosai": 2,
    "yokohama-night-flowers": 2,
    "minatomirai-smart-festival": 2,
    "kanazawa-hanabi": 2,
}

BURST_HEIGHTS = {
    "yokohama-kaikosai": 150,
    "yokohama-night-flowers": 110,
    "minatomirai-smart-festival": 160,
    "kanazawa-hanabi": 150,
}

VIS_LABELS = {
    "open_view": "見通し良さそう",
    "partial_view": "一部見えそう",
    "high_bursts_only": "高い花火のみ",
    "blocked_likely": "遮られそう",
    "unknown": "未推定",
}


def gsi_elevation(lat: float, lon: float) -> tuple[float | None, str]:
    params = urllib.parse.urlencode({"lat": lat, "lon": lon, "outtype": "JSON"})
    url = f"https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?{params}"
    try:
        with urllib.request.urlopen(url, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
        elev = data.get("elevation")
        if elev in (None, "-----"):
            return None, "gsi_unavailable"
        return round(float(elev), 1), "gsi_dem"
    except Exception:
        return None, "fallback_estimate"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def compass_ja(deg: float) -> str:
    dirs = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"]
    return dirs[int((deg + 11.25) // 22.5) % 16]


def base_context(spot: dict[str, Any]) -> dict[str, Any]:
    txt = " ".join(str(spot.get(k, "")) for k in ["category", "access_note", "warning", "visibility_note", "stroller", "toilet"])
    category = str(spot.get("category", ""))
    is_high = any(w in category for w in ["高台", "内陸高台"]) or "夜景" in txt
    is_water = any(w in category for w in ["水辺", "海沿い", "湾岸", "臨海"])
    residential = any(w in txt for w in ["住宅地", "マンション", "私有地"])
    industrial = any(w in txt for w in ["工業", "港湾", "工場", "岸壁"])
    trees_or_safety = any(w in txt for w in ["樹木", "暗", "安全", "立入禁止"])
    return {
        "is_high": is_high,
        "is_water": is_water,
        "residential_or_private_risk": residential,
        "industrial_or_port_risk": industrial,
        "tree_or_safety_risk": trees_or_safety,
    }


def estimate_status(spot: dict[str, Any], event: dict[str, Any], distance_km: float, elev_delta_m: float) -> tuple[str, float, list[str]]:
    ctx = base_context(spot)
    score = 0.45
    reasons: list[str] = []

    if ctx["is_high"]:
        score += 0.20
        reasons.append("高台/夜景スポットとして紹介されており、地形面では有利な可能性があります。")
    if ctx["is_water"]:
        score += 0.12
        reasons.append("海沿い・湾岸のため、方向が合えば開けた視界を得られる可能性があります。")
    if elev_delta_m >= 30:
        score += 0.13
        reasons.append(f"スポット標高が打上地点より約{round(elev_delta_m)}m高い推定です。")
    elif elev_delta_m <= 5 and not ctx["is_water"]:
        score -= 0.08
        reasons.append("標高差が小さく、低い演出は遮られる可能性があります。")

    if distance_km <= 7:
        score += 0.08
        reasons.append(f"打上地点まで約{distance_km:.1f}kmで比較的近距離です。")
    elif distance_km >= 12:
        score -= 0.12
        reasons.append(f"打上地点まで約{distance_km:.1f}kmあり、低い花火や小さな演出は見えにくい可能性があります。")

    if spot.get("confidence") == "likely":
        score += 0.08
        reasons.append("既存ソース上の確度が『有力』です。")
    elif spot.get("confidence") == "possible":
        score -= 0.04
        reasons.append("花火視認の直接ソースが弱いため『要検証』です。")

    evidence = spot.get("event_evidence", {}).get(event["id"], {})
    if evidence.get("support_level") == "direct_report":
        score += 0.10
        reasons.append("対象または近い花火を見た/見る企画の直接ソースがあります。")

    if ctx["residential_or_private_risk"]:
        score -= 0.06
        reasons.append("住宅地・私有地/管理区域に近く、実際に滞在できる視点は限定されます。")
    if ctx["industrial_or_port_risk"]:
        score -= 0.07
        reasons.append("港湾・工業地帯に近く、設備や立入制限で視界/利用場所が限定される可能性があります。")
    if ctx["tree_or_safety_risk"]:
        score -= 0.05
        reasons.append("樹木・暗所・安全面の現地確認が必要です。")

    # Conservative classification: do not overstate visibility.
    score = max(0.05, min(0.92, score))
    if score >= 0.70:
        status = "partial_view"
    elif score >= 0.55:
        status = "high_bursts_only"
    elif score >= 0.40:
        status = "unknown"
    else:
        status = "blocked_likely"

    if status == "partial_view":
        reasons.insert(0, "高く上がる花火を中心に、一部見える可能性があります。")
    elif status == "high_bursts_only":
        reasons.insert(0, "低い演出は不明で、高く上がる花火のみ見える可能性があります。")
    elif status == "blocked_likely":
        reasons.insert(0, "地形・建物・距離の条件から、遮られる可能性があります。")
    else:
        reasons.insert(0, "データだけでは判断が弱く、現地確認が必要です。")
    return status, round(score, 2), reasons[:5]


def enrich() -> None:
    spots = json.loads(SPOTS_PATH.read_text(encoding="utf-8"))
    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    event_by_id = {e["id"]: e for e in events}

    # Fetch/update event elevations and burst heights.
    for ev in events:
        elev, src = gsi_elevation(ev["launch_lat"], ev["launch_lng"])
        if elev is None:
            elev = EVENT_FALLBACK_ELEVATIONS.get(ev["id"], 2)
        ev["launch_elevation_m"] = elev
        ev["launch_elevation_source"] = src
        ev["estimated_burst_height_m"] = BURST_HEIGHTS.get(ev["id"], 140)
        ev["burst_height_note"] = "一般的な花火の概算値です。公式打上高度ではありません。眺望推定の参考値としてのみ使用。"
        time.sleep(0.25)

    for spot in spots:
        elev, src = gsi_elevation(spot["lat"], spot["lng"])
        if elev is None:
            elev = FALLBACK_ELEVATIONS.get(spot["id"], None)
        if elev is not None:
            spot["elevation_m"] = elev
            spot["elevation_source"] = src

        estimates: dict[str, Any] = {}
        for event_id in spot.get("visible_events", []):
            ev = event_by_id[event_id]
            dist = haversine_km(spot["lat"], spot["lng"], ev["launch_lat"], ev["launch_lng"])
            bearing = bearing_deg(spot["lat"], spot["lng"], ev["launch_lat"], ev["launch_lng"])
            spot_elev = spot.get("elevation_m") or 0
            launch_elev = ev.get("launch_elevation_m") or 0
            delta = spot_elev - launch_elev
            status, score, reasons = estimate_status(spot, ev, dist, delta)
            estimates[event_id] = {
                "status": status,
                "label": VIS_LABELS[status],
                "score": score,
                "method": METHOD,
                "computed_at": COMPUTED_AT,
                "distance_km": round(dist, 1),
                "bearing_deg": round(bearing, 1),
                "bearing_label": compass_ja(bearing),
                "elevation_delta_m": round(delta, 1),
                "estimated_burst_height_m": ev.get("estimated_burst_height_m"),
                "building_obstruction": "rough_unknown",
                "building_note": "建物高さはOSM/PLATEAUの精査前です。住宅・マンション・港湾設備・樹木による遮蔽は現地確認が必要。",
                "reasons": reasons,
            }
            time.sleep(0.05)
        spot["visibility_model"] = estimates

    SPOTS_PATH.write_text(json.dumps(spots, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    EVENTS_PATH.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"enriched {len(spots)} spots and {len(events)} events")


if __name__ == "__main__":
    enrich()
