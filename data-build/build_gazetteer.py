import gzip, json, csv, re, math, collections, statistics as st
from pyproj import Transformer
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

def norm(s):
    s = s.lower().replace("&", "and").replace("'", "").replace("’", "").replace(".", "")
    s = re.sub(r"^(the )?(city and county of |city of |county of |royal borough of |london borough of )", "", s)
    s = re.sub(r"\b(council|borough|district|city|county)\b", " ", s) if False else s
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

# ---- councils (mySociety) ----
las = list(csv.DictReader(open("dl/la.csv")))
by_code = {r["local-authority-code"]: r for r in las}
by_gss = {}
for r in las:
    by_gss[r["gss-code"]] = r
    for g in r["former-gss-codes"].split(","):
        if g.strip(): by_gss.setdefault(g.strip(), r)
def current(r, depth=0):
    if r["current-authority"] == "True" or depth > 5: return r
    rb = [x.strip() for x in r["replaced-by"].split(",") if x.strip()]
    return current(by_code[rb[0]], depth + 1) if rb and rb[0] in by_code else r
billing = [r for r in las if r["current-authority"] == "True" and r["lower-or-unitary"] == "True"]
print("billing councils", len(billing))

bandd = {norm(r["name"]): int(r["bandD"]) for r in csv.DictReader(open("bandd.csv"))}
print("band D rows", len(bandd))
alias = {"kings lynn and west norfolk": "kings lynn and west norfolk", "durham": "county durham", "herefordshire": "herefordshire county of",
         "na h eileanan siar": "comhairle nan eilean siar"}
POUND = {"Antrim and Newtownabbey": .004425, "Ards and North Down": .004435, "Armagh City, Banbridge and Craigavon": .005412, "Belfast": .004492,
         "Causeway Coast and Glens": .005101, "Derry City and Strabane": .006655, "Fermanagh and Omagh": .004468, "Lisburn and Castlereagh": .003966,
         "Mid and East Antrim": .005668, "Mid Ulster": .004330, "Newry, Mourne and Down": .004999}
REG = .005559
councils, cidx = [], {}
used = set()
for r in sorted(billing, key=lambda r: r["nice-name"]):
    name = r["nice-name"].strip(); nation = r["nation"]
    b = None; pd = None
    if nation == "Northern Ireland":
        k = next((k for k in POUND if norm(k) == norm(name)), None)
        pd = round(POUND[k] + REG, 6) if k else None
    else:
        for cand in [norm(name), norm(r["official-name"])] + [norm(a) for a in r["alt-names"].split(",") if a.strip()]:
            if cand in bandd: b = bandd[cand]; used.add(cand); break
    cidx[r["local-authority-code"]] = len(councils)
    region = r["region"] if nation == "England" else nation
    councils.append([name, {"England": "england", "Scotland": "scotland", "Wales": "wales", "Northern Ireland": "ni"}[nation], region, r["gov-uk-slug"], b, pd])
missing = [c[0] for c in councils if c[4] is None and c[5] is None]
print("councils", len(councils), "missing tax:", missing)
print("unused band D:", [k for k in bandd if k not in used])

# ---- boundaries ----
gj = json.load(open("la2021.geojson"))
polys, pcodes = [], []
for f in gj["features"]:
    g = f["properties"]["AREACD"]; r = by_gss.get(g)
    if not r: print("no LA for", g, f["properties"]["AREANM"]); continue
    cur = current(r)
    if cur["local-authority-code"] not in cidx:
        print("not billing", cur["nice-name"]); continue
    polys.append(shape(f["geometry"]).buffer(0)); pcodes.append(cidx[cur["local-authority-code"]])
tree = STRtree(polys)
def council_at(lon, lat):
    p = Point(lon, lat)
    for i in tree.query(p):
        if polys[i].contains(p): return pcodes[i]
    i = tree.nearest(p); return pcodes[i]

# ---- GB settlements from OS Open Names via uk-address-lookup ----
d = json.load(gzip.open("pkg/package/data/uk-address.json.gz"))
towns, dists = d["towns"], d["districts"]
lanames = set()
for r in las:
    for k in ("official-name", "nice-name"): lanames.add(r[k].strip().lower())
    for a in r["alt-names"].split(","): lanames.add(a.strip().lower())
groups = collections.defaultdict(list)
for s in d["streets"]:
    dist = dists[s[2]] if s[2] is not None and s[2] < len(dists) else ""
    area = re.match(r"[A-Z]*", dist).group(0)
    groups[(s[1], area)].append((s[5], s[6], dist))
tf = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
out = []
for (ti, area), pts in groups.items():
    name = towns[ti]
    if " - " in name: continue
    if " / " in name:
        a, b = [x.strip() for x in name.split(" / ", 1)]
        w = lambda x: sum(x.lower().count(k) for k in ("dd", "ll", "ff", "wy", "ae", "y ", "pen", "llan", "rh", "ch", "ŵ", "â", "ô"))
        name = f"{a} / {b}" if w(a) <= w(b) else f"{b} / {a}"
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; mx, my = st.median(xs), st.median(ys)
    n = len(pts)
    if name.lower() in lanames:
        spread = st.median([math.hypot(x - mx, y - my) for x, y, _ in pts]) / 1000
        if not (n >= 2000 or (spread <= 5.5 and n >= 60)): continue
    if re.search(r"\b(City of|County|Council)\b", name): continue
    # keep only streets near the median (drop outliers wrongly attached)
    near = [p for p in pts if math.hypot(p[0] - mx, p[1] - my) < 25000] or pts
    n = len(near)
    lon, lat = tf.transform(st.median([p[0] for p in near]), st.median([p[1] for p in near]))
    pcs = [k for k, _ in collections.Counter(p[2] for p in near if p[2]).most_common(3)]
    out.append([name, lat, lon, n, " ".join(pcs)])
print("GB settlements", len(out))
# merge duplicates (same name within 3 km)
out.sort(key=lambda r: -r[3])
kept = []
seen = collections.defaultdict(list)
for r in out:
    dup = any(math.hypot((r[1] - a) * 111, (r[2] - b) * 111 * math.cos(math.radians(r[1]))) < 3 for a, b in seen[r[0]])
    if dup: continue
    seen[r[0]].append((r[1], r[2])); kept.append(r)
print("after merge", len(kept))
# ---- NI towns from GeoNames cities1000 ----
ni = []
for row in csv.DictReader(open("dl/rg/reverse_geocoder-1.5.1/reverse_geocoder/rg_cities1000.csv")):
    if row["cc"] == "GB" and row["admin1"] == "Northern Ireland":
        ni.append([row["name"], float(row["lat"]), float(row["lon"]), None, ""])
print("NI towns", len(ni))
CITIES = {"england": "Bath Birmingham Bradford Brighton Bristol Cambridge Canterbury Carlisle Chelmsford Chester Chichester Colchester Coventry Derby Doncaster Durham Ely Exeter Gloucester Hereford Hull|Kingston upon Hull Lancaster Leeds Leicester Lichfield Lincoln Liverpool London Manchester Milton Keynes|Newcastle upon Tyne Norwich Nottingham Oxford Peterborough Plymouth Portsmouth Preston Ripon Salford Salisbury Sheffield Southampton Southend-on-Sea|St Albans|Stoke-on-Trent Sunderland Truro Wakefield Wells Westminster Winchester Wolverhampton Worcester York",
  "scotland": "Aberdeen Dundee Dunfermline Edinburgh Glasgow Inverness Perth Stirling", "wales": "Bangor Cardiff Newport St Asaph|St Davids|Swansea Wrexham", "ni": "Armagh Bangor Belfast Lisburn Newry Derry|Londonderry"}
CITYSET = set()
for nat, txt in CITIES.items():
    for part in txt.split("|"):
        for w in ([part] if " " in part and part in ("Milton Keynes", "Newcastle upon Tyne", "Kingston upon Hull", "St Albans", "St Asaph", "St Davids") else part.split(" ")):
            if w: CITYSET.add((nat, w))
for extra in [("england","Milton Keynes"),("england","Newcastle upon Tyne"),("england","Kingston upon Hull"),("england","St Albans"),("wales","St Asaph"),("wales","St Davids"),("england","Southend-on-Sea"),("england","Stoke-on-Trent")]: CITYSET.add(extra)
def size(n):
    if n is None: return 2
    return 4 if n >= 2000 else 3 if n >= 500 else 2 if n >= 120 else 1 if n >= 25 else 0
res = []
for r in kept + ni:
    c = council_at(r[2], r[1])
    sz = size(r[3]); nat = councils[c][1]
    if any((nat, part.strip()) in CITYSET for part in r[0].split(" / ")) and (r[3] is None or r[3] >= 120): sz = 5
    res.append([r[0], round(r[1], 4), round(r[2], 4), c, sz, r[4]])
res.sort(key=lambda r: r[0])
json.dump({"councils": councils, "towns": res}, open("gazetteer.json", "w"), separators=(",", ":"), ensure_ascii=False)
import os; print("bytes", os.path.getsize("gazetteer.json"))
print(collections.Counter(councils[r[3]][1] for r in res))
for q in ["Lincoln", "Peterborough", "Ballymena", "Tobermory", "Hay-on-Wye", "Grantham", "Newport", "Bangor", "Ripon", "Cardiff"]:
    print([ (r[0], councils[r[3]][0], r[4], r[5]) for r in res if q in r[0].split(" / ")])
print(collections.Counter(r[4] for r in res))

# featured places -> council index
src = open("../geo/data.js").read() + open("../geo/extra.js").read()
feat = {}
for m in re.finditer(r'id: "([a-z]+)", name: "[^"]+", nation: "[a-z]+", region: "[^"]+", lat: ([-\d.]+), lon: ([-\d.]+)', src):
    feat[m.group(1)] = council_at(float(m.group(3)), float(m.group(2)))
print("featured", len(feat), {k: councils[v][0] for k, v in list(feat.items())[:60]})
json.dump({"councils": councils, "towns": res, "feat": feat}, open("gazetteer.json", "w"), separators=(",", ":"), ensure_ascii=False)
