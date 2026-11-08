from pathlib import Path
p=Path('scripts/fastcheck_worker.cjs')
if not p.exists():
    raise SystemExit('Could not find scripts/fastcheck_worker.cjs. Run this from SQA-Research.')
s=p.read_text(encoding='utf-8')
needle="const specs = {\n"
if needle not in s:
    raise SystemExit('Could not find the specs object; no changes made.')
if "src/utils.ts::last" in s or "src/expandPhrases.ts::expandSinglePhrase" in s:
    raise SystemExit('One or both properties already exist; no changes made.')
addition="""const specs = {
  'src/utils.ts::last': {
    name: 'Last element matches final array position', parameters: ['arr'],
    arb: fc.array(fc.string(), {maxLength: 50}),
    check(fn, input) {
      const expected = input.length === 0 ? undefined : input[input.length - 1];
      return {expected, actual: fn(input)};
    }
  },
  'src/expandPhrases.ts::expandSinglePhrase': {
    name: 'Plain phrase expands to normalized phrase', parameters: ['phrase'],
    arb: fc.stringMatching(/^[A-Za-z0-9]+(?: +[A-Za-z0-9]+)*$/),
    check(fn, input) {
      const expected = [input.replace(/ +/g, ' ').trim()];
      return {expected, actual: fn(input)};
    }
  },
"""
backup=p.with_name('fastcheck_worker.before_expansion.cjs')
backup.write_text(s,encoding='utf-8')
p.write_text(s.replace(needle,addition,1),encoding='utf-8')
print('Added 2 properties. Original worker backed up to:', backup)
print('Run: node --check scripts/fastcheck_worker.cjs')
