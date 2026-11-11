import React from 'react'
import { Page, Chip, Notice } from './ui'

interface FacilityStock {
  id: string
  name: string
  county: string
  backupPower: boolean
  oNegUnits: number
  oPosUnits: number
  totalUnits: number
  readinessStatus: 'green' | 'amber' | 'red'
}

// Sample figures only. There is no /readiness endpoint yet; this screen is a next step.
const facilities: FacilityStock[] = [
  { id: 'RBTC-NBO', name: 'Nairobi Regional Blood Transfusion Centre', county: 'Nairobi', backupPower: false, oNegUnits: 14, oPosUnits: 82, totalUnits: 310, readinessStatus: 'green' },
  { id: 'HSP-001', name: 'National Referral Hospital (Nairobi)', county: 'Nairobi', backupPower: true, oNegUnits: 8, oPosUnits: 45, totalUnits: 180, readinessStatus: 'green' },
  { id: 'RBTC-KSM', name: 'Kisumu Regional Blood Transfusion Centre', county: 'Kisumu', backupPower: true, oNegUnits: 4, oPosUnits: 38, totalUnits: 115, readinessStatus: 'green' },
  { id: 'HSP-002', name: 'Eastlands County Hospital', county: 'Nairobi', backupPower: true, oNegUnits: 1, oPosUnits: 12, totalUnits: 34, readinessStatus: 'amber' },
  { id: 'HSP-012', name: 'Kisumu County Referral Hospital', county: 'Kisumu', backupPower: false, oNegUnits: 0, oPosUnits: 3, totalUnits: 9, readinessStatus: 'red' },
]

const STATUS: Record<FacilityStock['readinessStatus'], [string, 'green' | 'amber' | 'red']> = {
  green: ['Ready', 'green'],
  amber: ['Low', 'amber'],
  red: ['Critical', 'red'],
}

export const ReadinessGridView: React.FC = () => (
  <Page title="Readiness" wide>
    <Notice tone="warn">Illustrative, next step — sample figures, not live stock.</Notice>
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 font-medium">Site</th>
            <th className="px-3 py-2 font-medium text-right">O−</th>
            <th className="px-3 py-2 font-medium text-right">O+</th>
            <th className="px-3 py-2 font-medium text-right">All</th>
            <th className="px-3 py-2 font-medium">Backup power</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {facilities.map((f) => (
            <tr key={f.id}>
              <td className="px-3 py-2">
                {f.name}
                <span className="block text-xs text-slate-500">{f.county}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{f.oNegUnits}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.oPosUnits}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.totalUnits}</td>
              <td className="px-3 py-2">{f.backupPower ? 'Yes' : 'No'}</td>
              <td className="px-3 py-2">
                <Chip tone={STATUS[f.readinessStatus][1]}>{STATUS[f.readinessStatus][0]}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Page>
)
