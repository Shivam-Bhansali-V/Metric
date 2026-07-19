import { useState, useMemo } from 'react';
import type { AppState } from '../types';
import { Bar } from 'react-chartjs-2';
import { formatSeconds } from '../utils';

export default function Reports({ state }: { state: AppState }) {
  const [dateRange, setDateRange] = useState<'thisWeek' | 'thisMonth' | 'custom'>('thisWeek');
  
  const entries = useMemo(() => {
    let start = new Date();
    start.setHours(0,0,0,0);
    const end = new Date();
    end.setHours(23,59,59,999);

    if (dateRange === 'thisWeek') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); 
      start.setDate(diff);
    } else if (dateRange === 'thisMonth') {
      start.setDate(1);
    }
    
    return state.timeEntries.filter(e => {
      const eStart = new Date(e.start);
      return eStart >= start && (e.end ? new Date(e.end) <= end : true);
    });
  }, [state.timeEntries, dateRange]);

  const { projectHours, totalBillable, totalNonBillable } = useMemo(() => {
    const projMap: Record<string, number> = {};
    let billable = 0;
    let nonBillable = 0;

    entries.forEach(e => {
      if (!e.end) return;
      const secs = Math.max(0, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000);
      const h = secs / 3600;
      
      const pId = e.projectId || 'unassigned';
      projMap[pId] = (projMap[pId] || 0) + h;
      
      if (e.billable) billable += h;
      else nonBillable += h;
    });

    return { projectHours: projMap, totalBillable: billable, totalNonBillable: nonBillable };
  }, [entries]);

  const chartData = {
    labels: Object.keys(projectHours).map(id => id === 'unassigned' ? 'Unassigned' : state.projects.find(p => p.id === id)?.name || 'Unknown'),
    datasets: [{
      label: 'Hours',
      data: Object.values(projectHours),
      backgroundColor: '#6366f1',
    }]
  };

  const exportCsv = () => {
    const rows = [
      ['Project', 'Description', 'Duration (hours)', 'Billable']
    ];
    entries.forEach(e => {
      if(!e.end) return;
      const pName = e.projectId ? state.projects.find(p => p.id === e.projectId)?.name : 'None';
      const dur = ((new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000).toFixed(2);
      rows.push([pName || 'None', `"${e.description}"`, dur, e.billable ? 'Yes' : 'No']);
    });
    
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report.csv';
    a.click();
  };

  const earnings = totalBillable * state.workspace.hourlyRate;

  return (
    <div className="container">
      <h2>Reports & Analytics</h2>
      
      <div className="mb-4">
        <select className="form-select w-auto" value={dateRange} onChange={e => setDateRange(e.target.value as any)}>
          <option value="thisWeek">This Week</option>
          <option value="thisMonth">This Month</option>
          <option value="custom">All Time (Custom)</option>
        </select>
      </div>

      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card p-3 shadow-sm text-center">
            <h5>Total Hours</h5>
            <h3 className="text-primary">{(totalBillable + totalNonBillable).toFixed(2)}h</h3>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3 shadow-sm text-center">
            <h5>Billable Hours</h5>
            <h3 className="text-success">{totalBillable.toFixed(2)}h</h3>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3 shadow-sm text-center">
            <h5>Total Earnings</h5>
            <h3 className="text-success">{state.workspace.currency} {earnings.toFixed(2)}</h3>
          </div>
        </div>
      </div>

      <div className="card p-3 shadow-sm mb-4">
        <div style={{ height: '300px' }}>
          <Bar data={chartData} options={{ maintainAspectRatio: false }} />
        </div>
      </div>

      <button className="btn btn-secondary" onClick={exportCsv}>Export to CSV</button>
    </div>
  );
}
