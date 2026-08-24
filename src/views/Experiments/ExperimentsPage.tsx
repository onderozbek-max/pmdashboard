import { useState } from 'react'
import { useData } from '../../App'
import { unwrap } from '../../data/loader'
import type { Experiment, ExperimentStatus } from '../../types/data-contract'
import SectionError from '../../components/ui/SectionError'
import ExperimentCard from './ExperimentCard'
import './ExperimentsPage.css'

type Tab = 'live' | 'planned' | 'completed'

export default function ExperimentsPage() {
  const { bundle, loading } = useData()
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const data = bundle ? unwrap(bundle.experiments) : null

  const filterByStatus = (status: ExperimentStatus): Experiment[] =>
    (data?.experiments ?? []).filter(e => e.status === status)

  const live       = filterByStatus('live')
  const planned    = filterByStatus('planned')
  const completed  = filterByStatus('completed')

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'live',      label: 'Live',      count: live.length },
    { id: 'planned',   label: 'Planned',   count: planned.length },
    { id: 'completed', label: 'Completed', count: completed.length },
  ]

  const currentList = activeTab === 'live' ? live : activeTab === 'planned' ? planned : completed

  return (
    <div className="experiments-page">
      <header className="experiments-header">
        <h1 className="experiments-header__h1">Experiments</h1>
        <p className="experiments-header__sub">
          The team's living experiment operating surface and learning history.
        </p>
      </header>

      <nav className="experiments-tabs" aria-label="Experiment status filter" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            id={`exp-tab-${tab.id}`}
            aria-controls={`exp-panel-${tab.id}`}
            className={`experiments-tab ${activeTab === tab.id ? 'experiments-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="experiments-tab__count" aria-label={`${tab.count} experiments`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      {(['live', 'planned', 'completed'] as Tab[]).map(status => (
        <div
          key={status}
          id={`exp-panel-${status}`}
          role="tabpanel"
          aria-labelledby={`exp-tab-${status}`}
          hidden={activeTab !== status}
        >
          {!bundle?.experiments.ok && !loading ? (
            <SectionError section="Experiments"/>
          ) : loading ? (
            <div className="experiments-loading" aria-busy="true" aria-label="Loading experiments">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }}/>
              ))}
            </div>
          ) : currentList.length === 0 ? (
            <div className="experiments-empty" aria-live="polite">
              <p>No {status} experiments.</p>
            </div>
          ) : (
            <div className="experiments-list" role="list">
              {currentList.map(exp => (
                <ExperimentCard key={exp.id} experiment={exp}/>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
