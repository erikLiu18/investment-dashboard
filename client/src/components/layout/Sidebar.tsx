import React from 'react';
import { BarChart3, TrendingUp, Activity, Users, AlertTriangle, DollarSign } from 'lucide-react';
import clsx from 'clsx';

const CATEGORIES = [
  { name: 'Monetary Policy',       icon: BarChart3,     href: '#monetary-policy' },
  { name: 'Inflation',             icon: TrendingUp,    href: '#inflation' },
  { name: 'Growth & Activity',     icon: Activity,      href: '#growth-&-activity' },
  { name: 'Labor Market',          icon: Users,         href: '#labor-market' },
  { name: 'Risk & Sentiment',      icon: AlertTriangle, href: '#risk-&-sentiment' },
  { name: 'Liquidity & Valuation', icon: DollarSign,    href: '#liquidity-&-valuation' },
];

export default function Sidebar(): React.ReactElement {
  return (
    <aside className="w-56 flex-shrink-0 h-screen sticky top-0 bg-[#1e1b4b] flex flex-col">
      <div className="p-5 border-b border-indigo-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-400 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
          <span className="text-white font-semibold text-sm">Macro Dashboard</span>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide px-2 mb-2">Indicators</p>
        {CATEGORIES.map(({ name, icon: Icon, href }) => (
          <a
            key={name}
            href={href}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition mb-0.5',
              'text-indigo-200 hover:bg-indigo-800 hover:text-white'
            )}
          >
            <Icon size={16} />
            <span>{name}</span>
          </a>
        ))}
      </nav>

      <div className="p-4 border-t border-indigo-900 text-xs text-indigo-400">
        Data: FRED API · Refreshes 6am UTC
      </div>
    </aside>
  );
}
