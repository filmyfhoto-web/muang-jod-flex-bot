// "10 ก.ย. 2569 · MJ-20260910-0003", and just "10 ก.ย. 2569" when there is no
// job number yet.
//
// Every card used to build this by hand as `${date} · ${number || ''}`.trim(),
// which leaves a dangling "·" on a draft — the record has no number until it
// is saved, so that is exactly the card the shop looks at most.
export function joinMeta(...parts) {
  return parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' · ');
}
