"""Define the supported electricity areas and their official display names."""

AREA_NAMES: dict[str, str] = {
    "01": "北海道電力エリア",
    "02": "東北電力エリア",
    "03": "東京電力エリア",
    "04": "中部電力エリア",
    "05": "北陸電力エリア",
    "06": "関西電力エリア",
    "07": "中国電力エリア",
    "08": "四国電力エリア",
    "09": "九州電力エリア",
    "10": "沖縄電力エリア",
}

ALL_AREA_CODES = tuple(AREA_NAMES)
