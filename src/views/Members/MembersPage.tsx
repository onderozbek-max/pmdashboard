import { useState } from 'react'
import { useData } from '../../App'
import { unwrap } from '../../data/loader'
import SectionError from '../../components/ui/SectionError'
import { MetricCardSkeleton } from '../../components/ui/LoadingSkeleton'
import MemberJourney from './MemberJourney'
import ActivationFunnel from './ActivationFunnel'
import RetentionHeatmap from './RetentionHeatmap'
import DepthChart from './DepthChart'
import './MembersPage.css'

type Tab = 'journey' | 'activation' | 'retention' | 'depth'

export default function MembersPage() {
  const { bundle, loading } = useData()
  const [activeTab, setActiveTab] = useState<Tab>('journey')

  const lifecycle  = bundle ? unwrap(bundle.lifecycle) : null
  const activation = bundle ? unwrap(bundle.activation) : null
  const retention  = bundle ? unwrap(bundle.retention) : null
  const depth      = bundle ? unwrap(bundle.depth) : null

  const tabs: { id: Tab; label: string; description: string }[] = [
    { id: 'journey',    label: 'Member Journey',     description: 'Lifecycle funnel' },
    { id: 'activation', label: 'Activation',          description: 'New member funnel' },
    { id: 'retention',  label: 'Retention',           description: 'Cohort heatmap' },
    { id: 'depth',      label: 'Participation Depth', description: 'Activity distribution' },
  ]

  return (
    <div className="members-page">
      <header className="members-header">
        <h1 className="members-header__h1">Members</h1>
        <p className="members-header__sub">
          Understand member lifecycle, activation, depth and retention.
        </p>
      </header>

      {/* Tab navigation */}
      <nav className="members-tabs" aria-label="Members sections" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tab-panel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`members-tab ${activeTab === tab.id ? 'members-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      <div id={`tab-panel-journey`}   role="tabpanel" aria-labelledby="tab-journey"   hidden={activeTab !== 'journey'}>
        {loading ? <MetricCardSkeleton/> :
         lifecycle ? <MemberJourney lifecycle={lifecycle}/> :
         <SectionError section="Member Journey" />}
      </div>

      <div id={`tab-panel-activation`} role="tabpanel" aria-labelledby="tab-activation" hidden={activeTab !== 'activation'}>
        {loading ? <MetricCardSkeleton/> :
         activation ? <ActivationFunnel activation={activation}/> :
         <SectionError section="Activation" />}
      </div>

      <div id={`tab-panel-retention`}  role="tabpanel" aria-labelledby="tab-retention"  hidden={activeTab !== 'retention'}>
        {loading ? <MetricCardSkeleton/> :
         retention ? <RetentionHeatmap retention={retention}/> :
         <SectionError section="Cohort Retention" />}
      </div>

      <div id={`tab-panel-depth`}      role="tabpanel" aria-labelledby="tab-depth"      hidden={activeTab !== 'depth'}>
        {loading ? <MetricCardSkeleton/> :
         depth ? <DepthChart depth={depth}/> :
         <SectionError section="Participation Depth" />}
      </div>
    </div>
  )
}
