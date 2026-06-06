import React, { useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import CalHeatmap from 'cal-heatmap';
import 'cal-heatmap/cal-heatmap.css';
import type { ContributionCalendar } from '../types';

interface ContributionGraphProps {
  contributions: ContributionCalendar;
}

export const ContributionGraph: React.FC<ContributionGraphProps> = ({ contributions }) => {
  const calRef = useRef<HTMLDivElement | null>(null);
  const calInstance = useRef<any>(null);

  // Start Date (12 months ago)
  const startDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d;
  }, []);

  // Format data for cal-heatmap: array of { date, value }
  const formattedData = useMemo(() => {
    const result: { date: string; value: number }[] = [];
    contributions.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        result.push({
          date: day.date,
          value: day.contributionCount,
        });
      });
    });
    return result;
  }, [contributions]);

  useEffect(() => {
    if (!calRef.current) return;
    // Clean up old instance if exists
    if (calInstance.current) {
      try {
        calInstance.current.destroy();
      } catch (e) {
        console.error(e);
      }
    }

    if (calRef.current) {
      calRef.current.innerHTML = '';
    }

    const cal = new CalHeatmap();
    calInstance.current = cal;

    cal.paint({
      itemSelector: calRef.current,
      domain: {
        type: 'month',
        gutter: 4,
        label: {
          text: 'MMM',
          textAlign: 'start',
          position: 'top',
          offset: { x: 0, y: -4 },
        },
      },
      subDomain: {
        type: 'ghDay',
        radius: 2,
        width: 10,
        height: 10,
        gutter: 3,
      },
      date: {
        start: startDate,
      },
      range: 12,
      data: {
        source: formattedData,
        type: 'json',
        x: 'date',
        y: 'value',
      },
      scale: {
        color: {
          type: 'threshold',
          range: ['#2b2b2b', '#0e4429', '#006d32', '#26a641', '#39d353'],
          domain: [1, 3, 6, 9],
        },
      },
    });

    return () => {
      if (calInstance.current) {
        try {
          calInstance.current.destroy();
          calInstance.current = null;
        } catch (e) {
          console.error(e);
        }
      }
    };
  }, [formattedData, startDate]);

  return (
    <div className="glass-panel" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Activity Heat Map</h3>
          <p className="subtitle" style={{ margin: 0 }}>Real GitHub contribution heatmap of your profile.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
          <div className="stat-badge" style={{ color: 'var(--accent-green)', background: 'rgba(16, 185, 129, 0.1)' }}>
            {contributions.totalContributions.toLocaleString()} contributions in the last year
          </div>
        </div>
      </div>

      {/* Target Container for CalHeatmap */}
      <div className="graph-container">
        <div ref={calRef} id="cal-heatmap" style={{ minWidth: 'max-content' }} />
      </div>
      
      <style>{`
        /* CalHeatmap overrides for custom theme matching */
        #cal-heatmap text {
          fill: var(--text-secondary);
          font-family: inherit;
          font-size: 9px;
        }
        #cal-heatmap .ch-subdomain-bg {
          fill: #2b2b2b;
        }
      `}</style>
    </div>
  );
};
