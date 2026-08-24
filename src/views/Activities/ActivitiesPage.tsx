import { useState } from 'react'
import { useData } from '../../App'
import { unwrap } from '../../data/loader'
import SectionError from '../../components/ui/SectionError'
import { MetricCardSkeleton } from '../../components/ui/LoadingSkeleton'
import SupplyView from './SupplyView'
import MixView from './MixView'
import PerformanceView from './PerformanceView'
import './ActivitiesPage.css'

type Tab = 'supply' | 'mix' | 'performance'

export default function ActivitiesPage() {
  const { bundle, loading } = useData()
  const [activeTab, setActiveTab] = useState<Tab>('supply')

  const supply = bundle ? unwrap(bundle.supply) : null
  const mix = bundle ? unwrap(bundle.mix) : null
  const performance = bundle ? unwrap(bundle.performance) : null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'supply',      label: 'Activity Supply' },
    { id: 'mix',         label: 'Activity Mix' },
    { id: 'performance', label: 'Performance by Type' },
  ]

  return (
    <div className="activities-page">
      <header className="activities-header">
        <h1 className="activities-header__h1">Activities</h1>
        <p className="activities-header__sub">
          Are we giving members enough valuable things to do, and how do those opportunities perform?
        </p>
      </header>

      <nav className="activities-tabs" aria-label="Activities sections" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`act-panel-${tab.id}`}
            id={`act-tab-${tab.id}`}
            className={`activities-tab ${activeTab === tab.id ? 'activities-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div id="act-panel-supply" role="tabpanel" aria-labelledby="act-tab-supply" hidden={activeTab !== 'supply'}>
        {loading ? <MetricCardSkeleton/> :
         supply ? <SupplyView supply={supply}/> :
         <SectionError section="Activity Supply"/>}
      </div>

      <div id="act-panel-mix" role="tabpanel" aria-labelledby="act-tab-mix" hidden={activeTab !== 'mix'}>
        {loading ? <MetricCardSkeleton/> :
         mix ? <MixView mix={mix}/> :
         <SectionError section="Activity Mix"/>}
      </div>

      <div id="act-panel-performance" role="tabpanel" aria-labelledby="act-tab-performance" hidden={activeTab !== 'performance'}>
        {loading ? <MetricCardSkeleton/> :
         performance ? <PerformanceView performance={performance}/> :
         <SectionError section="Activity Performance"/>}
      </div>
    </div>
  )
}
