import { NavLink, useRouter } from '../../lib/router'
import type { Route } from '../../lib/router'
import './Nav.css'

interface Props {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

const NAV_ITEMS: { to: Route; label: string; icon: React.ReactNode }[] = [
  {
    to: '/overview',
    label: 'Overview',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="7" height="7" rx="1.5"/>
        <rect x="11" y="2" width="7" height="7" rx="1.5"/>
        <rect x="2" y="11" width="7" height="7" rx="1.5"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    to: '/members',
    label: 'Members',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="6" r="3"/>
        <path d="M2 17c0-3.314 2.686-6 6-6"/>
        <circle cx="15" cy="9" r="2.5"/>
        <path d="M12 17c0-2.485 1.343-4.5 3-4.5s3 2.015 3 4.5"/>
      </svg>
    ),
  },
  {
    to: '/activities',
    label: 'Activities',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3v14M3 10h14"/>
        <circle cx="10" cy="10" r="7"/>
      </svg>
    ),
  },
  {
    to: '/experiments',
    label: 'Experiments',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 3v7l-4 7h14l-4-7V3"/>
        <path d="M7 3h6"/>
      </svg>
    ),
  },
]

export default function Nav({ theme, onToggleTheme }: Props) {
  const { currentPath } = useRouter()

  return (
    <nav className="main-nav" aria-label="Primary navigation">
      <div className="nav-brand" aria-hidden="true">
        <div className="nav-brand__mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="var(--color-brand-primary)"/>
            <path d="M6 17l3-8 3 5 3-5 3 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="nav-brand__text">
          <span className="nav-brand__name">Member's Mark</span>
          <span className="nav-brand__sub">Community</span>
        </div>
      </div>

      <ul className="nav-list" role="list">
        {NAV_ITEMS.map(item => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
              aria-current={currentPath === item.to ? 'page' : undefined}
            >
              <span className="nav-item__icon">{item.icon}</span>
              <span className="nav-item__label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="nav-footer">
        <button
          className="nav-theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="10" cy="10" r="4"/>
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M17.5 10.5A7.5 7.5 0 119 3a5.5 5.5 0 008.5 7.5z"/>
            </svg>
          )}
          <span className="nav-item__label">
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </span>
        </button>
      </div>
    </nav>
  )
}
