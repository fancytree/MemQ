"""Measure how much a mascot state actually moves, on the device.

    python3 scripts/measure-mascot-motion.py [moods] [frames] [seconds-between]
    python3 scripts/measure-mascot-motion.py idle,surprised 56 0.25

Open the motion lab first and leave it scrolled to the top. The numbers are points,
on whatever size the lab draws, so two runs are comparable and a run against another
screen is not.

The number that matters is not how many pixels change — a blink changes thousands of
them and moves nothing. It is how far the drawing's own bounding box travels, and how
much that box breathes, in points, at the size the state is drawn.

Every reading is taken from a screenshot that also contains the chip row, and the
selected chip is read back before any numbers are kept. Deep links to a route already
on the navigation stack have silently replayed older moods in this session, and a
measurement filed under the wrong state is worse than no measurement at all.
"""
import glob, json, os, subprocess, sys, tempfile, time
from PIL import Image


def booted():
    """The simulator to drive: $MEMQ_SIM, or the one that is already booted."""
    if os.environ.get("MEMQ_SIM"): return os.environ["MEMQ_SIM"]
    out = subprocess.run(["xcrun", "simctl", "list", "devices", "booted", "-j"],
                         check=True, capture_output=True, text=True).stdout
    for devs in json.loads(out)["devices"].values():
        for d in devs:
            if d.get("state") == "Booted": return d["udid"]
    sys.exit("no booted simulator; boot one or set MEMQ_SIM")


UDID = booted()
OUT = os.path.join(tempfile.gettempdir(), "memq-motion")
# Pinned to the motion lab on a 402x874pt phone, scrolled to the top: the stage and
# the chip rows are both read out of one screenshot, by pixel. A different device or a
# scrolled page measures nothing and says so, because no chip reads back as selected.
SCALE = 1206 / 402                 # native pixels per point
STAGE = (90, 960, 1120, 1648)      # the lab's large preview
# Each chip's box in the full screenshot. The selected one is filled; the rest are
# outlined on the page background, so one dark pixel at the centre tells them apart.
CHIPS = {
    'idle': (100, 2260, 185, 2335), 'happy': (280, 2260, 380, 2335),
    'excited': (490, 2260, 605, 2335), 'thinking': (715, 2260, 840, 2335),
    'focused': (955, 2260, 1080, 2335),
    'surprised': (120, 2400, 260, 2478), 'sleepy': (365, 2400, 480, 2478),
}

def shot(path):
    subprocess.run(["xcrun", "simctl", "io", UDID, "screenshot", "--type=png", path],
                   check=True, capture_output=True)

def selected(im):
    """Which chip is filled. Returns None when no chip reads as selected."""
    hit = []
    for name, box in CHIPS.items():
        crop = im.crop(box)
        dark = sum(1 for p in crop.getdata() if sum(p) / 3 < 170)
        if dark > crop.size[0] * crop.size[1] * 0.35: hit.append(name)
    return hit[0] if len(hit) == 1 else None

def ink(im):
    """The character's own bounds: its body colour and its outline, nothing else."""
    px = im.load(); w, h = im.size
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if b > r + 18 and b > 110 and r < 225:
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    return None if x1 < 0 else (x0, y0, x1, y1)

def run(mood, frames, gap):
    d = f"{OUT}/{mood}"; os.makedirs(d, exist_ok=True)
    for f in glob.glob(f"{d}/*.png"): os.remove(f)
    for attempt in range(3):
        subprocess.run(["xcrun", "simctl", "openurl", UDID,
                        f"memq://motion-lab?mood={mood}"], check=True, capture_output=True)
        time.sleep(2.0)
        shot(f"{d}/probe.png")
        if selected(Image.open(f"{d}/probe.png").convert("RGB")) == mood: break
    else:
        return f"{mood:11} NOT MEASURED - the chip never read back as {mood}"
    for i in range(frames):
        shot(f"{d}/{i:03d}.png"); time.sleep(gap)
    boxes, wrong = [], 0
    for f in sorted(glob.glob(f"{d}/[0-9]*.png")):
        im = Image.open(f).convert("RGB")
        if selected(im) != mood: wrong += 1; continue
        b = ink(im.crop(STAGE))
        if b: boxes.append(b)
    if len(boxes) < frames * 0.6:
        return f"{mood:11} NOT MEASURED - {wrong} frames showed another chip"
    cx = [(b[0] + b[2]) / 2 for b in boxes]; cy = [(b[1] + b[3]) / 2 for b in boxes]
    ws = [b[2] - b[0] for b in boxes]; hs = [b[3] - b[1] for b in boxes]
    r = lambda v: (max(v) - min(v)) / SCALE
    return (f"{mood:11} {len(boxes):3} frames  drawn {sum(ws)/len(ws)/SCALE:.0f}x"
            f"{sum(hs)/len(hs)/SCALE:.0f}pt   travel {r(cx):4.1f} x {r(cy):4.1f}pt"
            f"   breath {r(ws):4.1f} x {r(hs):4.1f}pt")

if __name__ == "__main__":
    moods = sys.argv[1].split(",") if len(sys.argv) > 1 else list(CHIPS)
    frames = int(sys.argv[2]) if len(sys.argv) > 2 else 36
    gap = float(sys.argv[3]) if len(sys.argv) > 3 else 0.2
    for m in moods: print(run(m, frames, gap), flush=True)
