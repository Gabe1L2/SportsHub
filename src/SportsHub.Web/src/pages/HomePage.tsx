import { Link } from 'react-router-dom'

export function HomePage() {
  return <section>
    <div className="mb-10 max-w-3xl"><p className="mb-3 text-sm font-bold uppercase tracking-[.24em] text-emerald-400">One home for your game</p><h1 className="text-4xl font-black tracking-tight sm:text-6xl">Sports decisions, organized.</h1><p className="mt-5 text-lg leading-8 text-slate-300">Draft smarter, track every wager, and build a useful history without bouncing between disconnected tools.</p></div>
    <div className="grid gap-5 md:grid-cols-2">
      <Link to="/fantasy" className="group rounded-3xl border border-violet-400/20 bg-violet-500/10 p-8 transition hover:-translate-y-1 hover:border-violet-400/50"><div className="text-sm font-bold uppercase tracking-widest text-violet-300">Fantasy</div><h2 className="mt-4 text-3xl font-bold">Fantasy Draft Helper</h2><p className="mt-3 text-slate-300">A foundation for NBA rankings, projections, ADP, and live draft tracking.</p><div className="mt-8 font-semibold text-violet-300">Enter Fantasy →</div></Link>
      <Link to="/betting" className="group rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-8 transition hover:-translate-y-1 hover:border-emerald-400/50"><div className="text-sm font-bold uppercase tracking-widest text-emerald-300">Betting</div><h2 className="mt-4 text-3xl font-bold">Sports Betting Tracker</h2><p className="mt-3 text-slate-300">A clean base for bets, bankrolls, results, ROI, and performance analytics.</p><div className="mt-8 font-semibold text-emerald-300">Enter Betting →</div></Link>
    </div>
  </section>
}
