"""Validate section schemas against the rules Shopify enforces at push time.

theme check does not catch these; a failure rejects the section file, which then
cascades into "section type does not refer to an existing section file" for every
JSON template that references it.
"""
import re, io, json, glob, sys

problems = []

def check_settings(settings, where, f):
    for st in settings:
        sid, t = st.get('id'), st.get('type')
        if t == 'range':
            lo, hi, step, dflt = st['min'], st['max'], st['step'], st.get('default')
            if lo >= hi:
                problems.append(f"{f}: range '{sid}' ({where}) min >= max")
            count = (hi - lo) / step
            if count != int(count):
                problems.append(f"{f}: range '{sid}' ({where}) (max-min) not divisible by step")
            if count > 101:
                problems.append(f"{f}: range '{sid}' ({where}) {count:.0f} steps > 101")
            if dflt is not None:
                if dflt < lo or dflt > hi:
                    problems.append(f"{f}: range '{sid}' ({where}) default {dflt} out of range")
                elif (dflt - lo) % step != 0:
                    problems.append(f"{f}: range '{sid}' ({where}) default {dflt} is not a step "
                                    f"(min {lo}, step {step}) -> nearest {lo + round((dflt-lo)/step)*step}")
        elif t == 'select':
            values = [o['value'] for o in st.get('options', [])]
            if not values:
                problems.append(f"{f}: select '{sid}' ({where}) has no options")
            d = st.get('default')
            if d is not None and d not in values:
                problems.append(f"{f}: select '{sid}' ({where}) default '{d}' not among options {values}")
        elif t == 'checkbox':
            d = st.get('default')
            if d is not None and not isinstance(d, bool):
                problems.append(f"{f}: checkbox '{sid}' ({where}) default must be true/false")

for f in sorted(glob.glob('sections/custom-*.liquid')):
    s = io.open(f, encoding='utf-8').read()
    m = re.search(r'\{%\s*schema\s*%\}(.*?)\{%\s*endschema\s*%\}', s, re.S)
    if not m:
        continue
    try:
        d = json.loads(m.group(1))
    except Exception as e:
        problems.append(f"{f}: schema is not valid JSON -> {e}")
        continue

    check_settings(d.get('settings', []), 'section', f)

    block_types = set()
    for b in d.get('blocks', []):
        bt = b.get('type')
        if bt in block_types:
            problems.append(f"{f}: duplicate block type '{bt}'")
        block_types.add(bt)
        check_settings(b.get('settings', []), f"block '{bt}'", f)

    for preset in d.get('presets', []):
        blocks = preset.get('blocks', [])
        entries = blocks if isinstance(blocks, list) else blocks.values()
        for pb in entries:
            if pb.get('type') not in block_types:
                problems.append(f"{f}: preset uses block type '{pb.get('type')}' not declared in blocks")

    if 'enabled_on' in d and 'disabled_on' in d:
        problems.append(f"{f}: has both enabled_on and disabled_on")

print('\n'.join(problems) if problems else 'All custom section schemas valid.')
sys.exit(1 if problems else 0)
