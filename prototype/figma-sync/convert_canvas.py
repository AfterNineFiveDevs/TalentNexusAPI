"""
Convert the Claude design canvas boards (.dc.html, inline-styled flex/grid markup) into compact
layout specs that kit.js turns into Figma auto-layout frames.

Usage:  python3 convert_canvas.py <canvas_project_dir>
Writes: specs/<page>.json  (one file per Figma page)

Node format (short keys keep each Figma call under its size limit):
  F  frame  {k:"F", d:"V"|"H", g:gap, p:[t,r,b,l], bg, bd, bw, dash, r, w, h, fill, grow, hug, al, jc, wrap, c:[...]}
  T  text   {k:"T", s:style, c:color, v:text, fill, grow}
  I  icon   {k:"I", n:name, z:size, c:color}
  R  rect   {k:"R", w, h, bg, r, fill, grow, bd, dash}
Colours are design-token names (ink, accent, good-soft...) or raw hex when no token matches.
"""
import json, os, re, sys
from html.parser import HTMLParser

TOKENS = {"#141a1f": "ink", "#4a5560": "ink-2", "#77828e": "ink-3", "#ffffff": "paper", "#f4f6f8": "paper-2", "#d9dfe5": "line",
          "#b4bec8": "line-2", "#1b5e8c": "accent", "#e7f0f6": "accent-soft", "#1f6b45": "good", "#e4f1ea": "good-soft", "#8a5a12": "warn",
          "#fbf0dd": "warn-soft", "#8c2f2f": "stop", "#f8e7e7": "stop-soft", "#5a646e": "neutral", "#edeff2": "neutral-soft"}
ICON_PATHS = {}  # filled from the icon table in kit.js so both sides agree
STYLES = {"t-display": "display", "t-title": "title", "t-sub": "subtitle", "t-body": "body", "t-strong": "body-strong", "t-meta": "meta", "t-micro": "micro"}
INLINE = {"span", "a", "strong", "b", "em", "label", "button"}
SKIP = {"script", "style", "helmet", "head", "title", "meta", "link"}

def col(v):
    v = v.strip().lower()
    if v in ("transparent", "none", ""):
        return None
    if v.startswith("#") and len(v) == 4:
        v = "#" + "".join(ch * 2 for ch in v[1:])
    return TOKENS.get(v, v if v.startswith("#") else None)

def px(v):
    m = re.match(r"(-?[\d.]+)px", v.strip())
    return float(m.group(1)) if m else None

def parse_style(s):
    out = {}
    for part in (s or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out

def box4(v):
    nums = [px(x) or 0 for x in v.split()]
    if len(nums) == 1: return [nums[0]] * 4
    if len(nums) == 2: return [nums[0], nums[1], nums[0], nums[1]]
    if len(nums) == 3: return [nums[0], nums[1], nums[2], nums[1]]
    return nums[:4]

class El:
    def __init__(self, tag, attrs):
        self.tag, self.a, self.kids = tag, dict(attrs), []
    @property
    def cls(self): return (self.a.get("class") or "").split()
    @property
    def st(self): return parse_style(self.a.get("style"))

class Tree(HTMLParser):
    VOID = {"meta", "link", "input", "br", "img", "hr", "path", "circle", "rect"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = El("root", []); self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        e = El(tag, attrs); self.stack[-1].kids.append(e)
        if tag not in self.VOID: self.stack.append(e)
    def handle_startendtag(self, tag, attrs):
        self.stack[-1].kids.append(El(tag, attrs))
    def handle_endtag(self, tag):
        if tag in self.VOID: return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]; break
    def handle_data(self, d):
        if d.strip(): self.stack[-1].kids.append(d)

def text_of(e):
    if isinstance(e, str): return e
    if e.tag == "br": return "\n"
    if e.tag in ("svg", "input"): return ""
    return "".join(text_of(k) for k in e.kids)

def svg_icon(e):
    inner = "".join(svg_child(k) for k in e.kids if not isinstance(k, str))
    name = ICON_PATHS.get(inner)
    if not name: return None
    return {"k": "I", "n": name, "z": int(float(e.a.get("width", 18))), "c": col(e.a.get("stroke", "#141a1f")) or "ink"}

def svg_child(k):
    attrs = "".join(f' {a}="{b}"' for a, b in k.a.items())
    return f"<{k.tag}{attrs}></{k.tag}>"

def text_style(e, inherited):
    s, c = inherited
    for cl in e.cls:
        if cl in STYLES: s = STYLES[cl]
    if e.tag in ("strong", "b") and s in ("body", None): s = "body-strong"
    st = e.st
    if "color" in st and col(st["color"]): c = col(st["color"])
    if "font-size" in st:
        fs = px(st["font-size"])
        if fs and fs >= 34: s = "hero"
        elif fs and fs >= 26 and s not in ("display",): s = "display"
    return s, c

def is_textual(e):
    """Element whose whole content is text (no block children worth keeping)."""
    for k in e.kids:
        if isinstance(k, str): continue
        if k.tag in ("svg", "input", "textarea", "select", "img"): return False
        if k.tag in ("strong", "b", "em", "br", "span", "a") and is_textual(k) and not k.st.get("display", "").endswith("flex") and not k.st.get("background"):
            continue
        return False
    return bool(text_of(e).strip())

def conv(e, inh=("body", "ink"), parent_dir="V"):
    if isinstance(e, str):
        t = " ".join(e.split())
        return [{"k": "T", "s": inh[0], "c": inh[1], "v": t}] if t else []
    if e.tag in SKIP: return []
    st = e.st
    if st.get("left", "").startswith("-9999") or (st.get("position") == "absolute" and st.get("opacity") == "0"): return []
    if e.tag == "svg":
        ic = svg_icon(e); return [ic] if ic else []
    s, c = text_style(e, inh)

    # Form controls
    if e.tag == "input":
        if e.a.get("type") == "checkbox":
            on = "checked" in e.a
            if e.a.get("role") == "switch": return []
            return [{"k": "R", "w": 20, "h": 20, "r": 4, "bg": "accent" if on else "paper", "bd": None if on else "line-2", "chk": 1 if on else 0}]
        val = e.a.get("value", "") or e.a.get("placeholder", "")
        fr = frame_from(e, st, parent_dir, extra_cls=["inp"])
        fr["c"] = [{"k": "T", "s": "body", "c": "ink-3" if "#77828e" in st.get("color", "") else "ink", "v": val or " "}]
        if "border" in st or "border-color" in st:
            pass
        return [fr]
    if e.tag == "textarea":
        fr = frame_from(e, st, parent_dir, extra_cls=["inp"])
        fr.update({"d": "V", "p": [12, 12, 12, 12], "h": px(st.get("min-height", "96px")) or 96})
        fr["c"] = [{"k": "T", "s": "body", "c": "ink", "v": " ".join(text_of(e).split()), "fill": 1}]
        return [fr]
    if e.tag == "select":
        fr = frame_from(e, st, parent_dir, extra_cls=["inp"])
        opt = next((k for k in e.kids if not isinstance(k, str) and k.tag == "option"), None)
        fr["c"] = [{"k": "T", "s": "body", "c": "ink", "v": text_of(opt).strip() if opt else ""}]
        return [fr]
    if e.tag == "table":
        return [table(e)]

    # Pure text element -> one text node
    if is_textual(e) and not st.get("display") and "card" not in e.cls and "btn" not in e.cls and not st.get("background") and not st.get("border") and not st.get("padding"):
        t = " ".join(text_of(e).split())
        node = {"k": "T", "s": s, "c": c, "v": t}
        if st.get("text-align") == "center": node["ta"] = "C"
        if st.get("text-decoration") == "line-through": node["strike"] = 1
        return [node]

    fr = frame_from(e, st, parent_dir)
    kids = []
    for k in e.kids:
        kids.extend(conv(k, (s, c), fr["d"]))
    # merge adjacent text runs in inline flows
    merged = []
    for k in kids:
        if merged and k["k"] == "T" and merged[-1]["k"] == "T" and not fr.get("flexy"):
            merged[-1]["v"] = (merged[-1]["v"] + " " + k["v"]).strip()
        else:
            merged.append(k)
    fr["c"] = merged
    fr.pop("flexy", None)
    if not merged and not fr.get("bg") and not fr.get("bd") and not fr.get("h"):
        return []
    # Unwrap pointless single-child wrappers
    if len(merged) == 1 and not any(fr.get(x) for x in ("bg", "bd", "p", "w", "h", "r")) and fr.get("g", 0) == 0:
        only = merged[0]
        for key in ("grow", "fill", "hug"):
            if fr.get(key): only[key] = fr[key]
        return [only]
    return [fr]

def frame_from(e, st, parent_dir, extra_cls=()):
    cls = set(e.cls) | set(extra_cls)
    disp = st.get("display", "")
    fr = {"k": "F", "d": "V", "n": e.a.get("aria-label") or e.tag}
    if e.tag in INLINE or disp == "inline-flex" or "btn" in cls:
        fr["d"] = "H"; fr["hug"] = 1
    if disp in ("flex", "inline-flex"):
        fr["d"] = "V" if st.get("flex-direction", "row").startswith("column") else "H"; fr["flexy"] = 1
    if disp == "grid":
        fr["d"] = "H"; fr["flexy"] = 1
        fr["cols"] = st.get("grid-template-columns", "")
        if "column-gap" in st: fr["g"] = px(st["column-gap"]) or 0
    if st.get("flex-wrap") == "wrap": fr["wrap"] = 1
    if "gap" in st: fr["g"] = px(st["gap"].split()[-1]) or 0
    if "padding" in st: fr["p"] = box4(st["padding"])
    for side, i in (("padding-top", 0), ("padding-right", 1), ("padding-bottom", 2), ("padding-left", 3)):
        if side in st: fr.setdefault("p", [0, 0, 0, 0])[i] = px(st[side]) or 0
    if "padding-block" in st:
        v = box4(st["padding-block"]); fr.setdefault("p", [0, 0, 0, 0]); fr["p"][0] = v[0]; fr["p"][2] = v[2] if len(st["padding-block"].split()) > 1 else v[0]
    bg = st.get("background") or st.get("background-color")
    if bg and col(bg.split()[0]): fr["bg"] = col(bg.split()[0])
    b = st.get("border")
    if b and b != "0":
        m = re.match(r"([\d.]+)px (solid|dashed|dotted) (#[0-9a-fA-F]{3,6})", b)
        if m: fr.update({"bw": float(m.group(1)), "bd": col(m.group(3))}); fr["dash"] = 1 if m.group(2) != "solid" else None
    if "border-left" in st:
        m = re.match(r"([\d.]+)px (solid|dashed|dotted) (#[0-9a-fA-F]{3,6})", st["border-left"])
        if m: fr["bl"] = {"w": float(m.group(1)), "c": col(m.group(3)), "dash": m.group(2) != "solid"}
    if "border-top" in st and "border" not in st:
        m = re.match(r"([\d.]+)px (solid|dashed|dotted) (#[0-9a-fA-F]{3,6})", st["border-top"])
        if m: fr["bt"] = {"w": float(m.group(1)), "c": col(m.group(3))}
    if "border-color" in st and col(st["border-color"]): fr["bd"] = col(st["border-color"]); fr.setdefault("bw", 1)
    if "border-style" in st and st["border-style"] == "dashed": fr["dash"] = 1
    if "border-radius" in st: fr["r"] = px(st["border-radius"].split()[0])
    if "width" in st and px(st["width"]): fr["w"] = px(st["width"])
    if st.get("width") == "100%": fr["fill"] = 1
    if "height" in st and px(st["height"]): fr["h"] = px(st["height"])
    if "min-height" in st and px(st["min-height"]): fr["mh"] = px(st["min-height"])
    if "max-width" in st and px(st["max-width"]): fr["mw"] = px(st["max-width"])
    if st.get("flex-grow") == "1" or st.get("flex", "").startswith("1 1") or st.get("layoutGrow") == "1": fr["grow"] = 1
    if st.get("align-self") == "flex-start": fr["hug"] = 1
    al = st.get("align-items", "")
    if al: fr["al"] = {"center": "C", "flex-start": "S", "flex-end": "E", "baseline": "B"}.get(al)
    jc = st.get("justify-content", "")
    if jc: fr["jc"] = {"center": "C", "space-between": "SB", "flex-end": "E"}.get(jc)
    if st.get("text-align") == "center": fr["al"] = fr.get("al") or "C"
    if st.get("box-shadow", "").startswith("0 ") and "inset" not in st.get("box-shadow", ""): fr["sh"] = 1
    # class defaults
    if "card" in cls:
        fr.setdefault("bg", "paper"); fr.setdefault("bd", "line"); fr.setdefault("bw", 1); fr.setdefault("r", 10)
    if "inp" in cls:
        fr.update({"d": fr.get("d", "H")}); fr.setdefault("bg", "paper"); fr.setdefault("bd", "line-2"); fr.setdefault("bw", 1)
        fr.setdefault("r", 6); fr.setdefault("p", [0, 12, 0, 12]); fr.setdefault("mh", 44); fr.setdefault("al", "C"); fr["fill"] = 1
        if e.tag == "input": fr["d"] = "H"
    if "btn" in cls:
        kind = "p" if "btn-p" in cls else ("d" if "btn-d" in cls else "s")
        fr.update({"d": "H", "al": "C", "jc": "C", "r": 10})
        fr.setdefault("p", [0, 20, 0, 20]); fr.setdefault("mh", 48); fr.setdefault("g", 8)
        fr.setdefault("bg", "accent" if kind == "p" else "paper")
        if kind != "p": fr.setdefault("bd", "line-2"); fr.setdefault("bw", 1)
        fr["btn"] = kind
    return fr

def table(e):
    rows = []
    for sec in e.kids:
        if isinstance(sec, str): continue
        for tr in ([sec] if sec.tag == "tr" else sec.kids):
            if isinstance(tr, str) or tr.tag != "tr": continue
            cells = []
            for td in tr.kids:
                if isinstance(td, str): continue
                is_h = td.tag == "th"
                cell = {"k": "F", "d": "V", "g": 2, "grow": 1, "c": []}
                for k in td.kids:
                    cell["c"].extend(conv(k, ("meta" if is_h else "body", "ink-2" if is_h else "ink"), "V"))
                cells.append(cell)
            bg = col(parse_style(tr.a.get("style")).get("background", "#ffffff")) or "paper"
            rows.append({"k": "F", "d": "H", "g": 16, "p": [12, 16, 12, 16], "bg": "paper-2" if all(c2.tag == "th" for c2 in tr.kids if not isinstance(c2, str)) else bg, "bt": {"w": 1, "c": "line"}, "fill": 1, "c": cells})
    return {"k": "F", "d": "V", "bg": "paper", "bd": "line", "bw": 1, "r": 10, "fill": 1, "clip": 1, "c": rows}

def convert_board(path):
    t = Tree(); t.feed(open(path, encoding="utf-8").read())
    xdc = find(t.root, "x-dc")
    roots = [k for k in xdc.kids if not isinstance(k, str) and k.tag not in SKIP]
    node = conv(roots[0])[0]
    return node

def slim(n, root=False):
    """Drop default values so each Figma call stays small. kit.js applies the same defaults."""
    if not root and n.get("k") == "F" and n.get("n") in ("div", "span", "a", "li", "ul", "ol", "section", "header", "main", "label", "button", "article", "aside", "nav", "p", "fieldset", "figure", "Frame"):
        n.pop("n", None)
    if n.get("d") == "V": n.pop("d")
    if n.get("k") == "T":
        if n.get("c") == "ink": n.pop("c")
        if n.get("s") == "body": n.pop("s")
    for key in list(n):
        if n[key] in (None, 0) and key not in ("chk",): n.pop(key)
    for k in n.get("c", []) if isinstance(n.get("c"), list) else []:
        slim(k)
    return n

def find(e, tag):
    if not isinstance(e, str):
        if e.tag == tag: return e
        for k in e.kids:
            r = find(k, tag)
            if r: return r
    return None

def load_icon_table(kit_path):
    src = open(kit_path, encoding="utf-8").read()
    for name, body in re.findall(r"^\s*'?([\w-]+)'?: '(.+?)',?$", src.split("// ICONS-START")[1].split("// ICONS-END")[0], re.M):
        ICON_PATHS[body] = name

if __name__ == "__main__":
    canvas = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    load_icon_table(os.path.join(here, "kit.js"))
    cj = json.load(open(os.path.join(canvas, "canvas.json")))
    pages = json.load(open(os.path.join(here, "pages.json")))
    os.makedirs(os.path.join(here, "specs"), exist_ok=True)
    for pg in pages:
        out = []
        for f in pg["boards"]:
            b = cj["boards"][f]
            spec = slim(convert_board(os.path.join(canvas, f)), root=True)
            spec.update({"n": b["title"], "w": b["w"], "h": b["h"], "clip": 1})
            out.append(spec)
        json.dump({"page": pg["name"], "frames": out}, open(os.path.join(here, "specs", pg["id"] + ".json"), "w"), separators=(",", ":"), ensure_ascii=False)
        print(pg["id"], len(out), "frames")
