export function conditionalExpectancy(averageWin:number|null,wins:number,averageLoss:number|null,losses:number){
  const observations=wins+losses;
  if(!observations)return 0;
  return ((averageWin??0)*wins+(averageLoss??0)*losses)/observations;
}

export function correlationDecayMinutes(points:Array<{minutes:number;correlation:number|null}>){
  const usable=points.filter((point):point is {minutes:number;correlation:number}=>Number.isFinite(point.minutes)&&point.minutes>0&&point.correlation!=null&&Number.isFinite(point.correlation)).sort((a,b)=>a.minutes-b.minutes);
  if(!usable.length)return null;
  const first=usable[0],magnitude=Math.abs(first.correlation);
  if(magnitude<1e-9)return first.minutes;
  const direction=Math.sign(first.correlation),threshold=magnitude/2;
  let previous={minutes:first.minutes,aligned:magnitude};
  for(const point of usable.slice(1)){
    const aligned=point.correlation*direction;
    if(aligned<=threshold){
      const span=previous.aligned-aligned;
      const fraction=span>0?(previous.aligned-threshold)/span:0;
      return Math.round(previous.minutes+fraction*(point.minutes-previous.minutes));
    }
    previous={minutes:point.minutes,aligned};
  }
  return null;
}
