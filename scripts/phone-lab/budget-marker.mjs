export function assertLocalMarker(expected,actual,{initialize=false}={}) {
  if((initialize&&actual)||(!initialize&&actual!==expected))throw Error('pilot_budget_locked');
}
