// assumes you have a map nodeId → { x, y } called `coords`.
export function computeGlobalSequence(
  startId: string,
  destIds: string[],
  coords: Record<string,{x:number,y:number}>
): string[] {
  const permute = (arr: string[]): string[][] => {
    if (!arr.length) return [[]];
    return arr.flatMap((v, i) =>
      permute([...arr.slice(0,i), ...arr.slice(i+1)]).map(t => [v, ...t])
    );
  };
  
  let bestSeq: string[] = [];
  let bestDist = Infinity;

  for (const perm of permute(destIds)) {
    let prev = startId;
    let sum = 0;
    for (const next of perm) {
      const d = Math.hypot(
        coords[prev].x - coords[next].x,
        coords[prev].y - coords[next].y
      );
      sum += d;
      prev = next;
    }
    if (sum < bestDist) {
      bestDist = sum;
      bestSeq = [startId, ...perm];
    }
  }
  return bestSeq;
}

export function computeLocalSequence(
  startId: string,
  destIds: string[],
  coords: Record<string,{x:number,y:number}>
): string[] {
  const remaining = new Set(destIds);
  const seq = [startId];
  let current = startId;

  while (remaining.size) {
    let best: string|undefined;
    let bestDist = Infinity;
    for (const cand of remaining) {
      const d = Math.hypot(
        coords[current].x - coords[cand].x,
        coords[current].y - coords[cand].y
      );
      if (d < bestDist) {
        bestDist = d;
        best = cand;
      }
    }
    if (!best) break;
    remaining.delete(best);
    seq.push(best);
    current = best;
  }

  return seq;
}
