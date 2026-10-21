const json = (body,status=200) => Response.json(body,{status});
export class PilotBudget {
  constructor(ctx,env) {
    this.storage=ctx.storage; this.env=env;
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, uid TEXT NOT NULL, started INTEGER NOT NULL, finished INTEGER, cost INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS calls_uid_time ON calls(uid, started)');
  }
  async fetch(request) {
    try {
      const body=await request.json();
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(body.id || '')) return json({error:'invalid_request'},400);
      if (body.action==='finish') { this.sql.exec('UPDATE calls SET finished=? WHERE id=?',Date.now(),body.id); return json({ok:true}); }
      if (body.action!=='reserve' || !/^[a-f0-9]{64}$/.test(body.uid || '')) return json({error:'invalid_request'},400);
      const budget=Number(this.env.PILOT_BUDGET_MICROS),cost=Number(body.cost);
      if(!Number.isSafeInteger(budget)||budget<=0||!Number.isSafeInteger(cost)||cost<0) return json({error:'budget_disabled'},503);
      return this.storage.transactionSync(()=>{
        const now=Date.now(),dayStart=Math.floor(now/86400000)*86400000;
        if(this.sql.exec('SELECT id FROM calls WHERE id=?',body.id).toArray().length) return json({error:'request_reused'},409);
        const rows=this.sql.exec('SELECT started,finished FROM calls WHERE uid=? AND started>=?',body.uid,dayStart-60000).toArray();
        if(rows.filter(x=>x.started>now-60000).length>=6 || rows.filter(x=>x.started>=dayStart).length>=30 || rows.filter(x=>x.finished===null && x.started>now-65000).length>=2) return json({error:'rate_limited'},429);
        // The Free organization quota is shared: conservatively count every legacy,
        // STT and analysis row. Failed requests keep their slot; no schema/reset needed.
        if(this.env.GROQ_FREE_LIMITS==='true') {
          const all=this.sql.exec('SELECT started,finished FROM calls WHERE started>=?',dayStart-60000).toArray();
          if(all.filter(x=>x.started>now-60000).length>=6 || all.filter(x=>x.started>=dayStart).length>=30 || all.some(x=>x.finished===null&&x.started>now-65000)) return json({error:'rate_limited'},429);
        }
        const spent=this.sql.exec('SELECT COALESCE(SUM(cost),0) AS total FROM calls').one().total;
        if(spent+cost>budget) return json({error:'budget_exhausted'},429);
        this.sql.exec('INSERT INTO calls(id,uid,started,cost) VALUES(?,?,?,?)',body.id,body.uid,now,cost);
        return json({ok:true});
      });
    } catch (_) { return json({error:'limiter_unavailable'},503); }
  }
}
