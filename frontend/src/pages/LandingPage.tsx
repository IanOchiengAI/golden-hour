import React from 'react'
import { Link } from '../lib/router'
import { Logo } from '../layout/AppShell'
import { useAuth } from '../context/AuthContext'

const STEPS = [
  { n: '1', title: 'Request', text: 'A clinician asks for blood in under a minute: urgency, group, component, units.' },
  { n: '2', title: 'Match', text: 'Fixed ABO/RhD rules find safe units across all 47 facilities and hold the best site.' },
  { n: '3', title: 'Decide', text: 'The blood bank officer sees ranked sites with arrival-time ranges and accepts, changes or rejects.' },
  { n: '4', title: 'Release & track', text: 'MoH authorises, the supplying lab releases, and everyone sees the status until it arrives.' },
]

const ROLES = [
  { title: 'Clinicians', text: 'Raise a request and confirm arrival with the cool-box temperature.' },
  { title: 'Blood bank officers', text: 'One queue, one decision screen, an escalation timer.' },
  { title: 'Ministry of Health', text: 'Approve per transfer or oversee standing authorisation.' },
  { title: 'Supplying labs', text: 'Release or decline orders. Patient details are never shown.' },
]

const SAFETY = [
  'Compatibility is decided by fixed rules, never by AI.',
  'Every move of blood needs a human Accept, and a lab officer confirms release.',
  'Arrival times are shown as ranges, and the system keeps working when the model is offline.',
  'Expired, quarantined, untested and temperature-exposed units are never offered.',
  'Every action is recorded: who, what, when and why.',
]

export const LandingPage: React.FC = () => {
  const { user } = useAuth()
  const entry = user ? { to: '/app/overview', label: 'Open dashboard' } : { to: '/login', label: 'Sign in' }
  return (
  <div className="min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
        <Logo />
        <span className="font-semibold">Golden Hour</span>
        <nav className="ml-auto flex items-center gap-2 text-sm">
          <a href="#how" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">How it works</a>
          <a href="#safety" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">Safety</a>
          <Link to={entry.to} className="h-9 px-4 rounded-md bg-blue-700 text-white font-medium flex items-center hover:bg-blue-800">
            {entry.label}
          </Link>
        </nav>
      </div>
    </header>

    <section className="bg-slate-50 border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-sm font-medium text-blue-700">Emergency blood request and dispatch</p>
          <h1 className="mt-3 text-4xl lg:text-5xl font-semibold tracking-tight">
            Compatible blood, on its way in minutes.
          </h1>
          <p className="mt-4 text-lg text-slate-600 max-w-xl">
            One request reaches every facility in the network. Safe units are matched, ranked by honest arrival
            time and held while a blood bank officer decides.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={entry.to} className="h-11 px-5 rounded-md bg-blue-700 text-white font-medium flex items-center hover:bg-blue-800">
              {entry.label}
            </Link>
            <Link to="/login?test=1" className="h-11 px-5 rounded-md border border-slate-300 bg-white font-medium flex items-center hover:bg-slate-50">
              Try a test account
            </Link>
          </div>
        </div>

        {/* Product preview: what the blood bank officer sees */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" aria-label="Example decision card">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold">O+</span>
            <span>2 × red cells</span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Life-threatening</span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">4:32 left</span>
          </div>
          <div className="mt-4 border border-slate-200 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="font-semibold">Regional blood centre</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">Held</span>
            </div>
            <div className="mt-3 flex gap-8">
              <div>
                <div className="text-xs text-slate-500">Arrives in</div>
                <div className="text-2xl font-semibold tabular-nums">35–70 min</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Units</div>
                <div className="text-2xl font-semibold">2</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <span className="h-10 px-6 rounded-md bg-blue-700 text-white text-sm font-medium flex items-center">Accept</span>
              <span className="h-10 px-4 rounded-md border border-slate-300 text-sm font-medium flex items-center">Change</span>
              <span className="h-10 px-4 rounded-md border border-slate-300 text-sm font-medium flex items-center">Reject</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Illustration with sample values.</p>
        </div>
      </div>
    </section>

    <section id="how" className="max-w-6xl mx-auto px-4 py-16">
      <h2 className="text-2xl font-semibold">How it works</h2>
      <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-800 font-semibold flex items-center justify-center">{s.n}</span>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className="bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-semibold">One workspace for each role</h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROLES.map((r) => (
            <div key={r.title} className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section id="safety" className="max-w-6xl mx-auto px-4 py-16">
      <h2 className="text-2xl font-semibold">Safe by design</h2>
      <ul className="mt-6 grid md:grid-cols-2 gap-x-10 gap-y-3">
        {SAFETY.map((s) => (
          <li key={s} className="flex gap-3 text-slate-700">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-700 shrink-0" aria-hidden />
            {s}
          </li>
        ))}
      </ul>
    </section>

    <footer className="border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row gap-2 justify-between text-sm text-slate-500">
        <span>
          Need an account? Accounts are issued by your national blood service. Ask your blood service administrator.
        </span>
        <span>Synthetic data only · Terumo BCT Africa Hackathon 2026</span>
      </div>
    </footer>
  </div>
  )
}
